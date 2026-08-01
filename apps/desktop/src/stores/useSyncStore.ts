import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

export interface FolderSyncBindPrompt {
  remote_endpoint_id: string;
  device_name: string;
  os: string;
}

export interface SyncFolder {
  id: string;
  path: string;
  status: string;
  last_synced?: string;
}

export interface BondedDevice {
  node_id: string;
  device_name: string;
  os: string;
  date_bonded: string;
  sync_folders: SyncFolder[];
  is_online?: boolean;
}

interface SyncState {
  pendingBindPrompts: FolderSyncBindPrompt[];
  finalizeBindPrompts: FolderSyncBindPrompt[];
  bondedDevices: BondedDevice[];
  respondToBindPrompt: (id: string, deviceName: string, os: string, accept: boolean) => Promise<void>;
  finalizeBindRequest: (id: string, accept: boolean) => Promise<void>;
  fetchBondedDevices: () => Promise<void>;
  removeBondedDevice: (id: string) => Promise<void>;
  initListeners: () => void;
}

let listenersDisposer: (() => void) | null = null;

export function disposeSyncListeners() {
  if (listenersDisposer) {
    listenersDisposer();
    listenersDisposer = null;
  }
}

export const useSyncStore = create<SyncState>((set, get) => ({
  pendingBindPrompts: [],
  finalizeBindPrompts: [],
  bondedDevices: [],

  respondToBindPrompt: async (id: string, deviceName: string, os: string, accept: boolean) => {
    try {
      await invoke('respond_to_bind_request', { id, deviceName, os, accept });
      set((state) => ({
        pendingBindPrompts: state.pendingBindPrompts.filter(p => p.remote_endpoint_id !== id)
      }));
      // Note: We don't fetch bonded devices here anymore, as it's added in finalize
    } catch (e) {
      console.error("Failed to respond to bind request:", e);
    }
  },

  finalizeBindRequest: async (id: string, accept: boolean) => {
    try {
      await invoke('finalize_bind_request', { id, accept });
      set((state) => ({
        finalizeBindPrompts: state.finalizeBindPrompts.filter(p => p.remote_endpoint_id !== id)
      }));
      // Note: bondedDevices fetch is now handled by folder-sync-bind-success listener
    } catch (e) {
      console.error("Failed to finalize bind request:", e);
    }
  },

  fetchBondedDevices: async () => {
    try {
      const devices = await invoke<BondedDevice[]>('get_bonded_devices');
      set({ bondedDevices: devices });
    } catch (e) {
      console.error("Failed to fetch bonded devices:", e);
    }
  },

  removeBondedDevice: async (id: string) => {
    try {
      await invoke('remove_bonded_device', { id });
      get().fetchBondedDevices();
    } catch (e) {
      console.error("Failed to remove bonded device:", e);
    }
  },

  initListeners: () => {
    if (listenersDisposer) return;

    let unlisten: (() => void) | null = null;

    const setup = async () => {
      const u1 = await listen<FolderSyncBindPrompt>('folder-sync-bind-prompt', (event) => {
        set((state) => ({
          pendingBindPrompts: [...state.pendingBindPrompts, event.payload]
        }));
      });
      const u2 = await listen<FolderSyncBindPrompt>('folder-sync-bind-finalize-prompt', (event) => {
        set((state) => ({
          finalizeBindPrompts: [...state.finalizeBindPrompts, event.payload]
        }));
      });
      const u3 = await listen('folder-sync-bind-success', () => {
        get().fetchBondedDevices();
      });
      const u4 = await listen<Record<string, boolean>>('bonded-devices-status', (event) => {
        set((state) => ({
          bondedDevices: state.bondedDevices.map(d => ({
            ...d,
            is_online: event.payload[d.node_id] ?? false
          }))
        }));
      });
      const u5 = await listen('bonded-devices-updated', () => {
        get().fetchBondedDevices();
      });
      const u6 = await listen<Record<string, string>>('folder-health-status', (event) => {
        set((state) => ({
          bondedDevices: state.bondedDevices.map(d => ({
            ...d,
            sync_folders: d.sync_folders.map(f => ({
              ...f,
              status: event.payload[f.id] ?? f.status
            }))
          }))
        }));
      });
      unlisten = () => { u1(); u2(); u3(); u4(); u5(); u6(); };
    };

    setup();

    listenersDisposer = () => {
      if (unlisten) unlisten();
    };
  }
}));
