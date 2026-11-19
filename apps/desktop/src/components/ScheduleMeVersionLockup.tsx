import React, { useEffect, useRef, useState } from 'react';
import { useUpdateStore } from '../stores/useUpdateStore';

export const ScheduleMeVersionLockup: React.FC = () => {
  const currentVersion = useUpdateStore((state) => state.currentVersion);
  const status = useUpdateStore((state) => state.status);
  const progress = useUpdateStore((state) => state.progress);
  const isChecking = useUpdateStore((state) => state.isChecking);

  const cleanVersion = (currentVersion || '0.0.1').replace(/^v/i, '');
  const pct = Math.min(100, Math.max(1, Math.round(progress || 0)));

  // If remote version matches current (0.0.1 idle), keep completely zero-noise and blended.
  // Stage text appears dynamically only during checking, updating, queued, or failure states.
  const otaStageText = (() => {
    if (isChecking || status === 'checking') {
      return 'CHECKING';
    }
    switch (status) {
      case 'downloading':
        return `${pct}%`;
      case 'verifying':
        return 'VERIFYING';
      case 'ready':
      case 'restarting':
        return 'UPDATING';
      case 'waiting_timer':
        return 'QUEUED';
      case 'error':
        return 'FAILED';
      default:
        return '';
    }
  })();

  const otaStageTone = (() => {
    switch (status) {
      case 'checking':
        return 'text-muted-foreground font-semibold animate-pulse';
      case 'error':
        return 'text-rose-500 font-semibold';
      case 'waiting_timer':
        return 'text-amber-500 font-semibold animate-pulse';
      default:
        return 'text-emerald-500 font-semibold';
    }
  })();

  const stagePhaseKey = otaStageText ? (isChecking ? 'checking' : status) : '';

  const activeDlPct =
    status === 'downloading'
      ? pct
      : status === 'verifying' || status === 'ready' || status === 'restarting'
        ? 100
        : 0;

  const [displayedStage, setDisplayedStage] = useState(otaStageText);
  const [displayedTone, setDisplayedTone] = useState(otaStageTone);
  const [displayedPhaseKey, setDisplayedPhaseKey] = useState(stagePhaseKey);
  const [stageVisible, setStageVisible] = useState(Boolean(otaStageText));
  const [dlBarWidth, setDlBarWidth] = useState(activeDlPct);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (activeDlPct > 0) {
      setDlBarWidth(activeDlPct);
    }
  }, [activeDlPct]);

  useEffect(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    if (otaStageText) {
      setDisplayedStage(otaStageText);
      setDisplayedTone(otaStageTone);
      setDisplayedPhaseKey(stagePhaseKey);
      let raf2 = 0;
      const raf1 = window.requestAnimationFrame(() => {
        raf2 = window.requestAnimationFrame(() => {
          setStageVisible(true);
        });
      });
      return () => {
        window.cancelAnimationFrame(raf1);
        window.cancelAnimationFrame(raf2);
      };
    }

    setStageVisible(false);
    hideTimerRef.current = window.setTimeout(() => {
      setDisplayedStage('');
      setDisplayedPhaseKey('');
      hideTimerRef.current = null;
    }, 520);

    return () => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [otaStageText, otaStageTone, stagePhaseKey]);

  const showShimmer = (isChecking || status === 'checking') && stageVisible;
  const showDlBar =
    status === 'downloading' ||
    status === 'verifying' ||
    status === 'ready' ||
    status === 'restarting';

  return (
    <div
      data-testid="scheduleme-version-lockup"
      title={`Send2Me v${cleanVersion}`}
      className="relative overflow-hidden inline-flex items-center justify-center font-mono text-[10.5px] uppercase tracking-wider select-none text-muted-foreground/80 cursor-default px-2.5 py-1 min-w-[145px]"
    >
      {/* Subtle Shimmer Sweep during checking */}
      {showShimmer && (
        <div
          aria-hidden="true"
          className="absolute inset-x-1 inset-y-0.5 pointer-events-none overflow-hidden"
        >
          <div className="h-full w-2/3 animate-shimmer-sweep bg-gradient-to-r from-transparent via-primary/10 to-transparent" />
        </div>
      )}

      {/* Subtle Progress Bar during downloading */}
      <div
        aria-hidden="true"
        className={`absolute inset-x-2 bottom-0.5 h-[1.5px] pointer-events-none transition-opacity duration-500 ease-out ${
          showDlBar ? 'opacity-100' : 'opacity-0'
        } bg-border/70`}
      >
        <div
          className="h-full bg-emerald-500 transition-[width] duration-300 ease-out"
          style={{ width: `${dlBarWidth}%` }}
        />
      </div>

      <span className="relative z-10 whitespace-nowrap">
        APP VERSION v{cleanVersion}
      </span>

      {/* Dynamic Stage Text with smooth ScheduleMe transitions */}
      {displayedStage ? (
        <span
          data-testid="version-stage"
          className={`relative z-10 inline-block overflow-hidden whitespace-nowrap text-[9.5px] tracking-wider transition-[opacity,transform,max-width,margin-left,color] duration-500 ease-out ${displayedTone} ${
            stageVisible
              ? 'opacity-100 translate-y-0 max-w-[100px] ml-1.5'
              : 'opacity-0 translate-y-[2px] max-w-0 ml-0'
          }`}
        >
          <span key={displayedPhaseKey} className="inline-block animate-fade-in font-semibold">
            {displayedStage}
          </span>
        </span>
      ) : null}
    </div>
  );
};
