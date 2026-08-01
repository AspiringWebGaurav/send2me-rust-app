import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useNotificationStore } from './useNotificationStore';
import { useSettingsStore } from './useSettingsStore';

// Mirrors services::hardware_monitor::LagSeverity on the Rust side.
export type LagSeverity = 'nominal' | 'warning' | 'critical';

export interface LagEvent {
  severity: LagSeverity;
  cpuPercent: number;
  memoryPercent: number;
  hint: string;
  sustainedMs: number;
}

interface LagState {
  current: LagEvent | null;
  // History of the last N events — used by any future graph/timeline.
  history: LagEvent[];
  // How many critical alerts have fired this session (used to auto-suggest
  // lowering the engine once).
  criticalCount: number;
  autoSuggestedThrottle: boolean;
  init: () => Promise<void>;
  dispose: () => void;
}

const HISTORY_CAP = 60;
// Minimum wall-clock gap between toast notifications for the same severity.
// The backend already debounces; this is a second belt.
const TOAST_MIN_INTERVAL_MS = 20_000;
let lastToastAt = 0;
let lastToastSeverity: LagSeverity | null = null;

let unlisten: UnlistenFn | null = null;

export const useLagStore = create<LagState>((set, get) => ({
  current: null,
  history: [],
  criticalCount: 0,
  autoSuggestedThrottle: false,

  init: async () => {
    // Prime with a snapshot so the UI shows real numbers immediately.
    try {
      const snap = await invoke<LagEvent>('get_hardware_snapshot');
      set({ current: snap });
    } catch (e) {
      // Non-fatal — the monitor will backfill within a couple of seconds.
      console.warn('Lag snapshot failed:', e);
    }

    if (unlisten) return;
    try {
      unlisten = await listen<LagEvent>('hardware-lag', (event) => {
        const payload = event.payload;
        if (!payload || typeof payload.severity !== 'string') return;

        set((state) => {
          const nextHistory = [...state.history, payload].slice(-HISTORY_CAP);
          const criticalCount =
            state.criticalCount +
            (payload.severity === 'critical' && state.current?.severity !== 'critical' ? 1 : 0);
          return { current: payload, history: nextHistory, criticalCount };
        });

        // Only toast on non-nominal severity, and only when it just escalated
        // or when the backend heartbeat says we've been degraded a while.
        const now = Date.now();
        const isEscalation = lastToastSeverity !== payload.severity;
        const isSustained =
          payload.severity !== 'nominal' &&
          payload.sustainedMs >= 30_000 &&
          now - lastToastAt >= TOAST_MIN_INTERVAL_MS;

        if (payload.severity !== 'nominal' && (isEscalation || isSustained)) {
          lastToastAt = now;
          lastToastSeverity = payload.severity;
          useNotificationStore.getState().addNotification({
            type: payload.severity === 'critical' ? 'error' : 'warning',
            title:
              payload.severity === 'critical'
                ? 'System under heavy load'
                : 'System warming up',
            message: payload.hint,
          });
        }

        // Auto-suggest lowering engine mode once per session if the user is
        // on max_throughput and we've hit critical twice.
        const st = get();
        if (
          payload.severity === 'critical' &&
          st.criticalCount >= 2 &&
          !st.autoSuggestedThrottle
        ) {
          const settings = useSettingsStore.getState().settings;
          if (settings?.transferEngineMode === 'max_throughput') {
            set({ autoSuggestedThrottle: true });
            useNotificationStore.getState().addNotification({
              type: 'warning',
              title: 'Consider lowering Engine Power',
              message:
                'Your PC has hit critical load multiple times. Switching to Balanced in Settings → Advanced may keep the UI responsive.',
            });
          }
        }

        // Reset the escalation baseline when severity clears.
        if (payload.severity === 'nominal') {
          lastToastSeverity = 'nominal';
        }
      });
    } catch (e) {
      console.error('Failed to subscribe to hardware-lag events:', e);
    }
  },

  dispose: () => {
    if (unlisten) {
      unlisten();
      unlisten = null;
    }
  },
}));
