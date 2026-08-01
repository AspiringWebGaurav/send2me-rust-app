use crate::database::DriveDb;
use crate::state::{DriveState, SharedDriveState, VirtualFile};
use crate::protocol::{DriveFileMeta, DriveEvent, DriveMessage};
use anyhow::Result;
use iroh::net::endpoint::Connection;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::{RwLock, mpsc};

pub struct DriveManager {
    pub state: SharedDriveState,
    pub db: Arc<DriveDb>,
    pub tx: mpsc::UnboundedSender<DriveEvent>,
}

impl DriveManager {
    pub fn new(db_path: PathBuf, tx: mpsc::UnboundedSender<DriveEvent>) -> Result<Self> {
        let db = DriveDb::new(db_path)?;
        let state = Arc::new(RwLock::new(DriveState::new()));
        
        Ok(Self {
            state,
            db: Arc::new(db),
            tx,
        })
    }

    pub async fn start_room(&self) {
        let mut state = self.state.write().await;
        state.is_online = true;
    }

    pub async fn close_room(&self) {
        let mut state = self.state.write().await;
        state.is_online = false;
        
        // Disconnect all guests cleanly
        for (_, sender) in state.active_guests.values() {
            let _ = sender.send(crate::state::DriveCommand::Kick);
        }
        
        state.active_guests.clear();
        state.pending_requests.clear();
        // Keep files in the dropzone mapped, just take room offline
    }

    pub async fn add_virtual_file(&self, absolute_path: PathBuf) -> Result<DriveFileMeta> {
        let file_name = absolute_path.file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
            
        let metadata = tokio::fs::metadata(&absolute_path).await?;
        let size = metadata.len();
        let is_folder = metadata.is_dir();
        
        let file_id = uuid::Uuid::new_v4().to_string();
        
        let meta = DriveFileMeta {
            id: file_id.clone(),
            name: file_name,
            size,
            is_folder,
            added_at: chrono::Utc::now().timestamp(),
        };

        let mut state = self.state.write().await;
        state.files.insert(file_id.clone(), VirtualFile {
            meta: meta.clone(),
            absolute_path,
        });

        for (_, sender) in state.active_guests.values() {
            let _ = sender.send(crate::state::DriveCommand::RefreshFiles);
        }

        Ok(meta)
    }

    pub async fn remove_virtual_file(&self, file_id: &str) -> Result<()> {
        let mut state = self.state.write().await;
        state.files.remove(file_id);
        
        for (_, sender) in state.active_guests.values() {
            let _ = sender.send(crate::state::DriveCommand::RefreshFiles);
        }
        
        Ok(())
    }

    pub async fn handle_connection(&self, connection: Connection) {
        tracing::info!("P2P Drive received a connection from {:?}", connection.remote_address());
        
        let is_online = self.state.read().await.is_online;
        if !is_online {
            tracing::warn!("Rejecting P2P Drive connection: Room is offline");
            return;
        }
        
        // Hand connection over to a session task
        let state_clone = self.state.clone();
        let tx = self.tx.clone();
        tokio::spawn(async move {
            if let Err(e) = Self::session_loop(connection, state_clone, tx).await {
                tracing::error!("P2P Drive session error: {}", e);
            }
        });
    }

    async fn session_loop(connection: Connection, state: SharedDriveState, tx: mpsc::UnboundedSender<DriveEvent>) -> Result<()> {
        let (mut send, mut recv) = connection.accept_bi().await?;
        
        let remote_addr = connection.remote_address().to_string();
        let (cmd_tx, mut cmd_rx) = tokio::sync::mpsc::unbounded_channel();
        
        {
            let mut st = state.write().await;
            st.active_guests.insert(remote_addr.clone(), ("Guest Device".to_string(), cmd_tx));
        }
        
        tx.send(DriveEvent::GuestConnected {
            node_id: remote_addr.clone(),
            name: "Guest Device".to_string(),
        }).ok();

        // Background task to accept incoming files (Uploads from guest)
        let dl_dir = dirs::download_dir().unwrap_or_else(|| PathBuf::from("."));
        let conn_clone = connection.clone();
        let tx_clone_for_engine = tx.clone();
        tokio::spawn(async move {
            let _ = crate::engine::DriveEngine::accept_incoming_files(conn_clone, dl_dir, tx_clone_for_engine).await;
        });

        loop {
            tokio::select! {
                // 1. Listen for commands from the Host (via Tauri UI)
                cmd = cmd_rx.recv() => {
                    if let Some(c) = cmd {
                        use crate::state::DriveCommand;
                        match c {
                            DriveCommand::ApproveRequest(req_id) => {
                                // Find request
                                let st = state.read().await;
                                if let Some(req) = st.pending_requests.get(&req_id) {
                                    if req.request_type == "Download" {
                                        if let Some(file_id) = &req.target_file_id {
                                            if let Some(vfile) = st.files.get(file_id) {
                                                let abs_path = vfile.absolute_path.clone();
                                                let file_name = vfile.meta.name.clone();
                                                let conn = connection.clone();
                                                let r_id = req_id.clone();
                                                let tx_clone = tx.clone();
                                                tokio::spawn(async move {
                                                    let _ = crate::engine::DriveEngine::send_file_to_guest(&conn, r_id, abs_path).await;
                                                    let _ = tx_clone.send(crate::protocol::DriveEvent::TransferCompleted {
                                                        file_name,
                                                        is_upload: true, // from Host perspective, Host is uploading to Guest
                                                    });
                                                });
                                            }
                                        }
                                    }
                                    // Send approve message back
                                    let msg = DriveMessage::RequestDecision { request_id: req_id.clone(), approved: true };
                                    if let Ok(bytes) = serde_json::to_vec(&msg) {
                                        let _ = send.write_all(&(bytes.len() as u32).to_be_bytes()).await;
                                        let _ = send.write_all(&bytes).await;
                                    }
                                }
                            }
                            DriveCommand::DenyRequest(req_id) => {
                                let msg = DriveMessage::RequestDecision { request_id: req_id.clone(), approved: false };
                                if let Ok(bytes) = serde_json::to_vec(&msg) {
                                    let _ = send.write_all(&(bytes.len() as u32).to_be_bytes()).await;
                                    let _ = send.write_all(&bytes).await;
                                }
                            }
                            DriveCommand::Kick => {
                                break;
                            }
                            DriveCommand::RefreshFiles => {
                                let st = state.read().await;
                                let files: Vec<_> = st.files.values().map(|v| v.meta.clone()).collect();
                                let resp = DriveMessage::ListResponse { files };
                                if let Ok(resp_bytes) = serde_json::to_vec(&resp) {
                                    let _ = send.write_all(&(resp_bytes.len() as u32).to_be_bytes()).await;
                                    let _ = send.write_all(&resp_bytes).await;
                                }
                            }
                            DriveCommand::RequestDownload(_) | DriveCommand::RequestUpload(_) => {
                                // Guest only command, ignore here
                            }
                        }
                    } else {
                        break;
                    }
                }
                
                // 2. Listen for messages from the Guest (over network)
                result = async {
                    let mut len_buf = [0u8; 4];
                    recv.read_exact(&mut len_buf).await?;
                    let len = u32::from_be_bytes(len_buf) as usize;
                    let mut payload = vec![0u8; len];
                    recv.read_exact(&mut payload).await?;
                    Ok::<Vec<u8>, anyhow::Error>(payload)
                } => {
                    match result {
                        Ok(payload) => {
                            if let Ok(msg) = serde_json::from_slice::<DriveMessage>(&payload) {
                                match msg {
                                    DriveMessage::ListRequest => {
                                        let st = state.read().await;
                                        let files: Vec<_> = st.files.values().map(|v| v.meta.clone()).collect();
                                        let resp = DriveMessage::ListResponse { files };
                                        if let Ok(resp_bytes) = serde_json::to_vec(&resp) {
                                            let _ = send.write_all(&(resp_bytes.len() as u32).to_be_bytes()).await;
                                            let _ = send.write_all(&resp_bytes).await;
                                        }
                                    }
                                    DriveMessage::DownloadRequest { request_id, file_id } => {
                                        let mut st = state.write().await;
                                        let (file_name, file_size) = if let Some(vfile) = st.files.get(&file_id) {
                                            (vfile.meta.name.clone(), vfile.meta.size)
                                        } else {
                                            tracing::warn!("Host received DownloadRequest for unknown file_id: {}", file_id);
                                            continue;
                                        };
                                        
                                        let req = crate::state::DriveRequest {
                                            id: request_id.clone(),
                                            request_type: "Download".to_string(),
                                            guest_node_id: remote_addr.clone(),
                                            file_name: file_name.clone(),
                                            file_size,
                                            target_file_id: Some(file_id.clone()),
                                            timestamp: chrono::Utc::now().timestamp(),
                                        };
                                        st.pending_requests.insert(request_id.clone(), req.clone());
                                        
                                        tx.send(DriveEvent::RequestReceived {
                                            request_id,
                                            request_type: "Download".to_string(),
                                            guest_node_id: remote_addr.clone(),
                                            file_name,
                                            file_size,
                                            target_file_id: Some(file_id.clone()),
                                        }).ok();
                                        tracing::info!("Host recorded DownloadRequest for file: {}", file_id);
                                    }
                                    DriveMessage::UploadRequest { request_id, file_name, file_size } => {
                                        let mut st = state.write().await;
                                        let req = crate::state::DriveRequest {
                                            id: request_id.clone(),
                                            request_type: "Upload".to_string(),
                                            guest_node_id: remote_addr.clone(),
                                            file_name: file_name.clone(),
                                            file_size,
                                            target_file_id: None,
                                            timestamp: chrono::Utc::now().timestamp(),
                                        };
                                        st.pending_requests.insert(request_id.clone(), req.clone());
                                        
                                        tracing::info!("Host recorded UploadRequest for file: {}", file_name);
                                        tx.send(DriveEvent::RequestReceived {
                                            request_id,
                                            request_type: "Upload".to_string(),
                                            guest_node_id: remote_addr.clone(),
                                            file_name,
                                            file_size,
                                            target_file_id: None,
                                        }).ok();
                                    }
                                    DriveMessage::ChatMessage { sender_name, content, .. } => {
                                        tx.send(DriveEvent::ChatMessageReceived {
                                            id: uuid::Uuid::new_v4().to_string(),
                                            sender_name,
                                            content,
                                            is_host: false,
                                        }).ok();
                                    }
                                    _ => {}
                                }
                            }
                        }
                        Err(_) => {
                            break; // Network read failed
                        }
                    }
                }
            }
        }
        
        {
            let mut st = state.write().await;
            st.active_guests.remove(&remote_addr);
        }
        tx.send(DriveEvent::GuestDisconnected { node_id: remote_addr }).ok();
        Ok(())
    }

    pub async fn join_room(&self, connection: Connection) {
        tracing::info!("P2P Drive Guest connected to Host");
        
        let state_clone = self.state.clone();
        let tx = self.tx.clone();
        tokio::spawn(async move {
            if let Err(e) = Self::guest_session_loop(connection, state_clone, tx).await {
                tracing::error!("P2P Drive guest session error: {}", e);
            }
        });
    }

    async fn guest_session_loop(connection: Connection, state: SharedDriveState, tx: mpsc::UnboundedSender<DriveEvent>) -> Result<()> {
        let (mut send, mut recv) = connection.open_bi().await?;
        
        let (cmd_tx, mut cmd_rx) = tokio::sync::mpsc::unbounded_channel();
        
        {
            let mut st = state.write().await;
            st.host_cmd_tx = Some(cmd_tx);
            st.is_online = true;
        }

        // Send Initial List Request
        let req = DriveMessage::ListRequest;
        if let Ok(bytes) = serde_json::to_vec(&req) {
            send.write_all(&(bytes.len() as u32).to_be_bytes()).await?;
            send.write_all(&bytes).await?;
        }

        // Background task to accept incoming files (Downloads from host)
        let dl_dir = dirs::download_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
        let conn_clone = connection.clone();
        let tx_clone_for_engine = tx.clone();
        tokio::spawn(async move {
            let _ = crate::engine::DriveEngine::accept_incoming_files(conn_clone, dl_dir, tx_clone_for_engine).await;
        });
        
        let mut pending_uploads: std::collections::HashMap<String, std::path::PathBuf> = std::collections::HashMap::new();

        loop {
            tokio::select! {
                // 1. Commands from UI (e.g. Download)
                cmd = cmd_rx.recv() => {
                    if let Some(c) = cmd {
                        use crate::state::DriveCommand;
                        match c {
                            DriveCommand::RequestDownload(file_id) => {
                                let req_id = uuid::Uuid::new_v4().to_string();
                                tracing::info!("Guest sending DownloadRequest for file: {}", file_id);
                                let msg = DriveMessage::DownloadRequest {
                                    request_id: req_id,
                                    file_id,
                                };
                                if let Ok(bytes) = serde_json::to_vec(&msg) {
                                    let _ = send.write_all(&(bytes.len() as u32).to_be_bytes()).await;
                                    let _ = send.write_all(&bytes).await;
                                }
                            }
                            DriveCommand::RequestUpload(path) => {
                                let req_id = uuid::Uuid::new_v4().to_string();
                                if let Ok(meta) = tokio::fs::metadata(&path).await {
                                    let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                                    tracing::info!("Guest sending UploadRequest for file: {}", file_name);
                                    let msg = DriveMessage::UploadRequest {
                                        request_id: req_id.clone(),
                                        file_name,
                                        file_size: meta.len(),
                                    };
                                    pending_uploads.insert(req_id, path);
                                    if let Ok(bytes) = serde_json::to_vec(&msg) {
                                        let _ = send.write_all(&(bytes.len() as u32).to_be_bytes()).await;
                                        let _ = send.write_all(&bytes).await;
                                    }
                                }
                            }
                            _ => {}
                        }
                    } else {
                        break;
                    }
                }
                
                // 2. Listen for messages from Host
                result = async {
                    let mut len_buf = [0u8; 4];
                    recv.read_exact(&mut len_buf).await?;
                    let len = u32::from_be_bytes(len_buf) as usize;
                    let mut payload = vec![0u8; len];
                    recv.read_exact(&mut payload).await?;
                    Ok::<Vec<u8>, anyhow::Error>(payload)
                } => {
                    match result {
                        Ok(payload) => {
                            if let Ok(msg) = serde_json::from_slice::<DriveMessage>(&payload) {
                                match msg {
                                    DriveMessage::ListResponse { files } => {
                                        {
                                            let mut st = state.write().await;
                                            for f in &files {
                                                st.files.insert(f.id.clone(), crate::state::VirtualFile {
                                                    meta: f.clone(),
                                                    absolute_path: std::path::PathBuf::new(), // Not needed on guest
                                                });
                                            }
                                        }
                                        tx.send(DriveEvent::GuestFilesUpdated { files }).ok();
                                    }
                                    DriveMessage::RequestDecision { request_id, approved } => {
                                        tx.send(DriveEvent::GuestDownloadDecision { request_id: request_id.clone(), approved }).ok();
                                        if approved {
                                            if let Some(path) = pending_uploads.remove(&request_id) {
                                                let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                                                let conn = connection.clone();
                                                let r_id = request_id.clone();
                                                let tx_clone = tx.clone();
                                                tokio::spawn(async move {
                                                    let _ = crate::engine::DriveEngine::send_file_to_guest(&conn, r_id, path).await;
                                                    let _ = tx_clone.send(crate::protocol::DriveEvent::TransferCompleted {
                                                        file_name,
                                                        is_upload: true, // from Guest perspective, Guest is uploading to Host
                                                    });
                                                });
                                            }
                                        } else {
                                            pending_uploads.remove(&request_id);
                                        }
                                    }
                                    _ => {}
                                }
                            }
                        }
                        Err(_) => {
                            break; // Network read failed
                        }
                    }
                }
            }
        }
        
        {
            let mut st = state.write().await;
            st.is_online = false;
        }
        Ok(())
    }
}
