import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, ArrowLeftRight, MonitorSmartphone, History, Settings, Copy, CheckCircle2, Link2, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";
import { useDeviceStore } from "../stores/useDeviceStore";
import { useTransferStore } from "../stores/useTransferStore";
import { useNotificationStore } from "../stores/useNotificationStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { Logo } from "./Logo";
import { motion, AnimatePresence } from "framer-motion";

export function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [logoWiggle, setLogoWiggle] = useState(false);

  const settings = useSettingsStore(state => state.settings);
  const tabs = [
    { name: "Dashboard", path: "/", icon: LayoutDashboard, end: true },
    { name: "Transfers", path: "/transfers", icon: ArrowLeftRight, end: false },
    { name: "Devices", path: "/devices", icon: MonitorSmartphone, end: false },
    ...(settings?.enableFolderSync ? [{ name: "Sync", path: "/sync", icon: RefreshCw, end: false }] : []),
    { name: "History", path: "/history", icon: History, end: false },
  ];

  const localDevice = useDeviceStore(state => state.localDevice);
  const activeTransfers = useTransferStore(state => state.activeTransfers);
  const [copied, setCopied] = useState(false);
  const [isBindingSync, setIsBindingSync] = useState(false);

  useEffect(() => {
    const handleBindEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ isBinding: boolean }>;
      setIsBindingSync(customEvent.detail.isBinding);
    };
    window.addEventListener("folder-sync-bind", handleBindEvent);
    return () => window.removeEventListener("folder-sync-bind", handleBindEvent);
  }, []);

  const handleCopy = () => {
    if (localDevice?.pairingCode) {
      navigator.clipboard.writeText(localDevice.pairingCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  const handleLogoClick = () => {
    if (location.pathname === "/") {
      setLogoWiggle(true);
      setTimeout(() => setLogoWiggle(false), 400);
      useNotificationStore.getState().addNotification({
        type: 'info',
        title: 'Already on Dashboard',
        message: "You are currently viewing the homepage.",
      });
    } else {
      navigate("/");
    }
  };

  const activeOngoing = activeTransfers.filter(t => !['cancelled', 'failed', 'completed'].includes(t.status)).length;

  return (
    <header className="h-12 border-b border-border/60 bg-panel/75 backdrop-blur-xl flex items-center justify-between px-3 sm:px-4 z-50 shrink-0 select-none overflow-hidden">
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <button 
          onClick={handleLogoClick}
          className="flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg px-1.5 py-1 transition-colors hover:bg-secondary/60 active:scale-[0.98]"
          title="Go to Dashboard"
        >
          <motion.div
            animate={logoWiggle ? { rotate: [0, -15, 15, -15, 15, 0] } : {}}
            transition={{ duration: 0.4 }}
          >
            <Logo className="w-6 h-6" />
          </motion.div>
          <h1 className="text-sm font-semibold tracking-tight text-foreground hidden sm:block">Send2Me</h1>
        </button>

        {/* Connect Code Pill */}
        {localDevice?.pairingCode && (
          <button
            type="button"
            data-testid="navbar-connect-code"
            onClick={handleCopy}
            title={`Connect Code: ${localDevice.pairingCode} (Click to copy)`}
            aria-label={copied ? "Connect code copied" : `Copy connect code ${localDevice.pairingCode}`}
            className="group flex items-center gap-1.5 h-7 pl-2.5 pr-2 rounded-full bg-secondary/60 hover:bg-secondary border border-border/50 hover:border-border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
          >
            <span className="text-[10px] font-medium text-muted-foreground hidden xl:inline">Connect Code</span>
            <span className="text-xs font-mono font-semibold tracking-wider text-primary">{localDevice.pairingCode}</span>
            <span className="relative w-3 h-3">
              <Copy className={`absolute inset-0 w-3 h-3 text-muted-foreground group-hover:text-foreground transition-all duration-200 ${copied ? 'opacity-0 scale-50' : 'opacity-100 scale-100'}`} />
              <CheckCircle2 className={`absolute inset-0 w-3 h-3 text-success transition-all duration-200 ${copied ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`} />
            </span>
            <span className="sr-only" aria-live="polite">{copied ? "Copied" : ""}</span>
          </button>
        )}
        {/* Binding Animation */}
        <AnimatePresence>
          {isBindingSync && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, x: -10 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.8, x: -10 }}
              className="flex items-center gap-1.5 h-7 px-2 rounded-full bg-primary/10 border border-primary/20"
            >
              <div className="relative w-3 h-3">
                <span className="absolute inset-0 rounded-full border border-primary/40 animate-[ping_1.5s_ease-in-out_infinite]" />
                <Link2 className="absolute inset-0 w-3 h-3 text-primary" />
              </div>
              <span className="text-[10px] font-semibold text-primary hidden lg:inline tracking-wide uppercase">Binding</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <nav className="flex items-center gap-0.5 sm:gap-1 shrink-0 overflow-visible">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.name}
              to={tab.path}
              end={tab.end}
              className={({ isActive }) =>
                `relative flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0 ${
                  isActive
                    ? "text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="nav-active-pill"
                      className="absolute inset-0 rounded-lg bg-primary shadow-[0_2px_8px_hsl(var(--primary)/0.35),inset_0_-1px_0_hsl(0_0%_0%/0.1)]"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                  <span className="relative flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="tracking-wide">{tab.name}</span>
                    {tab.name === "Transfers" && activeOngoing > 0 && (
                      <span className="ml-0.5 flex items-center justify-center min-w-[15px] h-3.5 px-1 rounded-full bg-danger text-white text-[9px] font-bold leading-none">
                        {activeOngoing}
                      </span>
                    )}
                  </span>
                </>
              )}
            </NavLink>
          );
        })}
        <div className="w-px h-3.5 bg-border/70 mx-1 sm:mx-1.5 shrink-0"></div>
        <NavLink
          to="/settings"
          data-testid="navbar-settings-button"
          aria-label="Settings"
          className={({ isActive }) =>
            `relative flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 mr-1 sm:mr-1.5 rounded-lg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0 ${
              isActive
                ? "text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
            }`
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <motion.span
                  layoutId="nav-active-pill"
                  className="absolute inset-0 rounded-lg bg-primary shadow-[0_2px_8px_hsl(var(--primary)/0.35),inset_0_-1px_0_hsl(0_0%_0%/0.1)]"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <Settings className="w-4 h-4 relative shrink-0" />
            </>
          )}
        </NavLink>
      </nav>
    </header>
  );
}
