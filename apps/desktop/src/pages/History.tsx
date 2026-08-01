import { useEffect, useState } from "react";
import { History as HistoryIcon, Download, Send, Search, Trash2, Clock, Zap, HardDrive } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "../components/ui/Card";
import { useHistoryStore } from "../stores/useHistoryStore";
import { useTransferStore } from "../stores/useTransferStore";
import { Badge } from "../components/ui/Badge";
import { FileSize } from "../components/ui/FileSize";
import { formatDuration } from "../lib/utils";

export function History() {
  const records = useHistoryStore(s => s.records);
  const fetchHistory = useHistoryStore(s => s.fetchHistory);
  const clearHistory = useHistoryStore(s => s.clearHistory);
  const activeTransfers = useTransferStore(s => s.activeTransfers);
  const [searchQuery, setSearchQuery] = useState("");
  const [showClearModal, setShowClearModal] = useState(false);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const completedLive = activeTransfers
    .filter(t => ['completed', 'failed', 'cancelled'].includes(t.status))
    .filter(t => !records.some(r => r.transferId === t.id))
    .map(t => ({
      id: t.id,
      transferId: t.id,
      fileName: t.fileName,
      fileSize: t.fileSize,
      direction: t.direction,
      targetDeviceId: t.targetDevice.id,
      targetDeviceName: t.targetDevice.name,
      status: t.status,
      timestamp: new Date().toISOString(),
      durationSeconds: 0,
    }));

  const allRecords = [...records, ...completedLive];
  allRecords.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const filteredRecords = allRecords.filter(r =>
    r.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.targetDeviceName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      <header className="flex flex-col justify-end px-6 lg:px-10 pt-4 pb-5 sticky top-0 z-10 bg-gradient-to-b from-background via-background/95 to-transparent gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <h2 className="text-2xl font-semibold tracking-tight">Transfer History</h2>
            {allRecords.length > 0 && (
              <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                {allRecords.length} {allRecords.length === 1 ? 'record' : 'records'}
              </span>
            )}
          </div>
          {allRecords.length > 0 && (
            <button
              onClick={() => setShowClearModal(true)}
              className="h-8 px-3 bg-danger/10 text-danger hover:bg-danger/15 border border-danger/20 rounded-lg flex items-center gap-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear History
            </button>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search files or devices…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-9 pr-4 bg-secondary/50 hover:bg-secondary/70 border border-border/50 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary/60 transition-all text-sm placeholder:text-muted-foreground/60"
          />
        </div>
      </header>

      <div className="flex-1 px-6 lg:px-10 pb-10 overflow-y-auto flex flex-col">
        {filteredRecords.length > 0 ? (
          <div className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {filteredRecords.map((record, i) => (
                <motion.div
                  key={record.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i * 0.02, 0.2), duration: 0.24, ease: [0.16, 1, 0.3, 1] } }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                >
                  <Card className="flex flex-col sm:flex-row sm:items-center justify-between px-4 py-3.5 lg:px-5 gap-3 hover:bg-secondary/15 transition-colors">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                        {record.direction === 'incoming'
                          ? <Download className="w-5 h-5 text-success" />
                          : <Send className="w-5 h-5 text-primary" />}
                      </div>
                      <div className="min-w-0 flex-1 group cursor-default">
                        <h3 className="font-semibold text-sm leading-snug truncate group-hover:whitespace-normal group-hover:break-all transition-all duration-200" title={record.fileName}>
                          {record.fileName}
                        </h3>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                          <span className="truncate">{record.direction === 'incoming' ? 'From' : 'To'} <span className="text-primary font-medium">{record.targetDeviceName}</span></span>
                          <span className="opacity-40">·</span>
                          <span className="tabular-nums">{new Date(record.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
                          {record.durationSeconds > 0 && (() => {
                            const speed = record.fileSize / record.durationSeconds;
                            return (
                              <>
                                <span className="flex items-center gap-1 bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide tabular-nums ml-1">
                                  <Clock className="w-3 h-3" />
                                  {formatDuration(record.durationSeconds)}
                                </span>
                                <span className="flex items-center gap-1.5 bg-secondary/80 text-muted-foreground px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide tabular-nums ml-1">
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
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center shrink-0 gap-2 mt-1 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-0 border-border/20">
                      <div className="flex items-center gap-1.5 bg-foreground/5 dark:bg-foreground/10 px-2 py-1 rounded-md border border-border/30">
                        <HardDrive className="w-3.5 h-3.5 text-muted-foreground/80" />
                        <FileSize bytes={record.fileSize} className="text-[13px] font-semibold text-foreground/90 tabular-nums" />
                      </div>
                      <Badge
                        variant={record.status === 'completed' ? 'success' : record.status === 'failed' ? 'danger' : 'warning'}
                        className="uppercase text-[10px] tracking-wider"
                      >
                        {record.status}
                      </Badge>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <Card className="flex-1 flex items-center justify-center bg-card/40 border-border/40 min-h-[300px]">
            <CardContent className="flex flex-col items-center text-center p-10">
              <div className="w-20 h-20 rounded-2xl bg-secondary flex items-center justify-center mb-5 ring-8 ring-background">
                <HistoryIcon className="w-8 h-8 text-muted-foreground/60" />
              </div>
              <h3 className="text-lg font-semibold tracking-tight mb-1.5">
                {searchQuery ? 'No matches found' : 'No Transfer History'}
              </h3>
              <p className="text-muted-foreground max-w-sm text-sm">
                {searchQuery
                  ? `No records match "${searchQuery}". Try a different search.`
                  : 'Your past file transfers will be recorded here for easy access.'}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <AnimatePresence>
        {showClearModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-background/75 backdrop-blur-sm p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-history-title"
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
                  <h3 id="clear-history-title" className="text-lg font-semibold tracking-tight">Clear History?</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    This will permanently remove all transfer records from your device. This action cannot be undone.
                  </p>
                  <div className="flex gap-2.5 mt-3">
                    <button
                      onClick={() => setShowClearModal(false)}
                      className="flex-1 h-10 rounded-xl border border-border hover:bg-secondary/60 font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        clearHistory();
                        useTransferStore.getState().clearCompletedTransfers();
                        setShowClearModal(false);
                      }}
                      className="flex-1 h-10 rounded-xl bg-danger text-white font-semibold text-sm hover:bg-danger/90 shadow-[0_4px_14px_hsl(var(--danger)/0.3)] hover:-translate-y-px transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
                    >
                      Clear All
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
