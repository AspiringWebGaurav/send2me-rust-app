use tauri::{State, AppHandle, Emitter};
use crate::AppState;
use transfer::transfer_manager::{Transfer, TargetDevice, TransferStatus};
use std::path::Path;
use tokio::sync::mpsc;

#[tauri::command]
pub async fn start_transfer(
    app: AppHandle,
    target_code: String,
    files: Vec<String>,
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let peer_registry = state.peer_registry.clone();
    let network_manager = state.network_manager.clone();
    let transfer_manager = state.transfer_manager.clone();
    let history_manager = state.history_manager.clone();

    let registry = peer_registry.read().await;

    let mut target_node_id = None;
    for (beacon, _seen_at) in registry.values() {
        if beacon.pairing_code.to_uppercase() == target_code.to_uppercase() {
            target_node_id = Some(beacon.node_id.clone());
            break;
        }
    }
    drop(registry);

    // If local UDP discovery failed, fallback to Global DHT (Internet mode)
    let node_id_str = match target_node_id {
        Some(id) => id,
        None => {
            tracing::info!("Local discovery failed for code {}. Attempting Global DHT lookup...", target_code);
            match network_manager.resolve_code_mapping(&target_code).await {
                Ok(id) => id.to_string(),
                Err(e) => {
                    let err_msg = format!("Could not find device on local network or internet: {}", e);
                    tracing::error!("{}", err_msg);
                    return Err(err_msg);
                }
            }
        }
    };

    let connection = match network_manager.connect(&node_id_str).await {
        Ok(c) => c,
        Err(e) => {
            let err_msg = format!("Failed to connect to node: {}", e);
            tracing::error!("{}", err_msg);
            return Err(err_msg);
        }
    };

    // Look up beacon hostname/OS ONCE synchronously so we can (a) return proper
    // target_device.name to the frontend right away, and (b) persist the trusted
    // device with real metadata instead of "Remote Device".
    let (peer_name, peer_os, peer_device_type) = {
        let reg = peer_registry.read().await;
        let beacon = reg.values().find(|(b, _)| b.node_id == node_id_str).map(|(b, _)| b.clone());
        drop(reg);
        if let Some(b) = beacon {
            (b.hostname.clone(), b.os.clone(), b.device_type.clone())
        } else {
            (format!("Device {}", target_code.to_uppercase()), "unknown".into(), "desktop".into())
        }
    };

    // Generate transfer IDs up front so we can return them to the frontend for
    // per-transfer event filtering in the SendModal.
    let transfer_ids: Vec<String> = (0..files.len()).map(|_| format!("tx-{}", uuid::Uuid::new_v4())).collect();
    let transfer_ids_out = transfer_ids.clone();

    let peer_name_spawn = peer_name.clone();
    let peer_os_spawn = peer_os.clone();
    let peer_device_type_spawn = peer_device_type.clone();

    tauri::async_runtime::spawn(async move {
        // Save to trusted devices — use beacon hostname/OS if available.
        {
            let _ = crate::services::device_service::add_trusted_device(crate::services::device_service::Device {
                id: node_id_str.clone(),
                name: peer_name_spawn.clone(),
                os: peer_os_spawn.clone(),
                device_type: peer_device_type_spawn.clone(),
                status: "offline".into(),
                last_seen: Some(chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()),
                is_trusted: true,
                pairing_code: Some(target_code.to_uppercase()),
            });
        }

        for (file_idx, file_path) in files.into_iter().enumerate() {
            let path = Path::new(&file_path);
            let file_name = path.file_name().unwrap_or_default().to_string_lossy().into_owned();

            let (tx, mut rx) = mpsc::channel::<transfer::stream::ProgressEvent>(1024);
            let app_handle = app.clone();
            let transfer_id = transfer_ids[file_idx].clone();
            let transfer_id_clone = transfer_id.clone();

            let file_size = std::fs::metadata(&file_path).map(|m| m.len()).unwrap_or(0);

            let settings_model = crate::services::settings_service::get_settings();

            let chunk_size = 5 * 1024 * 1024;
            let parts = file_size.div_ceil(chunk_size);
            let calculated_parts = std::cmp::min(parts.max(1), settings_model.max_parallel_connections as u64) as u32;

            let mut transfer = Transfer {
                id: transfer_id_clone.clone(),
                file_name: file_name.clone(),
                file_size,
                bytes_transferred: 0,
                progress: 0.0,
                status: TransferStatus::Waiting,
                speed: 0,
                estimated_time_remaining: 0,
                direction: "outgoing".into(),
                target_device: TargetDevice {
                    id: node_id_str.clone(),
                    name: peer_name_spawn.clone(),
                    os: peer_os_spawn.clone(),
                },
                parts: calculated_parts,
                last_update_time: std::time::Instant::now(),
                last_bytes: 0,
            };

            // Add to registry
            {
                let registry = transfer_manager.registry();
                let mut reg = registry.write().await;
                reg.insert(transfer_id_clone.clone(), transfer.clone());
            }

            let registry_clone = transfer_manager.registry().clone();
            let history_manager_clone = history_manager.clone();
            let target_node_id_clone = node_id_str.clone();
            let file_name_history = file_name.clone();
            let file_name_clone = file_name.clone();
            let peer_name_history = peer_name_spawn.clone();
            let transfer_start = std::time::Instant::now();

            // Progress-consumer task: drains events, coalesces byte updates,
            // emits a `transfer-progress` event no more than every ~200ms.
            let progress_consumer = tauri::async_runtime::spawn(async move {
                use std::time::{Duration, Instant};

                let mut total_transferred: u64 = 0;
                let mut chunks_completed: u32 = 0;
                let mut last_emit = Instant::now() - Duration::from_millis(500);

                while let Some(event) = rx.recv().await {
                    match event {
                        transfer::stream::ProgressEvent::InitParts(parts) => {
                            transfer.parts = parts;
                            transfer.status = TransferStatus::Sending;
                            let mut reg = registry_clone.write().await;
                            reg.insert(transfer_id_clone.clone(), transfer.clone());
                            drop(reg);
                            let _ = app_handle.emit("transfer-progress", transfer.clone());
                        }
                        transfer::stream::ProgressEvent::Bytes(bytes) => {
                            total_transferred = total_transferred.saturating_add(bytes as u64);
                        }
                        transfer::stream::ProgressEvent::ChunkStarted(index, _size) => {
                            let _ = app_handle.emit(
                                "chunk-progress",
                                serde_json::json!({
                                    "transferId": transfer_id_clone,
                                    "chunkIndex": index,
                                    "status": "downloading",
                                }),
                            );
                        }
                        transfer::stream::ProgressEvent::ChunkCompleted(index) => {
                            chunks_completed = chunks_completed.saturating_add(1);
                            let _ = app_handle.emit(
                                "chunk-progress",
                                serde_json::json!({
                                    "transferId": transfer_id_clone,
                                    "chunkIndex": index,
                                    "status": "completed",
                                }),
                            );
                        }
                        transfer::stream::ProgressEvent::Cancel
                        | transfer::stream::ProgressEvent::Pause
                        | transfer::stream::ProgressEvent::Resume => {
                            // Handled by out-of-band uni-stream messages.
                        }
                    }

                    // Coalesced emit.
                    let now = Instant::now();
                    let elapsed = now.duration_since(last_emit);
                    if elapsed >= Duration::from_millis(200)
                        || (file_size > 0 && total_transferred >= file_size)
                    {
                        let secs = elapsed.as_secs_f64().max(0.001);
                        let bytes_diff = total_transferred.saturating_sub(transfer.last_bytes);
                        let speed = (bytes_diff as f64 / secs) as u64;
                        let remaining = file_size.saturating_sub(total_transferred);
                        let eta = remaining.checked_div(speed).unwrap_or(0);
                        let progress = if file_size > 0 {
                            (total_transferred as f64 / file_size as f64) * 100.0
                        } else {
                            100.0
                        };

                        transfer.bytes_transferred = total_transferred;
                        transfer.speed = speed;
                        transfer.estimated_time_remaining = eta;
                        transfer.progress = progress.min(100.0);
                        transfer.last_update_time = now;
                        transfer.last_bytes = total_transferred;
                        last_emit = now;

                        // Preserve any externally-set terminal status (cancel).
                        if transfer.status != TransferStatus::Cancelled
                            && transfer.status != TransferStatus::Failed
                        {
                            transfer.status = TransferStatus::Sending;
                        }

                        let mut reg = registry_clone.write().await;
                        reg.insert(transfer_id_clone.clone(), transfer.clone());
                        drop(reg);
                        let _ = app_handle.emit("transfer-progress", transfer.clone());
                    }
                }

                // Channel closed. Final emit reflects the terminal state — but
                // note that success/failure classification comes from the
                // engine task; here we only emit the "completed" if all bytes
                // arrived, otherwise leave status alone (the error path in the
                // engine task will overwrite to Failed/Cancelled).
                let all_bytes = file_size == 0 || total_transferred >= file_size;
                if all_bytes
                    && transfer.status != TransferStatus::Cancelled
                    && transfer.status != TransferStatus::Failed
                {
                    transfer.status = TransferStatus::Completed;
                    transfer.progress = 100.0;
                    transfer.bytes_transferred = file_size;
                    let mut reg = registry_clone.write().await;
                    reg.insert(transfer_id_clone.clone(), transfer.clone());
                    drop(reg);
                    let _ = app_handle.emit("transfer-progress", transfer.clone());
                }

                // Add to history — uses the peer name resolved up front, not
                // the peer_registry (peer may have vanished).
                {
                    let mut hm = history_manager_clone.write().await;
                    hm.add_record(transfer::history::HistoryRecord {
                        id: uuid::Uuid::new_v4().to_string(),
                        transfer_id: transfer_id_clone.clone(),
                        file_name: file_name_history,
                        file_size,
                        direction: "outgoing".into(),
                        target_device_id: target_node_id_clone,
                        target_device_name: peer_name_history.clone(),
                        status: if all_bytes { "completed".into() } else { "failed".into() },
                        timestamp: chrono::Local::now().to_rfc3339(),
                        duration_seconds: transfer_start.elapsed().as_secs(),
                    });
                }

                // Unconditional cleanup of the static maps.
                {
                    let mut handles = CANCEL_HANDLES.lock().await;
                    handles.remove(&transfer_id_clone);
                }
                {
                    let mut pauses = PAUSE_FLAGS.lock().await;
                    pauses.remove(&transfer_id_clone);
                }
            });

            let connection_clone = connection.clone();
            let transfer_id_engine = transfer_id.clone();

            let engine_settings = transfer::engine::EngineSettings {
                max_parallel_connections: settings_model.max_parallel_connections,
                power_mode: match settings_model.transfer_engine_mode.as_str() {
                    "max_throughput" => transfer::engine::PowerMode::MaxThroughput,
                    "medium" => transfer::engine::PowerMode::Medium,
                    _ => transfer::engine::PowerMode::Balanced,
                },
            };

            let error_app_handle = app.clone();
            let error_registry = transfer_manager.registry().clone();
            let error_transfer_id = transfer_id_engine.clone();
            let connection_clone_for_handle = connection_clone.clone();
            let pause_flag = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
            let pause_flag_clone = pause_flag.clone();
            let pause_flag_clone2 = pause_flag.clone();
            let progress_consumer_arc = std::sync::Arc::new(tokio::sync::Mutex::new(Some(progress_consumer)));
            let progress_consumer_for_engine = progress_consumer_arc.clone();

            let join_handle = tokio::spawn(async move {
                let engine_result = transfer::stream::TransferStream::send_file_parallel(
                    &connection_clone,
                    transfer_id_engine.clone(),
                    file_path,
                    file_name_clone,
                    tx,          // moves the sender; when this returns, `rx` drains and closes
                    engine_settings,
                    pause_flag_clone,
                    None, // No sync metadata for manual transfers
                )
                .await;

                if let Err(e) = engine_result {
                    tracing::error!("Transfer failed: {}", e);

                    // Update registry to failed or cancelled.
                    let mut reg = error_registry.write().await;
                    if let Some(mut t) = reg.get(&error_transfer_id).cloned() {
                        if e.to_string().contains("REJECTED_BY_USER") {
                            t.status = TransferStatus::Cancelled;
                        } else {
                            t.status = TransferStatus::Failed;
                        }
                        if e.to_string().contains("INSUFFICIENT_SPACE") {
                            t.estimated_time_remaining = 999999;
                        }
                        reg.insert(error_transfer_id.clone(), t.clone());
                        drop(reg);
                        let _ = error_app_handle.emit("transfer-progress", t);
                    }
                }

                // Wait for the progress consumer to drain the channel and emit
                // the terminal event. Take-out so subsequent calls don't panic.
                if let Some(pc) = progress_consumer_for_engine.lock().await.take() {
                    let _ = pc.await;
                }

                // Belt-and-braces map cleanup on the engine-side path.
                {
                    let mut handles = CANCEL_HANDLES.lock().await;
                    handles.remove(&error_transfer_id);
                }
                {
                    let mut pauses = PAUSE_FLAGS.lock().await;
                    pauses.remove(&error_transfer_id);
                }
            });

            // Store the handle for cancellation.
            {
                let mut handles = CANCEL_HANDLES.lock().await;
                handles.insert(transfer_id.clone(), (join_handle, connection_clone_for_handle.clone()));
            }
            {
                let mut pauses = PAUSE_FLAGS.lock().await;
                pauses.insert(transfer_id.clone(), (pause_flag_clone2, connection_clone_for_handle));
            }
        }
    });

    Ok(transfer_ids_out)
}

#[tauri::command]
pub async fn get_active_transfers(state: State<'_, AppState>) -> Result<Vec<Transfer>, String> {
    let registry = state.transfer_manager.registry();
    let reg = registry.read().await;
    let transfers: Vec<Transfer> = reg.values().cloned().collect();
    Ok(transfers)
}

use std::sync::LazyLock;
use tokio::task::JoinHandle;
use iroh::net::endpoint::Connection;

type CancelHandleMap = std::collections::HashMap<String, (JoinHandle<()>, Connection)>;
type PauseFlagMap = std::collections::HashMap<String, (std::sync::Arc<std::sync::atomic::AtomicBool>, Connection)>;

static CANCEL_HANDLES: LazyLock<tokio::sync::Mutex<CancelHandleMap>> = LazyLock::new(|| tokio::sync::Mutex::new(std::collections::HashMap::new()));
static PAUSE_FLAGS: LazyLock<tokio::sync::Mutex<PauseFlagMap>> = LazyLock::new(|| tokio::sync::Mutex::new(std::collections::HashMap::new()));

#[tauri::command]
pub async fn cancel_transfer(id: String, state: State<'_, AppState>, app: tauri::AppHandle) -> Result<(), String> {
    // Snapshot the connection first; we always want to send Cancel on the
    // wire *before* aborting the local task, so the receiver's state
    // machine gets a chance to run its own CleanupGuard.
    let (handle_opt, conn_opt) = {
        let mut handles = CANCEL_HANDLES.lock().await;
        match handles.remove(&id) {
            Some((h, c)) => (Some(h), Some(c)),
            None => (None, None),
        }
    };

    if let Some(connection) = conn_opt.clone() {
        // Best-effort send with a short timeout so a dead connection can't
        // hang the cancel path.
        let send_id = id.clone();
        let send_task = tokio::spawn(async move {
            if let Ok(mut send_stream) = connection.open_uni().await {
                let msg = transfer::stream::StreamMessage::CancelTransfer { transfer_id: send_id };
                if let Ok(json) = serde_json::to_string(&msg) {
                    let bytes = json.as_bytes();
                    use tokio::io::AsyncWriteExt;
                    let _ = send_stream.write_u32(bytes.len() as u32).await;
                    let _ = send_stream.write_all(bytes).await;
                    let _ = send_stream.flush().await;
                    let _ = send_stream.finish();
                }
            }
        });
        let _ = tokio::time::timeout(std::time::Duration::from_secs(2), send_task).await;
    }

    // Now abort the local sending task. Any half-sent chunks will hit a
    // write error and the engine will propagate through the failure path,
    // which triggers the receiver's CleanupGuard through its own
    // connection.closed() watcher.
    if let Some(handle) = handle_opt {
        handle.abort();
    }

    // Clean up pause flags for this transfer.
    {
        let mut pauses = PAUSE_FLAGS.lock().await;
        pauses.remove(&id);
    }

    // 3. Mark as cancelled locally.
    let registry = state.transfer_manager.registry();
    let mut reg = registry.write().await;
    if let Some(mut t) = reg.get(&id).cloned() {
        t.status = TransferStatus::Cancelled;
        reg.insert(id.clone(), t.clone());
        drop(reg);
        let _ = app.emit("transfer-progress", t);
    }

    Ok(())
}

#[tauri::command]
pub async fn pause_transfer(id: String, state: State<'_, AppState>, app: tauri::AppHandle) -> Result<(), String> {
    let pauses = PAUSE_FLAGS.lock().await;
    if let Some((flag, connection)) = pauses.get(&id) {
        let is_paused = flag.load(std::sync::atomic::Ordering::Relaxed);
        flag.store(!is_paused, std::sync::atomic::Ordering::Relaxed);

        let new_status = if !is_paused {
            TransferStatus::Paused
        } else {
            TransferStatus::Sending
        };

        // 1. Send Pause/Resume command to Receiver
        if let Ok(mut send_stream) = connection.open_uni().await {
            let msg = if !is_paused {
                transfer::stream::StreamMessage::PauseTransfer { transfer_id: id.clone() }
            } else {
                transfer::stream::StreamMessage::ResumeTransfer { transfer_id: id.clone() }
            };
            if let Ok(json) = serde_json::to_string(&msg) {
                let bytes = json.as_bytes();
                use tokio::io::AsyncWriteExt;
                let _ = send_stream.write_u32(bytes.len() as u32).await;
                let _ = send_stream.write_all(bytes).await;
                let _ = send_stream.finish();
            }
        }

        // 2. Mark as paused locally.
        let registry = state.transfer_manager.registry();
        let mut reg = registry.write().await;
        if let Some(mut t) = reg.get(&id).cloned() {
            t.status = new_status;
            reg.insert(id.clone(), t.clone());
            drop(reg);
            let _ = app.emit("transfer-progress", t);
        }
    }
    Ok(())
}

