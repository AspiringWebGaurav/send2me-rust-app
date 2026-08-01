use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct HandshakeRequest {
    pub file_name: String,
    pub file_size: u64,
    pub sender_name: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct HandshakeResponse {
    pub accepted: bool,
    pub message: Option<String>,
}
