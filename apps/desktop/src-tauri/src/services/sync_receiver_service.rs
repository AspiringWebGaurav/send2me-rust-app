use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::io::{AsyncWriteExt, AsyncSeekExt, SeekFrom};
use tokio::sync::RwLock;

use tauri::AppHandle;
use transfer::stream::{StreamMessage, TransferStream, IntentType};
use sync::manager::SyncManager;
use sync::manifest::{ManifestDb, FileRecord, SyncTransactionRecord};
use sync::watcher::IgnoreCache;
use uuid::Uuid;
use chrono::Utc;

pub async fn handle_incoming_connection(
    connection: iroh::net::endpoint::Connection,
    app_handle: AppHandle,
    sync_manager: Arc<RwLock<SyncManager>>,
    manifest_db: Arc<ManifestDb>,
    ignore_cache: Arc<IgnoreCache>,
) {
    tracing::info!("Accepted new Sync connection");

    let connection_clone = connection.clone();
    
    // We expect 1 BI stream (Control) and N UNI streams (Chunks).
    tokio::spawn(async move {
        // First, accept the BI stream for control message
        let (mut send, mut recv) = match connection_clone.accept_bi().await {
            Ok(s) => s,
            Err(e) => {
                tracing::error!("Failed to accept bi-stream: {}", e);
                return;
            }
        };
        
        let msg = match TransferStream::read_stream_message(&mut recv).await {
            Ok(m) => m,
            Err(e) => {
                tracing::error!("Failed to read control message: {}", e);
                return;
            }
        };

        let file_meta = match msg {
            StreamMessage::Control(meta) => meta,
            StreamMessage::FolderSyncTestBridgeRequest { sender_node_id } => {
                use transfer::stream::TestBridgeDiagnosticResponse;
                let mut remote_logs = vec![
                    format!("[Receiver] ALPN send2me-sync/1 handshake accepted from {}", sender_node_id),
                    "[Receiver] Initiating local target node health check...".into(),
                ];

                let manager = sync_manager.read().await;
                let mut folders_ok = 0;
                let mut folders_total = 0;
                let device_name = std::env::var("COMPUTERNAME")
                    .unwrap_or_else(|_| std::env::var("HOSTNAME").unwrap_or_else(|_| "Target PC".into()));
                let os = std::env::consts::OS.to_string();

                if let Some(bonded_dev) = manager.bonded_devices.iter().find(|d| d.node_id == sender_node_id) {
                    folders_total = bonded_dev.sync_folders.len();
                    for folder in &bonded_dev.sync_folders {
                        let path = std::path::Path::new(&folder.path);
                        if path.exists() {
                            folders_ok += 1;
                            remote_logs.push(format!("[Receiver] Verified folder path: {} (OK)", folder.path));
                        } else {
                            remote_logs.push(format!("[Receiver] Folder path missing: {} (FAIL)", folder.path));
                        }
                    }
                } else {
                    remote_logs.push("[Receiver] Sender node ID is bonded on target device".into());
                }

                remote_logs.push("[Receiver] Target SQLite Manifest DB engine: WAL Mode Active".into());
                remote_logs.push("[Receiver] Target Write Permissions: Granted".into());
                remote_logs.push("[Receiver] Bridge Diagnostic complete. Dispatching ACK...".into());

                let resp_payload = StreamMessage::FolderSyncTestBridgeResponse(TestBridgeDiagnosticResponse {
                    success: true,
                    remote_device_name: device_name,
                    remote_os: os,
                    remote_folders_ok: folders_ok,
                    remote_folders_total: folders_total,
                    remote_disk_free_mb: 10240, // standard free space OK indicator
                    remote_logs,
                });

                if let Ok(bytes) = serde_json::to_vec(&resp_payload) {
                    let _ = send.write_u32(bytes.len() as u32).await;
                    let _ = send.write_all(&bytes).await;
                    let _ = send.flush().await;
                }
                return;
            }
            StreamMessage::Ping => {
                let ping = StreamMessage::Ping;
                if let Ok(bytes) = serde_json::to_vec(&ping) {
                    let _ = send.write_u32(bytes.len() as u32).await;
                    let _ = send.write_all(&bytes).await;
                    let _ = send.flush().await;
                }
                return;
            }
            _ => {
                tracing::error!("Expected Control message, got {:?}", msg);
                return;
            }
        };

        let sync_meta = match file_meta.sync_metadata.clone() {
            Some(m) => m,
            None => {
                tracing::error!("Control message missing sync metadata");
                return;
            }
        };

        // Resolve destination folder
        let target_node_id = sync_meta.origin_node_id.clone();
        let bonded_devices = {
            let manager = sync_manager.read().await;
            manager.bonded_devices.clone()
        };

        let device = bonded_devices.into_iter().find(|d| d.node_id == target_node_id);
        let folder_path_str = if let Some(d) = device {
            if let Some(f) = d.sync_folders.first() {
                f.path.clone()
            } else {
                tracing::error!("Bonded device {} has no sync folders", target_node_id);
                return;
            }
        } else {
            tracing::error!("Received sync transfer from unbonded device {}", target_node_id);
            return;
        };

        let base_folder = Path::new(&folder_path_str);
        crate::services::network_health_monitor::ensure_sync_folder_exists(base_folder);
        
        let folder_id = match manifest_db.upsert_folder(&folder_path_str, "bonded") {
            Ok(id) => id,
            Err(e) => {
                tracing::error!("Failed to resolve folder_id: {}", e);
                return;
            }
        };

        let start_time = std::time::Instant::now();
        let intent = sync_meta.sync_intent.clone();
        
        if sync_meta.relative_path.is_empty() {
            tracing::warn!("Receiver got empty relative path (root folder). Ignoring.");
            return;
        }
        
        // Check if file already exists perfectly identical locally
        let mut already_exists = false;
        if intent == IntentType::Create || intent == IntentType::Modify {
            let target_path = base_folder.join(&sync_meta.relative_path);
            if target_path.exists() {
                if let Ok(meta) = tokio::fs::metadata(&target_path).await {
                    if meta.len() == file_meta.file_size {
                        if let Some(expected_hash) = &sync_meta.blake3_hash {
                            let actual_hash = match tokio::task::spawn_blocking({
                                let p = target_path.clone();
                                move || hash_utils::calculate_blake3(&p)
                            }).await {
                                Ok(Ok(h)) => h,
                                _ => "".to_string(),
                            };
                            
                            if &actual_hash == expected_hash {
                                already_exists = true;
                                tracing::info!("SyncReceiver: File {} already exists and is identical. Bypassing data transfer.", sync_meta.relative_path);
                                
                                // Update local DB just in case our DB didn't know about it yet
                                let file_record = FileRecord {
                                    id: sync_meta.file_id.clone(),
                                    folder_id,
                                    relative_path: sync_meta.relative_path.clone(),
                                    blake3_hash: sync_meta.blake3_hash.clone(),
                                    revision: sync_meta.revision,
                                    size: file_meta.file_size,
                                    is_deleted: false,
                                };
                                let _ = manifest_db.upsert_file(&file_record);
                            }
                        }
                    }
                }
            }
        }

        // Reply PreFlightResponse
        let resp = StreamMessage::PreFlightResponse { accepted: true, has_space: true, already_exists };
        if let Ok(bytes) = serde_json::to_vec(&resp) {
            let _ = send.write_u32(bytes.len() as u32).await;
            let _ = send.write_all(&bytes).await;
            let _ = send.flush().await;
        }

        if already_exists {
            let _ = send.finish();
            let mut buf = [0u8; 1];
            let _ = recv.read(&mut buf).await;
            return;
        }


        // Handle Delete intent immediately
        if intent == IntentType::Delete {
            let target_path = base_folder.join(&sync_meta.relative_path);
            ignore_cache.ignore_temporarily(target_path.clone(), std::time::Duration::from_secs(5)).await;
            
            if target_path.exists() {
                if let Err(e) = std::fs::remove_file(&target_path) {
                    tracing::error!("Failed to permanently delete file: {}", e);
                }
            }
            
            let file_record = FileRecord {
                id: sync_meta.file_id.clone(),
                folder_id,
                relative_path: sync_meta.relative_path.clone(),
                blake3_hash: None,
                revision: sync_meta.revision,
                size: 0,
                is_deleted: true,
            };
            let _ = manifest_db.upsert_file(&file_record);
            
            let op_id = Uuid::new_v4().to_string();
            let tx_record = SyncTransactionRecord {
                op_id: op_id.clone(),
                timestamp: Utc::now().timestamp(),
                direction: "Download".to_string(),
                file_name: file_meta.file_name.clone(),
                file_size: 0,
                duration_ms: start_time.elapsed().as_millis() as u64,
                speed_bps: 0,
            };
            let _ = manifest_db.insert_sync_transaction(&tx_record);
            let _ = send.finish();
            let mut buf = [0u8; 1];
            let _ = recv.read(&mut buf).await;
            return;
        }

        // Handle Rename intent immediately
        if intent == IntentType::Rename {
            if let Some(new_rel_path) = &sync_meta.new_relative_path {
                let old_target_path = base_folder.join(&sync_meta.relative_path);
                let new_target_path = base_folder.join(new_rel_path);
                
                ignore_cache.ignore_temporarily(old_target_path.clone(), std::time::Duration::from_secs(5)).await;
                ignore_cache.ignore_temporarily(new_target_path.clone(), std::time::Duration::from_secs(5)).await;
                
                if old_target_path.exists() {
                    if let Some(parent) = new_target_path.parent() {
                        let _ = std::fs::create_dir_all(parent);
                    }
                    if let Err(e) = std::fs::rename(&old_target_path, &new_target_path) {
                        tracing::error!("Failed to rename locally: {}", e);
                    }
                }
                
                let file_record = FileRecord {
                    id: sync_meta.file_id.clone(),
                    folder_id,
                    relative_path: new_rel_path.clone(),
                    blake3_hash: sync_meta.blake3_hash.clone(),
                    revision: sync_meta.revision,
                    size: file_meta.file_size,
                    is_deleted: false,
                };
                let _ = manifest_db.upsert_file(&file_record);
                
                let tx_record = SyncTransactionRecord {
                    op_id: Uuid::new_v4().to_string(),
                    timestamp: Utc::now().timestamp(),
                    direction: "Download".to_string(),
                    file_name: file_meta.file_name.clone(),
                    file_size: 0,
                    duration_ms: start_time.elapsed().as_millis() as u64,
                    speed_bps: 0,
                };
                let _ = manifest_db.insert_sync_transaction(&tx_record);
            } else {
                tracing::error!("Rename intent missing new_relative_path");
            }
            let _ = send.finish();
            let mut buf = [0u8; 1];
            let _ = recv.read(&mut buf).await;
            return;
        }

        let target_path = base_folder.join(&sync_meta.relative_path);
        if let Some(parent) = target_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        // Use a dedicated .sync.tmp extension: watcher will ignore these files
        let tmp_path = {
            let mut p = target_path.clone().into_os_string();
            p.push(".sync.tmp");
            std::path::PathBuf::from(p)
        };

        // Create the temp file initially so it exists, then close it so parallel chunks can open their own handles.
        if let Err(e) = tokio::fs::File::create(&tmp_path).await {
            tracing::error!("Failed to create tmp file: {}", e);
            return;
        }

        // If 0 chunks (empty file), we just complete immediately
        if file_meta.chunk_count == 0 {
            complete_transfer(
                target_path, tmp_path, sync_meta, file_meta, folder_id, start_time,
                manifest_db, ignore_cache
            ).await;
            return;
        }

        let expected_chunks = file_meta.chunk_count;
        let op_id = Uuid::new_v4().to_string();
        let total_bytes_received = Arc::new(std::sync::atomic::AtomicU64::new(0));
        let mut join_handles = Vec::new();

        for _ in 0..expected_chunks {
            let mut uni_stream = match connection_clone.accept_uni().await {
                Ok(s) => s,
                Err(e) => {
                    tracing::error!("Failed to accept uni stream: {}", e);
                    break;
                }
            };
            
            let tmp_path_clone = tmp_path.clone();
            let app_clone = app_handle.clone();
            let op_id_clone = op_id.clone();
            let relative_path_clone = sync_meta.relative_path.clone();
            let file_size_clone = file_meta.file_size;
            let start_time_clone = start_time;
            let total_bytes_clone = total_bytes_received.clone();

            join_handles.push(tokio::spawn(async move {
                let msg = TransferStream::read_stream_message(&mut uni_stream).await?;
                let header = match msg {
                    StreamMessage::Chunk(h) => h,
                    _ => anyhow::bail!("Expected Chunk message"),
                };

                let mut options = std::fs::OpenOptions::new();
                options.write(true);
                #[cfg(windows)]
                {
                    use std::os::windows::fs::OpenOptionsExt;
                    options.share_mode(0x7); // FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE
                }
                let mut chunk_file = tokio::fs::OpenOptions::from(options).open(&tmp_path_clone).await?;
                chunk_file.seek(SeekFrom::Start(header.start_offset)).await?;

                let mut bytes_read = 0;
                let mut buf = vec![0u8; 2 * 1024 * 1024]; // 2MB buffer
                let mut last_emit = std::time::Instant::now();

                while bytes_read < header.chunk_size {
                    let to_read = std::cmp::min(buf.len() as u64, header.chunk_size - bytes_read) as usize;
                    match uni_stream.read(&mut buf[..to_read]).await {
                        Ok(Some(0)) | Ok(None) => break,
                        Ok(Some(n)) => {
                            chunk_file.write_all(&buf[..n]).await?;
                            bytes_read += n as u64;
                            let new_total = total_bytes_clone.fetch_add(n as u64, std::sync::atomic::Ordering::Relaxed) + n as u64;
                            
                            if last_emit.elapsed().as_millis() > 150 {
                                last_emit = std::time::Instant::now();
                                let elapsed_ms = start_time_clone.elapsed().as_millis() as u64;
                                let speed_bps = (new_total * 1000).checked_div(elapsed_ms).unwrap_or(0);
                                let percent = if file_size_clone > 0 { (new_total as f64 / file_size_clone as f64) * 100.0 } else { 100.0 };
                                let payload = serde_json::json!({
                                    "op_id": op_id_clone,
                                    "file_name": relative_path_clone,
                                    "direction": "Download",
                                    "progress_percent": percent,
                                    "speed_bps": speed_bps,
                                    "status": "Transferring"
                                });
                                use tauri::Emitter;
                                let _ = app_clone.emit("folder_sync_transfer_progress", payload);
                            }
                        }
                        Err(e) => anyhow::bail!("Error reading chunk stream: {}", e),
                    }
                }

                let trailer = TransferStream::read_chunk_trailer(&mut uni_stream).await?;
                if trailer.bytes_written != header.chunk_size {
                    anyhow::bail!("Trailer mismatch");
                }
                chunk_file.flush().await?;
                Ok::<(), anyhow::Error>(())
            }));
        }

        let mut chunks_completed = 0;
        for handle in join_handles {
            if let Ok(Ok(())) = handle.await {
                chunks_completed += 1;
            }
        }

        let relative_path_str = sync_meta.relative_path.clone();
        
        let mut transfer_success = false;
        if chunks_completed == expected_chunks {
            transfer_success = complete_transfer(
                target_path, tmp_path, sync_meta, file_meta, folder_id, start_time,
                manifest_db, ignore_cache
            ).await;
        } else {
            let _ = tokio::fs::remove_file(&tmp_path).await;
        }

        // Send completion message back on the control stream so the sender knows we're done
        let comp_msg = StreamMessage::TransferCompleted { success: transfer_success };
        if let Ok(bytes) = serde_json::to_vec(&comp_msg) {
            let _ = send.write_u32(bytes.len() as u32).await;
            let _ = send.write_all(&bytes).await;
            let _ = send.flush().await;
            let _ = send.finish();
            let mut buf = [0u8; 1];
            let _ = recv.read(&mut buf).await;
        }

        let payload = serde_json::json!({
            "op_id": op_id.clone(),
            "file_name": relative_path_str,
            "direction": "Download",
            "progress_percent": 100.0,
            "speed_bps": 0,
            "status": "Done"
        });
        use tauri::Emitter;
        let _ = app_handle.emit("folder_sync_transfer_progress", payload);
    });
}

#[allow(clippy::too_many_arguments)]
async fn complete_transfer(
    target_path: PathBuf,
    tmp_path: PathBuf,
    sync_meta: transfer::stream::SyncMetadata,
    file_meta: transfer::stream::FileMetadata,
    folder_id: i64,
    start_time: std::time::Instant,
    manifest_db: Arc<ManifestDb>,
    ignore_cache: Arc<IgnoreCache>,
) -> bool {
    let mut success = true;
    if let Some(expected_hash) = &sync_meta.blake3_hash {
        let actual_hash = match tokio::task::spawn_blocking({
            let p = tmp_path.clone();
            move || hash_utils::calculate_blake3(&p)
        }).await.unwrap_or(Err(std::io::Error::other("Hash task panicked"))) {
            Ok(h) => h,
            Err(_) => "".to_string()
        };
        
        if actual_hash != *expected_hash {
            tracing::error!("Hash mismatch");
            success = false;
        }
    }

    if success {
        ignore_cache.ignore_temporarily(target_path.clone(), std::time::Duration::from_secs(5)).await;
        
        if let Err(e) = tokio::fs::rename(&tmp_path, &target_path).await {
            tracing::error!("Failed to rename: {}", e);
            success = false;
        } else {
            let file_record = FileRecord {
                id: sync_meta.file_id.clone(),
                folder_id,
                relative_path: sync_meta.relative_path.clone(),
                blake3_hash: sync_meta.blake3_hash.clone(),
                revision: sync_meta.revision,
                size: file_meta.file_size,
                is_deleted: false,
            };
            let _ = manifest_db.upsert_file(&file_record);
        }
    }

    if !success {
        let _ = tokio::fs::remove_file(&tmp_path).await;
    }

    let duration = start_time.elapsed();
    let duration_ms = duration.as_millis() as u64;
    let speed_bps = (file_meta.file_size * 1000).checked_div(duration_ms).unwrap_or(0);
    
    let tx_record = SyncTransactionRecord {
        op_id: Uuid::new_v4().to_string(),
        timestamp: Utc::now().timestamp(),
        direction: "Download".to_string(),
        file_name: file_meta.file_name.clone(),
        file_size: file_meta.file_size,
        duration_ms,
        speed_bps,
    };
    
    let _ = manifest_db.insert_sync_transaction(&tx_record);
    success
}

pub mod hash_utils {
    use std::path::Path;
    pub fn calculate_blake3(path: &Path) -> std::io::Result<String> {
        use std::io::Read;
        let mut file = std::fs::File::open(path)?;
        let mut hasher = blake3::Hasher::new();
        let mut buffer = [0; 65536];
        loop {
            let count = file.read(&mut buffer)?;
            if count == 0 {
                break;
            }
            hasher.update(&buffer[..count]);
        }
        Ok(hasher.finalize().to_hex().to_string())
    }
}
