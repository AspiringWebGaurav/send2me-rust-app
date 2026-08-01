use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio::time::{sleep, Duration, Instant};
use tracing::{info, warn, error, debug};
use uuid::Uuid;
use chrono::Utc;
use sync::manifest::{ManifestDb, FileRecord, QueueRecord};
use tauri::AppHandle;

#[derive(Debug, Clone)]
pub enum FileEvent {
    LocalChange {
        folder_base: String,
        absolute_path: PathBuf,
        event_type: String, // "created", "modified", "deleted", "renamed"
        new_abs_path: Option<PathBuf>,
    },
}

pub struct SyncStateManager {
    db: Arc<ManifestDb>,
    app_handle: AppHandle,
}

struct PendingEvent {
    event: FileEvent,
    last_updated: Instant,
}

// Global sender
static EVENT_SENDER: std::sync::OnceLock<mpsc::Sender<FileEvent>> = std::sync::OnceLock::new();

pub fn get_event_sender() -> Option<mpsc::Sender<FileEvent>> {
    EVENT_SENDER.get().cloned()
}

pub fn start_sync_state_manager(db: Arc<ManifestDb>, app_handle: AppHandle) {
    let (tx, mut rx) = mpsc::channel::<FileEvent>(10000); // Buffer for huge bursts
    let _ = EVENT_SENDER.set(tx);

    tauri::async_runtime::spawn(async move {
        let mut pending_events: HashMap<String, PendingEvent> = HashMap::new();
        let manager = SyncStateManager { db, app_handle };

        info!("Sync State Manager started. Listening for file events...");

        loop {
            tokio::select! {
                Some(event) = rx.recv() => {
                    let key = match &event {
                        FileEvent::LocalChange { absolute_path, .. } => absolute_path.to_string_lossy().into_owned(),
                    };
                    // Debounce: update the last_updated time
                    pending_events.insert(key, PendingEvent {
                        event,
                        last_updated: Instant::now(),
                    });
                }
                _ = sleep(Duration::from_millis(500)) => {
                    // Check for events that have been quiet for > 2 seconds (Windows Copy Completion)
                    let now = Instant::now();
                    let mut to_process = Vec::new();
                    
                    for (key, pending) in pending_events.iter() {
                        if now.duration_since(pending.last_updated) > Duration::from_secs(2) {
                            to_process.push(key.clone());
                        }
                    }

                    for key in to_process {
                        if let Some(pending) = pending_events.remove(&key) {
                            manager.process_event(pending.event).await;
                        }
                    }
                }
            }
        }
    });
}

impl SyncStateManager {
    async fn process_event(&self, event: FileEvent) {
        let db = self.db.clone();
        let app_clone = self.app_handle.clone();
        
        tokio::task::spawn_blocking(move || {
            match event {
                FileEvent::LocalChange { folder_base, absolute_path, event_type, new_abs_path } => {
                    let intent_str = match event_type.as_str() {
                        "created" => "Create",
                        "modified" => "Modify",
                        "deleted" => "Delete",
                        "renamed" => "Rename",
                        _ => return,
                    };

                    let relative_path = match absolute_path.strip_prefix(&folder_base) {
                        Ok(p) => p.to_string_lossy().replace('\\', "/"),
                        Err(_) => return,
                    };

                    if relative_path.is_empty() {
                        if event_type == "deleted" {
                            crate::services::network_health_monitor::ensure_sync_folder_exists(std::path::Path::new(&folder_base));
                        }
                        return;
                    }

                    let new_relative_path = new_abs_path.as_ref().and_then(|p| {
                        p.strip_prefix(&folder_base).ok().map(|rp| rp.to_string_lossy().replace('\\', "/"))
                    });

                    // We are now safely debounced. We can access DB sequentially for this file.
                    let folder_id = match db.upsert_folder(&folder_base, "bonded") {
                        Ok(id) => id,
                        Err(e) => {
                            error!("Failed to upsert folder in DB: {}", e);
                            return;
                        }
                    };

                    let existing_file = db.get_file_by_path(folder_id, &relative_path).ok().flatten();
                    
                    let file_id = existing_file.as_ref().map(|f| f.id.clone()).unwrap_or_else(|| Uuid::new_v4().to_string());
                    let revision = existing_file.as_ref().map(|f| f.revision + 1).unwrap_or(1);

                    let mut blake3_hash = None;
                    let mut size = 0;
                    
                    if intent_str == "Create" || intent_str == "Modify" {
                        // Check if file is still locked by OS (e.g. still copying). If it fails to open, we abort and let the watcher re-trigger it later.
                        if let Err(e) = std::fs::File::open(&absolute_path) {
                            warn!("File {} is locked or inaccessible (possibly still copying): {}. Will retry on next event.", absolute_path.display(), e);
                            return;
                        }

                        if let Ok(metadata) = std::fs::metadata(&absolute_path) {
                            size = metadata.len();
                        }
                        if let Ok(hash) = calculate_blake3(&absolute_path) {
                            blake3_hash = Some(hash);
                        }
                        
                        // Prevent Sync Echo
                        if let Some(existing) = &existing_file {
                            if !existing.is_deleted && existing.size == size && existing.blake3_hash == blake3_hash {
                                debug!("File {} is identical to DB, ignoring event to prevent echo", relative_path);
                                return;
                            }
                        }
                    } else if intent_str == "Delete" {
                        if let Some(existing) = &existing_file {
                            if existing.is_deleted {
                                return;
                            }
                        }
                    }

                    // Upsert FileRecord
                    let file_record = FileRecord {
                        id: file_id.clone(),
                        folder_id,
                        relative_path: new_relative_path.clone().unwrap_or_else(|| relative_path.clone()),
                        blake3_hash,
                        revision,
                        size,
                        is_deleted: intent_str == "Delete",
                    };
                    
                    if let Err(e) = db.upsert_file(&file_record) {
                        error!("CRITICAL FATAL: Failed to upsert file {}: {}", file_id, e);
                        return;
                    }

                    let intent_str = if event_type == "renamed" {
                        format!("Rename:{}", relative_path)
                    } else {
                        intent_str.to_string()
                    };

                    // Abort any currently running sync transfers for this file to prevent UI hang / wasted bandwidth
                    crate::services::sync_queue_service::cancel_sync_transfer_for_file(&file_id);
                    
                    // Clear old intents from the queue so we don't duplicate work or resurrect deleted files
                    let _ = db.delete_intents_for_file(&file_id);

                    // Enqueue Intent
                    let queue_record = QueueRecord {
                        op_id: Uuid::new_v4().to_string(),
                        intent: intent_str.clone(),
                        file_id: file_id.clone(),
                        target_device_id: None,
                        status: "Pending".to_string(),
                        retry_count: 0,
                        next_retry_at: Utc::now().timestamp(),
                    };
                    
                    if let Err(e) = db.enqueue_intent(&queue_record) {
                        error!("CRITICAL FATAL: Failed to enqueue intent for {}: {}", file_id, e);
                        return;
                    }
                    
                    info!("Successfully processed and enqueued {} intent for file {}", intent_str, file_id);
                    
                    // Emit UI event
                    #[derive(Clone, serde::Serialize)]
                    struct WatcherEventPayload {
                        event_type: String,
                        path: String,
                        new_path: Option<String>,
                    }
                    
                    let payload = WatcherEventPayload {
                        event_type: event_type.to_string(),
                        path: absolute_path.to_string_lossy().into_owned(),
                        new_path: new_abs_path.map(|p| p.to_string_lossy().into_owned()),
                    };
                    
                    use tauri::Emitter;
                    let _ = app_clone.emit("folder-sync-event", &payload);
                }
            }
        });
    }
}

fn calculate_blake3(path: &Path) -> std::io::Result<String> {
    use std::io::Read;
    let mut options = std::fs::OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.share_mode(0x7);
    }
    let mut file = options.open(path)?;
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
