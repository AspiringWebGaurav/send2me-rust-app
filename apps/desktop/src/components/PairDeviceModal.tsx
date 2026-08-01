import React, { useState, useEffect, useRef } from "react";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Copy, CheckCircle2, MonitorSmartphone } from "lucide-react";
import { useDeviceStore } from "../stores/useDeviceStore";
import { useNotificationStore } from "../stores/useNotificationStore";
import { sanitizePairingCode } from "../lib/pairing";

export function PairDeviceModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const localDevice = useDeviceStore(s => s.localDevice);
  const pairDevice = useDeviceStore(s => s.pairDevice);
  const [inputCode, setInputCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [isPairing, setIsPairing] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ownCode = localDevice?.pairingCode ?? "....";
  const isSelfCode =
    inputCode.length === 4 &&
    !!localDevice?.pairingCode &&
    inputCode.toUpperCase() === localDevice.pairingCode.toUpperCase();

  useEffect(() => {
    if (isOpen) {
      setInputCode("");
      setCopied(false);
      setIsPairing(false);
      setInlineError(null);
    }
  }, [isOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInlineError(null);
    setInputCode(sanitizePairingCode(e.target.value));
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(ownCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const handleConnect = async () => {
    if (inputCode.length !== 4) return;
    if (isSelfCode) {
      setInlineError("That's your own code — enter a code from another device.");
      return;
    }
    setIsPairing(true);
    setInlineError(null);
    try {
      await pairDevice(inputCode);
      useNotificationStore.getState().addNotification({
        type: 'success',
        title: 'Device paired',
        message: `Device ${inputCode} added to your trusted devices.`,
      });
      onClose();
    } catch {
      // pairDevice already shows a toast on error
    } finally {
      setIsPairing(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} initialFocusRef={inputRef}>
      <div className="flex flex-col items-center text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
          <MonitorSmartphone className="w-7 h-7 text-primary" />
        </div>

        <div>
          <h2 className="text-xl font-semibold tracking-tight mb-1">Pair Device</h2>
          <p className="text-muted-foreground text-sm max-w-sm leading-relaxed">
            Enter the connect code from the device you want to pair with, or share your code below.
          </p>
        </div>

        <div className="w-full space-y-2.5">
          <Input
            ref={inputRef}
            value={inputCode}
            onChange={handleInputChange}
            placeholder="Enter Connect Code (e.g. AB7K)"
            className="text-center text-xl font-mono tracking-[0.2em] uppercase h-12"
            maxLength={4}
            onKeyDown={(e) => { if (e.key === 'Enter' && inputCode.length === 4 && !isSelfCode) handleConnect(); }}
          />
          <Button
            className="w-full"
            size="lg"
            disabled={inputCode.length !== 4 || isPairing || isSelfCode}
            onClick={handleConnect}
            isLoading={isPairing}
          >
            {isPairing ? 'Connecting…' : 'Connect to Device'}
          </Button>
          {(inlineError || isSelfCode) && (
            <div className="text-danger text-xs p-3 bg-danger/10 rounded-xl border border-danger/20 leading-relaxed">
              {inlineError ?? "That's your own code — enter a code from another device."}
            </div>
          )}
        </div>

        <div className="w-full h-px bg-border/60 my-2 relative">
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card/90 px-3 text-[10px] text-muted-foreground font-semibold uppercase tracking-widest">
            Or share your code
          </span>
        </div>

        <div className="w-full p-5 rounded-2xl border border-border/40 bg-secondary/30 flex flex-col items-center justify-center space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Your Connect Code</div>
          <div className="text-3xl font-mono font-bold tracking-[0.25em] text-foreground tabular-nums">
            {ownCode}
          </div>
          <Button variant="secondary" size="sm" onClick={handleCopy}>
            {copied ? <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-success" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
            {copied ? "Copied" : "Copy Code"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
