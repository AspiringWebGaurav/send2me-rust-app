use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce, Key
};

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

fn get_encryption_key() -> Key<Aes256Gcm> {
    let salt = obfstr::obfstr!("SEND2ME_SECURE_ENCRYPTION_KEY_V2_8A9B2C4D").to_string();
    let hash = blake3::hash(salt.as_bytes());
    *Key::<Aes256Gcm>::from_slice(hash.as_bytes())
}

#[cfg(target_os = "windows")]
fn increment_tamper_strikes() -> u32 {
    use winreg::enums::*;
    use winreg::RegKey;
    
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = match hkcu.create_subkey("Software\\Send2Me") {
        Ok(k) => k,
        Err(_) => return 3, // Fail safe
    };
    
    let mut current: u32 = key.get_value("TamperStrikes").unwrap_or(0);
    current += 1;
    let _ = key.set_value("TamperStrikes", &current);
    current
}

#[cfg(not(target_os = "windows"))]
fn increment_tamper_strikes() -> u32 {
    3 // simplified fallback for non-windows
}

pub fn handle_tamper() -> SecurityState {
    if cfg!(debug_assertions) {
        tracing::warn!("Tamper detected, but ignoring because in DEV mode.");
        return SecurityState::default();
    }
    
    let suffix = std::env::var("SEND2ME_APP_DIR_SUFFIX").unwrap_or_default();
    if suffix == "-dev" {
         tracing::warn!("Tamper detected, but ignoring because of -dev suffix.");
         return SecurityState::default();
    }

    let strikes = increment_tamper_strikes();
    tracing::warn!("Tamper detected! Strike {}/3", strikes);
    
    if strikes >= 3 {
        return SecurityState {
            status: "banned".into(),
            last_online: 0,
        };
    }
    
    SecurityState::default()
}

/// Read the security state from disk with tamper-detection
pub fn get_security_state_internal() -> SecurityState {
    let path = security_path();
    if !path.exists() {
        return SecurityState::default();
    }

    let encrypted_data = match std::fs::read(&path) {
        Ok(c) => c,
        Err(_) => return SecurityState::default(),
    };

    if encrypted_data.is_empty() {
        // Prevent accidental bans from 0-byte corrupted files (e.g. power outage)
        return SecurityState::default();
    }
    
    // Check if it's the old plaintext JSON (legacy migration)
    if let Ok(content_str) = String::from_utf8(encrypted_data.clone()) {
        if content_str.starts_with('{') && content_str.contains("status") {
            if let Ok(legacy_state) = serde_json::from_str::<SecurityState>(&content_str) {
                 let _ = save_security_state_internal(&legacy_state);
                 return legacy_state;
            }
        }
        let parts: Vec<&str> = content_str.split('\n').collect();
        if parts.len() >= 2 {
            if let Ok(legacy_state) = serde_json::from_str::<SecurityState>(parts[0]) {
                 let _ = save_security_state_internal(&legacy_state);
                 return legacy_state;
            }
        }
    }

    if encrypted_data.len() <= 12 {
        // Tampered or corrupted file structure
        return handle_tamper();
    }

    let key = get_encryption_key();
    let cipher = Aes256Gcm::new(&key);
    
    let nonce = Nonce::from_slice(&encrypted_data[0..12]);
    let ciphertext = &encrypted_data[12..];
    
    let decrypted_bytes = match cipher.decrypt(nonce, ciphertext) {
        Ok(b) => b,
        Err(_) => {
            // Decryption failed = TAMPERED!
            return handle_tamper();
        }
    };
    
    let payload = String::from_utf8_lossy(&decrypted_bytes);
    serde_json::from_str::<SecurityState>(&payload).unwrap_or_else(|_| handle_tamper())
}

pub fn save_security_state_internal(state: &SecurityState) -> Result<(), String> {
    let path = security_path();
    let payload = serde_json::to_string(state).map_err(|e| e.to_string())?;
    
    let key = get_encryption_key();
    let cipher = Aes256Gcm::new(&key);
    
    // Generate 12 bytes of random data for the nonce using UUID
    let uuid_bytes = uuid::Uuid::new_v4();
    let nonce_bytes = &uuid_bytes.as_bytes()[0..12];
    let nonce = Nonce::from_slice(nonce_bytes);
    
    let ciphertext = cipher.encrypt(nonce, payload.as_bytes()).map_err(|e| e.to_string())?;
    
    let mut final_data = nonce.to_vec();
    final_data.extend_from_slice(&ciphertext);
    
    std::fs::write(&path, final_data).map_err(|e| e.to_string())?;
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
