import { useState, useEffect } from "react";
import { MonitorSmartphone, Plus, Monitor, Smartphone, Trash2, Send } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { Card, CardContent } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { PairDeviceModal } from "../components/PairDeviceModal";
import { useDeviceStore } from "../stores/useDeviceStore";
import { useNotificationStore } from "../stores/useNotificationStore";
import { StatusIndicator } from "../components/ui/StatusIndicator";
import { usePeersPolling } from "../hooks/usePeersPolling";

export function Devices() {
  const [isPairModalOpen, setIsPairModalOpen] = useState(false);
  const [isSending, setIsSending] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const trustedDevices = useDeviceStore(s => s.trustedDevices);
  const fetchTrustedDevices = useDeviceStore(s => s.fetchTrustedDevices);

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    try {
      await invoke('delete_trusted_device', { id });
      await fetchTrustedDevices();
    } catch (e) {
      useNotificationStore.getState().addNotification({
        type: 'error',
        title: 'Could not remove device',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const { peers: livePeers } = usePeersPolling();

  useEffect(() => {
    fetchTrustedDevices();
  }, [fetchTrustedDevices]);

  const handleSendToDevice = async (deviceId: string, pairingCode: string | undefined) => {
    if (!pairingCode) return;
    try {
      const selected = await open({
        multiple: true,
        directory: false,
        title: "Select files to send to this device"
      });

      if (selected) {
        setIsSending(deviceId);
        const files = Array.isArray(selected) ? selected : [selected];
        await invoke('start_transfer', { targetCode: pairingCode, files });
      }
    } catch (e) {
      useNotificationStore.getState().addNotification({
        type: 'error',
        title: 'Transfer failed to start',
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setIsSending(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <header className="h-20 flex items-end justify-between px-6 lg:px-10 pb-5 sticky top-0 z-10 bg-gradient-to-b from-background via-background/90 to-transparent">
        <div className="flex items-baseline gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">Paired Devices</h2>
          {trustedDevices.length > 0 && (
            <span className="text-xs font-semibold text-muted-foreground tabular-nums">
              {trustedDevices.length} {trustedDevices.length === 1 ? 'device' : 'devices'}
            </span>
          )}
        </div>
        <Button onClick={() => setIsPairModalOpen(true)} size="sm">
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Pair New Device
        </Button>
      </header>

      <div className="flex-1 px-6 lg:px-10 pb-10 overflow-y-auto">
        {trustedDevices.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {trustedDevices.map((device, i) => {
              const isOnline = livePeers.some(p => p.pairing_code === device.pairingCode);
              const status = isOnline ? 'online' : 'offline';

              return (
                <motion.div
                  key={device.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                >
                  <Card className="flex flex-col p-5 gap-5 relative overflow-hidden group h-full">
                    <div className="absolute top-4 right-4 flex items-center gap-1.5">
                      <StatusIndicator status={status} pulse={isOnline} />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{status}</span>
                    </div>

                    <div className="flex items-center gap-3.5 pr-16">
                      <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-105">
                        {device.deviceType === 'mobile'
                          ? <Smartphone className="w-6 h-6 text-primary" />
                          : <Monitor className="w-6 h-6 text-primary" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base font-semibold whitespace-normal break-words leading-tight">{device.name}</h3>
                        {device.os && device.os.toLowerCase() !== 'unknown' && (
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mt-1 font-medium">{device.os}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-auto pt-3 border-t border-border/40">
                      <span className="text-[11px] text-muted-foreground">
                        {device.lastSeen ? `Seen ${device.lastSeen.split(' ')[0]}` : 'Never connected'}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-primary hover:text-primary hover:bg-primary/10"
                          onClick={() => handleSendToDevice(device.id, device.pairingCode)}
                          disabled={isSending === device.id || !device.pairingCode || !isOnline}
                          title={!isOnline ? 'Device is offline' : undefined}
                        >
                          <Send className="w-3.5 h-3.5 mr-1.5" />
                          {isSending === device.id ? 'Starting…' : 'Send'}
                        </Button>
                        <button
                          className="text-muted-foreground hover:text-danger p-1.5 rounded-lg hover:bg-danger/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => setPendingDeleteId(device.id)}
                          aria-label={`Remove ${device.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <Card className="min-h-[420px] flex items-center justify-center bg-card/40 border-border/40">
            <CardContent className="flex flex-col items-center text-center p-10">
              <div className="w-20 h-20 rounded-2xl bg-secondary flex items-center justify-center mb-5 ring-8 ring-background">
                <MonitorSmartphone className="w-8 h-8 text-muted-foreground/60" />
              </div>
              <h3 className="text-lg font-semibold tracking-tight mb-1.5">No Paired Devices</h3>
              <p className="text-muted-foreground max-w-sm text-sm mb-6">
                Connect your phone, tablet, or another computer to start transferring files securely.
              </p>
              <Button size="lg" onClick={() => setIsPairModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Pair New Device
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <PairDeviceModal isOpen={isPairModalOpen} onClose={() => setIsPairModalOpen(false)} />

      <AnimatePresence>
        {pendingDeleteId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-background/75 backdrop-blur-sm p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-device-title"
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 8 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-sm"
            >
              <Card className="glass-card border-danger/30 shadow-[var(--shadow-e4)]">
                <CardContent className="p-6 flex flex-col gap-3 text-center pt-6">
                  <div className="w-14 h-14 rounded-2xl bg-danger/10 text-danger flex items-center justify-center mx-auto mb-1">
                    <Trash2 className="w-6 h-6" />
                  </div>
                  <h3 id="remove-device-title" className="text-lg font-semibold tracking-tight">Remove Device?</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    This will forget the paired device. You'll need to re-enter its connect code to reconnect.
                  </p>
                  <div className="flex gap-2.5 mt-3">
                    <button
                      onClick={() => setPendingDeleteId(null)}
                      className="flex-1 h-10 rounded-xl border border-border hover:bg-secondary/60 font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={confirmDelete}
                      className="flex-1 h-10 rounded-xl bg-danger text-white font-semibold text-sm hover:bg-danger/90 shadow-[0_4px_14px_hsl(var(--danger)/0.3)] hover:-translate-y-px transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
                    >
                      Remove
                    </button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
