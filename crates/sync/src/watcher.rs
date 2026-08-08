use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{mpsc, RwLock};

/// Maximum number of times a locked-file open retry is attempted before
/// giving up and emitting the event anyway (the hash check will catch false
/// positives downstream).
const MAX_FILE_OPEN_RETRIES: u8 = 3;

#[derive(Debug, Clone)]
pub enum SyncEvent {
    Created(PathBuf),
    Modified(PathBuf),
    Deleted(PathBuf),
    Renamed(PathBuf, PathBuf),
}

pub struct IgnoreCache {
    paths: RwLock<HashMap<PathBuf, Instant>>,
}

impl Default for IgnoreCache {
    fn default() -> Self {
        Self::new()
    }
}

impl IgnoreCache {
    pub fn new() -> Self {
        Self {
            paths: RwLock::new(HashMap::new()),
        }
    }

    pub async fn ignore_temporarily(&self, path: PathBuf, duration: Duration) {
        let mut cache = self.paths.write().await;
        cache.insert(path, Instant::now() + duration);
    }

    pub async fn is_ignored(&self, path: &Path) -> bool {
        // Fast path: read lock for the common case (entry exists and is valid,
        // or entry does not exist at all).
        {
            let cache = self.paths.read().await;
            match cache.get(path) {
                Some(&expires) if Instant::now() < expires => return true,
                None => return false,
                _ => {} // expired — fall through to write-lock cleanup
            }
        }

        // Expired entry — take write lock once to atomically check + remove.
        // This avoids a TOCTOU window where a concurrent `ignore_temporarily`
        // for the same path could be inserted between the read and write locks
        // and immediately removed.
        let mut cache = self.paths.write().await;
        if let Some(&expires) = cache.get(path) {
            if Instant::now() < expires {
                // A new, valid entry was inserted between our read and write
                // locks — it is still active, so honour it.
                return true;
            }
            cache.remove(path);
        }
        false
    }
}

pub struct FolderWatcher {
    watcher: RecommendedWatcher,
    pub event_receiver: mpsc::Receiver<SyncEvent>,
    _ignore_cache: Arc<IgnoreCache>,
}

impl FolderWatcher {
    pub fn new(ignore_cache: Arc<IgnoreCache>) -> notify::Result<Self> {
        let (tx, mut rx) = mpsc::channel::<notify::Result<Event>>(100);

        let watcher = RecommendedWatcher::new(
            move |res| {
                let _ = tx.blocking_send(res);
            },
            Config::default().with_poll_interval(Duration::from_secs(2)),
        )?;

        let (event_tx, event_rx) = mpsc::channel(100);

        let (retry_tx, mut retry_rx) = mpsc::channel::<(PathBuf, u8)>(100);

        let cache = ignore_cache.clone();
        tokio::spawn(async move {
            let mut pending_events: HashMap<PathBuf, (Instant, u8)> = HashMap::new();
            
            loop {
                // Use a relative sleep instead of computing an absolute Instant.
                // This avoids panics/immediate resolution if the system was
                // suspended and `Instant::now()` jumped past the target.
                let wait_fut = async {
                    if pending_events.is_empty() {
                        std::future::pending::<()>().await;
                    } else {
                        let oldest = pending_events.values().map(|(t, _)| *t).min().unwrap();
                        let elapsed = Instant::now().saturating_duration_since(oldest);
                        let debounce = Duration::from_millis(500);
                        if elapsed < debounce {
                            tokio::time::sleep(debounce - elapsed).await;
                        }
                        // else: already past debounce, return immediately
                    }
                };

fn is_system_temp_file(path: &Path) -> bool {
    let name = match path.file_name().and_then(|n| n.to_str()) {
        Some(n) => n,
        None => return false,
    };
    name.contains(".sync.tmp")
        || name.starts_with("unconfirmed_transfer_")
        || name.ends_with(".send2me.secret")
        || name.starts_with("~$")
        || name.eq_ignore_ascii_case("desktop.ini")
        || name.eq_ignore_ascii_case("thumbs.db")
        || name.eq_ignore_ascii_case(".ds_store")
}

                tokio::select! {
                    res_opt = rx.recv() => {
                        match res_opt {
                            Some(Ok(event)) => {
                                match event.kind {
                                    notify::EventKind::Modify(notify::event::ModifyKind::Name(_)) => {
                                        if event.paths.len() == 2 {
                                            let old_path = event.paths[0].clone();
                                            let new_path = event.paths[1].clone();
                                            if !is_system_temp_file(&old_path)
                                                && !is_system_temp_file(&new_path)
                                                && !cache.is_ignored(&old_path).await
                                                && !cache.is_ignored(&new_path).await
                                            {
                                                let _ = event_tx.send(SyncEvent::Renamed(old_path, new_path)).await;
                                            }
                                        } else {
                                            for path in event.paths {
                                                if !is_system_temp_file(&path) && !cache.is_ignored(&path).await {
                                                    pending_events.insert(path, (Instant::now(), 0));
                                                }
                                            }
                                        }
                                    }
                                    notify::EventKind::Create(_) | notify::EventKind::Modify(_) => {
                                        for path in event.paths {
                                            if !is_system_temp_file(&path) && !cache.is_ignored(&path).await {
                                                pending_events.insert(path, (Instant::now(), 0));
                                            }
                                        }
                                    }
                                    notify::EventKind::Remove(_) => {
                                        for path in event.paths {
                                            if !is_system_temp_file(&path) && !cache.is_ignored(&path).await {
                                                let _ = event_tx.send(SyncEvent::Deleted(path)).await;
                                            }
                                        }
                                    }
                                    _ => {} 
                                }
                            }
                            Some(Err(_)) => {}
                            None => break, // watcher dropped
                        }
                    }
                    Some((retry_path, retry_count)) = retry_rx.recv() => {
                        pending_events.insert(retry_path, (Instant::now(), retry_count));
                    }
                    _ = wait_fut => {
                        let now = Instant::now();
                        let mut processed = Vec::new();
                        for (path, (timestamp, retry_count)) in pending_events.iter() {
                            if now.duration_since(*timestamp) >= Duration::from_millis(500) {
                                processed.push((path.clone(), *retry_count));
                            }
                        }
                        
                        for (p, retries) in processed {
                            pending_events.remove(&p);
                            
                            let tx_clone = event_tx.clone();
                            let retry_clone = retry_tx.clone();
                            
                            tokio::spawn(async move {
                                match tokio::fs::File::open(&p).await {
                                    Ok(_) => {
                                        let _ = tx_clone.send(SyncEvent::Modified(p)).await;
                                    }
                                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                                        let _ = tx_clone.send(SyncEvent::Deleted(p)).await;
                                    }
                                    Err(_) => {
                                        // File is locked or inaccessible. Retry up to
                                        // MAX_FILE_OPEN_RETRIES times, then emit as
                                        // Modified anyway — the downstream hash check
                                        // will detect stale data.
                                        let next_retry = retries + 1;
                                        if next_retry < MAX_FILE_OPEN_RETRIES {
                                            tokio::time::sleep(Duration::from_millis(500)).await;
                                            let _ = retry_clone.send((p, next_retry)).await;
                                        } else {
                                            tracing::warn!("File open retries exhausted, emitting Modified for {:?}", p);
                                            let _ = tx_clone.send(SyncEvent::Modified(p)).await;
                                        }
                                    }
                                }
                            });
                        }
                    }
                }
            }
        });

        Ok(Self {
            watcher,
            event_receiver: event_rx,
            _ignore_cache: ignore_cache,
        })
    }

    pub fn watch(&mut self, path: &Path) -> notify::Result<()> {
        self.watcher.watch(path, RecursiveMode::Recursive)
    }

    pub fn unwatch(&mut self, path: &Path) -> notify::Result<()> {
        self.watcher.unwatch(path)
    }
}

