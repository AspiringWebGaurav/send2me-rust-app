import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { database, ref, onValue } from '../lib/firebase';
import { Ban, Wrench, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function LockScreen() {
  const [hwid, setHwid] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('active');
  const [maintenance, setMaintenance] = useState<{enabled: boolean, message: string}>({enabled: false, message: ''});

  // Get HWID and setup Firebase listeners
  useEffect(() => {
    async function setupListeners() {
      try {
        const id = await invoke<string>('get_hardware_id');
        setHwid(id);

        // Listen for specific node status (banned/hold)
        const nodeRef = ref(database, `nodes/${id}`);
        const unsubNode = onValue(nodeRef, (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.val();
            if (data.status) {
              setStatus(data.status);
            }
          }
        });

        // Listen for global maintenance broadcast
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

        return () => {
          unsubNode();
          unsubSys();
        };
      } catch (e) {
        console.error('Failed to setup security listeners:', e);
      }
    }
    setupListeners();
  }, []);

  const isLocked = status === 'banned' || status === 'hold' || maintenance.enabled;

  return (
    <AnimatePresence>
      {isLocked && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-background/95 backdrop-blur-xl p-6"
        >
          {status === 'banned' && (
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="max-w-md w-full bg-danger/10 border border-danger/30 rounded-2xl p-8 text-center shadow-2xl"
            >
              <div className="w-20 h-20 bg-danger/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Ban className="w-10 h-10 text-danger" />
              </div>
              <h1 className="text-3xl font-bold text-foreground mb-4">ACCESS DENIED</h1>
              <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                This installation of Send2Me has been permanently restricted from accessing the peer-to-peer network due to a violation of our Acceptable Use Policy.
              </p>
              <div className="bg-background/50 rounded-lg p-3 border border-border/50">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Hardware ID</p>
                <code className="text-sm font-mono text-foreground">{hwid}</code>
              </div>
            </motion.div>
          )}

          {status === 'hold' && !maintenance.enabled && (
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="max-w-md w-full bg-warning/10 border border-warning/30 rounded-2xl p-8 text-center shadow-2xl"
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

          {maintenance.enabled && status !== 'banned' && (
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="max-w-md w-full bg-primary/10 border border-primary/30 rounded-2xl p-8 text-center shadow-2xl"
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
