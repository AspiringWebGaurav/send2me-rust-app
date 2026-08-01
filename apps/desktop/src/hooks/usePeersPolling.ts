import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PeerBeacon } from "../models/device";

/**
 * Polls the backend for live LAN peers at a fixed interval.
 * Returns the latest peer list and a manual refresh function.
 */
export function usePeersPolling(intervalMs: number = 3000): {
  peers: PeerBeacon[];
  refresh: () => void;
} {
  const [peers, setPeers] = useState<PeerBeacon[]>([]);

  const refresh = () => {
    invoke<PeerBeacon[]>("get_peers")
      .then((p) => setPeers(p))
      .catch(() => { /* network polling — failures are transient, no toast needed */ });
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return { peers, refresh };
}
