use serde::Serialize;
use tauri::{AppHandle, Manager, Emitter};
use std::sync::Arc;
use tokio::sync::RwLock;

mod services;
use services::device_service::*;
use services::transfer_service::*;
use services::history_service::*;
use services::settings_service::*;
use services::sync_service::*;
use services::hardware_monitor::get_hardware_snapshot;

use network::network_manager::NetworkManager;
use network::discovery::{Discovery, DiscoveryBeacon};
use transfer::transfer_manager::TransferManager;
use transfer::history::HistoryManager;

type TransferPromptMap = std::collections::HashMap<String, tokio::sync::oneshot::Sender<(bool, Option<String>)>>;

pub struct AppState {
    pub network_manager: Arc<network::network_manager::NetworkManager>,
    pub peer_registry: network::discovery::PeerRegistry,
    pub transfer_manager: Arc<transfer::transfer_manager::TransferManager>,
    pub history_manager: Arc<tokio::sync::RwLock<transfer::history::HistoryManager>>,
    pub transfer_prompts: Arc<tokio::sync::Mutex<TransferPromptMap>>,
    pub cached_settings: Arc<tokio::sync::RwLock<services::settings_service::AppSettings>>,
    pub sync_manager: Arc<tokio::sync::RwLock<sync::manager::SyncManager>>,
    pub manifest_db: Arc<sync::manifest::ManifestDb>,
    pub ignore_cache: Arc<sync::watcher::IgnoreCache>,
    pub discovery_shutdown: std::sync::Arc<tokio::sync::Notify>,
}

#[derive(Serialize)]
struct AppInfo {
    name: String,
    version: String,
    os: String,
    arch: String,
}

#[tauri::command]
fn get_app_info(app: AppHandle) -> AppInfo {
    let package_info = app.package_info();
    AppInfo {
        name: package_info.name.clone(),
        version: package_info.version.to_string(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
    }
}

pub fn setup_tray(app: &AppHandle) -> Result<(), String> {
    use tauri::tray::{TrayIconBuilder, TrayIconEvent};
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
    use tauri::{Manager, Emitter};

    if app.tray_by_id("main-tray").is_some() {
        return Ok(());
    }

    let open_i = MenuItem::with_id(app, "open", "Open Send2Me Dashboard", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let sync_i = MenuItem::with_id(app, "sync", "Folder Sync Console", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let transfers_i = MenuItem::with_id(app, "transfers", "Active Transfers", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let history_i = MenuItem::with_id(app, "history", "Transfer History & Logs", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let sep1 = PredefinedMenuItem::separator(app)
        .map_err(|e| e.to_string())?;
    let devices_i = MenuItem::with_id(app, "devices", "Bonded Devices", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let settings_i = MenuItem::with_id(app, "settings", "App Settings", true, None::<&str>)
        .map_err(|e| e.to_string())?;

    let menu = Menu::with_items(app, &[&open_i, &sync_i, &transfers_i, &history_i, &sep1, &devices_i, &settings_i])
        .map_err(|e| e.to_string())?;

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .tooltip("Send2Me - Folder Sync & Transfer Daemon")
        .menu(&menu);

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    builder
        .on_menu_event(|app, event| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
                let target = match event.id.as_ref() {
                    "open" => "/",
                    "sync" => "/sync",
                    "transfers" => "/transfers",
                    "history" => "/history",
                    "devices" => "/devices",
                    "settings" => "/settings",
                    _ => "/",
                };
                let _ = window.emit("tray-navigate", target);
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, .. } = event {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn activate_background_daemon(app: AppHandle) -> Result<(), String> {
    setup_tray(&app)
}

#[tauri::command]
fn get_network_status(state: tauri::State<AppState>) -> bool {
    // A node_id is only available once the iroh endpoint is up; use it as the liveness signal.
    !state.network_manager.node_id().to_string().is_empty()
}

#[tauri::command]
async fn get_peers(state: tauri::State<'_, AppState>) -> Result<Vec<network::discovery::DiscoveryBeacon>, String> {
    let registry = state.peer_registry.read().await;
    Ok(registry.values().map(|(b, _)| b.clone()).collect())
}

#[tauri::command]
async fn respond_to_transfer(id: String, accept: bool, custom_path: Option<String>, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut prompts = state.transfer_prompts.lock().await;
    if let Some(tx) = prompts.remove(&id) {
        let _ = tx.send((accept, custom_path));
    }
    Ok(())
}

#[tauri::command]
fn check_firewall_permission() -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let exe_name = std::env::current_exe()
            .map(|p| p.file_name().unwrap_or_default().to_string_lossy().into_owned())
            .unwrap_or_else(|_| "desktop.exe".to_string());
            
        let output = std::process::Command::new("netsh")
            .args(["advfirewall", "firewall", "show", "rule", &format!("name={}", exe_name)])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output();
            
        if let Ok(output) = output {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if stdout.contains("Action:                               Allow") {
                return true;
            }
        }
        
        // Check "Send2Me" as well just in case
        let output_alt = std::process::Command::new("netsh")
            .args(["advfirewall", "firewall", "show", "rule", "name=Send2Me"])
            .creation_flags(0x08000000)
            .output();
            
        if let Ok(output) = output_alt {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if stdout.contains("Action:                               Allow") {
                return true;
            }
        }
        
        false
    }
    #[cfg(not(target_os = "windows"))]
    {
        true
    }
}

#[tauri::command]
fn open_firewall_settings() {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("control")
            .args(["firewall.cpl"])
            .creation_flags(0x08000000)
            .spawn();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            tracing_subscriber::fmt()
                .with_max_level(tracing::Level::INFO)
                .init();
            
            let (tx, rx) = std::sync::mpsc::channel();

            tauri::async_runtime::spawn(async move {
                let suffix = std::env::var("SEND2ME_APP_DIR_SUFFIX").unwrap_or_default();
                let is_gaurav = std::env::var("COMPUTERNAME").unwrap_or_default() == "GAURAV";

                let pairing_code = if is_gaurav && suffix.is_empty() {
                    "5737".to_string()
                } else {
                    let mut hardware_id = String::new();
                    
                    #[cfg(target_os = "windows")]
                    {
                        use winreg::enums::*;
                        use winreg::RegKey;
                        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
                        if let Ok(crypto_key) = hklm.open_subkey_with_flags("SOFTWARE\\Microsoft\\Cryptography", KEY_READ) {
                            if let Ok(guid) = crypto_key.get_value::<String, _>("MachineGuid") {
                                hardware_id = guid;
                            }
                        }
                    }
                    
                    if hardware_id.is_empty() {
                        hardware_id = format!("{}-{}", 
                            std::env::var("COMPUTERNAME").unwrap_or_else(|_| "Unknown".to_string()),
                            std::env::var("USERNAME").unwrap_or_else(|_| "User".to_string())
                        );
                    }
                    
                    hardware_id.push_str(&suffix);
                    
                    let hash = blake3::hash(hardware_id.as_bytes());
                    let hex = hash.to_hex();
                    hex[0..4].to_uppercase()
                };

                match NetworkManager::new(pairing_code).await {
                    Ok(nm) => { let _ = tx.send(Ok(nm)); },
                    Err(e) => { let _ = tx.send(Err(e)); },
                }
            });

            let network_manager = match rx.recv() {
                Ok(Ok(nm)) => Arc::new(nm),
                Ok(Err(e)) => return Err(format!("Failed to start network manager: {}", e).into()),
                Err(e) => return Err(format!("Network manager task failed: {}", e).into()),
            };
            let peer_registry = Arc::new(RwLock::new(std::collections::HashMap::new()));
            let transfer_manager = Arc::new(TransferManager::new());
            let history_manager = Arc::new(RwLock::new(HistoryManager::new()));
            let transfer_prompts = Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new()));
            
            let cached_settings = Arc::new(RwLock::new(services::settings_service::get_settings()));
            let sync_manager = Arc::new(tokio::sync::RwLock::new(sync::manager::SyncManager::new()));
            
            let db_path = {
                let mut path = dirs::config_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
                let suffix = std::env::var("SEND2ME_APP_DIR_SUFFIX").unwrap_or_default();
                path.push(format!("send2me{}", suffix));
                let _ = std::fs::create_dir_all(&path);
                path.push("manifest.db");
                path
            };
            let manifest_db = Arc::new(sync::manifest::ManifestDb::new(db_path).map_err(|e| format!("Failed to init ManifestDb: {}", e))?);
            
            let ignore_cache = Arc::new(sync::watcher::IgnoreCache::new());
            let discovery_shutdown = std::sync::Arc::new(tokio::sync::Notify::new());

            let drive_db_path = {
                let mut path = dirs::config_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
                let suffix = std::env::var("SEND2ME_APP_DIR_SUFFIX").unwrap_or_default();
                path.push(format!("send2me{}", suffix));
                let _ = std::fs::create_dir_all(&path);
                path.push("drive.db");
                path
            };
            let (drive_tx, mut drive_rx) = tokio::sync::mpsc::unbounded_channel();
            let drive_manager = Arc::new(p2p_drive::DriveManager::new(drive_db_path, drive_tx).map_err(|e| format!("Failed to init DriveManager: {}", e))?);
            
            // Spawn the event loop for Drive events
            let app_handle_clone = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                while let Some(event) = drive_rx.recv().await {
                    let _ = app_handle_clone.emit("p2p-drive-event", event);
                }
            });

            let state = AppState {
                network_manager: network_manager.clone(),
                peer_registry: peer_registry.clone(),
                transfer_manager: transfer_manager.clone(),
                history_manager: history_manager.clone(),
                transfer_prompts: transfer_prompts.clone(),
                cached_settings: cached_settings.clone(),
                sync_manager: sync_manager.clone(),
                manifest_db: manifest_db.clone(),
                ignore_cache: ignore_cache.clone(),
                discovery_shutdown: discovery_shutdown.clone(),
            };
            
            app.manage(state);
            app.manage(services::p2p_drive_service::DriveStateContainer(drive_manager.clone()));
            let _ = setup_tray(app.handle());

            // Start the Sync State Manager (The "Sync Brain")
            services::sync_state_manager::start_sync_state_manager(manifest_db.clone(), app.handle().clone());

            // Start the folder watcher daemon for real-time background syncing
            services::folder_watcher_service::spawn(app.handle().clone(), sync_manager.clone(), manifest_db.clone(), ignore_cache.clone());
            
            // Start the recovery engine for stale sync intents
            {
                let db_for_recovery = manifest_db.clone();
                tauri::async_runtime::spawn(async move {
                    sync::recovery::RecoveryEngine::run(db_for_recovery).await;
                });
            }
            
            // Start the sync queue engine worker to transmit queued changes over Iroh QUIC
            services::sync_queue_service::spawn(app.handle().clone(), network_manager.clone(), sync_manager.clone(), manifest_db.clone());

            // Start the continuous hardware/lag monitor. It runs for the lifetime
            // of the app and emits `hardware-lag` events with a structured payload
            // the frontend consumes to show CPU/RAM pressure and warnings.
            let _lag_shutdown = services::hardware_monitor::spawn(app.handle().clone());

            // Aggressive startup cleanup: any *.unconfirmed.send2me.tmp file
            // that survived a previous process exit is orphaned by definition.
            {
                let cs = cached_settings.clone();
                tauri::async_runtime::spawn(async move {
                    let dir = cs.read().await.downloads_folder.clone();
                    services::receiver::startup_sweep(&dir).await;
                });
            }

            // Periodic sweep guarded by the active-transfer registry.
            services::orphan_sweeper::spawn(cached_settings.clone(), transfer_manager.registry());
            
            // Continuous Pipeline maintainer for bonded devices
            services::pipeline_maintainer::spawn(sync_manager.clone(), network_manager.clone());
            
            // Continuous Live Status Monitor
            services::network_health_monitor::spawn(app.handle().clone(), sync_manager.clone(), network_manager.clone());

            let hostname_env = std::env::var("COMPUTERNAME")
                .unwrap_or_else(|_| std::env::var("HOSTNAME").unwrap_or_else(|_| "This PC".into()));

            // Start local UDP discovery beacon
            let beacon = DiscoveryBeacon {
                node_id: network_manager.node_id().to_string(),
                pairing_code: network_manager.pairing_code.clone(),
                hostname: hostname_env,
                os: std::env::consts::OS.into(),
                device_type: "desktop".into(),
            };
            
            let beacon_shutdown = discovery_shutdown.clone();
            tauri::async_runtime::spawn(async move {
                match Discovery::start_broadcasting(beacon, beacon_shutdown).await {
                    Ok(_handle) => {},
                    Err(e) => tracing::error!("Discovery broadcast setup failed: {}", e),
                }
            });

            let peer_registry_clone = peer_registry.clone();
            let listen_shutdown = discovery_shutdown.clone();
            tauri::async_runtime::spawn(async move {
                match Discovery::start_listening(peer_registry_clone, listen_shutdown).await {
                    Ok(_handle) => {},
                    Err(e) => tracing::error!("Discovery listen setup failed: {}", e),
                }
            });

            let network_manager_clone = network_manager.clone();
            let app_handle = app.handle().clone();
            let transfer_manager_clone = transfer_manager.clone();
            let history_manager_state = history_manager.clone();
            let cached_settings_clone = cached_settings.clone();
            let sync_manager_clone = sync_manager.clone();
            let manifest_db_clone = manifest_db.clone();
            let ignore_cache_clone = ignore_cache.clone();
            
            tauri::async_runtime::spawn(async move {
                while let Some(incoming) = network_manager_clone.accept().await {
                    let app_handle_clone = app_handle.clone();
                    let transfer_manager_inner = transfer_manager_clone.clone();
                    let history_manager = history_manager_state.clone();
                    let cached_settings_conn = cached_settings_clone.clone();
                    let sync_manager_conn = sync_manager_clone.clone();
                    let manifest_db_conn = manifest_db_clone.clone();
                    let ignore_cache_conn = ignore_cache_clone.clone();
                    let drive_manager_clone = drive_manager.clone();
                    
                    tauri::async_runtime::spawn(async move {
                        #[allow(deprecated)]
                        if let Ok(mut connecting) = incoming.accept() {
                            #[allow(deprecated)]
                            let alpn = connecting.alpn().await.unwrap_or_default();
                            
                            if let Ok(connection) = connecting.await {
                                if alpn == b"send2me-drive/1" {
                                    services::p2p_drive_service::handle_incoming_connection(
                                        connection,
                                        app_handle_clone,
                                        drive_manager_clone,
                                    ).await;
                                } else if alpn == b"send2me-sync/1" {
                                    services::sync_receiver_service::handle_incoming_connection(
                                        connection,
                                        app_handle_clone,
                                        sync_manager_conn,
                                        manifest_db_conn,
                                        ignore_cache_conn,
                                    ).await;
                                } else {
                                    services::receiver::handle_incoming_connection(
                                        connection,
                                        app_handle_clone,
                                        transfer_manager_inner.registry(),
                                        history_manager,
                                        cached_settings_conn,
                                    )
                                    .await;
                                }
                            }
                        }
                    });
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_info,
            activate_background_daemon,
            get_local_device,
            get_trusted_devices,
            scan_nearby_devices,
            pair_device,
            delete_trusted_device,
            start_transfer,
            get_active_transfers,
            cancel_transfer,
            pause_transfer,
            get_transfer_history,
            clear_history,
            get_settings_cached,
            update_settings,
            get_network_status,
            get_peers,
            respond_to_transfer,
            check_firewall_permission,
            open_firewall_settings,
            get_hardware_snapshot,
            send_bind_request,
            respond_to_bind_request,
            finalize_bind_request,
            get_bonded_devices,
            remove_bonded_device,
            services::sync_service::get_action_history,
            services::sync_service::get_sync_queue,
            services::sync_service::test_sync_bridge,
            services::p2p_drive_service::start_drive_room,
            services::p2p_drive_service::close_drive_room,
            services::p2p_drive_service::add_virtual_file,
            services::p2p_drive_service::remove_virtual_file,
            services::p2p_drive_service::join_drive_room,
            services::p2p_drive_service::request_download,
            services::p2p_drive_service::request_upload,
            services::p2p_drive_service::approve_request,
            services::p2p_drive_service::deny_request,
            services::p2p_drive_service::kick_guest
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // If the background daemon tray exists, hide window instead of closing
                if window.app_handle().tray_by_id("main-tray").is_some() {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

