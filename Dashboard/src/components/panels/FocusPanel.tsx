import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Settings2, Zap } from "lucide-react";
import { Panel } from "../ui/Panel";
import { FOCUS_PRESETS, formatTime, type FocusTimerController } from "../../hooks/useFocusTimer";
import { getFocusPhaseTheme } from "../../data/focusTheme";

type FocusPanelProps = {
  focusTimer: FocusTimerController;
  onOpenFocusWorkspace: () => void;
};

export function FocusPanel({ focusTimer, onOpenFocusWorkspace }: FocusPanelProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsFocusMinutes, setSettingsFocusMinutes] = useState(25);
  const [settingsBreakMinutes, setSettingsBreakMinutes] = useState(5);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const settingsPopoverRef = useRef<HTMLDivElement | null>(null);
  const phaseTheme = getFocusPhaseTheme(focusTimer.mode);

  function toggleSettings() {
    if (settingsOpen) {
      closeOrApplyTimerSettings();
      return;
    }

    setSettingsFocusMinutes(focusTimer.currentPreset.focusMinutes);
    setSettingsBreakMinutes(focusTimer.currentPreset.breakMinutes);
    setSettingsOpen(true);
  }

  function timerSettingsChanged() {
    return (
      settingsFocusMinutes !== focusTimer.currentPreset.focusMinutes ||
      settingsBreakMinutes !== focusTimer.currentPreset.breakMinutes
    );
  }

  function closeOrApplyTimerSettings() {
    if (timerSettingsChanged()) {
      focusTimer.applyCustomTimer(settingsFocusMinutes, settingsBreakMinutes);
    }

    setSettingsOpen(false);
  }

  function applyCustomTimer() {
    closeOrApplyTimerSettings();
  }

  useEffect(() => {
    if (!settingsOpen) {
      return undefined;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (settingsPopoverRef.current?.contains(target) || settingsButtonRef.current?.contains(target)) {
        return;
      }

      closeOrApplyTimerSettings();
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [focusTimer.currentPreset.breakMinutes, focusTimer.currentPreset.focusMinutes, settingsBreakMinutes, settingsFocusMinutes, settingsOpen]);

  return (
    <Panel className="relative p-4">
      <header className="mb-4 flex items-center justify-between">
        <button
          aria-label="Open Focus workspace"
          className="flex items-center gap-3 rounded-lg text-left transition hover:text-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300"
          onClick={onOpenFocusWorkspace}
          title="Open Focus workspace"
          type="button"
        >
          <Zap className="h-5 w-5 text-slate-300" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white">Focus</h2>
        </button>
        <button
          aria-expanded={settingsOpen}
          aria-label="Timer settings"
          className={`rounded-full border-0 bg-transparent p-1.5 transition ${
            settingsOpen ? "bg-sky-400/10 text-sky-300" : "text-slate-500 hover:bg-white/5 hover:text-slate-200"
          }`}
          onClick={toggleSettings}
          ref={settingsButtonRef}
          type="button"
        >
          <Settings2 className="h-5 w-5" />
        </button>
      </header>

      {settingsOpen ? (
        <div
          className="absolute right-4 top-14 z-20 w-56 rounded-2xl border border-white/10 bg-[#0b1726]/95 p-3 shadow-panel backdrop-blur"
          ref={settingsPopoverRef}
        >
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Timer</div>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-xs text-slate-400">
              Focus
              <input
                className="h-9 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-sm text-white"
                min={1}
                max={180}
                onChange={(event) => setSettingsFocusMinutes(Number(event.target.value))}
                type="number"
                value={settingsFocusMinutes}
              />
            </label>
            <label className="grid gap-1 text-xs text-slate-400">
              Break
              <input
                className="h-9 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-sm text-white"
                min={1}
                max={180}
                onChange={(event) => setSettingsBreakMinutes(Number(event.target.value))}
                type="number"
                value={settingsBreakMinutes}
              />
            </label>
          </div>
          <button
            className="mt-3 h-9 w-full rounded-lg border border-sky-300/40 bg-sky-400/12 text-sm text-sky-100 transition hover:bg-sky-400/18"
            onClick={applyCustomTimer}
            type="button"
          >
            Apply
          </button>
        </div>
      ) : null}

      <div className="grid place-items-center pt-1">
        <div className="focus-timer-ring relative grid place-items-center rounded-full">
          <div
            aria-hidden="true"
            className="absolute inset-0 rounded-full p-[7px]"
            style={{
              background: `conic-gradient(${phaseTheme.progressColor} ${focusTimer.progressDegrees}deg, rgba(51, 65, 85, 0.72) 0deg)`,
              boxShadow: `0 0 30px ${phaseTheme.shadow}`,
            }}
          >
            <div className="h-full w-full rounded-full bg-[rgba(11,23,38,0.96)] shadow-[inset_0_0_34px_rgba(2,8,23,0.55)]" />
          </div>
          <div className="relative z-10 text-center">
            <div className="focus-timer-time font-normal leading-none text-slate-50 drop-shadow-[0_0_18px_rgba(226,242,255,0.2)]">
              {formatTime(focusTimer.remainingSeconds)}
            </div>
            <div
              className={`mt-2 text-lg font-medium ${phaseTheme.softLabelClass}`}
              style={{ textShadow: `0 0 14px ${phaseTheme.shadow}` }}
            >
              {focusTimer.mode === "focus" ? "Deep Work" : "Break"}
            </div>
            <div className="mt-2 text-xs uppercase tracking-[0.15em] text-slate-300">
              {focusTimer.currentPreset.label}
            </div>
          </div>
          <div className="absolute -bottom-3 flex items-center gap-2">
            <button
              aria-label={focusTimer.isRunning ? "Pause timer" : "Start timer"}
              className={`grid h-12 w-12 place-items-center rounded-full border transition ${phaseTheme.buttonClass}`}
              onClick={focusTimer.toggleTimer}
              type="button"
            >
              {focusTimer.isRunning ? (
                <Pause className="h-5 w-5 fill-white" />
              ) : (
                <Play className="ml-0.5 h-5 w-5 fill-white" />
              )}
            </button>
            <button
              aria-label="Reset timer"
              className="grid h-10 w-10 place-items-center rounded-full border border-sky-200/18 bg-[#132238] text-slate-100 shadow-[0_8px_20px_rgba(2,8,23,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] transition hover:border-sky-300/35 hover:bg-[#17304f] hover:text-sky-100"
              onClick={focusTimer.resetTimer}
              type="button"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-center gap-2">
        {FOCUS_PRESETS.map((preset) => {
          const active = focusTimer.presetId === preset.id;
          return (
            <button
              key={preset.id}
              className={`h-8 rounded-full border px-4 text-sm transition ${
                active
                  ? "border-sky-300/45 bg-sky-400/10 text-sky-100"
                  : "border-white/8 bg-white/[0.025] text-slate-400 hover:border-sky-300/25 hover:text-slate-100"
              }`}
              onClick={() => {
                focusTimer.selectPreset(preset);
                setSettingsOpen(false);
              }}
              type="button"
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </Panel>
  );
}
