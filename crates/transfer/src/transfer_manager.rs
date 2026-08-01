use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum TransferStatus {
    Queued,
    Preparing,
    Waiting,
    Connecting,
    Sending,
    Receiving,
    Paused,
    Completed,
    Cancelled,
    Failed,
    Finalizing,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TargetDevice {
    pub id: String,
    pub name: String,
    pub os: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Transfer {
    pub id: String,
    pub file_name: String,
    pub file_size: u64,
    pub bytes_transferred: u64,
    pub progress: f64,
    pub status: TransferStatus,
    pub speed: u64, // bytes per second
    pub estimated_time_remaining: u64, // seconds
    pub direction: String, // "incoming" or "outgoing"
    pub target_device: TargetDevice,
    pub parts: u32,
    
    #[serde(skip, default = "std::time::Instant::now")]
    pub last_update_time: std::time::Instant,
    #[serde(skip)]
    pub last_bytes: u64,
}

pub type TransferRegistry = Arc<RwLock<HashMap<String, Transfer>>>;

pub struct TransferManager {
    transfers: TransferRegistry,
}

impl Default for TransferManager {
    fn default() -> Self {
        Self::new()
    }
}

impl TransferManager {
    pub fn new() -> Self {
        Self {
            transfers: Arc::new(RwLock::new(HashMap::new())),
        }
    }
    
    pub fn registry(&self) -> TransferRegistry {
        self.transfers.clone()
    }
    
    // Add, update, cancel functions here...
}

