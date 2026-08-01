export function formatFileSize(bytes: number): string {
  if (bytes === 0 || isNaN(bytes)) return '0 B';
  if (bytes < 1024) return `${bytes} B`;

  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;

  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;

  const gb = Math.floor(mb / 1024);
  const remainingMb = mb % 1024;

  if (gb > 0 && remainingMb > 1) {
    return `${gb} GB ${Math.round(remainingMb)} MB`;
  }

  return `${(mb / 1024).toFixed(2)} GB`;
}

export function formatBitrate(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "0 bps";
  const bps = bytesPerSecond * 8;
  if (bps < 1_000) return `${Math.round(bps)} bps`;
  if (bps < 1_000_000) return `${Math.round(bps / 1_000)} Kbps`;
  if (bps < 1_000_000_000) return `${Math.round(bps / 1_000_000)} Mbps`;
  return `${(bps / 1_000_000_000).toFixed(1)} Gbps`;
}

export function formatEta(seconds?: number): string {
  if (seconds === undefined || seconds <= 0) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m}m ${s}s left`;
  return `${s}s left`;
}

