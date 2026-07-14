import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppDock } from "./components/layout/AppDock";
import { Header } from "./components/layout/Header";
import { HorizonBackground } from "./components/layout/HorizonBackground";
import { HorizonBoot } from "./components/layout/HorizonBoot";
import { Sidebar } from "./components/layout/Sidebar";
import { StatusRow } from "./components/layout/StatusRow";
import { CaptureBar } from "./components/panels/CaptureBar";
import { CaptureQueuePanel, type CaptureQueueItem } from "./components/panels/CaptureQueuePanel";
import { CaptureWorkspace } from "./components/panels/CaptureWorkspace";
import { CaptureSweep, type PileItem } from "./components/panels/CaptureSweep";
import { ProjectsWorkspace } from "./components/panels/ProjectsWorkspace";
import { SandboxWorkspace } from "./components/panels/SandboxWorkspace";
import { DevelopmentSandboxWorkspace } from "./components/panels/DevelopmentSandboxWorkspace";
import { ExpandedCalendar } from "./components/panels/ExpandedCalendar";
import { FileBrowserPanel } from "./components/panels/FileBrowserPanel";
import { FocusPanel } from "./components/panels/FocusPanel";
import { FocusWorkspace } from "./components/panels/FocusWorkspace";
import { ResearchWorkspace } from "./components/panels/ResearchWorkspace";
import { ProfileCustomizer } from "./components/panels/ProfileCustomizer";
import { ProjectSpotlight, ProjectSpotlightExpandedWorkspace } from "./components/panels/ProjectSpotlight";
import { SettingsPanel } from "./components/panels/SettingsPanel";
import { FirstRunWizard, FIRST_RUN_REPLAY_EVENT, hasCompletedFirstRun } from "./components/panels/FirstRunWizard";
import { TodayPanel } from "./components/panels/TodayPanel";
import { FOCUS_PRESETS, type FocusPhaseTransition, useFocusTimer } from "./hooks/useFocusTimer";
import { useCalendarItems } from "./hooks/useCalendarItems";
import { loadIntegrationConnections, loadProfileSettings, saveIntegrationConnections, saveProfileSettings } from "./data/profile";
import { APP_SETTINGS_STORAGE_KEY, APP_SETTINGS_UPDATED_EVENT, loadAppSettings, saveAppSettings, type AppSettings } from "./data/appSettings";
import { MOTION_TIMING } from "./data/motionSystem";
import { saveUpdateCheckSnapshot, type UpdateCheckSnapshot } from "./data/updateStatus";
import type { FileBrowserSourceId, HorizonView, IntegrationConnection, ProfileSettings, SettingsOpenTarget } from "./types";
import {
  playFocusStartSound,
  playFocusTransitionSound,
  playLaunchSound,
  showLaunchNotification,
  showFocusTransitionNotification,
  warmFocusAudio,
} from "./utils/focusFeedback";
import { currentHorizonVaultState, loadHorizonStateFromVault, saveHorizonStateToVault } from "./utils/horizonState";
import { countUpcomingExactItems, upcomingPriorityItems } from "./utils/rcfCalendar";

type WorkspaceScreen =
  | "home"
  | "calendar"
  | "spotlight"
  | "research"
  | "files"
  | "focus"
  | "capture"
  | "projects"
  | "sandbox"
  | "development-sandbox";
function bootRequestedFromUrl() {
  if (typeof window === "undefined") {
    return false;
  }

  return new URLSearchParams(window.location.search).get("boot") === "1";
}

function activeViewForWorkspace(screen: WorkspaceScreen): HorizonView {
  if (screen === "calendar") return "calendar";
  if (screen === "research") return "research";
  if (screen === "files") return "files";
  if (screen === "focus") return "focus";
  if (screen === "projects") return "projects";
  if (screen === "sandbox") return "sandbox";
  if (screen === "development-sandbox") return "development-sandbox";
  if (screen === "capture") return "workbench";
  return "home";
}

function workspaceForStartPage(startPage: ProfileSettings["workspaceDefaults"]["startPage"]): WorkspaceScreen {
  if (startPage === "focus") return "focus";
  if (startPage === "projects") return "projects";
  if (startPage === "notes") return "files";
  return "home";
}

export function App() {
  const [appSettings, setAppSettings] = useState(() => loadAppSettings());
  const calendar = useCalendarItems();
  const focusAudioRef = useRef<AudioContext | null>(null);
  const handleFocusPhaseTransition = useCallback(
    (transition: FocusPhaseTransition) => {
      void playFocusTransitionSound(focusAudioRef, transition.to, appSettings.focus.soundVolume);

      if (appSettings.notifications.desktop && appSettings.notifications.focusTransitions) {
        showFocusTransitionNotification(transition.to);
      }
    },
    [
      appSettings.focus.soundVolume,
      appSettings.notifications.desktop,
      appSettings.notifications.focusTransitions,
    ],
  );
  const handleManualFocusStart = useCallback(() => {
    void playFocusStartSound(focusAudioRef, appSettings.focus.soundVolume);
  }, [appSettings.focus.soundVolume]);
  const focusTimer = useFocusTimer({
    autoStartBreaks: appSettings.focus.autoStartBreaks,
    autoStartNextFocus: appSettings.focus.autoStartNextFocus,
    onManualStart: handleManualFocusStart,
    onPhaseTransition: handleFocusPhaseTransition,
  });
  const [profile, setProfile] = useState(() => loadProfileSettings());
  const [integrations, setIntegrations] = useState(() => loadIntegrationConnections());
  const initialWorkspaceRef = useRef<WorkspaceScreen>(workspaceForStartPage(profile.workspaceDefaults.startPage));
  const [activeView, setActiveView] = useState<HorizonView>(() => activeViewForWorkspace(initialWorkspaceRef.current));
  const [workspaceScreen, setWorkspaceScreen] = useState<WorkspaceScreen>(() => initialWorkspaceRef.current);
  const [exitingWorkspaceScreen, setExitingWorkspaceScreen] = useState<WorkspaceScreen | null>(null);
  const [workspaceTransition, setWorkspaceTransition] = useState<"idle" | "switching">("idle");
  const [focusNavigationPreference, setFocusNavigationPreference] = useState<"auto" | "collapsed" | "visible">("auto");
  const [developmentSandboxCanvasMode, setDevelopmentSandboxCanvasMode] = useState(false);
  const [captureText, setCaptureText] = useState("");
  const [captureAutoRunKey, setCaptureAutoRunKey] = useState(0);
  const [captureFocusKey, setCaptureFocusKey] = useState(0);
  const [captureQueueRefreshKey, setCaptureQueueRefreshKey] = useState(0);
  const [queuedCaptureSource, setQueuedCaptureSource] = useState<Pick<CaptureQueueItem, "id" | "path" | "title"> | null>(null);
  // The capture motion-layer hosts either the single-capture workspace or the
  // batch sweep. captureMode picks which; no new screen/route/transition is introduced.
  const [captureMode, setCaptureMode] = useState<"single" | "sweep">("single");
  const [sweepRefreshKey, setSweepRefreshKey] = useState(0);
  const [activeSourceId, setActiveSourceId] = useState<FileBrowserSourceId>("local");
  const [profileCustomizerOpen, setProfileCustomizerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTarget, setSettingsTarget] = useState<SettingsOpenTarget | undefined>();
  const [firstRunOpen, setFirstRunOpen] = useState(() => !hasCompletedFirstRun());
  const [calendarReviewFocusKey, setCalendarReviewFocusKey] = useState(0);
  const [calendarPriorityFocusKey, setCalendarPriorityFocusKey] = useState(0);
  const [calendarEventFocusKey, setCalendarEventFocusKey] = useState(0);
  const [profileStatus, setProfileStatus] = useState<"Synced" | "Saving..." | "Offline changes" | "Needs attention">("Synced");
  const [stageHeight, setStageHeight] = useState<number | null>(null);
  const [horizonStateReady, setHorizonStateReady] = useState(false);
  const mainShellRef = useRef<HTMLElement | null>(null);
  const homeShellRef = useRef<HTMLElement | null>(null);
  const bootHasPlayedRef = useRef(false);
  const launchSoundRequestedRef = useRef(true);
  const launchNotificationShownRef = useRef(false);
  const launchFromBootQueryRef = useRef(bootRequestedFromUrl());
  const workspaceRef = useRef<HTMLElement | null>(null);
  const homeWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const calendarWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const spotlightWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const researchWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const fileWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const focusWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const captureWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const projectsWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const sandboxWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const developmentSandboxWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const captureReturnDraftRef = useRef<string | undefined>(undefined);
  const workspaceTransitionTimerRef = useRef<number | null>(null);
  const stageAnimationFrameRef = useRef<number | null>(null);
  const initialProfilePresetAppliedRef = useRef(false);
  const [bootVisible, setBootVisible] = useState(() => !appSettings.general.quietLaunch || launchFromBootQueryRef.current);
  const [bootRunKey, setBootRunKey] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  const calendarEventCount = useMemo(
    () => countUpcomingExactItems(calendar.items, calendar.today, 7),
    [calendar.items, calendar.today],
  );
  const calendarIssueCount = useMemo(
    () => calendar.items.filter((item) => item.issues.length > 0).length,
    [calendar.items],
  );
  // Live count of captures waiting to triage. Refetched
  // whenever the capture queue changes (apply/sweep/delete bump captureQueueRefreshKey).
  const [triageCount, setTriageCount] = useState(0);
  const focusStatusLabel = focusTimer.isRunning
    ? focusTimer.mode === "focus"
      ? "Focusing now"
      : "On a break"
      : "Focus ready";
  const focusNavigationCollapsed =
    (workspaceScreen === "focus" || exitingWorkspaceScreen === "focus") &&
    (focusNavigationPreference === "collapsed" ||
      (focusNavigationPreference === "auto" && focusTimer.isRunning && focusTimer.mode === "focus"));
  const navigationCollapsed = focusNavigationCollapsed || developmentSandboxCanvasMode;
  const immersiveWorkspace = workspaceScreen === "focus" || developmentSandboxCanvasMode;
  const calendarPriorityCount = useMemo(
    () => upcomingPriorityItems(calendar.items, calendar.today, 3).length,
    [calendar.items, calendar.today],
  );

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/capture/pile", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data?.ok) setTriageCount(data.counts?.total ?? 0);
      })
      .catch(() => {
        // Offline/dev: leave the count at its last value rather than flip to a wrong 0.
      });
    return () => {
      cancelled = true;
    };
  }, [captureQueueRefreshKey]);

  function clearWorkspaceTransitionTimer() {
    if (workspaceTransitionTimerRef.current !== null) {
      window.clearTimeout(workspaceTransitionTimerRef.current);
      workspaceTransitionTimerRef.current = null;
    }
  }

  function clearStageAnimationFrame() {
    if (stageAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(stageAnimationFrameRef.current);
      stageAnimationFrameRef.current = null;
    }
  }

  function measuredHeight(element: HTMLElement | null) {
    return Math.ceil(element?.offsetHeight ?? 0);
  }

  function resetViewportScroll() {
    if (mainShellRef.current && (mainShellRef.current.scrollTop !== 0 || mainShellRef.current.scrollLeft !== 0)) {
      mainShellRef.current.scrollTo({ behavior: "auto", left: 0, top: 0 });
    }

    if (homeShellRef.current && (homeShellRef.current.scrollTop !== 0 || homeShellRef.current.scrollLeft !== 0)) {
      homeShellRef.current.scrollTo({ behavior: "auto", left: 0, top: 0 });
    }

    if (window.scrollX !== 0 || window.scrollY !== 0) {
      window.scrollTo({ behavior: "auto", left: 0, top: 0 });
    }
  }

  useEffect(() => {
    const shell = homeShellRef.current;
    if (!shell || (workspaceScreen !== "research" && workspaceScreen !== "development-sandbox")) return undefined;

    const lockWorkspaceScroll = () => {
      if (shell.scrollTop !== 0) shell.scrollTop = 0;
      if (shell.scrollLeft !== 0) shell.scrollLeft = 0;
    };

    lockWorkspaceScroll();
    shell.addEventListener("scroll", lockWorkspaceScroll, { passive: true });
    return () => shell.removeEventListener("scroll", lockWorkspaceScroll);
  }, [workspaceScreen]);

  function animateStageTo(getHeight: () => number) {
    clearStageAnimationFrame();
    stageAnimationFrameRef.current = window.requestAnimationFrame(() => {
      stageAnimationFrameRef.current = null;
      const nextHeight = getHeight();
      if (nextHeight > 0) {
        setStageHeight(nextHeight);
      }
    });
  }

  function warmWorkspaceLayer(element: HTMLElement | null) {
    if (!element) return;

    element.classList.add("motion-layer-prewarming");
    void element.offsetHeight;

    const imageDecodes = Array.from(element.querySelectorAll("img")).map((image) =>
      image.decode?.().catch(() => undefined),
    );
    let deadlineTimer = 0;
    const decodeDeadline = new Promise<void>((resolve) => {
      deadlineTimer = window.setTimeout(resolve, 650);
    });

    // A stale integration image must never leave every hidden workspace visibly prewarmed.
    // Give decoding a short head start, then release the layer regardless of network state.
    void Promise.race([Promise.allSettled(imageDecodes), decodeDeadline]).finally(() => {
      window.clearTimeout(deadlineTimer);
      // Do not depend on animation frames for cleanup: Chromium pauses them in a hidden or
      // minimized window, which previously left every workspace awake indefinitely.
      void element.getBoundingClientRect();
      element.classList.remove("motion-layer-prewarming");
    });
  }

  function resetWorkspaceToHome() {
    clearWorkspaceTransitionTimer();
    clearStageAnimationFrame();
    setActiveView("home");
    setWorkspaceScreen("home");
    setExitingWorkspaceScreen(null);
    setWorkspaceTransition("idle");
    setStageHeight(null);
  }

  function switchWorkspace(nextScreen: WorkspaceScreen) {
    if (workspaceScreen === nextScreen && !exitingWorkspaceScreen && workspaceTransition === "idle") {
      return;
    }

    clearWorkspaceTransitionTimer();
    clearStageAnimationFrame();
    resetViewportScroll();

    const currentHeight = measuredHeight(workspaceRef.current);
    if (currentHeight > 0) {
      setStageHeight(currentHeight);
    }

    setExitingWorkspaceScreen(workspaceScreen);
    setWorkspaceScreen(nextScreen);
    setActiveView(activeViewForWorkspace(nextScreen));
    setWorkspaceTransition("switching");
    animateStageTo(() => {
      if (nextScreen === "calendar") return measuredHeight(calendarWorkspaceRef.current);
      if (nextScreen === "spotlight") return measuredHeight(spotlightWorkspaceRef.current);
      if (nextScreen === "research") return measuredHeight(researchWorkspaceRef.current);
      if (nextScreen === "files") return measuredHeight(fileWorkspaceRef.current);
      if (nextScreen === "focus") return measuredHeight(focusWorkspaceRef.current);
      if (nextScreen === "capture") return measuredHeight(captureWorkspaceRef.current);
      if (nextScreen === "projects") return measuredHeight(projectsWorkspaceRef.current);
      if (nextScreen === "sandbox") return measuredHeight(sandboxWorkspaceRef.current);
      if (nextScreen === "development-sandbox") return measuredHeight(developmentSandboxWorkspaceRef.current);
      return measuredHeight(homeWorkspaceRef.current);
    });

    workspaceTransitionTimerRef.current = window.setTimeout(() => {
      setExitingWorkspaceScreen(null);
      setWorkspaceTransition("idle");
      setStageHeight(null);
      if (nextScreen !== "focus") {
        setFocusNavigationPreference("auto");
      }
      if (nextScreen !== "development-sandbox") {
        setDevelopmentSandboxCanvasMode(false);
      }
      workspaceTransitionTimerRef.current = null;
    }, MOTION_TIMING.workspaceMs);
  }

  function showWorkspace(nextScreen: WorkspaceScreen) {
    if (workspaceScreen === "capture" && nextScreen !== "capture") {
      const returnDraft = captureReturnDraftRef.current;
      captureReturnDraftRef.current = undefined;
      if (returnDraft !== undefined) {
        setCaptureText(returnDraft);
      }
      setQueuedCaptureSource(null);
      setCaptureMode("single");
      setCaptureQueueRefreshKey((current) => current + 1);
    }
    switchWorkspace(nextScreen);
  }

  function openCalendar() {
    setCalendarEventFocusKey((current) => current + 1);
    showWorkspace("calendar");
  }

  // Opens the calendar focused on items that need review (the status-row "review items"
  // counter). A changing key re-triggers the focus even if the calendar is already open.
  function openCalendarReview() {
    setCalendarReviewFocusKey((current) => current + 1);
    showWorkspace("calendar");
  }

  function openCalendarPriorities() {
    setCalendarPriorityFocusKey((current) => current + 1);
    showWorkspace("calendar");
  }

  function closeCalendar() {
    showWorkspace("home");
  }

  function openSpotlight() {
    showWorkspace("spotlight");
  }

  function closeSpotlight() {
    showWorkspace("home");
  }

  function openCapture(autoRun = false) {
    captureReturnDraftRef.current = undefined;
    setCaptureMode("single");
    setQueuedCaptureSource(null);
    setCaptureFocusKey((current) => current + 1);
    showWorkspace("capture");
    if (autoRun && captureText.trim()) {
      window.setTimeout(() => setCaptureAutoRunKey((current) => current + 1), 80);
    }
  }

  function openResearchWorkbench(prefill: string) {
    captureReturnDraftRef.current = captureText;
    setCaptureText(prefill);
    setCaptureMode("single");
    setQueuedCaptureSource(null);
    setCaptureFocusKey((current) => current + 1);
    showWorkspace("capture");
  }

  function openNewProjectCapture() {
    captureReturnDraftRef.current = captureText;
    setCaptureText("Create a project for ");
    setCaptureMode("single");
    setQueuedCaptureSource(null);
    setCaptureFocusKey((current) => current + 1);
    showWorkspace("capture");
  }

  function openQueuedCapture(item: CaptureQueueItem) {
    if (captureReturnDraftRef.current === undefined) {
      captureReturnDraftRef.current = captureText;
    }
    setCaptureMode("single");
    setCaptureText(item.content.trim());
    setQueuedCaptureSource({ id: item.id, path: item.path, title: item.title });
    setCaptureFocusKey((current) => current + 1);
    showWorkspace("capture");
    window.setTimeout(() => setCaptureAutoRunKey((current) => current + 1), 120);
  }

  // Open the batch sweep inside the capture layer.
  function openSweep() {
    captureReturnDraftRef.current = captureText;
    setCaptureMode("sweep");
    setQueuedCaptureSource(null);
    setSweepRefreshKey((current) => current + 1);
    showWorkspace("capture");
  }

  // "More" on a sweep row → hand the item to the single-capture workspace. to_triage items
  // carry their source file (so apply cleans it up); queue items open as plain text.
  function openSweepItemInSingle(item: PileItem) {
    if (captureReturnDraftRef.current === undefined) {
      captureReturnDraftRef.current = captureText;
    }
    setCaptureMode("single");
    setCaptureText(item.text.trim());
    setQueuedCaptureSource(item.source === "to_triage" ? { id: item.id, path: item.path, title: item.title } : null);
    setCaptureFocusKey((current) => current + 1);
    showWorkspace("capture");
    window.setTimeout(() => setCaptureAutoRunKey((current) => current + 1), 120);
  }

  async function openNextQueuedCapture(currentId?: string) {
    try {
      const response = await fetch("/api/capture/queue", { cache: "no-store" });
      const data = (await response.json()) as { error?: string; items?: CaptureQueueItem[]; ok?: boolean };
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Capture queue could not be loaded.");
      }

      const nextItem = (data.items ?? []).find((item) => item.id !== currentId);
      setCaptureQueueRefreshKey((current) => current + 1);
      if (!nextItem) return false;

      openQueuedCapture(nextItem);
      return true;
    } catch {
      return false;
    }
  }

  async function hasNextQueuedCapture(currentId?: string) {
    try {
      const response = await fetch("/api/capture/queue", { cache: "no-store" });
      const data = (await response.json()) as { error?: string; items?: CaptureQueueItem[]; ok?: boolean };
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Capture queue could not be loaded.");
      }

      setCaptureQueueRefreshKey((current) => current + 1);
      return (data.items ?? []).some((item) => item.id !== currentId);
    } catch {
      return false;
    }
  }

  function closeCapture() {
    showWorkspace("home");
  }

  function openSettings(target?: SettingsOpenTarget) {
    setSettingsTarget(target);
    setSettingsOpen(true);
  }

  function closeSettings() {
    setSettingsOpen(false);
    setSettingsTarget(undefined);
  }

  function workspaceLayerState(screen: WorkspaceScreen) {
    if (screen === exitingWorkspaceScreen) return "leaving";
    if (screen === workspaceScreen) return workspaceTransition === "switching" ? "entering" : "idle";
    return "hidden";
  }

  function navigate(view: HorizonView, sourceId?: FileBrowserSourceId) {
    if (view === "calendar") {
      openCalendar();
      return;
    }

    if (view === "focus") {
      showWorkspace("focus");
      return;
    }

    if (view === "research") {
      showWorkspace("research");
      return;
    }

    if (view === "workbench") {
      openCapture();
      return;
    }

    if (view === "home") {
      showWorkspace("home");
      return;
    }

    if (view === "files") {
      setActiveSourceId(sourceId ?? "local");
      if (workspaceScreen === "files" && !exitingWorkspaceScreen && workspaceTransition === "idle") {
        setActiveView("files");
        return;
      }
      showWorkspace("files");
      return;
    }

    if (view === "projects") {
      showWorkspace("projects");
      return;
    }

    if (view === "sandbox") {
      showWorkspace("sandbox");
      return;
    }

    if (view === "development-sandbox") {
      showWorkspace("development-sandbox");
    }
  }

  function handleSaveProfile(nextProfile: ProfileSettings) {
    const pomodoroDefaultChanged =
      profile.workspaceDefaults.pomodoroPreset !== nextProfile.workspaceDefaults.pomodoroPreset;

    setProfileStatus("Saving...");
    saveProfileSettings(nextProfile);
    setProfile(nextProfile);

    if (
      pomodoroDefaultChanged &&
      !focusTimer.isRunning &&
      focusTimer.presetId !== nextProfile.workspaceDefaults.pomodoroPreset
    ) {
      const preset = FOCUS_PRESETS.find((item) => item.id === nextProfile.workspaceDefaults.pomodoroPreset);
      if (preset) {
        focusTimer.selectPreset(preset);
      }
    }

    window.setTimeout(() => setProfileStatus("Synced"), 300);
  }

  function handleSaveIntegration(nextConnection: IntegrationConnection) {
    setIntegrations((current) => {
      const exists = current.some((connection) => connection.id === nextConnection.id);
      const next = exists
        ? current.map((connection) => (connection.id === nextConnection.id ? nextConnection : connection))
        : [...current, nextConnection];
      saveIntegrationConnections(next);
      return next;
    });
    setProfileStatus("Synced");
  }

  useEffect(() => {
    let canceled = false;

    async function hydrateHorizonState() {
      const state = await loadHorizonStateFromVault();
      if (canceled) return;

      if (state?.appSettings) {
        saveAppSettings(state.appSettings);
        setAppSettings(state.appSettings);
      }

      if (state?.profile) {
        saveProfileSettings(state.profile);
        setProfile(state.profile);
      }

      if (state?.integrationConnections?.length) {
        saveIntegrationConnections(state.integrationConnections);
        setIntegrations(state.integrationConnections);
      }

      setHorizonStateReady(true);
    }

    void hydrateHorizonState();
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    if (!horizonStateReady) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      void saveHorizonStateToVault(currentHorizonVaultState(appSettings, profile, integrations));
    }, 250);

    return () => window.clearTimeout(timer);
  }, [appSettings, horizonStateReady, integrations, profile]);

  useEffect(() => {
    async function loadBackendIntegrations() {
      try {
        const response = await fetch("/api/integrations");
        if (!response.ok) return;
        const data = (await response.json()) as { connections?: IntegrationConnection[] };
        const backendConnections = data.connections;
        if (!backendConnections?.length) return;
        setIntegrations((current) => {
          const currentIds = new Set(current.map((connection) => connection.id));
          const merged = [
            ...current.map((connection) => backendConnections.find((item) => item.id === connection.id) ?? connection),
            ...backendConnections.filter((connection) => !currentIds.has(connection.id)),
          ];
          saveIntegrationConnections(merged);
          return merged;
        });
      } catch {
        // Browser preview can still use saved local state.
      }
    }

    void loadBackendIntegrations();
  }, []);

  useEffect(() => {
    if (workspaceScreen === "home") {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (workspaceScreen === "calendar") {
        closeCalendar();
      } else if (workspaceScreen === "spotlight") {
        closeSpotlight();
      } else if (workspaceScreen === "focus") {
        showWorkspace("home");
      } else if (workspaceScreen === "development-sandbox" && developmentSandboxCanvasMode) {
        setDevelopmentSandboxCanvasMode(false);
      } else if (
        workspaceScreen === "files" ||
        workspaceScreen === "research" ||
        workspaceScreen === "projects" ||
        workspaceScreen === "sandbox" ||
        workspaceScreen === "development-sandbox"
      ) {
        resetWorkspaceToHome();
      } else if (workspaceScreen === "capture") {
        closeCapture();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [developmentSandboxCanvasMode, workspaceScreen]);

  useEffect(() => {
    window.history.scrollRestoration = "manual";
    window.scrollTo({ left: 0, top: 0 });

    return () => {
      clearWorkspaceTransitionTimer();
      clearStageAnimationFrame();
    };
  }, []);

  useEffect(() => {
    const warmups = [
      () => warmWorkspaceLayer(calendarWorkspaceRef.current),
      () => warmWorkspaceLayer(spotlightWorkspaceRef.current),
      () => warmWorkspaceLayer(researchWorkspaceRef.current),
      () => warmWorkspaceLayer(fileWorkspaceRef.current),
      () => warmWorkspaceLayer(focusWorkspaceRef.current),
      () => warmWorkspaceLayer(captureWorkspaceRef.current),
      () => warmWorkspaceLayer(projectsWorkspaceRef.current),
      () => warmWorkspaceLayer(sandboxWorkspaceRef.current),
      () => warmWorkspaceLayer(developmentSandboxWorkspaceRef.current),
    ];
    const timers: number[] = [];

    timers.push(
      window.setTimeout(() => {
        warmups.forEach((warmup, index) => {
          timers.push(window.setTimeout(warmup, index * 120));
        });
      }, 550),
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      calendarWorkspaceRef.current?.classList.remove("motion-layer-prewarming");
      spotlightWorkspaceRef.current?.classList.remove("motion-layer-prewarming");
      researchWorkspaceRef.current?.classList.remove("motion-layer-prewarming");
      fileWorkspaceRef.current?.classList.remove("motion-layer-prewarming");
      focusWorkspaceRef.current?.classList.remove("motion-layer-prewarming");
      captureWorkspaceRef.current?.classList.remove("motion-layer-prewarming");
      projectsWorkspaceRef.current?.classList.remove("motion-layer-prewarming");
      sandboxWorkspaceRef.current?.classList.remove("motion-layer-prewarming");
      developmentSandboxWorkspaceRef.current?.classList.remove("motion-layer-prewarming");
    };
  }, []);

  useEffect(() => {
    function handleReplayFirstRun() {
      setFirstRunOpen(true);
    }

    window.addEventListener(FIRST_RUN_REPLAY_EVENT, handleReplayFirstRun);
    return () => window.removeEventListener(FIRST_RUN_REPLAY_EVENT, handleReplayFirstRun);
  }, []);

  useEffect(() => {
    function handleSettingsUpdate(event: Event) {
      const nextSettings = (event as CustomEvent<AppSettings>).detail;
      setAppSettings(nextSettings ?? loadAppSettings());
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === APP_SETTINGS_STORAGE_KEY) {
        setAppSettings(loadAppSettings());
      }
    }

    window.addEventListener(APP_SETTINGS_UPDATED_EVENT, handleSettingsUpdate);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(APP_SETTINGS_UPDATED_EVENT, handleSettingsUpdate);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("boot") === "1") {
      launchFromBootQueryRef.current = true;
      urlParams.delete("boot");
      const trimmedSearch = urlParams.toString();
      const nextUrl = `${window.location.pathname}${trimmedSearch ? `?${trimmedSearch}` : ""}${window.location.hash || ""}`;
      window.history.replaceState({}, "", nextUrl);
    }
  }, []);

  useEffect(() => {
    if (!appSettings.updates.autoCheck) {
      return;
    }

    let cancelled = false;

    async function autoCheckForUpdates() {
      try {
        const checkResponse = await fetch("/api/update/check");
        const snapshot = (await checkResponse.json()) as UpdateCheckSnapshot;
        if (cancelled) return;
        saveUpdateCheckSnapshot(
          checkResponse.ok
            ? snapshot
            : {
                ...snapshot,
                message: snapshot.message || "Horizon could not complete its automatic update check.",
                supported: false,
              },
          "automatic",
        );
      } catch {
        if (cancelled) return;
        saveUpdateCheckSnapshot(
          {
            checkState: "fetch_failed",
            fetchFailed: true,
            message: "Horizon could not reach the local updater during its automatic check.",
            supported: false,
            updateAvailable: false,
          },
          "automatic",
        );
      }
    }

    const timer = window.setTimeout(() => {
      void autoCheckForUpdates();
    }, 900);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [appSettings.updates.autoCheck]);

  useEffect(() => {
    function handleUserActivation() {
      void warmFocusAudio(focusAudioRef, appSettings.focus.soundVolume);
    }

    window.addEventListener("pointerdown", handleUserActivation);
    window.addEventListener("keydown", handleUserActivation);
    return () => {
      window.removeEventListener("pointerdown", handleUserActivation);
      window.removeEventListener("keydown", handleUserActivation);
    };
  }, [appSettings.focus.soundVolume]);

  useEffect(() => {
    if (initialProfilePresetAppliedRef.current) {
      return;
    }

    initialProfilePresetAppliedRef.current = true;

    if (focusTimer.isRunning || focusTimer.progress > 0 || focusTimer.presetId === profile.workspaceDefaults.pomodoroPreset) {
      return;
    }

    const preset = FOCUS_PRESETS.find((item) => item.id === profile.workspaceDefaults.pomodoroPreset);
    if (preset) {
      focusTimer.selectPreset(preset);
    }
  }, [focusTimer.isRunning, focusTimer.presetId, focusTimer.progress, profile.workspaceDefaults.pomodoroPreset]);

  const runLaunchSequence = useCallback(
    (options?: { forceSound?: boolean; restartVisual?: boolean }) => {
      const { forceSound = true, restartVisual = true } = options ?? {};
      if (typeof window === "undefined") {
        return;
      }

      launchSoundRequestedRef.current = forceSound;
      if (restartVisual) {
        setBootRunKey((value) => value + 1);
      }
      setBootVisible(true);
    },
    [],
  );

  const handleBootStarted = useCallback(() => {
    if (!reducedMotion && launchSoundRequestedRef.current) {
      void playLaunchSound(focusAudioRef, appSettings.focus.soundVolume);
    }
  }, [appSettings.focus.soundVolume, reducedMotion]);

  const handleBootComplete = useCallback(() => {
    setBootVisible(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleMotionChange = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches);
    };

    setReducedMotion(reducedMotionQuery.matches);
    reducedMotionQuery.addEventListener("change", handleMotionChange);
    return () => reducedMotionQuery.removeEventListener("change", handleMotionChange);
  }, []);

  useEffect(() => {
    if (bootHasPlayedRef.current) {
      return;
    }

    bootHasPlayedRef.current = true;
    const shouldShowBoot = !appSettings.general.quietLaunch || launchFromBootQueryRef.current;

    if (appSettings.notifications.desktop && !launchNotificationShownRef.current) {
      launchNotificationShownRef.current = true;
      showLaunchNotification();
    }

    if (!shouldShowBoot) {
      setBootVisible(false);
      return;
    }

    runLaunchSequence({ forceSound: true, restartVisual: !bootVisible });
  }, [appSettings.general.quietLaunch, appSettings.notifications.desktop, bootVisible, runLaunchSequence]);

  return (
    <div
      className="relative h-screen overflow-hidden bg-horizon-bg text-slate-200"
      data-accent={profile.theme.accentColor}
      data-background={profile.theme.backgroundTheme}
      data-ambient={appSettings.appearance.showAmbientBackground ? "on" : "off"}
      data-high-contrast={appSettings.appearance.highContrastPanels ? "on" : undefined}
      data-workspace={workspaceScreen}
    >
      <HorizonBackground />

      <Sidebar
        activeSourceId={activeSourceId}
        activeView={activeView}
        audioHandle={focusAudioRef}
        integrations={integrations}
        focusNavigationCollapsed={navigationCollapsed}
        onNavigate={navigate}
        onOpenProfile={() => setProfileCustomizerOpen(true)}
        onOpenSettings={openSettings}
        profile={profile}
        profileStatus={profileStatus}
        soundVolume={appSettings.focus.soundVolume}
      />

      <main
        className={`horizon-main-shell relative z-10 h-screen overflow-hidden ${
          navigationCollapsed ? "horizon-main-shell-focus-expanded" : "ml-64"
        }`}
        ref={mainShellRef}
      >
        {/* The shell stays locked to the viewport. Real overflow can still move with a
            wheel/trackpad, but the visual rail is hidden and expanding collections own
            their scrolling inside the relevant panel. */}
        <section
          className={`app-home-shell flex h-screen flex-col overflow-x-hidden px-10 py-6 ${
            workspaceScreen === "research" || workspaceScreen === "development-sandbox"
              ? "overflow-y-clip"
              : "overflow-y-auto"
          } ${
            immersiveWorkspace ? "focus-mode-shell" : ""
          }`}
          ref={homeShellRef}
        >
          <div className={`workspace-chrome ${immersiveWorkspace ? "workspace-chrome-collapsed" : ""}`}>
            <Header focusTimer={focusTimer} profile={profile} />
            <StatusRow
              eventCount={calendarEventCount}
              focusLabel={focusStatusLabel}
              issueCount={calendarIssueCount}
              onOpenCalendar={openCalendar}
              onOpenFocus={() => showWorkspace("focus")}
              onOpenPriorities={openCalendarPriorities}
              onOpenReview={openCalendarReview}
              onOpenSweep={openSweep}
              priorityCount={calendarPriorityCount}
              triageCount={triageCount}
            />
          </div>

          <section
            className={`motion-stage ${immersiveWorkspace ? "focus-mode-stage" : "mt-4"} ${
              workspaceTransition === "switching" ? "motion-stage-switching" : ""
            }`}
            data-active-workspace={workspaceScreen}
            ref={workspaceRef}
            style={stageHeight ? { height: `${stageHeight}px` } : undefined}
          >
              <div
                aria-hidden={workspaceLayerState("home") === "hidden"}
                className={`motion-layer motion-layer-${workspaceLayerState("home")} calendar-home-workspace home-dashboard-grid grid gap-4`}
                ref={homeWorkspaceRef}
              >
                <TodayPanel
                  calendarItems={calendar.items}
                  error={calendar.error}
                  loading={calendar.loading}
                  onRefresh={calendar.refresh}
                  onViewCalendar={openCalendar}
                  today={calendar.today}
                />
                <FocusPanel focusTimer={focusTimer} onOpenFocusWorkspace={() => showWorkspace("focus")} />
                <ProjectSpotlight calendarItems={calendar.items} focusTimer={focusTimer} onExpand={openSpotlight} today={calendar.today} />
              </div>

              <div
                aria-hidden={workspaceLayerState("focus") === "hidden"}
                className={`motion-layer motion-layer-${workspaceLayerState("focus")} focus-workspace ${
                  workspaceLayerState("focus") === "leaving" ? "focus-workspace-closing" : ""
                }`}
                ref={focusWorkspaceRef}
              >
                <FocusWorkspace
                  focusTimer={focusTimer}
                  navigationCollapsed={focusNavigationCollapsed}
                  onToggleNavigation={() =>
                    setFocusNavigationPreference(focusNavigationCollapsed ? "visible" : "collapsed")
                  }
                />
              </div>

              <div
                aria-hidden={workspaceLayerState("calendar") === "hidden"}
                className={`motion-layer motion-layer-${workspaceLayerState("calendar")} calendar-expanded-workspace ${
                  workspaceLayerState("calendar") === "leaving" ? "calendar-workspace-closing" : ""
                } grid grid-cols-[minmax(0,1fr)_300px] gap-4`}
                ref={calendarWorkspaceRef}
              >
                <ExpandedCalendar
                  calendarItems={calendar.items}
                  error={calendar.error}
                  eventFocusKey={calendarEventFocusKey}
                  loading={calendar.loading}
                  onClose={closeCalendar}
                  onRefresh={calendar.refresh}
                  reviewFocusKey={calendarReviewFocusKey}
                  priorityFocusKey={calendarPriorityFocusKey}
                  showCompletedItems={appSettings.calendar.showCompletedItems}
                  today={calendar.today}
                  weekStartsMonday={appSettings.calendar.weekStartsMonday}
                />
                <div className="calendar-side-context">
                  <ProjectSpotlight calendarItems={calendar.items} focusTimer={focusTimer} onExpand={openSpotlight} today={calendar.today} />
                </div>
              </div>

              <div
                aria-hidden={workspaceLayerState("spotlight") === "hidden"}
                className={`motion-layer motion-layer-${workspaceLayerState("spotlight")} spotlight-expanded-workspace ${
                  workspaceLayerState("spotlight") === "leaving" ? "spotlight-workspace-closing" : ""
                }`}
                ref={spotlightWorkspaceRef}
              >
                <ProjectSpotlightExpandedWorkspace calendarItems={calendar.items} focusTimer={focusTimer} onClose={closeSpotlight} today={calendar.today} />
              </div>

              <div
                aria-hidden={workspaceLayerState("research") === "hidden"}
                className={`motion-layer motion-layer-${workspaceLayerState("research")} research-workspace`}
                ref={researchWorkspaceRef}
              >
                <ResearchWorkspace
                  isActive={workspaceScreen === "research" && workspaceLayerState("research") !== "hidden"}
                  onClose={() => showWorkspace("home")}
                  onOpenWorkbench={openResearchWorkbench}
                />
              </div>

              <div
                aria-hidden={workspaceLayerState("files") === "hidden"}
                className={`motion-layer motion-layer-${workspaceLayerState("files")} file-manager-workspace`}
                ref={fileWorkspaceRef}
              >
                <FileBrowserPanel initialSourceId={activeSourceId} integrations={integrations} onOpenSettings={openSettings} />
              </div>

              <div
                aria-hidden={workspaceLayerState("capture") === "hidden"}
                className={`motion-layer motion-layer-${workspaceLayerState("capture")} capture-workspace ${
                  workspaceLayerState("capture") === "leaving" ? "capture-workspace-closing" : ""
                }`}
                ref={captureWorkspaceRef}
              >
                {captureMode === "sweep" ? (
                  <CaptureSweep
                    allowAi={appSettings.privacy.openAiCanParseCaptures}
                    onApplied={(result) => {
                      if (result.refreshCalendar) calendar.refresh();
                    }}
                    onClose={closeCapture}
                    onOpenSingle={openSweepItemInSingle}
                    onQueueChanged={() => setCaptureQueueRefreshKey((current) => current + 1)}
                    refreshKey={sweepRefreshKey}
                  />
                ) : (
                  <CaptureWorkspace
                    allowAi={appSettings.privacy.openAiCanParseCaptures}
                    audioHandle={focusAudioRef}
                    autoRunKey={captureAutoRunKey}
                    focusKey={captureFocusKey}
                    onApplied={(result) => {
                      if (result.refreshCalendar) calendar.refresh();
                    }}
                    onHasNextQueuedCapture={hasNextQueuedCapture}
                    onNextQueuedCapture={openNextQueuedCapture}
                    onQueueChanged={() => setCaptureQueueRefreshKey((current) => current + 1)}
                    onClose={closeCapture}
                    onTextChange={setCaptureText}
                    queueSource={queuedCaptureSource}
                    soundVolume={appSettings.focus.soundVolume}
                    text={captureText}
                  />
                )}
              </div>

              <div
                aria-hidden={workspaceLayerState("projects") === "hidden"}
                className={`motion-layer motion-layer-${workspaceLayerState("projects")} projects-workspace`}
                ref={projectsWorkspaceRef}
              >
                <ProjectsWorkspace onClose={() => showWorkspace("home")} onCreateProject={openNewProjectCapture} />
              </div>

              <div
                aria-hidden={workspaceLayerState("sandbox") === "hidden"}
                className={`motion-layer motion-layer-${workspaceLayerState("sandbox")} sandbox-workspace`}
                ref={sandboxWorkspaceRef}
              >
                <SandboxWorkspace onClose={() => showWorkspace("home")} />
              </div>

              <div
                aria-hidden={workspaceLayerState("development-sandbox") === "hidden"}
                className={`motion-layer motion-layer-${workspaceLayerState("development-sandbox")} development-sandbox-workspace ${
                  developmentSandboxCanvasMode ? "development-sandbox-workspace-expanded" : ""
                }`}
                ref={developmentSandboxWorkspaceRef}
              >
                <DevelopmentSandboxWorkspace
                  canvasMode={developmentSandboxCanvasMode}
                  onClose={() => showWorkspace("home")}
                  onToggleCanvasMode={() => setDevelopmentSandboxCanvasMode((current) => !current)}
                />
              </div>
          </section>

            <div className={`motion-follow-panels ${workspaceScreen !== "home" ? "motion-follow-panels-collapsed" : ""}`}>
              <CaptureBar onCapture={() => openCapture(true)} onTextChange={setCaptureText} value={captureText} />
              {workspaceScreen !== "focus" ? (
                <CaptureQueuePanel onSweepAll={openSweep} onTriageItem={openQueuedCapture} refreshKey={captureQueueRefreshKey} />
              ) : null}
              <AppDock integrations={integrations} />
            </div>

            {workspaceScreen === "focus" ? (
              <div className={`focus-queue-shell ${workspaceTransition === "switching" ? "focus-queue-shell-entering" : ""}`}>
                <CaptureQueuePanel onSweepAll={openSweep} onTriageItem={openQueuedCapture} refreshKey={captureQueueRefreshKey} />
              </div>
            ) : null}
        </section>
      </main>

      {profileCustomizerOpen ? (
        <ProfileCustomizer
          integrations={integrations}
          isTimerRunning={focusTimer.isRunning}
          onClose={() => setProfileCustomizerOpen(false)}
          onIntegrationChange={handleSaveIntegration}
          onSave={handleSaveProfile}
          profile={profile}
        />
      ) : null}

      {settingsOpen ? (
        <SettingsPanel
          initialTarget={settingsTarget}
          integrations={integrations}
          onClose={closeSettings}
          onTestLaunch={() => runLaunchSequence({ forceSound: true })}
          onIntegrationChange={handleSaveIntegration}
          onProfileChange={handleSaveProfile}
          profile={profile}
        />
      ) : null}

      {bootVisible ? (
        <HorizonBoot
          key={bootRunKey}
          onComplete={handleBootComplete}
          onStarted={handleBootStarted}
          reducedMotion={reducedMotion}
          statusPhrase="Signal locked"
        />
      ) : null}

      {firstRunOpen && !bootVisible ? <FirstRunWizard onClose={() => setFirstRunOpen(false)} /> : null}
    </div>
  );
}
