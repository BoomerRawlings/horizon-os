// LIVE data for Project Spotlight: static project definitions plus the matching and
// view-model logic that blends them with real RCF calendar signals. Not disposable mocks.
import { spotlightEvents } from "./spotlightEvents";
import { spotlightTasks } from "./spotlightTasks";
import { saveSpotlightPreferencesToVault } from "../utils/horizonState";
import {
  activeDatedItems,
  categoryDisplayLabel,
  categoryKey,
  daysBetween,
  formatClock,
  isTimedItem,
  itemStartDate,
  itemTimeLabel,
  localIsoDate,
  parseIsoDate,
} from "../utils/rcfCalendar";
import type {
  CalendarEvent,
  PriorityTask,
  Project,
  RcfCalendarItem,
  SpotlightMode,
  SpotlightNextAction,
  SpotlightProgress,
  SpotlightSourceStatus,
  SpotlightViewModel,
} from "../types";

export const SPOTLIGHT_PREFS_STORAGE_KEY = "horizon-os.project-spotlight.v1";

export type SpotlightPreferences = {
  manualProjectId?: string | null;
  pinnedProjectId?: string | null;
  snoozedProjectIds?: string[];
};

type SpotlightContext = {
  calendarItems?: RcfCalendarItem[];
  focusPresetLabel: string;
  manualProjectId?: string | null;
  pinnedProjectId?: string | null;
  snoozedProjectIds?: string[];
  today?: string;
  // PHASE-09: static projectRegistry merged with vault Project Registry/*.md notes.
  // Defaults to the static registry alone when omitted (offline/dev fallback).
  registry?: Project[];
};

type ProjectScore = {
  contextLine?: string;
  nextAction?: SpotlightNextAction;
  projectId: string;
  reason: string;
  score: number;
  strongestSignal: "calendar" | "task" | "pinned" | "manual" | "staleness" | "fallback";
};

export const projectRegistry: Project[] = [
  {
    id: "creative-project",
    name: "Creative Project",
    subtitle: "A focused body of work",
    category: "writing",
    status: "active",
    phase: "Drafting",
    priority: "high",
    coverLabel: "Create",
    coverKicker: "Draft",
    accentColor: "sky",
    defaultAction: "start_focus_session",
    defaultActionLabel: "Start Writing Session",
    fallbackNextAction: "Continue the current draft",
    contextLine: "25/5 Pomodoro ready",
    progress: {
      type: "percent",
      label: "Writing progress",
      value: 25,
    },
    linkedSources: {
      taskProjectIds: ["creative-project"],
      calendarKeywords: ["Creative Project", "Writing Block", "Draft"],
      obsidianPaths: ["Projects/Creative Project"],
    },
    milestones: ["Define the outcome", "Complete a first draft", "Review and revise"],
    summary: "A neutral example project showing how Horizon can keep a creative effort, its next action, and focus sessions together.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  },
  {
    id: "study-plan",
    name: "Study Plan",
    subtitle: "Learning goals and deadlines",
    category: "school",
    status: "active",
    phase: "Coursework",
    priority: "critical",
    coverLabel: "Study",
    coverKicker: "Study",
    accentColor: "cyan",
    defaultAction: "start_focus_session",
    defaultActionLabel: "Start Study Session",
    fallbackNextAction: "Review the next learning milestone",
    contextLine: "Study queue is ready",
    progress: {
      type: "status",
      text: "In progress",
    },
    linkedSources: {
      taskProjectIds: ["study-plan"],
      calendarKeywords: ["Study", "Class", "Course", "Lecture", "Assignment", "Quiz", "Exam", "Homework"],
      obsidianPaths: ["Calendar/Items", "Projects/Study Plan"],
    },
    milestones: ["Choose the next lesson", "Complete practice work", "Review progress"],
    summary: "A neutral example showing how coursework, deadlines, and focus sessions can share one project context.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  },
  {
    id: "client-project",
    name: "Client Project",
    subtitle: "Deliverables and follow-ups",
    category: "business",
    status: "active",
    phase: "Planning",
    priority: "high",
    coverLabel: "Client",
    coverKicker: "Work",
    accentColor: "emerald",
    defaultAction: "open_workspace",
    defaultActionLabel: "Open Project Workspace",
    fallbackNextAction: "Define the next deliverable",
    contextLine: "Project workspace needs source links",
    progress: {
      type: "phase",
      text: "Current phase: Planning",
    },
    linkedSources: {
      taskProjectIds: ["client-project"],
      calendarKeywords: ["Client", "Deliverable", "Follow-up", "Project"],
      googleDriveFolderIds: ["client-project-folder"],
    },
    milestones: ["Confirm the outcome", "Complete the next deliverable", "Close the follow-up loop"],
    summary: "A neutral example project for coordinating deliverables, source files, and follow-ups.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  },
  {
    id: "research-knowledge-base",
    name: "Research / Knowledge Base",
    subtitle: "Papers, PDFs, notes, and citations",
    category: "research",
    status: "active",
    phase: "Collecting",
    priority: "medium",
    coverLabel: "Research",
    coverKicker: "KB",
    accentColor: "violet",
    defaultAction: "open_research",
    defaultActionLabel: "Open Research Queue",
    fallbackNextAction: "Review saved papers",
    contextLine: "Research sources are not connected yet",
    progress: {
      type: "count",
      label: "Papers saved",
      value: 0,
    },
    linkedSources: {
      taskProjectIds: ["research-knowledge-base"],
      calendarKeywords: ["Research", "Papers", "Knowledge Base"],
      researchCollectionIds: ["default-research"],
      obsidianPaths: ["Research"],
    },
    milestones: ["Connect sources", "Create reading queue", "Link citations"],
    summary: "Research spotlight is ready for future Zotero, PDF, Obsidian, and citation-source connectors.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  },
  {
    id: "personal-admin",
    name: "Personal Admin",
    subtitle: "Forms, appointments, follow-ups",
    category: "personal_admin",
    status: "active",
    phase: "Open loops",
    priority: "medium",
    coverLabel: "Admin",
    coverKicker: "Life",
    accentColor: "amber",
    defaultAction: "open_task_list",
    defaultActionLabel: "Review Admin Tasks",
    fallbackNextAction: "Review open reminders",
    contextLine: "No admin source linked yet",
    progress: {
      type: "status",
      text: "Needs setup",
    },
    linkedSources: {
      taskProjectIds: ["personal-admin"],
      calendarKeywords: ["Reminder", "Appointment", "Admin", "Follow-up"],
    },
    milestones: ["Collect reminders", "Link documents", "Schedule follow-ups"],
    summary: "Admin spotlight can hold open reminders without pretending to know details that have not been captured yet.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  },
];

export function loadSpotlightPreferences(): SpotlightPreferences {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(SPOTLIGHT_PREFS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SpotlightPreferences) : {};
  } catch {
    return {};
  }
}

export function saveSpotlightPreferences(preferences: SpotlightPreferences) {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(SPOTLIGHT_PREFS_STORAGE_KEY, JSON.stringify(preferences));
    void saveSpotlightPreferencesToVault(preferences as Record<string, unknown>);
  } catch {
    // Preferences are helpful cache, not required for in-session spotlight behavior.
  }
}

function priorityScore(priority: Project["priority"]) {
  if (priority === "critical") return 12;
  if (priority === "high") return 8;
  if (priority === "medium") return 4;
  return 1;
}

function taskPriorityScore(priority: PriorityTask["priority"]) {
  if (priority === "High") return 35;
  if (priority === "Medium") return 20;
  return 8;
}

function eventTimeLabel(event: CalendarEvent) {
  return event.startTime.replace(" ", "\u00a0");
}

function eventMatchesProject(event: CalendarEvent, project: Project) {
  if (event.projectId === project.id) {
    return true;
  }

  const keywords = project.linkedSources.calendarKeywords ?? [];
  return keywords.some((keyword) => event.title.toLowerCase().includes(keyword.toLowerCase()));
}

function calendarItemMatchesProject(item: RcfCalendarItem, project: Project) {
  const itemCategory = categoryKey(item);
  if (project.category === "school" && (itemCategory === "college" || itemCategory === "university")) return true;
  if (project.category === "business" && itemCategory === "business") return true;
  if (project.category === "personal_admin" && itemCategory === "life") return true;

  const keywords = project.linkedSources.calendarKeywords ?? [];
  const haystack = `${item.fields.name} ${item.fields.action_needed} ${item.fields.category} ${item.body}`.toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

function dueDistanceLabel(daysUntil: number, dateLabel: string) {
  if (daysUntil < -1) return `overdue from ${dateLabel}`;
  if (daysUntil === -1) return "overdue from yesterday";
  if (daysUntil === 0) return "due today";
  if (daysUntil === 1) return "due tomorrow";
  if (daysUntil <= 7) return `due in ${daysUntil} days`;
  return `due ${dateLabel}`;
}

function importanceBonus(item: RcfCalendarItem) {
  const importance = (item.fields.importance || "").toLowerCase();
  if (importance === "high") return 15;
  if (importance === "medium") return 8;
  if (importance === "low") return 3;
  return 0;
}

function calendarItemIsDeadline(item: RcfCalendarItem) {
  return /assignment|due|deadline|submit|quiz|homework|exam|paper|project|journal|discussion|assessment|module|canvas/i.test(
    `${item.fields.name} ${item.fields.action_needed} ${item.body}`,
  );
}

function calendarItemIsCoursework(item: RcfCalendarItem) {
  return /course|class|lecture|assignment|quiz|homework|module|canvas|discussion|journal|assessment|final project/i.test(
    `${item.fields.name} ${item.fields.action_needed} ${item.body}`,
  );
}

function urgencyScore(daysUntil: number) {
  if (daysUntil < -2) return 45;
  if (daysUntil < 0) return 72;
  if (daysUntil === 0) return 90;
  if (daysUntil === 1) return 84;
  if (daysUntil <= 3) return 68;
  if (daysUntil <= 7) return 42;
  if (daysUntil <= 14) return 22;
  return 6;
}

function spotlightPriorityFromImportance(item: RcfCalendarItem): SpotlightNextAction["priority"] {
  const importance = (item.fields.importance || "").toLowerCase();
  if (importance === "high") return "high";
  if (importance === "low") return "low";
  return "medium";
}

function liveCalendarEventsForProject(project: Project, calendarItems: RcfCalendarItem[] = [], today = localIsoDate(new Date())) {
  const todayDate = parseIsoDate(today);
  return activeDatedItems(calendarItems)
    .filter((item) => calendarItemMatchesProject(item, project))
    .filter((item) => {
      const date = itemStartDate(item);
      return !todayDate || !date || date >= todayDate;
    })
    .slice(0, 8)
    .map((item) => ({
      id: item.id,
      title: item.fields.name,
      startTime: item.fields.time_start ? formatClock(item.fields.time_start) : item.dateLabel,
      endTime: item.fields.time_end ? formatClock(item.fields.time_end) : itemTimeLabel(item),
      type: project.category === "business" ? "business" : project.category === "school" ? "school" : "personal",
      color: categoryKey(item) === "university" ? "amber" : categoryKey(item) === "business" ? "green" : "violet",
      projectId: project.id,
    })) satisfies CalendarEvent[];
}

function strongestCalendarSignal(project: Project, context: SpotlightContext) {
  const todayDate = parseIsoDate(context.today || localIsoDate(new Date()));
  if (!todayDate || !context.calendarItems?.length) return null;

  return activeDatedItems(context.calendarItems)
    .filter((item) => calendarItemMatchesProject(item, project))
    .map((item) => {
      const date = itemStartDate(item);
      const daysUntil = date ? daysBetween(todayDate, date) : 999;
      const deadline = calendarItemIsDeadline(item);
      const coursework = calendarItemIsCoursework(item);
      const score =
        urgencyScore(daysUntil) +
        importanceBonus(item) +
        (deadline ? 25 : 0) +
        (coursework ? 28 : 0) +
        (isTimedItem(item) && !deadline ? (daysUntil <= 1 ? 8 : 2) : 0);

      return {
        contextLine: `${categoryDisplayLabel(item)} - ${itemTimeLabel(item)} - ${item.fields.action_needed}`,
        dateSort: item.sortDate,
        item,
        nextAction: {
          id: item.id,
          label: item.fields.name,
          linkedProjectId: project.id,
          priority: spotlightPriorityFromImportance(item),
          source: "calendar",
          dueAt: item.fields.date,
          actionType: project.defaultAction,
        } satisfies SpotlightNextAction,
        reason: `Spotlighted because: ${item.fields.name} is ${dueDistanceLabel(daysUntil, item.dateLabel)}`,
        score,
      };
    })
    .sort((a, b) => b.score - a.score || a.dateSort.localeCompare(b.dateSort))[0] ?? null;
}

function taskMatchesProject(task: PriorityTask, project: Project) {
  if (task.projectId === project.id) {
    return true;
  }

  const taskProjectIds = project.linkedSources.taskProjectIds ?? [];
  return Boolean(task.projectId && taskProjectIds.includes(task.projectId));
}

function scoreProject(project: Project, context: SpotlightContext): ProjectScore {
  if (project.status === "archived" || project.status === "completed") {
    return {
      projectId: project.id,
      reason: "Spotlighted because: Project is not active",
      score: -100,
      strongestSignal: "fallback",
    };
  }

  const snoozed = context.snoozedProjectIds?.includes(project.id);
  let score = priorityScore(project.priority);
  let reason = "Spotlighted because: Highest-priority active project";
  let contextLine: string | undefined;
  let nextAction: SpotlightNextAction | undefined;
  let strongestSignal: ProjectScore["strongestSignal"] = "fallback";

  const calendarSignal = strongestCalendarSignal(project, context);
  if (calendarSignal) {
    score += calendarSignal.score;
    reason = calendarSignal.reason;
    contextLine = calendarSignal.contextLine;
    nextAction = calendarSignal.nextAction;
    strongestSignal = "calendar";
  }

  const nextEvent = calendarSignal ? null : spotlightEvents.find((event) => eventMatchesProject(event, project));
  if (nextEvent) {
    const eventScore = nextEvent.type === "writing" || nextEvent.type === "focus" ? 40 : 18;
    score += eventScore;
    reason = `Spotlighted because: ${nextEvent.title} starts at ${eventTimeLabel(nextEvent)}`;
    strongestSignal = "calendar";
  }

  const matchingTasks = spotlightTasks.filter((task) => !task.completed && taskMatchesProject(task, project));
  const topTask = matchingTasks[0];
  if (topTask) {
    score += taskPriorityScore(topTask.priority);
    if (strongestSignal !== "calendar") {
      reason = `Spotlighted because: ${topTask.priority.toLowerCase()}-priority task is ready`;
      strongestSignal = "task";
    }
  }

  // Manual and pinned selections must be DECISIVE, not merely a nudge: the UI announces
  // "Manually selected", so a calendar-heavy project (deadline+coursework+urgency stacks
  // can top ~180) must never out-score an explicit human choice. The old +80/+100 boosts
  // silently lost that fight (found by PHASE-13's "Spotlight this" verification — the
  // Spotlight's own switcher dots had the same latent bug).
  if (context.manualProjectId === project.id) {
    score += 400;
    reason = "Spotlighted because: Manually selected";
    strongestSignal = "manual";
  }

  if (context.pinnedProjectId === project.id || project.pinned) {
    score += 500;
    reason = "Spotlighted because: You pinned this project";
    strongestSignal = "pinned";
  }

  if (snoozed) {
    score -= 100;
  }

  return {
    contextLine,
    nextAction,
    projectId: project.id,
    reason,
    score,
    strongestSignal,
  };
}

function progressText(progress: SpotlightProgress) {
  if (progress.type === "percent" && typeof progress.value === "number") {
    return `${progress.label ?? "Progress"} · ${progress.value}%`;
  }
  if (progress.type === "fraction" && typeof progress.current === "number" && typeof progress.total === "number") {
    return `${progress.current} / ${progress.total} ${progress.label ?? "complete"}`;
  }
  if (progress.type === "count" && typeof progress.value === "number") {
    return `${progress.value} ${progress.label ?? "items"}`;
  }
  if (progress.type === "phase" || progress.type === "status") {
    return progress.text ?? "In progress";
  }
  return "";
}

function nextActionForProject(project: Project, score: ProjectScore): SpotlightNextAction {
  if (score.nextAction) return score.nextAction;

  const task = spotlightTasks.find((item) => !item.completed && taskMatchesProject(item, project));

  if (task) {
    return {
      id: task.id,
      label: task.title,
      linkedProjectId: project.id,
      priority: task.priority.toLowerCase() as SpotlightNextAction["priority"],
      source: "task",
      actionType: project.defaultAction,
    };
  }

  return {
    label: project.fallbackNextAction,
    linkedProjectId: project.id,
    source: "fallback",
    actionType: project.defaultAction,
  };
}

function sourceStatusForProject(project: Project): SpotlightSourceStatus[] {
  const statuses: SpotlightSourceStatus[] = [];

  if (project.linkedSources.calendarKeywords?.length) {
    statuses.push({
      label: "Calendar",
      status: "ready",
      detail: "Local schedule signals available",
    });
  }

  if (project.linkedSources.taskProjectIds?.length) {
    statuses.push({
      label: "Tasks",
      status: "ready",
      detail: "Local task signals available",
    });
  }

  if (project.linkedSources.obsidianPaths?.length) {
    statuses.push({
      label: "Obsidian",
      status: "missing",
      detail: "Vault not selected",
    });
  }

  if (project.linkedSources.googleDriveFolderIds?.length) {
    statuses.push({
      label: "Google Drive",
      status: "not_connected",
      detail: "Needs sign-in",
    });
  }

  if (project.linkedSources.researchCollectionIds?.length) {
    statuses.push({
      label: "Research",
      status: "not_connected",
      detail: "No sources connected",
    });
  }

  return statuses;
}

function modeForProject(project: Project, context: SpotlightContext): SpotlightMode {
  if (context.pinnedProjectId === project.id || project.pinned) return "pinned";
  if (context.manualProjectId === project.id) return "manual";
  if (context.snoozedProjectIds?.includes(project.id)) return "snoozed";
  return "smart";
}

export function buildSpotlightViewModel(project: Project, score: ProjectScore, context: SpotlightContext): SpotlightViewModel {
  const nextAction = nextActionForProject(project, score);
  const sourceStatus = sourceStatusForProject(project);
  const contextLine = score.contextLine ?? (project.defaultAction === "start_focus_session" ? `${context.focusPresetLabel} Pomodoro ready` : project.contextLine);
  const registry = context.registry ?? projectRegistry;

  return {
    projectId: project.id,
    name: project.name,
    subtitle: project.subtitle,
    mode: modeForProject(project, context),
    reason: score.reason,
    phaseLabel: project.phase,
    progress: project.progress,
    nextAction,
    contextLine,
    primaryButton: {
      label: project.defaultActionLabel,
      action: project.defaultAction,
    },
    secondaryActions: [
      { label: "Expand project", action: "expand" },
      { label: context.pinnedProjectId === project.id ? "Unpin project" : "Pin project", action: "pin" },
      { label: "Switch project", action: "switch" },
    ],
    candidateDots: registry.map((candidate) => ({
      projectId: candidate.id,
      label: candidate.name,
      active: candidate.id === project.id,
    })),
    sourceStatus,
    score: score.score,
    lastUpdatedAt: project.updatedAt,
  };
}

export function getCurrentSpotlight(context: SpotlightContext): SpotlightViewModel {
  const registry = context.registry ?? projectRegistry;
  const scoredProjects = registry
    .map((project) => ({
      project,
      score: scoreProject(project, context),
    }))
    .sort((a, b) => b.score.score - a.score.score);

  const winner = scoredProjects[0];

  if (!winner) {
    return {
      projectId: "needs-setup",
      name: "No project selected",
      subtitle: "Connect tasks, calendar, or pin a project to start.",
      mode: "needs_setup",
      reason: "Spotlighted because: No active project selected",
      nextAction: {
        label: "Create or connect a project",
        linkedProjectId: "needs-setup",
        source: "fallback",
        actionType: "setup_project",
      },
      primaryButton: {
        label: "Set Up Spotlight",
        action: "setup_project",
      },
      secondaryActions: [],
      score: 0,
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  return buildSpotlightViewModel(winner.project, winner.score, context);
}

export function getProjectById(projectId: string, registry: Project[] = projectRegistry) {
  return registry.find((project) => project.id === projectId);
}

export function getProjectEvents(projectId: string, calendarItems?: RcfCalendarItem[], today?: string, registry: Project[] = projectRegistry) {
  const project = getProjectById(projectId, registry);
  if (!project) return [];
  const liveEvents = liveCalendarEventsForProject(project, calendarItems, today);
  if (liveEvents.length) return liveEvents;
  return spotlightEvents.filter((event) => eventMatchesProject(event, project));
}

export function getProjectTasks(projectId: string, registry: Project[] = projectRegistry) {
  const project = getProjectById(projectId, registry);
  if (!project) return [];
  return spotlightTasks.filter((task) => taskMatchesProject(task, project));
}

export { progressText };
