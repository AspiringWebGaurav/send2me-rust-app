use serde::{Serialize, Deserialize};


#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HistoryRecord {
    pub id: String,
    pub transfer_id: String,
    pub file_name: String,
    pub file_size: u64,
    pub direction: String,
    pub target_device_id: String,
    pub target_device_name: String,
    pub status: String,
    pub timestamp: String,
    pub duration_seconds: u64,
}

pub struct HistoryManager {
    pub records: Vec<HistoryRecord>,
}

impl Default for HistoryManager {
    fn default() -> Self {
        Self::new()
    }
}

impl HistoryManager {
    pub fn new() -> Self {
        let path = Self::history_path();
        let records = if path.exists() {
            if let Ok(data) = std::fs::read_to_string(&path) {
                serde_json::from_str::<Vec<HistoryRecord>>(&data).unwrap_or_default()
            } else {
                Vec::new()
            }
        } else {
            Vec::new()
        };
        
        Self { records }
    }
    
    fn history_path() -> std::path::PathBuf {
        let mut path = dirs::config_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
        let suffix = std::env::var("SEND2ME_APP_DIR_SUFFIX").unwrap_or_default();
        path.push(format!("send2me{}", suffix));
        std::fs::create_dir_all(&path).unwrap_or_default();
        path.push("history.json");
        path
    }
    
    fn save(&self) {
        let path = Self::history_path();
        if let Ok(data) = serde_json::to_string_pretty(&self.records) {
            let _ = std::fs::write(&path, data);
        }
    }
    
    pub fn add_record(&mut self, record: HistoryRecord) {
        self.records.insert(0, record);
        self.save();
    }
    
    pub fn clear(&mut self) {
        self.records.clear();
        self.save();
    }
}

