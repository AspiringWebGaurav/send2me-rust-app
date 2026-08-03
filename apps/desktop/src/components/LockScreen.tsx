import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { database, ref, onValue, set } from '../lib/firebase';
import { Ban, Wrench, AlertTriangle, WifiOff, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function LockScreen() {
  const [hwid, setHwid] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('active');
  const [isOfflineHold, setIsOfflineHold] = useState<boolean>(false);
  const [maintenance, setMaintenance] = useState<{enabled: boolean, message: string}>({enabled: false, message: ''});
  const [appealMessage, setAppealMessage] = useState('');
  const [appealSent, setAppealSent] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      await invoke('ping_online');
      setIsOfflineHold(false); // Reset hold if they connect
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    async function setupSecurity() {
      try {
        const id = await invoke<string>('get_hardware_id');
        setHwid(id);

        // 1. Check local tamper-proof security state from Rust
        const localState = await invoke<{status: string, last_online: number}>('get_security_state');
        
        // If Rust says we're banned locally, enforce it immediately (even offline)
        if (localState.status === 'banned') {
          setStatus('banned');
        } else if (localState.status === 'hold') {
          setStatus('hold');
        }

        // 2. Enforce strict 24-hour offline rule
        const now = Date.now();
        const hoursOffline = (now - localState.last_online) / (1000 * 60 * 60);
        
        if (!navigator.onLine && hoursOffline > 24) {
          setIsOfflineHold(true);
        } else if (navigator.onLine) {
          await invoke('ping_online');
        }

        // 3. Listen to Firebase for live Admin updates
        const nodeRef = ref(database, `nodes/${id}`);
        const unsubNode = onValue(nodeRef, async (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.val();
            if (data.status) {
              setStatus(data.status);
              // Sync the master truth back to the Rust offline memory
              await invoke('update_security_state', { status: data.status });
            }
          }
        });

        const sysRef = ref(database, 'system/broadcast');
        const unsubSys = onValue(sysRef, (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.val();
            if (data.maintenance !== undefined) {
              setMaintenance({
                enabled: data.maintenance,
                message: data.message || 'The network is currently undergoing scheduled maintenance.'
              });
            }
          }
        });

        // Check if an appeal was already sent
        const appealRef = ref(database, `appeals/${id}`);
        const unsubAppeal = onValue(appealRef, (snapshot) => {
          if (snapshot.exists()) {
            setAppealSent(true);
          }
        });

        return () => {
          unsubNode();
          unsubSys();
          unsubAppeal();
        };
      } catch (e) {
        console.error('Failed to setup security listeners:', e);
      }
    }
    setupSecurity();
  }, []);

  const handleAppealSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hwid || !appealMessage.trim()) return;
    
    try {
      await set(ref(database, `appeals/${hwid}`), {
        message: appealMessage.trim(),
        timestamp: Date.now(),
        status: 'pending'
      });
      setAppealSent(true);
    } catch (err) {
      console.error("Failed to send appeal:", err);
    }
  };

  const isLocked = status === 'banned' || status === 'hold' || maintenance.enabled || isOfflineHold;

  return (
    <AnimatePresence>
      {isLocked && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-background/95 backdrop-blur-xl p-6 overflow-y-auto"
        >
          
          {/* OFFLINE FOR > 24 HOURS */}
          {isOfflineHold && status !== 'banned' && (
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="max-w-md w-full bg-warning/10 border border-warning/30 rounded-2xl p-8 text-center shadow-2xl my-auto"
            >
              <div className="w-20 h-20 bg-warning/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <WifiOff className="w-10 h-10 text-warning" />
              </div>
              <h1 className="text-2xl font-bold text-foreground mb-4">CONNECTION REQUIRED</h1>
              <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                For security reasons, this application must connect to the internet at least once every 24 hours to verify access permissions. Please connect to the internet to unlock the app.
              </p>
              {!isOnline ? (
                <div className="flex items-center justify-center gap-2 text-sm text-warning font-medium">
                  <div className="w-4 h-4 rounded-full border-2 border-warning border-t-transparent animate-spin" />
                  Waiting for connection...
                </div>
              ) : (
                <div className="text-success text-sm font-medium">
                  Connection restored. Verifying security...
                </div>
              )}
            </motion.div>
          )}

          {/* PERMANENT BAN */}
          {status === 'banned' && (
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="max-w-md w-full bg-danger/10 border border-danger/30 rounded-2xl p-8 text-center shadow-2xl my-auto"
            >
              <div className="w-20 h-20 bg-danger/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Ban className="w-10 h-10 text-danger" />
              </div>
              <h1 className="text-3xl font-bold text-foreground mb-4">YOU HAVE BEEN BANNED</h1>
              <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                This installation of Send2Me has been permanently restricted from accessing the network due to a violation of our Acceptable Use Policy.
              </p>
              
              {!appealSent ? (
                <form onSubmit={handleAppealSubmit} className="mt-4 mb-6 text-left">
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Submit Appeal</label>
                  <textarea 
                    value={appealMessage}
                    onChange={(e) => setAppealMessage(e.target.value)}
                    placeholder="Explain why you believe this ban is a mistake..."
                    className="w-full h-24 bg-background/50 border border-border/50 rounded-lg p-3 text-sm focus:outline-none focus:border-danger focus:ring-1 focus:ring-danger resize-none mb-3"
                    disabled={!isOnline}
                  />
                  <button 
                    type="submit"
                    disabled={!appealMessage.trim() || !isOnline}
                    className="w-full flex items-center justify-center gap-2 bg-danger hover:bg-danger/90 text-white rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="w-4 h-4" />
                    Send Appeal to Admin
                  </button>
                  {!isOnline && <p className="text-xs text-danger text-center mt-2">You must be online to submit an appeal.</p>}
                </form>
              ) : (
                <div className="bg-background/50 rounded-lg p-4 border border-border/50 mb-6">
                  <p className="text-sm font-medium text-foreground">Your appeal is under review.</p>
                  <p className="text-xs text-muted-foreground mt-1">Please wait for an administrator to review your case.</p>
                </div>
              )}

              <div className="bg-background/50 rounded-lg p-3 border border-border/50">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Hardware ID</p>
                <code className="text-sm font-mono text-foreground">{hwid}</code>
              </div>
            </motion.div>
          )}

          {/* ADMIN HOLD */}
          {status === 'hold' && !maintenance.enabled && !isOfflineHold && (
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="max-w-md w-full bg-warning/10 border border-warning/30 rounded-2xl p-8 text-center shadow-2xl my-auto"
            >
              <div className="w-20 h-20 bg-warning/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertTriangle className="w-10 h-10 text-warning" />
              </div>
              <h1 className="text-3xl font-bold text-foreground mb-4">ACCOUNT ON HOLD</h1>
              <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                Your access has been temporarily suspended. Please wait while an administrator reviews your account status.
              </p>
              <div className="bg-background/50 rounded-lg p-3 border border-border/50">
                <code className="text-sm font-mono text-foreground">{hwid}</code>
              </div>
            </motion.div>
          )}

          {/* SYSTEM MAINTENANCE */}
          {maintenance.enabled && status !== 'banned' && !isOfflineHold && (
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="max-w-md w-full bg-primary/10 border border-primary/30 rounded-2xl p-8 text-center shadow-2xl my-auto"
            >
              <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Wrench className="w-10 h-10 text-primary" />
              </div>
              <h1 className="text-3xl font-bold text-foreground mb-4">SYSTEM MAINTENANCE</h1>
              <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                {maintenance.message}
              </p>
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mt-4">
                <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                Waiting for network restoration...
              </div>
            </motion.div>
          )}

        </motion.div>
      )}
    </AnimatePresence>
  );
}
