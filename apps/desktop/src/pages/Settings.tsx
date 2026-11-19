import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Settings as SettingsIcon, Trash2, Copy, Check, Sliders, Palette, RefreshCw, Info } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "../components/ui/Card";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useAppStore } from "../stores/useAppStore";
import { useNotificationStore } from "../stores/useNotificationStore";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "../lib/utils";

type SettingsTab = 'general' | 'appearance' | 'sync' | 'about';

interface ToggleProps {
  checked: boolean;
  onChange: () => void;
  label: string;
  variant?: 'primary' | 'warning';
  disabled?: boolean;
}

function Toggle({ checked, onChange, label, variant = 'primary', disabled }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={disabled ? undefined : onChange}
      disabled={disabled}
      className={cn(
        "relative w-9 h-5 rounded-full flex items-center transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        checked
          ? variant === 'warning' ? 'bg-warning' : 'bg-primary'
          : 'bg-secondary border border-border/60'
      )}
    >
      <span
        className={cn(
          "absolute w-3.5 h-3.5 bg-white rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
          checked ? 'translate-x-4.5' : 'translate-x-0.5'
        )}
      />
    </button>
  );
}

interface RowProps {
  title: string;
  description: string;
  children: React.ReactNode;
  divider?: boolean;
  emphasis?: boolean;
}

function Row({ title, description, children, divider, emphasis }: RowProps) {
  return (
    <>
      <div className="flex items-center justify-between gap-4 py-1.5">
        <div className="min-w-0 flex-1">
          <div className={cn("font-medium text-xs sm:text-[13px] leading-tight", emphasis && "text-warning")}>{title}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug max-w-md">{description}</div>
        </div>
        <div className="shrink-0">{children}</div>
      </div>
      {divider && <div className="w-full h-px bg-border/40" />}
    </>
  );
}

export function Settings() {
  const settings = useSettingsStore(s => s.settings);
  const fetchSettings = useSettingsStore(s => s.fetchSettings);
  const updateSettings = useSettingsStore(s => s.updateSettings);
  const appInfo = useAppStore(s => s.appInfo);
  const fetchAppInfo = useAppStore(s => s.fetchAppInfo);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const location = useLocation();
  const navigate = useNavigate();
  const [isHighlightingSync, setIsHighlightingSync] = useState(false);
  const [hwid, setHwid] = useState<string>('');
  const [copiedHwid, setCopiedHwid] = useState(false);

  useEffect(() => {
    fetchSettings();
    fetchAppInfo();
    invoke<string>('get_hardware_id').then(setHwid).catch(console.error);
  }, [fetchSettings, fetchAppInfo]);

  const handleCopyHwid = () => {
    if (!hwid) return;
    navigator.clipboard.writeText(hwid);
    setCopiedHwid(true);
    useNotificationStore.getState().addNotification({
      type: 'success',
      title: 'HWID Copied',
      message: 'Hardware ID copied to clipboard',
    });
    setTimeout(() => setCopiedHwid(false), 2000);
  };

  useEffect(() => {
    if (settings && location.state?.highlight === 'folder-sync') {
      setActiveTab('sync');
      setIsHighlightingSync(true);
      setTimeout(() => setIsHighlightingSync(false), 3000);
    }
  }, [settings, location.state?.highlight]);

  const [isUninstalling, setIsUninstalling] = useState(false);

  const handleUninstall = async () => {
    if (!window.confirm("Are you sure you want to uninstall Send2Me? This will close the application and launch the system uninstaller.")) {
      return;
    }
    setIsUninstalling(true);
    try {
      await invoke("uninstall_application");
    } catch (err) {
      useNotificationStore.getState().addNotification({
        type: 'error',
        title: 'Uninstall Action',
        message: err instanceof Error ? err.message : String(err),
      });
      setIsUninstalling(false);
    }
  };

  const handleSelectFolder = async () => {
    if (!settings) return;
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: settings.downloadsFolder,
      });
      if (selected) updateSettings({ downloadsFolder: selected as string });
    } catch (err) {
      useNotificationStore.getState().addNotification({
        type: 'error',
        title: 'Could not select folder',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  if (!settings) return (
    <div className="flex flex-col h-full">
      <header className="h-10 shrink-0 flex items-center px-2 sm:px-3 mb-2">
        <h2 className="text-lg font-semibold tracking-tight">Settings</h2>
      </header>
      <div className="flex-1 px-2 sm:px-3 pb-2 min-h-0">
        <div className="h-48 rounded-xl bg-secondary/30 animate-pulse" />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden select-none">
      {/* Settings Header with Tab Menu */}
      <header className="h-10 shrink-0 flex items-center justify-between px-2 sm:px-3 mb-2 gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Settings</h2>

        {/* Category Menu Pill Tabs */}
        <div className="flex items-center gap-1 bg-secondary/40 p-0.5 rounded-lg border border-border/50 shrink-0">
          <button
            onClick={() => setActiveTab('general')}
            className={cn(
              "h-7 px-2.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer",
              activeTab === 'general'
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">General</span>
          </button>
          <button
            onClick={() => setActiveTab('appearance')}
            className={cn(
              "h-7 px-2.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer",
              activeTab === 'appearance'
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Palette className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Appearance</span>
          </button>
          <button
            onClick={() => setActiveTab('sync')}
            className={cn(
              "h-7 px-2.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer",
              activeTab === 'sync'
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sync & Engine</span>
          </button>
          <button
            onClick={() => setActiveTab('about')}
            className={cn(
              "h-7 px-2.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer",
              activeTab === 'about'
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Info className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">About</span>
          </button>
        </div>
      </header>

      {/* Main Settings Body - Single View with zero outer vertical scroll */}
      <div className="flex-1 px-2 sm:px-3 pb-1 min-h-0 overflow-y-auto">
        <AnimatePresence mode="wait" initial={false}>
          {activeTab === 'general' && (
            <motion.div
              key="general"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14, ease: "easeOut" }}
              className="space-y-3"
            >
              <Card>
                <CardContent className="p-4 space-y-2.5 pt-4">
                  <Row title="Default Download Location" description="Where received files are saved" divider>
                    <button
                      onClick={handleSelectFolder}
                      className="text-xs bg-secondary hover:bg-secondary/80 text-foreground text-right border-none rounded-lg px-2.5 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring font-medium max-w-[200px] cursor-pointer transition-colors truncate"
                      title={settings.downloadsFolder}
                    >
                      {settings.downloadsFolder}
                    </button>
                  </Row>

                  <Row title="Auto-Accept Transfers" description="Automatically accept incoming transfers from trusted paired devices" divider>
                    <Toggle
                      checked={settings.autoAcceptTransfers}
                      onChange={() => updateSettings({ autoAcceptTransfers: !settings.autoAcceptTransfers })}
                      label="Toggle auto-accept"
                    />
                  </Row>

                  <Row title="Desktop Notifications" description="Show notifications when transfers complete or incoming requests arrive" divider>
                    <Toggle
                      checked={settings.notificationsEnabled}
                      onChange={() => updateSettings({ notificationsEnabled: !settings.notificationsEnabled })}
                      label="Toggle notifications"
                    />
                  </Row>

                  <Row
                    title="Hardware Identifier (HWID)"
                    description="Unique device signature for network identity and device verification."
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs bg-secondary/80 px-2 py-1 rounded-md border border-border/60 text-foreground/90 tabular-nums select-all">
                        {hwid || "Detecting..."}
                      </span>
                      <button
                        onClick={handleCopyHwid}
                        disabled={!hwid}
                        className="p-1 hover:bg-secondary rounded-md text-muted-foreground hover:text-foreground transition-colors border border-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                        title="Copy HWID"
                        aria-label="Copy Hardware ID"
                      >
                        {copiedHwid ? (
                          <Check className="w-3.5 h-3.5 text-success" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </Row>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {activeTab === 'appearance' && (
            <motion.div
              key="appearance"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14, ease: "easeOut" }}
              className="space-y-3"
            >
              <Card>
                <CardContent className="p-4 space-y-2.5 pt-4">
                  <Row title="Theme" description="Select the application visual theme" divider>
                    <select
                      value={settings.theme}
                      onChange={(e) => updateSettings({ theme: e.target.value as any })}
                      className="bg-secondary text-foreground border-none rounded-lg px-2.5 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring appearance-none font-medium min-w-[110px] cursor-pointer hover:bg-secondary/80 transition-colors"
                    >
                      <option value="system">System</option>
                      <option value="light">Light Mode</option>
                      <option value="dark">Dark Mode</option>
                    </select>
                  </Row>

                  <Row title="Animations" description="Enable fluid UI transitions and physics effects" divider>
                    <Toggle
                      checked={settings.animationsEnabled}
                      onChange={() => updateSettings({ animationsEnabled: !settings.animationsEnabled })}
                      label="Toggle animations"
                    />
                  </Row>

                  <Row title="Dynamic RGB Effects" description="App illuminates subtly when high-speed file transfer is active">
                    <Toggle
                      checked={settings.rgbMode}
                      onChange={() => updateSettings({ rgbMode: !settings.rgbMode })}
                      label="Toggle RGB effects"
                    />
                  </Row>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {activeTab === 'sync' && (
            <motion.div
              key="sync"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14, ease: "easeOut" }}
              className="space-y-3"
            >
              <Card className={cn("transition-all duration-700", isHighlightingSync ? "ring-2 ring-primary shadow-lg shadow-primary/20 bg-primary/5" : "")}>
                <CardContent className="p-4 space-y-2.5 pt-4">
                  <Row title="Folder Sync (Beta)" description="Automatically synchronize folders with connected devices in real time" divider>
                    <Toggle
                      checked={settings.enableFolderSync}
                      onChange={() => {
                        const newEnabled = !settings.enableFolderSync;
                        updateSettings({ enableFolderSync: newEnabled });
                        if (newEnabled) {
                          navigate('/', { state: { highlightCard: 'folder-sync' } });
                        }
                      }}
                      label="Toggle folder sync"
                      variant="warning"
                    />
                  </Row>

                  <Row
                    title="Engine Power Control"
                    description="Balance QUIC chunk concurrency between router safety and max network throughput"
                    divider
                    emphasis
                  >
                    <select
                      value={settings.transferEngineMode}
                      onChange={(e) => {
                        const mode = e.target.value as any;
                        let connections = 8;
                        if (mode === "medium") connections = 16;
                        else if (mode === "max_throughput") connections = 32;
                        updateSettings({ transferEngineMode: mode, maxParallelConnections: connections });
                      }}
                      className="bg-secondary text-foreground border-none rounded-lg px-2.5 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-warning appearance-none font-medium min-w-[130px] cursor-pointer hover:bg-secondary/80 transition-colors"
                    >
                      <option value="balanced">Recommended (8)</option>
                      <option value="medium">Medium (16)</option>
                      <option value="max_throughput">High (32 streams)</option>
                    </select>
                  </Row>

                  <Row
                    title="Max Parallel Streams"
                    description="Concurrent QUIC transfer streams spawned across peers (1–32)"
                    divider
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground tabular-nums w-5 text-right">{settings.maxParallelConnections}</span>
                      <input
                        type="range"
                        min="1"
                        max="32"
                        value={settings.maxParallelConnections}
                        disabled
                        className="w-24 accent-warning opacity-50 cursor-not-allowed"
                      />
                    </div>
                  </Row>

                  <Row
                    title="Self-Healing Auto-Resume"
                    description="Automatically re-request missing chunks indefinitely on packet drop"
                  >
                    <Toggle
                      checked={settings.autoResumeTransfers}
                      onChange={() => updateSettings({ autoResumeTransfers: !settings.autoResumeTransfers })}
                      label="Toggle auto-resume"
                      variant="warning"
                    />
                  </Row>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {activeTab === 'about' && (
            <motion.div
              key="about"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14, ease: "easeOut" }}
              className="space-y-3"
            >
              <Card>
                <CardContent className="p-4 space-y-3 pt-4">
                  <div className="flex items-center justify-between pb-3 border-b border-border/40">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <SettingsIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-semibold text-sm tracking-tight">{appInfo?.name || "Send2Me"}</div>
                        <div className="text-[11px] text-muted-foreground tabular-nums">
                          Version {appInfo?.version || "0.0.1"} · {appInfo?.os} {appInfo?.arch}
                        </div>
                      </div>
                    </div>
                    {hwid && (
                      <span className="font-mono text-[10px] bg-secondary/80 px-2 py-0.5 rounded border border-border/50 text-muted-foreground tabular-nums">
                        HWID: {hwid}
                      </span>
                    )}
                  </div>

                  {hwid && (
                    <Row
                      title="Hardware Identifier (HWID)"
                      description="Unique device machine fingerprint for security and access verification"
                      divider
                    >
                      <button
                        onClick={handleCopyHwid}
                        className="flex items-center gap-1.5 font-mono text-xs bg-secondary hover:bg-secondary/80 text-foreground px-2.5 py-1 rounded-md border border-border/60 transition-colors cursor-pointer"
                        title="Click to copy HWID"
                      >
                        <span>{hwid}</span>
                        {copiedHwid ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                      </button>
                    </Row>
                  )}

                  <Row
                    title="Uninstall Application"
                    description="Completely remove Send2Me, desktop shortcuts, and firewall rules"
                    emphasis
                  >
                    <button
                      onClick={handleUninstall}
                      disabled={isUninstalling}
                      className="flex items-center gap-1.5 bg-danger text-danger-foreground hover:bg-danger/90 border-none rounded-lg px-3 py-1.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-danger cursor-pointer transition-all active:scale-[0.97] shadow-sm disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {isUninstalling ? "Launching..." : "Uninstall"}
                    </button>
                  </Row>

                  <div className="pt-2 text-center text-[11px] text-muted-foreground/70">
                    Designed & Maintained by{" "}
                    <a href="https://gauravpatil.site" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
                      Gaurav
                    </a>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
