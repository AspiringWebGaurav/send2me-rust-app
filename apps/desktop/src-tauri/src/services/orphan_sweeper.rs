use std::sync::Arc;
use tokio::sync::RwLock;
use transfer::transfer_manager::{TransferRegistry, TransferStatus};
use crate::services::settings_service::AppSettings;

const TMP_SUFFIX: &str = ".send2me.secret";
const EXPIRY_SECS: u64 = 5 * 60; // 5 minutes; the CleanupGuard normally deletes within seconds
const SWEEP_INTERVAL_SECS: u64 = 5 * 60; // 5 minutes

pub fn spawn(
    cached_settings: Arc<RwLock<AppSettings>>,
    registry: TransferRegistry,
) {
    tauri::async_runtime::spawn(async move {
        loop {
            // Delay the first periodic pass so we don't race the startup sweep.
            tokio::time::sleep(tokio::time::Duration::from_secs(SWEEP_INTERVAL_SECS)).await;
            let folder = {
                let raw = cached_settings.read().await.downloads_folder.clone();
                resolve_tilde(&raw)
            };
            sweep(&folder, &registry).await;
        }
    });
}

async fn sweep(folder: &str, registry: &TransferRegistry) {
    let dir = match std::fs::read_dir(folder) {
        Ok(d) => d,
        Err(e) => {
            tracing::warn!("[orphan-sweep] cannot read downloads folder {}: {}", folder, e);
            return;
        }
    };

    for entry in dir.flatten() {
        let path = entry.path();
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_owned(),
            None => continue,
        };

        // Match the production temp pattern: any name ending with the suffix.
        if !name.ends_with(TMP_SUFFIX) {
            continue;
        }

        // Age check first — cheap, no lock.
        let age_secs = match path.metadata().and_then(|m| m.modified()) {
            Ok(modified) => std::time::SystemTime::now()
                .duration_since(modified)
                .unwrap_or_default()
                .as_secs(),
            Err(_) => continue,
        };

        if age_secs < EXPIRY_SECS {
            continue;
        }

        // Never delete a file that could belong to a live transfer. 
        // The tmp file is named `unconfirmed_transfer_<id>.send2me.secret`.
        let matches_live = {
            let reg = registry.read().await;
            reg.values().any(|t| {
                matches!(
                    t.status,
                    TransferStatus::Receiving
                        | TransferStatus::Paused
                        | TransferStatus::Finalizing
                        | TransferStatus::Waiting
                        | TransferStatus::Connecting
                ) && name.contains(&t.id)
            })
        };
        if matches_live {
            continue;
        }

        match std::fs::remove_file(&path) {
            Ok(()) => tracing::info!(
                "[orphan-sweep] deleted {} — age: {}s",
                name,
                age_secs
            ),
            Err(e) => tracing::warn!("[orphan-sweep] failed to delete {}: {}", name, e),
        }
    }
}

fn resolve_tilde(path: &str) -> String {
    if path.starts_with("~/") || path.starts_with("~\\") {
        if let Some(mut home) = dirs::home_dir() {
            home.push(&path[2..]);
            return home.to_string_lossy().into_owned();
        }
    }
    path.to_owned()
}

