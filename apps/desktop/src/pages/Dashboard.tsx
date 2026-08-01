import { useState, useEffect } from "react";
import { open } from '@tauri-apps/plugin-dialog';
import { ArrowUp, ArrowDown, RefreshCw, Unlock, Link2 } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { ReceiveModal } from "../components/ReceiveModal";
import { SendModal } from "../components/SendModal";
import { FolderSyncBetaModal } from "../components/FolderSyncBetaModal";
import { P2PDriveCard } from "../components/P2PDriveCard";
import { useAppStore } from "../stores/useAppStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useDeviceStore } from "../stores/useDeviceStore";
import { useHistoryStore } from "../stores/useHistoryStore";
import { useSyncStore } from "../stores/useSyncStore";
import { useTransferStore } from "../stores/useTransferStore";
import { useNotificationStore } from "../stores/useNotificationStore";
// import { Progress } from "../components/ui/Progress";
import { FileSize } from "../components/ui/FileSize";
// import { usePeersPolling } from "../hooks/usePeersPolling";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];
const stagger = {
  initial: { opacity: 0, y: 16 },
  animate: (i: number) => ({ opacity: 1, y: 0, transition: { duration: 0.32, delay: i * 0.06, ease: EASE } }),
};

export function Dashboard() {
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [isFolderSyncModalOpen, setIsFolderSyncModalOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);

  // const appInfo = useAppStore(s => s.appInfo);
  const fetchAppInfo = useAppStore(s => s.fetchAppInfo);
  // const localDevice = useDeviceStore(s => s.localDevice);
  const fetchLocalDevice = useDeviceStore(s => s.fetchLocalDevice);
  const records = useHistoryStore(s => s.records);
  const fetchHistory = useHistoryStore(s => s.fetchHistory);
  // const activeTransfers = useTransferStore(s => s.activeTransfers);
  const fetchActiveTransfers = useTransferStore(s => s.fetchActiveTransfers);
  const bondedDevices = useSyncStore(s => s.bondedDevices);
  const fetchBondedDevices = useSyncStore(s => s.fetchBondedDevices);
  const settings = useSettingsStore(s => s.settings);
  const fetchSettings = useSettingsStore(s => s.fetchSettings);
  const navigate = useNavigate();
  const location = useLocation();
  const [highlightCard, setHighlightCard] = useState<string | null>(null);

  useEffect(() => {
    if (location.state?.highlightCard) {
      setHighlightCard(location.state.highlightCard);
      // Clean it up in history state to prevent re-highlighting on refresh
      window.history.replaceState({}, '');
      const timer = setTimeout(() => setHighlightCard(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [location]);

  // const { peers: livePeers } = usePeersPolling();
  // const remotePeers = livePeers.filter(p => p.pairing_code !== localDevice?.pairingCode);

  useEffect(() => {
    fetchAppInfo();
    fetchLocalDevice();
    fetchHistory();
    fetchActiveTransfers();
    fetchSettings();
    fetchBondedDevices();
  }, [fetchAppInfo, fetchLocalDevice, fetchHistory, fetchActiveTransfers, fetchSettings, fetchBondedDevices]);

  const handleSendClick = async () => {
    try {
      const selected = await open({ multiple: true, directory: false, title: "Select files to send" });
      if (selected) {
        setSelectedFiles((Array.isArray(selected) ? selected : [selected]) as string[]);
        setIsSendModalOpen(true);
      }
    } catch (e) {
      useNotificationStore.getState().addNotification({
        type: 'error',
        title: 'Could not open file picker',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const recentRecords = records.slice(0, 4);

  const actionCards = [
    {
      id: "send",
      icon: ArrowUp,
      label: "Send Files",
      desc: "Select files to transfer securely",
      onClick: handleSendClick,
      disabled: false,
      badge: null,
      iconClassName: "group-hover:animate-train-up",
    },
    {
      id: "receive",
      icon: ArrowDown,
      label: "Receive Files",
      desc: "Accept incoming transfers",
      onClick: () => setIsReceiveModalOpen(true),
      disabled: false,
      badge: null,
      iconClassName: "group-hover:animate-train-down",
    },
    {
      id: "folder-sync",
      icon: RefreshCw,
      label: "Folder Sync",
      desc: settings?.enableFolderSync 
              ? "Manage your synced folders" 
              : "Click to go to Settings",
      onClick: settings?.enableFolderSync 
                 ? (settings?.folderSyncInstalled ? () => navigate('/sync') : () => setIsFolderSyncModalOpen(true))
                 : () => navigate('/settings', { state: { highlight: 'folder-sync' } }),
      disabled: false,
      locked: !settings?.enableFolderSync,
      badge: !settings?.enableFolderSync ? "LOCKED" : !settings?.folderSyncInstalled ? "UNLOCKED" : null,
      badgeIcon: settings?.enableFolderSync && settings?.folderSyncInstalled ? Unlock : null,
      leftBadge: bondedDevices.length > 0 ? `${bondedDevices.length} BONDED` : null,
      leftBadgeIcon: bondedDevices.length > 0 ? Link2 : null,
      iconClassName: "group-hover:animate-[spin_0.65s_linear_infinite]",
      iconProps: { strokeWidth: 1.25 },
    },
  ];

  return (
    <div className="h-full w-full flex flex-col gap-4 lg:gap-5">

      {/* Action Cards */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 shrink-0 h-28 sm:h-32 lg:h-40">
        {actionCards.map((card, i) => {
          const Icon = card.icon;
          const iconClassName = (card as any).iconClassName || "";
          return (
            <motion.button
              key={card.label}
              custom={i}
              variants={stagger}
              initial="initial"
              animate="animate"
              disabled={card.disabled}
              onClick={card.onClick}
              className={`glass-card h-full w-full rounded-2xl p-4 lg:p-5 flex flex-col items-center justify-center group text-center min-w-0 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring relative ${
                card.disabled
                  ? 'cursor-not-allowed opacity-50 select-none'
                  : highlightCard === card.id
                  ? 'ring-2 ring-primary ring-offset-2 animate-[soft-pulse_2s_ease-in-out_infinite] bg-primary/5 shadow-lg shadow-primary/20 scale-[1.02]'
                  : card.locked
                  ? 'cursor-pointer opacity-[0.65] hover:opacity-100 hover:ring-2 hover:ring-inset hover:ring-foreground/20 hover:bg-secondary/40 active:scale-[0.98]'
                  : 'hover:ring-2 hover:ring-inset hover:ring-primary/40 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/8 active:scale-[0.98]'
              }`}
            >
              {(card as any).leftBadge && (
                <div className="absolute top-2.5 left-2.5 flex items-center gap-1 bg-secondary/80 text-foreground px-1.5 py-0.5 rounded-full z-10">
                  <span className="text-[9px] uppercase tracking-widest font-bold">
                    {(card as any).leftBadge}
                  </span>
                  {(card as any).leftBadgeIcon && (
                    <div className="text-primary opacity-80 group-hover:opacity-100 transition-opacity">
                      {(() => { const LeftIcon = (card as any).leftBadgeIcon; return <LeftIcon className="w-3 h-3" strokeWidth={2.5} />; })()}
                    </div>
                  )}
                </div>
              )}
              {card.badge && (
                <span className={`absolute top-2 right-2.5 text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded-full z-10 ${card.badge === 'UNLOCKED' ? 'bg-primary/20 text-primary animate-pulse' : 'text-muted-foreground bg-secondary/80'}`}>
                  {card.badge}
                </span>
              )}
              {card.badgeIcon && (
                <div className="absolute top-2.5 right-2.5 text-primary opacity-80 group-hover:opacity-100 transition-opacity">
                  <card.badgeIcon className="w-4 h-4" strokeWidth={2.5} />
                </div>
              )}
              <div className={`w-10 h-10 lg:w-12 lg:h-12 rounded-xl flex items-center justify-center mb-2 lg:mb-3 transition-all duration-300 shrink-0 relative ${
                card.disabled
                  ? 'bg-secondary text-muted-foreground'
                  : card.locked
                  ? 'bg-secondary/60 text-muted-foreground group-hover:text-foreground group-hover:bg-secondary group-hover:shadow-[var(--shadow-e1)]'
                  : 'bg-secondary group-hover:bg-primary text-foreground group-hover:text-primary-foreground shadow-[var(--shadow-e1)] group-hover:shadow-[var(--shadow-e2)]'
              }`}>
                <div className="w-7 h-7 lg:w-8 lg:h-8 flex items-center justify-center overflow-hidden">
                  <Icon className={`w-5 h-5 lg:w-6 lg:h-6 transition-all duration-300 ${iconClassName}`} {...((card as any).iconProps || {})} />
                </div>
              </div>
              <h3 className="text-sm lg:text-base font-semibold mb-0.5 truncate w-full leading-tight">{card.label}</h3>
              <p className={`text-[11px] lg:text-xs truncate w-full px-1 hidden sm:block transition-colors ${card.disabled ? 'text-muted-foreground' : 'text-muted-foreground group-hover:text-foreground/80'}`}>
                {card.desc}
              </p>
            </motion.button>
          );
        })}
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-5 min-h-0 overflow-hidden">

        {/* P2P Drive Gateway */}
        <P2PDriveCard />

        {/* Recent Transfers */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="flex-1 min-h-0"
        >
          <Card className="h-full flex flex-col overflow-hidden rounded-2xl">
            <div className="px-5 lg:px-6 py-4 flex items-center justify-between shrink-0 border-b border-border/40">
              <h3 className="text-sm font-semibold tracking-tight">Recent Transfers</h3>
              <button
                onClick={() => navigate('/history')}
                className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1"
              >
                View All
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {recentRecords.length > 0 ? (
                <div className="flex flex-col divide-y divide-border/30">
                  {recentRecords.map((record) => (
                    <div key={record.id} className="px-5 lg:px-6 py-3 flex items-center justify-between gap-3 hover:bg-secondary/20 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                          {record.direction === 'incoming'
                            ? <ArrowDown className="w-4 h-4 text-success" />
                            : <ArrowUp className="w-4 h-4 text-primary" />}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm leading-snug line-clamp-1 break-all" title={record.fileName}>{record.fileName}</p>
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                            {record.direction === 'incoming' ? 'From' : 'To'} {record.targetDeviceName}
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <FileSize bytes={record.fileSize} className="text-xs font-medium" />
                        <p className="text-[10px] uppercase font-semibold text-success mt-0.5">{record.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-1 h-full flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
                  <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center mb-3">
                    <ArrowDown className="w-5 h-5 opacity-40" />
                  </div>
                  <p className="text-sm font-medium mb-1">No recent transfers</p>
                  <p className="text-xs opacity-60">Your file transfer history will appear here.</p>
                </div>
              )}
            </div>
          </Card>
        </motion.div>

      </div>

      <ReceiveModal isOpen={isReceiveModalOpen} onClose={() => setIsReceiveModalOpen(false)} />
      <SendModal isOpen={isSendModalOpen} onClose={() => setIsSendModalOpen(false)} selectedFiles={selectedFiles} />
      <FolderSyncBetaModal
        isOpen={isFolderSyncModalOpen}
        onClose={() => {
          setIsFolderSyncModalOpen(false);
          // Small timeout to allow state to settle before checking
          setTimeout(() => {
            if (useSettingsStore.getState().settings?.folderSyncInstalled) {
              navigate('/sync');
            }
          }, 50);
        }}
      />
    </div>
  );
}
