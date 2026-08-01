import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { Device } from '../models/device';
import { useNotificationStore } from './useNotificationStore';

interface DeviceState {
  localDevice: Device | null;
  trustedDevices: Device[];
  fetchLocalDevice: () => Promise<void>;
  fetchTrustedDevices: () => Promise<void>;
  pairDevice: (id: string) => Promise<void>;
}

// Kept as a no-op export for App.tsx symmetry with the transfer store disposer.
export function disposeDeviceListeners() {}

export const useDeviceStore = create<DeviceState>((set) => ({
  localDevice: null,
  trustedDevices: [],
  fetchLocalDevice: async () => {
    try {
      const device = await invoke<Device>('get_local_device');
      set({ localDevice: device });
    } catch (e) {
      useNotificationStore.getState().addNotification({
        type: 'error',
        title: 'Could not load this device',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  },
  fetchTrustedDevices: async () => {
    try {
      const devices = await invoke<Device[]>('get_trusted_devices');
      set({ trustedDevices: devices });
    } catch (e) {
      useNotificationStore.getState().addNotification({
        type: 'error',
        title: 'Could not load paired devices',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  },
  pairDevice: async (id: string) => {
    try {
      await invoke('pair_device', { id });
      const devices = await invoke<Device[]>('get_trusted_devices');
      set({ trustedDevices: devices });
    } catch (e) {
      useNotificationStore.getState().addNotification({
        type: 'error',
        title: 'Pair failed',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  },
}));
