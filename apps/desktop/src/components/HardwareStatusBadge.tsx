import { useState, useRef, useEffect } from "react";
import { Cpu } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../lib/utils";
import { useLagStore, type LagSeverity } from "../stores/useLagStore";

const SEVERITY_COLOR: Record<LagSeverity, string> = {
  nominal: "text-muted-foreground",
  warning: "text-warning",
  critical: "text-danger",
};

const SEVERITY_DOT: Record<LagSeverity, string> = {
  nominal: "bg-success",
  warning: "bg-warning",
  critical: "bg-danger",
};

export function HardwareStatusBadge() {
  const current = useLagStore((s) => s.current);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close popover on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const sev: LagSeverity = current?.severity ?? "nominal";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="System hardware status"
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1.5 h-8 px-2 rounded-lg text-[11px] font-medium tabular-nums",
          "transition-colors duration-150 hover:bg-secondary/60 select-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          SEVERITY_COLOR[sev]
        )}
      >
        <Cpu className="w-3.5 h-3.5" />
        {current ? (
          <span>{current.cpuPercent.toFixed(0)}%</span>
        ) : (
          <span className="opacity-50">—</span>
        )}
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            SEVERITY_DOT[sev],
            sev !== "nominal" && "animate-[soft-pulse_2s_ease-in-out_infinite]"
          )}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-full mt-2 z-50 w-72 glass-panel rounded-xl shadow-[var(--shadow-e3)] p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">System Load</span>
              <span
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full",
                  sev === "nominal" && "bg-success/15 text-success",
                  sev === "warning" && "bg-warning/15 text-warning",
                  sev === "critical" && "bg-danger/15 text-danger"
                )}
              >
                {sev}
              </span>
            </div>

            {current ? (
              <>
                <div className="space-y-2.5">
                  <Meter label="CPU" value={current.cpuPercent} sev={sev} />
                  <Meter label="RAM" value={current.memoryPercent} sev={sev} />
                </div>

                {sev !== "nominal" && current.hint && (
                  <p className="text-xs text-muted-foreground leading-relaxed border-t border-border/50 pt-3">
                    {current.hint}
                  </p>
                )}

                {current.sustainedMs > 5000 && sev !== "nominal" && (
                  <p className="text-[11px] text-muted-foreground">
                    Sustained for{" "}
                    <span className="font-semibold tabular-nums">
                      {Math.round(current.sustainedMs / 1000)}s
                    </span>
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Collecting data…</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Meter({
  label,
  value,
  sev,
}: {
  label: string;
  value: number;
  sev: LagSeverity;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px]">
        <span className="text-muted-foreground font-medium">{label}</span>
        <span className="font-mono font-semibold tabular-nums">{value.toFixed(1)}%</span>
      </div>
      <div className="h-1 rounded-full bg-secondary/70 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-700 ease-out",
            sev === "nominal" && "bg-success",
            sev === "warning" && "bg-warning",
            sev === "critical" && "bg-danger"
          )}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
}
