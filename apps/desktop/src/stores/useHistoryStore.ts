import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { HistoryRecord } from '../models/history';
import { useNotificationStore } from './useNotificationStore';

interface HistoryState {
  records: HistoryRecord[];
  fetchHistory: () => Promise<void>;
  clearHistory: () => Promise<void>;
}

// Kept as a no-op export so callers in App.tsx don't have to conditionally invoke it.
export function disposeHistoryListeners() {}

export const useHistoryStore = create<HistoryState>((set) => ({
  records: [],
  fetchHistory: async () => {
    try {
      const records = await invoke<HistoryRecord[]>('get_transfer_history');
      set({ records });
    } catch (e) {
      useNotificationStore.getState().addNotification({
        type: 'error',
        title: 'Could not load history',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  },
  clearHistory: async () => {
    try {
      await invoke('clear_history');
      set({ records: [] });
    } catch (e) {
      useNotificationStore.getState().addNotification({
        type: 'error',
        title: 'Clear history failed',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  },
}));
