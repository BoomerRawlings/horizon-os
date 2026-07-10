// Single source of truth for the HONEST integration status vocabulary.
// Every surface that shows an integration's state (Settings, Profile, Dock,
// File Browser, Sidebar) derives its label from here — never hardcode
// "Connected"/"Ready" style labels elsewhere. Live status itself comes from
// GET /api/integrations (server.cjs INTEGRATION_DEFINITIONS is the backend SoT).

import type { FileBrowserSourceId, IntegrationConnection, IntegrationStatus } from "../types";

/** The honest four-state display every integration resolves to. */
export type CapabilityDisplay = "connected" | "local_launcher" | "needs_setup" | "planned";

export const CAPABILITY_DISPLAY_LABEL: Record<CapabilityDisplay, string> = {
  connected: "Connected",
  local_launcher: "Local launcher",
  needs_setup: "Needs setup",
  planned: "Planned",
};

/** Short badge text where space is tight (dock tiles). */
export const CAPABILITY_BADGE_LABEL: Record<CapabilityDisplay, string> = {
  connected: "Connected",
  local_launcher: "Launcher",
  needs_setup: "Setup",
  planned: "Planned",
};

/** Tone token per display state; components map this onto their existing styles. */
export const CAPABILITY_TONE: Record<CapabilityDisplay, "positive" | "neutral" | "attention" | "muted"> = {
  connected: "positive",
  local_launcher: "neutral",
  needs_setup: "attention",
  planned: "muted",
};

const CONNECTED_STATUSES: IntegrationStatus[] = ["connected", "connected_limited", "syncing"];

/**
 * Resolve an integration's honest display state from its live connection.
 * Launcher-ceiling integrations (Codex, Microsoft) never display as Connected —
 * they are launchers no matter what settings are saved.
 */
export function deriveCapabilityDisplay(connection: Pick<IntegrationConnection, "status" | "capability">): CapabilityDisplay {
  if (connection.capability === "planned") return "planned";
  if (connection.capability === "launcher") return "local_launcher";
  return CONNECTED_STATUSES.includes(connection.status) ? "connected" : "needs_setup";
}

/**
 * File-browser sources the server can actually browse in-app.
 * Mirrors the allowlist in server.cjs `listFileBrowserSource` — keep in sync.
 */
export const BROWSABLE_SOURCES: FileBrowserSourceId[] = ["local", "obsidian", "research", "google-drive"];

export function isBrowsableSource(sourceId: FileBrowserSourceId): boolean {
  return BROWSABLE_SOURCES.includes(sourceId);
}

/** Hint shown next to sources that only launch external apps/sites. */
export const LAUNCH_ONLY_HINT = "Launch only";
