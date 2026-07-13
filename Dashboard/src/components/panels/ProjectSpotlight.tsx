import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  ChevronRight,
  Circle,
  ExternalLink,
  ListChecks,
  Pause,
  Pin,
  Play,
  Star,
  X,
} from "lucide-react";
import {
  getCurrentSpotlight,
  getProjectById,
  getProjectEvents,
  getProjectTasks,
  loadSpotlightPreferences,
  progressText,
  projectRegistry,
  saveSpotlightPreferences,
  type SpotlightPreferences,
} from "../../data/projectSpotlightData";
import { fetchVaultProjects, mergeProjectRegistry, PROJECT_REGISTRY_UPDATED_MESSAGE } from "../../data/vaultProjects";
import { MOTION_TIMING } from "../../data/motionSystem";
import type { FocusTimerController } from "../../hooks/useFocusTimer";
import type { Project, RcfCalendarItem, SpotlightProgress, SpotlightSourceStatus, SpotlightViewModel } from "../../types";
import { Panel } from "../ui/Panel";

// Fetched once per mount and merged with the static registry so a new
// Project Registry/*.md note appears as a selectable Spotlight project after reload,
// with no code edit.
function useProjectRegistry(): Project[] {
  const [registry, setRegistry] = useState<Project[]>(projectRegistry);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void fetchVaultProjects().then((records) => {
        if (!cancelled) setRegistry(mergeProjectRegistry(projectRegistry, records));
      });
    };
    const handleRegistryUpdate = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.data?.type === PROJECT_REGISTRY_UPDATED_MESSAGE) refresh();
    };
    refresh();
    window.addEventListener("message", handleRegistryUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener("message", handleRegistryUpdate);
    };
  }, []);

  return registry;
}

type ProjectSpotlightProps = {
  calendarItems?: RcfCalendarItem[];
  focusTimer: FocusTimerController;
  onExpand?: () => void;
  today?: string;
};

// Exported for the ProjectsWorkspace "Spotlight this" action — dispatching this
// event with the new preferences keeps every mounted Spotlight instance in sync.
export const SPOTLIGHT_PREFERENCES_EVENT = "horizon-spotlight-preferences-updated";

const accentClasses: Record<Project["accentColor"], { bar: string; border: string; glow: string; text: string }> = {
  amber: {
    bar: "bg-amber-300",
    border: "border-amber-300/25",
    glow: "shadow-[0_0_22px_rgba(251,191,36,0.14)]",
    text: "text-amber-200",
  },
  cyan: {
    bar: "bg-cyan-300",
    border: "border-cyan-300/25",
    glow: "shadow-[0_0_22px_rgba(103,232,249,0.14)]",
    text: "text-cyan-200",
  },
  emerald: {
    bar: "bg-emerald-300",
    border: "border-emerald-300/25",
    glow: "shadow-[0_0_22px_rgba(110,231,183,0.14)]",
    text: "text-emerald-200",
  },
  rose: {
    bar: "bg-rose-300",
    border: "border-rose-300/25",
    glow: "shadow-[0_0_22px_rgba(253,164,175,0.14)]",
    text: "text-rose-200",
  },
  sky: {
    bar: "bg-sky-400",
    border: "border-sky-300/25",
    glow: "shadow-[0_0_22px_rgba(56,189,248,0.14)]",
    text: "text-sky-200",
  },
  slate: {
    bar: "bg-slate-300",
    border: "border-slate-300/20",
    glow: "shadow-[0_0_22px_rgba(148,163,184,0.12)]",
    text: "text-slate-200",
  },
  violet: {
    bar: "bg-violet-300",
    border: "border-violet-300/25",
    glow: "shadow-[0_0_22px_rgba(196,181,253,0.14)]",
    text: "text-violet-200",
  },
};

function sourceTone(status: SpotlightSourceStatus["status"]) {
  if (status === "ready") return "bg-emerald-400 text-emerald-200";
  if (status === "stale") return "bg-amber-300 text-amber-200";
  if (status === "missing") return "bg-amber-300 text-amber-200";
  return "bg-slate-500 text-slate-400";
}

function AutoModeToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      aria-label={active ? "Turn off automatic project spotlight" : "Turn on automatic project spotlight"}
      aria-pressed={active}
      className={`flex-none rounded-full border px-2 py-1 text-[11px] uppercase tracking-[0.1em] transition ${
        active
          ? "border-emerald-300/36 bg-emerald-300/10 text-emerald-200 shadow-[0_0_18px_rgba(52,211,153,0.18)] hover:bg-emerald-300/14"
          : "border-white/10 bg-white/[0.025] text-slate-500 hover:border-emerald-300/22 hover:text-slate-300"
      }`}
      onClick={onToggle}
      type="button"
    >
      {active ? "Auto" : "Manual"}
    </button>
  );
}

function ProgressBlock({ accent, progress }: { accent: Project["accentColor"]; progress?: SpotlightProgress }) {
  if (!progress || progress.type === "none") {
    return null;
  }

  const text = progressText(progress);
  const accentClass = accentClasses[accent] ?? accentClasses.sky;
  const progressLabel = progress.type === "percent" ? progress.label ?? "Progress" : text;

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
        <span className="truncate">{progressLabel}</span>
        {progress.type === "percent" && typeof progress.value === "number" ? <span>{progress.value}%</span> : null}
      </div>
      {progress.type === "percent" && typeof progress.value === "number" ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-700/70">
          <div className={`h-full rounded-full ${accentClass.bar}`} style={{ width: `${progress.value}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function ProjectCover({ project }: { project: Project }) {
  const accent = accentClasses[project.accentColor] ?? accentClasses.sky;

  return (
    <div
      className={`grid aspect-[4/5] place-items-center overflow-hidden rounded-xl border bg-[radial-gradient(circle_at_50%_24%,rgba(56,189,248,0.18),transparent_28%),linear-gradient(145deg,#07111d,#10243a)] ${accent.border} ${accent.glow}`}
    >
      <div className="px-2 text-center">
        <div className={`text-[10px] uppercase tracking-[0.32em] ${accent.text}`}>{project.coverKicker ?? project.category}</div>
        <div className="mt-2 text-sm font-medium uppercase tracking-[0.14em] text-white">{project.coverLabel ?? project.name}</div>
      </div>
    </div>
  );
}

function updatePreferences(next: SpotlightPreferences) {
  saveSpotlightPreferences(next);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<SpotlightPreferences>(SPOTLIGHT_PREFERENCES_EVENT, { detail: next }));
  }
  return next;
}

type ProjectSpotlightExpandedWorkspaceProps = {
  calendarItems?: RcfCalendarItem[];
  focusTimer: FocusTimerController;
  onClose: () => void;
  today?: string;
};

export function ProjectSpotlight({ calendarItems = [], focusTimer, onExpand, today }: ProjectSpotlightProps) {
  const [preferences, setPreferences] = useState<SpotlightPreferences>(() => loadSpotlightPreferences());
  const [expanded, setExpanded] = useState(false);
  const [closingExpanded, setClosingExpanded] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const closeTimerRef = useRef<number | null>(null);
  const cardButtonRef = useRef<HTMLButtonElement | null>(null);
  const registry = useProjectRegistry();

  const spotlight = useMemo(
    () =>
      getCurrentSpotlight({
        calendarItems,
        focusPresetLabel: focusTimer.currentPreset.label,
        manualProjectId: preferences.manualProjectId,
        pinnedProjectId: preferences.pinnedProjectId,
        registry,
        snoozedProjectIds: preferences.snoozedProjectIds,
        today,
      }),
    [calendarItems, focusTimer.currentPreset.label, preferences.manualProjectId, preferences.pinnedProjectId, preferences.snoozedProjectIds, registry, today],
  );
  const project = getProjectById(spotlight.projectId, registry) ?? registry[0];
  const projectTasks = getProjectTasks(project.id, registry);
  const projectEvents = getProjectEvents(project.id, calendarItems, today, registry);
  const pinned = preferences.pinnedProjectId === project.id;
  const autoMode = !preferences.manualProjectId && !preferences.pinnedProjectId;
  const focusActionRunning = spotlight.primaryButton.action === "start_focus_session" && focusTimer.isRunning && focusTimer.mode === "focus";
  const accent = accentClasses[project.accentColor] ?? accentClasses.sky;

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    function handlePreferences(event: Event) {
      const next = (event as CustomEvent<SpotlightPreferences>).detail;
      if (next) {
        setPreferences(next);
      }
    }

    window.addEventListener(SPOTLIGHT_PREFERENCES_EVENT, handlePreferences);
    return () => window.removeEventListener(SPOTLIGHT_PREFERENCES_EVENT, handlePreferences);
  }, []);

  useEffect(() => {
    if (!expanded) return undefined;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeExpanded();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [expanded]);

  function savePreferences(next: SpotlightPreferences) {
    setPreferences(updatePreferences(next));
  }

  function selectProject(projectId: string) {
    savePreferences({
      ...preferences,
      manualProjectId: projectId,
    });
    setActionMessage("Manual spotlight selected.");
  }

  function toggleAutoMode() {
    if (autoMode) {
      savePreferences({
        ...preferences,
        manualProjectId: project.id,
      });
      setActionMessage("Auto spotlight paused.");
      return;
    }

    savePreferences({
      ...preferences,
      manualProjectId: null,
      pinnedProjectId: null,
    });
    setActionMessage("Auto spotlight resumed.");
  }

  function togglePin() {
    savePreferences({
      ...preferences,
      pinnedProjectId: pinned ? null : project.id,
      manualProjectId: pinned ? preferences.manualProjectId : project.id,
    });
    setActionMessage(pinned ? "Project unpinned." : "Project pinned.");
  }

  function snoozeToday() {
    const snoozed = new Set(preferences.snoozedProjectIds ?? []);
    snoozed.add(project.id);
    savePreferences({
      ...preferences,
      manualProjectId: preferences.manualProjectId === project.id ? null : preferences.manualProjectId,
      pinnedProjectId: preferences.pinnedProjectId === project.id ? null : preferences.pinnedProjectId,
      snoozedProjectIds: [...snoozed],
    });
    setActionMessage("Project snoozed for this session.");
    closeExpanded();
  }

  function executePrimaryAction() {
    if (spotlight.primaryButton.action === "start_focus_session") {
      if (focusActionRunning) {
        focusTimer.pauseTimer();
        setActionMessage("Focus session paused.");
        return;
      }
      if (focusTimer.mode !== "focus") {
        focusTimer.resetTimer();
      }
      focusTimer.startTimer();
      setActionMessage("Focus session started.");
      return;
    }

    if (spotlight.primaryButton.action === "open_research") {
      setActionMessage("Research workspace is waiting for sources.");
      return;
    }

    if (spotlight.primaryButton.action === "open_task_list") {
      setActionMessage("Task review will route here once tasks are live.");
      return;
    }

    setActionMessage("Workspace route is ready for the next integration pass.");
  }

  function openExpanded() {
    if (onExpand) {
      onExpand();
      return;
    }
    setClosingExpanded(false);
    setExpanded(true);
  }

  function closeExpanded() {
    if (closingExpanded) return;
    setClosingExpanded(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setExpanded(false);
      setClosingExpanded(false);
      cardButtonRef.current?.focus();
    }, MOTION_TIMING.overlayExitMs);
  }

  return (
    <>
      <Panel className="p-4">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Star className="h-5 w-5 text-amber-300" />
            <h2 className="min-w-0 truncate text-sm font-semibold uppercase tracking-[0.16em] text-white">Project Spotlight</h2>
          </div>
          <AutoModeToggle active={autoMode} onToggle={toggleAutoMode} />
        </header>

        <div className="project-spotlight-summary grid grid-cols-[92px_minmax(0,1fr)] gap-4">
          <ProjectCover project={project} />

          <div className="min-w-0">
            <button
              className="group block max-w-full text-left"
              onClick={openExpanded}
              ref={cardButtonRef}
              type="button"
            >
              <h3 className="truncate text-xl font-medium text-white group-hover:text-sky-100">{spotlight.name}</h3>
              <p className="mt-1 truncate text-sm text-slate-400">{spotlight.subtitle}</p>
            </button>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {spotlight.phaseLabel ? (
                <span className={`rounded-full border ${accent.border} bg-white/[0.035] px-2 py-0.5 text-[11px] ${accent.text}`}>
                  {spotlight.phaseLabel}
                </span>
              ) : null}
              {pinned ? (
                <span className="rounded-full border border-amber-300/20 bg-amber-300/8 px-2 py-0.5 text-[11px] text-amber-200">
                  Pinned
                </span>
              ) : null}
            </div>
            <ProgressBlock accent={project.accentColor} progress={spotlight.progress} />
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.025] p-3">
          <p className="text-xs leading-relaxed text-slate-400">{spotlight.reason}</p>
          <div className="mt-3 border-t border-white/8 pt-3">
            <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Next</div>
            <div className="mt-1 text-sm font-medium text-white">{spotlight.nextAction.label}</div>
            <div className="mt-1 text-xs text-slate-500">{spotlight.contextLine}</div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            className={`flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium text-white transition ${accent.border} bg-white/[0.055] hover:bg-white/[0.08]`}
            onClick={executePrimaryAction}
            type="button"
          >
            {spotlight.primaryButton.action === "start_focus_session" ? (
              focusActionRunning ? <Pause className="h-4 w-4 fill-white" /> : <Play className="h-4 w-4 fill-white" />
            ) : <ExternalLink className="h-4 w-4" />}
            <span className="truncate">
              {focusActionRunning ? spotlight.primaryButton.label.replace(/^Start/, "Pause") : spotlight.primaryButton.label}
            </span>
          </button>
          <button
            aria-label={pinned ? "Unpin project" : "Pin project"}
            className={`grid h-10 w-10 place-items-center rounded-xl border transition ${
              pinned
                ? "border-amber-300/35 bg-amber-300/10 text-amber-200"
                : "border-white/10 bg-white/[0.035] text-slate-300 hover:border-sky-300/30 hover:text-sky-200"
            }`}
            onClick={togglePin}
            type="button"
          >
            <Pin className="h-4 w-4" />
          </button>
          <button
            aria-label="Expand project"
            className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.035] text-slate-300 transition hover:border-sky-300/30 hover:text-sky-200"
            onClick={openExpanded}
            type="button"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {spotlight.candidateDots?.map((dot) => (
              <button
                aria-label={`Show ${dot.label}`}
                aria-current={dot.active ? "true" : undefined}
                className="grid h-5 w-5 place-items-center rounded-full transition hover:bg-white/[0.04]"
                key={dot.projectId}
                onClick={() => selectProject(dot.projectId)}
                title={dot.label}
                type="button"
              >
                <span className={`h-2 w-2 rounded-full ${dot.active ? "bg-sky-400" : "bg-slate-700"}`} />
              </button>
            ))}
          </div>
          <div className="min-w-0 truncate text-xs text-slate-500">
            {actionMessage || `${registry.length} projects · ${autoMode ? "ranked automatically" : "manual Spotlight"}`}
          </div>
        </div>
      </Panel>

      {expanded && typeof document !== "undefined"
        ? createPortal(
            <ExpandedSpotlight
              closing={closingExpanded}
              onClose={closeExpanded}
              onPrimaryAction={executePrimaryAction}
              onSelectProject={selectProject}
              onSnooze={snoozeToday}
              onTogglePin={togglePin}
              autoMode={autoMode}
              focusActionRunning={focusActionRunning}
              onToggleAuto={toggleAutoMode}
              pinned={pinned}
              project={project}
              projectEvents={projectEvents}
              projectTasks={projectTasks}
              registry={registry}
              spotlight={spotlight}
            />,
            document.body,
          )
        : null}
    </>
  );
}

export function ProjectSpotlightExpandedWorkspace({ calendarItems = [], focusTimer, onClose, today }: ProjectSpotlightExpandedWorkspaceProps) {
  const [preferences, setPreferences] = useState<SpotlightPreferences>(() => loadSpotlightPreferences());
  const [actionMessage, setActionMessage] = useState("");
  const registry = useProjectRegistry();

  const spotlight = useMemo(
    () =>
      getCurrentSpotlight({
        calendarItems,
        focusPresetLabel: focusTimer.currentPreset.label,
        manualProjectId: preferences.manualProjectId,
        pinnedProjectId: preferences.pinnedProjectId,
        registry,
        snoozedProjectIds: preferences.snoozedProjectIds,
        today,
      }),
    [calendarItems, focusTimer.currentPreset.label, preferences.manualProjectId, preferences.pinnedProjectId, preferences.snoozedProjectIds, registry, today],
  );
  const project = getProjectById(spotlight.projectId, registry) ?? registry[0];
  const projectTasks = getProjectTasks(project.id, registry);
  const projectEvents = getProjectEvents(project.id, calendarItems, today, registry);
  const pinned = preferences.pinnedProjectId === project.id;
  const autoMode = !preferences.manualProjectId && !preferences.pinnedProjectId;
  const focusActionRunning = spotlight.primaryButton.action === "start_focus_session" && focusTimer.isRunning && focusTimer.mode === "focus";

  useEffect(() => {
    function handlePreferences(event: Event) {
      const next = (event as CustomEvent<SpotlightPreferences>).detail;
      if (next) {
        setPreferences(next);
      }
    }

    window.addEventListener(SPOTLIGHT_PREFERENCES_EVENT, handlePreferences);
    return () => window.removeEventListener(SPOTLIGHT_PREFERENCES_EVENT, handlePreferences);
  }, []);

  function savePreferences(next: SpotlightPreferences) {
    setPreferences(updatePreferences(next));
  }

  function selectProject(projectId: string) {
    savePreferences({
      ...preferences,
      manualProjectId: projectId,
    });
    setActionMessage("Manual spotlight selected.");
  }

  function toggleAutoMode() {
    if (autoMode) {
      savePreferences({
        ...preferences,
        manualProjectId: project.id,
      });
      setActionMessage("Auto spotlight paused.");
      return;
    }

    savePreferences({
      ...preferences,
      manualProjectId: null,
      pinnedProjectId: null,
    });
    setActionMessage("Auto spotlight resumed.");
  }

  function togglePin() {
    savePreferences({
      ...preferences,
      pinnedProjectId: pinned ? null : project.id,
      manualProjectId: pinned ? preferences.manualProjectId : project.id,
    });
    setActionMessage(pinned ? "Project unpinned." : "Project pinned.");
  }

  function snoozeToday() {
    const snoozed = new Set(preferences.snoozedProjectIds ?? []);
    snoozed.add(project.id);
    savePreferences({
      ...preferences,
      manualProjectId: preferences.manualProjectId === project.id ? null : preferences.manualProjectId,
      pinnedProjectId: preferences.pinnedProjectId === project.id ? null : preferences.pinnedProjectId,
      snoozedProjectIds: [...snoozed],
    });
    setActionMessage("Project snoozed for this session.");
    onClose();
  }

  function executePrimaryAction() {
    if (spotlight.primaryButton.action === "start_focus_session") {
      if (focusActionRunning) {
        focusTimer.pauseTimer();
        setActionMessage("Focus session paused.");
        return;
      }
      if (focusTimer.mode !== "focus") {
        focusTimer.resetTimer();
      }
      focusTimer.startTimer();
      setActionMessage("Focus session started.");
      return;
    }

    if (spotlight.primaryButton.action === "open_research") {
      setActionMessage("Research workspace is waiting for sources.");
      return;
    }

    if (spotlight.primaryButton.action === "open_task_list") {
      setActionMessage("Task review will route here once tasks are live.");
      return;
    }

    setActionMessage("Workspace route is ready for the next integration pass.");
  }

  return (
    <div>
      <ExpandedSpotlight
        closing={false}
        onClose={onClose}
        onPrimaryAction={executePrimaryAction}
        onSelectProject={selectProject}
        onSnooze={snoozeToday}
        onTogglePin={togglePin}
        autoMode={autoMode}
        focusActionRunning={focusActionRunning}
        onToggleAuto={toggleAutoMode}
        pinned={pinned}
        project={project}
        projectEvents={projectEvents}
        projectTasks={projectTasks}
        registry={registry}
        spotlight={spotlight}
        workspace
      />
      {actionMessage ? <div className="mt-3 truncate text-xs text-slate-500">{actionMessage}</div> : null}
    </div>
  );
}

function ExpandedSpotlight({
  autoMode,
  closing,
  focusActionRunning,
  onClose,
  onPrimaryAction,
  onSelectProject,
  onSnooze,
  onToggleAuto,
  onTogglePin,
  pinned,
  project,
  projectEvents,
  projectTasks,
  registry,
  spotlight,
  workspace = false,
}: {
  autoMode: boolean;
  closing: boolean;
  focusActionRunning: boolean;
  onClose: () => void;
  onPrimaryAction: () => void;
  onSelectProject: (projectId: string) => void;
  onSnooze: () => void;
  onToggleAuto: () => void;
  onTogglePin: () => void;
  pinned: boolean;
  project: Project;
  projectEvents: ReturnType<typeof getProjectEvents>;
  projectTasks: ReturnType<typeof getProjectTasks>;
  registry: Project[];
  spotlight: SpotlightViewModel;
  workspace?: boolean;
}) {
  const accent = accentClasses[project.accentColor] ?? accentClasses.sky;

  const panel = (
    <section
      aria-label="Expanded project spotlight"
      aria-modal={workspace ? undefined : true}
      className={
        workspace
          ? "project-spotlight-expanded-panel flex min-h-[560px] flex-col overflow-hidden rounded-[18px] border border-sky-300/20 bg-[#081421]/96 shadow-panel backdrop-blur-xl"
          : `spotlight-expanded-panel fixed right-6 top-6 flex max-h-[calc(100vh-48px)] w-[760px] max-w-[calc(100vw-308px)] flex-col overflow-hidden rounded-[18px] border border-sky-300/20 bg-[#081421]/96 shadow-[0_28px_90px_rgba(0,0,0,0.38)] backdrop-blur-xl ${
              closing ? "spotlight-expanded-panel-closing" : ""
            }`
      }
      role={workspace ? undefined : "dialog"}
    >
      <header className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-5">
          <div className="flex min-w-0 gap-4">
            <div className="w-20 shrink-0">
              <ProjectCover project={project} />
            </div>
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <AutoModeToggle active={autoMode} onToggle={onToggleAuto} />
                <span className={`rounded-full border ${accent.border} bg-white/[0.035] px-2.5 py-1 text-[11px] ${accent.text}`}>
                  {project.phase ?? "Active"}
                </span>
              </div>
              <h2 className="truncate text-2xl font-semibold text-white">{spotlight.name}</h2>
              <p className="mt-1 text-sm text-slate-400">{spotlight.subtitle}</p>
            </div>
          </div>
          <button
            aria-label="Close expanded project spotlight"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/12 bg-white/[0.035] text-slate-300 transition hover:border-sky-300/30 hover:text-white"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <main className="min-h-0 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-[minmax(0,1fr)_260px] gap-4">
            <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Current Mission</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">{project.summary}</p>
              <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.025] p-3">
                <div className="text-xs text-slate-500">{spotlight.reason}</div>
                <div className="mt-3 text-[11px] uppercase tracking-[0.14em] text-slate-500">Next Action</div>
                <div className="mt-1 text-base font-medium text-white">{spotlight.nextAction.label}</div>
                <div className="mt-1 text-xs text-slate-500">{spotlight.contextLine}</div>
              </div>
            </section>

            <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Progress</h3>
              <ProgressBlock accent={project.accentColor} progress={spotlight.progress} />
              <button
                className={`mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium text-white transition ${accent.border} bg-white/[0.055] hover:bg-white/[0.08]`}
                onClick={onPrimaryAction}
                type="button"
              >
                {spotlight.primaryButton.action === "start_focus_session" ? (
                  focusActionRunning ? <Pause className="h-4 w-4 fill-white" /> : <Play className="h-4 w-4 fill-white" />
                ) : <ExternalLink className="h-4 w-4" />}
                {focusActionRunning ? spotlight.primaryButton.label.replace(/^Start/, "Pause") : spotlight.primaryButton.label}
              </button>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  className="h-9 rounded-lg border border-white/10 bg-white/[0.035] text-xs text-slate-200 transition hover:border-sky-300/30 hover:bg-sky-400/8"
                  onClick={onTogglePin}
                  type="button"
                >
                  {pinned ? "Unpin" : "Pin"}
                </button>
                <button
                  className="h-9 rounded-lg border border-white/10 bg-white/[0.035] text-xs text-slate-200 transition hover:border-amber-300/30 hover:bg-amber-300/8"
                  onClick={onSnooze}
                  type="button"
                >
                  Snooze
                </button>
              </div>
            </section>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-4">
            <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
              <div className="mb-3 flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-sky-300" />
                <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Next Actions</h3>
              </div>
              <div className="grid gap-2">
                {projectTasks.length ? (
                  projectTasks.map((task) => (
                    <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3" key={task.id}>
                      <div className="text-sm text-white">{task.title}</div>
                      <div className="mt-1 text-xs text-slate-500">{task.priority} priority</div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-500">No structured tasks linked yet.</div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
              <div className="mb-3 flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-sky-300" />
                <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Upcoming</h3>
              </div>
              <div className="grid gap-2">
                {projectEvents.length ? (
                  projectEvents.map((event) => (
                    <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3" key={event.id}>
                      <div className="text-sm text-white">{event.title}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {event.startTime} - {event.endTime}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-500">No calendar blocks linked yet.</div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Sources</h3>
              <div className="grid gap-2">
                {spotlight.sourceStatus?.map((source) => (
                  <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3" key={source.label}>
                    <div className="flex items-center gap-2">
                      <Circle className={`h-2.5 w-2.5 fill-current ${sourceTone(source.status)}`} />
                      <div className="text-sm text-white">{source.label}</div>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{source.detail}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="mt-4 rounded-2xl border border-white/8 bg-white/[0.025] p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Switch Spotlight</h3>
            <div className="grid grid-cols-5 gap-2">
              {registry.map((candidate) => (
                <button
                  className={`min-h-14 rounded-xl border px-3 text-left text-xs transition ${
                    candidate.id === project.id
                      ? "border-sky-300/35 bg-sky-400/10 text-sky-100"
                      : "border-white/10 bg-white/[0.025] text-slate-400 hover:border-white/18 hover:text-slate-100"
                  }`}
                  key={candidate.id}
                  onClick={() => onSelectProject(candidate.id)}
                  title={`Spotlight ${candidate.name}`}
                  type="button"
                >
                  {candidate.name}
                </button>
              ))}
            </div>
          </section>
        </main>
      </section>
  );

  if (workspace) {
    return panel;
  }

  return (
    <div className="fixed inset-0 z-[80]">
      <button
        aria-label="Close expanded project spotlight"
        className={`spotlight-expanded-scrim absolute inset-0 cursor-default bg-black/20 ${
          closing ? "spotlight-expanded-scrim-closing" : ""
        }`}
        onClick={onClose}
        type="button"
      />
      {panel}
    </div>
  );
}
