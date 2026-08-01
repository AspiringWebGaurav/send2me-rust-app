use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use chrono::{DateTime, Utc};
use tokio::fs::{OpenOptions, File};
use tokio::io::{AsyncWriteExt, AsyncReadExt};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum ActionType {
    Created,
    Modified,
    Deleted,
    Renamed { new_path: String },
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ActionLog {
    pub timestamp: DateTime<Utc>,
    pub action: ActionType,
    pub relative_path: String,
    pub is_folder: bool,
}

pub struct OfflineLogger {
    journal_path: PathBuf,
}

impl Default for OfflineLogger {
    fn default() -> Self {
        Self::new()
    }
}

impl OfflineLogger {
    pub fn new() -> Self {
        let mut path = dirs::config_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
        let suffix = std::env::var("SEND2ME_APP_DIR_SUFFIX").unwrap_or_default();
        path.push(format!("send2me{}", suffix));
        std::fs::create_dir_all(&path).unwrap_or_default();
        path.push("offline_actions.jsonl");

        Self {
            journal_path: path,
        }
    }

    pub async fn log_action(&self, action: ActionLog) -> std::io::Result<()> {
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.journal_path)
            .await?;

        let json = serde_json::to_string(&action)?;
        file.write_all(format!("{}\n", json).as_bytes()).await?;
        file.flush().await?;
        
        Ok(())
    }

    pub async fn read_all_actions(&self) -> std::io::Result<Vec<ActionLog>> {
        if !self.journal_path.exists() {
            return Ok(Vec::new());
        }

        let mut file = File::open(&self.journal_path).await?;
        let mut contents = String::new();
        file.read_to_string(&mut contents).await?;

        let mut actions = Vec::new();
        for line in contents.lines() {
            if line.trim().is_empty() {
                continue;
            }
            if let Ok(action) = serde_json::from_str(line) {
                actions.push(action);
            }
        }

        Ok(actions)
    }

    pub async fn clear_journal(&self) -> std::io::Result<()> {
        if self.journal_path.exists() {
            tokio::fs::remove_file(&self.journal_path).await?;
        }
        Ok(())
    }
}

pub struct ConflictResolver;

impl ConflictResolver {
    pub async fn create_conflict_copy(path: &Path, peer_name: &str) -> std::io::Result<PathBuf> {
        let parent = path.parent().unwrap_or_else(|| Path::new(""));
        let stem = path.file_stem().unwrap_or_default().to_string_lossy();
        let ext = path.extension().unwrap_or_default().to_string_lossy();

        let conflict_name = if ext.is_empty() {
            format!("{} ({} Conflicted Copy)", stem, peer_name)
        } else {
            format!("{} ({} Conflicted Copy).{}", stem, peer_name, ext)
        };

        let conflict_path = parent.join(conflict_name);
        tokio::fs::rename(path, &conflict_path).await?;
        Ok(conflict_path)
    }
}
