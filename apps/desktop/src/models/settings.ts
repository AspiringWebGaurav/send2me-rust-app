export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  downloadsFolder: string;
  autoAcceptTransfers: boolean;
  autoUpdate: boolean;
  animationsEnabled: boolean;
  notificationsEnabled: boolean;
  language: string;
  startMinimized: boolean;
  developerMode: boolean;
  rgbMode: boolean;
  maxParallelConnections: number;
  transferEngineMode: 'balanced' | 'medium' | 'max_throughput';
  autoResumeTransfers: boolean;
  enableFolderSync: boolean;
  folderSyncInstalled: boolean;
}
