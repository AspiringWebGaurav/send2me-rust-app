import { useState, useEffect } from "react";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { ShieldCheck, Monitor } from "lucide-react";

interface BindTermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRespond: (accept: boolean) => void;
  remoteDeviceName: string;
  remoteOs: string;
  localDeviceName: string;
  localOs: string;
  isSender: boolean;
}

export function BindTermsModal({
  isOpen,
  onClose,
  onRespond,
  remoteDeviceName,
  remoteOs,
  localDeviceName,
  localOs,
  isSender,
}: BindTermsModalProps) {
  const [agreed, setAgreed] = useState(false);
  const [isFetching, setIsFetching] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setIsFetching(true);
      const timer = setTimeout(() => setIsFetching(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleRespond = (accept: boolean) => {
    onRespond(accept);
    onClose();
    setTimeout(() => setAgreed(false), 300);
  };

  const title = isSender ? "Finalize Connection" : "Connection Request";
  const desc = isSender
    ? `Almost there! To complete the connection with ${remoteDeviceName}, please agree to the secure connection terms.`
    : `${remoteDeviceName} wants to establish a secure folder sync connection with your device.`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} showCloseButton={false}>
      {isFetching ? (
        <div className="flex flex-col items-center justify-center py-16 space-y-5">
          <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          <p className="text-muted-foreground animate-pulse text-sm font-medium tracking-wide">Fetching secure connection terms...</p>
        </div>
      ) : (
      <div className="flex flex-col space-y-6">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{desc}</p>
        </div>

        {/* Dynamic Connection Animation */}
        <div className="w-full h-32 rounded-xl bg-secondary/20 border border-border flex items-center justify-center overflow-hidden relative">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary via-transparent to-transparent pointer-events-none animate-pulse" />
          
          <div className="flex items-center justify-center gap-6 md:gap-12 w-full px-6 relative z-10">
            {/* Local Device */}
            <div className="flex flex-col items-center min-w-0 flex-1">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2 shadow-[0_0_15px_hsl(var(--primary)/0.2)]">
                {localOs?.toLowerCase()?.includes('mac') ? <Monitor className="w-6 h-6 text-primary" /> : <Monitor className="w-6 h-6 text-primary" />}
              </div>
              <span className="text-xs font-semibold truncate w-full text-center">{localDeviceName}</span>
              <span className="text-[10px] text-muted-foreground uppercase">{localOs}</span>
            </div>

            {/* Animated Connection Link */}
            <div className="flex-1 flex items-center justify-center relative">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-full h-0.5 bg-border rounded-full" />
              </div>
              <div className="absolute flex items-center justify-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-[bounce_1.5s_infinite]" />
                <div className="w-2 h-2 rounded-full bg-primary animate-[bounce_1.5s_infinite_0.2s]" />
                <div className="w-2 h-2 rounded-full bg-primary animate-[bounce_1.5s_infinite_0.4s]" />
              </div>
            </div>

            {/* Remote Device */}
            <div className="flex flex-col items-center min-w-0 flex-1">
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-2 shadow-[0_0_15px_hsl(var(--secondary-foreground)/0.1)]">
                <Monitor className="w-6 h-6 text-foreground/80" />
              </div>
              <span className="text-xs font-semibold truncate w-full text-center">{remoteDeviceName}</span>
              <span className="text-[10px] text-muted-foreground uppercase">{remoteOs}</span>
            </div>
          </div>
        </div>

        {/* Terms of Service Box */}
        <div className="bg-secondary/30 rounded-xl border p-4 max-h-40 overflow-y-auto text-xs text-muted-foreground leading-relaxed space-y-3">
          <p className="font-semibold text-foreground">Secure Peer-to-Peer Connection Terms</p>
          <p>
            By accepting this device bind, you agree to establish a secure, encrypted peer-to-peer connection for folder synchronization between your device and <strong>{remoteDeviceName}</strong>.
          </p>
          <ul className="list-disc pl-4 space-y-1">
            <li>Your connection is end-to-end encrypted.</li>
            <li>Files will sync directly between devices to maintain a STRICT 1-TO-1 MIRROR.</li>
            <li className="text-danger font-medium">Deletions are PERMANENT across all devices. No recycle bin or .sync_trash.</li>
            <li>You can revoke this access at any time from your bonded devices list.</li>
          </ul>
        </div>

        {/* Checkbox */}
        <label className="flex items-start space-x-3 cursor-pointer group">
          <div className="relative flex items-center pt-0.5">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <div className="w-5 h-5 border-2 rounded border-muted-foreground/30 peer-checked:border-primary peer-checked:bg-primary transition-colors flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <span className="text-sm text-foreground/90 font-medium select-none group-hover:text-foreground transition-colors">
            I have read and agree to the secure connection terms.
          </span>
        </label>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => handleRespond(false)}
          >
            Decline
          </Button>
          <Button
            className="flex-1"
            disabled={!agreed}
            onClick={() => handleRespond(true)}
          >
            Agree & Bind
          </Button>
        </div>

      </div>
      )}
    </Modal>
  );
}
