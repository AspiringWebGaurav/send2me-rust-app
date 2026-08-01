use std::sync::Arc;
use std::time::Duration;
use tokio::time;
use transfer::stream::StreamMessage;
use tokio::io::AsyncWriteExt;

/// Spawns a background task that ensures a continuous connection to all bonded devices.
pub fn spawn(
    sync_manager: Arc<tokio::sync::RwLock<sync::manager::SyncManager>>,
    network_manager: Arc<network::network_manager::NetworkManager>,
) {
    tauri::async_runtime::spawn(async move {
        let mut interval = time::interval(Duration::from_secs(30));
        
        loop {
            interval.tick().await;

            // 1. Get the list of currently bonded devices
            let bonded_devices = {
                let manager = sync_manager.read().await;
                manager.bonded_devices.clone()
            };

            if bonded_devices.is_empty() {
                continue;
            }

            // 2. Try connecting and sending a heartbeat to each bonded device
            for device in bonded_devices {
                let network_manager = network_manager.clone();
                
                tauri::async_runtime::spawn(async move {
                    tracing::debug!("Pipeline maintainer checking bonded device: {}", device.node_id);
                    match network_manager.connect(&device.node_id).await {
                        Ok(conn) => {
                            // Try to open a stream and send a heartbeat
                            match conn.open_bi().await {
                                Ok((mut send_stream, mut _recv_stream)) => {
                                    let ping_msg = StreamMessage::Ping;
                                    if let Ok(bytes) = serde_json::to_vec(&ping_msg) {
                                        let _ = send_stream.write_u32(bytes.len() as u32).await;
                                        if let Err(e) = send_stream.write_all(&bytes).await {
                                            tracing::debug!("Failed to send heartbeat ping to {}: {}", device.node_id, e);
                                        } else {
                                            tracing::debug!("Heartbeat ping sent successfully to {}", device.node_id);
                                        }
                                        let _ = send_stream.flush().await;
                                    }
                                }
                                Err(e) => {
                                    tracing::debug!("Failed to open bi-stream for heartbeat to {}: {}", device.node_id, e);
                                }
                            }
                        }
                        Err(e) => {
                            tracing::debug!("Failed to connect to bonded device {}: {}", device.node_id, e);
                        }
                    }
                });
            }
        }
    });
}
