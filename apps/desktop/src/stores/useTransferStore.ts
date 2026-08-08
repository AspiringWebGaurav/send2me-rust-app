import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Transfer } from '../models/transfer';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { useSettingsStore } from './useSettingsStore';
import { useNotificationStore } from './useNotificationStore';
import { useHistoryStore } from './useHistoryStore';

interface TransferState {
  activeTransfers: Transfer[];
  pendingRequests: Transfer[];
  fetchActiveTransfers: () => Promise<void>;
  cancelTransfer: (id: string) => Promise<void>;
  pauseTransfer: (id: string) => Promise<void>;
  respondToRequest: (id: string, accept: boolean, customPath?: string) => Promise<void>;
  clearCompletedTransfers: () => void;
  initListeners: () => void;
}

let listenersDisposer: (() => void) | null = null;

export function disposeTransferListeners() {
  if (listenersDisposer) {
    listenersDisposer();
    listenersDisposer = null;
  }
}

export const useTransferStore = create<TransferState>((set, get) => ({
  activeTransfers: [],
  pendingRequests: [],
  fetchActiveTransfers: async () => {
    try {
      const transfers = await invoke<Transfer[]>('get_active_transfers');
      set({ activeTransfers: transfers });
    } catch (e) {
      console.error(e);
      useNotificationStore.getState().addNotification({
        type: 'error',
        title: 'Could not load transfers',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  },
  cancelTransfer: async (id: string) => {
    try {
      await invoke('cancel_transfer', { id });
      const transfers = await invoke<Transfer[]>('get_active_transfers');
      set({ activeTransfers: transfers });
    } catch (e) {
      console.error(e);
      useNotificationStore.getState().addNotification({
        type: 'error',
        title: 'Cancel failed',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  },
  pauseTransfer: async (id: string) => {
    try {
      await invoke('pause_transfer', { id });
      get().fetchActiveTransfers();
    } catch (e) {
      console.error(e);
      useNotificationStore.getState().addNotification({
        type: 'error',
        title: 'Pause/resume failed',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  },
  clearCompletedTransfers: () => {
    set((state) => ({
      activeTransfers: state.activeTransfers.filter(t => !['completed', 'failed', 'cancelled'].includes(t.status))
    }));
  },
  respondToRequest: async (id: string, accept: boolean, customPath?: string) => {
    // Snapshot the request before we optimistically remove it, so we can restore on failure.
    const existing = get().pendingRequests.find(r => r.id === id);
    set((state) => ({
      pendingRequests: state.pendingRequests.filter(req => req.id !== id)
    }));
    try {
      await invoke('respond_to_transfer', { id, accept, customPath });
    } catch (e) {
      console.error(e);
      // Roll back so the user can retry.
      if (existing) {
        set((state) => ({ pendingRequests: [...state.pendingRequests, existing] }));
      }
      useNotificationStore.getState().addNotification({
        type: 'error',
        title: accept ? 'Could not accept transfer' : 'Could not decline transfer',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  },
  initListeners: async () => {
    if (listenersDisposer) return;

    const sendOSNotification = async (title: string, body: string) => {
      const settings = useSettingsStore.getState().settings;
      if (!settings?.notificationsEnabled) return;
      let permissionGranted = await isPermissionGranted();
      if (!permissionGranted) {
        const permission = await requestPermission();
        permissionGranted = permission === 'granted';
      }
      if (permissionGranted) {
        sendNotification({ title, body });
      }
    };

    const unlistenTransferRequest = await listen<Transfer>('transfer-request', (event) => {
      set((state) => ({ pendingRequests: [...state.pendingRequests, event.payload] }));
      sendOSNotification("Incoming Transfer Request", `Someone wants to send you: ${event.payload.fileName}`);
    });

    const unlistenCancelRequest = await listen<string>('cancel-transfer-request', (event) => {
      set((state) => ({ pendingRequests: state.pendingRequests.filter(req => req.id !== event.payload) }));
      sendOSNotification("Transfer Cancelled", "The sender has cancelled the request.");
    });

    const unlistenProgress = await listen<Transfer>('transfer-progress', (event) => {
      let becameTerminal = false;
      set((state) => {
        const existingIndex = state.activeTransfers.findIndex(t => t.id === event.payload.id);
        const prev = existingIndex >= 0 ? state.activeTransfers[existingIndex] : null;
        const isIncoming = event.payload.direction === 'incoming';

        // Handle completion notification — flip label by direction so senders don't get "Successfully received".
        if (prev && prev.progress < 100 && event.payload.progress >= 100 && event.payload.status === 'completed') {
          if (isIncoming) {
            sendOSNotification("Transfer Complete", `Received: ${event.payload.fileName}`);
          } else {
            sendOSNotification("Transfer Complete", `Sent: ${event.payload.fileName}`);
          }
        }

        // Surface backend-side failures/cancels to the in-app toast so nothing is silent.
        const prevTerminal = prev && ['completed', 'failed', 'cancelled'].includes(prev.status);
        const nowTerminal = ['completed', 'failed', 'cancelled'].includes(event.payload.status);
        if (prev && !prevTerminal && nowTerminal) {
          becameTerminal = true;
          if (event.payload.status === 'failed') {
            useNotificationStore.getState().addNotification({
              type: 'error',
              title: 'Transfer failed',
              message: `${event.payload.fileName} did not complete.`,
            });
          }
        }

        // Preserve fine-grained local-stage progress across coarse updates.
        const merged: Transfer = prev
          ? {
              ...event.payload,
              localStage: event.payload.localStage ?? prev.localStage,
              localProgress: event.payload.localProgress ?? prev.localProgress,
              localMessage: event.payload.localMessage ?? prev.localMessage,
              stageLogs: prev.stageLogs,
              durationMs: prev.durationMs,
              startedAtLocal: prev.startedAtLocal,
            }
          : { ...event.payload, startedAtLocal: Date.now(), stageLogs: [] };
          
        if (nowTerminal && !prevTerminal && merged.startedAtLocal && !merged.durationMs) {
            merged.durationMs = Date.now() - merged.startedAtLocal;
        }

        if (existingIndex >= 0) {
          const updated = [...state.activeTransfers];
          updated[existingIndex] = merged;
          return { activeTransfers: updated };
        }
        return { activeTransfers: [...state.activeTransfers, merged] };
      });

      // Workaround: Rust never emits `history-updated`, so pull once when a transfer terminates
      // so the persisted history view reflects the just-finished transfer without a manual reload.
      if (becameTerminal) {
        useHistoryStore.getState().fetchHistory();
      }
    });

    // Fine-grained local-processing progress (Receiving → Compiling → Finalizing → Renaming → Done).
    // Fires ~10 Hz from the receiver so the second progress bar never freezes.
    const unlistenLocalProgress = await listen<{
      transferId: string;
      stage: 'receiving' | 'compiling' | 'finalizing' | 'renaming' | 'system_scan' | 'done';
      stagePercent: number;
      message: string;
    }>('transfer-local-progress', (event) => {
      const payload = event.payload;
      set((state) => {
        const idx = state.activeTransfers.findIndex(t => t.id === payload.transferId);
        if (idx < 0) return state;
        const updated = [...state.activeTransfers];
        const prevLogs = updated[idx].stageLogs || [];
        const lastLog = prevLogs[prevLogs.length - 1];
        
        let newLogs = prevLogs;
        if (!lastLog || lastLog.stage !== payload.stage) {
            newLogs = [...prevLogs, { stage: payload.stage, message: payload.message, time: Date.now() }];
        }
        
        updated[idx] = {
          ...updated[idx],
          localStage: payload.stage,
          localProgress: Math.max(0, Math.min(100, payload.stagePercent)),
          localMessage: payload.message,
          stageLogs: newLogs,
        };
        return { activeTransfers: updated };
      });
    });

    listenersDisposer = () => {
      unlistenTransferRequest();
      unlistenCancelRequest();
      unlistenProgress();
      unlistenLocalProgress();
    };
  }
}));
