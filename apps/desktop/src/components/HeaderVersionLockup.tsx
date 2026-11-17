import React, { useState, useEffect, useRef } from 'react';
import { useUpdateStore } from '../stores/useUpdateStore';

export const HeaderVersionLockup: React.FC = () => {
  const currentVersion = useUpdateStore((state) => state.currentVersion);
  const status = useUpdateStore((state) => state.status);
  const progress = useUpdateStore((state) => state.progress);
  const targetVersion = useUpdateStore((state) => state.targetVersion);
  const isChecking = useUpdateStore((state) => state.isChecking);
  const isUpdating = useUpdateStore((state) => state.isUpdating);
  const checkForUpdates = useUpdateStore((state) => state.checkForUpdates);

  const wasManualClickRef = useRef(false);
  const [showResultStage, setShowResultStage] = useState(false);
  const resultTimerRef = useRef<number | null>(null);

  const handleButtonClick = () => {
    wasManualClickRef.current = true;
    checkForUpdates(true);
  };

  const prevCheckingRef = useRef(isChecking);
  useEffect(() => {
    if (prevCheckingRef.current && !isChecking && !isUpdating && status !== 'available') {
      if (wasManualClickRef.current) {
        setShowResultStage(true);
        if (resultTimerRef.current !== null) {
          window.clearTimeout(resultTimerRef.current);
        }
        resultTimerRef.current = window.setTimeout(() => {
          setShowResultStage(false);
          wasManualClickRef.current = false;
          resultTimerRef.current = null;
        }, 1800);
      }
    }
    prevCheckingRef.current = isChecking;
  }, [isChecking, isUpdating, status]);

  const isVerifying = status === 'verifying';
  const isInstalling = status === 'ready' || status === 'restarting';
  const pct = Math.min(100, Math.max(8, Math.round(progress || 0)));

  const otaStageText = (() => {
    if (isChecking) {
      return 'CHECKING';
    }
    if (showResultStage) {
      return 'UP TO DATE';
    }
    return '';
  })();

  const otaStageTone = (() => {
    if (isChecking) {
      return 'text-zinc-600 dark:text-zinc-300 font-semibold animate-pulse';
    }
    return 'text-zinc-700 dark:text-zinc-200 font-semibold';
  })();

  const stagePhaseKey = otaStageText ? (isChecking ? 'checking' : 'up_to_date') : '';

  const [displayedStage, setDisplayedStage] = useState(otaStageText);
  const [displayedTone, setDisplayedTone] = useState(otaStageTone);
  const [displayedPhaseKey, setDisplayedPhaseKey] = useState(stagePhaseKey);
  const [stageVisible, setStageVisible] = useState(Boolean(otaStageText));
  const hideTimerRef = useRef<number | null>(null);

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

  const rowWashClass = !otaStageText
    ? 'opacity-0'
    : isChecking
    ? 'opacity-100 bg-zinc-200/40 dark:bg-zinc-800/40'
    : 'opacity-100 bg-zinc-100/60 dark:bg-zinc-800/60';

  const showShimmer = isChecking && stageVisible;

  return (
    <div className="flex items-center" data-testid="header-version-lockup">
      {isUpdating || status === 'available' ? (
        <div
          title={`Automated background update to v${targetVersion?.replace(/^v/, '') || ''} • ${Math.round(progress || 0)}%`}
          className="group relative overflow-hidden inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-zinc-600 dark:text-zinc-300 text-[11px] font-mono font-medium leading-none select-none transition-colors duration-200"
        >
          {/* Hairline Bottom Progress Bar (Neutral Zinc Track & Fill, Zero Green) */}
          <div
            aria-hidden="true"
            className="absolute inset-x-1 bottom-0 h-[1.5px] pointer-events-none overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
          >
            <div
              className="h-full bg-zinc-600 dark:bg-zinc-300 transition-[width] duration-300 ease-out"
              style={{ width: `${isInstalling || isVerifying ? 100 : pct}%` }}
            />
          </div>

          {/* Symmetrically Aligned Single-Line Lockup */}
          <span className="relative z-10 inline-flex items-center leading-none whitespace-nowrap">
            <span className="font-semibold text-zinc-700 dark:text-zinc-200 tracking-wide uppercase">
              {status === 'restarting'
                ? 'RESTARTING'
                : status === 'verifying'
                ? `VERIFYING V${targetVersion?.replace(/^v/i, '') || ''}`
                : isInstalling
                ? `INSTALLING V${targetVersion?.replace(/^v/i, '') || ''}`
                : targetVersion
                ? `UPDATING TO V${targetVersion.replace(/^v/i, '')}${progress > 0 ? ` ${Math.round(progress)}%` : ''}`
                : 'UPDATING'}
            </span>
          </span>
        </div>
      ) : (
        <button
          data-testid="header-version-btn"
          type="button"
          onClick={handleButtonClick}
          disabled={isChecking}
          title={
            isChecking
              ? 'Checking GPHost Cloudflare R2 for latest release...'
              : 'GPHost release verified • Click to re-check'
          }
          className="group relative overflow-hidden inline-flex items-center px-2 py-1 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-secondary/70 transition-colors duration-200 cursor-pointer select-none font-mono text-[11px] font-medium leading-none"
        >
          {/* Ambient Dynamic Background Wash */}
          <div
            aria-hidden="true"
            className={`absolute inset-0 pointer-events-none rounded-md transition-opacity duration-500 ease-out ${rowWashClass}`}
          />

          {/* Shimmer Sweep Effect (Active during checking) */}
          {showShimmer && (
            <div
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none overflow-hidden rounded-md"
            >
              <div className="h-full w-2/3 animate-shimmer-sweep bg-gradient-to-r from-transparent via-zinc-900/[0.08] dark:via-zinc-100/[0.08] to-transparent" />
            </div>
          )}

          {/* Symmetrically Aligned Single-Line Lockup */}
          <span className="relative z-10 inline-flex items-center leading-none whitespace-nowrap gap-1.5">
            <span className="tracking-wide uppercase">
              V{currentVersion?.replace(/^v/i, '')}
            </span>

            {/* Dynamic Stage Text (ScheduleMe in-place slide, fade, and expand on exact same line) */}
            {displayedStage ? (
              <span
                data-testid="header-version-stage"
                className={`inline-flex items-center leading-none overflow-hidden whitespace-nowrap text-[11px] tracking-wide transition-[opacity,max-width,color] duration-500 ease-out ${displayedTone} ${
                  stageVisible
                    ? 'opacity-100 max-w-[120px]'
                    : 'opacity-0 max-w-0'
                }`}
              >
                <span key={displayedPhaseKey} className="inline-block font-semibold">
                  {displayedStage}
                </span>
              </span>
            ) : null}
          </span>
        </button>
      )}
    </div>
  );
};
