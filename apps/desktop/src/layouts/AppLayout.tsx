import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Download, FolderSearch } from "lucide-react";
import { Navbar } from "../components/Navbar";
import { Footer } from "../components/Footer";
import { ToastContainer } from "../components/ui/ToastContainer";
import { PermissionOverlay } from "../components/PermissionOverlay";
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { useTransferStore } from "../stores/useTransferStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useSyncStore } from "../stores/useSyncStore";
import { useDeviceStore } from "../stores/useDeviceStore";
import { useAppStore } from "../stores/useAppStore";
import { FileSize } from "../components/ui/FileSize";
import { FolderSyncOnboardingModal } from "../components/FolderSyncOnboardingModal";
import { BindTermsModal } from "../components/BindTermsModal";
import { Toaster } from 'sonner';
import { LockScreen } from "../components/LockScreen";

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const pendingRequests = useTransferStore(s => s.pendingRequests);
  const pendingBindPrompts = useSyncStore(s => s.pendingBindPrompts);
  const finalizeBindPrompts = useSyncStore(s => s.finalizeBindPrompts);
  const respondToBindPrompt = useSyncStore(s => s.respondToBindPrompt);
  const finalizeBindRequest = useSyncStore(s => s.finalizeBindRequest);
  const respondToRequest = useTransferStore(s => s.respondToRequest);
  const activeTransfers = useTransferStore(s => s.activeTransfers);
  const settings = useSettingsStore(s => s.settings);
  const localDevice = useDeviceStore(s => s.localDevice);
  const appInfo = useAppStore(s => s.appInfo);
  const [selectingPathFor, setSelectingPathFor] = useState<string | null>(null);
  const acceptBtnRef = useRef<HTMLButtonElement>(null);
  const [isFolderSyncOnboardingModalOpen, setIsFolderSyncOnboardingModalOpen] = useState(false);
  
  const localDeviceName = localDevice?.name || appInfo?.name || "This PC";
  const localOs = localDevice?.os || "Windows";

  const [prevLength, setPrevLength] = useState(() => {
    return activeTransfers.filter(t => !['cancelled', 'failed', 'completed'].includes(t.status)).length;
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent F5 or Ctrl+R / Cmd+R
      if (
        e.key === 'F5' ||
        (e.key === 'r' && (e.ctrlKey || e.metaKey))
      ) {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const activeOngoing = activeTransfers.filter(t => !['cancelled', 'failed', 'completed'].includes(t.status));
    if (activeOngoing.length > prevLength && location.pathname !== '/transfers') {
      navigate('/transfers');
    } else if (activeOngoing.length === 0 && prevLength > 0 && location.pathname === '/transfers') {
      navigate('/history');
    }
    setPrevLength(activeOngoing.length);
  }, [activeTransfers, navigate, prevLength, location.pathname]);

  // Apply RGB Mode class to body — respects animationsEnabled
  useEffect(() => {
    const activeOngoing = activeTransfers.filter(t => !['cancelled', 'failed', 'completed'].includes(t.status));
    if (settings?.rgbMode !== false && settings?.animationsEnabled !== false && activeOngoing.length > 0) {
      document.body.classList.add('rgb-mode');
    } else {
      document.body.classList.remove('rgb-mode');
    }
    return () => document.body.classList.remove('rgb-mode');
  }, [activeTransfers, settings?.rgbMode, settings?.animationsEnabled]);

  // Focus Accept button when an incoming request appears
  useEffect(() => {
    if (pendingRequests.length > 0 && !selectingPathFor) {
      const t = setTimeout(() => acceptBtnRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [pendingRequests.length, selectingPathFor]);

  useEffect(() => {
    const handleOpen = () => setIsFolderSyncOnboardingModalOpen(true);
    window.addEventListener('folder-sync-bind-open', handleOpen);
    return () => window.removeEventListener('folder-sync-bind-open', handleOpen);
  }, []);

  useEffect(() => {
    const unlisten = listen<string>('tray-navigate', (event) => {
      if (event.payload) {
        navigate(event.payload.startsWith('/') ? event.payload : `/${event.payload}`);
      }
    });
    return () => {
      unlisten.then(f => f());
    };
  }, [navigate]);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden selection:bg-primary/20">
      <Navbar />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative z-10 bg-gradient-to-br from-background to-secondary/20 overflow-hidden">
        <div className="flex-1 w-full max-w-[1600px] mx-auto h-full overflow-hidden p-3 sm:p-4 md:p-6 relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -2 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="w-full h-full"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <Footer />
      <ToastContainer />

      {/* Incoming Transfer Requests */}
      <AnimatePresence>
        {pendingRequests.map(req => (
          <motion.div
            key={req.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-md p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`incoming-${req.id}-title`}
          >
            <motion.div
              initial={{ scale: 0.96, y: 12, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.96, y: 8, opacity: 0 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="bg-card/80 backdrop-blur-xl border border-border/60 text-card-foreground shadow-[var(--shadow-e4)] rounded-2xl p-7 max-w-md w-full overflow-hidden relative"
            >
              <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent" />

              <div className="flex items-center gap-4 mb-5">
                <div className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10">
                  <span className="absolute inset-0 rounded-xl bg-primary/15 animate-[soft-pulse_2s_ease-in-out_infinite]" />
                  <Download className="w-5 h-5 text-primary relative z-10" />
                </div>
                <div className="min-w-0">
                  <h3 id={`incoming-${req.id}-title`} className="text-lg font-semibold tracking-tight">Incoming File</h3>
                  <p className="text-xs text-muted-foreground">Ready to receive</p>
                </div>
              </div>

              <div className="bg-secondary/40 rounded-xl p-4 mb-6 border border-border/40">
                <p className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wider font-semibold">Someone wants to send</p>
                <div className="font-semibold text-[15px] break-all text-foreground mb-2.5 leading-snug">
                  {req.fileName}
                </div>
                <div className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary/10 text-primary px-2.5 py-1 rounded-full">
                  <FileSize bytes={req.fileSize} />
                </div>
              </div>

              <AnimatePresence mode="wait">
                {selectingPathFor === req.id ? (
                  <motion.div
                    key="save-options"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    className="flex flex-col gap-2"
                  >
                    <p className="text-xs font-semibold text-center text-muted-foreground mb-1 uppercase tracking-wider">Where to save?</p>
                    <button
                      onClick={() => {
                        respondToRequest(req.id, true);
                        setSelectingPathFor(null);
                      }}
                      className="w-full h-10 px-4 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 hover:-translate-y-px transition-all duration-200 font-semibold text-sm shadow-[0_4px_14px_hsl(var(--primary)/0.3)] active:scale-[0.97] flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                    >
                      <Download className="w-4 h-4" />
                      Default Folder
                    </button>
                    <button
                      onClick={async () => {
                        const selected = await open({ directory: true });
                        if (selected) {
                          respondToRequest(req.id, true, selected as string);
                          setSelectingPathFor(null);
                        }
                      }}
                      className="w-full h-10 px-4 rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-all duration-200 font-semibold text-sm active:scale-[0.97] flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <FolderSearch className="w-4 h-4" />
                      Choose Folder…
                    </button>
                    <button
                      onClick={() => setSelectingPathFor(null)}
                      className="w-full mt-1 h-8 px-4 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Cancel
                    </button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="action-buttons"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    className="flex gap-3"
                  >
                    <button
                      onClick={() => respondToRequest(req.id, false)}
                      className="flex-1 h-10 px-4 rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-all duration-200 font-semibold text-sm active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Decline
                    </button>
                    <button
                      ref={acceptBtnRef}
                      onClick={() => setSelectingPathFor(req.id)}
                      className="flex-1 h-10 px-4 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 hover:-translate-y-px transition-all duration-200 font-semibold text-sm shadow-[0_4px_14px_hsl(var(--primary)/0.3)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                    >
                      Accept
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        ))}
      </AnimatePresence>


      <PermissionOverlay />
      
      <FolderSyncOnboardingModal
        isOpen={isFolderSyncOnboardingModalOpen}
        onClose={() => setIsFolderSyncOnboardingModalOpen(false)}
      />

      {/* Incoming Folder Sync Bind Requests (Receiver side) */}
      {pendingBindPrompts.map(req => (
        <BindTermsModal
          key={`bind-rx-${req.remote_endpoint_id}`}
          isOpen={true}
          onClose={() => {}}
          onRespond={(accept) => respondToBindPrompt(req.remote_endpoint_id, req.device_name, req.os, accept)}
          remoteDeviceName={req.device_name}
          remoteOs={req.os || "Unknown"}
          localDeviceName={localDeviceName}
          localOs={localOs}
          isSender={false}
        />
      ))}

      {/* Finalize Folder Sync Bind Requests (Sender side) */}
      {finalizeBindPrompts.map(req => (
        <BindTermsModal
          key={`bind-tx-${req.remote_endpoint_id}`}
          isOpen={true}
          onClose={() => {}}
          onRespond={(accept) => finalizeBindRequest(req.remote_endpoint_id, accept)}
          remoteDeviceName={req.device_name}
          remoteOs={req.os || "Unknown"}
          localDeviceName={localDeviceName}
          localOs={localOs}
          isSender={true}
        />
      ))}

      <Toaster position="bottom-left" richColors />
      <LockScreen />
    </div>
  );
}
