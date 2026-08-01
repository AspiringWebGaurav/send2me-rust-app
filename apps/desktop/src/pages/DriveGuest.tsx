import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useDriveStore } from '@/stores/useDriveStore';
import { FileIcon, Cloud, UploadCloud, DownloadCloud, Loader2, ArrowLeft } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { toast } from 'sonner';

export const DriveGuest = () => {
  const { virtualFiles } = useDriveStore();
  const [connectCode, setConnectCode] = React.useState('');
  const [isConnecting, setIsConnecting] = React.useState(false);
  const [isConnected, setIsConnected] = React.useState(false);
  const [transferStatuses, setTransferStatuses] = React.useState<Record<string, 'pending' | 'downloading' | 'uploading'>>({});
  
  React.useEffect(() => {
    const unlistenPromise = listen('p2p-drive-event', (event: any) => {
        const payload = event.payload;
        if (payload && payload.GuestFilesUpdated) {
          useDriveStore.setState({ virtualFiles: payload.GuestFilesUpdated.files });
        } else if (payload && payload.GuestDisconnected) {
          setIsConnected(false);
          setConnectCode('');
          useDriveStore.setState({ virtualFiles: [] });
          toast.info("Host closed the room. You have been disconnected.");
        } else if (payload && payload.TransferCompleted) {
          toast.success(`File transferred successfully: ${payload.TransferCompleted.file_name}`);
          setTransferStatuses(prev => {
            const next = { ...prev };
            // Find fileId by filename
            const file = useDriveStore.getState().virtualFiles.find(f => f.name === payload.TransferCompleted.file_name);
            if (file) delete next[file.id];
            
            // Also clean up any 'uploading' statuses that might match this filename
            // For uploads, we use absolute path as key, so check values or just clear all uploads for this simple demo
            Object.keys(next).forEach(k => {
               if (next[k] === 'uploading' || next[k] === 'downloading') {
                  // We'll clear it when a transfer completes to be safe and reset UI
                  delete next[k];
               }
            });
            return next;
          });
        } else if (payload && payload.GuestDownloadDecision) {
          const { approved } = payload.GuestDownloadDecision;
          if (approved) {
            toast.success("Download approved! File is transferring to your Downloads folder.");
            setTransferStatuses(prev => {
              const next = { ...prev };
              Object.keys(next).forEach(key => {
                if (next[key] === 'pending') next[key] = 'downloading';
              });
              return next;
            });
          } else {
            toast.error("Download was denied by the host.");
            setTransferStatuses(prev => {
              const next = { ...prev };
              Object.keys(next).forEach(key => {
                if (next[key] === 'pending') delete next[key];
              });
              return next;
            });
          }
        }
      });

    return () => {
      unlistenPromise.then(f => f());
    };
  }, []);

  const handleConnect = async () => {
    if (!connectCode || connectCode.length < 4) return;
    setIsConnecting(true);
    try {
      await invoke('join_drive_room', { pairingCode: connectCode });
      setIsConnected(true);
    } catch (e: any) {
      toast.error(`Failed to connect: ${e}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleRequestDownload = async (fileId: string) => {
    setTransferStatuses(prev => ({ ...prev, [fileId]: 'pending' }));
    try {
      await invoke('request_download', { fileId });
      toast.info("Download requested, waiting for host approval...");
    } catch (e: any) {
      toast.error(`Failed to request download: ${e}`);
      setTransferStatuses(prev => {
        const next = { ...prev };
        delete next[fileId];
        return next;
      });
    }
  };

  const handleRequestUpload = async () => {
    try {
      const selectedPath = await open({
        multiple: false,
        title: 'Select File to Upload',
      });
      if (!selectedPath || Array.isArray(selectedPath)) return;
      
      setTransferStatuses(prev => ({ ...prev, [selectedPath]: 'uploading' }));
      await invoke('request_upload', { filePath: selectedPath });
      toast.info("Upload requested, waiting for host approval...");
    } catch (e: any) {
      toast.error(`Failed to request upload: ${e}`);
      // Simple reset on error
      setTransferStatuses({});
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!isConnected) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background/50 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <Card className="w-full max-w-md p-8 flex flex-col items-center text-center shadow-xl border-primary/20">
            <Cloud className="w-16 h-16 text-primary mb-6" />
            <h2 className="text-2xl font-bold mb-2">Join P2P Drive</h2>
            <p className="text-sm text-muted-foreground mb-8">Enter the host's 4-digit connect code to securely browse and transfer files.</p>
            
            <div className="w-full flex gap-3">
              <Input
                placeholder="e.g. 5737"
                value={connectCode}
                onChange={(e) => setConnectCode(e.target.value)}
                className="text-center font-mono text-lg tracking-[0.2em] font-bold h-12"
                maxLength={6}
              />
              <Button 
                onClick={handleConnect} 
                disabled={isConnecting || connectCode.length < 4}
                className="h-12 px-8"
              >
                {isConnecting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Connect'}
              </Button>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];
  const stagger = {
    initial: { opacity: 0, y: 16 },
    animate: (i: number) => ({ opacity: 1, y: 0, transition: { duration: 0.32, delay: i * 0.08, ease: EASE } }),
  };

  return (
    <div className="flex flex-col h-full w-full bg-background/50 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-border/40 bg-secondary/20">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setIsConnected(false)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-success shadow-[0_0_8px_hsl(var(--success)/0.6)]" />
            <h2 className="font-semibold text-sm md:text-base">Connected to Host (Code: {connectCode})</h2>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-4 md:gap-6 p-4 md:p-6 overflow-y-auto min-h-0">
        
        {/* Remote File Browser */}
        <motion.div 
          custom={0} initial="initial" animate="animate" variants={stagger}
          className="flex-[2] flex flex-col min-h-[300px]"
        >
          <Card className="flex-1 flex flex-col rounded-2xl overflow-hidden border-primary/20 shadow-xl bg-card">
          <div className="p-4 border-b border-border/40 bg-secondary/30 flex justify-between items-center">
            <h3 className="font-bold text-sm">Remote Files</h3>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2">
            {virtualFiles.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-50">
                <Cloud className="w-12 h-12 mb-4" />
                <p>The host has not shared any files yet.</p>
              </div>
            ) : (
              virtualFiles.map(file => {
                return (
                  <div key={file.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-secondary/40 border border-transparent hover:border-border/50 transition-colors group">
                    <div className="flex items-center gap-3">
                      <FileIcon className="w-8 h-8 text-primary/80" />
                      <div className="flex flex-col">
                        <span className="font-semibold text-sm max-w-[200px] truncate">{file.name}</span>
                        <span className="text-xs text-muted-foreground">{formatSize(file.size)}</span>
                      </div>
                    </div>
                    
                    <Button 
                      variant={transferStatuses[file.id] === 'pending' ? 'outline' : 'default'} 
                      size="sm" 
                      onClick={() => handleRequestDownload(file.id)}
                      disabled={!!transferStatuses[file.id]}
                      className="h-8 shadow-sm transition-all rounded-lg"
                    >
                      {transferStatuses[file.id] === 'downloading' ? (
                        <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Downloading</>
                      ) : transferStatuses[file.id] === 'pending' ? (
                        <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Waiting</>
                      ) : (
                        <><DownloadCloud className="w-4 h-4 mr-1.5" /> Download</>
                      )}
                    </Button>
                  </div>
                );
              })
            )}
          </div>
          </Card>
        </motion.div>

        <motion.div 
          custom={1} initial="initial" animate="animate" variants={stagger}
          className="flex-1 flex flex-col gap-4"
        >
          {/* Upload Dropzone */}
          <Card 
            className="flex flex-col rounded-2xl overflow-hidden border-dashed border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer group shadow-xl"
          onClick={handleRequestUpload}
        >
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 relative">
            {Object.values(transferStatuses).includes('uploading') && (
              <div className="absolute top-4 right-4 bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs font-semibold flex items-center shadow-lg">
                <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                Uploading to Host...
              </div>
            )}
            <Button 
              onClick={handleRequestUpload}
              className="w-full h-14 mt-4 rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-all text-primary font-semibold flex items-center justify-center gap-2"
            >
              <UploadCloud className="w-5 h-5" />
              <div className="flex flex-col items-start text-left">
                <span>Upload to Host</span>
                <span className="text-[10px] font-normal opacity-80">Send a file securely to the host PC</span>
              </div>
            </Button>
          </div>
        </Card>

        {/* Active Transfers */}
        <AnimatePresence>
          {Object.values(transferStatuses).some(t => t === 'downloading' || t === 'uploading') && (
            <motion.div 
              initial={{ opacity: 0, height: 0, scale: 0.95 }}
              animate={{ opacity: 1, height: 'auto', scale: 1 }}
              exit={{ opacity: 0, height: 0, scale: 0.9 }}
              className="flex flex-col gap-2"
            >
              <Card className="flex flex-col rounded-2xl overflow-hidden border-primary/20 shadow-xl bg-card">
                <div className="p-3 border-b border-border/40 bg-primary/10 flex items-center justify-between">
                  <h3 className="font-extrabold text-sm tracking-tight text-primary flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Active Transfers
                  </h3>
                  <Badge variant="default" className="px-2 py-0.5 font-bold text-xs shadow-sm">
                    {Object.values(transferStatuses).filter(t => t === 'downloading' || t === 'uploading').length}
                  </Badge>
                </div>
                <div className="p-3 flex flex-col gap-2">
                  {Object.entries(transferStatuses).map(([key, status]) => {
                    if (status !== 'downloading' && status !== 'uploading') return null;
                    
                    let name = "Unknown Transfer";
                    let size = 0;
                    if (status === 'downloading') {
                      const file = virtualFiles.find(f => f.id === key);
                      if (file) {
                        name = file.name;
                        size = file.size;
                      }
                    } else if (status === 'uploading') {
                      name = key.split('\\').pop()?.split('/').pop() || key;
                    }
                    
                    return (
                      <div key={key} className="flex flex-col p-2.5 rounded-xl bg-secondary/20 border border-border/50 relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent animate-[shimmer_2s_infinite] -translate-x-full" />
                        <div className="flex items-center justify-between relative z-10">
                          <div className="flex flex-col max-w-[150px]">
                            <span className="font-bold text-sm truncate">{name}</span>
                            {size > 0 && <span className="text-xs text-muted-foreground">{formatSize(size)}</span>}
                          </div>
                          <div className="flex flex-col items-end text-right">
                            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{status}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
};
