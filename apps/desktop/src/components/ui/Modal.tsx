import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../../lib/utils";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  showCloseButton?: boolean;
  title?: string;
}

export function Modal({ isOpen, onClose, children, className, initialFocusRef, showCloseButton = true, title }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleEsc);
    document.body.style.overflow = "hidden";

    // Focus trap
    const focusable = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !dialogRef.current) return;
      const els = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(focusable))
        .filter(el => !(el as HTMLButtonElement).disabled);
      if (!els.length) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
      else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
    };
    window.addEventListener("keydown", trap);

    // Initial focus
    const target = initialFocusRef?.current ?? dialogRef.current?.querySelector<HTMLElement>(focusable);
    target?.focus();

    return () => {
      window.removeEventListener("keydown", handleEsc);
      window.removeEventListener("keydown", trap);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose, initialFocusRef]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 bg-background/75 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            key="dialog"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "relative z-50 w-full max-w-lg glass-card rounded-2xl p-8 shadow-[var(--shadow-e4)]",
              className
            )}
          >
            {showCloseButton && (
              <button
                onClick={onClose}
                aria-label="Close dialog"
                className="absolute right-5 top-5 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/70 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {title && <h3 className="text-lg font-bold mb-4">{title}</h3>}
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
