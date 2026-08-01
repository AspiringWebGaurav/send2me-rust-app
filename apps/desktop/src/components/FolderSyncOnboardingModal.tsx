import React, { useRef, useState } from "react";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { HardDrive, MonitorSmartphone, Link2 } from "lucide-react";
import { VALID_PAIRING_CHARS } from "../lib/pairing";
import { invoke } from "@tauri-apps/api/core";

interface FolderSyncOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FolderSyncOnboardingModal({ isOpen, onClose }: FolderSyncOnboardingModalProps) {
  const [inputCode, setInputCode] = useState("");
  const [state, setState] = useState<"idle" | "connecting" | "success">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.toUpperCase();
    const sanitized = raw.split("").filter(c => VALID_PAIRING_CHARS.includes(c)).join("").slice(0, 4);
    setInputCode(sanitized);
  };

  const handleConnect = () => {
    if (inputCode.length !== 4) return;
    setState("connecting");
    setErrorMsg("");
    window.dispatchEvent(new CustomEvent("folder-sync-bind", { detail: { isBinding: true } }));

    invoke<boolean>("send_bind_request", { targetCode: inputCode })
      .then((accepted) => {
        if (accepted) {
          setState("success");
          window.dispatchEvent(new CustomEvent("folder-sync-bind", { detail: { isBinding: false, success: true } }));
        } else {
          setState("idle");
          setErrorMsg("User declined your request.");
          window.dispatchEvent(new CustomEvent("folder-sync-bind", { detail: { isBinding: false, success: false } }));
        }
      })
      .catch((err) => {
        console.error("Bind request failed:", err);
        setState("idle");
        setErrorMsg(err);
        window.dispatchEvent(new CustomEvent("folder-sync-bind", { detail: { isBinding: false, success: false } }));
      });
  };

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setState("idle");
      setInputCode("");
      setErrorMsg("");
    }, 300);
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} initialFocusRef={inputRef}>
      <div className="flex flex-col items-center text-center space-y-5">
        
        {state === "idle" && (
          <>
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Link2 className="w-6 h-6 text-primary" />
            </div>

            <div>
              <h2 className="text-xl font-semibold tracking-tight mb-1">
                Step 1: Bind Device
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed max-w-sm">
                To set up folder sync, pair with the device you want to sync with by pasting their 4-digit connect code here.
              </p>
            </div>

            <div className="w-full max-w-xs space-y-3 pt-1">
              <Input
                ref={inputRef}
                value={inputCode}
                onChange={handleInputChange}
                placeholder="Paste Connect Code"
                className={`text-center text-2xl font-mono tracking-[0.2em] uppercase h-14 ${errorMsg ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                maxLength={4}
                onKeyDown={(e) => { if (e.key === 'Enter' && inputCode.length === 4) handleConnect(); }}
              />
              {errorMsg && (
                <p className="text-sm text-destructive font-medium">{errorMsg}</p>
              )}
              <Button
                className="w-full font-semibold"
                size="lg"
                disabled={inputCode.length !== 4}
                onClick={handleConnect}
              >
                Send BIND Request
              </Button>
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
              <h3 className="text-lg font-semibold mb-1">Sending BIND Request…</h3>
              <p className="text-muted-foreground text-sm">
                Waiting for device <span className="font-mono font-semibold text-primary">{inputCode}</span> to accept
              </p>
            </div>
          </div>
        )}

        {state === "success" && (
          <div className="py-10 flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-success/15 text-success flex items-center justify-center animate-[scale-check_0.4s_cubic-bezier(0.175,0.885,0.32,1.275)_forwards]">
              <HardDrive className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-1">Device Bound!</h3>
              <p className="text-muted-foreground text-sm">You're now ready to configure folder sync with {inputCode}.</p>
            </div>
            <Button onClick={handleClose} className="mt-4 px-8 font-semibold">
              Continue
            </Button>
          </div>
        )}

      </div>
    </Modal>
  );
}
