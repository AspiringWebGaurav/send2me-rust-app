import { useEffect } from "react";
import { ArrowLeftRight, Download, Send, Pause, X, Play, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "../components/ui/Card";
import { useTransferStore } from "../stores/useTransferStore";
import { Progress } from "../components/ui/Progress";
import { Badge } from "../components/ui/Badge";
import { FileSize } from "../components/ui/FileSize";
import { formatDuration } from "../lib/utils";

export function Transfers() {
  const activeTransfers = useTransferStore(s => s.activeTransfers);
  const fetchActiveTransfers = useTransferStore(s => s.fetchActiveTransfers);
  const pauseTransfer = useTransferStore(s => s.pauseTransfer);
  const cancelTransfer = useTransferStore(s => s.cancelTransfer);

  useEffect(() => {
    fetchActiveTransfers();
  }, [fetchActiveTransfers]);

  const formatETA = (seconds?: number) => {
    if (seconds === undefined || seconds === 0) return '';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m > 0) return `${m}m ${s}s left`;
    return `${s}s left`;
  };

  const activeOngoing = activeTransfers.filter(t => !['completed', 'failed', 'cancelled'].includes(t.status));

  return (
    <div className="flex flex-col h-full">
      <header className="h-20 flex items-end px-6 lg:px-10 pb-5 sticky top-0 z-10 bg-gradient-to-b from-background via-background/90 to-transparent">
        <div className="flex items-baseline gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">Active Transfers</h2>
          {activeOngoing.length > 0 && (
            <span className="text-xs font-semibold text-muted-foreground tabular-nums">
              {activeOngoing.length} ongoing
            </span>
          )}
        </div>
      </header>

      <div className="flex-1 px-6 lg:px-10 pb-10 overflow-y-auto">
        {activeOngoing.length > 0 ? (
          <div className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {activeOngoing.map((transfer, i) => (
                <motion.div
                  key={transfer.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04, duration: 0.28, ease: [0.16, 1, 0.3, 1] } }}
                  exit={{ opacity: 0, y: -6, transition: { duration: 0.18 } }}
                >
                  <Card className="flex flex-col p-5 gap-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0 border border-border/50">
                          {transfer.direction === 'incoming'
                            ? <Download className="w-5 h-5 text-success" />
                            : <Send className="w-5 h-5 text-primary" />}
                        </div>
                        <div className="min-w-0 max-w-[220px] sm:max-w-xs md:max-w-md">
                          <h3 className="text-base font-semibold break-all leading-snug">
                            {transfer.fileName}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {transfer.direction === 'incoming'
                              ? <>From <span className="text-primary font-medium">{transfer.targetDevice.name}</span></>
                              : <>To <span className="text-primary font-medium">{transfer.targetDevice.name}</span></>}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2 w-full sm:w-auto">
                        <Badge
                          variant={transfer.status === 'paused' ? 'warning' : transfer.status === 'failed' || transfer.status === 'cancelled' ? 'danger' : 'default'}
                          className="uppercase tracking-wider text-[10px]"
                        >
                          {transfer.status === 'paused' ? (transfer.direction === 'incoming' ? 'Paused by Sender' : 'Paused')
                            : transfer.status === 'cancelled' ? (transfer.direction === 'incoming' ? 'Cancelled by Sender' : 'Cancelled')
                              : transfer.status === 'waiting' ? 'Waiting for Receiver'
                                : transfer.status}
                        </Badge>
                        {transfer.direction === 'outgoing' && !['completed', 'failed', 'cancelled', 'finalizing'].includes(transfer.status) && (
                          <>
                            <button
                              onClick={() => pauseTransfer(transfer.id)}
                              aria-label={transfer.status === 'paused' ? 'Resume transfer' : 'Pause transfer'}
                              className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {transfer.status === 'paused' ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => cancelTransfer(transfer.id)}
                              aria-label="Cancel transfer"
                              className="p-1.5 rounded-lg hover:bg-danger/15 transition-colors text-muted-foreground hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {!['cancelled', 'failed'].includes(transfer.status) && (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between text-xs font-medium">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span className="flex items-center gap-1 tabular-nums text-muted-foreground">
                              <FileSize bytes={transfer.bytesTransferred} className="text-foreground/80" />
                              <span className="opacity-40">/</span>
                              <FileSize bytes={transfer.fileSize} />
                            </span>

                            {transfer.speed && transfer.speed > 0 ? (
                              <span className="flex items-center gap-2">
                                <span className="text-primary font-semibold tabular-nums">
                                  <FileSize bytes={transfer.speed} isSpeed={true} />
                                </span>
                                <span className="text-[10px] font-mono font-semibold tracking-wider bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                  {transfer.speed < 1024 * 1024
                                    ? `${Math.round((transfer.speed * 8) / 1000)} Kbps`
                                    : `${Math.round((transfer.speed * 8) / 1_000_000)} Mbps`}
                                </span>
                                {transfer.parts ? (
                                  <span className="text-[10px] font-semibold bg-secondary/70 text-muted-foreground px-1.5 py-0.5 rounded">
                                    {transfer.parts} parts
                                  </span>
                                ) : null}
                              </span>
                            ) : null}
                            {transfer.estimatedTimeRemaining && transfer.estimatedTimeRemaining > 0 && transfer.estimatedTimeRemaining !== 999999 ? (
                              <span className="text-muted-foreground font-mono tabular-nums">{formatETA(transfer.estimatedTimeRemaining)}</span>
                            ) : transfer.status === 'finalizing' ? (
                              <span className="text-primary font-mono animate-[soft-pulse_1.5s_ease-in-out_infinite]">Finalizing…</span>
                            ) : null}
                          </div>
                          <span className="font-mono text-primary tabular-nums font-semibold">{transfer.progress.toFixed(0)}%</span>
                        </div>
                        <Progress
                          value={transfer.progress}
                          variant={transfer.status === 'paused' ? 'warning' : 'default'}
                          indeterminate={transfer.status === 'waiting'}
                        />

                        {transfer.direction === 'incoming' && transfer.progress === 100 && transfer.localStage && transfer.localStage !== 'done' && (
                          <div className="flex flex-col gap-1 mt-1 animate-in fade-in slide-in-from-bottom-1 duration-500">
                            <div className="flex items-center justify-between text-[10px] font-medium text-muted-foreground">
                              <span className="uppercase tracking-wider">
                                {transfer.localStage === 'receiving' ? 'Waiting' : (transfer.localMessage || transfer.localStage)}
                              </span>
                              <span className="tabular-nums text-primary/80 font-semibold">
                                {transfer.localStage === 'receiving' ? 0 : (transfer.localProgress ?? 0).toFixed(0)}%
                              </span>
                            </div>
                            <Progress
                              className="h-1"
                              value={transfer.localStage === 'receiving' ? 0 : (transfer.localProgress ?? 0)}
                              variant="success"
                            />
                          </div>
                        )}

                      </div>
                    )}
                    
                    {transfer.status === 'completed' && transfer.stageLogs && transfer.stageLogs.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border/40 text-xs">
                        <div className="flex items-center justify-between mb-2">
                           <span className="font-semibold text-foreground/80">Transfer Logs</span>
                           {transfer.durationMs && (() => {
                             const speed = transfer.fileSize / (transfer.durationMs / 1000);
                             return (
                               <div className="flex items-center gap-2">
                                 <span className="flex items-center gap-1.5 bg-secondary/80 text-muted-foreground px-1.5 py-0.5 rounded font-semibold tracking-wide tabular-nums">
                                   <span className="flex items-center gap-1">
                                     <Zap className="w-3 h-3 text-amber-500" />
                                     <FileSize bytes={speed} isSpeed={true} className="text-[1em]" />
                                   </span>
                                   <span className="opacity-40">|</span>
                                   <span className="text-[10px] font-mono font-semibold">
                                     {speed < 1024 * 1024
                                       ? `${Math.round((speed * 8) / 1000)} Kbps`
                                       : `${Math.round((speed * 8) / 1_000_000)} Mbps`}
                                   </span>
                                 </span>
                                 <span className="text-muted-foreground tabular-nums">
                                   Total time: {formatDuration(transfer.durationMs / 1000)}
                                 </span>
                               </div>
                             );
                           })()}
                        </div>
                        <div className="flex flex-col gap-1.5 font-mono text-[10px] text-muted-foreground bg-secondary/30 p-2 rounded-md border border-border/40 overflow-hidden">
                          {transfer.stageLogs.map((log, i) => (
                             <div key={i} className="flex gap-2 items-start">
                               <span className="opacity-50 shrink-0 tabular-nums">
                                 {new Date(log.time).toISOString().split('T')[1].substring(0, 8)}
                               </span>
                               <span className="text-foreground/70 break-all leading-tight">{log.message || log.stage}</span>
                             </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <Card className="h-full flex items-center justify-center bg-card/40 border-border/40 min-h-[400px]">
            <CardContent className="flex flex-col items-center text-center p-10">
              <div className="w-20 h-20 rounded-2xl bg-secondary flex items-center justify-center mb-5 ring-8 ring-background">
                <ArrowLeftRight className="w-8 h-8 text-muted-foreground/60" />
              </div>
              <h3 className="text-lg font-semibold tracking-tight mb-1.5">No Active Transfers</h3>
              <p className="text-muted-foreground max-w-sm text-sm">
                Files being sent or received will appear here in real-time.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
