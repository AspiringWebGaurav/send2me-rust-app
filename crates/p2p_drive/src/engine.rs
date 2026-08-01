use anyhow::Result;
use std::path::PathBuf;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::fs::File;
use iroh::net::endpoint::Connection;
use crate::protocol::FileTransferHeader;

pub struct DriveEngine;

impl DriveEngine {
    /// Host pushes a file to the Guest over a Uni stream.
    pub async fn send_file_to_guest(
        connection: &Connection, 
        request_id: String,
        absolute_path: PathBuf,
    ) -> Result<()> {
        let meta = tokio::fs::metadata(&absolute_path).await?;
        let file_size = meta.len();
        let file_name = absolute_path.file_name().unwrap_or_default().to_string_lossy().to_string();

        let header = FileTransferHeader {
            request_id,
            file_size,
            file_name,
        };

        // Open Uni stream
        let mut send_stream = connection.open_uni().await?;
        
        let header_bytes = serde_json::to_vec(&header)?;
        send_stream.write_all(&(header_bytes.len() as u32).to_be_bytes()).await?;
        send_stream.write_all(&header_bytes).await?;

        // Stream file bytes
        let mut file = File::open(absolute_path).await?;
        let mut buffer = vec![0u8; 1024 * 64]; // 64KB chunks
        
        loop {
            let n = file.read(&mut buffer).await?;
            if n == 0 { break; }
            send_stream.write_all(&buffer[..n]).await?;
        }

        send_stream.finish()?;
        Ok(())
    }

    /// Read incoming files from the guest over Uni streams.
    /// Needs to loop alongside the control stream.
    pub async fn accept_incoming_files(
        connection: Connection,
        download_dir: PathBuf,
        tx: tokio::sync::mpsc::UnboundedSender<crate::protocol::DriveEvent>,
    ) -> Result<()> {
        loop {
            let mut recv_stream = match connection.accept_uni().await {
                Ok(s) => s,
                Err(_) => break, // connection closed
            };

            let dest_dir = download_dir.clone();
            let tx_clone = tx.clone();
            tokio::spawn(async move {
                // Read 4 byte length
                let mut len_buf = [0u8; 4];
                if recv_stream.read_exact(&mut len_buf).await.is_err() { return; }
                let len = u32::from_be_bytes(len_buf) as usize;
                
                // Read header payload
                let mut payload = vec![0u8; len];
                if recv_stream.read_exact(&mut payload).await.is_err() { return; }
                
                if let Ok(header) = serde_json::from_slice::<FileTransferHeader>(&payload) {
                    let dest_path = dest_dir.join(&header.file_name);
                    if let Ok(mut file) = File::create(&dest_path).await {
                        let mut buffer = vec![0u8; 1024 * 64];
                        loop {
                            match recv_stream.read(&mut buffer).await {
                                Ok(None) => break, // EOF
                                Ok(Some(n)) => {
                                    let _ = file.write_all(&buffer[..n]).await;
                                }
                                Err(_) => break,
                            }
                        }
                        let _ = file.flush().await;
                        tracing::info!("P2P Drive Engine successfully received: {}", header.file_name);
                        let _ = tx_clone.send(crate::protocol::DriveEvent::TransferCompleted {
                            file_name: header.file_name.clone(),
                            is_upload: true, // Direction agnostic in the event
                        });
                    }
                }
            });
        }
        Ok(())
    }
}
