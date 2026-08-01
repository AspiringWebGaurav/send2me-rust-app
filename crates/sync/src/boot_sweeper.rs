use std::path::Path;
use std::sync::Arc;
use chrono::Utc;
use uuid::Uuid;
use crate::manifest::{ManifestDb, FileRecord, QueueRecord};
use std::collections::HashMap;

pub struct BootSweeper;

impl BootSweeper {
    pub fn perform_sweep(folder_path: &Path, db: Arc<ManifestDb>) -> std::io::Result<()> {
        let folder_base = folder_path.to_string_lossy().to_string();
        
        let folder_id = match db.upsert_folder(&folder_base, "bonded") {
            Ok(id) => id,
            Err(e) => {
                tracing::error!("BootSweeper failed to resolve folder_id: {}", e);
                return Err(std::io::Error::other(e.to_string()));
            }
        };

        // Get all active files from DB
        let active_files = match db.get_all_active_files(folder_id) {
            Ok(files) => files,
            Err(e) => {
                tracing::error!("BootSweeper failed to get active files: {}", e);
                return Err(std::io::Error::other(e.to_string()));
            }
        };
        
        let mut db_files: HashMap<String, FileRecord> = HashMap::new();
        for file in active_files {
            db_files.insert(file.relative_path.clone(), file);
        }

        let mut dirs_to_visit = vec![folder_path.to_path_buf()];
        let mut disk_files_visited = std::collections::HashSet::new();

        while let Some(current_dir) = dirs_to_visit.pop() {
            if !current_dir.exists() || !current_dir.is_dir() {
                continue;
            }

            let entries = match std::fs::read_dir(&current_dir) {
                Ok(e) => e,
                Err(_) => continue,
            };

            for entry in entries.flatten() {
                let file_name = entry.file_name();
                if file_name == "desktop.ini" || file_name == ".sync_trash" {
                    continue;
                }
                // Skip temporary sync files
                let file_name_str = file_name.to_string_lossy();
                if file_name_str.starts_with(".sync.tmp.") {
                    continue;
                }
                if file_name_str.starts_with("unconfirmed_transfer_") || file_name_str.ends_with(".send2me.secret") {
                    continue;
                }

                let path = entry.path();
                let relative_path = match path.strip_prefix(folder_path) {
                    Ok(p) => p.to_string_lossy().replace('\\', "/"),
                    Err(_) => continue,
                };

                if let Ok(meta) = entry.metadata() {
                    if meta.is_dir() {
                        dirs_to_visit.push(path);
                    } else {
                        disk_files_visited.insert(relative_path.clone());
                        let size = meta.len();

                        let mut calculated_hash = None;
                        let mut intent = None;
                        let mut existing_record = None;

                        if let Some(record) = db_files.get(&relative_path) {
                            // File is in DB and on Disk. Check size.
                            if record.size != size {
                                intent = Some("Modify");
                            } else {
                                // Size matches, calculate Blake3 hash to be sure
                                if let Ok(hash) = calculate_blake3(&path) {
                                    calculated_hash = Some(hash.clone());
                                    if record.blake3_hash.as_deref() != Some(hash.as_str()) {
                                        intent = Some("Modify");
                                    }
                                }
                            }
                            existing_record = Some(record.clone());
                        } else {
                            // File is on disk but NOT in DB. It's a Create.
                            intent = Some("Create");
                        }

                        if let Some(intent_str) = intent {
                            tracing::info!("BootSweeper detected {} for {}", intent_str, relative_path);
                            
                            let file_id = existing_record.as_ref().map(|r| r.id.clone()).unwrap_or_else(|| Uuid::new_v4().to_string());
                            let revision = existing_record.as_ref().map(|r| r.revision + 1).unwrap_or(1);
                            
                            let blake3_hash = calculated_hash.or_else(|| calculate_blake3(&path).ok());
                            
                            let file_record = FileRecord {
                                id: file_id.clone(),
                                folder_id,
                                relative_path: relative_path.clone(),
                                blake3_hash,
                                revision,
                                size,
                                is_deleted: false,
                            };
                            
                            if let Err(e) = db.upsert_file(&file_record) {
                                tracing::error!("BootSweeper failed to upsert file {}: {}", relative_path, e);
                                continue;
                            }

                            let queue_record = QueueRecord {
                                op_id: Uuid::new_v4().to_string(),
                                intent: intent_str.to_string(),
                                file_id,
                                target_device_id: None,
                                status: "Pending".to_string(),
                                retry_count: 0,
                                next_retry_at: Utc::now().timestamp(),
                            };
                            if let Err(e) = db.enqueue_intent(&queue_record) {
                                tracing::error!("BootSweeper failed to enqueue intent for {}: {}", relative_path, e);
                            }
                        }
                    }
                }
            }
        }

        // Now check for files in DB that are NO LONGER on disk (Deletes)
        for (rel_path, record) in db_files {
            if !disk_files_visited.contains(&rel_path) {
                tracing::info!("BootSweeper detected Delete for {}", rel_path);
                
                let revision = record.revision + 1;
                let file_record = FileRecord {
                    id: record.id.clone(),
                    folder_id,
                    relative_path: rel_path.clone(),
                    blake3_hash: None,
                    revision,
                    size: 0,
                    is_deleted: true,
                };
                if let Err(e) = db.upsert_file(&file_record) {
                    tracing::error!("BootSweeper failed to upsert delete for {}: {}", rel_path, e);
                    continue;
                }

                let queue_record = QueueRecord {
                    op_id: Uuid::new_v4().to_string(),
                    intent: "Delete".to_string(),
                    file_id: record.id,
                    target_device_id: None,
                    status: "Pending".to_string(),
                    retry_count: 0,
                    next_retry_at: Utc::now().timestamp(),
                };
                if let Err(e) = db.enqueue_intent(&queue_record) {
                    tracing::error!("BootSweeper failed to enqueue delete for {}: {}", rel_path, e);
                }
            }
        }

        Ok(())
    }
}

fn calculate_blake3(path: &Path) -> std::io::Result<String> {
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
