import { useEffect, useState } from "react";
import { History as HistoryIcon, Download, Send, Search, Trash2, HardDrive } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "../components/ui/Card";
import { useHistoryStore } from "../stores/useHistoryStore";
import { useTransferStore } from "../stores/useTransferStore";
import { Badge } from "../components/ui/Badge";
import { FileSize } from "../components/ui/FileSize";

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
      <header className="h-10 shrink-0 flex items-center justify-between px-2 sm:px-3 mb-2 gap-3">
        <div className="flex items-baseline gap-2 shrink-0">
          <h2 className="text-lg font-semibold tracking-tight">Transfer History</h2>
          {allRecords.length > 0 && (
            <span className="text-xs font-semibold text-muted-foreground tabular-nums bg-secondary/80 px-2 py-0.5 rounded-full">
              {allRecords.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-1 justify-end max-w-sm">
          <div className="relative flex-1 max-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search files…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-8 pr-2.5 bg-secondary/50 hover:bg-secondary/70 border border-border/50 rounded-lg text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all placeholder:text-muted-foreground/60"
            />
          </div>
          {allRecords.length > 0 && (
            <button
              onClick={() => setShowClearModal(true)}
              className="h-8 px-2.5 bg-danger/10 text-danger hover:bg-danger/15 border border-danger/20 rounded-lg flex items-center gap-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 px-2 sm:px-3 pb-1 overflow-y-auto min-h-0 flex flex-col">
        {filteredRecords.length > 0 ? (
          <div className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {filteredRecords.map((record) => (
                <motion.div
                  key={record.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { duration: 0.16, ease: [0.16, 1, 0.3, 1] } }}
                  exit={{ opacity: 0, transition: { duration: 0.12 } }}
                >
                  <Card className="flex flex-col sm:flex-row sm:items-center justify-between px-3 py-2.5 gap-2.5 hover:bg-secondary/15 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                        {record.direction === 'incoming'
                          ? <Download className="w-4 h-4 text-success" />
                          : <Send className="w-4 h-4 text-primary" />}
                      </div>
                      <div className="min-w-0 flex-1 group cursor-default">
                        <h3 className="font-semibold text-xs leading-snug truncate group-hover:whitespace-normal group-hover:break-all transition-all duration-200" title={record.fileName}>
                          {record.fileName}
                        </h3>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                          <span className="truncate">{record.direction === 'incoming' ? 'From' : 'To'} <span className="text-primary font-medium">{record.targetDeviceName}</span></span>
                          <span className="opacity-40">·</span>
                          <span className="tabular-nums">{new Date(record.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end shrink-0 gap-2 border-t sm:border-0 border-border/20 pt-1 sm:pt-0">
                      <div className="flex items-center gap-1 bg-foreground/5 dark:bg-foreground/10 px-1.5 py-0.5 rounded border border-border/30">
                        <HardDrive className="w-3 h-3 text-muted-foreground/80" />
                        <FileSize bytes={record.fileSize} className="text-[11px] font-semibold text-foreground/90 tabular-nums" />
                      </div>
                      <Badge
                        variant={record.status === 'completed' ? 'success' : record.status === 'failed' ? 'danger' : 'warning'}
                        className="uppercase text-[9px] tracking-wider py-0"
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
          <Card className="flex-1 flex items-center justify-center bg-card/40 border-border/40 min-h-0 py-6">
            <CardContent className="flex flex-col items-center text-center p-6">
              <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mb-3 ring-4 ring-background">
                <HistoryIcon className="w-6 h-6 text-muted-foreground/60" />
              </div>
              <h3 className="text-base font-semibold tracking-tight mb-1">
                {searchQuery ? 'No matches found' : 'No Transfer History'}
              </h3>
              <p className="text-muted-foreground max-w-xs text-xs">
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
