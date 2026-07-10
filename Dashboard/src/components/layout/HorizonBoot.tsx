import { useEffect, useRef, useState, type CSSProperties } from "react";
import { HorizonMark } from "../ui/HorizonMark";

export const HORIZON_BOOT_DURATION_MS = 5_200;
export const HORIZON_BOOT_REDUCED_DURATION_MS = 820;

type HorizonBootProps = {
  onComplete?: () => void;
  onStarted?: () => void;
  reducedMotion?: boolean;
  statusPhrase?: string;
};

type HorizonWindow = Window & {
  __horizonWindowVisible?: boolean;
};

export function HorizonBoot({ onComplete, onStarted, reducedMotion = false, statusPhrase = "Signal locked" }: HorizonBootProps) {
  const [started, setStarted] = useState(false);
  const onCompleteRef = useRef(onComplete);
  const onStartedRef = useRef(onStarted);
  const durationMs = reducedMotion ? HORIZON_BOOT_REDUCED_DURATION_MS : HORIZON_BOOT_DURATION_MS;

  onCompleteRef.current = onComplete;
  onStartedRef.current = onStarted;

  useEffect(() => {
    let frameA = 0;
    let frameB = 0;
    let fallbackTimer = 0;
    let completionTimer = 0;
    let cancelled = false;
    let startQueued = false;

    function commitStart() {
      if (cancelled) return;
      setStarted(true);
      onStartedRef.current?.();
      completionTimer = window.setTimeout(() => onCompleteRef.current?.(), durationMs);
    }

    function primeAndStart() {
      if (startQueued) return;
      startQueued = true;
      if (fallbackTimer) {
        window.clearTimeout(fallbackTimer);
      }

      const scheduleFrames = () => {
        if (cancelled) return;
        // Two clean frames let the compositor promote the boot layers before every
        // visual and audio cue starts from the same clock edge.
        frameA = window.requestAnimationFrame(() => {
          frameB = window.requestAnimationFrame(commitStart);
        });
      };

      if (document.fonts?.ready) {
        void document.fonts.ready.then(scheduleFrames, scheduleFrames);
      } else {
        scheduleFrames();
      }
    }

    const horizonWindow = window as HorizonWindow;
    const isElectron = window.navigator.userAgent.toLowerCase().includes("electron");

    if (!isElectron || horizonWindow.__horizonWindowVisible) {
      primeAndStart();
    } else {
      window.addEventListener("horizon-window-visible", primeAndStart, { once: true });
      // The native shell sets __horizonWindowVisible when ready-to-show fires. Keep a
      // generous fallback for unusual Windows resume/cold-cache cases without starting
      // the sequence behind a still-hidden window.
      fallbackTimer = window.setTimeout(primeAndStart, 8_000);
    }

    return () => {
      cancelled = true;
      window.removeEventListener("horizon-window-visible", primeAndStart);
      if (fallbackTimer) {
        window.clearTimeout(fallbackTimer);
      }
      if (completionTimer) {
        window.clearTimeout(completionTimer);
      }
      window.cancelAnimationFrame(frameA);
      window.cancelAnimationFrame(frameB);
    };
  }, [durationMs]);

  const timingStyle = {
    "--horizon-boot-duration": `${durationMs}ms`,
  } as CSSProperties;

  return (
    <div
      aria-hidden="true"
      className={`horizon-boot-sequence ${started ? "horizon-boot-started" : ""} ${reducedMotion ? "horizon-boot-reduced" : ""}`}
      style={timingStyle}
    >
      <div className="horizon-boot-surface">
        <div className="horizon-boot-ambient">
          <span className="horizon-boot-orbit horizon-boot-orbit-wide" />
          <span className="horizon-boot-orbit horizon-boot-orbit-tight" />
        </div>
        <div className="horizon-boot-core">
          <div className="horizon-boot-logo-mark">
            <span className="horizon-boot-logo-field" />
            <span className="horizon-boot-star-seed" />
            <HorizonMark className="horizon-boot-trace" />
            <HorizonMark className="horizon-boot-logo-final" />
          </div>
        </div>
        <div className="horizon-boot-brand">
          <h1 className="horizon-boot-wordmark">HorizonOS</h1>
          <p className="horizon-boot-status">
            <span className="horizon-boot-status-dot" />
            {statusPhrase}
          </p>
        </div>
      </div>
    </div>
  );
}
