import type { FocusTimerMode } from "../hooks/useFocusTimer";

export const focusPhaseTheme = {
  focus: {
    progressColor: "rgba(52, 211, 153, 0.94)",
    labelClass: "text-emerald-300",
    softLabelClass: "text-emerald-200",
    shadow: "rgba(52, 211, 153, 0.24)",
    buttonClass:
      "border-emerald-300/40 bg-emerald-400 text-white shadow-[0_12px_28px_rgba(52,211,153,0.26)] hover:bg-emerald-300",
  },
  break: {
    progressColor: "rgba(56, 189, 248, 0.96)",
    labelClass: "text-sky-300",
    softLabelClass: "text-sky-200",
    shadow: "rgba(56, 189, 248, 0.24)",
    buttonClass:
      "border-sky-300/40 bg-sky-400 text-white shadow-[0_12px_28px_rgba(56,189,248,0.28)] hover:bg-sky-300",
  },
} satisfies Record<
  FocusTimerMode,
  {
    progressColor: string;
    labelClass: string;
    softLabelClass: string;
    shadow: string;
    buttonClass: string;
  }
>;

export function getFocusPhaseTheme(mode: FocusTimerMode) {
  return focusPhaseTheme[mode];
}
