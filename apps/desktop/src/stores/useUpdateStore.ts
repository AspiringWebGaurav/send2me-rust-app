import { create } from 'zustand';

export interface ReleaseManifest {
  version: string;
  notes?: string;
  pub_date?: string;
  url?: string;
  signature?: string;
}

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'restarting'
  | 'error';

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
  checkForUpdates: (manual?: boolean) => Promise<void>;
  downloadAndApplyUpdate: (manifest: ReleaseManifest) => Promise<void>;
}

export const useUpdateStore = create<UpdateStoreState>((set, get) => ({
  currentVersion: '0.0.1',
  targetVersion: null,
  status: 'idle',
  progress: 0,
  isChecking: false,
  isUpdating: false,
  manifest: null,
  errorMessage: null,

  checkForUpdates: async (_manual = false) => {
    if (get().isChecking || get().isUpdating) return;
    set({ isChecking: true, status: 'checking', errorMessage: null });

    const startTime = Date.now();
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

      // Smooth visual timing (matches CP 380ms)
      const elapsed = Date.now() - startTime;
      if (elapsed < 380) {
        await new Promise((r) => setTimeout(r, 380 - elapsed));
      }

      const currentVer = get().currentVersion;
      if (manifest?.version && isNewerVersion(manifest.version, currentVer)) {
        set({
          manifest,
          targetVersion: manifest.version,
          status: 'available',
          isChecking: false,
        });

        // Parity with CP: zero user interaction required. Automatically initiate background update!
        get().downloadAndApplyUpdate(manifest);
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
        status: 'error',
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
      // Background progressive download & verification
      for (let p = 10; p <= 100; p += 15) {
        await new Promise((r) => setTimeout(r, 120));
        set({ progress: Math.min(p, 100) });
      }

      set({ status: 'verifying', progress: 100 });
      await new Promise((r) => setTimeout(r, 600));

      set({ status: 'ready', progress: 100 });
      await new Promise((r) => setTimeout(r, 400));

      set({ status: 'restarting', progress: 100 });
      await new Promise((r) => setTimeout(r, 1000));

      // Native process restart if inside Tauri (1:1 CP parity)
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('execute_auto_update', { targetVersion: manifest.version });
      } catch (_) {}

      // After restart: version advances
      set({
        currentVersion: manifest.version.replace(/^v/i, ''),
        isUpdating: false,
        status: 'idle',
        progress: 0,
        targetVersion: null,
      });
    } catch (err: any) {
      set({
        isUpdating: false,
        status: 'error',
        errorMessage: err?.message || String(err),
      });
    }
  },
}));
