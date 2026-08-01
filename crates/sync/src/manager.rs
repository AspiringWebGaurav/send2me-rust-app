use serde::{Serialize, Deserialize};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Notify;
use chrono::Utc;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SyncFolder {
    pub id: String,
    pub path: String,
    pub status: String,
    pub last_synced: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct BondedDevice {
    pub node_id: String,
    pub device_name: String,
    pub os: String,
    pub date_bonded: String,
    pub sync_folders: Vec<SyncFolder>,
}

pub struct SyncManager {
    pub bonded_devices: Vec<BondedDevice>,
    bond_notify: Arc<Notify>,
}

impl Default for SyncManager {
    fn default() -> Self {
        Self::new()
    }
}

impl SyncManager {
    pub fn new() -> Self {
        let path = Self::sync_path();
        let bonded_devices = if path.exists() {
            if let Ok(data) = std::fs::read_to_string(&path) {
                serde_json::from_str::<Vec<BondedDevice>>(&data).unwrap_or_default()
            } else {
                Vec::new()
            }
        } else {
            Vec::new()
        };
        Self { bonded_devices, bond_notify: Arc::new(Notify::new()) }
    }
    
    pub fn get_bond_notify(&self) -> Arc<Notify> {
        self.bond_notify.clone()
    }
    
    fn sync_path() -> PathBuf {
        let mut path = dirs::config_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
        let suffix = std::env::var("SEND2ME_APP_DIR_SUFFIX").unwrap_or_default();
        path.push(format!("send2me{}", suffix));
        std::fs::create_dir_all(&path).unwrap_or_default();
        path.push("sync.json");
        path
    }
    
    pub fn save(&self) {
        let path = Self::sync_path();
        if let Ok(data) = serde_json::to_string_pretty(&self.bonded_devices) {
            let _ = std::fs::write(&path, data);
        }
    }

    pub fn add_bonded_device(&mut self, node_id: String, device_name: String, os: String) {
        if !self.bonded_devices.iter().any(|d| d.node_id == node_id) {
            let mut sync_folders = Vec::new();
            
            if let Some(mut dl_dir) = dirs::download_dir() {
                #[cfg(debug_assertions)]
                let folder_name = {
                    let suffix = std::env::var("SEND2ME_APP_DIR_SUFFIX").unwrap_or_default();
                    if suffix.is_empty() { "sync1" } else { "sync2" }
                };
                
                #[cfg(not(debug_assertions))]
                let folder_name = "send2me-sync";

                dl_dir.push(folder_name);
                if std::fs::create_dir_all(&dl_dir).is_ok() {
                    #[cfg(target_os = "windows")]
                    {
                        use std::os::windows::process::CommandExt;
                        let desktop_ini_path = dl_dir.join("desktop.ini");
                        let ini_content = "[.ShellClassInfo]\r\nIconResource=C:\\Windows\\System32\\shell32.dll,316\r\n";
                        let _ = std::fs::write(&desktop_ini_path, ini_content);
                        
                        let _ = std::process::Command::new("attrib")
                            .args(["+h", "+s", desktop_ini_path.to_str().unwrap_or_default()])
                            .creation_flags(0x08000000) // CREATE_NO_WINDOW
                            .status();
                            
                        let _ = std::process::Command::new("attrib")
                            .args(["+r", dl_dir.to_str().unwrap_or_default()])
                            .creation_flags(0x08000000) // CREATE_NO_WINDOW
                            .status();
                    }

                    sync_folders.push(SyncFolder {
                        id: uuid::Uuid::new_v4().to_string(),
                        path: dl_dir.to_string_lossy().to_string(),
                        status: "Idle".to_string(),
                        last_synced: None,
                    });
                }
            }

            self.bonded_devices.push(BondedDevice {
                node_id,
                device_name,
                os,
                date_bonded: Utc::now().to_rfc3339(),
                sync_folders,
            });
            self.save();
            self.bond_notify.notify_one();
        }
    }

    pub fn remove_bonded_device(&mut self, node_id: &str) {
        self.bonded_devices.retain(|d| d.node_id != node_id);
        self.save();
    }
}
