import { useState, useEffect } from "react";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { Progress } from "./ui/Progress";
import { Copy, CheckCircle2, DownloadCloud, Loader2, XCircle } from "lucide-react";
import { useDeviceStore } from "../stores/useDeviceStore";
import { useNotificationStore } from "../stores/useNotificationStore";
import { listen } from "@tauri-apps/api/event";
import type { Transfer, LocalStage } from "../models/transfer";

type ReceiveState = 'waiting' | 'receiving' | 'completed' | 'failed' | 'cancelled';

// Ordered list of local stages, used to label the secondary progress bar.
const STAGE_ORDER: LocalStage[] = ['receiving', 'compiling', 'finalizing', 'renaming', 'system_scan', 'done'];
const STAGE_LABEL: Record<LocalStage, string> = {
  receiving: 'Receiving',
  compiling: 'Compiling',
  finalizing: 'Finalizing',
  renaming: 'Renaming',
  system_scan: 'System Processing',
  done: 'Done',
};

export function ReceiveModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const localDevice = useDeviceStore(state => state.localDevice);
  const receiveCode = localDevice?.pairingCode || "....";

  const [copied, setCopied] = useState(false);
  const [state, setState] = useState<ReceiveState>('waiting');
  const [progress, setProgress] = useState(0);
  const [localStage, setLocalStage] = useState<LocalStage>('receiving');
  const [localProgress, setLocalProgress] = useState(0);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let unlistenLocal: (() => void) | undefined;
    let cancelled = false;
    let boundTransferId: string | null = null;

    if (isOpen) {
      setCopied(false);
      setState('waiting');
      setProgress(0);
      setLocalStage('receiving');
      setLocalProgress(0);

      const setupListener = async () => {
        const handle = await listen<Transfer>("transfer-progress", (event) => {
          const t = event.payload;
          if (!t || t.direction !== "incoming") return;
          if (boundTransferId === null) boundTransferId = t.id;
          if (t.id !== boundTransferId) return;
          const next = Math.max(0, Math.min(100, Number(t.progress) || 0));
          setProgress(next);
          if (t.status === 'failed') setState('failed');
          else if (t.status === 'cancelled') setState('cancelled');
          else if (t.status === 'completed') setState('completed');
          else setState('receiving');
        });
        if (cancelled) handle();
        else unlisten = handle;

        const handleLocal = await listen<{
          transferId: string;
          stage: LocalStage;
          stagePercent: number;
          message: string;
        }>('transfer-local-progress', (event) => {
          const p = event.payload;
          if (boundTransferId === null) boundTransferId = p.transferId;
          if (p.transferId !== boundTransferId) return;
          setLocalStage(p.stage);
          setLocalProgress(Math.max(0, Math.min(100, p.stagePercent)));
          // Auto-transition UI when the receiver reports the final stage.
          if (p.stage === 'done') {
            setState('completed');
            setLocalProgress(100);
          }
        });
        if (cancelled) handleLocal();
        else unlistenLocal = handleLocal;
      };
      setupListener().catch((e) => {
        useNotificationStore.getState().addNotification({
          type: 'error',
          title: 'Receive listener failed',
          message: e instanceof Error ? e.message : String(e),
        });
      });
    }

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
      if (unlistenLocal) unlistenLocal();
      boundTransferId = null;
    };
  }, [isOpen]);

  const handleCopy = () => {
    navigator.clipboard.writeText(receiveCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  // Allow closing whenever the transfer is over. The receiver-side "receiving"
  // state stays open until the second progress bar reports `done`.
  const canClose = state !== 'receiving';
  const handleClose = () => { if (canClose) onClose(); };

  const stageIndex = STAGE_ORDER.indexOf(localStage);

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <div className="flex flex-col items-center text-center space-y-5">

        <div className="w-14 h-14 rounded-2xl bg-success/10 flex items-center justify-center">
          <DownloadCloud className="w-7 h-7 text-success" />
        </div>

        <div>
          <h2 className="text-xl font-semibold tracking-tight mb-1">Receive Files</h2>
          <p className="text-muted-foreground text-sm max-w-sm leading-relaxed">
            Ready to receive. Share this connect code with the sender.
          </p>
        </div>

        <div className="w-full p-5 rounded-2xl border border-border/40 bg-secondary/30 flex flex-col items-center justify-center space-y-3 relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.07] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-success via-transparent to-transparent pointer-events-none" />

          <div className="z-10 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Your Receive Code</div>
          <div className="z-10 text-4xl font-mono font-bold tracking-[0.25em] text-foreground py-1 tabular-nums">
            {receiveCode}
          </div>
          <div className="z-10">
            <Button variant="secondary" size="sm" onClick={handleCopy} disabled={!localDevice?.pairingCode}>
              {copied ? <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-success" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
              {copied ? "Copied" : "Copy Code"}
            </Button>
          </div>
        </div>

        {state === 'waiting' && (
          <div className="w-full pt-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
            <Loader2 className="w-4 h-4 animate-spin opacity-60" />
            <span className="text-xs font-medium">Waiting for sender to connect…</span>
          </div>
        )}

        {state === 'receiving' && (
          <div className="w-full pt-1 flex flex-col items-center justify-center gap-4">
            <h3 className="text-sm font-semibold text-primary">Receiving File…</h3>

            <div className="w-full max-w-xs flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                <span>Network Transfer</span>
                <span className="text-primary font-semibold tabular-nums">{progress.toFixed(0)}%</span>
              </div>
              <Progress value={progress} />
            </div>

            {progress === 100 && (
              <div className="w-full max-w-xs flex flex-col gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    {STAGE_ORDER.slice(1, 4).map((s, i) => {
                      const actualIndex = STAGE_ORDER.indexOf(s);
                      return (
                        <span
                          key={s}
                          className={
                            actualIndex < stageIndex
                              ? 'text-success'
                              : actualIndex === stageIndex
                                ? 'text-primary font-semibold'
                                : 'text-muted-foreground/50'
                          }
                        >
                          {STAGE_LABEL[s]}
                          {i < 2 && <span className="mx-1 opacity-40">→</span>}
                        </span>
                      );
                    })}
                  </span>
                  <span className="text-primary/80 font-semibold tabular-nums">
                    {localStage === 'done' ? 'Done' : `${localStage === 'receiving' ? 0 : localProgress.toFixed(0)}%`}
                  </span>
                </div>
                <Progress
                  value={localStage === 'done' ? 100 : (localStage === 'receiving' ? 0 : localProgress)}
                  variant="success"
                />
              </div>
            )}
          </div>
        )}

        {state === 'completed' && (
          <div className="w-full pt-1 flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-success/15 text-success flex items-center justify-center animate-[scale-check_0.4s_cubic-bezier(0.175,0.885,0.32,1.275)_forwards]">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <p className="text-sm font-semibold text-success">File received successfully</p>
            <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
          </div>
        )}

        {(state === 'failed' || state === 'cancelled') && (
          <div className="w-full pt-1 flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-danger/15 text-danger flex items-center justify-center">
              <XCircle className="w-7 h-7" />
            </div>
            <p className="text-sm font-semibold text-danger">
              {state === 'cancelled' ? 'Transfer cancelled by sender' : 'Transfer failed'}
            </p>
            <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
          </div>
        )}

      </div>
    </Modal>
  );
}
