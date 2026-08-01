use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::protocol::DriveFileMeta;

#[derive(Debug, Clone)]
pub struct VirtualFile {
    pub meta: DriveFileMeta,
    pub absolute_path: PathBuf,
}

#[derive(Debug, Clone)]
pub struct DriveRequest {
    pub id: String,
    pub request_type: String, // "Download" or "Upload"
    pub guest_node_id: String,
    pub file_name: String,
    pub file_size: u64,
    pub target_file_id: Option<String>, // if download
    pub timestamp: i64,
}

use tokio::sync::mpsc::UnboundedSender;

#[derive(Debug, Clone)]
pub enum DriveCommand {
    ApproveRequest(String),
    DenyRequest(String),
    RequestDownload(String), // Guest -> Host: file_id
    RequestUpload(std::path::PathBuf), // Guest -> Host: path of file to upload
    Kick,
    RefreshFiles, // Signal to re-send file list
}

#[derive(Debug, Clone, Default)]
pub struct DriveState {
    pub is_online: bool,
    pub files: HashMap<String, VirtualFile>,
    pub pending_requests: HashMap<String, DriveRequest>,
    pub active_guests: HashMap<String, (String, UnboundedSender<DriveCommand>)>, // Node ID -> (Name, Sender)
    pub host_cmd_tx: Option<UnboundedSender<DriveCommand>>, // Sender for Guest to communicate with its background loop
}

impl DriveState {
    pub fn new() -> Self {
        Self::default()
    }
}

pub type SharedDriveState = Arc<RwLock<DriveState>>;
