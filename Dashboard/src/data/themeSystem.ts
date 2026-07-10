import type { ProfileSettings } from "../types";

type AccentTheme = {
  className: string;
  id: ProfileSettings["theme"]["accentColor"];
  label: string;
};

type BackgroundTheme = {
  description: string;
  id: ProfileSettings["theme"]["backgroundTheme"];
  label: string;
  previewClassName: string;
};

export const accentThemes: AccentTheme[] = [
  { id: "blue", label: "Blue", className: "bg-sky-400" },
  { id: "violet", label: "Violet", className: "bg-violet-400" },
  { id: "emerald", label: "Emerald", className: "bg-emerald-400" },
  { id: "amber", label: "Amber", className: "bg-amber-300" },
  { id: "rose", label: "Rose", className: "bg-rose-400" },
  { id: "cyan", label: "Cyan", className: "bg-cyan-300" },
];

export const backgroundThemes: BackgroundTheme[] = [
  {
    id: "nebula_dark",
    label: "Nebula Dark",
    description: "Deep space, slow starlight, and a luminous horizon.",
    previewClassName: "from-sky-950 via-[#07111d] to-slate-950",
  },
  {
    id: "midnight_minimal",
    label: "Midnight Minimal",
    description: "Near-black, sparse, and quiet with a restrained signal glow.",
    previewClassName: "from-slate-950 via-[#050a12] to-black",
  },
  {
    id: "soft_horizon",
    label: "Soft Horizon",
    description: "A calmer cyan atmosphere with a softer lower horizon.",
    previewClassName: "from-sky-900/70 via-[#071827] to-cyan-950/70",
  },
];
