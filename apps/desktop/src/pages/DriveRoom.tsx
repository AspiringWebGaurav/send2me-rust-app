import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useDriveStore } from '@/stores/useDriveStore';
import { useDeviceStore } from '@/stores/useDeviceStore';
import { Server, Users, FileIcon, X, Check, Upload, Download, ShieldAlert, Plus, Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { toast } from 'sonner';
import { listen } from '@tauri-apps/api/event';
import React, { useEffect } from 'react';

export const DriveRoom = () => {
  const { isOnline, activeGuests, virtualFiles, pendingRequests } = useDriveStore();
  const localDevice = useDeviceStore(state => state.localDevice);
  const connectCode = localDevice?.pairingCode || 'Offline';
  
  // Track active transfers (key is file_name)
  const [activeTransfers, setActiveTransfers] = React.useState<Record<string, { guest_name: string; type: string; file_name: string; file_size: number }>>({});

  useEffect(() => {
    const unlistenPromise = listen('p2p-drive-event', (event: any) => {
      const payload = event.payload;
      if (payload) {
          if (payload.GuestConnected) {
            useDriveStore.getState().addGuest({ 
              node_id: payload.GuestConnected.node_id, 
              name: payload.GuestConnected.name 
            });
            toast.success(`${payload.GuestConnected.name} joined the room!`);
          } else if (payload.GuestDisconnected) {
            useDriveStore.getState().removeGuest(payload.GuestDisconnected.node_id);
            toast.info("A guest has left the room.");
          } else if (payload.RequestReceived) {
            useDriveStore.getState().addRequest({
              id: payload.RequestReceived.request_id,
              request_type: payload.RequestReceived.request_type,
              guest_node_id: payload.RequestReceived.guest_node_id,
              guest_name: 'Guest', 
              file_name: payload.RequestReceived.file_name,
              file_size: payload.RequestReceived.file_size,
              timestamp: Date.now()
            });
            toast.info(`New ${payload.RequestReceived.request_type} request received!`);
          } else if (payload.TransferCompleted) {
            toast.success(`File transferred successfully: ${payload.TransferCompleted.file_name}`);
            setActiveTransfers(prev => {
              const next = { ...prev };
              delete next[payload.TransferCompleted.file_name];
              return next;
            });
          }
      }
    });

    return () => {
      unlistenPromise.then(f => f());
    };
  }, []);

  const handleStartRoom = async () => {
    try {
      await invoke('start_drive_room');
      useDriveStore.getState().setOnline(true);
    } catch (e: any) {
      toast.error(`Failed to start drive room: ${e}`);
    }
  };

  const handleCloseRoom = async () => {
    try {
      await invoke('close_drive_room');
      useDriveStore.getState().setOnline(false);
    } catch (e: any) {
      toast.error(`Failed to close drive room: ${e}`);
    }
  };

  const handleAddFiles = async () => {
    try {
      const selected = await open({
        multiple: true,
        directory: false,
      });
      
      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected];
        for (const path of paths) {
          const fileMeta: any = await invoke('add_virtual_file', { absolutePath: path });
          useDriveStore.getState().addVirtualFile(fileMeta);
        }
      }
    } catch (e: any) {
      toast.error(`Failed to add file: ${e}`);
    }
  };

  const handleRemoveFile = async (id: string) => {
    try {
      await invoke('remove_virtual_file', { fileId: id });
      useDriveStore.getState().removeVirtualFile(id);
    } catch (e: any) {
      toast.error(`Failed to remove file: ${e}`);
    }
  };

  const approveRequest = async (id: string) => {
    const req = pendingRequests.find(r => r.id === id);
    if (req) {
      setActiveTransfers(prev => ({ 
        ...prev, 
        [req.file_name]: { 
          guest_name: req.guest_name, 
          type: req.request_type, 
          file_name: req.file_name,
          file_size: req.file_size
        } 
      }));
    }
    
    try {
      await invoke('approve_request', { requestId: id });
      useDriveStore.getState().removeRequest(id);
      toast.success("Request approved. Transferring...");
    } catch (e: any) {
      toast.error(`Failed to approve request: ${e}`);
      if (req) {
        setActiveTransfers(prev => {
          const next = { ...prev };
          delete next[req.file_name];
          return next;
        });
      }
    }
  };

  const denyRequest = async (id: string) => {
    try {
      await invoke('deny_request', { requestId: id });
      useDriveStore.getState().removeRequest(id);
      toast.info("Request denied.");
    } catch (e: any) {
      toast.error(`Failed to deny request: ${e}`);
    }
  };

  const kickGuest = async (nodeId: string) => {
    try {
      await invoke('kick_guest', { guestNodeId: nodeId });
      toast.success("Guest kicked successfully.");
    } catch (e: any) {
      toast.error(`Failed to kick guest: ${e}`);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];
  const stagger = {
    initial: { opacity: 0, y: 16 },
    animate: (i: number) => ({ opacity: 1, y: 0, transition: { duration: 0.32, delay: i * 0.08, ease: EASE } }),
  };

  return (
    <div className="flex flex-row h-full w-full gap-3 p-1 overflow-hidden min-h-0">
      
      {/* Left Column: Room & Files Area */}
      <motion.div 
        custom={0} initial="initial" animate="animate" variants={stagger}
        className="flex-1 flex flex-col min-h-0 overflow-hidden"
      >
        <Card className="flex-1 flex flex-col relative overflow-hidden rounded-2xl border-primary/20 shadow-md bg-card min-h-0">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-primary/50" />
          <div className="flex flex-col p-3.5 border-b border-border/40 bg-secondary/20 relative shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2.5">
                <div className={`w-3 h-3 rounded-full ${isOnline ? 'bg-success animate-pulse shadow-[0_0_8px_hsl(var(--success)/0.6)]' : 'bg-muted-foreground'}`} />
                <div>
                  <h2 className="font-bold text-base tracking-tight leading-tight">P2P Host Room</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Status: {isOnline ? 'Online' : 'Offline'}</span>
                  </div>
                </div>
              </div>
              <Button 
                variant={isOnline ? "danger" : "default"} 
                size="sm"
                className="font-semibold rounded-lg shadow-sm h-8 px-3"
                onClick={isOnline ? handleCloseRoom : handleStartRoom}
              >
                {isOnline ? 'Close Room' : 'Start Room'}
              </Button>
            </div>
            
            {isOnline && (
              <div className="flex items-center gap-2 bg-background/50 px-2.5 py-1 rounded-lg border border-border/50 w-max">
                <span className="text-xs text-muted-foreground font-medium">Connect Code:</span>
                <span className="font-mono bg-primary/10 text-primary px-2 py-0.5 rounded font-bold text-sm tracking-wider">{connectCode}</span>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2 min-h-0">
            {virtualFiles.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-60 p-4 text-center">
                <div className="w-12 h-12 rounded-xl bg-secondary/50 flex items-center justify-center mb-2.5">
                  <Server className={`w-6 h-6 ${isOnline ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
                <h3 className="text-sm font-semibold mb-1">{isOnline ? 'Room is Online' : 'Drop Files Here'}</h3>
                <p className="text-xs text-muted-foreground max-w-[220px] mb-3">
                  {isOnline ? 'Guests connect with your code to browse files.' : 'Start the room and add files for zero-copy sharing.'}
                </p>
                <Button variant="outline" size="sm" onClick={handleAddFiles} className="opacity-100 rounded-lg font-medium shadow-sm h-8">
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Browse Files
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 p-2">
                <div className="flex items-center justify-between pb-2 mb-1 border-b border-border/40">
                  <h3 className="text-xs font-bold text-foreground/80">Shared Files <Badge variant="secondary" className="ml-1 text-[10px] bg-secondary/50">{virtualFiles.length}</Badge></h3>
                  <Button variant="default" size="sm" onClick={handleAddFiles} className="h-7 text-xs px-2 rounded-md font-medium shadow-sm">
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Add File
                  </Button>
                </div>
                <div className="grid gap-1.5">
                  {virtualFiles.map(file => (
                    <div key={file.id} className="group flex items-center justify-between p-2 rounded-lg bg-secondary/20 hover:bg-secondary/60 border border-transparent hover:border-primary/20 transition-all shadow-sm">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="p-1.5 rounded-md bg-background shadow-sm shrink-0">
                          <FileIcon className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold text-xs truncate max-w-[150px]">{file.name}</span>
                          <span className="text-[10px] font-medium text-muted-foreground">{formatSize(file.size)}</span>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleRemoveFile(file.id)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      </motion.div>

      {/* Right Column: Guests & Queue */}
      <motion.div 
        custom={1} initial="initial" animate="animate" variants={stagger}
        className="flex-1 flex flex-col gap-2.5 min-h-0 overflow-hidden"
      >
        
        {/* Active Guests */}
        <Card className="flex flex-col rounded-2xl overflow-hidden border-primary/10 shadow-md max-h-[160px] min-h-0">
          <div className="p-3 border-b border-border/40 bg-secondary/10 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="p-1 bg-primary/10 rounded-md">
                <Users className="w-3.5 h-3.5 text-primary" />
              </div>
              <h3 className="font-bold text-xs tracking-tight">Active Guests</h3>
            </div>
            <Badge variant="secondary" className="px-2 py-0.5 font-bold text-xs bg-background border-border/50">{activeGuests.length}</Badge>
          </div>
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5 bg-card/50 min-h-0">
            {activeGuests.length === 0 ? (
              <div className="m-auto text-center opacity-40 py-2">
                <p className="text-xs font-medium">Waiting for connections...</p>
              </div>
            ) : (
              <div className="grid gap-1.5">
                {activeGuests.map(guest => (
                  <div key={guest.node_id} className="flex items-center justify-between p-2 rounded-lg bg-background border border-border/40 shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-success animate-pulse shadow-[0_0_6px_hsl(var(--success)/0.5)]" />
                      <span className="text-xs font-semibold">{guest.name}</span>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 rounded-full text-destructive hover:bg-destructive/10 transition-colors"
                      onClick={() => kickGuest(guest.node_id)}
                      title="Kick Guest"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Approval Queue */}
        <Card className="flex-1 flex flex-col rounded-2xl overflow-hidden border-warning/20 shadow-md min-h-0">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-warning to-warning/50" />
          <div className="p-3 border-b border-border/40 bg-warning/5 flex items-center justify-between relative shrink-0">
            <h3 className="font-bold text-xs tracking-tight text-foreground flex items-center gap-1.5">
              Pending Requests
              {pendingRequests.length > 0 && <span className="relative flex h-2 w-2 ml-1"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-warning"></span></span>}
            </h3>
            {pendingRequests.length > 0 && (
              <Badge variant="warning" className="px-2 py-0.5 font-bold text-xs bg-warning text-warning-foreground">{pendingRequests.length}</Badge>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-card/30">
            <AnimatePresence>
              {pendingRequests.length === 0 ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.4 }} className="m-auto text-center py-8">
                  <p className="text-sm font-medium">No pending requests.</p>
                </motion.div>
              ) : (
                pendingRequests.map(req => (
                  <motion.div 
                    key={req.id}
                    initial={{ opacity: 0, y: 15, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                    className="flex flex-col gap-3 p-4 rounded-2xl border border-warning/20 bg-background shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-md ${req.request_type === 'Download' ? 'bg-primary/10' : 'bg-success/10'}`}>
                          {req.request_type === 'Download' ? <Download className="w-4 h-4 text-primary" /> : <Upload className="w-4 h-4 text-success" />}
                        </div>
                        <span className="font-bold text-sm">{req.guest_name}</span>
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{req.request_type}</span>
                      </div>
                      <span className="text-xs text-muted-foreground font-mono">{new Date(req.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    <div className="font-mono text-sm bg-secondary/30 p-2.5 rounded-lg border border-border/40 truncate flex items-center justify-between">
                      <span className="truncate mr-3 font-semibold">{req.file_name}</span>
                      <span className="text-xs font-medium text-muted-foreground shrink-0 bg-background px-2 py-0.5 rounded-md">{formatSize(req.file_size)}</span>
                    </div>
                    <div className="flex gap-3 mt-1">
                      <Button 
                        className="flex-1 rounded-xl font-bold bg-success hover:bg-success/90 text-success-foreground shadow-sm hover:shadow-md transition-all" 
                        size="sm" 
                        onClick={() => approveRequest(req.id)}
                      >
                        <Check className="w-4 h-4 mr-1.5" /> Approve
                      </Button>
                      <Button 
                        variant="danger" 
                        className="flex-1 rounded-xl font-bold shadow-sm hover:shadow-md transition-all" 
                        size="sm" 
                        onClick={() => denyRequest(req.id)}
                      >
                        <X className="w-4 h-4 mr-1.5" /> Deny
                      </Button>
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </Card>
        
        {/* Active Transfers */}
        <AnimatePresence>
          {Object.values(activeTransfers).length > 0 && (
            <motion.div 
              initial={{ opacity: 0, height: 0, scale: 0.95 }}
              animate={{ opacity: 1, height: 'auto', scale: 1 }}
              exit={{ opacity: 0, height: 0, scale: 0.9 }}
              className="flex flex-col gap-2"
            >
              <Card className="flex flex-col rounded-3xl overflow-hidden border-primary/20 shadow-xl bg-card">
                <div className="p-4 border-b border-border/40 bg-primary/10 flex items-center justify-between">
                  <h3 className="font-extrabold text-sm tracking-tight text-primary flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Active Transfers
                  </h3>
                  <Badge variant="default" className="px-2 py-0.5 font-bold text-xs shadow-sm">{Object.keys(activeTransfers).length}</Badge>
                </div>
                <div className="p-4 flex flex-col gap-3">
                  {Object.values(activeTransfers).map(transfer => (
                    <div key={transfer.file_name} className="flex flex-col p-3 rounded-2xl bg-secondary/20 border border-border/50 relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent animate-[shimmer_2s_infinite] -translate-x-full" />
                      <div className="flex items-center justify-between relative z-10">
                        <div className="flex flex-col max-w-[200px]">
                          <span className="font-bold text-sm truncate">{transfer.file_name}</span>
                          <span className="text-xs text-muted-foreground">{formatSize(transfer.file_size)}</span>
                        </div>
                        <div className="flex flex-col items-end text-right">
                          <span className="text-xs font-medium uppercase tracking-wider">{transfer.type}</span>
                          <span className="text-xs text-primary font-bold">{transfer.guest_name}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
        
      </motion.div>
    </div>
  );
};
