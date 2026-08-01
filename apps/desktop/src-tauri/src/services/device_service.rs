use serde::{Deserialize, Serialize};
use tauri::State;
use crate::AppState;
use chrono;

#[derive(Serialize, Deserialize, Clone)]
pub struct Device {
    pub id: String,
    pub name: String,
    pub os: String,
    #[serde(rename = "deviceType")]
    pub device_type: String,
    pub status: String,
    #[serde(rename = "lastSeen")]
    pub last_seen: Option<String>,
    #[serde(rename = "isTrusted")]
    pub is_trusted: bool,
    #[serde(rename = "pairingCode")]
    pub pairing_code: Option<String>,
}

fn local_hostname() -> String {
    sysinfo::System::host_name().unwrap_or_else(|| "This PC".into())
}

#[tauri::command]
pub fn get_local_device(state: State<'_, AppState>) -> Device {
    Device {
        id: state.network_manager.node_id().to_string(),
        name: local_hostname(),
        os: std::env::consts::OS.into(),
        device_type: "desktop".into(),
        status: "online".into(),
        last_seen: None,
        is_trusted: true,
        pairing_code: Some(state.network_manager.pairing_code.clone()),
    }
}

fn trusted_devices_path() -> std::path::PathBuf {
    let mut path = dirs::config_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    let suffix = std::env::var("SEND2ME_APP_DIR_SUFFIX").unwrap_or_default();
    path.push(format!("send2me{}", suffix));
    std::fs::create_dir_all(&path).unwrap_or_default();
    path.push("trusted_devices.json");
    path
}

#[tauri::command]
pub async fn get_trusted_devices(_state: State<'_, AppState>) -> Result<Vec<Device>, String> {
    let path = trusted_devices_path();
    if path.exists() {
        if let Ok(data) = std::fs::read_to_string(&path) {
            if let Ok(devices) = serde_json::from_str::<Vec<Device>>(&data) {
                return Ok(devices);
            }
        }
    }
    Ok(vec![])
}

pub fn add_trusted_device(device: Device) -> Result<(), String> {
    let path = trusted_devices_path();
    let mut devices = if path.exists() {
        if let Ok(data) = std::fs::read_to_string(&path) {
            serde_json::from_str::<Vec<Device>>(&data).unwrap_or_default()
        } else {
            vec![]
        }
    } else {
        vec![]
    };
    
    // Remove if already exists, then add updated
    devices.retain(|d| d.id != device.id);
    devices.push(device);
    
    let data = serde_json::to_string_pretty(&devices).map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn scan_nearby_devices(state: State<'_, AppState>) -> Result<Vec<Device>, String> {
    let registry = state.peer_registry.read().await;
    
    let devices: Vec<Device> = registry.values().map(|(beacon, seen_at)| {
        Device {
            id: beacon.node_id.clone(),
            name: beacon.hostname.clone(),
            os: beacon.os.clone(),
            device_type: beacon.device_type.clone(),
            status: "online".into(),
            last_seen: Some(format!("{}s ago", seen_at.elapsed().as_secs())),
            is_trusted: false,
            pairing_code: Some(beacon.pairing_code.clone()),
        }
    }).collect();
    
    Ok(devices)
}

#[tauri::command]
pub async fn delete_trusted_device(id: String) -> Result<(), String> {
    let path = trusted_devices_path();
    let mut devices = if path.exists() {
        if let Ok(data) = std::fs::read_to_string(&path) {
            serde_json::from_str::<Vec<Device>>(&data).unwrap_or_default()
        } else {
            vec![]
        }
    } else {
        vec![]
    };
    devices.retain(|d| d.id != id);
    let data = serde_json::to_string_pretty(&devices).map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn pair_device(id: String, state: State<'_, AppState>) -> Result<(), String> {
    // Resolve the pairing code to a node id via local registry first, then DHT.
    let registry = state.peer_registry.read().await;
    let beacon = registry.values().find(|(b, _)| {
        b.pairing_code.to_uppercase() == id.to_uppercase()
            || b.node_id == id
    }).map(|(b, _)| b.clone());
    drop(registry);

    let (node_id, hostname, os, device_type) = if let Some(b) = beacon {
        (b.node_id.clone(), b.hostname.clone(), b.os.clone(), b.device_type.clone())
    } else {
        let node_id = state.network_manager.resolve_code_mapping(&id).await
            .map(|n| n.to_string())
            .map_err(|e| format!("Device not found: {}", e))?;
        (node_id, format!("Device {}", id.to_uppercase()), "unknown".into(), "desktop".into())
    };

    add_trusted_device(Device {
        id: node_id,
        name: hostname,
        os,
        device_type,
        status: "offline".into(),
        last_seen: Some(chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()),
        is_trusted: true,
        pairing_code: Some(id.to_uppercase()),
    })
}


