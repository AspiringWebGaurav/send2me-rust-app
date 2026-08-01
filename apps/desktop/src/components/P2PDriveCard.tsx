
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Cloud, Lock, Users, FolderUp } from 'lucide-react';
import { useDeviceStore } from '@/stores/useDeviceStore';
import { useDriveStore } from '@/stores/useDriveStore';
import { invoke } from '@tauri-apps/api/core';

import { useNavigate } from 'react-router-dom';

export const P2PDriveCard = () => {
  const localDevice = useDeviceStore(state => state.localDevice);
  const isOnline = useDriveStore(state => state.isOnline);
  const connectCode = localDevice?.pairingCode || 'Offline';
  const navigate = useNavigate();

  const handleCloseRoom = async () => {
    await invoke('close_drive_room');
    useDriveStore.getState().setOnline(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="flex-1 min-h-0"
    >
      <Card className="h-full relative overflow-hidden flex flex-col items-center justify-center rounded-2xl group border-primary/20">
        <div className="absolute inset-0 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity duration-500 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary via-background to-background pointer-events-none" />

        <div className="z-10 flex flex-col items-center justify-center w-full h-full p-4 lg:p-6 text-center">
          
          <div className="flex items-center gap-2 mb-3">
            <Cloud className="w-6 h-6 text-primary" />
            <h2 className="text-lg lg:text-xl font-bold tracking-tight">P2P Secure Drive</h2>
            <Lock className="w-4 h-4 text-muted-foreground ml-1" />
          </div>

          <div className="flex items-center gap-4 mb-5">
            <div className="flex flex-col items-center">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Status</span>
              <div className="flex items-center gap-1.5 bg-secondary/50 px-2 py-0.5 rounded-full">
                <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-success animate-pulse' : 'bg-muted-foreground'}`} />
                <span className="text-xs font-medium">{isOnline ? 'Hosting' : 'Standby'}</span>
              </div>
            </div>

            <div className="h-8 w-px bg-border/50" />

            <div className="flex flex-col items-center">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Connect Code</span>
              <div className="bg-primary/10 text-primary px-3 py-0.5 rounded-md font-mono font-bold tracking-widest border border-primary/20 shadow-inner">
                {connectCode}
              </div>
            </div>
          </div>

          <p className="text-xs lg:text-sm text-muted-foreground/80 mb-6 max-w-[280px] leading-relaxed">
            Host a room to share files instantly with zero-copy, or securely join a friend's room.
          </p>

          <div className="flex w-full gap-3 px-2">
            {isOnline ? (
              <>
                <Button 
                  className="flex-1 gap-2 shadow-[0_0_15px_hsl(var(--primary)/0.2)] hover:shadow-[0_0_20px_hsl(var(--primary)/0.4)] transition-all"
                  onClick={() => navigate('/drive/host')}
                >
                  <FolderUp className="w-4 h-4" />
                  Manage Room
                </Button>
                <Button 
                  variant="danger"
                  className="flex-1 gap-2"
                  onClick={handleCloseRoom}
                >
                  Close Room
                </Button>
              </>
            ) : (
              <>
                <Button 
                  className="flex-1 gap-2 shadow-[0_0_15px_hsl(var(--primary)/0.2)] hover:shadow-[0_0_20px_hsl(var(--primary)/0.4)] transition-all"
                  onClick={() => navigate('/drive/host')}
                >
                  <FolderUp className="w-4 h-4" />
                  Host Room
                </Button>
                <Button 
                  variant="outline"
                  className="flex-1 gap-2 border-primary/20 hover:bg-primary/5"
                  onClick={() => navigate('/drive/guest')}
                >
                  <Users className="w-4 h-4" />
                  Join Room
                </Button>
              </>
            )}
          </div>
          
        </div>
      </Card>
    </motion.div>
  );
};
