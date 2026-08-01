use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};
use std::collections::HashMap;
use tokio::net::UdpSocket;
use tokio::sync::{Notify, RwLock};
use serde::{Serialize, Deserialize};
use tracing::error;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DiscoveryBeacon {
    pub node_id: String,
    pub pairing_code: String,
    pub hostname: String,
    pub os: String,
    pub device_type: String,
}

pub type PeerRegistry = Arc<RwLock<HashMap<String, (DiscoveryBeacon, Instant)>>>;

const BROADCAST_INTERVAL: Duration = Duration::from_secs(3);
const PEER_TTL: Duration = Duration::from_secs(9); // 3× broadcast interval

pub struct Discovery;

impl Discovery {
    pub async fn start_broadcasting(
        beacon: DiscoveryBeacon,
        shutdown: Arc<Notify>,
    ) -> anyhow::Result<tokio::task::JoinHandle<()>> {
        let socket = UdpSocket::bind("0.0.0.0:0").await?;
        socket.set_broadcast(true)?;
        let broadcast_addr: SocketAddr = "255.255.255.255:34567".parse()?;
        let msg = serde_json::to_vec(&beacon)?;

        Ok(tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = shutdown.notified() => break,
                    _ = tokio::time::sleep(BROADCAST_INTERVAL) => {
                        if let Err(e) = socket.send_to(&msg, broadcast_addr).await {
                            error!("Broadcast failed: {}", e);
                        }
                    }
                }
            }
        }))
    }

    pub async fn start_listening(
        registry: PeerRegistry,
        shutdown: Arc<Notify>,
    ) -> anyhow::Result<tokio::task::JoinHandle<()>> {
        let socket = socket2::Socket::new(
            socket2::Domain::IPV4,
            socket2::Type::DGRAM,
            Some(socket2::Protocol::UDP),
        )?;

        socket.set_reuse_address(true)?;
        #[cfg(not(windows))]
        if let Err(e) = socket.set_reuse_port(true) {
            tracing::warn!("set_reuse_port not supported: {}", e);
        }

        let addr: std::net::SocketAddr = "0.0.0.0:34567".parse()?;
        socket.bind(&addr.into())?;
        socket.set_nonblocking(true)?;

        let std_socket: std::net::UdpSocket = socket.into();
        let socket = UdpSocket::from_std(std_socket)?;

        Ok(tokio::spawn(async move {
            let mut buf = vec![0u8; 4096];
            loop {
                tokio::select! {
                    _ = shutdown.notified() => break,
                    result = socket.recv_from(&mut buf) => {
                        match result {
                            Ok((len, _addr)) => {
                                if let Ok(beacon) = serde_json::from_slice::<DiscoveryBeacon>(&buf[..len]) {
                                    // Validate pairing code shape before accepting
                                    if beacon.pairing_code.len() == 4
                                        && beacon.pairing_code.chars().all(|c| c.is_ascii_alphanumeric())
                                    {
                                        let now = Instant::now();
                                        let mut reg = registry.write().await;
                                        reg.retain(|_, (_, ts)| ts.elapsed() < PEER_TTL);
                                        reg.insert(beacon.pairing_code.clone(), (beacon, now));
                                    }
                                }
                            }
                            Err(e) => {
                                error!("UDP receive error: {}", e);
                            }
                        }
                    }
                }
            }
        }))
    }
}
