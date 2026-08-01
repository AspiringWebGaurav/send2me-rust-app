use anyhow::Result;
use iroh::net::endpoint::Connection;
use p2p_drive::DriveManager;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, State};

pub struct DriveStateContainer(pub Arc<DriveManager>);

pub async fn handle_incoming_connection(
    connection: Connection,
    _app_handle: AppHandle,
    drive_manager: Arc<DriveManager>,
) {
    drive_manager.handle_connection(connection).await;
}

#[tauri::command]
pub async fn start_drive_room(state: State<'_, DriveStateContainer>) -> Result<(), String> {
    state.0.start_room().await;
    Ok(())
}

#[tauri::command]
pub async fn close_drive_room(state: State<'_, DriveStateContainer>) -> Result<(), String> {
    state.0.close_room().await;
    Ok(())
}

#[tauri::command]
pub async fn add_virtual_file(
    absolute_path: String,
    state: State<'_, DriveStateContainer>,
) -> Result<p2p_drive::protocol::DriveFileMeta, String> {
    let path = PathBuf::from(absolute_path);
    state.0.add_virtual_file(path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_virtual_file(
    file_id: String,
    state: State<'_, DriveStateContainer>,
) -> Result<(), String> {
    state.0.remove_virtual_file(&file_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn approve_request(
    request_id: String,
    state: State<'_, DriveStateContainer>,
) -> Result<(), String> {
    use p2p_drive::DriveCommand;
    let st = state.0.state.read().await;
    
    // Find guest node ID for this request
    if let Some(req) = st.pending_requests.get(&request_id) {
        if let Some((_, sender)) = st.active_guests.get(&req.guest_node_id) {
            sender.send(DriveCommand::ApproveRequest(request_id)).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn deny_request(
    request_id: String,
    state: State<'_, DriveStateContainer>,
) -> Result<(), String> {
    use p2p_drive::DriveCommand;
    let st = state.0.state.read().await;
    
    // Find guest node ID for this request
    if let Some(req) = st.pending_requests.get(&request_id) {
        if let Some((_, sender)) = st.active_guests.get(&req.guest_node_id) {
            sender.send(DriveCommand::DenyRequest(request_id)).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn kick_guest(
    guest_node_id: String,
    state: State<'_, DriveStateContainer>,
) -> Result<(), String> {
    use p2p_drive::DriveCommand;
    let st = state.0.state.read().await;
    
    if let Some((_, sender)) = st.active_guests.get(&guest_node_id) {
        sender.send(DriveCommand::Kick).map_err(|e| e.to_string())?;
    }
    Ok(())
}


#[tauri::command]
pub async fn join_drive_room(
    pairing_code: String,
    state: tauri::State<'_, DriveStateContainer>,
    app_state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    // 1. Lookup the node_id from PeerRegistry
    let node_id_str = {
        let registry = app_state.peer_registry.read().await;
        if let Some((beacon, _)) = registry.get(&pairing_code) {
            beacon.node_id.clone()
        } else {
            return Err("Pairing code not found or expired".to_string());
        }
    };

    // 2. Connect via network manager
    let connection = app_state.network_manager.connect_drive(&node_id_str)
        .await
        .map_err(|e| e.to_string())?;

    // 3. Start guest session loop
    state.0.join_room(connection).await;

    Ok(())
}

#[tauri::command]
pub async fn request_download(
    file_id: String,
    state: tauri::State<'_, DriveStateContainer>,
) -> Result<(), String> {
    use p2p_drive::DriveCommand;
    let st = state.0.state.read().await;
    
    if let Some(tx) = &st.host_cmd_tx {
        tx.send(DriveCommand::RequestDownload(file_id)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn request_upload(
    file_path: String,
    state: tauri::State<'_, DriveStateContainer>,
) -> Result<(), String> {
    use p2p_drive::DriveCommand;
    let st = state.0.state.read().await;
    
    if let Some(tx) = &st.host_cmd_tx {
        tx.send(DriveCommand::RequestUpload(PathBuf::from(file_path))).map_err(|e| e.to_string())?;
    }
    Ok(())
}
