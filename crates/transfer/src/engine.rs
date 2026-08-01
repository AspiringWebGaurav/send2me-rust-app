
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NetworkTopology {
    /// Local Area Network (direct connection)
    Lan,
    /// Internet / Wide Area Network (hole-punched or relayed)
    Wan,
}

#[derive(Debug, Clone)]
pub struct EngineSettings {
    pub max_parallel_connections: usize,
    pub power_mode: PowerMode,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PowerMode {
    Balanced,
    /// Between Balanced and MaxThroughput — surface in the UI as "Medium".
    Medium,
    MaxThroughput,
}

impl Default for EngineSettings {
    fn default() -> Self {
        Self {
            max_parallel_connections: 8,
            power_mode: PowerMode::Balanced,
        }
    }
}

pub struct DynamicChunker;

impl DynamicChunker {
    /// Dynamically calculates the optimal number of chunks for a file
    /// based on its size, the detected network topology, and engine settings.
    ///
    /// Uses a smooth `file_size / target_chunk_mb` formula so throughput scales
    /// continuously with file size instead of jumping at hard thresholds.
    pub fn calculate_chunk_count(
        file_size: u64,
        topology: NetworkTopology,
        settings: &EngineSettings,
    ) -> usize {
        let mb: u64 = 1024 * 1024;

        let cap = match (topology, &settings.power_mode) {
            (NetworkTopology::Lan, PowerMode::MaxThroughput) => 128,
            (NetworkTopology::Lan, PowerMode::Medium) => 32,
            (NetworkTopology::Lan, PowerMode::Balanced) => 16,
            (NetworkTopology::Wan, PowerMode::MaxThroughput) => 32,
            (NetworkTopology::Wan, PowerMode::Medium) => 16,
            (NetworkTopology::Wan, PowerMode::Balanced) => 8,
        }
        .min(settings.max_parallel_connections);

        let target_chunk_mb: u64 = match (topology, &settings.power_mode) {
            (NetworkTopology::Lan, PowerMode::MaxThroughput) => 8,
            (NetworkTopology::Lan, PowerMode::Medium) => 12,
            (NetworkTopology::Lan, PowerMode::Balanced) => 16,
            (NetworkTopology::Wan, PowerMode::MaxThroughput) => 32,
            (NetworkTopology::Wan, PowerMode::Medium) => 48,
            (NetworkTopology::Wan, PowerMode::Balanced) => 64,
        };

        let requested = (file_size / (target_chunk_mb * mb)).max(1) as usize;
        // Safety-belt max(1) in case max_parallel_connections is 0.
        requested.min(cap).max(1)
    }
}

pub struct NetworkTopologyDetector;

impl NetworkTopologyDetector {
    /// Analyzes the underlying QUIC connection to determine if it is a local or internet connection.
    ///
    /// Recognizes IPv4 loopback + RFC1918 private ranges, and for IPv6:
    /// loopback (`::1`), link-local (`fe80::/10`), and ULA (`fc00::/7`).
    pub async fn detect(connection: &iroh::net::endpoint::Connection) -> NetworkTopology {
        let ip = connection.remote_address().ip();
        match ip {
            std::net::IpAddr::V4(v4) => {
                if v4.is_loopback() || v4.is_private() {
                    return NetworkTopology::Lan;
                }
            }
            std::net::IpAddr::V6(v6) => {
                if v6.is_loopback() {
                    return NetworkTopology::Lan;
                }
                let seg0 = v6.segments()[0];
                // Link-local fe80::/10
                if (seg0 & 0xffc0) == 0xfe80 {
                    return NetworkTopology::Lan;
                }
                // Unique local fc00::/7
                if (seg0 & 0xfe00) == 0xfc00 {
                    return NetworkTopology::Lan;
                }
            }
        }
        NetworkTopology::Wan
    }
}

