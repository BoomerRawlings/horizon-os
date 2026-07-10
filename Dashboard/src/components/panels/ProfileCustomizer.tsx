import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  LayoutGrid,
  Palette,
  Pin,
  Plug,
  RefreshCw,
  RotateCcw,
  User,
  X,
} from "lucide-react";
import { BrandMark } from "../ui/BrandMark";
import { CapabilityBadge } from "../ui/CapabilityBadge";
import { dockItems } from "../../data/dockItems";
import { integrationIconSrcFor } from "../../data/integrationIcons";
import { defaultProfileSettings } from "../../data/profile";
import { MOTION_TIMING } from "../../data/motionSystem";
import { accentThemes, backgroundThemes } from "../../data/themeSystem";
import { FOCUS_PRESETS } from "../../hooks/useFocusTimer";
import type { IntegrationConnection, IntegrationStatus, ProfileSettings, TaglineMode } from "../../types";
import { IntegrationSetupDialog } from "./IntegrationSetupDialog";

type ProfileCustomizerProps = {
  isTimerRunning: boolean;
  integrations: IntegrationConnection[];
  onClose: () => void;
  onIntegrationChange: (connection: IntegrationConnection) => void;
  onSave: (settings: ProfileSettings) => void;
  profile: ProfileSettings;
};

const taglineSuggestions = [
  "Deep work across school, story, and strategy.",
  "Psychology, writing, and long-term systems.",
  "Study sharp. Build clean. Keep moving.",
  "Focused work for stories, study, and business.",
];

const startPages = [
  { id: "home", label: "Home Dashboard" },
  { id: "focus", label: "Focus" },
  { id: "projects", label: "Projects" },
  { id: "notes", label: "Files & Notes" },
] as const;

const sideSections = [
  { id: "profile", label: "Profile", icon: User },
  { id: "workspace", label: "Workspace", icon: LayoutGrid },
  { id: "theme", label: "Theme", icon: Palette },
  { id: "integrations", label: "Integrations", icon: Plug },
] as const;

type ProfileSectionId = (typeof sideSections)[number]["id"];

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "RA";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function taglineModeLabel(mode: TaglineMode) {
  if (mode === "ai_generated") return "AI-generated";
  if (mode === "pinned") return "Pinned";
  if (mode === "custom") return "Custom";
  return "Fallback";
}

function statusTone(status: IntegrationStatus) {
  if (status === "connected") return { dot: "bg-emerald-400", text: "text-emerald-300", border: "border-emerald-300/20" };
  if (status === "syncing" || status === "validating" || status === "connecting" || status === "auth_pending") {
    return { dot: "bg-sky-400", text: "text-sky-300", border: "border-sky-300/20" };
  }
  if (
    status === "connected_limited" ||
    status === "stale" ||
    status === "api_key_required" ||
    status === "permission_missing" ||
    status === "vault_missing"
  ) {
    return { dot: "bg-amber-300", text: "text-amber-200", border: "border-amber-300/20" };
  }
  if (status === "api_key_invalid" || status === "needs_reauth" || status === "rate_limited" || status === "error") {
    return { dot: "bg-rose-400", text: "text-rose-300", border: "border-rose-300/20" };
  }
  return { dot: "bg-slate-500", text: "text-slate-400", border: "border-white/10" };
}

function IntegrationTile({ connection, onAction }: { connection: IntegrationConnection; onAction: (connection: IntegrationConnection) => void }) {
  const dockItem = dockItems.find((item) => item.id === connection.id);
  const iconSrc = integrationIconSrcFor(connection.id) ?? dockItem?.iconSrc;
  const Icon = iconSrc ? undefined : dockItem?.icon;
  const tone = statusTone(connection.status);

  return (
    <article className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/8 bg-white/[0.035]">
          {iconSrc ? <BrandMark brand={dockItem?.brand} className="h-6 w-6" iconSrc={iconSrc} label={connection.label} /> : null}
          {Icon ? <Icon className="h-5 w-5 text-sky-300" strokeWidth={1.7} /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-white">{connection.label}</span>
            <CapabilityBadge connection={connection} />
          </div>
          <div className={`mt-1 flex items-center gap-1.5 text-xs ${tone.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
            <span className="truncate">{connection.statusLabel}</span>
          </div>
        </div>
      </div>
      <p className="mt-3 min-h-10 text-xs leading-relaxed text-slate-500">{connection.permissionSummary}</p>
      {connection.detailLabel || connection.accountLabel ? (
        <p className="mt-2 truncate text-[11px] text-slate-500">{connection.accountLabel ?? connection.detailLabel}</p>
      ) : null}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/8 pt-3">
        <span className="truncate text-[11px] text-slate-500">{connection.lastCheckedLabel ?? "Not checked"}</span>
        <button
          aria-label={`${connection.actionLabel} ${connection.label}`}
          className="h-8 rounded-lg border border-white/10 bg-white/[0.035] px-3 text-xs text-slate-200 transition hover:border-sky-300/30 hover:bg-sky-400/8"
          onClick={() => onAction(connection)}
          type="button"
        >
          {connection.actionLabel}
        </button>
      </div>
    </article>
  );
}

function normalizeProfileDraft(draft: ProfileSettings): ProfileSettings {
  return {
    ...draft,
    accountEmail: draft.accountEmail.trim(),
    firstName: draft.firstName.trim(),
    lastName: draft.lastName.trim(),
    displayName: draft.displayName.trim(),
    tagline: {
      ...draft.tagline,
      text: draft.tagline.text.trim() || defaultProfileSettings.tagline.text,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function ProfileCustomizer({
  integrations,
  isTimerRunning,
  onClose,
  onIntegrationChange,
  onSave,
  profile,
}: ProfileCustomizerProps) {
  const [draft, setDraft] = useState(profile);
  const [activeSection, setActiveSection] = useState<ProfileSectionId>("profile");
  const [saving, setSaving] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [message, setMessage] = useState("Autosave enabled.");
  const [setupConnection, setSetupConnection] = useState<IntegrationConnection | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const lastSavedProfileRef = useRef(JSON.stringify(profile));
  const profileSectionRef = useRef<HTMLElement | null>(null);
  const workspaceSectionRef = useRef<HTMLElement | null>(null);
  const themeSectionRef = useRef<HTMLElement | null>(null);
  const integrationsSectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(profile), [draft, profile]);
  const firstNameInvalid = draft.firstName.trim().length === 0;
  const displayNameInvalid = draft.displayName.trim().length === 0;
  const syncStatus = saving ? "Saving..." : dirty ? "Saving soon" : "Synced";

  function beginClose() {
    if (isClosing) return;
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      onClose();
    }, MOTION_TIMING.overlayExitMs);
  }

  function requestClose() {
    beginClose();
  }

  function refForSection(sectionId: ProfileSectionId) {
    if (sectionId === "workspace") return workspaceSectionRef;
    if (sectionId === "theme") return themeSectionRef;
    if (sectionId === "integrations") return integrationsSectionRef;
    return profileSectionRef;
  }

  function jumpToSection(sectionId: ProfileSectionId) {
    setActiveSection(sectionId);
    refForSection(sectionId).current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        requestClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dirty, isClosing]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    lastSavedProfileRef.current = JSON.stringify(profile);
  }, [profile]);

  useEffect(() => {
    if (!dirty) {
      return undefined;
    }

    if (firstNameInvalid || displayNameInvalid) {
      setMessage("First name and display name are required.");
      return undefined;
    }

    const nextProfile = normalizeProfileDraft(draft);
    const serialized = JSON.stringify(nextProfile);
    if (serialized === lastSavedProfileRef.current) {
      return undefined;
    }

    setSaving(true);
    setMessage("Saving...");
    const timeout = window.setTimeout(() => {
      onSave(nextProfile);
      lastSavedProfileRef.current = serialized;
      setSaving(false);
      setMessage(isTimerRunning ? "Saved. Pomodoro default applies after the current session." : "Saved.");
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [dirty, displayNameInvalid, draft, firstNameInvalid, isTimerRunning]);

  function handleSectionFocus(sectionId: ProfileSectionId) {
    if (activeSection !== sectionId) {
      setActiveSection(sectionId);
    }
  }

  function updateTaglineText(text: string) {
    setDraft((current) => ({
      ...current,
      tagline: {
        ...current.tagline,
        text,
        mode: current.tagline.pinned ? "pinned" : "custom",
        updatedAt: new Date().toISOString(),
      },
    }));
  }

  function refreshTagline() {
    const currentIndex = taglineSuggestions.indexOf(draft.tagline.text);
    const nextText = taglineSuggestions[(currentIndex + 1) % taglineSuggestions.length];
    setDraft((current) => ({
      ...current,
      tagline: {
        text: nextText,
        mode: "fallback",
        pinned: false,
        updatedAt: new Date().toISOString(),
      },
    }));
    setMessage("AI Agent is not connected yet, so Horizon OS used a local fallback.");
  }

  function pinTagline() {
    setDraft((current) => ({
      ...current,
      tagline: {
        ...current.tagline,
        mode: "pinned",
        pinned: true,
        updatedAt: new Date().toISOString(),
      },
    }));
  }

  function resetDefaults() {
    if (window.confirm("Reset profile fields and preferences to defaults? Integrations will not be disconnected.")) {
      setDraft(defaultProfileSettings);
      setMessage("Defaults restored. Autosave will keep them.");
    }
  }

  function handleIntegrationAction(connection: IntegrationConnection) {
    setSetupConnection(connection);
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="Close profile customizer"
        className={`profile-customizer-scrim absolute inset-0 cursor-default bg-black/15 ${
          isClosing ? "profile-customizer-scrim-closing" : ""
        }`}
        onClick={requestClose}
        type="button"
      />

      <section
        aria-label="Profile and customization"
        aria-modal="true"
        className={`profile-customizer-panel fixed bottom-5 left-3 top-4 flex w-[760px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-[18px] border border-sky-300/20 bg-[#081421]/96 shadow-[0_28px_90px_rgba(0,0,0,0.38)] backdrop-blur-xl ${
          isClosing ? "profile-customizer-panel-closing" : ""
        }`}
        role="dialog"
      >
        <header className="flex items-start justify-between border-b border-white/8 px-6 py-5">
          <div>
            <h2 className="text-2xl font-semibold text-white">Profile & Customization</h2>
            <p className="mt-1 text-sm text-slate-400">Personalize your Horizon OS experience.</p>
          </div>
          <button
            aria-label="Close profile customizer"
            className="grid h-9 w-9 place-items-center rounded-full border border-white/12 bg-white/[0.035] text-slate-300 transition hover:border-sky-300/30 hover:text-white"
            onClick={requestClose}
            ref={closeButtonRef}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[180px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-r border-white/8 px-4 py-4">
            <nav className="grid gap-2">
              {sideSections.map((section) => {
                const Icon = section.icon;
                const active = activeSection === section.id;
                return (
                  <button
                    aria-current={active ? "page" : undefined}
                    key={section.label}
                    className={`flex h-10 items-center gap-3 rounded-xl border px-3 text-left text-sm transition ${
                      active
                        ? "border-sky-300/20 bg-sky-400/12 text-white"
                        : "border-transparent text-slate-400 hover:border-white/10 hover:bg-white/[0.035] hover:text-slate-100"
                    }`}
                    onClick={() => jumpToSection(section.id)}
                    type="button"
                  >
                    <Icon className="h-4 w-4" />
                    {section.label}
                  </button>
                );
              })}
            </nav>

            <div className="mt-auto rounded-2xl border border-white/8 bg-white/[0.025] p-4 text-center">
              <div className="mx-auto grid h-20 w-20 place-items-center rounded-full border border-sky-300/40 bg-white/[0.06] text-2xl text-white shadow-[0_0_28px_rgba(56,189,248,0.18)]">
                {initialsFor(draft.displayName)}
              </div>
              <div className="mt-3 text-sm font-semibold text-white">{draft.displayName || "Explorer"}</div>
              <div className="mt-1 truncate text-xs text-slate-400">{draft.accountEmail}</div>
              <div className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-300">
                <span className={`h-2 w-2 rounded-full ${dirty ? "bg-amber-300" : "bg-emerald-400"}`} />
                {syncStatus}
              </div>
            </div>
          </aside>

          <main className="min-h-0 overflow-y-auto px-5 py-4">
            <div className="grid gap-3">
              <section
                className="scroll-mt-4 rounded-2xl border border-white/8 bg-white/[0.025] p-4"
                onFocusCapture={() => handleSectionFocus("profile")}
                ref={profileSectionRef}
              >
                <div className="mb-4 flex items-center gap-2">
                  <User className="h-4 w-4 text-sky-300" />
                  <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-200">Profile Information</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="grid gap-1 text-xs text-slate-400">
                    First Name
                    <input
                      className={`h-9 rounded-lg border bg-white/[0.035] px-3 text-sm text-white outline-none transition focus:border-sky-300/50 ${
                        firstNameInvalid ? "border-rose-300/50" : "border-white/10"
                      }`}
                      onChange={(event) => setDraft((current) => ({ ...current, firstName: event.target.value }))}
                      value={draft.firstName}
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-400">
                    Last Name
                    <input
                      className="h-9 rounded-lg border border-white/10 bg-white/[0.035] px-3 text-sm text-white outline-none transition focus:border-sky-300/50"
                      onChange={(event) => setDraft((current) => ({ ...current, lastName: event.target.value }))}
                      value={draft.lastName}
                    />
                  </label>
                  <label className="col-span-2 grid gap-1 text-xs text-slate-400">
                    Display Name
                    <input
                      className={`h-9 rounded-lg border bg-white/[0.035] px-3 text-sm text-white outline-none transition focus:border-sky-300/50 ${
                        displayNameInvalid ? "border-rose-300/50" : "border-white/10"
                      }`}
                      onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))}
                      value={draft.displayName}
                    />
                  </label>
                  <label className="col-span-2 grid gap-1 text-xs text-slate-400">
                    Email / Account
                    <input
                      className="h-9 rounded-lg border border-white/10 bg-white/[0.035] px-3 text-sm text-white outline-none transition focus:border-sky-300/50"
                      onChange={(event) => setDraft((current) => ({ ...current, accountEmail: event.target.value }))}
                      value={draft.accountEmail}
                    />
                  </label>
                </div>
              </section>

              <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-4" onFocusCapture={() => handleSectionFocus("profile")}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-200">Tagline</h3>
                    <p className="mt-1 text-xs text-slate-500">A short line that personalizes your workspace.</p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1 text-xs text-slate-300">
                    {taglineModeLabel(draft.tagline.mode)}
                  </span>
                </div>
                <textarea
                  aria-label="Tagline"
                  className="min-h-16 w-full resize-none rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-sm leading-relaxed text-white outline-none transition focus:border-sky-300/50"
                  maxLength={120}
                  onChange={(event) => updateTaglineText(event.target.value)}
                  value={draft.tagline.text}
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    className="flex h-8 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 text-xs text-slate-200 transition hover:border-sky-300/30 hover:bg-sky-400/8"
                    onClick={refreshTagline}
                    type="button"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Refresh
                  </button>
                  <button
                    className="flex h-8 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 text-xs text-slate-200 transition hover:border-sky-300/30 hover:bg-sky-400/8"
                    onClick={pinTagline}
                    type="button"
                  >
                    <Pin className="h-3.5 w-3.5" />
                    Pin
                  </button>
                  <span className="ml-auto text-xs text-slate-500">{draft.tagline.text.length} / 120</span>
                </div>
              </section>

              <section
                className="scroll-mt-4 rounded-2xl border border-white/8 bg-white/[0.025] p-4"
                onFocusCapture={() => handleSectionFocus("workspace")}
                ref={workspaceSectionRef}
              >
                <div className="mb-4 flex items-center gap-2">
                  <LayoutGrid className="h-4 w-4 text-sky-300" />
                  <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-200">Workspace Defaults</h3>
                </div>
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <div className="mb-2 text-xs text-slate-400">Pomodoro Preset</div>
                    <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-white/10 bg-white/[0.02]">
                      {FOCUS_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          className={`h-9 text-sm transition ${
                            draft.workspaceDefaults.pomodoroPreset === preset.id
                              ? "bg-sky-400/14 text-sky-100"
                              : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
                          }`}
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              workspaceDefaults: { ...current.workspaceDefaults, pomodoroPreset: preset.id },
                            }))
                          }
                          type="button"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    {isTimerRunning ? <p className="mt-2 text-xs text-amber-200">Applies after the current session.</p> : null}
                  </div>
                  <label className="grid gap-2 text-xs text-slate-400">
                    Start Page
                    <span className="relative">
                      <select
                        aria-label="Start Page"
                        className="profile-start-page-select h-9 w-full appearance-none rounded-lg border border-white/10 bg-[#0b1726] px-3 pr-9 text-sm text-slate-100 outline-none transition hover:border-white/20 focus:border-sky-300/50"
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            workspaceDefaults: {
                              ...current.workspaceDefaults,
                              startPage: event.target.value as ProfileSettings["workspaceDefaults"]["startPage"],
                            },
                          }))
                        }
                        value={draft.workspaceDefaults.startPage}
                      >
                        {startPages.map((page) => (
                          <option className="bg-[#0b1726] text-slate-100" key={page.id} value={page.id}>
                            {page.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
                    </span>
                    <span className="text-[11px] leading-relaxed text-slate-500">Opens here the next time Horizon starts.</span>
                  </label>
                </div>
              </section>

              <section
                className="scroll-mt-4 rounded-2xl border border-white/8 bg-white/[0.025] p-4"
                onFocusCapture={() => handleSectionFocus("theme")}
                ref={themeSectionRef}
              >
                <div className="mb-4 flex items-center gap-2">
                  <Palette className="h-4 w-4 text-sky-300" />
                  <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-200">Theme & Personalization</h3>
                </div>
                <div className="grid grid-cols-[1fr_1.25fr] gap-5">
                  <div>
                    <div className="mb-2 text-xs text-slate-400">Accent Color</div>
                    <div className="flex flex-wrap gap-2">
                      {accentThemes.map((accent) => (
                        <button
                          aria-label={accent.label}
                          className={`grid h-7 w-7 place-items-center rounded-full border transition ${
                            draft.theme.accentColor === accent.id ? "border-white/80" : "border-white/10"
                          }`}
                          key={accent.id}
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              theme: { ...current.theme, accentColor: accent.id },
                            }))
                          }
                          type="button"
                        >
                          <span className={`h-5 w-5 rounded-full ${accent.className}`} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 text-xs text-slate-400">Background Theme</div>
                    <div className="grid grid-cols-3 gap-2">
                      {backgroundThemes.map((theme) => (
                        <button
                          aria-label={theme.label}
                          className={`relative h-24 overflow-hidden rounded-xl border bg-gradient-to-br ${theme.previewClassName} ${
                            draft.theme.backgroundTheme === theme.id ? "border-sky-300/70" : "border-white/10"
                          }`}
                          key={theme.id}
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              theme: { ...current.theme, backgroundTheme: theme.id },
                            }))
                          }
                          type="button"
                        >
                          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 pb-2 pt-7 text-left">
                            <span className="block text-[10px] font-medium text-white/90">{theme.label}</span>
                          </span>
                          {draft.theme.backgroundTheme === theme.id ? (
                            <span className="absolute bottom-2 right-2 grid h-5 w-5 place-items-center rounded-full bg-sky-400 text-white">
                              <Check className="h-3.5 w-3.5" />
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section
                className="scroll-mt-4 rounded-2xl border border-white/8 bg-white/[0.025] p-4"
                onFocusCapture={() => handleSectionFocus("integrations")}
                ref={integrationsSectionRef}
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Plug className="h-4 w-4 text-sky-300" />
                      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-200">Connected Tools</h3>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Statuses stay conservative until each connector can be verified.</p>
                  </div>
                  <span className="rounded-full border border-amber-300/20 bg-amber-300/8 px-2.5 py-1 text-xs text-amber-200">
                    Setup pending
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {integrations.map((connection) => (
                    <IntegrationTile connection={connection} key={connection.id} onAction={handleIntegrationAction} />
                  ))}
                </div>
              </section>
            </div>
          </main>
        </div>

        <footer className="flex items-center gap-3 border-t border-white/8 px-5 py-4">
          <button
            className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-4 text-sm text-slate-200 transition hover:border-white/18 hover:bg-white/[0.06]"
            onClick={resetDefaults}
            type="button"
          >
            <RotateCcw className="h-4 w-4" />
            Reset to Defaults
          </button>
          <div className="min-w-0 flex-1 truncate text-xs text-slate-500">{message}</div>
          <span className="rounded-full border border-emerald-300/20 bg-emerald-300/8 px-3 py-1 text-xs text-emerald-200">
            {saving ? "Saving..." : "Autosaved"}
          </span>
        </footer>
      </section>
      {setupConnection ? (
        <IntegrationSetupDialog
          accountEmail={draft.accountEmail}
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
