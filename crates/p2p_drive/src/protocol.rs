use serde::{Deserialize, Serialize};

/// The ALPN protocol string for the P2P Drive feature
pub const ALPN_P2P_DRIVE: &[u8] = b"send2me-drive/1";

/// Messages sent over the bidirectional control stream
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DriveMessage {
    /// Guest asks for the virtual file list
    ListRequest,
    /// Host responds with the virtual file list
    ListResponse {
        files: Vec<DriveFileMeta>,
    },
    /// Guest requests to download a file
    DownloadRequest {
        request_id: String,
        file_id: String,
    },
    /// Guest requests to upload a file to the host
    UploadRequest {
        request_id: String,
        file_name: String,
        file_size: u64,
    },
    /// Host replies to a Download or Upload request
    RequestDecision {
        request_id: String,
        approved: bool,
    },
    /// A chat message sent by either Host or Guest
    ChatMessage {
        sender_id: String, // Node ID string
        sender_name: String,
        content: String,
        timestamp: i64,
    },
    /// Status ping (e.g. Host is going offline)
    Status {
        status: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriveFileMeta {
    pub id: String,
    pub name: String,
    pub size: u64,
    pub is_folder: bool,
    pub added_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileTransferHeader {
    pub request_id: String,
    pub file_size: u64,
    pub file_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DriveEvent {
    GuestConnected { node_id: String, name: String },
    GuestDisconnected { node_id: String },
    RequestReceived { request_id: String, request_type: String, guest_node_id: String, file_name: String, file_size: u64, target_file_id: Option<String> },
    ChatMessageReceived { id: String, sender_name: String, content: String, is_host: bool },
    GuestFilesUpdated { files: Vec<DriveFileMeta> },
    GuestDownloadDecision { request_id: String, approved: bool },
    TransferCompleted { file_name: String, is_upload: bool },
}
