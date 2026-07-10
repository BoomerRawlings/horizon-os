// captureActions.cjs — THE single source of truth for capture action definitions.
// (PHASE-03 of docs/codex/horizon-roadmap — kills the "edit 8 places to add an action"
// treadmill. The UI consumes this via GET /api/capture/actions; server.cjs dispatches
// executors via the `executor` key. Executor implementations stay in server.cjs.)
//
// To ADD a new capture action:
//   1. Add one entry below (labels, plans, permission, boundary, hints).
//   2. Add/point to an executor case in server.cjs applyCaptureAction (or reuse
//      "inbox_note" for note-writing actions — then step 2 is nothing at all).
// That's it. Triage schema, prompt hints, and all UI labels follow automatically.
//
// Field guide:
//   plan          server voice ("Horizon will ...") — written into created notes and
//                 returned as `explanation` after apply.
//   uiPlan        client voice ("Creates one ...") — shown in the review card BEFORE
//                 apply. The two voices are intentional; do not merge them.
//   permission / externalBoundary  honest one-liners for the approval UI.
//   suggestable   included in the AI triage schema/prompt (delete_capture is a
//                 client-side affordance, never AI-suggested).
//   queueLike     apply routes the capture into the review queue instead of acting.
//   executor      dispatch key in server.cjs: calendar | zotero | behavior_rule |
//                 queue | inbox_note | client.
//   triageHint    optional extra system-prompt line teaching the AI how to fill the
//                 payload for this action. add_to_zotero's hint is only included when
//                 Zotero is configured (server.cjs swaps in a "don't suggest it" line
//                 otherwise — that logic is config-state, so it stays there).

const CAPTURE_ACTIONS = {
  create_calendar_item: {
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
    executor: "calendar",
    triageHint: "For create_calendar_item actions, fill payload date, time_start, time_end, importance, category, title, and action_needed using RCF rules.",
  },
  save_note: {
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
    executor: "inbox_note",
    triageHint: "For save_note actions, use a short vault-relative destination such as Inbox unless a clearly existing folder applies; never use the vault root absolute path as the destination.",
  },
  create_project: {
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
    executor: "inbox_note",
  },
  attach_to_project: {
    id: "attach_to_project",
    reviewLabel: "Review Project Link",
    confirmLabel: "Save Project Link",
    savedLabel: "Project link saved",
    plan: "Horizon will append a dated entry to the chosen project's registry note under a Captures section, linking back to the raw capture. If no matching project is found, it will save a local project-attachment note instead.",
    uiPlan: "Appends a dated entry to the chosen project's registry note (Project Registry/) with a link back to the raw capture. Falls back to a local project-attachment note if no matching project is found.",
    permission: "Local markdown write",
    externalBoundary: "No external apps will be changed.",
    suggestable: true,
    queueLike: false,
    executor: "project_attach",
  },
  organize_file: {
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
    executor: "inbox_note",
  },
  draft_email: {
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
    executor: "inbox_note",
  },
  add_to_zotero: {
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
    executor: "zotero",
    triageHint: "Zotero is configured. If the capture is a DOI, scholarly URL, citation, research paper, article metadata, or PDF/source meant for citation management, include an add_to_zotero action. Fill payload title, body, source, url, doi, authors, publication_title, and zotero_item_type where known. Use zotero_item_type journalArticle for DOI or scholarly article captures, webpage for ordinary web sources, and document for local PDFs/files. Do not invent metadata.",
  },
  save_research: {
    id: "save_research",
    reviewLabel: "Review Research Note",
    confirmLabel: "Save as Research",
    savedLabel: "Research note saved",
    plan: "Horizon will save a research note in Research Papers using the Author-YYYY convention. It will not download files or contact external services.",
    uiPlan: "Saves a research note in Research Papers (Author-YYYY.md) with the citation and a link back to the raw capture. No external service is contacted.",
    permission: "Local markdown write",
    externalBoundary: "No external apps will be changed.",
    suggestable: true,
    queueLike: false,
    executor: "research_paper",
    triageHint: "If the capture is a DOI, scholarly URL, citation, or research-paper reference and Zotero is NOT configured (or the owner has no Zotero credentials saved), include a save_research action instead of add_to_zotero. Fill payload title, authors, publication_title, doi, url, and date (year only is fine) where known - these file the note using the vault's Author-YYYY convention. Do not invent authors or years.",
  },
  save_research_idea: {
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
    executor: "research_idea",
    triageHint: "If the capture is an open research QUESTION, a topic to look into, or an 'I should look into / research X' thought WITHOUT a specific citation, DOI, or paper reference, include a save_research_idea action (fill payload title with a short topic and body with the full thought). Use save_research or add_to_zotero only when there is an actual paper/DOI/URL to cite; a bare topic or question is a research IDEA, not a paper.",
  },
  create_behavior_rule: {
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
    executor: "behavior_rule",
  },
  ask_clarification: {
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
    executor: "queue",
  },
  queue_review: {
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
    executor: "queue",
  },
  delete_capture: {
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
    executor: "client",
  },
};

// Suggestable ids, in definition order — feeds the triage JSON schema enum and the
// normalizer's allowlist (unknown types clamp to queue_review, unchanged behavior).
const CAPTURE_TRIAGE_ACTION_TYPES = Object.values(CAPTURE_ACTIONS)
  .filter((action) => action.suggestable)
  .map((action) => action.id);

function captureActionById(id) {
  return CAPTURE_ACTIONS[id] || CAPTURE_ACTIONS.queue_review;
}

// Server-voice plan text (note bodies + apply `explanation`). Unknown → queue_review's.
function captureActionPlan(action) {
  return captureActionById(action?.type).plan;
}

// Extra system-prompt lines for AI triage, in definition order. The zotero hint is
// config-dependent, so the caller passes zoteroConfigured and server.cjs supplies the
// unconfigured replacement line itself.
function captureTriageHints({ zoteroConfigured }) {
  return Object.values(CAPTURE_ACTIONS)
    .filter((action) => action.triageHint)
    .filter((action) => action.id !== "add_to_zotero" || zoteroConfigured)
    .map((action) => action.triageHint);
}

// JSON-safe metadata for GET /api/capture/actions (everything the UI needs, no code).
function captureActionMetadata() {
  return Object.values(CAPTURE_ACTIONS).map(
    ({ id, reviewLabel, confirmLabel, savedLabel, plan, uiPlan, permission, externalBoundary, suggestable, queueLike, executor }) => ({
      id,
      reviewLabel,
      confirmLabel,
      savedLabel,
      plan,
      uiPlan,
      permission,
      externalBoundary,
      suggestable,
      queueLike,
      clientOnly: executor === "client",
    }),
  );
}

module.exports = {
  CAPTURE_ACTIONS,
  CAPTURE_TRIAGE_ACTION_TYPES,
  captureActionById,
  captureActionPlan,
  captureActionMetadata,
  captureTriageHints,
};
