use std::sync::Arc;
use tokio::time::{sleep, Duration};
use tauri::{AppHandle, Emitter};
use std::collections::HashMap;

pub fn ensure_sync_folder_exists(dl_dir: &std::path::Path) -> bool {
    if !dl_dir.exists() {
        let _ = std::fs::create_dir_all(dl_dir);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::ffi::OsStrExt;
            use windows_sys::Win32::Storage::FileSystem::{
                SetFileAttributesW, FILE_ATTRIBUTE_HIDDEN, FILE_ATTRIBUTE_READONLY, FILE_ATTRIBUTE_SYSTEM,
            };

            let desktop_ini_path = dl_dir.join("desktop.ini");
            let ini_content = "[.ShellClassInfo]\r\nIconResource=C:\\Windows\\System32\\imageres.dll,-104\r\n";
            let _ = std::fs::write(&desktop_ini_path, ini_content);

            let ini_w: Vec<u16> = desktop_ini_path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
            let dir_w: Vec<u16> = dl_dir.as_os_str().encode_wide().chain(std::iter::once(0)).collect();

            unsafe {
                SetFileAttributesW(ini_w.as_ptr(), FILE_ATTRIBUTE_HIDDEN | FILE_ATTRIBUTE_SYSTEM);
                SetFileAttributesW(dir_w.as_ptr(), FILE_ATTRIBUTE_READONLY);
            }
        }
        return true;
    }
    false
}

pub fn spawn(app: AppHandle, sync_manager: Arc<tokio::sync::RwLock<sync::manager::SyncManager>>, network_manager: Arc<network::network_manager::NetworkManager>) {
    tauri::async_runtime::spawn(async move {
        // Wait 5 seconds on startup before starting the polling loop
        sleep(Duration::from_secs(5)).await;
        
        loop {
            let mut status_map: HashMap<String, bool> = HashMap::new();
            
            // Acquire read lock on the bonded devices
            let bonded_devices = {
                let sm = sync_manager.read().await;
                sm.bonded_devices.clone()
            };
            
            let mut folder_status_map: HashMap<String, String> = HashMap::new();
            
            for device in bonded_devices {
                // Check Folder Existence and Auto-Recreate
                for folder in &device.sync_folders {
                    let dl_dir = std::path::Path::new(&folder.path);
                    
                    if ensure_sync_folder_exists(dl_dir) {
                        // Emit RECREATING so UI can briefly show it
                        folder_status_map.insert(folder.id.clone(), "RECREATING".to_string());
                    } else {
                        folder_status_map.insert(folder.id.clone(), "IDLE".to_string());
                    }
                }

                // Magicsock is extremely fast at determining connection state,
                // but we apply a strict 2-second timeout so offline devices don't hang the loop.
                let connect_future = network_manager.connect(&device.node_id);
                    match tokio::time::timeout(Duration::from_secs(2), connect_future).await {
                        Ok(Ok(_connection)) => {
                            // Connection successful
                            status_map.insert(device.node_id.clone(), true);
                        }
                        _ => {
                            // Timeout or connection error
                            status_map.insert(device.node_id.clone(), false);
                        }
                    }
            }
            
            // Emit the status map to the frontend
            let _ = app.emit("bonded-devices-status", status_map);
            let _ = app.emit("folder-health-status", folder_status_map);
            
            sleep(Duration::from_secs(10)).await;
        }
    });
}
