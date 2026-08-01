import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
import { MotionConfig } from "framer-motion";
import { isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';

import { disposeDeviceListeners } from "./stores/useDeviceStore";
import { useTransferStore, disposeTransferListeners } from "./stores/useTransferStore";
import { useSyncStore, disposeSyncListeners } from "./stores/useSyncStore";
import { disposeHistoryListeners } from "./stores/useHistoryStore";
import { useSettingsStore } from "./stores/useSettingsStore";
import { useAppStore } from "./stores/useAppStore";
import { useLagStore } from "./stores/useLagStore";

export default function App() {
  const settings = useSettingsStore(state => state.settings);
  const fetchSettings = useSettingsStore(state => state.fetchSettings);
  const fetchAppInfo = useAppStore(state => state.fetchAppInfo);
  const initLag = useLagStore(state => state.init);
  const disposeLag = useLagStore(state => state.dispose);

  useEffect(() => {
    fetchSettings();
    fetchAppInfo();

    useTransferStore.getState().initListeners();
    useSyncStore.getState().initListeners();
    initLag();

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
      disposeDeviceListeners();
      disposeTransferListeners();
      disposeSyncListeners();
      disposeHistoryListeners();
      disposeLag();
    };
  }, [fetchSettings, fetchAppInfo, initLag, disposeLag]);

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
      <BrowserRouter>
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
      </BrowserRouter>
    </MotionConfig>
  );
}
