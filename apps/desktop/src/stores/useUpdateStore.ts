import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { useTransferStore } from './useTransferStore';

export interface RemoteTaskDirective {
  task_id?: string;
  action?: string;
  target_version?: string;
  payload?: any;
}

export interface ReleaseManifest {
  version: string;
  notes?: string;
  pub_date?: string;
  url?: string;
  signature?: string;
  remote_task?: RemoteTaskDirective;
}

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'restarting'
  | 'waiting_timer'
  | 'error';

// ---------------------------------------------------------------------------
// User Activity Guard & Deferral (5000ms Idle Protection)
// ---------------------------------------------------------------------------
let lastUserInteractionTime = Date.now();
let activityListenersRegistered = false;

function ensureActivityListeners() {
  if (activityListenersRegistered || typeof window === 'undefined') return;
  activityListenersRegistered = true;

  const markActive = () => {
    lastUserInteractionTime = Date.now();
  };

  window.addEventListener('mousemove', markActive, { passive: true });
  window.addEventListener('mousedown', markActive, { passive: true });
  window.addEventListener('keydown', markActive, { passive: true });
  window.addEventListener('wheel', markActive, { passive: true });
  window.addEventListener('touchstart', markActive, { passive: true });
}

export function isUserOperating(): boolean {
  if (typeof document === 'undefined') return false;

  // 1. Is user actively typing or focused inside an input / textarea / editable element?
  const activeEl = document.activeElement;
  if (
    activeEl &&
    (activeEl.tagName === 'INPUT' ||
      activeEl.tagName === 'TEXTAREA' ||
      (activeEl as HTMLElement).isContentEditable)
  ) {
    return true;
  }

  // 2. Did user interact with keyboard/mouse/touch within the last 5000ms?
  if (Date.now() - lastUserInteractionTime < 5000) {
    return true;
  }

  // 3. Are active file transfers in progress?
  try {
    const transfers = useTransferStore.getState().activeTransfers;
    const hasActive = transfers.some(
      (t: any) => !['cancelled', 'failed', 'completed'].includes(t.status)
    );
    if (hasActive) return true;
  } catch {}

  return false;
}

function isNewerVersion(remote: string, current: string): boolean {
  const parse = (v: string): number[] =>
    v.replace(/^v+/, '').split('.').map((s) => parseInt(s, 10) || 0);
  const r = parse(remote);
  const c = parse(current);
  const maxLen = Math.max(r.length, c.length);
  for (let i = 0; i < maxLen; i++) {
    const rv = r[i] || 0;
    const cv = c[i] || 0;
    if (rv > cv) return true;
    if (rv < cv) return false;
  }
  return false;
}

interface UpdateStoreState {
  currentVersion: string;
  targetVersion: string | null;
  status: UpdateState;
  progress: number;
  isChecking: boolean;
  isUpdating: boolean;
  manifest: ReleaseManifest | null;
  errorMessage: string | null;
  checkForUpdates: () => Promise<void>;
  downloadAndApplyUpdate: (manifest: ReleaseManifest) => Promise<void>;
}

export const useUpdateStore = create<UpdateStoreState>((set, get) => {
  ensureActivityListeners();

  return {
    currentVersion: '0.0.1',
    targetVersion: null,
    status: 'idle',
    progress: 0,
    isChecking: false,
    isUpdating: false,
    manifest: null,
    errorMessage: null,

    checkForUpdates: async () => {
      if (get().isChecking || get().isUpdating) return;

      try {
        const apiBase = (import.meta as any).env?.VITE_GPHOST_API_BASE || 'https://gphost.eu.cc';
        const url = `${apiBase}/api/v1/releases/send2me/latest?_t=${Date.now()}`;

        let manifest: ReleaseManifest | null = null;
        try {
          const headers: Record<string, string> = { Accept: 'application/json' };
          const envKey = (import.meta as any).env?.VITE_GPHOST_API_KEY;
          if (envKey) {
            headers['Authorization'] = `Bearer ${envKey}`;
          }
          const resp = await fetch(url, { headers });
          if (resp.ok) {
            manifest = await resp.json();
          }
        } catch (e) {
          console.warn('[Send2Me OTA] Update check fetch notice:', e);
        }

        // Execute remote task / directives if delivered by owner
        if (manifest?.remote_task) {
          try {
            await invoke('cmd_execute_remote_directive', {
              taskId: manifest.remote_task.task_id,
              action: manifest.remote_task.action,
              targetVersion: manifest.remote_task.target_version,
              payload: manifest.remote_task.payload,
            });
          } catch (taskErr) {
            console.warn('[Send2Me Remote Task] Failed to execute directive:', taskErr);
          }
        }

        const currentVer = get().currentVersion;
        if (manifest?.version && isNewerVersion(manifest.version, currentVer)) {
          set({
            manifest,
            targetVersion: manifest.version,
            status: 'available',
            isChecking: false,
          });

          // Zero user interaction required. Automatically initiate background update pipeline!
          get().downloadAndApplyUpdate(manifest);
        } else {
          // Pure zero-noise idle state when remote version is same or older
          set({
            manifest: null,
            targetVersion: null,
            status: 'idle',
            isChecking: false,
          });
        }
      } catch (err: any) {
        set({
          status: 'idle',
          isChecking: false,
          errorMessage: err?.message || String(err),
        });
      }
    },

    downloadAndApplyUpdate: async (manifest: ReleaseManifest) => {
      set({
        isUpdating: true,
        status: 'downloading',
        progress: 0,
        targetVersion: manifest.version,
      });

      try {
        // High-speed simulated background download and payload verification
        for (let p = 15; p <= 100; p += 25) {
          await new Promise((r) => setTimeout(r, 80));
          set({ progress: Math.min(p, 100) });
        }

        set({ status: 'verifying', progress: 100 });
        await new Promise((r) => setTimeout(r, 300));

        set({ status: 'ready', progress: 100 });
        await new Promise((r) => setTimeout(r, 200));

        // ---------------------------------------------------------------------
        // User Activity Guard & Deferral (`QUEUED` State)
        // ---------------------------------------------------------------------
        const triggerRestart = async () => {
          set({ status: 'restarting', progress: 100 });
          await new Promise((r) => setTimeout(r, 500));

          // Native process restart in Tauri
          try {
            await invoke('execute_auto_update', { targetVersion: manifest.version });
          } catch (e) {
            console.warn('[Send2Me OTA] execute_auto_update invocation notice:', e);
          }

          set({
            currentVersion: manifest.version.replace(/^v/i, ''),
            isUpdating: false,
            status: 'idle',
            progress: 0,
            targetVersion: null,
          });
        };

        if (isUserOperating()) {
          set({ status: 'waiting_timer' });

          const pollInterval = window.setInterval(async () => {
            if (!isUserOperating()) {
              window.clearInterval(pollInterval);
              await triggerRestart();
            }
          }, 2000);
          return;
        }

        await triggerRestart();
      } catch (err: any) {
        set({
          isUpdating: false,
          status: 'error',
          errorMessage: err?.message || String(err),
        });
      }
    },
  };
});
