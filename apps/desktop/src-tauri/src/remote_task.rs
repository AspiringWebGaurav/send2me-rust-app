use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RemoteTaskRecord {
    pub task_id: String,
    pub version: String,
    pub status: String,
    pub executed_at: u64,
    pub pid: u32,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RemoteTaskDirective {
    #[serde(default)]
    pub task_id: Option<String>,
    #[serde(default)]
    pub action: Option<String>, // "clean_yourself" | "repair_locks" | "diagnostics" | "clean_cache"
    #[serde(default)]
    pub target_version: Option<String>,
    #[serde(default)]
    pub payload: Option<serde_json::Value>,
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn get_tasks_store_path() -> PathBuf {
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        PathBuf::from(local).join("Send2Me").join("executed_remote_tasks.json")
    } else {
        std::env::temp_dir().join("com.send2me.desktop").join("executed_remote_tasks.json")
    }
}

pub fn is_directive_already_executed(task_id: &str) -> bool {
    let path = get_tasks_store_path();
    let alt_path = path.parent().map(|p| p.join("executed_tasks.json"));

    for p in [&path, &alt_path.unwrap_or_else(|| path.clone())] {
        if p.exists() {
            if let Ok(content) = std::fs::read_to_string(p) {
                if let Ok(list) = serde_json::from_str::<Vec<String>>(&content) {
                    if list.iter().any(|id| id == task_id) {
                        return true;
                    }
                }
            }
        }
    }
    false
}

pub fn mark_directive_as_executed(task_id: &str) {
    let path = get_tasks_store_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let mut list: Vec<String> = if path.exists() {
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    } else {
        Vec::new()
    };
    if !list.iter().any(|id| id == task_id) {
        list.push(task_id.to_string());
        if list.len() > 100 {
            let excess = list.len() - 100;
            list.drain(0..excess);
        }
        let serialized = serde_json::to_string(&list).unwrap_or_default();
        let _ = std::fs::write(&path, &serialized);
        if let Some(parent) = path.parent() {
            let _ = std::fs::write(parent.join("executed_tasks.json"), &serialized);
        }
    }
}

/// Cleans stale OTA swap/staging artifacts (.old, .new, .tmp, .bad, .staged)
pub fn clean_app_storage() -> Result<String, String> {
    let mut cleaned_count = 0usize;
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(dir) = current_exe.parent() {
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    let name = p.file_name().unwrap_or_default().to_string_lossy();
                    if (name.ends_with(".old")
                        || name.ends_with(".new")
                        || name.ends_with(".staged")
                        || name.ends_with(".tmp")
                        || name.ends_with(".bad"))
                        && std::fs::remove_file(&p).is_ok()
                    {
                        cleaned_count += 1;
                    }
                }
            }
        }
    }
    Ok(format!("Cleaned {} superseded binary and cache items", cleaned_count))
}

pub fn execute_directive(
    directive: &RemoteTaskDirective,
    current_ver: &str,
) -> Result<String, String> {
    let now = now_secs();
    let pid = std::process::id();
    let action_raw = directive.action.as_deref().unwrap_or("noop").trim();
    let action = action_raw.to_ascii_lowercase();
    let task_id = directive
        .task_id
        .clone()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| format!("directive-{}-{}", action, now));

    if let Some(ref target) = directive.target_version {
        let t = target.trim().trim_start_matches('v');
        let c = current_ver.trim().trim_start_matches('v');
        if !t.is_empty() && t != "*" && t != c {
            return Ok(format!(
                "Task {} target version {} does not match current version {}",
                task_id, t, c
            ));
        }
    }

    if is_directive_already_executed(&task_id) {
        return Ok(format!("Task {} already executed, skipping.", task_id));
    }

    tracing::info!("[Send2Me Remote Task] Executing remote directive '{}' (Task ID: {})", action_raw, task_id);

    let result = match action.as_str() {
        "clean_yourself" | "clean" | "clean_cache" => {
            clean_app_storage()
        }
        "repair_locks" => {
            let _ = clean_app_storage();
            Ok(format!("File locks cleaned non-destructively for task {}", task_id))
        }
        "diagnostics" => {
            let info = format!("OS: Windows, PID: {}, Version: {}", pid, current_ver);
            tracing::info!("[Send2Me Diagnostics] {}", info);
            Ok(format!("Diagnostics logged: {}", info))
        }
        other => {
            tracing::info!("[Send2Me Remote Task] Unknown action '{}' acknowledged", other);
            Ok(format!("Action '{}' acknowledged for task {}", other, task_id))
        }
    };

    mark_directive_as_executed(&task_id);
    result
}

#[tauri::command]
pub fn cmd_execute_remote_directive(
    task_id: Option<String>,
    action: Option<String>,
    target_version: Option<String>,
    payload: Option<serde_json::Value>,
) -> Result<String, String> {
    let directive = RemoteTaskDirective {
        task_id,
        action,
        target_version,
        payload,
    };
    execute_directive(&directive, "0.0.1")
}
