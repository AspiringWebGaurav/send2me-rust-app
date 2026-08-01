export type HistoryStatus = 'completed' | 'cancelled' | 'failed';

export interface HistoryRecord {
  id: string;
  transferId: string;
  fileName: string;
  fileSize: number;
  direction: 'incoming' | 'outgoing';
  targetDeviceId: string;
  targetDeviceName: string;
  status: HistoryStatus;
  timestamp: string;
  durationSeconds: number;
}
