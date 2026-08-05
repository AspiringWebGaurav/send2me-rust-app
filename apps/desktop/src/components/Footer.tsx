import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Zap, WifiOff } from "lucide-react";
import { motion } from "framer-motion";
import { useAppStore } from "../stores/useAppStore";

export function Footer() {
  const appInfo = useAppStore(s => s.appInfo);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isP2PActive, setIsP2PActive] = useState<boolean>(false);
  const [hwid, setHwid] = useState<string>('');

  useEffect(() => {
    invoke<string>('get_hardware_id').then(setHwid).catch(console.error);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const checkP2P = async () => {
      try {
        if (navigator.onLine) {
          const status = await invoke("get_network_status");
          setIsP2PActive(!!status);
        } else {
          setIsP2PActive(false);
        }
      } catch {
        setIsP2PActive(false);
      }
    };

    checkP2P();
    const interval = setInterval(checkP2P, 5000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, []);

  const displayVersion = appInfo?.version || "0.1.0";

  return (
    <motion.footer
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="h-9 border-t border-border/60 bg-panel/75 backdrop-blur-xl flex items-center justify-between px-2 sm:px-4 md:px-6 z-50 shrink-0 text-[10px] sm:text-[11px] font-medium tracking-wide w-full"
    >
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <div className={`flex items-center gap-1.5 sm:gap-2 transition-colors ${isOnline ? 'text-foreground/80' : 'text-danger'}`}>
          <span className="relative flex h-1.5 w-1.5">
            {isOnline ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success/60 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success"></span>
              </>
            ) : (
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-danger"></span>
            )}
          </span>
          <span className="hidden sm:inline">{isOnline ? "System Online" : "System Offline"}</span>
          <span className="sm:hidden">{isOnline ? "Online" : "Offline"}</span>
        </div>
        <div className="w-px h-3 bg-border/70"></div>
        <div className={`flex items-center gap-1 sm:gap-1.5 transition-colors ${isP2PActive ? 'text-muted-foreground' : 'text-danger/80'}`}>
          {isP2PActive ? (
            <Zap className="w-3 h-3 text-primary" />
          ) : (
            <WifiOff className="w-3 h-3 text-danger" />
          )}
          <span className="hidden sm:inline">{isP2PActive ? "P2P Active" : "P2P Inactive"}</span>
          <span className="sm:hidden">{isP2PActive ? "P2P On" : "P2P Off"}</span>
        </div>
      </div>

      <div className="items-center gap-3 text-muted-foreground/70 hidden md:flex shrink-0">
        <button
          onClick={() => openUrl('https://www.send2me.site/terms')}
          className="hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1"
        >
          Terms
        </button>
        <div className="w-px h-3 bg-border/70"></div>
        <button
          onClick={() => openUrl('https://www.send2me.site/privacy')}
          className="hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1"
        >
          Privacy
        </button>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 text-muted-foreground shrink-0">
        {hwid && (
          <>
            <span className="hidden sm:block tabular-nums bg-secondary/30 px-2 py-0.5 rounded border border-border/50 text-[10px]" title="Hardware ID">
              HWID: {hwid}
            </span>
            <div className="w-px h-3 bg-border/70 hidden sm:block"></div>
          </>
        )}
        <button
          onClick={() => openUrl('https://github.com/AspiringWebGaurav')}
          className="group flex items-center gap-1.5 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-transform duration-200 group-hover:scale-110 group-hover:text-primary"
          >
            <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
            <path d="M9 18c-4.51 2-5-2-7-2" />
          </svg>
          <span className="transition-colors group-hover:text-primary hidden sm:inline">GitHub</span>
        </button>
        <div className="w-px h-3 bg-border/70"></div>
        <span className="tabular-nums whitespace-nowrap">App v{displayVersion}</span>
      </div>
    </motion.footer>
  );
}
