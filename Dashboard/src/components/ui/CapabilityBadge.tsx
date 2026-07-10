// Honest capability badge — the single visual for "what can this integration
// actually do today". Derives from the capability vocabulary SoT so Settings,
// Profile, and the setup dialog can never drift from the Dock/File Browser.
import {
  CAPABILITY_DISPLAY_LABEL,
  CAPABILITY_TONE,
  deriveCapabilityDisplay,
  type CapabilityDisplay,
} from "../../data/integrationCapability";
import type { IntegrationConnection } from "../../types";

const TONE_CLASS: Record<CapabilityDisplay, string> = {
  connected: "border-emerald-300/25 bg-emerald-400/10 text-emerald-200",
  local_launcher: "border-sky-300/25 bg-sky-400/10 text-sky-200",
  needs_setup: "border-amber-300/25 bg-amber-400/10 text-amber-200",
  planned: "border-white/12 bg-white/[0.04] text-slate-400",
};

export function CapabilityBadge({
  connection,
  className = "",
}: {
  connection: Pick<IntegrationConnection, "status" | "capability">;
  className?: string;
}) {
  const display = deriveCapabilityDisplay(connection);
  void CAPABILITY_TONE; // tone tokens available for non-badge consumers
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] ${TONE_CLASS[display]} ${className}`}
    >
      {CAPABILITY_DISPLAY_LABEL[display]}
    </span>
  );
}
