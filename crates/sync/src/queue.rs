use crate::manifest::{ManifestDb, QueueRecord};
use std::sync::Arc;
use tokio::sync::{Notify, Semaphore};

use futures::future::BoxFuture;
use chrono::Utc;

const MAX_CONCURRENT_TRANSFERS: usize = 4;
/// Fallback poll interval so the queue never stalls longer than this even if
/// all `Notify` signals are missed (e.g. during a burst of enqueues).
const POLL_INTERVAL_SECS: u64 = 30;

pub type DispatchCallback = Arc<dyn Fn(QueueRecord) -> BoxFuture<'static, anyhow::Result<()>> + Send + Sync>;

pub struct SyncQueueEngine {
    db: ManifestDb,
    notify: Arc<Notify>,
    semaphore: Arc<Semaphore>,
    dispatch_fn: DispatchCallback,
}

impl SyncQueueEngine {
    pub fn new(db: ManifestDb, dispatch_fn: DispatchCallback) -> Self {
        let notify = db.get_queue_notify();
        Self {
            db,
            notify,
            semaphore: Arc::new(Semaphore::new(MAX_CONCURRENT_TRANSFERS)),
            dispatch_fn,
        }
    }

    /// Triggers an immediate queue processing run (used when new items are added).
    pub fn trigger(&self) {
        self.notify.notify_one();
    }

    /// Returns the queue notify handle so external subsystems (e.g. RecoveryEngine)
    /// can wake the queue after making items eligible for dispatch.
    pub fn get_queue_notify(&self) -> Arc<Notify> {
        self.notify.clone()
    }

    /// Starts the background worker pool loop.
    pub fn start(&self) {
        let db = self.db.clone();
        let notify = self.notify.clone();
        let semaphore = self.semaphore.clone();
        let dispatch_fn = self.dispatch_fn.clone();

        tokio::spawn(async move {
            // Process queue immediately on start
            notify.notify_one();
            
            loop {
                // Wait for an explicit trigger OR the poll fallback — whichever comes first.
                tokio::select! {
                    _ = notify.notified() => {}
                    _ = tokio::time::sleep(std::time::Duration::from_secs(POLL_INTERVAL_SECS)) => {}
                }

                // Process until the queue is empty
                loop {
                    // Try to acquire a permit. If we are at MAX_CONCURRENT_TRANSFERS, we wait here.
                    let permit = match semaphore.clone().acquire_owned().await {
                        Ok(p) => p,
                        Err(_) => break, // Semaphore closed
                    };

                    // Dequeue exactly 1 item to handle
                    let records = match db.dequeue_pending(1) {
                        Ok(r) => r,
                        Err(e) => {
                            tracing::error!("Failed to dequeue items: {}", e);
                            drop(permit);
                            break;
                        }
                    };

                    if records.is_empty() {
                        // Nothing to do, break the inner loop and wait for next trigger/poll
                        drop(permit);
                        break;
                    }

                    let record = records.into_iter().next().unwrap();
                    let op_id = record.op_id.clone();
                    // Note: dequeue_pending already atomically set status='Transferring'

                    let dispatch = dispatch_fn.clone();
                    let db_clone = db.clone();

                    // Spawn the isolated worker task
                    tokio::spawn(async move {
                        let _permit = permit; // Permit is held for the lifetime of this task
                        
                        match dispatch(record.clone()).await {
                            Ok(_) => {
                                // Success! Remove from queue.
                                if let Err(e) = db_clone.remove_queue_item(&op_id) {
                                    tracing::error!("Failed to remove successful queue item: {}", e);
                                }
                            }
                            Err(e) => {
                                tracing::warn!("Transfer failed for op {}: {}", op_id, e);
                                // Calculate exponential backoff: base * 2^retry capped at 300s
                                let retry_count = record.retry_count + 1;
                                let backoff_secs = (5_u64 * 2_u64.pow(retry_count.min(6) as u32)).min(300);
                                let next_retry = Utc::now().timestamp() + (backoff_secs as i64);

                                // Direct update — bypass enqueue_intent to avoid triggering
                                // a spurious notify_one() that would wake the drain loop
                                // and waste a dequeue cycle (the item is backoff-delayed anyway).
                                if let Err(update_err) = db_clone.update_failed_queue_item(
                                    &op_id, retry_count, next_retry,
                                ) {
                                    tracing::error!("Failed to update queue item after failure: {}", update_err);
                                }
                            }
                        }
                    });
                }
            }
        });
    }
}

