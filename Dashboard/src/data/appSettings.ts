export type AppSettings = {
  general: {
    launchAtStartup: boolean;
    openToLastView: boolean;
    quietLaunch: boolean;
  };
  focus: {
    autoStartBreaks: boolean;
    autoStartNextFocus: boolean;
    soundVolume: number;
  };
  notifications: {
    desktop: boolean;
    deadlineReminders: boolean;
    focusTransitions: boolean;
  };
  calendar: {
    showCompletedItems: boolean;
    weekStartsMonday: boolean;
    openReminders: boolean;
  };
  privacy: {
    localFirst: boolean;
    codexCanParseCaptures: boolean;
    shareDiagnostics: boolean;
  };
  appearance: {
    highContrastPanels: boolean;
    showAmbientBackground: boolean;
  };
  updates: {
    autoCheck: boolean;
    channel: "stable" | "preview";
  };
};

export const APP_SETTINGS_STORAGE_KEY = "horizon-os.app-settings.v1";
export const APP_SETTINGS_UPDATED_EVENT = "horizon-os.app-settings-updated";

export const defaultAppSettings: AppSettings = {
  general: {
    launchAtStartup: false,
    openToLastView: true,
    quietLaunch: false,
  },
  focus: {
    autoStartBreaks: true,
    autoStartNextFocus: false,
    soundVolume: 35,
  },
  notifications: {
    desktop: false,
    deadlineReminders: true,
    focusTransitions: true,
  },
  calendar: {
    showCompletedItems: false,
    weekStartsMonday: false,
    openReminders: true,
  },
  privacy: {
    localFirst: true,
    codexCanParseCaptures: true,
    shareDiagnostics: false,
  },
  appearance: {
    highContrastPanels: false,
    showAmbientBackground: true,
  },
  updates: {
    autoCheck: true,
    channel: "stable",
  },
};

function clampVolume(value: unknown, fallback: number) {
  const numericValue = typeof value === "string" ? Number(value) : value;
  if (typeof numericValue !== "number" || !Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(100, Math.max(0, Math.round(numericValue)));
}

function mergeAppSettings(value: Partial<AppSettings>): AppSettings {
  const legacyFocus = value.focus as (Partial<AppSettings["focus"]> & { soundCues?: boolean }) | undefined;
  const fallbackSoundVolume = legacyFocus?.soundCues === false ? 0 : defaultAppSettings.focus.soundVolume;

  return {
    ...defaultAppSettings,
    ...value,
    appearance: {
      ...defaultAppSettings.appearance,
      ...value.appearance,
    },
    calendar: {
      ...defaultAppSettings.calendar,
      ...value.calendar,
    },
    focus: {
      ...defaultAppSettings.focus,
      ...legacyFocus,
      soundVolume: clampVolume(legacyFocus?.soundVolume, fallbackSoundVolume),
    },
    general: {
      ...defaultAppSettings.general,
      ...value.general,
    },
    notifications: {
      ...defaultAppSettings.notifications,
      ...value.notifications,
    },
    privacy: {
      ...defaultAppSettings.privacy,
      ...value.privacy,
    },
    updates: {
      ...defaultAppSettings.updates,
      ...value.updates,
    },
  };
}

export function loadAppSettings() {
  if (typeof window === "undefined") {
    return defaultAppSettings;
  }

  try {
    const raw = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return defaultAppSettings;
    }

    return mergeAppSettings(JSON.parse(raw) as Partial<AppSettings>);
  } catch {
    return defaultAppSettings;
  }
}

export function saveAppSettings(settings: AppSettings) {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent<AppSettings>(APP_SETTINGS_UPDATED_EVENT, { detail: settings }));
}
