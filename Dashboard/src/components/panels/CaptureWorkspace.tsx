import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarPlus,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileText,
  FolderPlus,
  HelpCircle,
  Inbox,
  BookOpen,
  Link2,
  Loader2,
  Mail,
  PenLine,
  RotateCcw,
  SendHorizonal,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Panel } from "../ui/Panel";
import { playCaptureSound, warmFocusAudio, type CaptureSoundKind, type FocusAudioHandle } from "../../utils/focusFeedback";
import { FALLBACK_ACTION_META, fetchCaptureActionMeta, metaById, type CaptureActionMeta } from "../../data/captureActionMeta";
import { fetchVaultProjects, type VaultProjectRecord } from "../../data/vaultProjects";

type CaptureActionType =
  | "create_calendar_item"
  | "save_note"
  | "create_project"
  | "attach_to_project"
  | "organize_file"
  | "draft_email"
  | "add_to_zotero"
  | "create_behavior_rule"
  | "delete_capture"
  | "ask_clarification"
  | "queue_review";

type CaptureAction = {
  id: string;
  label: string;
  type: CaptureActionType;
  confidence: "high" | "medium" | "low";
  reason: string;
  requires_approval: boolean;
  payload: {
    title?: string;
    body?: string;
    date?: string;
    time_start?: string;
    time_end?: string;
    importance?: string;
    category?: string;
    action_needed?: string;
    destination?: string;
    source?: string;
    url?: string;
    doi?: string;
    authors?: string;
    publication_title?: string;
    zotero_item_type?: string;
    project?: string;
    note_path?: string;
    email_to?: string;
    email_subject?: string;
  };
};

type CaptureTriage = {
  actions: CaptureAction[];
  confidence: "high" | "medium" | "low";
  needs_input: boolean;
  questions: string[];
  summary: string;
};

type CaptureUndoInfo = {
  available?: boolean;
  files?: string[];
  label?: string;
  token?: string;
};

type CaptureApplyResult = {
  explanation?: string;
  message?: string;
  ok?: boolean;
  outputs?: Array<{ label: string; path: string }>;
  refreshCalendar?: boolean;
  undo?: CaptureUndoInfo;
  undone?: boolean;
};

type CaptureUndoResult = {
  message?: string;
  refreshCalendar?: boolean;
  removed?: string[];
};

// PHASE-11: one applied action within a multi-apply session. Each carries its OWN undo
// token so actions can be undone independently.
type AppliedRecord = {
  actionId: string;
  type: CaptureActionType;
  label: string;
  result: CaptureApplyResult;
  undone: boolean;
};

type QueuedCaptureSource = {
  id: string;
  path: string;
  title: string;
};

type CaptureWorkspaceProps = {
  allowAi: boolean;
  audioHandle: FocusAudioHandle;
  autoRunKey: number;
  focusKey: number;
  onApplied: (result: CaptureApplyResult) => void;
  onHasNextQueuedCapture?: (currentId?: string) => Promise<boolean>;
  onNextQueuedCapture?: (currentId?: string) => Promise<boolean>;
  onQueueChanged?: () => void;
  onClose: () => void;
  onTextChange: (value: string) => void;
  queueSource?: QueuedCaptureSource | null;
  soundVolume: number;
  text: string;
};

type PayloadKey = keyof CaptureAction["payload"];

const fieldClass =
  "h-10 w-full rounded-lg border border-white/10 bg-slate-950/45 px-3 text-sm text-slate-100 outline-none transition duration-300 placeholder:text-slate-600 focus:border-[rgba(var(--accent-rgb),0.55)] focus:bg-slate-950/60";

const textareaClass =
  "min-h-[92px] w-full resize-none rounded-lg border border-white/10 bg-slate-950/45 px-3 py-2 text-sm leading-relaxed text-slate-100 outline-none transition duration-300 placeholder:text-slate-600 focus:border-[rgba(var(--accent-rgb),0.55)] focus:bg-slate-950/60";

// Label/plan/permission/boundary text now comes from the capture action registry
// (GET /api/capture/actions, server/captureActions.cjs - PHASE-03/04). These helpers
// take the fetched `meta` array so a new server-registered action renders correctly
// with zero changes here. actionSubtitle/actionIcon stay client-side presentation logic
// (per-payload formatting / icon choice) - see PHASE-04's card for why.
function reviewLabel(meta: CaptureActionMeta[], type: string) {
  return metaById(meta, type).reviewLabel;
}

function confirmLabel(meta: CaptureActionMeta[], type: string) {
  return metaById(meta, type).confirmLabel;
}

function savedLabel(meta: CaptureActionMeta[], type: string) {
  return metaById(meta, type).savedLabel;
}

function actionPlan(meta: CaptureActionMeta[], action: CaptureAction) {
  return metaById(meta, action.type).uiPlan;
}

function actionSubtitle(action: CaptureAction) {
  const payload = action.payload || {};
  if (action.type === "create_calendar_item") {
    const date = payload.date && payload.date !== "unknown" ? payload.date : "date unknown";
    const time = payload.time_start ? ` at ${payload.time_start}` : "";
    return `${date}${time} - ${payload.category || "Other"}`;
  }
  if (action.type === "draft_email") return payload.email_to ? `Draft to ${payload.email_to}` : "Local draft only";
  if (action.type === "attach_to_project" || action.type === "create_project") return payload.project || "Project review";
  if (action.type === "organize_file") return payload.source || payload.destination || "File instruction";
  if (action.type === "add_to_zotero") return payload.doi || payload.url || payload.source || payload.zotero_item_type || "Zotero library item";
  if (action.type === "save_note") return payload.destination || "Inbox markdown note";
  if (action.type === "create_behavior_rule") return "Local behavior note";
  if (action.type === "delete_capture") return "Remove from capture queue";
  if (action.type === "ask_clarification") return "Needs one detail";
  if (action.type === "queue_review") return "Save for later review";
  return payload.destination || payload.note_path || action.confidence;
}

function actionTitle(meta: CaptureActionMeta[], action: CaptureAction) {
  return action.payload?.title || action.label || reviewLabel(meta, action.type);
}

function actionPermission(meta: CaptureActionMeta[], action: CaptureAction) {
  return metaById(meta, action.type).permission;
}

function actionExternalBoundary(meta: CaptureActionMeta[], action: CaptureAction) {
  return metaById(meta, action.type).externalBoundary;
}

function actionIcon(type: CaptureActionType) {
  if (type === "create_calendar_item") return <CalendarPlus className="h-4 w-4" />;
  if (type === "save_note") return <FileCheck2 className="h-4 w-4" />;
  if (type === "create_project") return <FolderPlus className="h-4 w-4" />;
  if (type === "attach_to_project") return <Link2 className="h-4 w-4" />;
  if (type === "add_to_zotero") return <BookOpen className="h-4 w-4" />;
  if (type === "organize_file") return <ClipboardCheck className="h-4 w-4" />;
  if (type === "draft_email") return <Mail className="h-4 w-4" />;
  if (type === "create_behavior_rule") return <ShieldCheck className="h-4 w-4" />;
  if (type === "delete_capture") return <Trash2 className="h-4 w-4" />;
  if (type === "ask_clarification") return <HelpCircle className="h-4 w-4" />;
  return <Inbox className="h-4 w-4" />;
}

function cloneAction(action: CaptureAction): CaptureAction {
  return {
    ...action,
    payload: { ...(action.payload || {}) },
  };
}

function queueMeaningfulText(value: string) {
  return String(value || "")
    .replace(/^---[\s\S]*?\n---\s*/m, "")
    .replace(/^#\s*(capture|untitled|new note|blank)?\s*$/gim, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^\s*[-*]\s*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function lowValueQueuedCaptureReason(value: string) {
  const meaningful = queueMeaningfulText(value);
  const normalized = meaningful.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!normalized) return "This capture is empty after removing its placeholder heading.";
  if (/https?:\/\//i.test(meaningful)) return "";
  if (/\b(call|email|text|pay|buy|read|submit|due|quiz|exam|assignment|appointment|meeting|orientation)\b/i.test(meaningful)) return "";

  const disposablePhrases = new Set([
    "test",
    "testing",
    "testing dictation",
    "test dictation",
    "dictation test",
    "capture test",
    "phone test",
    "mobile test",
    "sync test",
    "obsidian sync test",
    "horizon test",
  ]);
  if (disposablePhrases.has(normalized)) return "This looks like a device, dictation, or sync test rather than reusable content.";
  if (normalized.length <= 70 && /\b(never mind|nevermind|nvm|ignore this|disregard|scratch that)\b/.test(normalized)) {
    return "This looks like a canceled or throwaway capture rather than something worth saving.";
  }
  // Short captures that ARE just a trash-word (e.g. a "# Capture" heading plus "trash")
  // should offer cleanup too, including captures that contain only a cleanup instruction.
  if (normalized.length <= 34 && /\b(trash|junk|garbage|throwaway|throw away|delete this|delete me|discard)\b/.test(normalized)) {
    return "This capture only says to trash or discard it, so it is probably safe to delete.";
  }
  if (normalized.length <= 34 && /\b(test|testing)\b/.test(normalized)) {
    return "This is a very short testing capture and does not appear to contain reusable information.";
  }
  return "";
}

function buildDeleteCaptureAction(source: QueuedCaptureSource, reason: string, value: string): CaptureAction {
  const meaningful = queueMeaningfulText(value);
  return {
    confidence: "high",
    id: `delete-${source.id}`,
    label: "Delete capture",
    payload: {
      body: meaningful || "Empty synced capture.",
      source: source.path,
      title: `Delete ${source.title || source.id}`,
    },
    reason,
    requires_approval: true,
    type: "delete_capture",
  };
}

function withQueuedDeleteChoice(triage: CaptureTriage, value: string, source?: QueuedCaptureSource | null): CaptureTriage {
  if (!source) return triage;
  if (triage.actions.some((action) => action.type === "delete_capture")) return triage;
  const reason = lowValueQueuedCaptureReason(value);
  if (!reason) return triage;

  return {
    ...triage,
    actions: [buildDeleteCaptureAction(source, reason, value), ...triage.actions],
    summary: `${triage.summary} Horizon also found this may be safe to delete because it looks like a low-value queue test.`,
  };
}

function disposableQueueTriage(value: string, source: QueuedCaptureSource, reason: string): CaptureTriage {
  return {
    actions: [buildDeleteCaptureAction(source, reason, value)],
    confidence: "high",
    needs_input: false,
    questions: [],
    summary: "This queued capture does not appear to contain reusable information.",
  };
}

function alignCaptureViewport() {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const main = document.querySelector("main") as HTMLElement | null;
      if (main && (main.scrollTop !== 0 || main.scrollLeft !== 0)) {
        main.scrollTo({ behavior: "auto", left: 0, top: 0 });
      }
      if (window.scrollX !== 0 || window.scrollY !== 0) {
        window.scrollTo({ behavior: "auto", left: 0, top: 0 });
      }
    });
  });
}

function currentStep(
  status: "idle" | "thinking" | "ready" | "applying" | "applied" | "undone" | "error",
  draftAction: CaptureAction | null,
  appliedCount: number,
  triage: CaptureTriage | null,
) {
  if (status === "error") return 1;
  if (status === "thinking") return 1;
  if (status === "applying") return 3;
  if (appliedCount > 0) return 4; // PHASE-11: "Saved" once any action has been applied
  if (draftAction) return 2;
  if (status === "ready" && triage?.actions?.length) return 2;
  if (status === "ready") return 1;
  return 0;
}

function PreviewInput({
  label,
  onChange,
  placeholder,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  value: string;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <input className={fieldClass} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} type={type} value={value} />
    </label>
  );
}

function PreviewSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <select className={fieldClass} onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option || "unknown"}
          </option>
        ))}
      </select>
    </label>
  );
}

function PreviewTextarea({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <textarea className={textareaClass} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} value={value} />
    </label>
  );
}

export function CaptureWorkspace({
  allowAi,
  audioHandle,
  autoRunKey,
  focusKey,
  onApplied,
  onClose,
  onHasNextQueuedCapture,
  onNextQueuedCapture,
  onQueueChanged,
  onTextChange,
  queueSource,
  soundVolume,
  text,
}: CaptureWorkspaceProps) {
  const [status, setStatus] = useState<"idle" | "thinking" | "ready" | "applying" | "applied" | "undone" | "error">("idle");
  const [triage, setTriage] = useState<CaptureTriage | null>(null);
  const [activeAction, setActiveAction] = useState<CaptureAction | null>(null);
  const [draftAction, setDraftAction] = useState<CaptureAction | null>(null);
  const [result, setResult] = useState<CaptureApplyResult | null>(null);
  const [message, setMessage] = useState("Paste anything. Horizon will turn it into a few safe next actions.");
  const [loadingNextCapture, setLoadingNextCapture] = useState(false);
  const [nextCaptureAvailable, setNextCaptureAvailable] = useState<boolean | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [actionMeta, setActionMeta] = useState<CaptureActionMeta[]>(FALLBACK_ACTION_META);
  const [projectOptions, setProjectOptions] = useState<VaultProjectRecord[]>([]);
  // PHASE-11: one capture can apply MULTIPLE suggested actions (no more "pick one, lose
  // the rest"). Each successful apply is recorded here with its own undo token, and the
  // triage list stays open instead of going terminal.
  const [appliedActions, setAppliedActions] = useState<AppliedRecord[]>([]);
  const [batchApplying, setBatchApplying] = useState(false);
  const lastAutoRunKeyRef = useRef(0);
  const mainTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const appliedIds = new Set(appliedActions.map((record) => record.actionId));

  useEffect(() => {
    if (focusKey === 0) return;
    const timer = window.setTimeout(() => mainTextareaRef.current?.focus(), 120);
    return () => window.clearTimeout(timer);
  }, [focusKey]);

  useEffect(() => {
    let cancelled = false;
    void fetchCaptureActionMeta().then((meta) => {
      if (!cancelled) setActionMeta(meta);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchVaultProjects().then((projects) => {
      if (!cancelled) setProjectOptions(projects);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function playCue(kind: CaptureSoundKind) {
    void playCaptureSound(audioHandle, kind, soundVolume);
  }

  function selectAction(action: CaptureAction) {
    const next = cloneAction(action);
    setActiveAction(next);
    setDraftAction(next);
    setResult(null);
    setLoadingNextCapture(false);
    setNextCaptureAvailable(null);
    setStatus("ready");
    setMessage(
      next.type === "delete_capture"
        ? "Delete Capture is ready. Review the explanation, then allow the file deletion if this has no value."
        : `${confirmLabel(actionMeta, next.type)} is ready. Check the fields, then allow the local write.`,
    );
    playCue("capture-input");
  }

  function updateDraftAction(next: CaptureAction) {
    setDraftAction(next);
    setActiveAction(next);
  }

  function updateDraftPayload(field: PayloadKey, value: string) {
    if (!draftAction) return;
    updateDraftAction({
      ...draftAction,
      payload: {
        ...(draftAction.payload || {}),
        [field]: value,
      },
    });
  }

  function updateDraftReason(value: string) {
    if (!draftAction) return;
    updateDraftAction({ ...draftAction, reason: value });
  }

  function cancelDraft() {
    setDraftAction(null);
    setActiveAction(null);
    setResult(null);
    setLoadingNextCapture(false);
    setNextCaptureAvailable(null);
    setStatus(triage ? "ready" : "idle");
    setMessage(triage?.summary || "Paste anything. Horizon will turn it into a few safe next actions.");
  }

  function finishCapture() {
    setStatus("idle");
    setTriage(null);
    setActiveAction(null);
    setDraftAction(null);
    setResult(null);
    setAppliedActions([]);
    setLoadingNextCapture(false);
    setNextCaptureAvailable(null);
    setMessage("Paste anything. Horizon will turn it into a few safe next actions.");
    onTextChange("");
    onClose();
  }

  async function runTriage() {
    const value = text.trim();
    if (!value) {
      const reason = queueSource ? lowValueQueuedCaptureReason(text) : "";
      if (queueSource && reason) {
        const nextTriage = disposableQueueTriage(text, queueSource, reason);
        setStatus("ready");
        setTriage(nextTriage);
        setActiveAction(null);
        setDraftAction(null);
        setResult(null);
        setLoadingNextCapture(false);
        setNextCaptureAvailable(null);
        setMessage(`${nextTriage.summary} Choose Delete Capture below if you want Horizon to remove the synced queue file.`);
        playCue("capture-ready");
        return;
      }
      setStatus("idle");
      setMessage("Add a note, reminder, file path, URL, or loose thought first.");
      playCue("capture-input");
      return;
    }

    void warmFocusAudio(audioHandle, soundVolume);
    playCue("capture-start");
    setStatus("thinking");
    setTriage(null);
    setActiveAction(null);
    setDraftAction(null);
    setResult(null);
    setAppliedActions([]);
    setLoadingNextCapture(false);
    setNextCaptureAvailable(null);
    setMessage(
      allowAi
        ? "Reading the capture, separating facts from guesses, and preparing safe choices..."
        : "Running local capture rules and preparing safe choices...",
    );

    try {
      const response = await fetch("/api/capture/triage", {
        body: JSON.stringify({ allowAi, text: value }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as { message?: string; triage?: CaptureTriage };
      if (!response.ok || !data.triage) throw new Error(data.message || "Capture triage failed.");
      const nextTriage = withQueuedDeleteChoice(data.triage, value, queueSource);
      setTriage(nextTriage);
      setStatus("ready");
      setMessage(
        nextTriage.actions.length
          ? `${nextTriage.summary} Choose one action below to review before anything is saved.`
          : nextTriage.summary,
      );
      playCue(nextTriage.needs_input || nextTriage.questions.length ? "capture-input" : "capture-ready");
    } catch (error) {
      const reason = queueSource ? lowValueQueuedCaptureReason(value || text) : "";
      if (queueSource && reason) {
        const nextTriage = disposableQueueTriage(value || text, queueSource, reason);
        setTriage(nextTriage);
        setStatus("ready");
        setMessage(`${nextTriage.summary} The AI triage was unavailable, but this cleanup choice is local and deterministic.`);
        playCue("capture-ready");
        return;
      }
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Capture triage could not run.");
      playCue("capture-error");
    }
  }

  // PHASE-11: record a successful apply and return to the triage list (non-terminal) so
  // the remaining suggestions can still be applied. Each record keeps its own undo token.
  function recordApplied(action: CaptureAction, nextResult: CaptureApplyResult) {
    setAppliedActions((prev) => [
      ...prev,
      { actionId: action.id, type: action.type, label: savedLabel(actionMeta, action.type), result: nextResult, undone: false },
    ]);
    setResult(null);
    setDraftAction(null);
    setActiveAction(null);
    setStatus("ready");
  }

  async function applyAction(action: CaptureAction | null = draftAction): Promise<boolean> {
    if (!action) return false;
    setActiveAction(action);
    setResult(null);
    setNextCaptureAvailable(null);
    setStatus("applying");
    setMessage(
      action.type === "delete_capture"
        ? "Deleting the synced capture file from Inbox/To Triage..."
        : `${confirmLabel(actionMeta, action.type)} is running as a local Horizon write...`,
    );

    try {
      if (action.type === "delete_capture") {
        if (!queueSource) throw new Error("No synced queue file is attached to this capture.");
        const response = await fetch(`/api/capture/queue/${encodeURIComponent(queueSource.id)}`, { method: "DELETE" });
        const data = (await response.json()) as CaptureApplyResult & { deleted?: boolean; error?: string; message?: string; ok?: boolean };
        if (!response.ok || !data.ok) throw new Error(data.error || data.message || "Capture file could not be deleted.");
        const nextResult: CaptureApplyResult = {
          message: data.message || "Deleted the synced capture file.",
          ok: true,
          outputs: [{ label: data.deleted === false ? "Already gone" : "Deleted", path: queueSource.path }],
          refreshCalendar: false,
          undo: { available: false, label: "Permanent queue delete" },
        };
        recordApplied(action, nextResult);
        setMessage(nextResult.message || savedLabel(actionMeta, action.type));
        playCue("capture-save");
        onQueueChanged?.();
        onApplied(nextResult);
        await refreshQueueContinuation(action);
        return true;
      }

      const response = await fetch("/api/capture/apply", {
        body: JSON.stringify({ action, queueSource, text }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as CaptureApplyResult & { message?: string };
      if (!response.ok) throw new Error(data.message || "Capture action failed.");
      recordApplied(action, data);
      setMessage(data.message || savedLabel(actionMeta, action.type));
      playCue("capture-save");
      onApplied(data);
      if (queueSource) {
        onQueueChanged?.();
      }
      await refreshQueueContinuation(action);
      return true;
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Capture action could not be applied.");
      playCue("capture-error");
      return false;
    }
  }

  // PHASE-11: apply every remaining (not-yet-applied) suggestion sequentially. Each still
  // goes through the same /api/capture/apply write and is independently undoable; the plan
  // for each is visible on its list card, so approve-before-act holds. Sequential (not
  // parallel) so two calendar writes never race the same RCF read/write cycle.
  async function applyAllRemaining() {
    if (!triage?.actions?.length || batchApplying) return;
    const remaining = triage.actions.filter(
      (action) => action.type !== "delete_capture" && !appliedIds.has(action.id),
    );
    if (!remaining.length) return;
    setBatchApplying(true);
    setDraftAction(null);
    try {
      for (const action of remaining) {
        // eslint-disable-next-line no-await-in-loop
        const ok = await applyAction(cloneAction(action));
        if (!ok) break; // surface the error; leave the rest for the user to retry
      }
    } finally {
      setBatchApplying(false);
    }
  }

  async function undoApplied(record: AppliedRecord) {
    const token = record.result.undo?.token;
    if (!token || undoing || record.undone) return;
    setUndoing(true);
    setMessage(`Undoing ${record.label}...`);
    try {
      const response = await fetch("/api/capture/undo", {
        body: JSON.stringify({ token }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as CaptureUndoResult & { message?: string; ok?: boolean };
      if (!response.ok) throw new Error(data.message || "Capture undo failed.");
      setAppliedActions((prev) =>
        prev.map((item) =>
          item.actionId === record.actionId
            ? { ...item, undone: true, result: { ...item.result, undo: { ...item.result.undo, available: false }, undone: true } }
            : item,
        ),
      );
      setMessage(data.message || `${record.label} undone.`);
      playCue("capture-undo");
      onApplied({ ok: true, refreshCalendar: data.refreshCalendar, undone: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Capture undo could not run.");
      playCue("capture-error");
    } finally {
      setUndoing(false);
    }
  }

  async function refreshQueueContinuation(action: CaptureAction) {
    if (!queueSource || !onHasNextQueuedCapture) {
      setNextCaptureAvailable(null);
      return;
    }

    const hasNext = await onHasNextQueuedCapture(queueSource.id);
    setNextCaptureAvailable(hasNext);
    if (hasNext) return;

    setMessage(
      action.type === "delete_capture"
        ? "Capture queue is empty. Nice clean slate."
        : "No other captures are waiting in the queue.",
    );
  }

  async function continueToNextCapture() {
    if (!onNextQueuedCapture || loadingNextCapture) return;
    setLoadingNextCapture(true);
    setMessage("Checking the synced queue for the next capture...");
    try {
      const opened = await onNextQueuedCapture(queueSource?.id);
      if (!opened) {
        setNextCaptureAvailable(false);
        setMessage("Capture queue is empty. Nice clean slate.");
        playCue("capture-ready");
      }
    } finally {
      setLoadingNextCapture(false);
    }
  }

  useEffect(() => {
    if (autoRunKey <= 0 || autoRunKey === lastAutoRunKeyRef.current) return;
    lastAutoRunKeyRef.current = autoRunKey;
    void runTriage();
  }, [autoRunKey]);

  useEffect(() => {
    if (status === "idle") return;
    alignCaptureViewport();
  }, [draftAction?.id, appliedActions.length, status, triage?.actions.length]);

  const draftPayload = draftAction?.payload || {};
  const canApplyDraft = Boolean(draftAction) && status !== "thinking" && status !== "applying";
  // Retriage is blocked while reviewing a draft, mid-apply, or once anything has been
  // applied this session (a fresh triage would drop the applied list + its undo tokens).
  const triageLocked = Boolean(draftAction) || status === "applying" || appliedActions.length > 0;
  const busy = status === "thinking" || status === "applying" || batchApplying;
  const remainingCount = triage?.actions
    ? triage.actions.filter((action) => action.type !== "delete_capture" && !appliedIds.has(action.id)).length
    : 0;
  const step = currentStep(status, draftAction, appliedActions.length, triage);
  const triageButtonLabel = status === "thinking" ? "Reading Capture" : triageLocked ? "Action Selected" : triage ? "Retriage" : "Triage Capture";
  const TriageButtonIcon = status === "thinking" ? Loader2 : triageLocked ? CheckCircle2 : triage ? RotateCcw : Sparkles;
  const doneLabel = queueSource && appliedActions.length && nextCaptureAvailable === false ? "Return home" : "Done";
  const showNextCaptureButton = Boolean(queueSource && onNextQueuedCapture && nextCaptureAvailable === true);

  return (
    <Panel className="capture-workspace-panel p-4">
      <header className="mb-4 flex items-start justify-between gap-4 border-b border-white/8 pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <PenLine className="h-5 w-5 flex-none text-slate-300" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white">Capture</h2>
            <p className="mt-1 text-sm text-slate-400">Sort raw input into one clean local action. Nothing is saved until you allow it.</p>
          </div>
        </div>
        <button
          className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 text-sm text-slate-300 transition duration-300 hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
          onClick={onClose}
          type="button"
        >
          <ArrowLeft className="h-4 w-4" />
          Home
        </button>
      </header>

      <div className="capture-step-rail" aria-label="Capture progress">
        {["Capture", "Triage", "Review", "Allow", "Saved"].map((label, index) => (
          <div
            className={`capture-step ${index <= step ? "capture-step-active" : ""} ${index === step ? "capture-step-current" : ""}`}
            key={label}
          >
            <span className="capture-step-dot" />
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div className="capture-workspace-grid">
        <div className="capture-compose">
          <textarea
            className="capture-main-textarea min-h-[230px] w-full resize-none rounded-2xl border border-white/10 bg-slate-950/35 p-4 text-base leading-relaxed text-slate-100 outline-none transition placeholder:italic placeholder:text-slate-600 focus:border-[rgba(var(--accent-rgb),0.55)] focus:ring-4 focus:ring-[rgba(var(--accent-rgb),0.1)]"
            onChange={(event) => onTextChange(event.target.value)}
            placeholder="Paste a reminder, rough note, syllabus bit, URL, file path, quote, email idea..."
            ref={mainTextareaRef}
            value={text}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">{text.trim().length} characters</p>
            <button
              className="capture-primary-soft flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-45"
              disabled={status === "thinking" || status === "applying" || triageLocked}
              onClick={() => void runTriage()}
              type="button"
            >
              <TriageButtonIcon className={`h-4 w-4 ${status === "thinking" ? "animate-spin" : ""}`} />
              {triageButtonLabel}
            </button>
          </div>
        </div>

        <aside className="capture-triage-surface">
          {status === "thinking" ? (
            <div className="capture-thinking">
              <div aria-hidden="true" className="capture-thinking-orbit">
                <span />
                <span />
                <span />
              </div>
              <div>
                <h3 className="text-lg font-medium text-white">Reading capture</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{message}</p>
              </div>
              <div className="capture-thinking-steps">
                <span>facts</span>
                <span>route</span>
                <span>choices</span>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="capture-status-card">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  <FileText className="h-4 w-4" />
                  Capture status
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-300">{message}</p>
                {triage ? (
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                    <span className="capture-mini-pill">Confidence: {triage.confidence}</span>
                    <span className="capture-mini-pill">{triage.actions.length} choice{triage.actions.length === 1 ? "" : "s"}</span>
                  </div>
                ) : null}
                {triage?.actions?.length && !draftAction ? (
                  <div className="capture-next-hint mt-4">
                    <CheckCircle2 className="h-4 w-4 flex-none" />
                    <span>Pick an action below. Horizon will show the exact local write before it saves anything.</span>
                  </div>
                ) : null}
              </div>

              {draftAction && status !== "applied" && status !== "undone" ? (
                <div className={`capture-review-panel ${draftAction.type === "delete_capture" ? "capture-review-panel-destructive" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[rgb(var(--accent-rgb))]">Allow action</div>
                      <h3 className="mt-2 truncate text-lg font-medium text-white">{confirmLabel(actionMeta, draftAction.type)}</h3>
                      <p className="mt-1 text-sm text-slate-400">{actionTitle(actionMeta, draftAction)}</p>
                    </div>
                    <div className="capture-review-actions">
                      {canApplyDraft ? (
                        <>
                          <button className="capture-review-secondary-button" onClick={cancelDraft} type="button">
                            <X className="h-4 w-4" />
                            Back
                          </button>
                          <button
                            className={`capture-allow-button flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-medium text-white ${
                              draftAction.type === "delete_capture" ? "capture-allow-button-destructive" : ""
                            }`}
                            onClick={() => void applyAction(draftAction)}
                            type="button"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            {confirmLabel(actionMeta, draftAction.type)}
                          </button>
                        </>
                      ) : null}
                      {draftAction && status === "applying" ? (
                        <button className="capture-allow-button flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-medium text-white opacity-75" disabled type="button">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Saving
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="capture-permission-strip">
                    <span>{actionPermission(actionMeta, draftAction)}</span>
                    <span>{actionExternalBoundary(actionMeta, draftAction)}</span>
                  </div>

                  <div className="capture-plain-plan mt-4">
                    <span>What happens</span>
                    <p>{actionPlan(actionMeta, draftAction)}</p>
                  </div>

                  <div className="capture-review-fields mt-4 grid gap-3">
                    <PreviewInput
                      label="Title"
                      onChange={(value) => updateDraftPayload("title", value)}
                      placeholder="Clean title"
                      value={draftPayload.title || ""}
                    />

                    {draftAction.type === "create_calendar_item" ? (
                      <>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <PreviewInput label="Date" onChange={(value) => updateDraftPayload("date", value)} placeholder="YYYY-MM-DD or unknown" value={draftPayload.date || ""} />
                          <PreviewInput label="Start" onChange={(value) => updateDraftPayload("time_start", value)} placeholder="HH:MM" value={draftPayload.time_start || ""} />
                          <PreviewInput label="End" onChange={(value) => updateDraftPayload("time_end", value)} placeholder="HH:MM" value={draftPayload.time_end || ""} />
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <PreviewInput label="Category" onChange={(value) => updateDraftPayload("category", value)} placeholder="School, Personal, Business..." value={draftPayload.category || ""} />
                          <PreviewSelect label="Importance" onChange={(value) => updateDraftPayload("importance", value)} options={["", "low", "medium", "high"]} value={draftPayload.importance || ""} />
                        </div>
                        <PreviewTextarea
                          label="Action needed"
                          onChange={(value) => updateDraftPayload("action_needed", value)}
                          placeholder="What should you do next?"
                          value={draftPayload.action_needed || ""}
                        />
                      </>
                    ) : null}

                    {draftAction.type === "draft_email" ? (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <PreviewInput label="To" onChange={(value) => updateDraftPayload("email_to", value)} placeholder="Recipient or unknown" value={draftPayload.email_to || ""} />
                        <PreviewInput label="Subject" onChange={(value) => updateDraftPayload("email_subject", value)} placeholder="Draft subject" value={draftPayload.email_subject || ""} />
                      </div>
                    ) : null}

                    {draftAction.type === "attach_to_project" ? (
                      <PreviewSelect
                        label="Project"
                        onChange={(value) => updateDraftPayload("project", value)}
                        options={
                          projectOptions.length
                            ? [
                                "",
                                ...(draftPayload.project && !projectOptions.some((option) => option.name === draftPayload.project) ? [draftPayload.project] : []),
                                ...projectOptions.map((option) => option.name),
                              ]
                            : []
                        }
                        value={draftPayload.project || ""}
                      />
                    ) : null}

                    {draftAction.type === "attach_to_project" && !projectOptions.length ? (
                      <PreviewInput label="Project" onChange={(value) => updateDraftPayload("project", value)} placeholder="Project name or unknown" value={draftPayload.project || ""} />
                    ) : null}

                    {draftAction.type === "create_project" ? (
                      <PreviewInput label="Project" onChange={(value) => updateDraftPayload("project", value)} placeholder="Project name or unknown" value={draftPayload.project || ""} />
                    ) : null}

                    {draftAction.type === "organize_file" ? (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <PreviewInput label="Source" onChange={(value) => updateDraftPayload("source", value)} placeholder="File path, URL, or unknown" value={draftPayload.source || ""} />
                        <PreviewInput label="Destination" onChange={(value) => updateDraftPayload("destination", value)} placeholder="Where it should go" value={draftPayload.destination || ""} />
                      </div>
                    ) : null}

                    {draftAction.type === "add_to_zotero" ? (
                      <>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <PreviewInput label="Item type" onChange={(value) => updateDraftPayload("zotero_item_type", value)} placeholder="journalArticle, webpage, document" value={draftPayload.zotero_item_type || ""} />
                          <PreviewInput label="DOI" onChange={(value) => updateDraftPayload("doi", value)} placeholder="DOI if known" value={draftPayload.doi || ""} />
                          <PreviewInput label="URL" onChange={(value) => updateDraftPayload("url", value)} placeholder="Source URL if known" value={draftPayload.url || draftPayload.source || ""} />
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <PreviewInput label="Authors" onChange={(value) => updateDraftPayload("authors", value)} placeholder="Names separated by semicolons" value={draftPayload.authors || ""} />
                          <PreviewInput label="Publication" onChange={(value) => updateDraftPayload("publication_title", value)} placeholder="Journal/site/book if known" value={draftPayload.publication_title || ""} />
                        </div>
                      </>
                    ) : null}

                    {draftAction.type === "save_note" ? (
                      <PreviewInput label="Destination" onChange={(value) => updateDraftPayload("destination", value)} placeholder="Inbox unless a better existing place applies" value={draftPayload.destination || ""} />
                    ) : null}

                    <PreviewTextarea
                      label={draftAction.type === "create_calendar_item" ? "Details" : "Cleaned body"}
                      onChange={(value) => updateDraftPayload("body", value)}
                      placeholder="The cleaned content Horizon will save"
                      value={draftPayload.body || ""}
                    />
                    <PreviewTextarea label="Reason" onChange={updateDraftReason} placeholder="Why this action is useful" value={draftAction.reason || ""} />
                  </div>
                </div>
              ) : null}

              {appliedActions.length ? (
                <div className="capture-result-panel">
                  <div className="flex items-center gap-2 text-sm font-medium text-white">
                    <CheckCircle2 className="h-4 w-4 text-emerald-200" />
                    Applied {appliedActions.filter((record) => !record.undone).length} of {appliedActions.length}
                    {appliedActions.length > 1 ? " actions" : " action"}
                  </div>
                  <div className="mt-3 grid gap-2">
                    {appliedActions.map((record) => (
                      <div
                        key={record.actionId}
                        className={`rounded-lg border border-white/8 bg-white/[0.02] p-2.5 ${record.undone ? "opacity-55" : ""}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 text-sm text-white">
                            <CheckCircle2 className={`h-3.5 w-3.5 ${record.undone ? "text-slate-400" : "text-emerald-300"}`} />
                            {record.undone ? `${record.label} (undone)` : record.label}
                          </span>
                          {record.result.undo?.available && record.result.undo.token && !record.undone ? (
                            <button
                              className="flex h-7 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 text-xs text-slate-200 transition hover:border-amber-300/30 hover:text-amber-100 disabled:opacity-55"
                              disabled={undoing}
                              onClick={() => void undoApplied(record)}
                              type="button"
                            >
                              <RotateCcw className="h-3 w-3" />
                              Undo
                            </button>
                          ) : null}
                        </div>
                        {record.result.outputs?.length ? (
                          <div className="mt-1.5 grid gap-0.5 pl-5">
                            {record.result.outputs.map((output) => (
                              <div key={`${output.label}-${output.path}`} className="truncate text-xs text-slate-500">
                                {output.label}: <span className="text-slate-400">{output.path}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  {remainingCount ? (
                    <p className="mt-3 text-xs leading-relaxed text-slate-500">
                      {remainingCount} more suggestion{remainingCount === 1 ? "" : "s"} above — apply any you want, or finish.
                    </p>
                  ) : null}
                  <div className="capture-result-actions mt-4">
                    <button className="capture-done-button flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium text-white" onClick={finishCapture} type="button">
                      <CheckCircle2 className="h-4 w-4" />
                      {doneLabel}
                    </button>
                    {showNextCaptureButton ? (
                      <button
                        className="capture-next-button flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium"
                        disabled={loadingNextCapture}
                        onClick={() => void continueToNextCapture()}
                        type="button"
                      >
                        {loadingNextCapture ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                        Next capture
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </aside>
      </div>

      <footer className="capture-action-dock mt-4">
        {triage?.questions?.length ? (
          <div className="capture-question-callout">
            <HelpCircle className="h-4 w-4 flex-none" />
            <span>{triage.questions[0]}</span>
          </div>
        ) : null}
        {triage?.actions?.length ? (
          <div className="capture-action-dock-heading">
            <span>Review choices</span>
            <p>
              {remainingCount > 1
                ? "Apply as many as you want — each is reviewed and undone independently."
                : "Choose the local action you want Horizon to prepare."}
            </p>
          </div>
        ) : null}
          <div className="capture-action-list">
          {triage?.actions?.length
            ? triage.actions.map((action) => {
                const selected = draftAction?.id === action.id;
                const destructive = action.type === "delete_capture";
                const isApplied = appliedIds.has(action.id);
                return (
                  <button
                    className={`capture-action-card ${selected ? "capture-action-card-selected" : ""} ${
                      destructive ? "capture-action-card-destructive" : ""
                    } ${isApplied ? "capture-action-card-applied" : ""}`}
                    disabled={busy || isApplied}
                    key={action.id}
                    onClick={() => selectAction(action)}
                    type="button"
                  >
                    <span className="capture-action-icon">{isApplied ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : actionIcon(action.type)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-white">{confirmLabel(actionMeta, action.type)}</span>
                      <span className="mt-1 block text-xs text-slate-400">{actionSubtitle(action)}</span>
                      <span className="capture-action-card-plan">{actionPlan(actionMeta, action)}</span>
                    </span>
                    <span className="capture-confidence-pill">{isApplied ? "applied" : action.confidence}</span>
                  </button>
                );
              })
            : null}
        </div>
        {remainingCount > 1 ? (
          <button
            className="mt-3 flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-4 text-sm font-medium text-emerald-100 transition hover:bg-emerald-300/16 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy}
            onClick={() => void applyAllRemaining()}
            type="button"
          >
            {batchApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Apply all {remainingCount} remaining
          </button>
        ) : null}
        {!triage?.actions?.length ? (
          <button
            className="ml-auto flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-slate-200 transition duration-300 hover:border-white/20 hover:bg-white/[0.06]"
            onClick={() => void runTriage()}
            type="button"
          >
            <SendHorizonal className="h-4 w-4" />
            Prepare actions
          </button>
        ) : null}
      </footer>
    </Panel>
  );
}
