import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, Monitor, Search, Folder, Trash2, Unlink, Activity, ListOrdered, FileClock, HardDrive, Clock, Loader2, AlertTriangle, Zap, CheckCircle2, ShieldCheck, Cpu, Wifi } from "lucide-react";
import { useSyncStore } from "../stores/useSyncStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { Card, CardContent } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { Button } from "../components/ui/Button";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Progress } from "../components/ui/Progress";
import { FileSize } from "../components/ui/FileSize";

interface LiveSyncTransaction {
  op_id: string;
  file_name: string;
  direction: 'Upload' | 'Download';
  progress_percent: number;
  speed_bps: number;
  status: string;
}

interface TestBridgeResult {
  is_online: boolean;
  latency_ms: number;
  route_type: string;
  folders_healthy: number;
  folders_total: number;
  status_message: string;
  logs: string[];
}

export function FolderSync() {
  const settings = useSettingsStore(s => s.settings);
  const bondedDevices = useSyncStore(s => s.bondedDevices);
  const fetchBondedDevices = useSyncStore(s => s.fetchBondedDevices);
  const removeBondedDevice = useSyncStore(s => s.removeBondedDevice);
  const navigate = useNavigate();

  useEffect(() => {
    fetchBondedDevices();
  }, [fetchBondedDevices]);

  const [deviceToUnbind, setDeviceToUnbind] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'devices' | 'transactions' | 'queue'>('devices');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [queueRecords, setQueueRecords] = useState<any[]>([]);
  const [liveTransactions, setLiveTransactions] = useState<Record<string, LiveSyncTransaction>>({});

  useEffect(() => {
    const unlisten = listen<LiveSyncTransaction>('folder_sync_transfer_progress', (event) => {
      const payload = event.payload;
      if (payload.status === 'Done' || payload.status === 'Cancelled' || payload.status === 'Failed') {
        setLiveTransactions(prev => {
          const next = { ...prev };
          delete next[payload.op_id];
          return next;
        });
        if (payload.status === 'Done') {
            fetchTransactions();
        }
      } else {
        setLiveTransactions(prev => ({
          ...prev,
          [payload.op_id]: payload
        }));
      }
    });

    return () => {
      unlisten.then(f => f());
    };
  }, []);

  // Live Test Bridge state
  const [testTarget, setTestTarget] = useState<{ node_id: string; device_name: string } | null>(null);
  const [isTestingBridge, setIsTestingBridge] = useState(false);
  const [testResult, setTestResult] = useState<TestBridgeResult | null>(null);

  const handleTestBridge = async (nodeId: string, deviceName: string) => {
    setTestTarget({ node_id: nodeId, device_name: deviceName });
    setIsTestingBridge(true);
    setTestResult(null);
    try {
      const res = await invoke<TestBridgeResult>('test_sync_bridge', { targetNodeId: nodeId });
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        is_online: false,
        latency_ms: 0,
        route_type: 'Disconnected',
        folders_healthy: 0,
        folders_total: 0,
        status_message: err?.toString() || 'Bridge test failed',
        logs: [],
      });
    } finally {
      setIsTestingBridge(false);
    }
  };

  const fetchTransactions = async () => {
    try {
      const logs = await invoke<any[]>('get_action_history');
      setTransactions(logs.reverse());
    } catch (e) {
      console.error("Failed to load transactions", e);
    }
  };

  const fetchQueue = async () => {
    try {
      const q = await invoke<any[]>('get_sync_queue');
      setQueueRecords(q);
    } catch (e) {
      console.error("Failed to load sync queue", e);
    }
  };

  useEffect(() => {
    if (activeTab === 'transactions') {
      fetchTransactions();
    } else if (activeTab === 'queue') {
      fetchQueue();
      const interval = setInterval(fetchQueue, 2000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);



  if (!settings?.enableFolderSync) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <RefreshCw className="w-16 h-16 text-muted-foreground/30 mb-4" />
        <h2 className="text-2xl font-bold mb-2">Folder Sync is Disabled</h2>
        <p className="text-muted-foreground mb-6 max-w-md">
          Enable Folder Sync in your settings to automatically synchronize folders with your connected devices.
        </p>
        <button
          onClick={() => navigate('/settings', { state: { highlight: 'folder-sync' } })}
          className="h-10 px-6 rounded-full bg-primary text-primary-foreground font-semibold shadow-lg hover:shadow-primary/25 hover:-translate-y-0.5 transition-all"
        >
          Go to Settings
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <header className="h-16 shrink-0 flex items-center justify-between px-2 sm:px-4 mb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">Folder Sync</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">Manage your bonded devices and syncing folders</p>
        </div>
        <div className="flex items-center gap-2 bg-secondary/30 p-1 rounded-full border border-border/50">
          <button
            onClick={() => setActiveTab('devices')}
            className={`h-8 px-4 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === 'devices' 
                ? 'bg-background shadow-sm text-foreground' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Monitor className="w-4 h-4" />
            <span className="hidden sm:inline">Devices</span>
          </button>
          <button
            onClick={() => setActiveTab('transactions')}
            className={`h-8 px-4 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === 'transactions' 
                ? 'bg-background shadow-sm text-foreground' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span className="hidden sm:inline">Transactions</span>
            {Object.keys(liveTransactions).length > 0 && (
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold animate-pulse">
                {Object.keys(liveTransactions).length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('queue')}
            className={`h-8 px-4 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === 'queue' 
                ? 'bg-background shadow-sm text-foreground' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span className="hidden sm:inline">Live Queue</span>
            {queueRecords.length > 0 && (
              <span className="ml-1 w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center">
                {queueRecords.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {activeTab === 'devices' ? (
        <div className="flex-1 overflow-y-auto px-2 sm:px-4 pb-8 space-y-4">
        {bondedDevices.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-64 text-center border-2 border-dashed border-border/60 rounded-2xl bg-secondary/30"
          >
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No bonded devices</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-6">
              You haven't bonded with any devices yet. Bind a device to start syncing folders automatically.
            </p>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('folder-sync-bind-open'))}
              className="h-10 px-6 rounded-full bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-px transition-all"
            >
              Bind New Device
            </button>
          </motion.div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence>
              {bondedDevices.map((device, i) => (
                <motion.div
                  key={device.node_id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card className="h-full border-border/50 bg-card hover:bg-secondary/10 transition-colors">
                    <CardContent className="p-5 flex flex-col h-full">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <div className="relative w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Monitor className="w-5 h-5 text-primary" />
                            <div 
                              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${device.is_online ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-muted-foreground'}`}
                              title={device.is_online ? 'Online' : 'Offline'}
                            />
                          </div>
                          <div>
                            <h4 className="font-semibold text-[15px] truncate max-w-[150px]" title={device.device_name}>
                              {device.device_name}
                            </h4>
                            <p className="text-xs text-muted-foreground capitalize">
                              {device.os} • {device.is_online ? <span className="text-green-500 font-medium">Online</span> : <span>Offline</span>}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleTestBridge(device.node_id, device.device_name)}
                            className="h-8 px-2.5 rounded-lg bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground text-xs font-semibold transition-all flex items-center gap-1.5"
                            title="Test Live Connection Bridge"
                          >
                            <Zap className="w-3.5 h-3.5" />
                            <span>Test Bridge</span>
                          </button>
                          <button 
                            onClick={() => setDeviceToUnbind(device.node_id)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-danger/10 text-muted-foreground hover:text-danger transition-colors"
                            title="Unbind device"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="flex-1">
                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                          Sync Folders ({device.sync_folders.length})
                        </div>
                        {device.sync_folders.length === 0 ? (
                          <div className="h-20 border border-dashed border-border/50 rounded-xl flex items-center justify-center text-xs text-muted-foreground">
                            No folders configured
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {device.sync_folders.map(folder => (
                              <div key={folder.id} className="flex items-center justify-between p-2 rounded-lg bg-secondary/50 border border-border/50">
                                <div className="flex items-center gap-2 overflow-hidden">
                                  <Folder className="w-4 h-4 text-primary shrink-0" />
                                  <span className="text-xs font-medium truncate">{folder.path}</span>
                                </div>
                                <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm ${folder.status === 'active' ? 'bg-success/20 text-success' : folder.status === 'MISSING' ? 'bg-danger/20 text-danger' : folder.status === 'RECREATING' ? 'bg-primary/20 text-primary animate-pulse' : 'bg-warning/20 text-warning'}`}>
                                  {folder.status}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
      ) : activeTab === 'transactions' ? (
        <div className="flex-1 overflow-y-auto px-2 sm:px-4 pb-8 flex flex-col h-full">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <ListOrdered className="w-5 h-5 text-primary" />
              Activity Log
            </h3>
          </div>
          
          {Object.values(liveTransactions).length > 0 && (
            <div className="mb-6 space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2 text-primary">
                <Activity className="w-4 h-4 animate-pulse" />
                Live Sync Operations
              </h4>
              <div className="flex flex-col gap-3">
                <AnimatePresence initial={false}>
                  {Object.values(liveTransactions).map((tx) => (
                    <motion.div
                      key={tx.op_id}
                      layout
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="bg-card p-4 rounded-xl border border-primary/30 shadow-[0_0_15px_rgba(var(--primary),0.1)] flex flex-col gap-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${tx.direction === 'Upload' ? 'bg-primary/20 text-primary' : 'bg-success/20 text-success'}`}>
                            {tx.direction === 'Upload' ? <Zap className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
                          </div>
                          <span className="font-semibold text-sm truncate max-w-[200px] sm:max-w-xs">{tx.file_name}</span>
                        </div>
                        <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-md ${tx.direction === 'Upload' ? 'bg-primary/10 text-primary' : 'bg-success/10 text-success'}`}>
                          {tx.direction}ing
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono font-medium text-primary bg-primary/10 px-2 py-0.5 rounded">
                          <FileSize bytes={tx.speed_bps / 8} isSpeed />
                        </span>
                        <span className="font-mono font-bold text-muted-foreground">{tx.progress_percent.toFixed(0)}%</span>
                      </div>
                      
                      <Progress value={tx.progress_percent} variant="default" className="h-1.5" />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}

          <div className="flex-1 bg-card rounded-2xl border border-border/50 overflow-hidden flex flex-col">
            {transactions.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center mb-4">
                  <FileClock className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-1">No transactions yet</h3>
                <p className="text-sm text-muted-foreground">
                  When files are synced between devices, they will appear here in the activity log.
                </p>
              </div>
            ) : (
              <div className="overflow-y-auto p-2 space-y-2">
                {transactions.map((tx, idx) => (
                  <div key={idx} className="flex items-center gap-4 p-3 rounded-xl bg-secondary/20 hover:bg-secondary/40 transition-colors border border-transparent hover:border-border/50">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      tx.direction === 'Upload' ? 'bg-primary/10 text-primary' :
                      tx.direction === 'Download' ? 'bg-success/10 text-success' :
                      'bg-warning/10 text-warning'
                    }`}>
                      <Activity className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-sm font-semibold truncate pr-4">{tx.file_name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{new Date(tx.timestamp * 1000).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-3">
                          <span className="capitalize font-medium text-foreground">{tx.direction}</span>
                          <span className="flex items-center gap-1">
                            <HardDrive className="w-3 h-3" /> {(tx.file_size / 1024).toFixed(1)} KB
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span>{tx.duration_ms} ms</span>
                          <span className="text-primary">{(tx.speed_bps / (1024 * 1024 * 8)).toFixed(2)} MB/s</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-2 sm:px-4 pb-8 flex flex-col h-full">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary animate-pulse" />
              Real-time Sync Queue
            </h3>
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-secondary text-muted-foreground">
              Auto-sync active
            </span>
          </div>

          <div className="flex-1 bg-card rounded-2xl border border-border/50 overflow-hidden flex flex-col">
            {queueRecords.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center mb-4">
                  <Clock className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-1">Queue is Empty</h3>
                <p className="text-sm text-muted-foreground">
                  All monitored folders are fully synchronized across your devices.
                </p>
              </div>
            ) : (
              <div className="overflow-y-auto p-2 space-y-2">
                {queueRecords.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-4 p-3.5 rounded-xl bg-secondary/20 hover:bg-secondary/40 transition-colors border border-border/40">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      item.status === 'Transferring' ? 'bg-primary/20 text-primary' :
                      item.status === 'Failed' ? 'bg-danger/20 text-danger' :
                      'bg-warning/20 text-warning'
                    }`}>
                      {item.status === 'Transferring' ? <Loader2 className="w-5 h-5 animate-spin" /> :
                       item.status === 'Failed' ? <AlertTriangle className="w-5 h-5" /> :
                       <Clock className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold truncate pr-4">{item.relative_path || item.op_id}</span>
                        <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                          item.status === 'Transferring' ? 'bg-primary/20 text-primary' :
                          item.status === 'Failed' ? 'bg-danger/20 text-danger' :
                          'bg-warning/20 text-warning'
                        }`}>
                          {item.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/80">Intent: {item.intent}</span>
                        {item.retry_count > 0 && (
                          <span className="text-danger font-medium">Retries: {item.retry_count}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <Modal 
        isOpen={deviceToUnbind !== null} 
        onClose={() => setDeviceToUnbind(null)} 
        title="Sever Device Bond"
      >
        <div className="flex flex-col items-center text-center p-2">
          <div className="w-16 h-16 rounded-full bg-danger/10 flex items-center justify-center mb-4">
            <Unlink className="w-8 h-8 text-danger" />
          </div>
          <h3 className="text-xl font-bold mb-2">Are you absolutely sure?</h3>
          <p className="text-muted-foreground text-sm mb-6">
            This will completely disconnect the two devices. The connection will be removed on both sides at the same time, and folders will stop syncing.
          </p>
          <div className="flex w-full gap-3">
            <Button variant="ghost" className="flex-1" onClick={() => setDeviceToUnbind(null)}>
              Cancel
            </Button>
            <Button 
              variant="danger" 
              className="flex-1 shadow-lg shadow-danger/20 hover:shadow-danger/40"
              onClick={() => {
                if (deviceToUnbind) {
                  removeBondedDevice(deviceToUnbind);
                  setDeviceToUnbind(null);
                }
              }}
            >
              Sever Bond
            </Button>
          </div>
        </div>
      </Modal>

      {/* Live Bridge Diagnostic Modal */}
      <Modal
        isOpen={testTarget !== null}
        onClose={() => setTestTarget(null)}
        title="Live Bridge Diagnostic & Detector"
      >
        <div className="flex flex-col p-2 space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30 border border-border/50">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Cpu className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="font-semibold text-sm truncate">{testTarget?.device_name}</h4>
              <p className="text-xs text-muted-foreground truncate font-mono">{testTarget?.node_id}</p>
            </div>
          </div>

          {isTestingBridge ? (
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                <Zap className="w-5 h-5 text-primary absolute inset-0 m-auto animate-pulse" />
              </div>
              <div>
                <p className="text-sm font-semibold">Testing Live Connection Bridge...</p>
                <p className="text-xs text-muted-foreground">Measuring ping, ALPN handshake, and path speed</p>
              </div>
            </div>
          ) : testResult ? (
            <div className="space-y-3">
              {/* Ping RTT Card */}
              <div className={`p-4 rounded-xl border flex items-center justify-between ${testResult.is_online ? 'bg-success/5 border-success/30' : 'bg-danger/5 border-danger/30'}`}>
                <div className="flex items-center gap-3">
                  {testResult.is_online ? (
                    <CheckCircle2 className="w-6 h-6 text-success shrink-0" />
                  ) : (
                    <AlertTriangle className="w-6 h-6 text-danger shrink-0" />
                  )}
                  <div>
                    <div className="text-sm font-semibold flex items-center gap-2">
                      {testResult.is_online ? 'Bridge Active & Verified' : 'Bridge Connection Unreachable'}
                      {testResult.is_online && (
                        <span className="text-[10px] bg-success/20 text-success font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
                          Optimal
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{testResult.status_message}</div>
                  </div>
                </div>
                {testResult.is_online && (
                  <div className="text-right">
                    <div className="text-lg font-bold text-success font-mono">{testResult.latency_ms} <span className="text-xs font-normal">ms</span></div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Round-Trip Latency</div>
                  </div>
                )}
              </div>

              {/* Diagnostic Metrics Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-3 rounded-xl bg-secondary/40 border border-border/50 flex flex-col justify-between">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Wifi className="w-3.5 h-3.5 text-primary" />
                    <span className="font-medium">Transport Route</span>
                  </div>
                  <div className="font-semibold text-foreground font-mono">{testResult.route_type}</div>
                </div>

                <div className="p-3 rounded-xl bg-secondary/40 border border-border/50 flex flex-col justify-between">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                    <span className="font-medium">Folder Sync Health</span>
                  </div>
                  <div className="font-semibold text-foreground">
                    {testResult.folders_healthy} / {testResult.folders_total} Active
                  </div>
                </div>
              </div>

              {/* Real-Time Live Terminal Log Box */}
              {testResult.logs && testResult.logs.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between px-1">
                    <span>Live Bidirectional Test Logs</span>
                    <span className="text-primary font-mono text-[10px] bg-primary/10 px-2 py-0.5 rounded-full">{testResult.logs.length} events logged</span>
                  </div>
                  <div className="p-3 bg-slate-950 text-emerald-400 font-mono text-[11px] rounded-xl max-h-48 overflow-y-auto border border-slate-800 space-y-1 shadow-inner leading-relaxed select-text">
                    {testResult.logs.map((logLine: string, idx: number) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className="text-slate-600 shrink-0 select-none">&gt;</span>
                        <span className={logLine.startsWith('[Receiver]') ? 'text-cyan-400 font-semibold' : 'text-emerald-400'}>
                          {logLine}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2 flex gap-2">
                <Button variant="ghost" className="flex-1" onClick={() => setTestTarget(null)}>
                  Close
                </Button>
                <Button 
                  variant="default"
                  className="flex-1 flex items-center justify-center gap-2"
                  onClick={() => testTarget && handleTestBridge(testTarget.node_id, testTarget.device_name)}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Re-Test Live</span>
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
