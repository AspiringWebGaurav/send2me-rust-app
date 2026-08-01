use rusqlite::{Connection, Result, OptionalExtension};
use std::path::Path;
use std::sync::{Arc, Mutex};
use tokio::sync::Notify;
use chrono::Utc;

#[derive(Debug, Clone)]
pub struct DeviceRecord {
    pub id: i64,
    pub node_id: String,
    pub name: String,
    pub capabilities: String,
    pub last_seen: i64,
}

#[derive(Debug, Clone)]
pub struct FolderRecord {
    pub id: i64,
    pub path: String,
    pub status: String,
}

#[derive(Debug, Clone)]
pub struct FileRecord {
    pub id: String, // UUID
    pub folder_id: i64,
    pub relative_path: String,
    pub blake3_hash: Option<String>,
    pub revision: u64,
    pub size: u64,
    pub is_deleted: bool,
}

#[derive(Debug, Clone)]
pub struct QueueRecord {
    pub op_id: String, // UUID
    pub file_id: String, // UUID
    pub target_device_id: Option<i64>, // Nullable if broadcasting to all bonded
    pub intent: String, // Create, Modify, Delete, Rename
    pub status: String, // Pending, Transferring, Failed
    pub retry_count: u32,
    pub next_retry_at: i64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct QueueViewRecord {
    pub op_id: String,
    pub relative_path: Option<String>,
    pub intent: String,
    pub status: String,
    pub retry_count: u32,
    pub next_retry_at: i64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SyncTransactionRecord {
    pub op_id: String,
    pub file_name: String,
    pub file_size: u64,
    pub direction: String, // "Upload" or "Download"
    pub speed_bps: u64,
    pub duration_ms: u64,
    pub timestamp: i64,
}

/// The Manifest Database provides a persistent source of truth for the folder sync state.
/// It uses a synchronous `rusqlite::Connection` wrapped in an `Arc<Mutex>` so that
/// Tokio tasks can run operations inside `spawn_blocking`.
#[derive(Clone)]
pub struct ManifestDb {
    conn: Arc<Mutex<Connection>>,
    queue_notify: Arc<Notify>,
}

impl ManifestDb {
    pub fn new<P: AsRef<Path>>(db_path: P) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        
        // Enable WAL mode for high concurrency
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.pragma_update(None, "busy_timeout", 5000_i32)?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
            queue_notify: Arc::new(Notify::new()),
        };
        
        db.initialize_schema()?;
        
        Ok(db)
    }

    pub fn get_queue_notify(&self) -> Arc<Notify> {
        self.queue_notify.clone()
    }

    fn initialize_schema(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS devices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                node_id TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                capabilities TEXT NOT NULL,
                last_seen INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT UNIQUE NOT NULL,
                status TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS files (
                id TEXT PRIMARY KEY,
                folder_id INTEGER NOT NULL,
                relative_path TEXT NOT NULL,
                blake3_hash TEXT,
                revision INTEGER NOT NULL DEFAULT 0,
                size INTEGER NOT NULL DEFAULT 0,
                is_deleted BOOLEAN NOT NULL DEFAULT 0,
                FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE CASCADE
            );

            CREATE UNIQUE INDEX IF NOT EXISTS idx_files_folder_path ON files (folder_id, relative_path);

            CREATE TABLE IF NOT EXISTS queue (
                op_id TEXT PRIMARY KEY,
                file_id TEXT NOT NULL,
                target_device_id INTEGER,
                intent TEXT NOT NULL,
                status TEXT NOT NULL,
                retry_count INTEGER NOT NULL DEFAULT 0,
                next_retry_at INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE,
                FOREIGN KEY(target_device_id) REFERENCES devices(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_queue_status ON queue (status, next_retry_at);

            CREATE TABLE IF NOT EXISTS sync_transactions (
                op_id TEXT PRIMARY KEY,
                file_name TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                direction TEXT NOT NULL,
                speed_bps INTEGER NOT NULL,
                duration_ms INTEGER NOT NULL,
                timestamp INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_sync_transactions_timestamp ON sync_transactions (timestamp DESC);
            "
        )?;

        Ok(())
    }

    // --- Folder Operations ---

    pub fn upsert_device(&self, node_id: &str, name: &str, capabilities: &str) -> Result<i64> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "INSERT INTO devices (node_id, name, capabilities, last_seen) 
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(node_id) DO UPDATE SET 
                name = excluded.name,
                capabilities = excluded.capabilities,
                last_seen = excluded.last_seen",
            (node_id, name, capabilities, Utc::now().timestamp()),
        )?;
        let mut stmt = conn.prepare("SELECT id FROM devices WHERE node_id = ?1")?;
        let id: i64 = stmt.query_row([node_id], |row| row.get(0))?;
        Ok(id)
    }
    
    pub fn upsert_folder(&self, path: &str, status: &str) -> Result<i64> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "INSERT INTO folders (path, status) VALUES (?1, ?2)
             ON CONFLICT(path) DO UPDATE SET status = excluded.status",
            (path, status),
        )?;
        let mut stmt = conn.prepare("SELECT id FROM folders WHERE path = ?1")?;
        let id: i64 = stmt.query_row([path], |row| row.get(0))?;
        Ok(id)
    }

    pub fn get_folder_path_by_id(&self, folder_id: i64) -> Result<Option<String>> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn.prepare("SELECT path FROM folders WHERE id = ?1")?;
        let result = stmt.query_row([folder_id], |row| row.get(0)).optional()?;
        Ok(result)
    }

    // --- File Operations ---

    pub fn get_file_by_id(&self, file_id: &str) -> Result<Option<FileRecord>> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn.prepare(
            "SELECT id, folder_id, relative_path, blake3_hash, revision, size, is_deleted 
             FROM files WHERE id = ?1"
        )?;
        let result = stmt.query_row([file_id], |row| {
            Ok(FileRecord {
                id: row.get(0)?,
                folder_id: row.get(1)?,
                relative_path: row.get(2)?,
                blake3_hash: row.get(3)?,
                revision: row.get(4)?,
                size: row.get(5)?,
                is_deleted: row.get(6)?,
            })
        }).optional()?;
        Ok(result)
    }

    pub fn get_file_by_path(&self, folder_id: i64, relative_path: &str) -> Result<Option<FileRecord>> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn.prepare(
            "SELECT id, folder_id, relative_path, blake3_hash, revision, size, is_deleted 
             FROM files WHERE folder_id = ?1 AND relative_path = ?2"
        )?;
        let result = stmt.query_row((folder_id, relative_path), |row| {
            Ok(FileRecord {
                id: row.get(0)?,
                folder_id: row.get(1)?,
                relative_path: row.get(2)?,
                blake3_hash: row.get(3)?,
                revision: row.get(4)?,
                size: row.get(5)?,
                is_deleted: row.get(6)?,
            })
        }).optional()?;
        Ok(result)
    }

    pub fn get_all_active_files(&self, folder_id: i64) -> Result<Vec<FileRecord>> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn.prepare(
            "SELECT id, folder_id, relative_path, blake3_hash, revision, size, is_deleted 
             FROM files WHERE folder_id = ?1 AND is_deleted = 0"
        )?;
        
        let file_iter = stmt.query_map([folder_id], |row| {
            Ok(FileRecord {
                id: row.get(0)?,
                folder_id: row.get(1)?,
                relative_path: row.get(2)?,
                blake3_hash: row.get(3)?,
                revision: row.get(4)?,
                size: row.get(5)?,
                is_deleted: row.get(6)?,
            })
        })?;

        let mut files = Vec::new();
        for file in file_iter {
            files.push(file?);
        }
        Ok(files)
    }

    pub fn upsert_file(&self, record: &FileRecord) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "INSERT OR REPLACE INTO files (id, folder_id, relative_path, blake3_hash, revision, size, is_deleted) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            (
                &record.id,
                record.folder_id,
                &record.relative_path,
                &record.blake3_hash,
                record.revision,
                record.size,
                record.is_deleted,
            ),
        )?;
        Ok(())
    }

    pub fn delete_file_logical(&self, file_id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "UPDATE files SET is_deleted = 1 WHERE id = ?1",
            [file_id],
        )?;
        Ok(())
    }

    // --- Queue Operations ---

    pub fn enqueue_intent(&self, record: &QueueRecord) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        
        if record.retry_count == 0 {
            let mut stmt = conn.prepare(
                "SELECT 1 FROM queue WHERE file_id = ?1 AND intent = ?2 AND status = 'Pending'"
            )?;
            let exists = stmt.exists([&record.file_id, &record.intent])?;
            if exists {
                return Ok(());
            }
        }

        conn.execute(
            "INSERT INTO queue (op_id, file_id, target_device_id, intent, status, retry_count, next_retry_at) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(op_id) DO UPDATE SET 
                status = excluded.status,
                retry_count = excluded.retry_count,
                next_retry_at = excluded.next_retry_at",
            (
                &record.op_id,
                &record.file_id,
                record.target_device_id,
                &record.intent,
                &record.status,
                record.retry_count,
                record.next_retry_at,
            ),
        )?;
        
        self.queue_notify.notify_one();
        Ok(())
    }
    
    pub fn dequeue_pending(&self, limit: i64) -> Result<Vec<QueueRecord>> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let now = Utc::now().timestamp();
        
        // Atomically select AND mark as Transferring so concurrent workers cannot
        // pick up the same item. SQLite is serialized via our single Mutex so this
        // is effectively a transaction without needing explicit BEGIN.
        let mut stmt = conn.prepare(
            "UPDATE queue SET status = 'Transferring'
             WHERE op_id IN (
                 SELECT op_id FROM queue
                 WHERE status = 'Pending' AND next_retry_at <= ?1
                 ORDER BY rowid ASC LIMIT ?2
             )
             RETURNING op_id, file_id, target_device_id, intent, status, retry_count, next_retry_at"
        )?;
        let rows = stmt.query_map((now, limit), |row| {
            Ok(QueueRecord {
                op_id: row.get(0)?,
                file_id: row.get(1)?,
                target_device_id: row.get(2)?,
                intent: row.get(3)?,
                status: row.get(4)?,
                retry_count: row.get(5)?,
                next_retry_at: row.get(6)?,
            })
        })?;
        
        let mut records = Vec::new();
        for row in rows {
            records.push(row?);
        }
        Ok(records)
    }

    pub fn get_all_queue_records(&self, limit: i64) -> Result<Vec<QueueRecord>> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn.prepare(
            "SELECT op_id, file_id, target_device_id, intent, status, retry_count, next_retry_at 
             FROM queue ORDER BY rowid DESC LIMIT ?1"
        )?;
        let rows = stmt.query_map([limit], |row| {
            Ok(QueueRecord {
                op_id: row.get(0)?,
                file_id: row.get(1)?,
                target_device_id: row.get(2)?,
                intent: row.get(3)?,
                status: row.get(4)?,
                retry_count: row.get(5)?,
                next_retry_at: row.get(6)?,
            })
        })?;
        
        let mut records = Vec::new();
        for row in rows {
            records.push(row?);
        }
        Ok(records)
    }

    pub fn get_queue_view(&self, limit: i64) -> Result<Vec<QueueViewRecord>> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn.prepare(
            "SELECT q.op_id, f.relative_path, q.intent, q.status, q.retry_count, q.next_retry_at 
             FROM queue q
             LEFT JOIN files f ON q.file_id = f.id
             ORDER BY q.rowid DESC LIMIT ?1"
        )?;
        
        let rows = stmt.query_map([limit], |row| {
            Ok(QueueViewRecord {
                op_id: row.get(0)?,
                relative_path: row.get(1)?,
                intent: row.get(2)?,
                status: row.get(3)?,
                retry_count: row.get(4)?,
                next_retry_at: row.get(5)?,
            })
        })?;
        
        let mut records = Vec::new();
        for row in rows {
            records.push(row?);
        }
        Ok(records)
    }

    pub fn remove_queue_item(&self, op_id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "DELETE FROM queue WHERE op_id = ?1",
            [op_id],
        )?;
        Ok(())
    }

    pub fn delete_intents_for_file(&self, file_id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "DELETE FROM queue WHERE file_id = ?1",
            [file_id],
        )?;
        Ok(())
    }

    /// Direct update for failed queue items. Unlike `enqueue_intent`, this does
    /// NOT fire `queue_notify` — the item has a future `next_retry_at` so waking
    /// the drain loop would just waste a dequeue cycle.
    pub fn update_failed_queue_item(&self, op_id: &str, retry_count: u32, next_retry_at: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "UPDATE queue SET status = 'Pending', retry_count = ?1, next_retry_at = ?2 WHERE op_id = ?3",
            (retry_count, next_retry_at, op_id),
        )?;
        Ok(())
    }

    pub fn recover_stale_intents(&self) -> Result<usize> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let now = Utc::now().timestamp();
        
        // Move to dead if retried too many times
        conn.execute(
            "UPDATE queue SET status = 'Dead' WHERE status = 'Failed' AND retry_count >= 10",
            [],
        )?;
        
        let updated = conn.execute(
            "UPDATE queue 
             SET status = 'Pending', 
                 retry_count = retry_count + 1,
                 next_retry_at = ?1 + (10 * (1 << min(retry_count, 6)))
             WHERE status = 'Failed' 
                OR (status = 'Transferring' AND next_retry_at < ?1 - 300)",
            [now],
        )?;
        Ok(updated)
    }

    pub fn prune_completed_intents(&self) -> Result<usize> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let now = Utc::now().timestamp();
        // If we kept 'Completed' intents, we'd delete ones older than 7 days.
        let deleted = conn.execute(
            "DELETE FROM queue WHERE status = 'Completed' AND next_retry_at < ?1 - 604800",
            [now],
        )?;
        Ok(deleted)
    }

    // --- Sync Transactions ---

    pub fn insert_sync_transaction(&self, record: &SyncTransactionRecord) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "INSERT INTO sync_transactions (op_id, timestamp, direction, file_name, file_size, duration_ms, speed_bps) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            (
                &record.op_id,
                record.timestamp,
                &record.direction,
                &record.file_name,
                record.file_size,
                record.duration_ms,
                record.speed_bps,
            ),
        )?;
        Ok(())
    }

    pub fn get_transactions(&self, limit: usize) -> Result<Vec<SyncTransactionRecord>> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn.prepare(
            "SELECT op_id, timestamp, direction, file_name, file_size, duration_ms, speed_bps 
             FROM sync_transactions 
             ORDER BY timestamp DESC 
             LIMIT ?1"
        )?;
        
        let tx_iter = stmt.query_map([limit], |row| {
            Ok(SyncTransactionRecord {
                op_id: row.get(0)?,
                timestamp: row.get(1)?,
                direction: row.get(2)?,
                file_name: row.get(3)?,
                file_size: row.get(4)?,
                duration_ms: row.get(5)?,
                speed_bps: row.get(6)?,
            })
        })?;
        
        let mut results = Vec::new();
        for tx in tx_iter {
            results.push(tx?);
        }
        Ok(results)
    }

    /// Recovers stale/failed intents and notifies the queue so they are
    /// picked up promptly instead of waiting for the next poll cycle.
    pub fn recover_stale_intents_and_notify(&self) -> Result<usize> {
        let count = self.recover_stale_intents()?;
        if count > 0 {
            self.queue_notify.notify_one();
        }
        Ok(count)
    }
}
