import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, RefreshCw, AlertCircle, ArrowRight, Clock } from 'lucide-react';
import { useUpdateStore } from '../stores/useUpdateStore';

export const UpdateHoldingOverlay: React.FC = () => {
  const currentVersion = useUpdateStore((state) => state.currentVersion);
  const targetVersion = useUpdateStore((state) => state.targetVersion);
  const status = useUpdateStore((state) => state.status);
  const progress = useUpdateStore((state) => state.progress);
  const errorMessage = useUpdateStore((state) => state.errorMessage);

  const cleanCurrent = (currentVersion || '0.0.1').replace(/^v/i, '');
  const cleanTarget = (targetVersion || 'latest').replace(/^v/i, '');

  const isHolding =
    status === 'downloading' ||
    status === 'verifying' ||
    status === 'ready' ||
    status === 'restarting';

  const isQueued = status === 'waiting_timer';

  const stageLabel = (() => {
    switch (status) {
      case 'downloading':
        return `DOWNLOADING UPDATE (${Math.round(progress || 45)}%)`;
      case 'verifying':
        return 'VERIFYING CONTAINER INTEGRITY';
      case 'ready':
      case 'restarting':
        return 'RESTARTING APPLICATION...';
      default:
        return 'PREPARING UPDATE...';
    }
  })();

  const activeProgress =
    status === 'downloading'
      ? Math.max(15, Math.min(95, Math.round(progress || 45)))
      : 100;

  return (
    <>
      {/* 1. Queued Banner (when user has active file transfer in progress) */}
      <AnimatePresence>
        {isQueued && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-2 left-1/2 -translate-x-1/2 z-50 bg-amber-500/15 dark:bg-amber-500/20 text-amber-900 dark:text-amber-200 border border-amber-500/30 backdrop-blur-md rounded-full px-4 py-1.5 flex items-center gap-2 text-xs font-medium shadow-lg select-none"
          >
            <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 animate-pulse" />
            <span>Update v{cleanTarget} is ready &amp; queued</span>
            <span className="text-[10.5px] opacity-75 font-mono">(installs right after transfer)</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Full-Screen Holding Modal Overlay */}
      <AnimatePresence>
        {isHolding && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-md select-none p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-md bg-card border border-border shadow-2xl rounded-2xl p-6 flex flex-col items-center text-center relative overflow-hidden"
            >
              {/* Subtle top ambient glow */}
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-500 via-primary to-cyan-500" />

              {/* Animated Icon */}
              <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
                {status === 'restarting' || status === 'ready' || status === 'verifying' ? (
                  <RefreshCw className="w-7 h-7 text-primary animate-spin" />
                ) : (
                  <Download className="w-7 h-7 text-primary animate-bounce" />
                )}
              </div>

              {/* Title & Subtitle */}
              <h2 className="text-lg font-bold text-foreground tracking-tight">
                Updating Send2Me
              </h2>
              <p className="text-xs text-muted-foreground mt-1.5 max-w-xs leading-relaxed">
                A new update is available. Please hold on for a moment while Send2Me updates itself.
              </p>

              {/* Version Badges */}
              <div className="flex items-center gap-2 mt-4 px-3 py-1.5 rounded-lg bg-secondary/50 border border-border/60 text-xs font-mono">
                <span className="text-muted-foreground">v{cleanCurrent}</span>
                <ArrowRight className="w-3.5 h-3.5 text-primary" />
                <span className="font-semibold text-primary">v{cleanTarget}</span>
              </div>

              {/* Progress Bar & Stage Indicator */}
              <div className="w-full mt-6 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground px-0.5">
                  <span className="font-semibold text-primary tracking-wide">{stageLabel}</span>
                  <span>{activeProgress}%</span>
                </div>
                <div className="w-full h-2 bg-secondary rounded-full overflow-hidden border border-border/40">
                  <motion.div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${activeProgress}%` }}
                  />
                </div>
              </div>

              {/* Footnote */}
              <div className="mt-5 text-[11px] text-muted-foreground/80 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Your session and settings are safely preserved.</span>
              </div>

              {/* Fallback Error Dismiss */}
              {errorMessage && (
                <div className="mt-4 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center justify-between w-full">
                  <div className="flex items-center gap-2 text-left truncate">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="truncate">{errorMessage}</span>
                  </div>
                  <button
                    onClick={() => useUpdateStore.setState({ status: 'idle', errorMessage: null })}
                    className="text-[11px] underline font-medium hover:opacity-80 shrink-0 ml-2"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
