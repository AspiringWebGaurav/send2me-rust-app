#![allow(deprecated)]
#[allow(deprecated)]
use iroh::net::{Endpoint, key::SecretKey, NodeId, NodeAddr};
use std::str::FromStr;
use pkarr::{PkarrClient, Keypair, SignedPacket};

pub struct NetworkManager {
    endpoint: Endpoint,
    pub pairing_code: String,
    pkarr_client: PkarrClient,
}

impl NetworkManager {
    pub async fn new(pairing_code: String) -> anyhow::Result<Self> {
        let secret_key = Self::load_or_generate_key()?;
        
        let endpoint = Endpoint::builder()
            .alpns(vec![b"send2me/1".to_vec(), b"send2me-sync/1".to_vec(), b"send2me-drive/1".to_vec()])
            .secret_key(secret_key)
            .discovery_n0()
            .discovery_local_network()
            .bind()
            .await?;
            
        let pkarr_client = PkarrClient::builder().build()?;
        
        let manager = Self { endpoint, pairing_code, pkarr_client };
        
        // Publish our 4-digit code mapping to the global DHT in the background
        manager.publish_code_mapping().await;
        
        Ok(manager)
    }
    
    fn load_or_generate_key() -> anyhow::Result<SecretKey> {
        use anyhow::Context;
        let mut path = dirs::config_dir()
            .ok_or_else(|| anyhow::anyhow!("no config directory available on this platform"))?;
        let suffix = std::env::var("SEND2ME_APP_DIR_SUFFIX").unwrap_or_default();
        path.push(format!("send2me{}", suffix));
        std::fs::create_dir_all(&path)
            .with_context(|| format!("creating config dir {}", path.display()))?;

        path.push("identity.key");

        match std::fs::read(&path) {
            Ok(bytes) => SecretKey::try_from(bytes.as_slice()).map_err(|_| {
                anyhow::anyhow!(
                    "identity key file is corrupt at {} — delete it manually to re-pair",
                    path.display()
                )
            }),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                let key = SecretKey::generate();
                Self::write_key_file(&path, &key)?;
                Ok(key)
            }
            Err(e) => {
                Err(e).with_context(|| format!("reading identity key {}", path.display()))
            }
        }
    }

    fn write_key_file(path: &std::path::Path, key: &SecretKey) -> anyhow::Result<()> {
        #[cfg(unix)]
        {
            use std::io::Write;
            use std::os::unix::fs::OpenOptionsExt;
            let mut f = std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .mode(0o600)
                .open(path)?;
            f.write_all(&key.to_bytes())?;
        }
        #[cfg(not(unix))]
        {
            std::fs::write(path, key.to_bytes())?;
        }
        Ok(())
    }

    pub fn node_id(&self) -> NodeId {
        self.endpoint.node_id()
    }
    
    pub fn endpoint(&self) -> &Endpoint {
        &self.endpoint
    }
    
    /// Hashes the 4-digit code into a deterministic ed25519 keypair for Pkarr
    fn code_keypair(code: &str) -> Keypair {
        let hash = blake3::hash(code.as_bytes());
        // pkarr Keypair expects a 32-byte secret seed
        let secret = hash.as_bytes();
        Keypair::from_secret_key(secret)
    }
    
    /// Publishes the mapping of [4-digit code] -> [Our NodeId] to the global DHT
    async fn publish_code_mapping(&self) {
        let code = self.pairing_code.clone();
        let node_id = self.node_id().to_string();
        let client = self.pkarr_client.clone();
        
        tokio::spawn(async move {
            let keypair = Self::code_keypair(&code);
            
            // Build a DNS TXT record containing our NodeId
            let mut packet = pkarr::dns::Packet::new_reply(0);
            let txt_rdata = match pkarr::dns::rdata::TXT::try_from(node_id.as_str()) {
                Ok(txt) => txt,
                Err(e) => {
                    tracing::error!("Failed to create TXT record: {:?}", e);
                    return;
                }
            };
            let name = match pkarr::dns::Name::new("send2me") {
                Ok(n) => n,
                Err(e) => {
                    tracing::error!("Failed to create DNS name: {:?}", e);
                    return;
                }
            };
            packet.answers.push(pkarr::dns::ResourceRecord::new(
                name,
                pkarr::dns::CLASS::IN,
                30,
                pkarr::dns::rdata::RData::TXT(txt_rdata),
            ));
            
            let mut backoff = 2;
            loop {
                if let Ok(signed_packet) = SignedPacket::from_packet(&keypair, &packet) {
                    let client_clone = client.clone();
                    
                    let success = tokio::task::spawn_blocking(move || {
                        match client_clone.publish(&signed_packet) {
                            Ok(_) => {
                                tracing::info!("Successfully published 4-digit code to global DHT!");
                                true
                            }
                            Err(e) => {
                                let msg = e.to_string();
                                if msg.contains("inflight") {
                                    // The DHT is actively working on publishing this in the background
                                    tracing::debug!("DHT publish is actively inflight. Waiting...");
                                } else {
                                    tracing::info!("DHT publish pending network bootstrap ({}). Retrying...", msg);
                                }
                                false
                            }
                        }
                    }).await.unwrap_or(false);

                    if success {
                        break;
                    }
                } else {
                    tracing::error!("Failed to sign pkarr packet");
                    break;
                }

                tokio::time::sleep(tokio::time::Duration::from_secs(backoff)).await;
                // If it's inflight, the internal query usually takes up to 60s to time out.
                // We keep polling gently.
                backoff = std::cmp::min(backoff * 2, 30);
            }
        });
    }
    
    /// Resolves a 4-digit code to a NodeId via the global DHT
    #[allow(clippy::result_large_err)]
    pub async fn resolve_code_mapping(&self, code: &str) -> anyhow::Result<NodeId> {
        let keypair = Self::code_keypair(code);
        let pubkey = keypair.public_key();
        
        tracing::info!("Resolving code {} on global DHT...", code);
        
        let client = self.pkarr_client.clone();
        
        // Spawn blocking because pkarr 2.0 client is synchronous
        let resolve_result = tokio::task::spawn_blocking(move || {
            client.resolve(&pubkey)
        }).await?;
        
        match resolve_result {
            Ok(Some(packet)) => {
                for answer in packet.packet().answers.clone() {
                    if let pkarr::dns::rdata::RData::TXT(txt) = answer.rdata {
                        // Extract NodeId string from TXT record by converting to string and cleaning
                        let node_id_str = String::try_from(txt).unwrap_or_else(|_| "".to_string());
                        if let Ok(node_id) = NodeId::from_str(&node_id_str) {
                            tracing::info!("Resolved {} -> NodeId {}", code, node_id);
                            return Ok(node_id);
                        }
                    }
                }
                Err(anyhow::anyhow!("Code found but no valid NodeId in record"))
            },
            Ok(None) => Err(anyhow::anyhow!("Code not found on global DHT")),
            Err(e) => Err(anyhow::anyhow!("Error resolving code on global DHT: {}", e)),
        }
    }
    
    pub async fn connect(&self, node_id_str: &str) -> anyhow::Result<iroh::net::endpoint::Connection> {
        let node_id = NodeId::from_str(node_id_str)?;
        let addr = NodeAddr::new(node_id);
        
        // Iroh automatically uses Pkarr and local discovery to find the optimal route (NAT hole punching)
        let conn = self.endpoint.connect(addr, b"send2me/1").await?;
        Ok(conn)
    }

    pub async fn connect_sync(&self, node_id_str: &str) -> anyhow::Result<iroh::net::endpoint::Connection> {
        let node_id = NodeId::from_str(node_id_str)?;
        let addr = NodeAddr::new(node_id);
        
        let conn = self.endpoint.connect(addr, b"send2me-sync/1").await?;
        Ok(conn)
    }

    pub async fn connect_drive(&self, node_id_str: &str) -> anyhow::Result<iroh::net::endpoint::Connection> {
        let node_id = NodeId::from_str(node_id_str)?;
        let addr = NodeAddr::new(node_id);
        
        let conn = self.endpoint.connect(addr, b"send2me-drive/1").await?;
        Ok(conn)
    }
    
    pub async fn accept(&self) -> Option<iroh::net::endpoint::Incoming> {
        self.endpoint.accept().await
    }
}
