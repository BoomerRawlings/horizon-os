import type { AppSettings } from "../data/appSettings";
import type { IntegrationConnection, ProfileSettings } from "../types";

const SPOTLIGHT_PREFS_STORAGE_KEY = "horizon-os.project-spotlight.v1";

export type HorizonVaultState = {
  appSettings?: AppSettings | null;
  integrationConnections?: IntegrationConnection[];
  profile?: ProfileSettings | null;
  spotlightPreferences?: Record<string, unknown>;
  updatedAt?: string;
  version?: number;
};

type HorizonStateResponse = {
  exists: boolean;
  state: HorizonVaultState | null;
};

function readSpotlightPreferences() {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(SPOTLIGHT_PREFS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function currentHorizonVaultState(
  appSettings: AppSettings,
  profile: ProfileSettings,
  integrationConnections: IntegrationConnection[],
): HorizonVaultState {
  return {
    appSettings,
    integrationConnections,
    profile,
    spotlightPreferences: readSpotlightPreferences(),
  };
}

export async function loadHorizonStateFromVault() {
  try {
    const response = await fetch("/api/horizon/state", { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as HorizonStateResponse;
    return data.state;
  } catch {
    return null;
  }
}

export async function saveHorizonStateToVault(state: HorizonVaultState) {
  try {
    await fetch("/api/horizon/state", {
      body: JSON.stringify(state),
      headers: { "content-type": "application/json" },
      method: "PUT",
    });
  } catch {
    // Browser cache remains the immediate UI source if the local server is unavailable.
  }
}

export async function saveSpotlightPreferencesToVault(preferences: Record<string, unknown>) {
  try {
    await fetch("/api/horizon/spotlight-preferences", {
      body: JSON.stringify({ preferences }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    });
  } catch {
    // Spotlight preferences are a convenience cache.
  }
}
