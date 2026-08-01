use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, RwLock};
use network::network_manager::NetworkManager;
use sync::manager::SyncManager;
use sync::manifest::{ManifestDb, SyncTransactionRecord};
use sync::queue::SyncQueueEngine;
use transfer::engine::{EngineSettings, PowerMode};
use transfer::stream::{IntentType, SyncMetadata, TransferStream, ProgressEvent, FileMetadata, StreamMessage};
use chrono::Utc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use std::collections::HashMap;
use std::sync::Mutex as StdMutex;

pub struct CancelInfo {
    pub handle: tokio::task::AbortHandle,
    pub op_id: String,
    pub app_handle: AppHandle,
    pub file_name: String,
}

type ActiveTransfersMap = Arc<StdMutex<HashMap<String, Vec<CancelInfo>>>>;
static ACTIVE_SYNC_TRANSFERS: std::sync::OnceLock<ActiveTransfersMap> = std::sync::OnceLock::new();

pub fn cancel_sync_transfer_for_file(file_id: &str) {
    if let Some(map_arc) = ACTIVE_SYNC_TRANSFERS.get() {
        if let Ok(mut map) = map_arc.lock() {
            if let Some(infos) = map.remove(file_id) {
                for info in infos {
                    info.handle.abort();
                    let payload = serde_json::json!({
                        "op_id": info.op_id,
                        "file_name": info.file_name,
                        "direction": "Upload",
                        "progress_percent": 100.0,
                        "speed_bps": 0,
                        "status": "Cancelled"
                    });
                    let _ = info.app_handle.emit("folder_sync_transfer_progress", payload);
                }
            }
        }
    }
}

pub fn spawn(
    app: AppHandle,
    network_manager: Arc<NetworkManager>,
    sync_manager: Arc<RwLock<SyncManager>>,
    manifest_db: Arc<ManifestDb>,
) {
    let _ = ACTIVE_SYNC_TRANSFERS.set(Arc::new(StdMutex::new(HashMap::new())));
    
    let db_for_engine = (*manifest_db).clone();
    let net_for_cb = network_manager.clone();
    let sync_for_cb = sync_manager.clone();
    let db_for_cb = manifest_db.clone();
    let app_for_cb = app.clone();

    let engine = SyncQueueEngine::new(
        db_for_engine,
        Arc::new(move |record| {
            let net = net_for_cb.clone();
            let sm = sync_for_cb.clone();
            let db = db_for_cb.clone();
            let app_val = app_for_cb.clone();

            Box::pin(async move {
                let is_delete = record.intent == "Delete";
                let db_for_spawn = db.clone();

                let file_record = match tokio::task::spawn_blocking(move || {
                    let f = db_for_spawn.get_file_by_id(&record.file_id)?;
                    let p = if let Some(ref fr) = f {
                        db_for_spawn.get_folder_path_by_id(fr.folder_id)?
                    } else {
                        None
                    };
                    Ok::<_, anyhow::Error>((f, p))
                }).await? {
                    Ok((Some(f), Some(p))) => (f, p),
                    _ => anyhow::bail!("File record or folder path not found in DB"),
                };

                let (file_meta, folder_path) = file_record;
                let absolute_path = std::path::Path::new(&folder_path).join(&file_meta.relative_path);

                let file_name = absolute_path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned();

                let targets: Vec<String> = {
                    let manager = sm.read().await;
                    manager.bonded_devices.iter().map(|d| d.node_id.clone()).collect()
                };

                if targets.is_empty() {
                    tracing::warn!("No bonded targets to sync file to");
                    return Ok(());
                }

                let mut is_rename = false;
                let mut old_relative_path = None;
                
                let intent = if record.intent.starts_with("Rename:") {
                    is_rename = true;
                    old_relative_path = Some(record.intent.trim_start_matches("Rename:").to_string());
                    IntentType::Rename
                } else {
                    match record.intent.as_str() {
                        "Create" => IntentType::Create,
                        "Modify" => IntentType::Modify,
                        "Delete" => IntentType::Delete,
                        _ => IntentType::Modify,
                    }
                };

                let mut join_handles = Vec::new();

                for target_id in targets {
                    let net_clone = net.clone();
                    let op_id = record.op_id.clone();
                    let intent_clone = intent.clone();
                    let file_meta_clone = file_meta.clone();
                    let file_name_clone = file_name.clone();
                    let absolute_path_clone = absolute_path.clone();
                    let is_delete_clone = is_delete;
                    let is_rename_clone = is_rename;
                    let old_path_clone = old_relative_path.clone();
                    let db_clone = db.clone();
                    let app_clone = app_val.clone();
                    let file_id_for_abort = file_meta_clone.id.clone();
                    let op_id_for_abort = record.op_id.clone();
                    let file_name_for_abort = file_meta_clone.relative_path.clone();

                    let handle = tokio::spawn(async move {
                        let connection = match net_clone.connect_sync(&target_id).await {
                            Ok(c) => c,
                            Err(e) => {
                                tracing::error!("SyncQueue: Failed to connect to target {}: {}", target_id, e);
                                return Err(anyhow::anyhow!("Failed to connect to peer: {}", e));
                            }
                        };

                        let start_time = std::time::Instant::now();
                        let sync_metadata = Some(SyncMetadata {
                            protocol_version: 1,
                            operation_id: op_id.clone(),
                            sync_intent: intent_clone.clone(),
                            file_id: file_meta_clone.id.clone(),
                            revision: file_meta_clone.revision,
                            blake3_hash: file_meta_clone.blake3_hash.clone(),
                            origin_node_id: net_clone.node_id().to_string(),
                            relative_path: if is_rename_clone { old_path_clone.clone().unwrap() } else { file_meta_clone.relative_path.clone() },
                            new_relative_path: if is_rename_clone { Some(file_meta_clone.relative_path.clone()) } else { None },
                        });

                        let file_size = if is_delete_clone || is_rename_clone { 0 } else { file_meta_clone.size };
                        let op_id = uuid::Uuid::new_v4().to_string();

                        if is_delete_clone || is_rename_clone {
                            // Send control message only
                            let (mut ctrl_send, mut ctrl_recv) = connection.open_bi().await?;
                            let meta = FileMetadata {
                                transfer_id: format!("sync-{}", uuid::Uuid::new_v4()),
                                file_name: file_name_clone.clone(),
                                file_size: 0,
                                chunk_count: 0,
                                sync_metadata,
                            };
                            let msg = StreamMessage::Control(meta);
                            let msg_json = serde_json::to_string(&msg)?;
                            let msg_bytes = msg_json.as_bytes();
                            ctrl_send.write_all(&(msg_bytes.len() as u32).to_be_bytes()).await?;
                            ctrl_send.write_all(msg_bytes).await?;
                            ctrl_send.flush().await?;

                            let resp_len = ctrl_recv.read_u32().await?;
                            if resp_len as usize > TransferStream::MAX_CONTROL_MESSAGE_SIZE {
                                anyhow::bail!("Pre-flight response too large");
                            }
                            let mut resp_bytes = vec![0u8; resp_len as usize];
                            ctrl_recv.read_exact(&mut resp_bytes).await?;
                            let resp_msg: StreamMessage = serde_json::from_slice(&resp_bytes)?;
                            match resp_msg {
                                StreamMessage::PreFlightResponse { accepted, .. } => {
                                    if !accepted {
                                        anyhow::bail!("Receiver rejected the control transfer.");
                                    }
                                }
                                _ => anyhow::bail!("Unexpected pre-flight response"),
                            }
                        } else {
                            let (tx, mut rx) = mpsc::channel::<ProgressEvent>(1024);
                            let app_emitter = app_clone.clone();
                            let op_id_emitter = op_id.clone();
                            let relative_path_emitter = file_meta_clone.relative_path.clone();
                            let file_size_emitter = file_meta_clone.size;
                            
                            tokio::spawn(async move {
                                let start_time = std::time::Instant::now();
                                let mut last_emit = std::time::Instant::now();
                                let mut total_bytes = 0;
                                
                                while let Some(event) = rx.recv().await {
                                    if let ProgressEvent::Bytes(b) = event {
                                        total_bytes += b;
                                        
                                        // Emit progress every 150ms
                                        if last_emit.elapsed().as_millis() > 150 {
                                            last_emit = std::time::Instant::now();
                                            let elapsed_ms = start_time.elapsed().as_millis() as u64;
                                            let speed_bps = (total_bytes as u64 * 1000).checked_div(elapsed_ms).unwrap_or(0);
                                            
                                            let percent = if file_size_emitter > 0 {
                                                (total_bytes as f64 / file_size_emitter as f64) * 100.0
                                            } else {
                                                100.0
                                            };

                                            let payload = serde_json::json!({
                                                "op_id": op_id_emitter,
                                                "file_name": relative_path_emitter,
                                                "direction": "Upload",
                                                "progress_percent": percent,
                                                "speed_bps": speed_bps,
                                                "status": "Transferring"
                                            });
                                            
                                            let _ = app_emitter.emit("folder_sync_transfer_progress", payload);
                                        }
                                    }
                                }
                                
                                // Final Done Event
                                let payload = serde_json::json!({
                                    "op_id": op_id_emitter,
                                    "file_name": relative_path_emitter,
                                    "direction": "Upload",
                                    "progress_percent": 100.0,
                                    "speed_bps": 0,
                                    "status": "Done"
                                });
                                let _ = app_emitter.emit("folder_sync_transfer_progress", payload);
                            });

                            let settings_model = crate::services::settings_service::get_settings();
                            let engine_settings = EngineSettings {
                                max_parallel_connections: settings_model.max_parallel_connections,
                                power_mode: match settings_model.transfer_engine_mode.as_str() {
                                    "max_throughput" => PowerMode::MaxThroughput,
                                    "medium" => PowerMode::Medium,
                                    _ => PowerMode::Balanced,
                                },
                            };
                            let pause_flag = Arc::new(std::sync::atomic::AtomicBool::new(false));

                            let transfer_id = format!("sync-{}", uuid::Uuid::new_v4());
                            if let Err(e) = TransferStream::send_file_parallel(
                                &connection,
                                transfer_id,
                                absolute_path_clone.to_string_lossy().into_owned(),
                                file_name_clone.clone(),
                                tx,
                                engine_settings,
                                pause_flag,
                                sync_metadata,
                            ).await {
                                tracing::error!("Sync transfer failed to peer {}: {}", target_id, e);
                                return Err(anyhow::anyhow!("Transfer failed: {}", e));
                            }
                        }

                        let duration = start_time.elapsed();
                        let duration_ms = duration.as_millis() as u64;
                        let speed_bps = (file_size * 1000).checked_div(duration_ms).unwrap_or(0);

                        let tx_record = SyncTransactionRecord {
                            op_id: op_id.clone(),
                            timestamp: Utc::now().timestamp(),
                            direction: "Upload".to_string(),
                            file_name: file_name_clone,
                            file_size,
                            duration_ms,
                            speed_bps,
                        };
                        let _ = db_clone.insert_sync_transaction(&tx_record);

                        tracing::info!("Successfully synchronized {} to peer {}", file_meta_clone.relative_path, target_id);
                        Ok(())
                    });

                    if let Some(map_arc) = ACTIVE_SYNC_TRANSFERS.get() {
                        if let Ok(mut map) = map_arc.lock() {
                            let info = CancelInfo {
                                handle: handle.abort_handle(),
                                op_id: op_id_for_abort.clone(),
                                app_handle: app_val.clone(),
                                file_name: file_name_for_abort.clone(),
                            };
                            map.entry(file_id_for_abort.clone()).or_insert_with(Vec::new).push(info);
                        }
                    }
                    join_handles.push(handle);
                }

                let mut results = Vec::new();
                for handle in join_handles {
                    results.push(handle.await);
                }
                
                if let Some(map_arc) = ACTIVE_SYNC_TRANSFERS.get() {
                    if let Ok(mut map) = map_arc.lock() {
                        map.remove(&file_meta.id);
                    }
                }
                
                let mut any_failed = false;
                for res in results {
                    match res {
                        Ok(Err(e)) => {
                            tracing::error!("A sync task failed: {}", e);
                            any_failed = true;
                        }
                        Err(e) => {
                            tracing::error!("A sync task panicked: {}", e);
                            any_failed = true;
                        }
                        _ => {}
                    }
                }

                if any_failed {
                    anyhow::bail!("One or more targets failed to sync");
                }

                Ok(())
            })
        }),
    );

    tauri::async_runtime::spawn(async move {
        engine.start();
    });
}
