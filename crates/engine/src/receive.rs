use protocol::{
    download_to_store, get_or_create_secret, AppHandle, ReceiveOptions,
};
use iroh::endpoint::{presets, QuicTransportConfig};
use iroh::{address_lookup::dns::DnsAddressLookup, Endpoint};
use iroh_blobs::ticket::BlobTicket;
use noq_proto::{congestion::Bbr3Config, MtuDiscoveryConfig, VarInt};
use std::str::FromStr;
use std::sync::Arc;
use tokio::select;
use crate::export::export_to_directory;
use crate::storage;
use crate::types::ReceiveResult;

fn high_throughput_transport(lan: bool) -> QuicTransportConfig {
    const MB: u64 = 1024 * 1024;
    // LAN: 1400 avoids fragmentation on typical 1500-byte Ethernet MTU.
    // WAN: 1280 is safe across most internet paths (IPv6 minimum MTU).
    let mtu = if lan { 1400u16 } else { 1280u16 };
    QuicTransportConfig::builder()
        .stream_receive_window(VarInt::from_u64(32 * MB).unwrap())
        .receive_window(VarInt::from_u64(64 * MB).unwrap())
        .send_window(64 * MB)
        .initial_mtu(mtu)
        .mtu_discovery_config(Some(MtuDiscoveryConfig::default()))
        .congestion_controller_factory(Arc::new(Bbr3Config::default()))
        .build()
}

fn emit_event(app_handle: &AppHandle, event_name: &str) {
    if let Some(handle) = app_handle {
        if let Err(e) = handle.emit_event(event_name) {
            tracing::warn!("Failed to emit event {}: {}", event_name, e);
        }
    }
}

fn emit_event_with_payload(app_handle: &AppHandle, event_name: &str, payload: &str) {
    if let Some(handle) = app_handle {
        if let Err(e) = handle.emit_event_with_payload(event_name, payload) {
            tracing::warn!("Failed to emit event {} with payload: {}", event_name, e);
        }
    }
}

pub async fn download(
    ticket_str: String,
    options: ReceiveOptions,
    app_handle: AppHandle,
    cancel_rx: tokio::sync::oneshot::Receiver<()>,
) -> anyhow::Result<ReceiveResult> {
    let ticket = BlobTicket::from_str(&ticket_str)?;
    let addr = ticket.addr().clone();
    let secret_key = get_or_create_secret()?;
    let lan = addr.ip_addrs().count() > 0;

    let mut builder = Endpoint::builder(presets::Minimal)
        .alpns(vec![])
        .secret_key(secret_key)
        .relay_mode(options.relay_mode.clone().into())
        .transport_config(high_throughput_transport(lan));

    if ticket.addr().relay_urls().count() == 0 && ticket.addr().ip_addrs().count() == 0 {
        builder = builder.address_lookup(DnsAddressLookup::n0_dns());
    }
    if let Some(addr) = options.magic_ipv4_addr {
        builder = builder.bind_addr(addr)?;
    }
    if let Some(addr) = options.magic_ipv6_addr {
        builder = builder.bind_addr(addr)?;
    }

    let endpoint = builder.bind().await?;
    let (db, iroh_data_dir) =
        storage::create_recv_store(&ticket.hash().to_hex().to_string()).await?;
    let mut cleanup_guard = storage::recv_cleanup_guard(iroh_data_dir);
    let db2 = db.clone();
    let output_dir = options
        .output_dir
        .clone()
        .unwrap_or_else(|| dirs::download_dir().unwrap_or_else(|| std::env::current_dir().unwrap()));

    let transfer = async {
        let downloaded =
            download_to_store(ticket, addr, &endpoint, db.as_ref(), &app_handle).await?;

        // Export concurrency: fan out more widely on LAN/NVMe (low RTT is a proxy
        // for local network + likely fast disk); throttle on WAN paths where a
        // spinning disk or SATA SSD can be saturated by 4 concurrent extracts.
        let cores = num_cpus::get();
        let export_concurrency = if downloaded.rtt_ms <= 5 {
            cores.max(4)
        } else if downloaded.rtt_ms <= 40 {
            cores.clamp(4, 8)
        } else {
            4
        };
        tracing::debug!(
            rtt_ms = downloaded.rtt_ms,
            export_concurrency,
            "download: chose export concurrency"
        );

        let conflicts =
            export_to_directory(&db, downloaded.collection, &output_dir, export_concurrency)
                .await?;

        if !conflicts.is_empty() {
            let payload = serde_json::to_string(&conflicts).unwrap_or_else(|_| "[]".to_string());
            emit_event_with_payload(&app_handle, "receive-conflicts", &payload);
        }

        emit_event(&app_handle, "receive-completed");

        anyhow::Ok((
            downloaded.total_files,
            downloaded.payload_size,
            downloaded.stats,
            conflicts.len(),
        ))
    };

    let (total_files, payload_size, _stats, conflict_count) = match select! {
        result = transfer => result,
        _ = cancel_rx => {
            tracing::info!("Download cancelled by user — preserving partial store for resume");
            cleanup_guard.disarm();
            db2.shutdown().await?;
            endpoint.close().await;
            anyhow::bail!("cancelled");
        }
    } {
        Ok(values) => {
            endpoint.close().await;
            values
        }
        Err(e) => {
            tracing::error!("Download operation failed: {e}");
            endpoint.close().await;
            cleanup_guard.disarm();
            db2.shutdown().await?;
            anyhow::bail!("error: {e}");
        }
    };

    let message = if conflict_count > 0 {
        format!(
            "Downloaded {} files, {} bytes ({} name conflicts auto-resolved)",
            total_files, payload_size, conflict_count
        )
    } else {
        format!("Downloaded {} files, {} bytes", total_files, payload_size)
    };

    Ok(ReceiveResult {
        message,
        file_path: output_dir,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::send::start_share;
    use protocol::{
        AddrInfoOptions, FileMetadata, RelayModeOption, SendOptions,
    };
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[tokio::test]
    async fn test_fetch_metadata_e2e() {
        let mut temp_file = NamedTempFile::new().unwrap();
        write!(temp_file, "metadata e2e test content").unwrap();
        let temp_path = temp_file.path().to_path_buf();

        let expected_metadata = FileMetadata {
            file_name: "test_e2e_file.txt".into(),
            item_count: 1,
            size: 25,
            thumbnail: Some("data:image/jpeg;base64,e2e_test_thumbnail=".into()),
            mime_type: Some("text/plain".into()),
            items: None,
        };

        let send_opts = SendOptions {
            relay_mode: RelayModeOption::Default,
            ticket_type: AddrInfoOptions::RelayAndAddresses,
            magic_ipv4_addr: None,
            magic_ipv6_addr: None,
        };

        let result = start_share(temp_path, send_opts, None, Some(expected_metadata.clone()))
            .await
            .expect("Failed to start share");

        let recv_opts = ReceiveOptions {
            output_dir: None,
            relay_mode: RelayModeOption::Default,
            magic_ipv4_addr: None,
            magic_ipv6_addr: None,
        };

        let fetched = protocol::fetch_metadata(result.ticket, recv_opts)
            .await
            .expect("Failed to fetch metadata from node");

        assert_eq!(fetched.file_name, expected_metadata.file_name);
        assert_eq!(fetched.size, expected_metadata.size);
        assert_eq!(fetched.thumbnail, expected_metadata.thumbnail);
        assert_eq!(fetched.mime_type, expected_metadata.mime_type);
    }
}
