use std::sync::Arc;
use std::time::Duration;
use crate::manifest::ManifestDb;
use tokio::time;

pub struct RecoveryEngine;

impl RecoveryEngine {
    pub async fn run(manifest_db: Arc<ManifestDb>) {
        let mut interval = time::interval(Duration::from_secs(60)); // Run every 60 seconds
        
        loop {
            interval.tick().await;

            let db = manifest_db.clone();
            let _ = tokio::task::spawn_blocking(move || {
                // 1. Recover stale or failed intents back to Pending and wake queue
                match db.recover_stale_intents_and_notify() {
                    Ok(count) if count > 0 => {
                        tracing::info!("RecoveryEngine: Resurrected {} stale/failed sync intents", count);
                    }
                    Err(e) => {
                        tracing::error!("RecoveryEngine: Failed to recover stale intents: {}", e);
                    }
                    _ => {} // count == 0
                }

                // 2. Prune old completed intents
                match db.prune_completed_intents() {
                    Ok(count) if count > 0 => {
                        tracing::info!("RecoveryEngine: Pruned {} old completed intents", count);
                    }
                    Err(e) => {
                        tracing::error!("RecoveryEngine: Failed to prune completed intents: {}", e);
                    }
                    _ => {} // count == 0
                }
            }).await;
        }
    }

    pub fn spawn(manifest_db: Arc<ManifestDb>) {
        tokio::spawn(async move {
            Self::run(manifest_db).await;
        });
    }
}
