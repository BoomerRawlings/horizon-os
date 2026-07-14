import type { IntegrationConnection, ProfileSettings } from "../types";

export const PROFILE_STORAGE_KEY = "horizon-os.profile-settings.v1";
export const INTEGRATIONS_STORAGE_KEY = "horizon-os.integration-connections.v1";

export const defaultProfileSettings: ProfileSettings = {
  firstName: "Explorer",
  lastName: "",
  displayName: "Explorer",
  accountEmail: "you@horizon.os",
  tagline: {
    text: "Stay focused. Keep building.",
    mode: "fallback",
    pinned: false,
    updatedAt: "2026-07-04T00:00:00.000Z",
  },
  workspaceDefaults: {
    pomodoroPreset: "classic",
    startPage: "home",
  },
  theme: {
    accentColor: "blue",
    backgroundTheme: "nebula_dark",
  },
};

// OFFLINE FALLBACK ONLY. The live source of truth is GET /api/integrations
// (server.cjs INTEGRATION_DEFINITIONS); App.tsx overwrites these on load.
// Keep ids + capability in sync with the server if an integration is added.
export const defaultIntegrationConnections: IntegrationConnection[] = [
  {
    id: "obsidian",
    label: "Obsidian",
    capability: "integration",
    type: "local_folder",
    status: "vault_missing",
    statusLabel: "Workspace not selected",
    actionLabel: "Choose workspace",
    detailLabel: "Choose a Horizon workspace or Obsidian vault",
    lastCheckedLabel: "Local check needed",
    permissionSummary: "Reads and writes the selected local Markdown workspace after you validate it.",
  },
  {
    id: "codex",
    label: "Codex",
    capability: "launcher",
    type: "local_app",
    status: "connected_limited",
    statusLabel: "Launcher ready",
    actionLabel: "Open Codex",
    detailLabel: "Opens Codex; sign in securely inside Codex",
    lastCheckedLabel: "Not checked in app",
    permissionSummary: "Passes no password, session, or API key to Codex.",
  },
  {
    id: "microsoft",
    label: "Microsoft",
    capability: "launcher",
    type: "local_app",
    status: "connected_limited",
    statusLabel: "Launcher ready",
    actionLabel: "Open apps",
    detailLabel: "Opens Microsoft apps or their official websites",
    permissionSummary: "Sign in inside Microsoft apps or websites; Horizon never receives your password.",
  },
  {
    id: "google-drive",
    label: "Google Drive",
    capability: "integration",
    type: "oauth",
    status: "permission_missing",
    statusLabel: "Sign-in unavailable",
    actionLabel: "Connect",
    detailLabel: "Google sign-in is not available in this copy",
    permissionSummary: "Uses Google OAuth and read-only Drive metadata access when publisher sign-in is available.",
  },
  {
    id: "research",
    label: "Research",
    capability: "integration",
    type: "compound",
    status: "not_connected",
    statusLabel: "No sources connected",
    actionLabel: "Configure",
    detailLabel: "Add research sources in Settings",
    permissionSummary: "Research will be ready after at least one source, folder, or public metadata provider is configured.",
  },
  {
    id: "zotero",
    label: "Zotero",
    capability: "integration",
    type: "compound",
    status: "not_connected",
    statusLabel: "Connect Zotero Desktop",
    actionLabel: "Connect",
    detailLabel: "Open Zotero Desktop, then connect without a key",
    permissionSummary: "Reads Zotero Desktop locally without a key; an optional cloud key enables cloud access and approved writes.",
  },
  {
    id: "ai-agent",
    label: "AI Agent",
    capability: "integration",
    type: "api_key",
    status: "api_key_required",
    statusLabel: "API key required",
    actionLabel: "Connect",
    detailLabel: "OpenAI API key not connected",
    permissionSummary: "Uses your own OpenAI API account for optional Capture triage and workflow assistance.",
  },
];

function mergeProfileSettings(value: Partial<ProfileSettings>): ProfileSettings {
  return {
    ...defaultProfileSettings,
    ...value,
    tagline: {
      ...defaultProfileSettings.tagline,
      ...value.tagline,
    },
    workspaceDefaults: {
      ...defaultProfileSettings.workspaceDefaults,
      ...value.workspaceDefaults,
    },
    theme: {
      ...defaultProfileSettings.theme,
      ...value.theme,
    },
  };
}

export function loadProfileSettings() {
  if (typeof window === "undefined") {
    return defaultProfileSettings;
  }

  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) {
      return defaultProfileSettings;
    }

    return mergeProfileSettings(JSON.parse(raw) as Partial<ProfileSettings>);
  } catch {
    return defaultProfileSettings;
  }
}

export function saveProfileSettings(settings: ProfileSettings) {
  window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(settings));
}

export function loadIntegrationConnections() {
  if (typeof window === "undefined") {
    return defaultIntegrationConnections;
  }

  try {
    const raw = window.localStorage.getItem(INTEGRATIONS_STORAGE_KEY);
    if (!raw) {
      return defaultIntegrationConnections;
    }

    const saved = JSON.parse(raw) as Partial<IntegrationConnection>[];
    const normalized = defaultIntegrationConnections.map((connection) =>
      normalizeIntegrationConnection({
        ...connection,
        ...saved.find((item) => item.id === connection.id),
      }),
    );
    window.localStorage.setItem(INTEGRATIONS_STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    return defaultIntegrationConnections;
  }
}

function normalizeIntegrationConnection(connection: IntegrationConnection): IntegrationConnection {
  if (
    (connection.id === "google-drive" || connection.id === "microsoft") &&
    (connection.actionLabel === "Resume" ||
      connection.statusLabel === "Sign-in opened" ||
      connection.detailLabel?.includes("sign-in opened"))
  ) {
    const fallback = defaultIntegrationConnections.find((item) => item.id === connection.id) ?? connection;
    return {
      ...fallback,
      accountLabel: connection.accountLabel,
      lastCheckedLabel: "Setup reset",
    };
  }

  if (
    connection.id === "research" &&
    (connection.statusLabel === "Setup started" || connection.detailLabel === "Research source setup started")
  ) {
    const fallback = defaultIntegrationConnections.find((item) => item.id === connection.id) ?? connection;
    return {
      ...fallback,
      lastCheckedLabel: "Setup reset",
    };
  }

  if (connection.id === "ai-agent" && connection.statusLabel === "Key label saved") {
    return {
      ...connection,
      actionLabel: "Add key",
      detailLabel: "Key not stored",
      status: "api_key_required",
      statusLabel: "API key required",
      lastCheckedLabel: "Setup reset",
    };
  }

  if (connection.id === "codex" && connection.statusLabel === "Session noted") {
    return {
      ...connection,
      actionLabel: "Manage",
      detailLabel: "Workspace: your Horizon vault",
      status: "connected_limited",
      statusLabel: "Bridge configured",
    };
  }

  if (connection.id === "obsidian" && connection.statusLabel === "Vault noted") {
    return {
      ...connection,
      actionLabel: "Manage",
      status: "connected_limited",
      statusLabel: "Vault configured",
    };
  }

  return connection;
}

export function saveIntegrationConnections(connections: IntegrationConnection[]) {
  window.localStorage.setItem(INTEGRATIONS_STORAGE_KEY, JSON.stringify(connections));
}
