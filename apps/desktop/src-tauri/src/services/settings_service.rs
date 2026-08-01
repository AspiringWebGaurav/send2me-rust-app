use serde::{Deserialize, Serialize};
use tauri::State;
use crate::AppState;

#[derive(Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub theme: String,
    #[serde(rename = "downloadsFolder")]
    pub downloads_folder: String,
    #[serde(rename = "autoAcceptTransfers")]
    pub auto_accept_transfers: bool,
    #[serde(rename = "autoUpdate")]
    pub auto_update: bool,
    #[serde(rename = "animationsEnabled")]
    pub animations_enabled: bool,
    #[serde(rename = "notificationsEnabled")]
    pub notifications_enabled: bool,
    pub language: String,
    #[serde(rename = "startMinimized")]
    pub start_minimized: bool,
    #[serde(rename = "developerMode")]
    pub developer_mode: bool,
    #[serde(rename = "rgbMode")]
    pub rgb_mode: bool,

    // APTE Engine Settings
    #[serde(rename = "maxParallelConnections")]
    pub max_parallel_connections: usize,
    #[serde(rename = "transferEngineMode")]
    pub transfer_engine_mode: String,
    #[serde(rename = "autoResumeTransfers")]
    pub auto_resume_transfers: bool,
    #[serde(rename = "enableFolderSync")]
    pub enable_folder_sync: bool,
    #[serde(rename = "folderSyncInstalled")]
    pub folder_sync_installed: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "system".into(),
            downloads_folder: "~/Downloads".into(),
            auto_accept_transfers: false,
            auto_update: true,
            animations_enabled: true,
            notifications_enabled: true,
            language: "en".into(),
            start_minimized: false,
            developer_mode: false,
            rgb_mode: true,
            max_parallel_connections: 8,
            transfer_engine_mode: "balanced".into(),
            auto_resume_transfers: true,
            enable_folder_sync: false,
            folder_sync_installed: false,
        }
    }
}

fn settings_path() -> std::path::PathBuf {
    let mut path = dirs::config_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    let suffix = std::env::var("SEND2ME_APP_DIR_SUFFIX").unwrap_or_default();
    path.push(format!("send2me{}", suffix));
    std::fs::create_dir_all(&path).unwrap_or_default();
    path.push("settings.json");
    path
}

/// Read settings from disk — used only at startup to populate the cache.
pub fn get_settings() -> AppSettings {
    let path = settings_path();
    if path.exists() {
        if let Ok(data) = std::fs::read_to_string(&path) {
            if let Ok(settings) = serde_json::from_str::<AppSettings>(&data) {
                return settings;
            }
        }
    }
    AppSettings::default()
}

/// Tauri command: return the in-memory cached settings (no disk read).
#[tauri::command]
pub async fn get_settings_cached(state: State<'_, AppState>) -> Result<AppSettings, String> {
    Ok(state.cached_settings.read().await.clone())
}

/// Tauri command: write settings to disk and update the in-memory cache.
#[tauri::command]
pub async fn update_settings(settings: AppSettings, state: State<'_, AppState>) -> Result<(), String> {
    let path = settings_path();
    let data = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    *state.cached_settings.write().await = settings;
    Ok(())
}

