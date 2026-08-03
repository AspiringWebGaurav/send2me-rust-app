use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone)]
pub struct SecurityState {
    pub status: String,
    pub last_online: i64,
}

impl Default for SecurityState {
    fn default() -> Self {
        Self {
            status: "active".into(),
            last_online: chrono::Utc::now().timestamp_millis(), 
        }
    }
}

fn security_path() -> PathBuf {
    let mut path = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    let suffix = std::env::var("SEND2ME_APP_DIR_SUFFIX").unwrap_or_default();
    path.push(format!("send2me{}", suffix));
    std::fs::create_dir_all(&path).unwrap_or_default();
    path.push("security.bin");
    path
}

fn get_salt() -> &'static str {
    "SEND2ME_SECURITY_SALT_V1_8A9B2C4D"
}

/// Read the security state from disk with tamper-detection
pub fn get_security_state_internal() -> SecurityState {
    let path = security_path();
    if !path.exists() {
        return SecurityState::default();
    }

    let content = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return SecurityState::default(),
    };

    let parts: Vec<&str> = content.split('\n').collect();
    if parts.len() != 2 {
        // Tampered or corrupted file structure
        return SecurityState {
            status: "banned".into(),
            last_online: 0,
        };
    }

    let payload = parts[0];
    let stored_hash = parts[1];

    let computed_hash = blake3::hash(format!("{}{}", payload, get_salt()).as_bytes()).to_hex();

    if computed_hash.to_string() != stored_hash {
        // TAMPERED! Instant ban lock.
        return SecurityState {
            status: "banned".into(),
            last_online: 0,
        };
    }

    serde_json::from_str::<SecurityState>(payload).unwrap_or(SecurityState::default())
}

pub fn save_security_state_internal(state: &SecurityState) -> Result<(), String> {
    let path = security_path();
    let payload = serde_json::to_string(state).map_err(|e| e.to_string())?;
    
    let computed_hash = blake3::hash(format!("{}{}", payload, get_salt()).as_bytes()).to_hex();
    let data = format!("{}\n{}", payload, computed_hash);
    
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_security_state() -> Result<SecurityState, String> {
    Ok(get_security_state_internal())
}

#[tauri::command]
pub fn update_security_state(status: String) -> Result<(), String> {
    let mut current = get_security_state_internal();
    current.status = status;
    save_security_state_internal(&current)
}

#[tauri::command]
pub fn ping_online() -> Result<(), String> {
    let mut current = get_security_state_internal();
    current.last_online = chrono::Utc::now().timestamp_millis();
    save_security_state_internal(&current)
}
