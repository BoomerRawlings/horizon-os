import { useEffect, useMemo, useState } from "react";
import { Moon, Target } from "lucide-react";
import type { FocusTimerController } from "../../hooks/useFocusTimer";
import { getFocusPhaseTheme } from "../../data/focusTheme";
import { getGreetingSlotIndex, pickGreetingSelection, pickStartupSubheading, renderGreeting } from "../../data/greetings";
import type { ProfileSettings } from "../../types";

type HeaderProps = {
  focusTimer: FocusTimerController;
  profile: ProfileSettings;
};

function formatClock(date: Date) {
  const parts = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "";
  const dayPeriod = parts.find((part) => part.type === "dayPeriod")?.value ?? "";

  return {
    time: `${hour}:${minute}`,
    period: dayPeriod,
    date: new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(date),
  };
}

export function Header({ focusTimer, profile }: HeaderProps) {
  const [now, setNow] = useState(() => new Date());
  const [greetingSelection, setGreetingSelection] = useState(() => pickGreetingSelection());
  const [startupSubheading] = useState(() => pickStartupSubheading());
  const clock = useMemo(() => formatClock(now), [now]);
  const displayName = profile.displayName || profile.firstName || "Explorer";
  const greeting = renderGreeting(greetingSelection, displayName);
  const headlineSizeClass = greeting.length > 78 ? "text-[26px]" : greeting.length > 52 ? "text-[28px]" : "text-[34px]";
  const focusLabel = focusTimer.mode === "focus" ? "Deep Work" : "Break";
  const focusStatus = focusTimer.isRunning ? "In session" : focusTimer.progress > 0 ? "Paused" : "Ready";
  const phaseTheme = getFocusPhaseTheme(focusTimer.mode);
  const PhaseIcon = focusTimer.mode === "focus" ? Target : Moon;

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const slotIndex = getGreetingSlotIndex(now);
    setGreetingSelection((current) => (current.slotIndex === slotIndex ? current : pickGreetingSelection(now)));
  }, [now]);

  return (
    <header className="flex items-start justify-between gap-6">
      <div className="min-w-0 max-w-[980px] flex-1">
        <h1 className={`${headlineSizeClass} font-medium leading-tight text-white [text-wrap:normal]`}>
          {greeting}
        </h1>
        <p className="mt-2 text-lg text-slate-400">
          {profile.tagline.pinned ? profile.tagline.text || greetingSelection.periodLabel : startupSubheading}
        </p>
      </div>

      <div className="flex items-start gap-8">
        <div className="pt-1 text-left">
          <div className="flex items-baseline gap-2 text-white">
            <span className="text-[48px] font-light leading-none">{clock.time}</span>
            <span className="text-lg">{clock.period}</span>
          </div>
          <div className="mt-2 text-sm text-slate-400">{clock.date}</div>
        </div>

        <div className="flex min-w-72 items-center gap-4 rounded-[18px] border border-white/10 bg-[#101d2d]/90 p-4 shadow-panel">
          <div
            aria-label={`${focusLabel} ${focusStatus}`}
            className="grid h-14 w-14 place-items-center rounded-full p-[3px]"
            role="img"
            style={{
              background: `conic-gradient(${phaseTheme.progressColor} ${focusTimer.progressDegrees}deg, rgba(51, 65, 85, 0.74) 0deg)`,
              boxShadow: `0 0 22px ${phaseTheme.shadow}`,
            }}
          >
            <div className="grid h-full w-full place-items-center rounded-full bg-[#101d2d] shadow-[inset_0_0_14px_rgba(2,8,23,0.45)]">
              <PhaseIcon className={`h-5 w-5 ${phaseTheme.labelClass}`} />
            </div>
          </div>
          <div>
            <div className="text-sm text-slate-300">Focus Mode</div>
            <div className={`text-lg font-medium ${phaseTheme.labelClass}`}>
              {focusLabel}
            </div>
            <div className="text-sm text-slate-400">{focusStatus}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
