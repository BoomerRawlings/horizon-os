import { useEffect, useMemo, useState } from "react";

export const FOCUS_PRESETS = [
  { id: "classic", label: "25 / 5", focusMinutes: 25, breakMinutes: 5 },
  { id: "long", label: "45 / 15", focusMinutes: 45, breakMinutes: 15 },
] as const;

export type FocusTimerMode = "focus" | "break";
export type FocusPresetId = (typeof FOCUS_PRESETS)[number]["id"] | "custom";
export type FocusPhaseTransition = {
  from: FocusTimerMode;
  to: FocusTimerMode;
};

type FocusTimerOptions = {
  autoStartBreaks?: boolean;
  autoStartNextFocus?: boolean;
  onManualStart?: () => void;
  onPhaseTransition?: (transition: FocusPhaseTransition) => void;
};

export function minutesToSeconds(minutes: number) {
  return minutes * 60;
}

export function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function clampMinutes(value: number) {
  if (!Number.isFinite(value)) {
    return 25;
  }
  return Math.min(180, Math.max(1, Math.round(value)));
}

export function useFocusTimer({
  autoStartBreaks = true,
  autoStartNextFocus = false,
  onManualStart,
  onPhaseTransition,
}: FocusTimerOptions = {}) {
  const [presetId, setPresetId] = useState<FocusPresetId>("classic");
  const [customPreset, setCustomPreset] = useState({ focusMinutes: 25, breakMinutes: 5 });
  const [mode, setMode] = useState<FocusTimerMode>("focus");
  const [remainingSeconds, setRemainingSeconds] = useState(() => minutesToSeconds(25));
  const [isRunning, setIsRunning] = useState(false);

  const currentPreset = useMemo(() => {
    if (presetId === "custom") {
      return {
        id: "custom",
        label: `${customPreset.focusMinutes} / ${customPreset.breakMinutes}`,
        ...customPreset,
      };
    }
    return FOCUS_PRESETS.find((preset) => preset.id === presetId) ?? FOCUS_PRESETS[0];
  }, [customPreset, presetId]);

  const activeDurationSeconds = minutesToSeconds(
    mode === "focus" ? currentPreset.focusMinutes : currentPreset.breakMinutes,
  );
  const progress = activeDurationSeconds > 0 ? 1 - remainingSeconds / activeDurationSeconds : 0;
  const progressDegrees = Math.min(360, Math.max(0, progress * 360));

  useEffect(() => {
    if (!isRunning) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setRemainingSeconds((seconds) => {
        if (seconds > 1) {
          return seconds - 1;
        }

        const nextMode = mode === "focus" ? "break" : "focus";
        setMode(nextMode);
        setIsRunning(nextMode === "break" ? autoStartBreaks : autoStartNextFocus);
        onPhaseTransition?.({ from: mode, to: nextMode });
        return minutesToSeconds(nextMode === "focus" ? currentPreset.focusMinutes : currentPreset.breakMinutes);
      });
    }, 1_000);

    return () => window.clearInterval(interval);
  }, [autoStartBreaks, autoStartNextFocus, currentPreset.breakMinutes, currentPreset.focusMinutes, isRunning, mode, onPhaseTransition]);

  function selectPreset(nextPreset: (typeof FOCUS_PRESETS)[number]) {
    setPresetId(nextPreset.id);
    setMode("focus");
    setRemainingSeconds(minutesToSeconds(nextPreset.focusMinutes));
    setIsRunning(false);
  }

  function resetTimer() {
    setIsRunning(false);
    setMode("focus");
    setRemainingSeconds(minutesToSeconds(currentPreset.focusMinutes));
  }

  function startTimer() {
    if (!isRunning) {
      onManualStart?.();
    }

    setIsRunning(true);
  }

  function pauseTimer() {
    setIsRunning(false);
  }

  function toggleTimer() {
    if (isRunning) {
      pauseTimer();
      return;
    }

    startTimer();
  }

  function applyCustomTimer(focusMinutes: number, breakMinutes: number) {
    const nextPreset = {
      focusMinutes: clampMinutes(focusMinutes),
      breakMinutes: clampMinutes(breakMinutes),
    };

    setCustomPreset(nextPreset);
    setPresetId("custom");
    setMode("focus");
    setRemainingSeconds(minutesToSeconds(nextPreset.focusMinutes));
    setIsRunning(false);
  }

  return {
    activeDurationSeconds,
    applyCustomTimer,
    currentPreset,
    isRunning,
    mode,
    presetId,
    progress,
    progressDegrees,
    remainingSeconds,
    resetTimer,
    selectPreset,
    pauseTimer,
    setIsRunning,
    startTimer,
    toggleTimer,
  };
}

export type FocusTimerController = ReturnType<typeof useFocusTimer>;
