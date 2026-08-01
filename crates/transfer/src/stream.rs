use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::mpsc;
use iroh::net::endpoint::{Connection, RecvStream};
use serde::{Serialize, Deserialize};
use tokio::io::{SeekFrom, AsyncSeekExt};

use crate::engine::{DynamicChunker, EngineSettings, NetworkTopologyDetector};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum IntentType {
    Create,
    Modify,
    Delete,
    Rename,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SyncMetadata {
    pub protocol_version: u16,
    pub operation_id: String,
    pub sync_intent: IntentType,
    pub file_id: String,
    pub revision: u64,
    pub blake3_hash: Option<String>,
    pub origin_node_id: String,
    pub relative_path: String,
    pub new_relative_path: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ProtocolInfo {
    pub version: u16,
    pub capabilities: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FileMetadata {
    pub transfer_id: String,
    pub file_name: String,
    pub file_size: u64,
    pub chunk_count: usize,
    pub sync_metadata: Option<SyncMetadata>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ChunkHeader {
    pub transfer_id: String,
    pub chunk_index: usize,
    pub start_offset: u64,
    pub chunk_size: u64,
}

/// Post-chunk trailer, sent as the very last frame on a chunk uni-stream.
/// Carries a lightweight BLAKE3 digest of the chunk payload so the receiver can
/// detect on-disk corruption / truncation without rehashing the entire file.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ChunkTrailer {
    pub transfer_id: String,
    pub chunk_index: usize,
    pub bytes_written: u64,
    /// BLAKE3(payload) truncated to 16 bytes (128 bits — still cryptographic strength for detection).
    pub hash: [u8; 16],
}

#[derive(Serialize, Deserialize, Debug)]
pub enum StreamMessage {
    ProtocolHandshake(ProtocolInfo),
    Control(FileMetadata),
    Chunk(ChunkHeader),
    /// Space pre-flight check response
    PreFlightResponse { accepted: bool, has_space: bool, #[serde(default)] already_exists: bool },
    CancelTransfer { transfer_id: String },
    PauseTransfer { transfer_id: String },
    ResumeTransfer { transfer_id: String },
    FolderSyncBindRequest { node_id: String, device_name: String, os: String },
    FolderSyncBindResponse { accepted: bool },
    FolderSyncBindFinalize { accepted: bool },
    FolderSyncBindAck,
    FolderSyncUnbind { node_id: String },
    FolderSyncHashCheck { relative_path: String, hash: String },
    FolderSyncHashCheckResponse { matches: bool },
    FolderSyncTestBridgeRequest { sender_node_id: String },
    FolderSyncTestBridgeResponse(TestBridgeDiagnosticResponse),
    TransferCompleted { success: bool },
    Ping,
    Pong,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TestBridgeDiagnosticResponse {
    pub success: bool,
    pub remote_device_name: String,
    pub remote_os: String,
    pub remote_folders_ok: usize,
    pub remote_folders_total: usize,
    pub remote_disk_free_mb: u64,
    pub remote_logs: Vec<String>,
}

#[derive(Debug, Clone)]
pub enum ProgressEvent {
    InitParts(u32),
    Bytes(usize),
    ChunkStarted(usize, u64),
    ChunkCompleted(usize),
    Cancel,
    Pause,
    Resume,
}

pub struct TransferStream;

impl TransferStream {
    /// Maximum size for any control-plane JSON message. Real payloads are <1 KB;
    /// 64 KiB is a comfortable ceiling that prevents an OOM from a malicious peer
    /// sending a huge length prefix.
    pub const MAX_CONTROL_MESSAGE_SIZE: usize = 64 * 1024;

    /// Read buffer per chunk task. Large enough for QUIC batching, small enough
    /// that a 128-chunk fan-out never allocates gigabytes of buffer memory.
    const READ_BUFFER_SIZE: usize = 2 * 1024 * 1024;

    #[allow(clippy::too_many_arguments)]
    pub async fn send_file_parallel(
        connection: &Connection,
        transfer_id: String,
        file_path: String,
        file_name: String,
        progress_tx: mpsc::Sender<ProgressEvent>,
        settings: EngineSettings,
        pause_flag: std::sync::Arc<std::sync::atomic::AtomicBool>,
        sync_metadata: Option<SyncMetadata>,
    ) -> anyhow::Result<()> {
        let metadata = tokio::fs::metadata(&file_path).await?;
        let file_size = metadata.len();

        let topology = NetworkTopologyDetector::detect(connection).await;
        let chunk_count = DynamicChunker::calculate_chunk_count(file_size, topology, &settings);

        tracing::info!("Sending file {} size {} using {} chunks", file_name, file_size, chunk_count);

        // 1. Control Stream - Pre-flight
        let (mut ctrl_send, mut ctrl_recv) = connection.open_bi().await?;
        let meta = FileMetadata {
            transfer_id: transfer_id.clone(),
            file_name,
            file_size,
            chunk_count,
            sync_metadata,
        };
        let msg = StreamMessage::Control(meta);
        let msg_json = serde_json::to_string(&msg)?;
        let msg_bytes = msg_json.as_bytes();
        ctrl_send.write_all(&(msg_bytes.len() as u32).to_be_bytes()).await?;
        ctrl_send.write_all(msg_bytes).await?;
        ctrl_send.flush().await?;

        // Wait for Pre-flight response
        let resp_len = ctrl_recv.read_u32().await?;
        if resp_len as usize > Self::MAX_CONTROL_MESSAGE_SIZE {
            return Err(anyhow::anyhow!("Pre-flight response too large"));
        }
        let mut resp_bytes = vec![0u8; resp_len as usize];
        ctrl_recv.read_exact(&mut resp_bytes).await?;
        let resp_msg: StreamMessage = serde_json::from_slice(&resp_bytes)?;
        match resp_msg {
            StreamMessage::PreFlightResponse { accepted, has_space, already_exists } => {
                if !accepted {
                    tracing::warn!("Receiver rejected the transfer.");
                    return Err(anyhow::anyhow!("REJECTED_BY_USER"));
                }
                if !has_space {
                    tracing::warn!("Receiver does not have enough disk space.");
                    return Err(anyhow::anyhow!("INSUFFICIENT_SPACE"));
                }
                if already_exists {
                    tracing::info!("Receiver already has the identical file. Short-circuiting data transfer!");
                    let _ = progress_tx.try_send(ProgressEvent::InitParts(0));
                    return Ok(());
                }
            }
            _ => {
                return Err(anyhow::anyhow!("Unexpected pre-flight response"));
            }
        }

        // Best-effort: dropped bytes-events never stall the sender.
        let _ = progress_tx.try_send(ProgressEvent::InitParts(chunk_count as u32));

        // 2. Fan out chunk streams.
        //
        // For a `file_size == 0` transfer we still need to emit exactly one
        // (zero-byte) chunk stream so the receiver's completion counter reaches
        // `chunk_count == 1` and finalization runs.
        let chunk_size = if chunk_count == 0 || file_size == 0 {
            0
        } else {
            file_size.div_ceil(chunk_count as u64)
        };
        let mut handles = Vec::with_capacity(chunk_count);

        let concurrency = if settings.max_parallel_connections > 0 {
            settings.max_parallel_connections
        } else {
            4
        };
        let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(concurrency));

        for i in 0..chunk_count {
            let start_offset = i as u64 * chunk_size;
            let mut size = chunk_size;
            if file_size > 0 && start_offset + size > file_size {
                size = file_size - start_offset;
            }

            let file_path = file_path.clone();
            let connection = connection.clone();
            let progress_tx = progress_tx.clone();
            let transfer_id = transfer_id.clone();
            let pause_flag_clone = pause_flag.clone();
            let semaphore = semaphore.clone();

            handles.push(tokio::spawn(async move {
                let _permit = semaphore
                    .acquire_owned()
                    .await
                    .map_err(|e| anyhow::anyhow!("Semaphore closed: {}", e))?;

                // Non-blocking: dropping ChunkStarted only affects UI granularity.
                let _ = progress_tx.try_send(ProgressEvent::ChunkStarted(i, size));

                let mut data_send = connection.open_uni().await?;
                let header = ChunkHeader {
                    transfer_id: transfer_id.clone(),
                    chunk_index: i,
                    start_offset,
                    chunk_size: size,
                };
                let msg = StreamMessage::Chunk(header);
                let hdr_json = serde_json::to_string(&msg)?;
                let hdr_bytes = hdr_json.as_bytes();
                data_send
                    .write_all(&(hdr_bytes.len() as u32).to_be_bytes())
                    .await?;
                data_send.write_all(hdr_bytes).await?;

                let mut hasher = blake3::Hasher::new();
                let mut bytes_read: u64 = 0;

                if size > 0 {
                    let mut options = tokio::fs::OpenOptions::new();
                    options.read(true);
                    #[cfg(windows)]
                    {
                        options.share_mode(0x7); // FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE
                    }
                    let mut file = options.open(&file_path).await?;
                    file.seek(SeekFrom::Start(start_offset)).await?;
                    let mut buffer = vec![0u8; Self::READ_BUFFER_SIZE];

                    while bytes_read < size {
                        // Pause loop — respects cooperative pause.
                        while pause_flag_clone.load(std::sync::atomic::Ordering::Relaxed) {
                            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                        }

                        let to_read =
                            std::cmp::min(buffer.len() as u64, size - bytes_read) as usize;
                        let n = file.read(&mut buffer[..to_read]).await?;
                        if n == 0 {
                            break;
                        }
                        data_send.write_all(&buffer[..n]).await?;
                        hasher.update(&buffer[..n]);
                        bytes_read += n as u64;
                        // Best-effort byte updates: never block the network path.
                        let _ = progress_tx.try_send(ProgressEvent::Bytes(n));
                    }
                }

                // Post-payload trailer. Sent length-prefixed so the receiver can
                // parse it after it has already consumed `size` payload bytes.
                let digest = hasher.finalize();
                let mut hash16 = [0u8; 16];
                hash16.copy_from_slice(&digest.as_bytes()[..16]);
                let trailer = ChunkTrailer {
                    transfer_id: transfer_id.clone(),
                    chunk_index: i,
                    bytes_written: bytes_read,
                    hash: hash16,
                };
                let trailer_json = serde_json::to_string(&trailer)?;
                let trailer_bytes = trailer_json.as_bytes();
                data_send
                    .write_all(&(trailer_bytes.len() as u32).to_be_bytes())
                    .await?;
                data_send.write_all(trailer_bytes).await?;
                data_send.finish()?;

                // Completion event MUST arrive at the receive-loop: `.await` here
                // and swallow the closed-channel case (caller has cancelled).
                let _ = progress_tx.send(ProgressEvent::ChunkCompleted(i)).await;

                Ok::<(), anyhow::Error>(())
            }));
        }

        // Join all chunks. Log every failure, capture the first, and if any
        // chunk failed, close the connection and return the error so the
        // receiver doesn't silently accept a truncated file.
        let mut first_err: Option<anyhow::Error> = None;
        for handle in handles {
            match handle.await {
                Ok(Ok(())) => {}
                Ok(Err(e)) => {
                    tracing::error!("Chunk transfer failed: {:?}", e);
                    if first_err.is_none() {
                        first_err = Some(e);
                    }
                }
                Err(join_err) => {
                    tracing::error!("Chunk task panicked: {:?}", join_err);
                    if first_err.is_none() {
                        first_err = Some(anyhow::anyhow!("chunk task panicked: {join_err}"));
                    }
                }
            }
        }

        if let Some(e) = first_err {
            connection.close(1u32.into(), b"chunk-failed");
            return Err(e);
        }

        // Wait for the receiver to finish disk I/O and send TransferCompleted response
        match Self::read_stream_message(&mut ctrl_recv).await {
            Ok(StreamMessage::TransferCompleted { success }) => {
                if !success {
                    anyhow::bail!("Receiver failed to verify or write transferred file");
                }
            }
            Ok(msg) => {
                tracing::debug!("Received unexpected control message while awaiting completion: {:?}", msg);
            }
            Err(e) => {
                tracing::debug!("Control stream closed while awaiting completion: {}", e);
            }
        }

        Ok(())
    }

    pub async fn read_stream_message(stream: &mut RecvStream) -> anyhow::Result<StreamMessage> {
        Self::read_bounded_message(stream, Self::MAX_CONTROL_MESSAGE_SIZE).await
    }

    /// Read a length-prefixed JSON message with an explicit size cap.
    pub async fn read_bounded_message(
        stream: &mut RecvStream,
        max_len: usize,
    ) -> anyhow::Result<StreamMessage> {
        let meta_len = stream.read_u32().await? as usize;
        if meta_len > max_len {
            return Err(anyhow::anyhow!(
                "Message length {} exceeds maximum of {} bytes",
                meta_len,
                max_len
            ));
        }
        let mut meta_bytes = vec![0u8; meta_len];
        stream.read_exact(&mut meta_bytes).await?;
        Ok(serde_json::from_slice(&meta_bytes)?)
    }

    /// Read a length-prefixed JSON trailer with a fixed size cap. Used by the
    /// receiver to consume the trailer emitted after each chunk payload.
    pub async fn read_chunk_trailer(stream: &mut RecvStream) -> anyhow::Result<ChunkTrailer> {
        let len = stream.read_u32().await? as usize;
        if len > Self::MAX_CONTROL_MESSAGE_SIZE {
            return Err(anyhow::anyhow!("Trailer too large: {} bytes", len));
        }
        let mut buf = vec![0u8; len];
        stream.read_exact(&mut buf).await?;
        Ok(serde_json::from_slice::<ChunkTrailer>(&buf)?)
    }
}

#[cfg(test)]
mod tests {
    use crate::engine::{EngineSettings, NetworkTopology, PowerMode};

    #[test]
    fn chunker_never_returns_zero() {
        // Zero-length files must still yield a nonzero chunk plan so the
        // receiver has something to count towards completion.
        let s = EngineSettings {
            max_parallel_connections: 8,
            power_mode: PowerMode::Balanced,
        };
        let n = crate::engine::DynamicChunker::calculate_chunk_count(0, NetworkTopology::Lan, &s);
        assert!(n >= 1);
    }
}

