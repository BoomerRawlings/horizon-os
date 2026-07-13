import { useEffect, useRef, useState, type ReactNode } from "react";
import packageMetadata from "../../../package.json";
import {
  Bell,
  CalendarCheck,
  Check,
  Database,
  DownloadCloud,
  Eye,
  FolderOpen,
  Keyboard,
  Palette,
  Plug,
  RefreshCw,
  Shield,
  Play,
  SlidersHorizontal,
  Timer,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { BrandMark } from "../ui/BrandMark";
import { CapabilityBadge } from "../ui/CapabilityBadge";
import { dockItems } from "../../data/dockItems";
import { integrationIconSrcFor } from "../../data/integrationIcons";
import { loadAppSettings, saveAppSettings, type AppSettings } from "../../data/appSettings";
import { MOTION_TIMING } from "../../data/motionSystem";
import { accentThemes, backgroundThemes } from "../../data/themeSystem";
import {
  loadUpdateCheckSnapshot,
  saveUpdateCheckSnapshot,
  UPDATE_STATUS_EVENT,
  type UpdateCheckSnapshot,
} from "../../data/updateStatus";
import type { IntegrationConnection, IntegrationStatus, ProfileSettings, SettingsOpenTarget, SettingsSectionId } from "../../types";
import { playFocusTransitionSound, warmFocusAudio } from "../../utils/focusFeedback";
import { IntegrationSetupDialog } from "./IntegrationSetupDialog";
import { AdvancedGuide } from "./AdvancedGuide";
import { FIRST_RUN_REPLAY_EVENT } from "./FirstRunWizard";

type SettingsPanelProps = {
  initialTarget?: SettingsOpenTarget;
  integrations: IntegrationConnection[];
  onClose: () => void;
  onTestLaunch: () => void;
  onIntegrationChange: (connection: IntegrationConnection) => void;
  onProfileChange: (profile: ProfileSettings) => void;
  profile: ProfileSettings;
};

type StartupSnapshot = {
  launchAtStartup: boolean;
  message: string;
  path?: string;
  supported: boolean;
};

type SettingsContentPhase = "idle" | "leaving" | "entering";

const APP_VERSION = String(packageMetadata.version || "unknown");

const settingsSections: Array<{ id: SettingsSectionId; label: string; icon: typeof SlidersHorizontal }> = [
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "focus", label: "Focus", icon: Timer },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "calendar", label: "Calendar & Tasks", icon: CalendarCheck },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "privacy", label: "Privacy & AI", icon: Shield },
  { id: "data", label: "Data & Storage", icon: Database },
  { id: "shortcuts", label: "Keyboard Shortcuts", icon: Keyboard },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "updates", label: "Updates & About", icon: DownloadCloud },
  { id: "advanced", label: "Advanced", icon: Eye },
];

function statusTone(status: IntegrationStatus) {
  if (status === "connected") return { dot: "bg-emerald-400", text: "text-emerald-300" };
  if (status === "syncing" || status === "validating" || status === "connecting" || status === "auth_pending") {
    return { dot: "bg-sky-400", text: "text-sky-300" };
  }
  if (
    status === "connected_limited" ||
    status === "stale" ||
    status === "api_key_required" ||
    status === "permission_missing" ||
    status === "vault_missing"
  ) {
    return { dot: "bg-amber-300", text: "text-amber-200" };
  }
  if (status === "api_key_invalid" || status === "needs_reauth" || status === "rate_limited" || status === "error") {
    return { dot: "bg-rose-400", text: "text-rose-300" };
  }
  return { dot: "bg-slate-500", text: "text-slate-400" };
}

function Toggle({
  checked,
  description,
  disabled = false,
  label,
  onChange,
  planned = false,
}: {
  checked: boolean;
  description: string;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  planned?: boolean;
}) {
  const inactive = disabled || planned;
  const displayedChecked = planned ? false : checked;

  return (
    <button
      aria-disabled={inactive}
      aria-pressed={displayedChecked}
      className={`flex w-full items-center justify-between gap-4 rounded-xl border border-white/8 bg-white/[0.025] px-4 py-3 text-left transition ${
        inactive
          ? "cursor-not-allowed opacity-70"
          : "hover:border-[rgba(var(--accent-rgb),0.28)] hover:bg-white/[0.04]"
      }`}
      disabled={inactive}
      onClick={() => onChange(!checked)}
      type="button"
    >
      <span>
        <span className="flex items-center gap-2">
          <span className="block text-sm font-medium text-white">{label}</span>
          {planned ? (
            <span className="rounded-full border border-amber-300/22 bg-amber-300/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.08em] text-amber-100">
              Planned
            </span>
          ) : null}
        </span>
        <span className="mt-1 block text-xs leading-relaxed text-slate-500">
          {description}
          {planned ? " Saved for later - not active yet." : ""}
        </span>
      </span>
      <span className={`relative h-6 w-11 rounded-full border transition ${displayedChecked ? "border-[rgba(var(--accent-rgb),0.55)] bg-[rgba(var(--accent-rgb),0.22)]" : "border-white/10 bg-white/[0.035]"}`}>
        <span
          className={`absolute top-1 h-4 w-4 rounded-full transition ${
            displayedChecked ? "left-6 bg-[rgb(var(--accent-rgb))]" : "left-1 bg-slate-500"
          }`}
        />
      </span>
    </button>
  );
}

function SettingCard({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-200">{title}</h3>
      <div className="mt-4 grid gap-3">{children}</div>
    </section>
  );
}

function clampSoundVolume(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

function VolumeSlider({
  onChange,
  onTest,
  value,
}: {
  onChange: (value: number) => void;
  onTest: (value: number) => void;
  value: number;
}) {
  const normalizedValue = clampSoundVolume(value);
  const enabled = normalizedValue > 0;
  const VolumeIcon = enabled ? Volume2 : VolumeX;

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.025] px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <span className="flex min-w-0 gap-3">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/8 bg-white/[0.035] text-slate-300">
            <VolumeIcon className="h-4 w-4" />
          </span>
          <span>
            <span className="block text-sm font-medium text-white">Focus sounds</span>
            <span className="mt-1 block text-xs leading-relaxed text-slate-500">
              Soft chimes for focus and rest transitions. Set to zero to turn them off.
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-full border px-3 py-1 text-xs ${
              enabled
                ? "border-[rgba(var(--accent-rgb),0.26)] bg-[rgba(var(--accent-rgb),0.1)] text-sky-100"
                : "border-white/10 bg-white/[0.035] text-slate-400"
            }`}
          >
            {enabled ? `${normalizedValue}%` : "Off"}
          </span>
          <button
            className="h-7 rounded-full border border-white/10 bg-white/[0.04] px-3 text-xs text-slate-200 transition enabled:hover:border-[rgba(var(--accent-rgb),0.32)] enabled:hover:bg-[rgba(var(--accent-rgb),0.1)] disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!enabled}
            onClick={() => onTest(normalizedValue)}
            type="button"
          >
            Test
          </button>
        </span>
      </div>
      <input
        aria-label="Focus sound volume"
        className="mt-4 h-2 w-full cursor-pointer accent-[rgb(var(--accent-rgb))]"
        max={100}
        min={0}
        onChange={(event) => onChange(clampSoundVolume(Number(event.target.value)))}
        step={5}
        style={{ accentColor: "rgb(var(--accent-rgb))" }}
        type="range"
        value={normalizedValue}
      />
    </div>
  );
}

function shortHash(value?: string | null) {
  return value ? value.slice(0, 7) : "unknown";
}

function sectionForTarget(target?: SettingsOpenTarget): SettingsSectionId {
  if (target?.section) return target.section;
  if (target?.integrationId) return "integrations";
  return "general";
}

function sectionIndex(sectionId: SettingsSectionId) {
  const index = settingsSections.findIndex((section) => section.id === sectionId);
  return index >= 0 ? index : 0;
}

function updateCheckTimeLabel(snapshot: UpdateCheckSnapshot | null) {
  if (!snapshot?.checkedAt) return "";
  const checkedAt = new Date(snapshot.checkedAt);
  if (Number.isNaN(checkedAt.getTime())) return "";
  const source = snapshot.checkSource === "automatic" ? "automatically" : "manually";
  return `Last checked ${source} at ${checkedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`;
}

export function SettingsPanel({
  initialTarget,
  integrations,
  onClose,
  onIntegrationChange,
  onProfileChange,
  onTestLaunch,
  profile,
}: SettingsPanelProps) {
  const initialSection = sectionForTarget(initialTarget);
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(initialSection);
  const [displayedSection, setDisplayedSection] = useState<SettingsSectionId>(initialSection);
  const [contentPhase, setContentPhase] = useState<SettingsContentPhase>("idle");
  const [sectionDirection, setSectionDirection] = useState<"down" | "up">("down");
  const [targetIntegrationId, setTargetIntegrationId] = useState<string | null>(() => initialTarget?.integrationId ?? null);
  const [settings, setSettings] = useState(() => loadAppSettings());
  const [vaultPath, setVaultPath] = useState("");
  const [message, setMessage] = useState("Autosave enabled.");
  const [setupConnection, setSetupConnection] = useState<IntegrationConnection | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const [updatingStartup, setUpdatingStartup] = useState(false);
  const [restartingApp, setRestartingApp] = useState(false);
  const [selectingVault, setSelectingVault] = useState(false);
  const [updateSnapshot, setUpdateSnapshot] = useState<UpdateCheckSnapshot | null>(() => loadUpdateCheckSnapshot());
  const closeTimerRef = useRef<number | null>(null);
  const messageTimerRef = useRef<number | null>(null);
  const sectionSwapTimerRef = useRef<number | null>(null);
  const focusAudioRef = useRef<AudioContext | null>(null);
  const targetKey = `${initialTarget?.section ?? ""}:${initialTarget?.integrationId ?? ""}`;
  const activeSectionIndex = sectionIndex(activeSection);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
      if (messageTimerRef.current !== null) {
        window.clearTimeout(messageTimerRef.current);
      }
      if (sectionSwapTimerRef.current !== null) {
        window.clearTimeout(sectionSwapTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    function handleUpdateStatus(event: Event) {
      const detail = (event as CustomEvent<UpdateCheckSnapshot>).detail;
      if (detail) setUpdateSnapshot(detail);
    }

    window.addEventListener(UPDATE_STATUS_EVENT, handleUpdateStatus);
    return () => window.removeEventListener(UPDATE_STATUS_EVENT, handleUpdateStatus);
  }, []);

  useEffect(() => {
    async function syncStartupState() {
      try {
        const response = await fetch("/api/startup");
        if (!response.ok) return;
        const data = (await response.json()) as StartupSnapshot;
        setSettings((current) => {
          if (current.general.launchAtStartup === data.launchAtStartup) {
            return current;
          }

          const next = {
            ...current,
            general: {
              ...current.general,
              launchAtStartup: data.launchAtStartup,
            },
          };
          saveAppSettings(next);
          return next;
        });
      } catch {
        // Browser preview without the local launcher can still use the saved setting.
      }
    }

    void syncStartupState();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/health")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data?.vaultPath) setVaultPath(String(data.vaultPath));
      })
      .catch(() => {
        // Browser preview without the local server: fall back to a generic label below.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!initialTarget) return;

    const nextSection = sectionForTarget(initialTarget);
    changeSection(nextSection);
    setTargetIntegrationId(initialTarget.integrationId ?? null);

    if (initialTarget.integrationId) {
      const connection = integrations.find((item) => item.id === initialTarget.integrationId);
      setMessage(connection ? `${connection.label} settings selected.` : "Integration settings selected.");
    }
  }, [targetKey]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        requestClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isClosing]);

  function requestClose() {
    if (isClosing) return;
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      onClose();
    }, MOTION_TIMING.overlayExitMs);
  }

  function replayFirstRunTutorial() {
    if (isClosing) return;
    requestClose();
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent(FIRST_RUN_REPLAY_EVENT));
    }, MOTION_TIMING.overlayExitMs + 40);
  }

  function changeSection(nextSection: SettingsSectionId) {
    const currentIndex = sectionIndex(activeSection);
    const nextIndex = sectionIndex(nextSection);

    if (nextIndex !== currentIndex) {
      setSectionDirection(nextIndex > currentIndex ? "down" : "up");
      setActiveSection(nextSection);
    }

    if (nextSection !== displayedSection) {
      if (sectionSwapTimerRef.current !== null) {
        window.clearTimeout(sectionSwapTimerRef.current);
      }

      setContentPhase("leaving");
      sectionSwapTimerRef.current = window.setTimeout(() => {
        setDisplayedSection(nextSection);
        setContentPhase("entering");
        sectionSwapTimerRef.current = window.setTimeout(() => {
          setContentPhase("idle");
          sectionSwapTimerRef.current = null;
        }, 320);
      }, 120);
    }

    if (nextSection !== "integrations") {
      setTargetIntegrationId(null);
    }
  }

  function updateSettings(next: AppSettings) {
    setSettings(next);
    saveAppSettings(next);
    setMessage("Saved.");
  }

  function testLaunchSequence() {
    if (messageTimerRef.current !== null) {
      window.clearTimeout(messageTimerRef.current);
    }

    onTestLaunch();
    setMessage("Running launch sequence...");
    messageTimerRef.current = window.setTimeout(() => {
      setMessage((current) => (current === "Running launch sequence..." ? "Autosave enabled." : current));
      messageTimerRef.current = null;
    }, 5_600);
  }

  async function testFocusSound(soundVolume: number) {
    if (soundVolume <= 0) {
      setMessage("Focus sounds are off.");
      return;
    }

    setMessage("Playing focus sound test...");
    try {
      await warmFocusAudio(focusAudioRef, soundVolume);
      const played = await playFocusTransitionSound(focusAudioRef, "focus", soundVolume);
      setMessage(played ? "Played focus sound test." : "Focus sound could not play in this window.");
    } catch {
      setMessage("Focus sound could not play in this window.");
    }
  }

  async function updateDesktopNotifications(checked: boolean) {
    if (!checked) {
      updateSettings({ ...settings, notifications: { ...settings.notifications, desktop: false } });
      setMessage("Desktop notifications off.");
      return;
    }

    if (!("Notification" in window)) {
      updateSettings({ ...settings, notifications: { ...settings.notifications, desktop: false } });
      setMessage("Desktop notifications are not available in this window.");
      return;
    }

    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }

    if (permission !== "granted") {
      updateSettings({ ...settings, notifications: { ...settings.notifications, desktop: false } });
      setMessage("Desktop notifications were not enabled.");
      return;
    }

    updateSettings({ ...settings, notifications: { ...settings.notifications, desktop: true } });
    setMessage("Desktop notifications enabled.");

    const notification = new Notification("Horizon notifications enabled", {
      body: "Focus transition notices will auto-dismiss.",
      icon: "/horizon-os-icon.png",
      silent: true,
      tag: "horizon-notification-test",
    });
    window.setTimeout(() => notification.close(), 4_000);
  }

  async function updateLaunchAtStartup(checked: boolean) {
    const previous = settings;
    const optimistic = {
      ...settings,
      general: {
        ...settings.general,
        launchAtStartup: checked,
      },
    };

    setUpdatingStartup(true);
    setSettings(optimistic);
    saveAppSettings(optimistic);
    setMessage(checked ? "Enabling startup launch..." : "Disabling startup launch...");

    try {
      const response = await fetch("/api/startup", {
        body: JSON.stringify({ enabled: checked }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as StartupSnapshot;
      if (!response.ok || !data.supported) {
        throw new Error(data.message || "Startup launch could not be updated.");
      }

      const confirmed = {
        ...optimistic,
        general: {
          ...optimistic.general,
          launchAtStartup: data.launchAtStartup,
        },
      };
      setSettings(confirmed);
      saveAppSettings(confirmed);
      setMessage(data.message);
    } catch {
      setSettings(previous);
      saveAppSettings(previous);
      setMessage("Startup launch could not be changed from this session.");
    } finally {
      setUpdatingStartup(false);
    }
  }

  function updateTheme(patch: Partial<ProfileSettings["theme"]>) {
    onProfileChange({
      ...profile,
      theme: {
        ...profile.theme,
        ...patch,
      },
    });
    setMessage("Appearance saved.");
  }

  function handleIntegrationClick(connection: IntegrationConnection) {
    setSetupConnection(connection);
  }

  async function checkForUpdates() {
    setCheckingUpdates(true);
    setMessage("Checking for updates...");
    try {
      const response = await fetch("/api/update/check");
      const data = (await response.json()) as UpdateCheckSnapshot;
      if (!response.ok) throw new Error(data.message || "Update check failed.");
      const saved = saveUpdateCheckSnapshot(data, "manual");
      setUpdateSnapshot(saved);
      setMessage(saved.message || "Update check finished.");
    } catch {
      const saved = saveUpdateCheckSnapshot(
        {
          checkState: "fetch_failed",
          fetchFailed: true,
          message: "Horizon could not reach the updater. Retry when the laptop is online.",
          supported: false,
          updateAvailable: false,
          version: APP_VERSION,
        },
        "manual",
      );
      setUpdateSnapshot(saved);
      setMessage(saved.message);
    } finally {
      setCheckingUpdates(false);
    }
  }

  async function applyUpdate() {
    if (!updateSnapshot?.updateAvailable) return;
    setApplyingUpdate(true);
    setMessage("Installing update...");
    try {
      const response = await fetch("/api/update/apply", { method: "POST" });
      const data = (await response.json()) as UpdateCheckSnapshot;
      const saved = saveUpdateCheckSnapshot(data, "manual");
      setUpdateSnapshot(saved);
      setMessage(saved.message || "Update request sent.");
    } catch {
      setMessage("Update install could not start from this preview.");
    } finally {
      setApplyingUpdate(false);
    }
  }

  async function relaunchApp() {
    setRestartingApp(true);
    setMessage("Launching Horizon OS...");
    try {
      const response = await fetch("/api/update/restart", { method: "POST" });
      const data = (await response.json()) as UpdateCheckSnapshot;
      if (!response.ok || !data.restarting) {
        setMessage(data.message || "Relaunch command could not be started.");
        return;
      }
      setMessage(data.message || "Relaunching Horizon OS.");
    } catch {
      setMessage("Relaunch request could not be sent.");
    } finally {
      setRestartingApp(false);
    }
  }

  async function chooseDifferentVault() {
    if (!window.horizonDesktop) {
      setMessage("Vault selection is available from the installed Horizon desktop app.");
      return;
    }
    setSelectingVault(true);
    setMessage("Choose the top-level folder created by Obsidian Sync...");
    try {
      const result = await window.horizonDesktop.chooseVault();
      if (result.canceled) {
        setMessage("Vault selection canceled. The current vault is unchanged.");
      } else if (result.restarting) {
        setVaultPath(result.vaultPath);
        setMessage("Vault connected. Horizon is restarting so every workspace uses it.");
      } else {
        setVaultPath(result.vaultPath);
        setMessage("This vault is already active on this machine.");
      }
    } catch {
      setMessage("Horizon could not open the vault picker.");
    } finally {
      setSelectingVault(false);
    }
  }

  function renderSection(section: SettingsSectionId) {
    if (section === "focus") {
      return (
        <SettingCard title="Focus">
          <Toggle
            checked={settings.focus.autoStartBreaks}
            description="Begin rest periods automatically when a deep work session completes."
            label="Auto-start breaks"
            onChange={(checked) => updateSettings({ ...settings, focus: { ...settings.focus, autoStartBreaks: checked } })}
          />
          <Toggle
            checked={settings.focus.autoStartNextFocus}
            description="After a break, automatically begin the next focus round."
            label="Auto-start next focus"
            onChange={(checked) => updateSettings({ ...settings, focus: { ...settings.focus, autoStartNextFocus: checked } })}
          />
          <VolumeSlider
            onChange={(soundVolume) => {
              updateSettings({ ...settings, focus: { ...settings.focus, soundVolume } });
              setMessage(soundVolume === 0 ? "Focus sounds off." : `Focus sounds set to ${soundVolume}%.`);
            }}
            onTest={(soundVolume) => void testFocusSound(soundVolume)}
            value={settings.focus.soundVolume}
          />
        </SettingCard>
      );
    }

    if (section === "notifications") {
      return (
        <SettingCard title="Notifications">
          <Toggle
            checked={settings.notifications.desktop}
            description="Show Windows desktop notices for enabled Horizon events."
            label="Desktop notifications"
            onChange={(checked) =>
              void updateDesktopNotifications(checked)
            }
          />
          <Toggle
            checked={settings.notifications.deadlineReminders}
            description="Automatic deadline notifications are planned. Deadlines still appear on Home and Calendar."
            label="Deadline reminders"
            onChange={(checked) =>
              updateSettings({ ...settings, notifications: { ...settings.notifications, deadlineReminders: checked } })
            }
            planned
          />
          <Toggle
            checked={settings.notifications.focusTransitions}
            description="Show quiet auto-dismiss notices when focus or rest periods change."
            label="Focus transitions"
            onChange={(checked) =>
              updateSettings({ ...settings, notifications: { ...settings.notifications, focusTransitions: checked } })
            }
          />
        </SettingCard>
      );
    }

    if (section === "calendar") {
      return (
        <SettingCard title="Calendar & Tasks">
          <Toggle
            checked={settings.calendar.showCompletedItems}
            description="Keep completed school and planning items visible in calendar views."
            label="Show completed items"
            onChange={(checked) =>
              updateSettings({ ...settings, calendar: { ...settings.calendar, showCompletedItems: checked } })
            }
          />
          <Toggle
            checked={settings.calendar.weekStartsMonday}
            description="Use a Monday-first week layout for planning views."
            label="Week starts Monday"
            onChange={(checked) =>
              updateSettings({ ...settings, calendar: { ...settings.calendar, weekStartsMonday: checked } })
            }
          />
          <Toggle
            checked={settings.calendar.openReminders}
            description="Filtering open reminders is planned. Horizon currently keeps undated reminders visible."
            label="Open reminders"
            onChange={(checked) => updateSettings({ ...settings, calendar: { ...settings.calendar, openReminders: checked } })}
            planned
          />
        </SettingCard>
      );
    }

    if (section === "integrations") {
      return (
        <SettingCard title="Integrations">
          <div className="grid gap-3">
            {integrations.map((connection) => {
              const dockItem = dockItems.find((item) => item.id === connection.id);
              const iconSrc = integrationIconSrcFor(connection.id) ?? dockItem?.iconSrc;
              const tone = statusTone(connection.status);
              const targeted = targetIntegrationId === connection.id;
              return (
                <article
                  className={`rounded-xl border p-4 transition ${
                    targeted
                      ? "border-[rgba(var(--accent-rgb),0.46)] bg-[rgba(var(--accent-rgb),0.08)] shadow-[0_0_28px_rgba(var(--accent-rgb),0.12)]"
                      : "border-white/8 bg-white/[0.025]"
                  }`}
                  key={connection.id}
                >
                  <div className="flex items-center gap-3">
                    <div className="grid h-11 w-11 place-items-center rounded-xl border border-white/8 bg-white/[0.035]">
                      {iconSrc ? (
                        <BrandMark brand={dockItem?.brand} className="h-7 w-7" iconSrc={iconSrc} label={connection.label} />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-white">{connection.label}</span>
                        <CapabilityBadge connection={connection} />
                        <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                        <span className={`text-xs ${tone.text}`}>{connection.statusLabel}</span>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {connection.accountLabel ?? connection.detailLabel ?? connection.permissionSummary}
                      </p>
                    </div>
                    <button
                      className="h-9 rounded-lg border border-[rgba(var(--accent-rgb),0.28)] bg-[rgba(var(--accent-rgb),0.1)] px-3 text-xs text-white transition hover:bg-[rgba(var(--accent-rgb),0.18)]"
                      onClick={() => handleIntegrationClick(connection)}
                      type="button"
                    >
                      {connection.actionLabel}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </SettingCard>
      );
    }

    if (section === "privacy") {
      return (
        <SettingCard title="Privacy & AI">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.035] px-4 py-3">
            <span>
              <span className="block text-sm font-medium text-white">Local-first storage</span>
              <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                The local vault is always Horizon's source of truth. Credentials stay in Windows app data.
              </span>
            </span>
            <span className="shrink-0 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-200">
              Always on
            </span>
          </div>
          <Toggle
            checked={settings.privacy.codexCanParseCaptures}
            description="Allow Codex to refine capture suggestions. Turn this off to use deterministic local rules only."
            label="Assisted capture parsing"
            onChange={(checked) =>
              updateSettings({ ...settings, privacy: { ...settings.privacy, codexCanParseCaptures: checked } })
            }
          />
          <Toggle
            checked={settings.privacy.shareDiagnostics}
            description="Allow future builds to include anonymous diagnostics with update checks."
            label="Share diagnostics"
            onChange={(checked) => updateSettings({ ...settings, privacy: { ...settings.privacy, shareDiagnostics: checked } })}
            planned
          />
        </SettingCard>
      );
    }

    if (section === "data") {
      return (
        <SettingCard title="Data & Storage">
          <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-medium text-white">Active Obsidian vault</div>
                <div className="mt-1 break-all text-xs text-slate-500">{vaultPath || "Detecting your local vault..."}</div>
                <div className="mt-2 text-xs leading-relaxed text-slate-400">Horizon reads this folder in place. The path is stored only on this computer.</div>
              </div>
              <button
                className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 text-xs text-slate-200 transition enabled:hover:border-[rgba(var(--accent-rgb),0.3)] enabled:hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-45"
                disabled={selectingVault}
                onClick={() => void chooseDifferentVault()}
                type="button"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                {selectingVault ? "Choosing..." : "Change vault"}
              </button>
            </div>
          </div>
          <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
            <div className="text-sm font-medium text-white">Capture queue</div>
            <div className="mt-1 text-xs text-slate-500">Captures save locally first, then wait for Codex parsing.</div>
          </div>
        </SettingCard>
      );
    }

    if (section === "shortcuts") {
      return (
        <SettingCard title="Keyboard Shortcuts">
          {[
            ["Escape", "Close open panels"],
            ["Enter", "Use the focused primary action"],
            ["Tab", "Move through controls"],
          ].map(([key, label]) => (
            <div className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.025] px-4 py-3" key={key}>
              <span className="text-sm text-slate-300">{label}</span>
              <kbd className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-slate-300">{key}</kbd>
            </div>
          ))}
        </SettingCard>
      );
    }

    if (section === "appearance") {
      return (
        <div className="grid gap-4">
          <SettingCard title="Accent Color">
            <div className="flex flex-wrap gap-2">
              {accentThemes.map((accent) => (
                <button
                  aria-label={accent.label}
                  className={`grid h-9 w-9 place-items-center rounded-full border transition ${
                    profile.theme.accentColor === accent.id ? "border-white/80" : "border-white/10"
                  }`}
                  key={accent.id}
                  onClick={() => updateTheme({ accentColor: accent.id })}
                  type="button"
                >
                  <span className={`h-6 w-6 rounded-full ${accent.className}`} />
                </button>
              ))}
            </div>
          </SettingCard>

          <SettingCard title="Background Theme">
            <div className="grid grid-cols-3 gap-3">
              {backgroundThemes.map((theme) => (
                <button
                  className={`group relative h-28 overflow-hidden rounded-xl border bg-gradient-to-br ${theme.previewClassName} ${
                    profile.theme.backgroundTheme === theme.id ? "border-[rgba(var(--accent-rgb),0.7)]" : "border-white/10"
                  }`}
                  key={theme.id}
                  onClick={() => updateTheme({ backgroundTheme: theme.id })}
                  type="button"
                >
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 pb-3 pt-8 text-left">
                    <span className="block text-xs font-medium text-white/90">{theme.label}</span>
                    <span className="mt-1 block text-[10px] leading-snug text-slate-400">{theme.description}</span>
                  </span>
                  {profile.theme.backgroundTheme === theme.id ? (
                    <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-[rgb(var(--accent-rgb))] text-white">
                      <Check className="h-4 w-4" />
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </SettingCard>

          <SettingCard title="Display">
            <Toggle
              checked={settings.appearance.showAmbientBackground}
              description="Keep the slow atmospheric background visible behind panels."
              label="Ambient background"
              onChange={(checked) =>
                updateSettings({ ...settings, appearance: { ...settings.appearance, showAmbientBackground: checked } })
              }
            />
            <Toggle
              checked={settings.appearance.highContrastPanels}
              description="Increase panel contrast for lower-light readability."
              label="High contrast panels"
              onChange={(checked) =>
                updateSettings({ ...settings, appearance: { ...settings.appearance, highContrastPanels: checked } })
              }
            />
          </SettingCard>
        </div>
      );
    }

    if (section === "updates") {
      return (
        <div className="grid gap-4">
          <SettingCard title="Horizon OS">
            <div className="flex items-center gap-4 rounded-xl border border-white/8 bg-white/[0.025] p-4">
              <img alt="" className="h-16 w-16 rounded-2xl border border-white/10 object-cover" src="/horizon-os-icon.png" />
              <div>
                <div className="text-lg font-semibold text-white">Horizon OS</div>
                <div className="mt-1 text-xs text-slate-500">Horizon {APP_VERSION}</div>
                <div className="mt-2 text-xs text-slate-400">Installed locally; update status is verified against the connected repository.</div>
              </div>
            </div>
          </SettingCard>

          <SettingCard title="Updates">
            <div className="grid grid-cols-3 gap-3">
              <button
                className="flex h-10 items-center justify-center gap-2 rounded-lg border border-[rgba(var(--accent-rgb),0.32)] bg-[rgba(var(--accent-rgb),0.12)] px-4 text-sm text-white transition hover:bg-[rgba(var(--accent-rgb),0.2)]"
                disabled={checkingUpdates}
                onClick={checkForUpdates}
                type="button"
              >
                <RefreshCw className={`h-4 w-4 ${checkingUpdates ? "animate-spin" : ""}`} />
                {checkingUpdates ? "Checking..." : "Check for updates"}
              </button>
              <button
                className="flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-4 text-sm text-slate-200 transition enabled:hover:border-[rgba(var(--accent-rgb),0.3)] enabled:hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-45"
                disabled={!updateSnapshot?.updateAvailable || Boolean(updateSnapshot?.dirty) || applyingUpdate}
                onClick={applyUpdate}
                type="button"
              >
                <DownloadCloud className="h-4 w-4" />
                {applyingUpdate
                  ? "Installing..."
                  : updateSnapshot?.packageStale && !updateSnapshot?.sourceUpdateAvailable
                    ? "Repair app and restart"
                    : "Download, install, restart"}
              </button>
              <button
                className="flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-4 text-sm text-slate-200 transition enabled:hover:border-[rgba(var(--accent-rgb),0.3)] enabled:hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-45"
                disabled={restartingApp || checkingUpdates || applyingUpdate}
                onClick={relaunchApp}
                type="button"
              >
                <Play className="h-4 w-4" />
                {restartingApp ? "Launching..." : "Launch Horizon"}
              </button>
            </div>
            <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4 text-sm text-slate-300">
              <div>{updateSnapshot?.message ?? "No update check has been recorded yet."}</div>
              {updateCheckTimeLabel(updateSnapshot) ? (
                <div className="mt-1 text-xs text-slate-500">{updateCheckTimeLabel(updateSnapshot)}</div>
              ) : null}
              {updateSnapshot ? (
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
                  <div>Installed version: {updateSnapshot.packagedVersion || updateSnapshot.version || APP_VERSION}</div>
                  <div>Source version: {updateSnapshot.sourceVersion || "unknown"}</div>
                  <div>Status: {updateSnapshot.checkState?.replaceAll("_", " ") || "checked"}</div>
                  <div>Current: {shortHash(updateSnapshot.current)}</div>
                  <div>Latest: {shortHash(updateSnapshot.latest)}</div>
                  <div>Installed build: {shortHash(updateSnapshot.packagedCommit)}</div>
                  <div>Branch: {updateSnapshot.branch ?? "unknown"}</div>
                  <div>Upstream: {updateSnapshot.upstream ?? "unknown"}</div>
                </div>
              ) : null}
              {updateSnapshot?.fetchFailed || updateSnapshot?.checkState === "unsupported" ? (
                <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/8 px-3 py-2 text-xs text-amber-200">
                  This result is not an “up to date” confirmation. Horizon could not refresh the update source.
                </div>
              ) : null}
              {updateSnapshot?.dirty ? (
                <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/8 px-3 py-2 text-xs text-amber-200">
                  Local changes are present, so install is paused until the repo is clean.
                </div>
              ) : null}
              {updateSnapshot?.packageStale && !updateSnapshot?.dirty && !updateSnapshot?.fetchFailed ? (
                <div className="mt-3 rounded-lg border border-sky-300/20 bg-sky-300/8 px-3 py-2 text-xs text-sky-100">
                  The source checkout is newer than the packaged app currently on screen. Repair will rebuild the app, verify its build identity, and relaunch it.
                </div>
              ) : null}
            </div>
            <Toggle
              checked={settings.updates.autoCheck}
              description="Check for updates automatically when the standalone app starts."
              label="Auto-check on launch"
              onChange={(checked) => updateSettings({ ...settings, updates: { ...settings.updates, autoCheck: checked } })}
            />
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-xs font-medium text-slate-300">Update channel</span>
                <span className="rounded-full border border-amber-300/22 bg-amber-300/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.08em] text-amber-100">
                  Planned
                </span>
              </div>
              <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
                {(["stable", "preview"] as const).map((channel) => (
                  <button
                    className={`h-10 text-sm capitalize transition ${
                      settings.updates.channel === channel
                        ? "bg-[rgba(var(--accent-rgb),0.14)] text-white"
                        : "text-slate-500"
                    }`}
                    disabled
                    key={channel}
                    type="button"
                  >
                    {channel}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">Stable is active today. Additional update channels are planned.</p>
            </div>
          </SettingCard>
        </div>
      );
    }

    if (section === "advanced") {
      return <AdvancedGuide onReplayTutorial={replayFirstRunTutorial} />;
    }

    return (
      <SettingCard title="General">
        <Toggle
          checked={settings.general.launchAtStartup}
          description={updatingStartup ? "Updating Windows startup shortcut..." : "Open Horizon automatically when Windows signs in."}
          label="Launch at startup"
          onChange={(checked) => {
            if (!updatingStartup) {
              void updateLaunchAtStartup(checked);
            }
          }}
        />
        <Toggle
          checked={settings.general.openToLastView}
          description="Restoring a non-Home launch destination is planned. Horizon opens Home so Capture and the dock stay visible."
          label="Open to last view"
          onChange={(checked) => updateSettings({ ...settings, general: { ...settings.general, openToLastView: checked } })}
          planned
        />
        <Toggle
          checked={settings.general.quietLaunch}
          description="Skip the launch animation and open straight to the dashboard."
          label="Quiet launch"
          onChange={(checked) => updateSettings({ ...settings, general: { ...settings.general, quietLaunch: checked } })}
        />
        <div className="grid gap-2 rounded-xl border border-white/8 bg-white/[0.025] px-4 py-3">
          <span className="text-xs text-slate-500">Test the startup boot animation and tone without relaunching.</span>
          <button
            className="inline-flex w-32 items-center justify-center gap-2 rounded-lg border border-[rgba(var(--accent-rgb),0.25)] bg-[rgba(var(--accent-rgb),0.08)] px-3 py-2 text-xs font-medium text-slate-100 transition hover:border-[rgba(var(--accent-rgb),0.45)] hover:bg-[rgba(var(--accent-rgb),0.14)]"
            onClick={testLaunchSequence}
            type="button"
          >
            <Play className="h-3.5 w-3.5" />
            Test launch
          </button>
        </div>
      </SettingCard>
    );
  }

  return (
    <div className="fixed inset-0 z-[60]">
      <button
        aria-label="Close settings"
        className={`settings-panel-scrim absolute inset-0 cursor-default bg-black/20 ${isClosing ? "settings-panel-scrim-closing" : ""}`}
        onClick={requestClose}
        type="button"
      />

      <section
        aria-label="Settings"
        aria-modal="true"
        className={`settings-panel fixed bottom-4 left-4 top-4 flex w-[920px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-[18px] border border-[rgba(var(--accent-rgb),0.24)] bg-[#081421]/96 shadow-[0_28px_90px_rgba(0,0,0,0.4)] backdrop-blur-xl ${
          isClosing ? "settings-panel-closing" : ""
        }`}
        role="dialog"
      >
        <header className="flex items-start justify-between border-b border-white/8 px-6 py-5">
          <div>
            <h2 className="text-2xl font-semibold text-white">Settings</h2>
            <p className="mt-1 text-sm text-slate-400">App behavior, integrations, privacy, data, and updates.</p>
          </div>
          <button
            aria-label="Close settings"
            className="grid h-9 w-9 place-items-center rounded-full border border-white/12 bg-white/[0.035] text-slate-300 transition hover:border-[rgba(var(--accent-rgb),0.34)] hover:text-white"
            onClick={requestClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[230px_minmax(0,1fr)]">
          <aside className="min-h-0 border-r border-white/8 px-4 py-4">
            <nav className="settings-section-nav relative grid gap-2">
              <span
                aria-hidden="true"
                className="settings-section-selector"
                style={{ transform: `translate3d(0, ${activeSectionIndex * 48}px, 0)` }}
              />
              {settingsSections.map((section) => {
                const Icon = section.icon;
                const active = activeSection === section.id;
                return (
                  <button
                    aria-current={active ? "page" : undefined}
                    className={`relative z-10 flex h-10 items-center gap-3 rounded-xl border px-3 text-left text-sm transition ${
                      active
                        ? "border-transparent text-white"
                        : "border-transparent text-slate-400 hover:border-white/10 hover:bg-white/[0.035] hover:text-slate-100"
                    }`}
                    key={section.id}
                    onClick={() => changeSection(section.id)}
                    type="button"
                  >
                    <Icon className="h-4 w-4" />
                    {section.label}
                  </button>
                );
              })}
            </nav>
          </aside>

          <main className="min-h-0 overflow-y-auto px-5 py-4">
            <div
              className={`settings-section-content settings-section-content-${sectionDirection} settings-section-content-${contentPhase} mx-auto max-w-2xl`}
              key={displayedSection}
            >
              {renderSection(displayedSection)}
            </div>
          </main>
        </div>

        <footer className="flex items-center justify-between border-t border-white/8 px-5 py-4">
          <div className="text-xs text-slate-500">
            <div>{message}</div>
          </div>
          <span className="rounded-full border border-emerald-300/20 bg-emerald-300/8 px-3 py-1 text-xs text-emerald-200">
            Autosaved
          </span>
        </footer>
      </section>
      {setupConnection ? (
        <IntegrationSetupDialog
          accountEmail={profile.accountEmail}
          connection={setupConnection}
          onClose={() => setSetupConnection(null)}
          onSave={({ connection, message: saveMessage }) => {
            onIntegrationChange(connection);
            setMessage(saveMessage);
          }}
        />
      ) : null}
    </div>
  );
}
