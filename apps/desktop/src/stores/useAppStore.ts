import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { useNotificationStore } from './useNotificationStore';
import { useUpdateStore } from './useUpdateStore';

interface AppInfo {
  name: string;
  version: string;
  os: string;
  arch: string;
}

interface AppState {
  appInfo: AppInfo | null;
  isReady: boolean;
  fetchAppInfo: () => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  appInfo: null,
  isReady: false,
  fetchAppInfo: async () => {
    try {
      const info = await invoke<AppInfo>('get_app_info');
      set({ appInfo: info, isReady: true });
      if (info?.version) {
        useUpdateStore.setState({ currentVersion: info.version.replace(/^v/i, '') });
      }
    } catch (error) {
      useNotificationStore.getState().addNotification({
        type: 'error',
        title: 'Could not load app info',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  },
}));
