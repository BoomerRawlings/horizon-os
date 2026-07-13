import type { LucideIcon } from "lucide-react";

export type CalendarEvent = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  type: "focus" | "writing" | "school" | "business" | "personal";
  color: "cyan" | "violet" | "amber" | "green";
  projectId?: string;
};

export type RcfCalendarItemFields = {
  date: string;
  time_start: string;
  time_end: string;
  importance: "high" | "medium" | "low" | string;
  category: string;
  name: string;
  action_needed: string;
  status: "active" | "done" | "canceled" | string;
};

export type RcfCalendarItemIssue = {
  key: string;
  label: string;
};

export type RcfCalendarItem = {
  id: string;
  fields: RcfCalendarItemFields;
  body: string;
  dateLabel: string;
  issues: RcfCalendarItemIssue[];
  sortDate: string;
  endDate: string;
  days: number | null;
};

export type PriorityTask = {
  id: string;
  title: string;
  priority: "High" | "Medium" | "Low";
  completed: boolean;
  projectId?: string;
};

export type ProjectStatus = "active" | "paused" | "blocked" | "completed" | "archived";
export type ProjectPriority = "low" | "medium" | "high" | "critical";
export type ProjectCategory =
  | "writing"
  | "school"
  | "business"
  | "research"
  | "personal_admin"
  | "health"
  | "creative"
  | "technical"
  | "finance"
  | "custom";

export type SpotlightActionType =
  | "start_focus_session"
  | "open_workspace"
  | "open_notes"
  | "open_drive_folder"
  | "open_microsoft_file"
  | "open_research"
  | "open_codex_project"
  | "open_task_list"
  | "open_calendar_event"
  | "setup_project";

export type ProjectLinkedSources = {
  taskProjectIds?: string[];
  calendarKeywords?: string[];
  obsidianPaths?: string[];
  googleDriveFolderIds?: string[];
  microsoftFileIds?: string[];
  microsoftFolderIds?: string[];
  researchCollectionIds?: string[];
  codexProjectIds?: string[];
  localFolderPaths?: string[];
  urls?: string[];
};

export type SpotlightProgress = {
  type: "percent" | "fraction" | "count" | "phase" | "status" | "none";
  label?: string;
  value?: number;
  current?: number;
  total?: number;
  text?: string;
};

export type SpotlightNextAction = {
  id?: string;
  label: string;
  source: "task" | "calendar" | "milestone" | "ai" | "fallback" | "manual";
  priority?: "low" | "medium" | "high" | "critical";
  dueAt?: string;
  estimatedMinutes?: number;
  actionType: SpotlightActionType;
  linkedProjectId: string;
};

export type SpotlightButton = {
  label: string;
  action: SpotlightActionType | "expand" | "pin" | "switch";
};

export type SpotlightCandidateDot = {
  projectId: string;
  label: string;
  active: boolean;
};

export type SpotlightSourceStatus = {
  label: string;
  status: "ready" | "missing" | "stale" | "not_connected";
  detail: string;
};

export type Project = {
  id: string;
  name: string;
  subtitle?: string;
  category: ProjectCategory;
  status: ProjectStatus;
  phase?: string;
  priority: ProjectPriority;
  pinned?: boolean;
  snoozedUntil?: string | null;
  coverLabel?: string;
  coverKicker?: string;
  accentColor: "sky" | "violet" | "emerald" | "amber" | "rose" | "cyan" | "slate";
  defaultAction: SpotlightActionType;
  defaultActionLabel: string;
  fallbackNextAction: string;
  contextLine: string;
  progress: SpotlightProgress;
  linkedSources: ProjectLinkedSources;
  milestones?: string[];
  summary: string;
  createdAt: string;
  updatedAt: string;
  // PHASE-09: set when this project came from (or is linked to) a vault
  // Project Registry/*.md note, so Spotlight can point back at the source of truth.
  vaultPath?: string;
};

export type SpotlightMode = "smart" | "pinned" | "manual" | "snoozed" | "needs_setup";

export type SpotlightViewModel = {
  projectId: string;
  name: string;
  subtitle?: string;
  mode: SpotlightMode;
  reason: string;
  phaseLabel?: string;
  progress?: SpotlightProgress;
  nextAction: SpotlightNextAction;
  contextLine?: string;
  primaryButton: SpotlightButton;
  secondaryActions: SpotlightButton[];
  candidateDots?: SpotlightCandidateDot[];
  sourceStatus?: SpotlightSourceStatus[];
  score: number;
  lastUpdatedAt: string;
};

export type DockItem = {
  id: string;
  label: string;
  actionId?: string;
  icon?: LucideIcon;
  iconSrc?: string;
  launchMode?: "direct" | "menu";
  status?: "ready" | "not_configured" | "needs_setup" | "disabled_placeholder";
  statusLabel?: string;
  brand?: "obsidian" | "codex" | "microsoft" | "research";
  menu?: Array<{
    id: string;
    label: string;
    actionId: string;
    badge?: "Local" | "Web" | "Folder" | "Internal" | "Planned";
    helper?: string;
    icon?: LucideIcon;
    iconSrc?: string;
    planned?: boolean;
  }>;
};

export type TaglineMode = "fallback" | "custom" | "ai_generated" | "pinned";

export type ProfileSettings = {
  firstName: string;
  lastName: string;
  displayName: string;
  accountEmail: string;
  tagline: {
    text: string;
    mode: TaglineMode;
    pinned: boolean;
    updatedAt: string;
  };
  workspaceDefaults: {
    pomodoroPreset: "classic" | "long";
    startPage: "home" | "focus" | "projects" | "notes";
  };
  theme: {
    accentColor: "blue" | "violet" | "emerald" | "amber" | "rose" | "cyan";
    backgroundTheme: "nebula_dark" | "midnight_minimal" | "soft_horizon";
  };
};

export type IntegrationStatus =
  | "not_connected"
  | "connecting"
  | "auth_pending"
  | "validating"
  | "connected"
  | "connected_limited"
  | "syncing"
  | "stale"
  | "needs_reauth"
  | "api_key_required"
  | "api_key_invalid"
  | "permission_missing"
  | "vault_missing"
  | "rate_limited"
  | "offline"
  | "error"
  | "disconnecting";

// The integration's real ceiling today (mirrors server INTEGRATION_DEFINITIONS.capability):
// "integration" = real data integration when configured; "launcher" = opens local apps /
// web pages only, never displays as Connected; "planned" = reserved, no real behavior yet.
export type IntegrationCapability = "integration" | "launcher" | "planned";

export type IntegrationConnection = {
  id: string;
  label: string;
  type: "oauth" | "api_key" | "local_folder" | "local_app" | "compound";
  status: IntegrationStatus;
  statusLabel: string;
  actionLabel: string;
  permissionSummary: string;
  accountLabel?: string;
  capability?: IntegrationCapability;
  detailLabel?: string;
  lastCheckedLabel?: string;
};

export type HorizonView =
  | "home"
  | "calendar"
  | "files"
  | "focus"
  | "projects"
  | "research"
  | "workbench"
  | "sandbox"
  | "development-sandbox";

export type FileBrowserSourceId = "local" | "obsidian" | "google-drive" | "microsoft" | "research";

export type SettingsSectionId =
  | "general"
  | "focus"
  | "notifications"
  | "calendar"
  | "integrations"
  | "privacy"
  | "data"
  | "shortcuts"
  | "appearance"
  | "updates"
  | "advanced";

export type SettingsOpenTarget = {
  integrationId?: string;
  section?: SettingsSectionId;
};
