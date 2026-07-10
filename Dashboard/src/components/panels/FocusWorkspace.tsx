import { useEffect, useRef, useState } from "react";
import { MoonStar, PanelLeftClose, PanelLeftOpen, Pause, Play, RotateCcw, Settings2, Sparkles, Target } from "lucide-react";
import { getFocusPhaseTheme } from "../../data/focusTheme";
import { FOCUS_PRESETS, formatTime, type FocusTimerController } from "../../hooks/useFocusTimer";

type FocusWorkspaceProps = {
  focusTimer: FocusTimerController;
  navigationCollapsed: boolean;
  onToggleNavigation: () => void;
};

const stellarPoints = [
  { delay: "-2s", left: "7%", opacity: 0.46, size: 2, top: "14%" },
  { delay: "-7s", left: "14%", opacity: 0.3, size: 1, top: "68%" },
  { delay: "-4s", left: "21%", opacity: 0.58, size: 2, top: "32%" },
  { delay: "-9s", left: "27%", opacity: 0.26, size: 1, top: "81%" },
  { delay: "-3s", left: "34%", opacity: 0.36, size: 1, top: "11%" },
  { delay: "-11s", left: "39%", opacity: 0.5, size: 2, top: "62%" },
  { delay: "-5s", left: "47%", opacity: 0.28, size: 1, top: "24%" },
  { delay: "-13s", left: "53%", opacity: 0.54, size: 2, top: "86%" },
  { delay: "-6s", left: "59%", opacity: 0.32, size: 1, top: "8%" },
  { delay: "-10s", left: "66%", opacity: 0.44, size: 2, top: "72%" },
  { delay: "-1s", left: "72%", opacity: 0.26, size: 1, top: "29%" },
  { delay: "-8s", left: "78%", opacity: 0.56, size: 2, top: "88%" },
  { delay: "-12s", left: "84%", opacity: 0.34, size: 1, top: "17%" },
  { delay: "-4s", left: "91%", opacity: 0.5, size: 2, top: "56%" },
  { delay: "-9s", left: "11%", opacity: 0.32, size: 1, top: "43%" },
  { delay: "-14s", left: "88%", opacity: 0.3, size: 1, top: "39%" },
] as const;

export function FocusWorkspace({ focusTimer, navigationCollapsed, onToggleNavigation }: FocusWorkspaceProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsFocusMinutes, setSettingsFocusMinutes] = useState(25);
  const [settingsBreakMinutes, setSettingsBreakMinutes] = useState(5);
  const settingsPopoverRef = useRef<HTMLDivElement | null>(null);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const phaseTheme = getFocusPhaseTheme(focusTimer.mode);
  const timerState = focusTimer.isRunning ? "running" : focusTimer.progress > 0 ? "paused" : "ready";
  const phaseLabel = focusTimer.mode === "focus" ? "Deep Work" : "Break";
  const PhaseIcon = focusTimer.mode === "focus" ? Target : MoonStar;
  const statusLabel = focusTimer.isRunning
    ? focusTimer.mode === "focus"
      ? "Session in orbit"
      : "Recovery in orbit"
    : timerState === "paused"
      ? "Paused — your place is held"
      : focusTimer.mode === "focus"
        ? "Ready when you are"
        : "Break ready";
  const guidance = focusTimer.isRunning
    ? focusTimer.mode === "focus"
      ? "Stay with one useful finish."
      : "Let the orbit loosen. Breathe, move, reset."
    : timerState === "paused"
      ? "Resume when your attention is back here."
      : "Choose one outcome, then begin.";

  function toggleSettings() {
    if (settingsOpen) {
      setSettingsOpen(false);
      return;
    }

    setSettingsFocusMinutes(focusTimer.currentPreset.focusMinutes);
    setSettingsBreakMinutes(focusTimer.currentPreset.breakMinutes);
    setSettingsOpen(true);
  }

  function applyCustomTimer() {
    focusTimer.applyCustomTimer(settingsFocusMinutes, settingsBreakMinutes);
    setSettingsOpen(false);
  }

  useEffect(() => {
    if (!settingsOpen) return undefined;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (settingsPopoverRef.current?.contains(target) || settingsButtonRef.current?.contains(target)) return;
      setSettingsOpen(false);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [settingsOpen]);

  return (
    <section
      aria-label="Focus workspace"
      className="focus-immersive-panel"
      data-phase={focusTimer.mode}
      data-timer-state={timerState}
    >
      <div aria-hidden="true" className="focus-immersive-sky">
        <div className="focus-stellar-haze" />
        <div className="focus-star-field">
          {stellarPoints.map((star) => (
            <span
              key={`${star.left}-${star.top}`}
              style={{
                animationDelay: star.delay,
                height: star.size,
                left: star.left,
                opacity: star.opacity,
                top: star.top,
                width: star.size,
              }}
            />
          ))}
        </div>
        <div className="focus-stellar-orbit focus-stellar-orbit-outer">
          <span className="focus-orbit-moon" />
        </div>
        <div className="focus-stellar-orbit focus-stellar-orbit-middle">
          <span className="focus-orbit-moon" />
        </div>
        <div className="focus-stellar-orbit focus-stellar-orbit-inner">
          <span className="focus-orbit-moon" />
        </div>
      </div>

      <header className="focus-immersive-header">
        <button
          aria-label={navigationCollapsed ? "Show navigation" : "Hide navigation"}
          className="focus-deep-space-toggle"
          onClick={onToggleNavigation}
          title={navigationCollapsed ? "Show navigation" : "Hide navigation"}
          type="button"
        >
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
            <Sparkles className="h-4 w-4 text-[rgb(var(--focus-phase-rgb))]" />
            Deep space
          </div>
          <p className="mt-1.5 text-sm text-slate-500">Everything else can wait.</p>
          {navigationCollapsed ? <PanelLeftOpen className="focus-deep-space-toggle-icon" /> : <PanelLeftClose className="focus-deep-space-toggle-icon" />}
        </button>
        <div className="focus-immersive-header-actions">
          <div className="focus-immersive-status">
            <PhaseIcon className="h-4 w-4" />
            <span>{statusLabel}</span>
          </div>
        </div>
      </header>

      <div className="focus-immersive-center">
        <div className="focus-immersive-dial">
          <div
            aria-hidden="true"
            className="focus-immersive-progress"
            style={{
              background: `conic-gradient(${phaseTheme.progressColor} ${focusTimer.progressDegrees}deg, rgba(51, 65, 85, 0.32) 0deg)`,
              boxShadow: `0 0 54px ${phaseTheme.shadow}`,
            }}
          >
            <div className="focus-immersive-progress-inner" />
          </div>

          <div
            aria-label={`${phaseLabel} timer, ${formatTime(focusTimer.remainingSeconds)} remaining, ${statusLabel}`}
            className="focus-immersive-time-wrap"
            role="timer"
          >
            <div className="focus-immersive-time">{formatTime(focusTimer.remainingSeconds)}</div>
            <div className="focus-immersive-phase">{phaseLabel}</div>
            <div className="focus-immersive-guidance">{guidance}</div>
          </div>

          <div className="focus-immersive-controls">
            <button
              aria-label={focusTimer.isRunning ? "Pause timer" : "Start timer"}
              className="focus-immersive-primary-control"
              onClick={focusTimer.toggleTimer}
              type="button"
            >
              {focusTimer.isRunning ? <Pause className="h-7 w-7 fill-current" /> : <Play className="ml-1 h-7 w-7 fill-current" />}
            </button>
            <button
              aria-label="Reset timer"
              className="focus-immersive-reset-control"
              onClick={focusTimer.resetTimer}
              type="button"
            >
              <RotateCcw className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      <footer className="focus-immersive-footer">
        <div className="focus-immersive-tools">
          <div className="focus-immersive-settings-wrap">
            <button
              aria-expanded={settingsOpen}
              aria-label="Custom timer settings"
              className={`focus-timer-settings-button ${settingsOpen ? "focus-timer-settings-button-active" : ""}`}
              onClick={toggleSettings}
              ref={settingsButtonRef}
              type="button"
            >
              <Settings2 className="h-4 w-4" />
              Custom
            </button>
            {settingsOpen ? (
              <div className="focus-immersive-settings" ref={settingsPopoverRef}>
                <div className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-slate-300">Custom timer</div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1 text-xs text-slate-400">
                    Focus
                    <input
                      max={180}
                      min={1}
                      onChange={(event) => setSettingsFocusMinutes(Number(event.target.value))}
                      type="number"
                      value={settingsFocusMinutes}
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-400">
                    Break
                    <input
                      max={180}
                      min={1}
                      onChange={(event) => setSettingsBreakMinutes(Number(event.target.value))}
                      type="number"
                      value={settingsBreakMinutes}
                    />
                  </label>
                </div>
                <button className="focus-immersive-settings-apply" onClick={applyCustomTimer} type="button">
                  Apply timer
                </button>
              </div>
            ) : null}
          </div>
          <div className="focus-immersive-presets" aria-label="Focus timer presets">
            {FOCUS_PRESETS.map((preset) => (
              <button
                aria-pressed={focusTimer.presetId === preset.id}
                className={focusTimer.presetId === preset.id ? "focus-preset-active" : ""}
                key={preset.id}
                onClick={() => focusTimer.selectPreset(preset)}
                type="button"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        <div className="text-xs text-slate-600">The timer keeps running if you leave this screen.</div>
      </footer>
    </section>
  );
}
