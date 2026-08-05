import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { database, ref, onValue, set, get, update, auth, signInAnonymously, signInWithCustomToken } from '../lib/firebase';
import { Ban, Wrench, AlertTriangle, WifiOff, Send, ShieldAlert, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function LockScreen() {
  const [hwid, setHwid] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('active');
  const [isOfflineHold, setIsOfflineHold] = useState<boolean>(false);
  const [maintenance, setMaintenance] = useState<{enabled: boolean, message: string}>({enabled: false, message: ''});
  const [updateRequired, setUpdateRequired] = useState<{enabled: boolean, version: string}>({enabled: false, version: ''});
  const [appealMessage, setAppealMessage] = useState('');
  const [appealSent, setAppealSent] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [authFailed, setAuthFailed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [retryCount, setRetryCount] = useState(0);

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

        // Sign in using Custom Token from Admin Server (Bypass disabled Anonymous Auth)
        try {
          setAuthFailed(false); // Reset auth failed state
          
          // Use production URL if localhost fails, or fallback to production if we want to be robust. 
          // For now, let's just make sure we capture the exact error.
          const apiUrl = import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:3000/api/auth/token';
          
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hwid: id })
          });
          
          const data = await response.json().catch(() => ({}));

          if (response.ok) {
            await signInWithCustomToken(auth, data.token);
          } else {
            throw new Error(`Admin Server Error: ${data.error || response.statusText}. Please ensure the Admin Dashboard is running and accessible.`);
          }
        } catch (authErr: any) {
          console.error("Authentication failed entirely:", authErr);
          setAuthError(authErr.message || String(authErr));
          setAuthFailed(true);
          return; // Stop execution if auth fails
        }

        const logSecurityEvent = async (type: string, message: string) => {
          try {
            const timestamp = Date.now();
            // Using a unique ID to prevent overwriting events in the same millisecond
            const logId = `${timestamp}_${Math.random().toString(36).substring(7)}`;
            await set(ref(database, `logs/${logId}`), {
              hwid: id,
              type,
              message,
              timestamp
            });
          } catch (e) {
            console.error("Failed to push log:", e);
          }
        };
        const appInfo = await invoke<{version: string}>('get_app_info').catch(() => ({version: '0.0.0'}));

        // 1. Check local tamper-proof security state from Rust
        const localState = await invoke<{status: string, last_online: number}>('get_security_state');
        
        let initialStatus = localState.status;

        // STRICT POLICY: If Rust says we're banned (tampered hash), check for version mismatch
        if (initialStatus === 'banned') {
          try {
            const sysSnap = await get(ref(database, 'system/broadcast'));
            let isMismatch = false;
            let reqVer = '';
            if (sysSnap.exists()) {
              const sysData = sysSnap.val();
              reqVer = sysData.version || '';
              // If the required version doesn't match our version, assume it's just an outdated/corrupted update
              if (reqVer && reqVer !== appInfo.version) {
                isMismatch = true;
              }
            }
            
            if (isMismatch) {
              setUpdateRequired({ enabled: true, version: reqVer });
              initialStatus = 'update'; 
              await logSecurityEvent('SYSTEM', `Node locked: Outdated version detected. Required: ${reqVer}, Current: ${appInfo.version}`);
            } else {
              // Not a version mismatch. It is a genuine tamper attempt! Ban them globally!
              await set(ref(database, `nodes/${id}/status`), 'banned');
              setStatus('banned');
              await logSecurityEvent('TAMPER', `Tamper detected: Security hash mismatch. Node banned globally.`);
            }
          } catch (e) {
            console.error("Failed to verify tamper origin:", e);
            setStatus('banned');
            await logSecurityEvent('TAMPER', `Tamper detected: Security hash mismatch. Could not verify version.`);
          }
        } else if (initialStatus === 'hold') {
          setStatus('hold');
        }

        // 2. Enforce strict 24-hour offline rule
        const now = Date.now();
        const hoursOffline = (now - localState.last_online) / (1000 * 60 * 60);
        
        if (!navigator.onLine && hoursOffline > 24) {
          setIsOfflineHold(true);
          await logSecurityEvent('OFFLINE', `Node locked: Exceeded 24-hour strict offline limit. Offline for ${Math.round(hoursOffline)} hours.`);
        } else if (navigator.onLine) {
          await invoke('ping_online');
        }

        // 3. Register the node and update presence before attaching live listener
        const nodeRef = ref(database, `nodes/${id}`);
        try {
          const snap = await get(nodeRef);
          if (!snap.exists()) {
            const isWin11 = navigator.userAgent.includes('Windows NT 10.0') && navigator.userAgent.match(/Windows NT 10\.0; Win64; x64/);
            const initialSetStatus = initialStatus !== 'active' && initialStatus !== 'update' ? initialStatus : 'active';
            await set(nodeRef, {
              status: initialSetStatus,
              os: isWin11 ? 'Windows 11' : 'Windows 10',
              lastSeen: Date.now(),
            });
            await logSecurityEvent('REGISTRATION', `Node registered successfully. Initial status: ${initialSetStatus.toUpperCase()}`);
          } else {
            await update(nodeRef, { lastSeen: Date.now() });
          }
        } catch (err: any) {
          console.error("Failed to sync node presence:", err);
          setAuthError(err.message || String(err));
          setAuthFailed(true);
          return; // Stop execution
        }

        // 4. Listen to Firebase for live Admin updates
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
  }, [retryCount]);

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

  const isLocked = status === 'banned' || status === 'hold' || maintenance.enabled || isOfflineHold || updateRequired.enabled || authFailed;

  return (
    <AnimatePresence>
      {isLocked && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[99999] bg-background"
        >
          
          {/* OFFLINE FOR > 24 HOURS */}
          {isOfflineHold && status !== 'banned' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-amber-500 to-orange-700 text-white p-12 text-center"
            >
              <div className="w-32 h-32 bg-white/10 rounded-full flex items-center justify-center mb-8 backdrop-blur-md shadow-2xl border border-white/20">
                <WifiOff className="w-16 h-16 text-white" />
              </div>
              <h1 className="text-5xl md:text-6xl font-black mb-6 tracking-tight drop-shadow-lg uppercase">Connection Required</h1>
              <p className="text-white/90 text-lg md:text-xl leading-relaxed max-w-3xl mb-8 font-medium drop-shadow">
                For security reasons, this application must connect to the internet at least once every 24 hours to verify access permissions. Please connect to the internet to unlock the app.
              </p>
              {!isOnline ? (
                <div className="flex items-center justify-center gap-3 text-lg text-white font-semibold bg-black/20 px-8 py-4 rounded-full backdrop-blur-sm border border-white/10 shadow-inner">
                  <div className="w-6 h-6 rounded-full border-4 border-white border-t-transparent animate-spin" />
                  Waiting for connection...
                </div>
              ) : (
                <div className="text-white text-lg font-bold bg-green-500/80 px-8 py-4 rounded-full backdrop-blur-sm border border-white/20 shadow-lg">
                  Connection restored. Verifying security...
                </div>
              )}
            </motion.div>
          )}

          {/* AUTHENTICATION FAILED */}
          {authFailed && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-red-600 to-red-900 text-white p-12 text-center"
            >
              <div className="w-32 h-32 bg-white/10 rounded-full flex items-center justify-center mb-8 backdrop-blur-md shadow-2xl border border-white/20">
                <ShieldAlert className="w-16 h-16 text-white" />
              </div>
              <h1 className="text-5xl md:text-6xl font-black mb-6 tracking-tight drop-shadow-lg uppercase">Connection Refused</h1>
              <p className="text-white/90 text-lg md:text-xl leading-relaxed max-w-3xl mb-8 font-medium drop-shadow">
                Failed to securely authenticate this node with the central network. The authentication server might be offline, unreachable, or your credentials could not be verified.
              </p>
              
              {authError && (
                <div className="bg-black/40 border border-white/10 px-6 py-4 rounded-xl mb-12 font-mono text-sm max-w-3xl break-all shadow-inner text-left">
                  <span className="text-red-300 font-bold mr-2">ERROR_LOG:</span>
                  <span className="text-white/80">{authError}</span>
                </div>
              )}

              <button 
                onClick={() => setRetryCount(c => c + 1)}
                className="px-12 py-5 bg-white text-red-700 hover:bg-white/90 hover:scale-105 active:scale-95 rounded-full font-bold shadow-[0_0_40px_rgba(255,255,255,0.3)] flex items-center justify-center gap-3 transition-all text-xl"
              >
                <RefreshCw className="w-6 h-6" /> Try Again
              </button>
            </motion.div>
          )}

          {/* PERMANENT BAN */}
          {status === 'banned' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-zinc-900 to-black text-white p-12 text-center"
            >
              <div className="w-32 h-32 bg-white/5 rounded-full flex items-center justify-center mb-8 backdrop-blur-md shadow-2xl border border-white/10">
                <Ban className="w-16 h-16 text-red-500" />
              </div>
              <h1 className="text-5xl md:text-6xl font-black mb-6 tracking-tight drop-shadow-lg text-red-500 uppercase">You Have Been Banned</h1>
              <p className="text-white/80 text-lg md:text-xl leading-relaxed max-w-3xl mb-12 font-medium drop-shadow">
                This installation of Send2Me has been permanently restricted from accessing the network due to a violation of our Acceptable Use Policy.
              </p>
              
              <div className="bg-black/50 border border-white/10 rounded-2xl p-8 w-full max-w-2xl backdrop-blur-sm shadow-2xl">
                {!appealSent ? (
                  <form onSubmit={handleAppealSubmit} className="text-left">
                    <label className="block text-sm font-bold text-white/50 uppercase tracking-widest mb-3">Submit Appeal</label>
                    <textarea 
                      value={appealMessage}
                      onChange={(e) => setAppealMessage(e.target.value)}
                      placeholder="Explain why you believe this ban is a mistake..."
                      className="w-full h-32 bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder-white/30 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 resize-none mb-6 text-lg transition-all"
                      disabled={!isOnline}
                    />
                    <button 
                      type="submit"
                      disabled={!appealMessage.trim() || !isOnline}
                      className="w-full flex items-center justify-center gap-3 bg-red-600 hover:bg-red-500 text-white rounded-xl py-4 text-lg font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(220,38,38,0.2)]"
                    >
                      <Send className="w-5 h-5" />
                      Send Appeal to Administrator
                    </button>
                    {!isOnline && <p className="text-sm text-red-400 text-center mt-3 font-semibold">You must be online to submit an appeal.</p>}
                  </form>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-2xl font-bold text-white mb-2">Your appeal is under review.</p>
                    <p className="text-white/60 text-lg">Please wait for an administrator to review your case.</p>
                  </div>
                )}
              </div>

              <div className="mt-12 text-white/30 text-sm font-mono tracking-widest uppercase flex items-center gap-4">
                <span>HWID:</span>
                <code className="text-white/50 bg-white/5 px-4 py-2 rounded-md border border-white/10">{hwid}</code>
              </div>
            </motion.div>
          )}

          {/* ADMIN HOLD */}
          {status === 'hold' && !maintenance.enabled && !isOfflineHold && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-yellow-600 to-amber-900 text-white p-12 text-center"
            >
              <div className="w-32 h-32 bg-white/10 rounded-full flex items-center justify-center mb-8 backdrop-blur-md shadow-2xl border border-white/20">
                <AlertTriangle className="w-16 h-16 text-white" />
              </div>
              <h1 className="text-5xl md:text-6xl font-black mb-6 tracking-tight drop-shadow-lg uppercase">Account On Hold</h1>
              <p className="text-white/90 text-lg md:text-xl leading-relaxed max-w-3xl mb-12 font-medium drop-shadow">
                Your access has been temporarily suspended. Please wait while an administrator reviews your account status.
              </p>
              <div className="mt-4 text-white/50 text-sm font-mono tracking-widest uppercase flex items-center gap-4">
                <span>HWID:</span>
                <code className="text-white/70 bg-black/20 px-4 py-2 rounded-md border border-white/10">{hwid}</code>
              </div>
            </motion.div>
          )}

          {/* SYSTEM MAINTENANCE */}
          {maintenance.enabled && status !== 'banned' && !isOfflineHold && !updateRequired.enabled && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-blue-600 to-indigo-900 text-white p-12 text-center"
            >
              <div className="w-32 h-32 bg-white/10 rounded-full flex items-center justify-center mb-8 backdrop-blur-md shadow-2xl border border-white/20">
                <Wrench className="w-16 h-16 text-white" />
              </div>
              <h1 className="text-5xl md:text-6xl font-black mb-6 tracking-tight drop-shadow-lg uppercase">System Maintenance</h1>
              <p className="text-white/90 text-lg md:text-xl leading-relaxed max-w-3xl mb-12 font-medium drop-shadow">
                {maintenance.message}
              </p>
              <div className="flex items-center justify-center gap-3 text-lg text-white font-semibold bg-black/20 px-8 py-4 rounded-full backdrop-blur-sm border border-white/10 shadow-inner">
                <div className="w-6 h-6 rounded-full border-4 border-white border-t-transparent animate-spin" />
                Waiting for network restoration...
              </div>
            </motion.div>
          )}

          {/* UPDATE REQUIRED */}
          {updateRequired.enabled && status !== 'banned' && !isOfflineHold && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-blue-600 to-cyan-800 text-white p-12 text-center"
            >
              <div className="w-32 h-32 bg-white/10 rounded-full flex items-center justify-center mb-8 backdrop-blur-md shadow-2xl border border-white/20">
                <Send className="w-16 h-16 text-white" />
              </div>
              <h1 className="text-5xl md:text-6xl font-black mb-6 tracking-tight drop-shadow-lg uppercase">Update Required</h1>
              <p className="text-white/90 text-lg md:text-xl leading-relaxed max-w-3xl mb-12 font-medium drop-shadow">
                Your Send2Me client is outdated or out of sync. You must update to version <strong className="text-white bg-black/20 px-3 py-1 rounded-md ml-1">{updateRequired.version}</strong> to continue using the network.
              </p>
              <button 
                onClick={() => window.open('https://www.send2me.site', '_blank')}
                className="px-12 py-5 bg-white text-blue-800 hover:bg-white/90 hover:scale-105 active:scale-95 rounded-full font-bold shadow-[0_0_40px_rgba(255,255,255,0.3)] flex items-center justify-center transition-all text-xl"
              >
                Download Update
              </button>
            </motion.div>
          )}

        </motion.div>
      )}
    </AnimatePresence>
  );
}
