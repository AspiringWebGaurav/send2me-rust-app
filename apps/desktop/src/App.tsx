import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import { Dashboard } from "./pages/Dashboard";
import { Transfers } from "./pages/Transfers";
import { Devices } from "./pages/Devices";
import { History } from "./pages/History";
import { Settings } from "./pages/Settings";
import { FolderSync } from "./pages/FolderSync";
import { DriveRoom } from "./pages/DriveRoom";
import { DriveGuest } from "./pages/DriveGuest";
import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { MotionConfig } from "framer-motion";
import { isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';

import { disposeDeviceListeners } from "./stores/useDeviceStore";
import { useTransferStore, disposeTransferListeners } from "./stores/useTransferStore";
import { useSyncStore, disposeSyncListeners } from "./stores/useSyncStore";
import { disposeHistoryListeners } from "./stores/useHistoryStore";
import { useSettingsStore } from "./stores/useSettingsStore";
import { useAppStore } from "./stores/useAppStore";
import { useUpdateStore } from "./stores/useUpdateStore";
import { restoreSessionAfterUpdate } from "./services/sessionResume";

export default function App() {
  const settings = useSettingsStore(state => state.settings);
  const fetchSettings = useSettingsStore(state => state.fetchSettings);
  const fetchAppInfo = useAppStore(state => state.fetchAppInfo);

  useEffect(() => {
    fetchSettings();
    fetchAppInfo();

    useTransferStore.getState().initListeners();
    useSyncStore.getState().initListeners();

    // Check and restore previous session after an update restart (frees working set memory)
    const restored = restoreSessionAfterUpdate();
    if (restored?.route && window.location.hash !== `#${restored.route}`) {
      window.location.hash = restored.route;
    }

    // Smooth UI mounting delay on boot: check for updates
    const updateTimeout = setTimeout(() => {
      useUpdateStore.getState().checkForUpdates(true);
    }, 1500);

    let unlistenUiOpened: (() => void) | undefined;
    listen('ui-opened', () => {
      setTimeout(() => {
        useUpdateStore.getState().checkForUpdates(true);
      }, 500);
    }).then(u => { unlistenUiOpened = u; }).catch(() => {});

    let unlistenTrayUpdates: (() => void) | undefined;
    listen('tray-check-updates', () => {
      setTimeout(() => {
        useUpdateStore.getState().checkForUpdates(true);
      }, 300);
    }).then(u => { unlistenTrayUpdates = u; }).catch(() => {});

    let lastFocusCheck = Date.now();
    const handleFocus = () => {
      const now = Date.now();
      if (now - lastFocusCheck > 20000) {
        lastFocusCheck = now;
        setTimeout(() => {
          useUpdateStore.getState().checkForUpdates(true);
        }, 800);
      }
    };
    window.addEventListener('focus', handleFocus);

    const handleOnline = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        useUpdateStore.getState().checkForUpdates(true);
      }
    };
    window.addEventListener('online', handleOnline);

    // ScheduleMe 1:1 Parity: Zero background polling intervals in tray standby.
    // Update checks and downloads execute strictly when UI window is opened or on focus/manual check.

    // Best-effort: request desktop notification permission once at boot so the
    // first successful transfer notification isn't silently dropped.
    (async () => {
      try {
        if (!(await isPermissionGranted())) {
          await requestPermission();
        }
      } catch {
        // Notification permission is best-effort; ignore.
      }
    })();

    return () => {
      clearTimeout(updateTimeout);
      if (unlistenUiOpened) unlistenUiOpened();
      if (unlistenTrayUpdates) unlistenTrayUpdates();
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      disposeDeviceListeners();
      disposeTransferListeners();
      disposeSyncListeners();
      disposeHistoryListeners();
    };
  }, [fetchSettings, fetchAppInfo]);

  useEffect(() => {
    const applyTheme = (theme: string) => {
      if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    applyTheme(settings?.theme || 'system');

    if (settings?.theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyTheme('system');
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [settings?.theme]);

  useEffect(() => {
    if (settings?.animationsEnabled === false) {
      document.documentElement.classList.add('no-animations');
    } else {
      document.documentElement.classList.remove('no-animations');
    }
  }, [settings?.animationsEnabled]);

  return (
    <MotionConfig reducedMotion={settings?.animationsEnabled === false ? "always" : "never"}>
      <HashRouter>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="transfers" element={<Transfers />} />
            <Route path="devices" element={<Devices />} />
            <Route path="history" element={<History />} />
            <Route path="settings" element={<Settings />} />
            <Route path="sync" element={<FolderSync />} />
            <Route path="drive/host" element={<DriveRoom />} />
            <Route path="drive/guest" element={<DriveGuest />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </MotionConfig>
  );
}
