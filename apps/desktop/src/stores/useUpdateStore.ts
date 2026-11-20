import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { useTransferStore } from './useTransferStore';
import { saveSessionBeforeUpdate } from '../services/sessionResume';

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
  platforms?: Record<string, { url: string; signature?: string; size?: number }>;
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

export function hasActiveFileTransfers(): boolean {
  try {
    const transfers = useTransferStore.getState().activeTransfers;
    return transfers.some(
      (t: any) => !['cancelled', 'failed', 'completed'].includes(t.status)
    );
  } catch {
    return false;
  }
}

export function isUserOperating(): boolean {
  if (typeof document === 'undefined') return false;

  const activeEl = document.activeElement;
  if (
    activeEl &&
    (activeEl.tagName === 'INPUT' ||
      activeEl.tagName === 'TEXTAREA' ||
      (activeEl as HTMLElement).isContentEditable)
  ) {
    return true;
  }

  if (Date.now() - lastUserInteractionTime < 5000) {
    return true;
  }

  return hasActiveFileTransfers();
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
  checkForUpdates: (immediateHold?: boolean) => Promise<void>;
  evaluateAndApplyUpdate: (isUserHeld?: boolean) => Promise<void>;
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

    checkForUpdates: async (immediateHold = true) => {
      if (get().isChecking || get().isUpdating) return;

      set({ isChecking: true });

      try {
        const apiBase = (import.meta as any).env?.VITE_GPHOST_API_BASE || 'https://gphost.eu.cc';
        const url = `${apiBase}/api/v1/releases/send2me/latest?_t=${Date.now()}`;

        let manifest: ReleaseManifest | null = null;
        try {
          const jsonStr = await invoke<string>('cmd_fetch_update_manifest', { url });
          if (jsonStr) {
            manifest = JSON.parse(jsonStr);
          }
        } catch (nativeErr) {
          try {
            const resp = await fetch(url);
            if (resp.ok) {
              manifest = await resp.json();
            }
          } catch (e) {
            console.warn('[Send2Me OTA] Update check fetch notice:', e);
          }
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
          const cleanVer = manifest.version.replace(/^v/i, '');
          const targetPlatform = manifest.platforms?.['windows-x86_64'];
          const downloadUrl = targetPlatform?.url || manifest.url || `https://gphost.eu.cc/api/v1/releases/send2me/download/${cleanVer}`;

          // Check if active file transfers are currently in-flight
          if (hasActiveFileTransfers()) {
            set({
              manifest,
              targetVersion: manifest.version,
              status: 'waiting_timer', // QUEUED state
              isChecking: false,
            });
            // Pre-stage in background quietly
            invoke('cmd_download_and_stage_update', { url: downloadUrl, targetVersion: cleanVer }).catch(() => {});
            return;
          }

          set({
            manifest,
            targetVersion: manifest.version,
            isChecking: false,
          });

          if (immediateHold) {
            // Immediate Hold Flow: hold user and apply update
            await get().evaluateAndApplyUpdate(true);
          } else {
            set({ status: 'available' });
            invoke('cmd_download_and_stage_update', { url: downloadUrl, targetVersion: cleanVer }).catch(() => {});
          }
        } else {
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

    evaluateAndApplyUpdate: async (_isUserHeld = true) => {
      if (get().isUpdating) return;
      let manifest = get().manifest;
      const currentVer = get().currentVersion;

      if (!manifest) {
        await get().checkForUpdates(false);
        manifest = get().manifest;
      }

      if (!manifest?.version || !isNewerVersion(manifest.version, currentVer)) {
        return;
      }

      const cleanVer = manifest.version.replace(/^v/i, '');
      const targetPlatform = manifest.platforms?.['windows-x86_64'];
      const downloadUrl = targetPlatform?.url || manifest.url || `https://gphost.eu.cc/api/v1/releases/send2me/download/${cleanVer}`;

      // User activity protection: if active transfers are running, keep queued
      if (hasActiveFileTransfers()) {
        set({ status: 'waiting_timer', targetVersion: manifest.version });
        return;
      }

      // Save user session in memory / storage before applying update
      saveSessionBeforeUpdate();

      set({ isUpdating: true, status: 'downloading', progress: 35, targetVersion: manifest.version });

      let isStaged = false;
      try {
        isStaged = await invoke<boolean>('cmd_check_update_staged', { targetVersion: cleanVer });
      } catch {}

      if (!isStaged) {
        set({ status: 'downloading', progress: 50 });
        try {
          await invoke('cmd_download_and_stage_update', { url: downloadUrl, targetVersion: cleanVer });
          isStaged = true;
        } catch (err: any) {
          set({ isUpdating: false, status: 'error', errorMessage: String(err) });
          return;
        }
      }

      if (isStaged) {
        set({ status: 'verifying', progress: 85 });
        try {
          await invoke('cmd_sync_windows_installed_version', { version: cleanVer }).catch(() => {});
          set({ status: 'restarting', progress: 100 });
          await new Promise((r) => setTimeout(r, 450));
          await invoke('cmd_apply_staged_update', { targetVersion: cleanVer });
        } catch (err: any) {
          set({ isUpdating: false, status: 'error', errorMessage: String(err) });
        }
      }
    },

    downloadAndApplyUpdate: async (manifest: ReleaseManifest) => {
      set({ manifest, targetVersion: manifest.version });
      await get().evaluateAndApplyUpdate(true);
    },
  };
});
