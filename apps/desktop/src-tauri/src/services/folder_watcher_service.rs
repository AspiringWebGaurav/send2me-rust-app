use std::sync::Arc;
use tauri::AppHandle;
use sync::watcher::{FolderWatcher, IgnoreCache, SyncEvent};
use sync::manager::SyncManager;
use sync::manifest::ManifestDb;

pub fn spawn(
    _app: AppHandle,
    sync_manager: Arc<tokio::sync::RwLock<SyncManager>>,
    manifest_db: Arc<ManifestDb>,
    ignore_cache: Arc<IgnoreCache>,
) {
    tauri::async_runtime::spawn(async move {
        let mut watcher = match FolderWatcher::new(ignore_cache.clone()) {
            Ok(w) => w,
            Err(e) => {
                tracing::error!("Failed to initialize FolderWatcher: {:?}", e);
                return;
            }
        };

        let mut bonded_folders = Vec::new();
        // Watch all bounded folders on startup
        {
            let manager = sync_manager.read().await;
            for device in &manager.bonded_devices {
                for folder in &device.sync_folders {
                    let folder_path = std::path::Path::new(&folder.path);
                    bonded_folders.push(folder.path.clone());
                    
                    // 1. Perform State Verification Boot Sweep
                    let db_clone = manifest_db.clone();
                    let path_clone = folder_path.to_path_buf();
                    tokio::task::spawn_blocking(move || {
                        if let Err(e) = sync::boot_sweeper::BootSweeper::perform_sweep(&path_clone, db_clone) {
                            tracing::error!("Boot sweep failed for {}: {}", path_clone.display(), e);
                        }
                    });

                    // 2. Start Live OS Watching
                    if let Err(e) = watcher.watch(folder_path) {
                        tracing::error!("Failed to watch path {}: {:?}", folder.path, e);
                    } else {
                        tracing::info!("Started watching: {}", folder.path);
                    }
                }
            }
        }

        let bond_notify = {
            let manager = sync_manager.read().await;
            manager.get_bond_notify()
        };

        loop {
            tokio::select! {
                _ = bond_notify.notified() => {
                    let manager = sync_manager.read().await;
                    
                    // Collect the current set of all bonded folder paths
                    let mut current_folders: Vec<String> = Vec::new();
                    for device in &manager.bonded_devices {
                        for folder in &device.sync_folders {
                            current_folders.push(folder.path.clone());
                        }
                    }
                    
                    // Unwatch folders that have been removed (device unbonded)
                    bonded_folders.retain(|path| {
                        if !current_folders.contains(path) {
                            let folder_path = std::path::Path::new(path);
                            if let Err(e) = watcher.unwatch(folder_path) {
                                tracing::warn!("Failed to unwatch removed path {}: {:?}", path, e);
                            } else {
                                tracing::info!("Stopped watching unbonded folder: {}", path);
                            }
                            false // remove from bonded_folders
                        } else {
                            true // keep
                        }
                    });
                    
                    // Watch newly added folders
                    for folder_path_str in &current_folders {
                        if !bonded_folders.contains(folder_path_str) {
                            bonded_folders.push(folder_path_str.clone());
                            let folder_path = std::path::Path::new(folder_path_str);
                            let db_clone = manifest_db.clone();
                            let path_clone = folder_path.to_path_buf();
                            tokio::task::spawn_blocking(move || {
                                if let Err(e) = sync::boot_sweeper::BootSweeper::perform_sweep(&path_clone, db_clone) {
                                    tracing::error!("Dynamic boot sweep failed for {}: {}", path_clone.display(), e);
                                }
                            });
                            if let Err(e) = watcher.watch(folder_path) {
                                tracing::error!("Failed to watch newly bonded path {}: {:?}", folder_path_str, e);
                            } else {
                                tracing::info!("Dynamically started watching: {}", folder_path_str);
                            }
                        }
                    }
                }
                Some(event) = watcher.event_receiver.recv() => {
                    let bonded_folders = bonded_folders.clone();
                    
                    tokio::task::spawn_blocking(move || {
                        let (absolute_path, event_type, new_abs_path) = match &event {
                            SyncEvent::Created(path) => (path.clone(), "created", None),
                            SyncEvent::Modified(path) => (path.clone(), "modified", None),
                            SyncEvent::Deleted(path) => (path.clone(), "deleted", None),
                            SyncEvent::Renamed(old, new) => (old.clone(), "renamed", Some(new.clone())),
                        };

                        let file_name_str = absolute_path.file_name().unwrap_or_default().to_string_lossy();
                        // Ignore tmp files, internal sync artifacts
                        let is_tmp = file_name_str.contains(".sync.tmp") 
                            || file_name_str.starts_with("unconfirmed_transfer_") 
                            || file_name_str.ends_with(".send2me.secret")
                            || file_name_str.eq_ignore_ascii_case("desktop.ini")
                            || file_name_str.eq_ignore_ascii_case("thumbs.db")
                            || file_name_str.eq_ignore_ascii_case(".ds_store");
                        if is_tmp {
                            return;
                        }
                        if let Some(new_path) = &new_abs_path {
                            let new_name = new_path.file_name().unwrap_or_default().to_string_lossy();
                            let new_is_tmp = new_name.contains(".sync.tmp")
                                || new_name.starts_with("unconfirmed_transfer_")
                                || new_name.ends_with(".send2me.secret")
                                || new_name.eq_ignore_ascii_case("desktop.ini")
                                || new_name.eq_ignore_ascii_case("thumbs.db")
                                || new_name.eq_ignore_ascii_case(".ds_store");
                            if new_is_tmp {
                                return;
                            }
                        }

                        // Find matching folder
                        let mut matched_folder = None;
                        for folder in &bonded_folders {
                            if absolute_path.starts_with(folder) {
                                matched_folder = Some(folder.clone());
                                break;
                            }
                        }
                        
                        let folder_base = match matched_folder {
                            Some(f) => f,
                            None => return, // Not in a watched folder somehow
                        };

                        let relative_path = match absolute_path.strip_prefix(&folder_base) {
                            Ok(p) => p.to_string_lossy().replace('\\', "/"),
                            Err(_) => return,
                        };

                        if relative_path.is_empty() {
                            tracing::warn!("Root folder event detected, ignoring to prevent self-deletion or infinite loops");
                            // Re-ensure the folder exists with correct icons if it was deleted
                            if event_type == "deleted" {
                                crate::services::network_health_monitor::ensure_sync_folder_exists(std::path::Path::new(&folder_base));
                            }
                            return;
                        }

                        if let Some(tx) = crate::services::sync_state_manager::get_event_sender() {
                            let event = crate::services::sync_state_manager::FileEvent::LocalChange {
                                folder_base,
                                absolute_path: absolute_path.clone(),
                                event_type: event_type.to_string(),
                                new_abs_path: new_abs_path.clone(),
                            };
                            if let Err(e) = tx.try_send(event) {
                                tracing::error!("Failed to route event to SyncStateManager: {}", e);
                            }
                        } else {
                            tracing::error!("SyncStateManager not initialized!");
                        }
                    });
                }
            }
        }
    });
}
