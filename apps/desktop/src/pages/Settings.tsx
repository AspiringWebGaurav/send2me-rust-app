import { useEffect, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Settings as SettingsIcon, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "../components/ui/Card";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useAppStore } from "../stores/useAppStore";
import { useNotificationStore } from "../stores/useNotificationStore";
import { open } from "@tauri-apps/plugin-dialog";
import { cn } from "../lib/utils";

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
        "relative w-10 h-6 rounded-full flex items-center transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        checked
          ? variant === 'warning' ? 'bg-warning' : 'bg-primary'
          : 'bg-secondary border border-border/60'
      )}
    >
      <span
        className={cn(
          "absolute w-4 h-4 bg-white rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
          checked ? 'translate-x-5' : 'translate-x-1'
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
      <div className="flex items-center justify-between gap-6 py-1">
        <div className="min-w-0">
          <div className={cn("font-semibold text-sm", emphasis && "text-warning")}>{title}</div>
          <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed max-w-md">{description}</div>
        </div>
        <div className="shrink-0">{children}</div>
      </div>
      {divider && <div className="w-full h-px bg-border/50" />}
    </>
  );
}

export function Settings() {
  const settings = useSettingsStore(s => s.settings);
  const fetchSettings = useSettingsStore(s => s.fetchSettings);
  const updateSettings = useSettingsStore(s => s.updateSettings);
  const appInfo = useAppStore(s => s.appInfo);
  const fetchAppInfo = useAppStore(s => s.fetchAppInfo);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const folderSyncRef = useRef<HTMLDivElement>(null);
  const [isHighlightingSync, setIsHighlightingSync] = useState(false);

  useEffect(() => {
    fetchSettings();
    fetchAppInfo();
  }, [fetchSettings, fetchAppInfo]);

  useEffect(() => {
    if (settings && location.state?.highlight === 'folder-sync' && folderSyncRef.current) {
      setTimeout(() => {
        folderSyncRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setIsHighlightingSync(true);
        setTimeout(() => setIsHighlightingSync(false), 3000);
      }, 100);
    }
  }, [settings, location.state?.highlight]);

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
      <header className="h-20 flex items-end px-6 lg:px-10 pb-5 sticky top-0 z-10 bg-gradient-to-b from-background via-background/90 to-transparent">
        <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>
      </header>
      <div className="flex-1 px-6 lg:px-10 pb-10 overflow-y-auto">
        <div className="max-w-3xl mx-auto space-y-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 rounded-2xl bg-secondary/30 animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <header className="h-20 flex items-end px-6 lg:px-10 pb-5 sticky top-0 z-10 bg-gradient-to-b from-background via-background/90 to-transparent">
        <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>
      </header>

      <div className="flex-1 px-6 lg:px-10 pb-10 overflow-y-auto">
        <div className="max-w-3xl mx-auto space-y-8">

          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-3"
          >
            <h3 className="text-xs font-semibold tracking-widest uppercase text-muted-foreground px-1">Appearance</h3>
            <Card>
              <CardContent className="p-6 space-y-5 pt-6">
                <Row title="Theme" description="Select the application theme" divider>
                  <select
                    value={settings.theme}
                    onChange={(e) => updateSettings({ theme: e.target.value as any })}
                    className="bg-secondary text-foreground border-none rounded-lg px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring appearance-none font-medium min-w-[120px] cursor-pointer hover:bg-secondary/80 transition-colors"
                  >
                    <option value="system">System</option>
                    <option value="light">Light Mode</option>
                    <option value="dark">Dark Mode</option>
                  </select>
                </Row>

                <Row title="Animations" description="Enable rich UI animations" divider>
                  <Toggle
                    checked={settings.animationsEnabled}
                    onChange={() => updateSettings({ animationsEnabled: !settings.animationsEnabled })}
                    label="Toggle animations"
                  />
                </Row>

                <Row title="Dynamic RGB Effects" description="App glows when a transfer is active">
                  <Toggle
                    checked={settings.rgbMode}
                    onChange={() => updateSettings({ rgbMode: !settings.rgbMode })}
                    label="Toggle RGB effects"
                  />
                </Row>
              </CardContent>
            </Card>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-3"
            ref={folderSyncRef}
          >
            <h3 className="text-xs font-semibold tracking-widest uppercase text-muted-foreground px-1">Sync</h3>
            <Card className={cn("transition-all duration-1000", isHighlightingSync ? "ring-2 ring-primary shadow-[0_0_15px_rgba(var(--primary),0.3)] bg-primary/5" : "")}>
              <CardContent className="p-6 space-y-5 pt-6">
                <Row title="Folder Sync (Beta)" description="Automatically sync a folder with connected devices. (Under active development)">
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
              </CardContent>
            </Card>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-3"
          >
            <h3 className="text-xs font-semibold tracking-widest uppercase text-muted-foreground px-1">General</h3>
            <Card>
              <CardContent className="p-6 space-y-5 pt-6">
                <Row title="Default Download Location" description="Where received files are saved" divider>
                  <button
                    onClick={handleSelectFolder}
                    className="text-xs bg-secondary hover:bg-secondary/80 text-foreground text-right border-none rounded-lg px-3 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring font-medium max-w-[240px] cursor-pointer transition-colors truncate"
                    title={settings.downloadsFolder}
                  >
                    {settings.downloadsFolder}
                  </button>
                </Row>

                <Row title="Auto-Accept Transfers" description="Automatically accept files from trusted devices" divider>
                  <Toggle
                    checked={settings.autoAcceptTransfers}
                    onChange={() => updateSettings({ autoAcceptTransfers: !settings.autoAcceptTransfers })}
                    label="Toggle auto-accept"
                  />
                </Row>

                <Row title="Desktop Notifications" description="Show alerts for incoming files">
                  <Toggle
                    checked={settings.notificationsEnabled}
                    onChange={() => updateSettings({ notificationsEnabled: !settings.notificationsEnabled })}
                    label="Toggle notifications"
                  />
                </Row>
              </CardContent>
            </Card>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-3"
          >
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              aria-expanded={showAdvanced}
              className="w-full flex items-center justify-between p-4 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-all duration-200 border border-border/50 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group"
            >
              <div>
                <h3 className="text-sm font-semibold tracking-tight">Advanced Network Engine (APTE)</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Configure hardware limits and parallel transfer topology rules.</p>
              </div>
              <motion.div
                animate={{ rotate: showAdvanced ? 180 : 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              >
                <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </motion.div>
            </button>

            <AnimatePresence initial={false}>
              {showAdvanced && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <Card className="border-warning/25">
                    <CardContent className="p-6 space-y-5 pt-6">
                      <Row
                        title="Engine Power Control"
                        description="Choose how aggressively to utilize CPU and Router hardware. Max Throughput can cause UI lag on older PCs."
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
                          className="bg-secondary text-foreground border-none rounded-lg px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-warning appearance-none font-medium min-w-[140px] cursor-pointer hover:bg-secondary/80 transition-colors"
                        >
                          <option value="balanced">Recommended</option>
                          <option value="medium">Medium</option>
                          <option value="max_throughput">High (Max Throughput)</option>
                        </select>
                      </Row>

                      <Row
                        title="Max Parallel Connections"
                        description="The hard limit on how many simultaneous QUIC streams the chunker can spawn (1–32)."
                        divider
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs text-muted-foreground tabular-nums w-6 text-right">{settings.maxParallelConnections}</span>
                          <input
                            type="range"
                            min="1"
                            max="32"
                            value={settings.maxParallelConnections}
                            disabled
                            className="w-32 accent-warning opacity-50 cursor-not-allowed"
                          />
                        </div>
                      </Row>

                      <Row
                        title="Self-Healing Auto-Resume"
                        description="Automatically re-request missing chunks indefinitely on packet loss."
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
            </AnimatePresence>
          </motion.section>

          <section className="pt-4 pb-8">
            <div className="text-center space-y-2">
              <SettingsIcon className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
              <div className="font-semibold text-base tracking-tight">{appInfo?.name || "Send2Me"}</div>
              <div className="text-xs text-muted-foreground tabular-nums">
                Version {appInfo?.version || "0.1.0"} · {appInfo?.os} {appInfo?.arch}
              </div>
              <div className="text-xs text-muted-foreground/70 pt-3 max-w-xs mx-auto leading-relaxed">
                Designed & Maintained by <a href="https://github.com/AspiringWebGaurav" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">Gaurav</a>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
