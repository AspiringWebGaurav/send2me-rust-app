import type { Device } from './device';

export type TransferStatus = 'queued' | 'preparing' | 'waiting' | 'connecting' | 'sending' | 'receiving' | 'paused' | 'completed' | 'cancelled' | 'failed' | 'finalizing';

/**
 * Fine-grained local-processing stages, emitted alongside network progress on
 * the `transfer-local-progress` event. The primary `progress` field is
 * network transfer only; `localStage` + `localProgress` drive a second bar so
 * the UI never appears frozen at 100 %.
 */
export type LocalStage = 'receiving' | 'compiling' | 'finalizing' | 'renaming' | 'system_scan' | 'done';

export interface Transfer {
  id: string;
  fileName: string;
  fileSize: number;
  bytesTransferred: number;
  progress: number; // 0 to 100 — network transfer only
  status: TransferStatus;
  direction: 'incoming' | 'outgoing';
  targetDevice: Device;
  startedAt: string;
  estimatedTimeRemaining?: number;
  speed?: number; // bytes per second
  parts?: number; // number of parallel chunks
  localStage?: LocalStage;
  localProgress?: number; // 0 to 100 within the current localStage
  localMessage?: string;
  stageLogs?: { stage: string; message: string; time: number }[];
  durationMs?: number;
  startedAtLocal?: number;
}
