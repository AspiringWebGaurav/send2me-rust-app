import { invoke } from '@tauri-apps/api/core';

export interface ResumeSession {
  route: string;
  selectedFiles?: string[];
  timestamp: number;
}

const STORAGE_KEY = 'send2me_resume_session';

/**
 * Saves current in-memory / UI session state to storage before an in-process update restart.
 */
export function saveSessionBeforeUpdate(custom?: Partial<ResumeSession>): void {
  try {
    const route = window.location.hash ? window.location.hash.replace(/^#/, '') : '/';
    const payload: ResumeSession = {
      route: route || '/',
      timestamp: Date.now(),
      ...custom,
    };
    const json = JSON.stringify(payload);
    sessionStorage.setItem(STORAGE_KEY, json);
    localStorage.setItem(STORAGE_KEY, json);
  } catch (err) {
    console.warn('[SessionResume] Failed to save session:', err);
  }
}

/**
 * Restores any pending session state after an update restart, then frees memory.
 */
export function restoreSessionAfterUpdate(): ResumeSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    // Immediately clear stored session to free memory and prevent loops
    sessionStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);

    // Call native Win32 working set trim to free any excess initialization memory
    invoke('cmd_trim_memory').catch(() => {});

    const parsed: ResumeSession = JSON.parse(raw);
    // Ignore sessions older than 5 minutes
    if (Date.now() - (parsed.timestamp || 0) > 300_000) {
      return null;
    }

    return parsed;
  } catch (err) {
    console.warn('[SessionResume] Failed to restore session:', err);
    return null;
  }
}

/**
 * Trims process working set memory via native Win32 API
 */
export function trimWorkingSetMemory(): void {
  try {
    invoke('cmd_trim_memory').catch(() => {});
  } catch {}
}
