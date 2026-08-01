import React, { useEffect, useRef, useState } from "react";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Progress } from "./ui/Progress";
import { Send, MonitorSmartphone, CheckCircle2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { VALID_PAIRING_CHARS } from "../lib/pairing";
import type { Transfer } from "../models/transfer";

interface SendModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedFiles: string[];
}

const WAITING_TIMEOUT_MS = 60_000;

export function SendModal({ isOpen, onClose, selectedFiles }: SendModalProps) {
  const [inputCode, setInputCode] = useState("");
  const [state, setState] = useState<"idle" | "connecting" | "sending" | "success">("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const waitingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeTransferIdsRef = useRef<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const clearWaitingTimeout = () => {
    if (waitingTimeoutRef.current) {
      clearTimeout(waitingTimeoutRef.current);
      waitingTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (unlistenRef.current) { unlistenRef.current(); unlistenRef.current = null; }
      clearWaitingTimeout();
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      if (unlistenRef.current) { unlistenRef.current(); unlistenRef.current = null; }
      clearWaitingTimeout();
      activeTransferIdsRef.current = [];
    }
  }, [isOpen]);

  const disposeListener = () => {
    if (unlistenRef.current) { unlistenRef.current(); unlistenRef.current = null; }
    clearWaitingTimeout();
  };

  const cancelAllOwnTransfers = async () => {
    const ids = activeTransferIdsRef.current;
    if (!ids.length) return;
    await Promise.all(ids.map(id => invoke("cancel_transfer", { id }).catch(() => {})));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.toUpperCase();
    const sanitized = raw.split("").filter(c => VALID_PAIRING_CHARS.includes(c)).join("").slice(0, 4);
    setInputCode(sanitized);
    if (errorMsg) setErrorMsg(null);
  };

  const handleConnect = async () => {
    if (inputCode.length !== 4) return;
    setState("connecting");
    setProgress(0);
    setErrorMsg(null);
    activeTransferIdsRef.current = [];

    try {
      disposeListener();
      unlistenRef.current = await listen<Transfer>("transfer-progress", (event) => {
        const payload = event.payload;
        if (!payload || payload.direction !== "outgoing") return;
        const ownIds = activeTransferIdsRef.current;
        if (ownIds.length > 0 && !ownIds.includes(payload.id)) return;

        setProgress(Number(payload.progress) || 0);
        if ((Number(payload.progress) || 0) > 0) clearWaitingTimeout();

        if (payload.status === "completed") {
          setState("success");
          disposeListener();
          setTimeout(() => { onClose(); setState("idle"); setInputCode(""); }, 2000);
        } else if (payload.status === "failed" || payload.status === "cancelled") {
          setState("idle");
          setErrorMsg(payload.status === "cancelled" ? "Transfer was cancelled." : "Transfer failed or was rejected.");
          disposeListener();
        }
      });

      const ids = await invoke<string[]>("start_transfer", { targetCode: inputCode, files: selectedFiles });
      const idList = Array.isArray(ids) ? ids : [];
      activeTransferIdsRef.current = idList;
      setState("sending");

      clearWaitingTimeout();
      waitingTimeoutRef.current = setTimeout(async () => {
        await cancelAllOwnTransfers();
        setErrorMsg("Timed out waiting for the receiver to accept.");
        setState("idle");
        disposeListener();
      }, WAITING_TIMEOUT_MS);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setState("idle");
      disposeListener();
    }
  };

  const handleClose = () => {
    onClose();
    setTimeout(() => { setState("idle"); setInputCode(""); setErrorMsg(null); }, 260);
  };

  const fileCount = selectedFiles.length;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} initialFocusRef={inputRef}>
      <div className="flex flex-col items-center text-center space-y-5">

        {state === "idle" && (
          <>
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Send className="w-6 h-6 text-primary" />
            </div>

            <div>
              <h2 className="text-xl font-semibold tracking-tight mb-1">
                Send {fileCount} File{fileCount !== 1 ? 's' : ''}
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed max-w-sm">
                Enter the receiver's connect code to establish a secure P2P transfer.
              </p>
            </div>

            <div className="w-full max-w-xs space-y-3 pt-1">
              <Input
                ref={inputRef}
                value={inputCode}
                onChange={handleInputChange}
                placeholder="Enter Code (e.g. AB7K)"
                className="text-center text-2xl font-mono tracking-[0.2em] uppercase h-14"
                maxLength={4}
                onKeyDown={(e) => { if (e.key === 'Enter' && inputCode.length === 4) handleConnect(); }}
              />
              <Button
                className="w-full"
                size="lg"
                disabled={inputCode.length !== 4}
                onClick={handleConnect}
              >
                Connect & Send
              </Button>
              {errorMsg && (
                <div className="text-danger text-xs p-3 bg-danger/10 rounded-xl border border-danger/20 leading-relaxed">
                  {errorMsg}
                </div>
              )}
            </div>
          </>
        )}

        {state === "connecting" && (
          <div className="py-10 flex flex-col items-center gap-5">
            <div className="relative w-20 h-20 flex items-center justify-center">
              <span className="absolute inset-0 rounded-full border-2 border-primary/30 animate-[soft-pulse_2s_ease-in-out_infinite]" />
              <span className="absolute inset-3 rounded-full border border-primary/50 animate-[soft-pulse_2s_ease-in-out_infinite_0.4s]" />
              <MonitorSmartphone className="w-7 h-7 text-primary relative z-10" />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-1">Connecting…</h3>
              <p className="text-muted-foreground text-sm">Finding device <span className="font-mono font-semibold text-primary">{inputCode}</span> via Iroh</p>
            </div>
            <button
              onClick={() => { disposeListener(); setState("idle"); setErrorMsg("Cancelled while connecting."); }}
              className="h-9 px-4 rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
            >
              Cancel
            </button>
          </div>
        )}

        {state === "sending" && (
          <div className="py-10 flex flex-col items-center w-full gap-4">
            {progress === 0 ? (
              <>
                <div className="relative w-20 h-20 flex items-center justify-center">
                  <span className="absolute inset-0 rounded-full border-2 border-primary/25 animate-ping" />
                  <span className="absolute inset-2 rounded-full border border-primary/40 animate-[ping_2s_ease-in-out_infinite_0.5s]" />
                  <div className="w-14 h-14 bg-primary/15 rounded-full flex items-center justify-center relative z-10">
                    <Send className="w-6 h-6 text-primary ml-0.5" />
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-1">Waiting for Accept…</h3>
                  <p className="text-muted-foreground text-xs leading-relaxed max-w-xs">
                    Ask the receiver to accept the transfer request on their device.
                    <br />
                    <span className="opacity-60">Auto-cancels after 60 seconds.</span>
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {[0, 150, 300].map(delay => (
                    <div key={delay} className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                  ))}
                </div>
                <button
                  onClick={async () => { await cancelAllOwnTransfers(); disposeListener(); setState("idle"); setErrorMsg("Cancelled while waiting for the receiver."); }}
                  className="h-9 px-4 rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center">
                  <Send className="w-6 h-6 text-primary ml-0.5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-1">Sending Files…</h3>
                  <p className="text-primary font-semibold tabular-nums">{progress.toFixed(0)}%</p>
                </div>
                <div className="w-full max-w-xs">
                  <Progress value={progress} />
                </div>
              </>
            )}
          </div>
        )}

        {state === "success" && (
          <div className="py-10 flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-success/15 text-success flex items-center justify-center animate-[scale-check_0.4s_cubic-bezier(0.175,0.885,0.32,1.275)_forwards]">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-1">Transfer Complete!</h3>
              <p className="text-muted-foreground text-sm">Your files were sent successfully.</p>
            </div>
          </div>
        )}

      </div>
    </Modal>
  );
}
