import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { AppSettings } from '../models/settings';
import { useNotificationStore } from './useNotificationStore';

interface SettingsState {
  settings: AppSettings | null;
  fetchSettings: () => Promise<void>;
  updateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  fetchSettings: async () => {
    try {
      const settings = await invoke<AppSettings>('get_settings_cached');
      set({ settings });
    } catch (e) {
      useNotificationStore.getState().addNotification({
        type: 'error',
        title: 'Could not load settings',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  },
  updateSettings: async (newSettings: Partial<AppSettings>) => {
    const current = get().settings;
    if (!current) return;
    const previous = current;
    const updated = { ...current, ...newSettings };
    // Optimistic update
    set({ settings: updated });
    try {
      await invoke('update_settings', { settings: updated });
    } catch (e) {
      // Roll back so the UI reflects the true persisted state
      set({ settings: previous });
      useNotificationStore.getState().addNotification({
        type: 'error',
        title: 'Could not save settings',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}));
