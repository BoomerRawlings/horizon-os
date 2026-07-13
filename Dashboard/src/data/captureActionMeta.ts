// Single source of truth for capture action DISPLAY metadata on the client (PHASE-04).
// The server registry (Dashboard/server/captureActions.cjs) is authoritative; this
// module only fetches it and provides an offline fallback (same trick as
// defaultIntegrationConnections in data/profile.ts). Adding a new action to the server
// registry needs ZERO changes here or in CaptureWorkspace.tsx.

export type CaptureActionMeta = {
  id: string;
  reviewLabel: string;
  confirmLabel: string;
  savedLabel: string;
  plan: string; // server voice - note bodies / apply explanation
  uiPlan: string; // client voice - shown in the review card before apply
  permission: string;
  externalBoundary: string;
  suggestable: boolean;
  queueLike: boolean;
  clientOnly: boolean;
};

// OFFLINE FALLBACK ONLY. The live source of truth is GET /api/capture/actions
// (Dashboard/server/captureActions.cjs). Content copied verbatim from that registry
// as of PHASE-03 (commit 250f735) so the dev/offline experience matches production.
export const FALLBACK_ACTION_META: CaptureActionMeta[] = [
  {
    id: "create_calendar_item",
    reviewLabel: "Review Calendar Event",
    confirmLabel: "Save Calendar Event",
    savedLabel: "Calendar event saved",
    plan: "Horizon will create one local RCF calendar item in Calendar/Items, link it back to the raw capture, and refresh the dashboard calendar. It will not create an external Google or Microsoft calendar event yet.",
    uiPlan: "Creates one local RCF calendar item, links it to the raw capture, and refreshes Horizon calendar views. It will not create a Google or Microsoft calendar event yet.",
    permission: "Local calendar write",
    externalBoundary: "No external calendar will be changed.",
    suggestable: true,
    queueLike: false,
    clientOnly: false,
  },
  {
    id: "save_note",
    reviewLabel: "Review Note",
    confirmLabel: "Save Note",
    savedLabel: "Note saved",
    plan: "Horizon will save this as a local markdown note in Inbox, with the raw capture linked for context.",
    uiPlan: "Saves a cleaned markdown note in Inbox and links it to the raw capture for context.",
    permission: "Local markdown write",
    externalBoundary: "No external apps will be changed.",
    suggestable: true,
    queueLike: false,
    clientOnly: false,
  },
  {
    id: "create_project",
    reviewLabel: "Review Project Proposal",
    confirmLabel: "Save Project Proposal",
    savedLabel: "Project proposal saved",
    plan: "Horizon will stage this as a local project proposal note for review instead of creating a new project automatically.",
    uiPlan: "Stages this as a local project proposal note instead of creating a new project automatically.",
    permission: "Local markdown write",
    externalBoundary: "No external apps will be changed.",
    suggestable: true,
    queueLike: false,
    clientOnly: false,
  },
  {
    id: "attach_to_project",
    reviewLabel: "Review Project Link",
    confirmLabel: "Save Project Link",
    savedLabel: "Project link saved",
    plan: "Horizon will save a local project-attachment note with the proposed relationship and source capture link.",
    uiPlan: "Saves a local project-attachment note with the proposed relationship and source capture link.",
    permission: "Local markdown write",
    externalBoundary: "No external apps will be changed.",
    suggestable: true,
    queueLike: false,
    clientOnly: false,
  },
  {
    id: "organize_file",
    reviewLabel: "Review File Instruction",
    confirmLabel: "Save File Instruction",
    savedLabel: "File instruction saved",
    plan: "Horizon will save a local file-organization instruction note. It will not move, rename, or delete files automatically.",
    uiPlan: "Saves a local file-organization instruction. It will not move, rename, or delete files automatically.",
    permission: "Local markdown write",
    externalBoundary: "No files will be moved.",
    suggestable: true,
    queueLike: false,
    clientOnly: false,
  },
  {
    id: "draft_email",
    reviewLabel: "Review Email Draft",
    confirmLabel: "Save Email Draft",
    savedLabel: "Email draft saved",
    plan: "Horizon will create a local email draft note in Inbox. It will not send email or create an external Gmail/Microsoft draft yet.",
    uiPlan: "Creates a local email draft note in Inbox. It will not send email.",
    permission: "Local markdown write",
    externalBoundary: "No email will be sent.",
    suggestable: true,
    queueLike: false,
    clientOnly: false,
  },
  {
    id: "add_to_zotero",
    reviewLabel: "Review Zotero Item",
    confirmLabel: "Add to Zotero",
    savedLabel: "Zotero item created",
    plan: "Horizon will create one item in your Zotero library using your saved Zotero credentials, then save a local Horizon note linking this capture to the Zotero item.",
    uiPlan: "Creates one item in your Zotero library using your saved Zotero credentials, then saves a local Horizon note linking the raw capture to that Zotero item.",
    permission: "External Zotero write",
    externalBoundary: "Creates a Zotero item after approval.",
    suggestable: true,
    queueLike: false,
    clientOnly: false,
  },
  {
    id: "save_research",
    reviewLabel: "Review Research Note",
    confirmLabel: "Save as Research",
    savedLabel: "Research note saved",
    plan: "Horizon will save a research note in Research Papers using the Author-YYYY convention, with DOI, date published, and a labeled Abstract or Summary. If an exact DOI is present, Horizon may ask Crossref for missing bibliographic metadata. Unknown values remain visible and are never guessed.",
    uiPlan: "Saves a research note in Research Papers (Author-YYYY.md), links it to the raw capture, and uses an exact DOI to complete missing metadata when Crossref has it. Horizon does not download the paper or invent missing details.",
    permission: "Local markdown write",
    externalBoundary: "An exact DOI may be looked up through Crossref. No paper is downloaded and no external library is changed.",
    suggestable: true,
    queueLike: false,
    clientOnly: false,
  },
  {
    id: "save_research_idea",
    reviewLabel: "Review Research Idea",
    confirmLabel: "Save Research Idea",
    savedLabel: "Research idea saved",
    plan: "Horizon will save this as a research idea note in Research Papers/Ideas. It will not search or contact any external service.",
    uiPlan: "Saves a research idea note in Research Papers/Ideas - a topic or question to explore later, linked to the raw capture. No external service is contacted.",
    permission: "Local markdown write",
    externalBoundary: "No external apps will be changed.",
    suggestable: true,
    queueLike: false,
    clientOnly: false,
  },
  {
    id: "create_behavior_rule",
    reviewLabel: "Review Behavior Rule",
    confirmLabel: "Save Behavior Rule",
    savedLabel: "Behavior rule saved",
    plan: "Horizon will append this as a local behavior/preference note for Horizon to reference later. It will not change app settings automatically.",
    uiPlan: "Adds a local behavior/preference note for future Horizon context. It will not change app settings automatically.",
    permission: "Local context update",
    externalBoundary: "No external apps will be changed.",
    suggestable: true,
    queueLike: false,
    clientOnly: false,
  },
  {
    id: "ask_clarification",
    reviewLabel: "Review Missing Detail",
    confirmLabel: "Queue for Clarification",
    savedLabel: "Queued for clarification",
    plan: "Horizon will keep this capture in the review queue and show the missing information needed before taking action.",
    uiPlan: "Keeps this in review and records the missing information needed before taking action.",
    permission: "Local queue item",
    externalBoundary: "No external apps will be changed.",
    suggestable: true,
    queueLike: true,
    clientOnly: false,
  },
  {
    id: "queue_review",
    reviewLabel: "Review Queue Item",
    confirmLabel: "Queue for Review",
    savedLabel: "Queued for review",
    plan: "Horizon will save this capture into the local review queue so it can be handled later without losing context.",
    uiPlan: "Saves this into the local review queue so it can be handled later without losing context.",
    permission: "Local queue item",
    externalBoundary: "No external apps will be changed.",
    suggestable: true,
    queueLike: true,
    clientOnly: false,
  },
  {
    id: "delete_capture",
    reviewLabel: "Review Capture Deletion",
    confirmLabel: "Delete Capture",
    savedLabel: "Capture deleted",
    plan: "Permanently deletes the synced capture file from Inbox/To Triage. Horizon will not save a note, calendar item, or review entry for it.",
    uiPlan: "Permanently deletes the synced capture file from Inbox/To Triage. Horizon will not save a note, calendar item, or review entry for it.",
    permission: "Local file delete",
    externalBoundary: "Only the selected queue file will be deleted.",
    suggestable: false,
    queueLike: false,
    clientOnly: true,
  },
];

// Stable ordered list of every known action id, derived from the fallback (mirrors the
// CaptureActionType union without duplicating it as a literal type - server can add
// action ids without a client type change).
export const CAPTURE_ACTION_TYPE_IDS = FALLBACK_ACTION_META.map((meta) => meta.id);

export async function fetchCaptureActionMeta(): Promise<CaptureActionMeta[]> {
  try {
    const response = await fetch("/api/capture/actions");
    if (!response.ok) return FALLBACK_ACTION_META;
    const data = (await response.json()) as { actions?: CaptureActionMeta[] };
    if (!data.actions?.length) return FALLBACK_ACTION_META;
    return data.actions;
  } catch {
    // Dev preview / offline: fall back silently, same pattern as loadBackendIntegrations.
    return FALLBACK_ACTION_META;
  }
}

export function metaById(meta: CaptureActionMeta[], id: string): CaptureActionMeta {
  return meta.find((item) => item.id === id) ?? FALLBACK_ACTION_META.find((item) => item.id === "queue_review")!;
}
