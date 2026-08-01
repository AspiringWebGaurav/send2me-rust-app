import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ShieldAlert, CheckCircle2, Settings, Power } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { getCurrentWindow } from '@tauri-apps/api/window';

export function PermissionOverlay() {
  const [hasPermission, setHasPermission] = useState<boolean>(true);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    let mounted = true;
    let interval: ReturnType<typeof setInterval> | null = null;

    const stopPolling = () => {
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    };

    const checkPermission = async () => {
      try {
        const allowed = await invoke<boolean>("check_firewall_permission");
        if (!mounted) return;
        setHasPermission(allowed);
        if (allowed) stopPolling();
      } catch {
        // best-effort
      }
    };

    checkPermission();
    interval = setInterval(checkPermission, 3000);

    const onFocus = () => { checkPermission(); };
    window.addEventListener('focus', onFocus);

    return () => {
      mounted = false;
      stopPolling();
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const openSettings = async () => {
    setIsChecking(true);
    try {
      await invoke("open_firewall_settings");
    } catch {
      // best-effort
    }
    setTimeout(() => setIsChecking(false), 1000);
  };

  const closeApp = async () => {
    try { await getCurrentWindow().close(); } catch { /* ignore */ }
  };

  return (
    <AnimatePresence>
      {!hasPermission && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/60 backdrop-blur-xl p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="permission-title"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center text-center space-y-6 max-w-xl w-full"
          >
            <div className="relative w-20 h-20 flex items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-danger/20 animate-ping" />
              <span className="absolute inset-2 rounded-full bg-danger/10 animate-[soft-pulse_2s_ease-in-out_infinite]" />
              <div className="relative w-16 h-16 rounded-full bg-danger/10 flex items-center justify-center border border-danger/30 backdrop-blur-md">
                <ShieldAlert className="w-8 h-8 text-danger" />
              </div>
            </div>

            <div className="space-y-2">
              <h2 id="permission-title" className="text-2xl font-semibold tracking-tight text-foreground">Network Access Needed</h2>
              <p className="text-muted-foreground text-sm max-w-md mx-auto leading-relaxed">
                To send and receive files on your Wi-Fi, Send2Me needs permission to communicate. Right now, Windows is blocking it.
              </p>
            </div>

            <div className="w-full max-w-md p-5 glass-card rounded-2xl text-left">
              <h4 className="font-semibold text-sm mb-3 text-foreground flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                How to fix this easily
              </h4>
              <ul className="text-xs text-muted-foreground leading-relaxed space-y-2.5">
                <li className="flex gap-2">
                  <strong className="text-foreground shrink-0">Step 1:</strong>
                  <span>Check if there's a Windows Security prompt on your taskbar. If so, click <strong className="text-foreground">"Allow access"</strong>.</span>
                </li>
                <li className="flex gap-2">
                  <strong className="text-foreground shrink-0">Step 2:</strong>
                  <span>If you don't see any prompt, try <strong className="text-foreground">closing and restarting the app</strong>.</span>
                </li>
                <li className="flex gap-2">
                  <strong className="text-foreground shrink-0">Step 3:</strong>
                  <span>If it's still blocked, click the button below to manually open Windows Firewall settings.</span>
                </li>
              </ul>
            </div>

            <div className="w-full max-w-md flex flex-col sm:flex-row gap-2.5">
              <button
                onClick={openSettings}
                disabled={isChecking}
                className="flex-1 h-11 flex items-center justify-center gap-2 bg-secondary/60 hover:bg-secondary text-foreground border border-border/50 rounded-xl font-semibold text-sm transition-all duration-200 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] disabled:opacity-60"
              >
                <Settings className="w-4 h-4 text-muted-foreground" />
                Open Settings
              </button>
              <button
                onClick={closeApp}
                className="flex-1 h-11 flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl font-semibold text-sm transition-all duration-200 hover:-translate-y-px shadow-[0_4px_14px_hsl(var(--primary)/0.3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 active:scale-[0.97]"
              >
                <Power className="w-4 h-4" />
                Close App
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
