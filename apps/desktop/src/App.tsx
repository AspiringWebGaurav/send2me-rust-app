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
import { invoke } from "@tauri-apps/api/core";
import { MotionConfig } from "framer-motion";
import { isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';

import { disposeDeviceListeners } from "./stores/useDeviceStore";
import { useTransferStore, disposeTransferListeners } from "./stores/useTransferStore";
import { useSyncStore, disposeSyncListeners } from "./stores/useSyncStore";
import { disposeHistoryListeners } from "./stores/useHistoryStore";
import { useSettingsStore } from "./stores/useSettingsStore";
import { useAppStore } from "./stores/useAppStore";
import { useUpdateStore } from "./stores/useUpdateStore";

export default function App() {
  const settings = useSettingsStore(state => state.settings);
  const fetchSettings = useSettingsStore(state => state.fetchSettings);
  const fetchAppInfo = useAppStore(state => state.fetchAppInfo);

  useEffect(() => {
    // Bring window to foreground on top of other windows immediately on launch
    invoke("show_main_window").catch(() => {});

    fetchSettings();
    fetchAppInfo();

    useTransferStore.getState().initListeners();
    useSyncStore.getState().initListeners();

    // Automated background update lifecycle (1:1 ScheduleMe parity: 2.5s silent boot check, zero user clicks required)
    const updateTimeout = setTimeout(() => {
      useUpdateStore.getState().checkForUpdates();
    }, 2500);

    let lastFocusCheck = Date.now();
    const handleFocus = () => {
      const now = Date.now();
      if (now - lastFocusCheck > 30000) {
        lastFocusCheck = now;
        useUpdateStore.getState().checkForUpdates();
      }
    };
    window.addEventListener('focus', handleFocus);

    const handleOnline = () => {
      useUpdateStore.getState().checkForUpdates();
    };
    window.addEventListener('online', handleOnline);

    const updateInterval = setInterval(() => {
      useUpdateStore.getState().checkForUpdates();
    }, 60000);

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
      clearInterval(updateInterval);
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
