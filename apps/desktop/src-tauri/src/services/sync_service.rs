use tauri::{State, AppHandle, Emitter};
use crate::AppState;
use transfer::stream::StreamMessage;
use serde_json;
use tokio::io::AsyncWriteExt;

#[tauri::command]
pub async fn send_bind_request(
    _app: AppHandle,
    target_code: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let network_manager = state.network_manager.clone();

    // 1. Resolve Code -> NodeId
    tracing::info!("Looking up node for code: {}", target_code);
    
    let registry = state.peer_registry.read().await;
    let mut target_node_id = None;
    for (beacon, _seen_at) in registry.values() {
        if beacon.pairing_code.to_uppercase() == target_code.to_uppercase() {
            target_node_id = Some(beacon.node_id.clone());
            break;
        }
    }
    drop(registry);

    let node_id_str = match target_node_id {
        Some(id) => {
            tracing::info!("Resolved {} -> NodeId {} via local discovery", target_code, id);
            id
        }
        None => {
            tracing::info!("Local discovery failed for code {}. Attempting Global DHT lookup...", target_code);
            match network_manager.resolve_code_mapping(&target_code).await {
                Ok(id) => id.to_string(),
                Err(_e) => {
                    return Err("Could not find device on network: Code not found on global DHT".to_string());
                }
            }
        }
    };

    // 1.5 Check if already bonded
    {
        let manager = state.sync_manager.read().await;
        if manager.bonded_devices.iter().any(|d| d.node_id == node_id_str) {
            return Err("Device already paired".into());
        }
    }

    // 2. Connect
    tracing::info!("Connecting to node: {}", node_id_str);
    let connection = match network_manager.connect(&node_id_str).await {
        Ok(c) => c,
        Err(e) => {
            return Err(format!("Failed to connect to node: {}", e));
        }
    };

    // 3. Open bi-directional stream
    let (mut send, mut recv) = match connection.open_bi().await {
        Ok(streams) => streams,
        Err(e) => {
            return Err(format!("Failed to open stream: {}", e));
        }
    };

    let device_name = std::env::var("COMPUTERNAME")
        .unwrap_or_else(|_| std::env::var("HOSTNAME").unwrap_or_else(|_| "This PC".into()));
    let os = std::env::consts::OS.to_string();
    let node_id = network_manager.node_id().to_string();

    // 4. Send Request
    let msg = StreamMessage::FolderSyncBindRequest {
        node_id,
        device_name,
        os,
    };
    let msg_json = serde_json::to_string(&msg).map_err(|e| e.to_string())?;
    let msg_bytes = msg_json.as_bytes();
    if let Err(e) = send.write_all(&(msg_bytes.len() as u32).to_be_bytes()).await {
        return Err(format!("Failed to write length: {}", e));
    }
    if let Err(e) = send.write_all(msg_bytes).await {
        return Err(format!("Failed to write request: {}", e));
    }
    let _ = send.flush().await;
    
    // 5. Wait for Response
    let response_bytes_res = tokio::time::timeout(tokio::time::Duration::from_secs(120), async {
        let mut len_buf = [0u8; 4];
        recv.read_exact(&mut len_buf).await?;
        let len = u32::from_be_bytes(len_buf) as usize;
        if len > transfer::stream::TransferStream::MAX_CONTROL_MESSAGE_SIZE {
            return Err(anyhow::anyhow!("Response too large"));
        }
        let mut buf = vec![0u8; len];
        recv.read_exact(&mut buf).await?;
        Ok::<Vec<u8>, anyhow::Error>(buf)
    }).await;
    
    let response_bytes = match response_bytes_res {
        Ok(Ok(bytes)) => bytes,
        Ok(Err(e)) => return Err(format!("Failed to read response: {}", e)),
        Err(_) => return Err("Request timed out after 120 seconds".into()),
    };

    let response: StreamMessage = serde_json::from_slice(&response_bytes).map_err(|e| e.to_string())?;
    match response {
        StreamMessage::FolderSyncBindResponse { accepted } => {
            if !accepted {
                return Ok(false);
            }
            
            // 6. Receiver accepted, now Sender must accept terms
            let prompt_id = format!("{}_finalize", node_id_str);
            let (tx, rx) = tokio::sync::oneshot::channel();
            {
                let mut prompts = state.transfer_prompts.lock().await;
                prompts.insert(prompt_id.clone(), tx);
            }
            
            let target_name = {
                let registry = state.peer_registry.read().await;
                registry.values().find(|(b, _)| b.node_id == node_id_str).map(|(b, _)| b.hostname.clone()).unwrap_or_else(|| "Unknown".into())
            };
            let target_os = {
                let registry = state.peer_registry.read().await;
                registry.values().find(|(b, _)| b.node_id == node_id_str).map(|(b, _)| b.os.clone()).unwrap_or_else(|| "Unknown".into())
            };
            
            let payload = serde_json::json!({
                "remote_endpoint_id": node_id_str,
                "device_name": target_name,
                "os": target_os,
            });
            let _ = _app.emit("folder-sync-bind-finalize-prompt", payload);
            
            let user_accepted = match rx.await {
                Ok((accept, _)) => accept,
                Err(_) => false,
            };
            
            // 7. Send Finalize
            let finalize_msg = StreamMessage::FolderSyncBindFinalize { accepted: user_accepted };
            let finalize_json = serde_json::to_string(&finalize_msg).map_err(|e| e.to_string())?;
            let finalize_bytes = finalize_json.as_bytes();
            if let Err(e) = send.write_all(&(finalize_bytes.len() as u32).to_be_bytes()).await {
                return Err(format!("Failed to write finalize length: {}", e));
            }
            if let Err(e) = send.write_all(finalize_bytes).await {
                return Err(format!("Failed to write finalize request: {}", e));
            }
            let _ = send.flush().await;
            let _ = send.finish();
            
            if user_accepted {
                let mut manager = state.sync_manager.write().await;
                manager.add_bonded_device(node_id_str.clone(), target_name, target_os);
                let _ = _app.emit("folder-sync-bind-success", ());
            }
            
            // Wait for receiver to acknowledge they successfully processed the Finalize message
            let _ = tokio::time::timeout(tokio::time::Duration::from_secs(10), async {
                let mut len_buf = [0u8; 4];
                if recv.read_exact(&mut len_buf).await.is_ok() {
                    let len = u32::from_be_bytes(len_buf) as usize;
                    let mut buf = vec![0u8; len];
                    let _ = recv.read_exact(&mut buf).await;
                }
            }).await;
            
            Ok(user_accepted)
        },
        _ => Err("Unexpected response message".into()),
    }
}

#[tauri::command]
pub async fn respond_to_bind_request(
    id: String,
    _device_name: String,
    _os: String,
    accept: bool,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let mut prompts = state.transfer_prompts.lock().await;
    if let Some(tx) = prompts.remove(&id) {
        let _ = tx.send((accept, None));
    }
    
    // Do NOT add to bonded device yet, wait for finalize event.
    
    Ok(())
}

#[tauri::command]
pub async fn finalize_bind_request(
    id: String,
    accept: bool,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let prompt_id = format!("{}_finalize", id);
    let mut prompts = state.transfer_prompts.lock().await;
    if let Some(tx) = prompts.remove(&prompt_id) {
        let _ = tx.send((accept, None));
    }
    Ok(())
}

#[tauri::command]
pub async fn get_bonded_devices(state: tauri::State<'_, AppState>) -> Result<Vec<sync::manager::BondedDevice>, String> {
    let manager = state.sync_manager.read().await;
    Ok(manager.bonded_devices.clone())
}

#[tauri::command]
pub async fn remove_bonded_device(id: String, state: tauri::State<'_, AppState>, app: tauri::AppHandle) -> Result<(), String> {
    // 1. Tell remote to unbind if it's online
    let network_manager = state.network_manager.clone();
    
    // We run this as a fast background task so it doesn't block the UI unbind
    let node_id_clone = id.clone();
    let my_node_id = network_manager.node_id().to_string();
    tokio::spawn(async move {
        tracing::info!("Attempting to send Unbind to {}", node_id_clone);
        if let Ok(connection) = tokio::time::timeout(std::time::Duration::from_secs(10), network_manager.connect(&node_id_clone)).await {
            if let Ok(connection) = connection {
                tracing::info!("Connected to {}, opening bi-stream", node_id_clone);
                if let Ok((mut send, mut recv)) = connection.open_bi().await {
                    tracing::info!("Opened bi-stream, sending Unbind request");
                    let unbind_req = transfer::stream::StreamMessage::FolderSyncUnbind { node_id: my_node_id };
                    if let Ok(bytes) = serde_json::to_vec(&unbind_req) {
                        let _ = send.write_u32(bytes.len() as u32).await;
                        let _ = send.write_all(&bytes).await;
                        let _ = send.flush().await;
                        tracing::info!("Unbind sent successfully to {}", node_id_clone);
                    }
                    let _ = send.finish();
                    
                    // Crucial: Wait for the receiver to acknowledge/close the stream
                    // If we don't wait, dropping the connection immediately will abort the stream
                    // before the packets even leave the local network stack!
                    let mut buf = [0u8; 1];
                    let _ = recv.read(&mut buf).await;
                    tracing::info!("Receiver closed stream, unbind complete");
                } else {
                    tracing::error!("Failed to open bi-stream to {}", node_id_clone);
                }
            } else {
                tracing::error!("Failed to connect to {}", node_id_clone);
            }
        } else {
            tracing::error!("Timeout connecting to {}", node_id_clone);
        }
    });

    // 2. Remove locally
    let mut manager = state.sync_manager.write().await;
    manager.remove_bonded_device(&id);
    
    // 3. Emit update event to UI
    let _ = app.emit("bonded-devices-updated", ());
    
    Ok(())
}

#[tauri::command]
pub async fn get_action_history(state: State<'_, AppState>) -> Result<Vec<sync::manifest::SyncTransactionRecord>, String> {
    let db = state.manifest_db.clone();
    tokio::task::spawn_blocking(move || {
        db.get_transactions(100)
    }).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())
}



#[tauri::command]
pub async fn get_sync_queue(state: State<'_, AppState>) -> Result<Vec<sync::manifest::QueueViewRecord>, String> {
    let db = state.manifest_db.clone();
    
    // Perform SQLite fetch in blocking pool
    let records = tokio::task::spawn_blocking(move || {
        db.get_queue_view(100)
    }).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?;
    
    Ok(records)
}

#[derive(serde::Serialize, Debug)]
pub struct BridgeTestResult {
    pub is_online: bool,
    pub latency_ms: u64,
    pub route_type: String,
    pub folders_healthy: usize,
    pub folders_total: usize,
    pub status_message: String,
    pub logs: Vec<String>,
}

#[tauri::command]
pub async fn test_sync_bridge(
    target_node_id: String,
    state: State<'_, AppState>,
) -> Result<BridgeTestResult, String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    let mut logs = Vec::new();
    let network_manager = state.network_manager.clone();
    let my_node_id = network_manager.node_id().to_string();
    let sync_manager = state.sync_manager.read().await;
    
    logs.push(format!("[Sender] Initiating bidirectional test bridge to peer {}...", target_node_id));
    logs.push("[Sender] Checking local bonded folder configurations...".into());

    let (folders_total, folders_healthy) = if let Some(device) = sync_manager.bonded_devices.iter().find(|d| d.node_id == target_node_id) {
        let healthy = device.sync_folders.iter().filter(|f| f.status == "active" && std::path::Path::new(&f.path).exists()).count();
        logs.push(format!("[Sender] Found {} bonded sync folder(s), {} healthy locally", device.sync_folders.len(), healthy));
        (device.sync_folders.len(), healthy)
    } else {
        logs.push("[Sender] Warning: Device node ID not found in local bonded list".into());
        (0, 0)
    };
    drop(sync_manager);

    logs.push("[Sender] Dialing target peer over ALPN send2me-sync/1...".into());
    let start = std::time::Instant::now();
    
    match tokio::time::timeout(std::time::Duration::from_secs(5), network_manager.connect_sync(&target_node_id)).await {
        Ok(Ok(connection)) => {
            let latency_ms = start.elapsed().as_millis() as u64;
            logs.push(format!("[Sender] Connected in {} ms", latency_ms));
            logs.push("[Sender] Opening bi-directional control stream for peer diagnostic...".into());
            
            let req_msg = StreamMessage::FolderSyncTestBridgeRequest { sender_node_id: my_node_id };
            
            let diag_res = tokio::time::timeout(std::time::Duration::from_secs(4), async {
                let (mut send, mut recv) = connection.open_bi().await?;
                let bytes = serde_json::to_vec(&req_msg)?;
                send.write_u32(bytes.len() as u32).await?;
                send.write_all(&bytes).await?;
                send.flush().await?;
                
                let resp_len = recv.read_u32().await?;
                let mut resp_buf = vec![0u8; resp_len as usize];
                recv.read_exact(&mut resp_buf).await?;
                let resp: StreamMessage = serde_json::from_slice(&resp_buf)?;
                Ok::<StreamMessage, anyhow::Error>(resp)
            }).await;

            let route_type = if latency_ms < 35 {
                "Direct P2P (UDP / Local)".to_string()
            } else {
                "Relayed P2P Tunnel".to_string()
            };

            match diag_res {
                Ok(Ok(StreamMessage::FolderSyncTestBridgeResponse(remote_resp))) => {
                    logs.push(format!("[Sender] Received diagnostic response from remote peer '{}' ({})", remote_resp.remote_device_name, remote_resp.remote_os));
                    logs.extend(remote_resp.remote_logs);
                    logs.push("[Sender] Both sides verified live! Bridge is fully active & operational.".into());

                    Ok(BridgeTestResult {
                        is_online: true,
                        latency_ms: std::cmp::max(latency_ms, 1),
                        route_type,
                        folders_healthy,
                        folders_total,
                        status_message: "Live Bridge Active & Verified (Both Sides Passed)".into(),
                        logs,
                    })
                }
                _ => {
                    logs.push("[Sender] Remote peer connected, but basic handshake returned".into());
                    Ok(BridgeTestResult {
                        is_online: true,
                        latency_ms: std::cmp::max(latency_ms, 1),
                        route_type,
                        folders_healthy,
                        folders_total,
                        status_message: "Connected (Direct ALPN)".into(),
                        logs,
                    })
                }
            }
        }
        _ => {
            logs.push("[Sender] Connection timeout: Unable to reach target node ID over network".into());
            Ok(BridgeTestResult {
                is_online: false,
                latency_ms: 0,
                route_type: "Offline / Disconnected".to_string(),
                folders_healthy,
                folders_total,
                status_message: "Target peer unavailable or unreachable over network".to_string(),
                logs,
            })
        }
    }
}

