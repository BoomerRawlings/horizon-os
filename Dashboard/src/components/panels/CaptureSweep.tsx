// PHASE-05 ⭐ Sweep the pile: batch triage the unhandled capture pile with one-click
// action buttons. Renders INSIDE the existing capture motion-layer (App.tsx swaps this in
// for CaptureWorkspace when captureMode === "sweep") - no new screen/route/transition, per
// the phase card's STOP rule. Reuses the registry loop end to end:
//   GET  /api/capture/pile           - the two-source pile (to_triage + queue)
//   POST /api/capture/pile/triage    - same AI triage as the single flow, one item
//   POST /api/capture/apply          - UNCHANGED apply path (per-item, with undo)
//   POST /api/capture/pile/resolve   - one-item source cleanup (queue done / blank delete)
//   POST /api/capture/undo           - the same per-apply undo the single flow has
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Loader2,
  RotateCcw,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { Panel } from "../ui/Panel";
import { FALLBACK_ACTION_META, fetchCaptureActionMeta, metaById, type CaptureActionMeta } from "../../data/captureActionMeta";

type PileSource = "to_triage" | "queue";

export type PileItem = {
  id: string;
  source: PileSource;
  path: string;
  title: string;
  textPreview: string;
  text: string;
  blank: boolean;
  blankReason: string;
  modified: string;
};

type SuggestedAction = {
  id?: string;
  label?: string;
  type: string;
  confidence: "high" | "medium" | "low";
  reason?: string;
  requires_approval?: boolean;
  payload?: Record<string, unknown>;
};

type TriageResponse = {
  ok: boolean;
  message?: string;
  triage?: {
    summary?: string;
    confidence?: string;
    needs_input?: boolean;
    actions?: SuggestedAction[];
  };
};

type ApplyResponse = {
  ok?: boolean;
  message?: string;
  outputs?: Array<{ label: string; path: string }>;
  undo?: { available?: boolean; token?: string };
  refreshCalendar?: boolean;
};

type RowStatus =
  | "idle"
  | "triaging"
  | "suggested"
  | "no_suggestion"
  | "applying"
  | "applied"
  | "skipped"
  | "error";

type RowState = {
  status: RowStatus;
  suggestion?: SuggestedAction;
  message?: string;
  undoToken?: string;
  undone?: boolean;
};

type CaptureSweepProps = {
  allowAi: boolean;
  onApplied: (result: ApplyResponse) => void;
  onClose: () => void;
  onQueueChanged?: () => void;
  onOpenSingle: (item: PileItem) => void;
  refreshKey?: number;
};

const rowKey = (item: PileItem) => `${item.source}:${item.id}`;

function confidenceTone(confidence?: string) {
  if (confidence === "high") return "border-emerald-300/30 bg-emerald-300/10 text-emerald-200";
  if (confidence === "medium") return "border-amber-300/30 bg-amber-300/10 text-amber-200";
  return "border-slate-400/25 bg-white/[0.04] text-slate-300";
}

function sourceLabel(source: PileSource) {
  return source === "to_triage" ? "Synced note" : "Queued capture";
}

export function CaptureSweep({ allowAi, onApplied, onClose, onQueueChanged, onOpenSingle, refreshKey = 0 }: CaptureSweepProps) {
  const [items, setItems] = useState<PileItem[]>([]);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [meta, setMeta] = useState<CaptureActionMeta[]>(FALLBACK_ACTION_META);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchLog, setBatchLog] = useState<string[]>([]);
  const [summary, setSummary] = useState("");
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    let cancelled = false;
    void fetchCaptureActionMeta().then((next) => {
      if (!cancelled) setMeta(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadPile = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/capture/pile", { cache: "no-store" });
      const data = (await response.json()) as { ok?: boolean; items?: PileItem[]; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "The capture pile could not be loaded.");
      setItems(data.items ?? []);
      // Preserve row state for items still present; drop the rest.
      setRows((current) => {
        const next: Record<string, RowState> = {};
        for (const item of data.items ?? []) {
          const key = rowKey(item);
          next[key] = current[key] ?? { status: "idle" };
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The capture pile could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPile();
  }, [loadPile, refreshKey]);

  function patchRow(key: string, patch: Partial<RowState>) {
    setRows((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  }

  const metaLabel = useCallback(
    (type: string) => metaById(meta, type).confirmLabel || type,
    [meta],
  );

  // Runs the same assisted/local triage the single flow uses; primary suggestion = first action.
  async function triageItem(item: PileItem): Promise<SuggestedAction | null> {
    const key = rowKey(item);
    patchRow(key, { status: "triaging", message: "" });
    try {
      const response = await fetch("/api/capture/pile/triage", {
        body: JSON.stringify({ allowAi, id: item.id, source: item.source, text: item.text }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as TriageResponse & { error?: string };
      if (!response.ok || !data.ok) throw new Error(data.message || data.error || "Triage failed.");
      const suggestion = data.triage?.actions?.[0];
      if (!suggestion) {
        patchRow(key, { status: "no_suggestion", message: data.triage?.summary || "No suggested action - open it to decide." });
        return null;
      }
      patchRow(key, { status: "suggested", suggestion });
      return suggestion;
    } catch (err) {
      patchRow(key, { status: "error", message: err instanceof Error ? err.message : "Triage failed." });
      return null;
    }
  }

  // Apply reuses /api/capture/apply UNCHANGED. to_triage passes queueSource so apply
  // deletes the redundant source file atomically (the proven single-flow path); queue
  // items have no such cleanup in apply, so we mark the queue request done via resolve.
  async function applyItem(item: PileItem, action: SuggestedAction): Promise<boolean> {
    const key = rowKey(item);
    patchRow(key, { status: "applying", message: "" });
    try {
      const applyResponse = await fetch("/api/capture/apply", {
        body: JSON.stringify({
          action,
          queueSource: item.source === "to_triage" ? { id: item.id, path: item.path } : undefined,
          text: item.text,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const applyData = (await applyResponse.json()) as ApplyResponse;
      if (!applyResponse.ok || applyData.ok === false) throw new Error(applyData.message || "Apply failed.");

      if (item.source === "queue") {
        await fetch("/api/capture/pile/resolve", {
          body: JSON.stringify({ id: item.id, source: "queue", disposition: "applied" }),
          headers: { "content-type": "application/json" },
          method: "POST",
        });
      }

      patchRow(key, {
        status: "applied",
        message: applyData.message || `${metaLabel(action.type)} done.`,
        undoToken: applyData.undo?.available ? applyData.undo?.token : undefined,
        undone: false,
      });
      onApplied(applyData);
      onQueueChanged?.();
      return true;
    } catch (err) {
      patchRow(key, { status: "error", message: err instanceof Error ? err.message : "Apply failed." });
      return false;
    }
  }

  async function triageAndMaybeShow(item: PileItem) {
    await triageItem(item);
  }

  async function skipItem(item: PileItem) {
    patchRow(rowKey(item), { status: "skipped", message: "Left untouched." });
  }

  async function deleteBlankItem(item: PileItem) {
    const key = rowKey(item);
    patchRow(key, { status: "applying", message: "" });
    try {
      const response = await fetch("/api/capture/pile/resolve", {
        body: JSON.stringify({ id: item.id, source: item.source, disposition: "delete_blank" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as { ok?: boolean; message?: string };
      if (!response.ok || data.ok === false) throw new Error(data.message || "Delete failed.");
      patchRow(key, { status: "applied", message: "Deleted empty capture." });
      onQueueChanged?.();
    } catch (err) {
      patchRow(key, { status: "error", message: err instanceof Error ? err.message : "Delete failed." });
    }
  }

  async function undoItem(item: PileItem) {
    const key = rowKey(item);
    const token = rowsRef.current[key]?.undoToken;
    if (!token) return;
    patchRow(key, { status: "applying", message: "Undoing..." });
    try {
      const response = await fetch("/api/capture/undo", {
        body: JSON.stringify({ token }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as { ok?: boolean; message?: string };
      if (!response.ok || data.ok === false) throw new Error(data.message || "Undo failed.");
      // The apply outputs are removed; a deleted to_triage source file is NOT restored
      // (same as the single flow - undo only removes files the apply created).
      patchRow(key, {
        status: "suggested",
        undoToken: undefined,
        undone: true,
        message: item.source === "to_triage" ? "Undone (the synced source file stays removed)." : "Undone.",
      });
      onApplied({ refreshCalendar: true });
    } catch (err) {
      patchRow(key, { status: "error", message: err instanceof Error ? err.message : "Undo failed." });
    }
  }

  async function triageAll() {
    setBatchRunning(true);
    setSummary("");
    const log: string[] = [];
    for (const item of items) {
      const state = rowsRef.current[rowKey(item)];
      if (state && state.status !== "idle" && state.status !== "error") continue;
      if (item.blank) continue;
      log.unshift(`Triaging "${item.title}"...`);
      setBatchLog([...log]);
      // eslint-disable-next-line no-await-in-loop
      const suggestion = await triageItem(item);
      log[0] = suggestion
        ? `"${item.title}" -> ${metaLabel(suggestion.type)} (${suggestion.confidence})`
        : `"${item.title}" -> no clear action`;
      setBatchLog([...log]);
    }
    setBatchRunning(false);
  }

  async function applyAllHighConfidence() {
    setBatchRunning(true);
    const log: string[] = [];
    let applied = 0;
    let attention = 0;
    for (const item of items) {
      const state = rowsRef.current[rowKey(item)];
      if (state?.status === "applied" || state?.status === "skipped") continue;
      let suggestion = state?.suggestion;
      if (!suggestion && !item.blank) {
        log.unshift(`Triaging "${item.title}"...`);
        setBatchLog([...log]);
        // eslint-disable-next-line no-await-in-loop
        suggestion = (await triageItem(item)) ?? undefined;
      }
      if (!suggestion || suggestion.confidence !== "high") {
        attention += 1;
        log.unshift(`Skipped "${item.title}" - ${suggestion ? `${suggestion.confidence} confidence` : "no high-confidence action"}`);
        setBatchLog([...log]);
        continue;
      }
      log.unshift(`Applying ${metaLabel(suggestion.type)} to "${item.title}"...`);
      setBatchLog([...log]);
      // eslint-disable-next-line no-await-in-loop
      const ok = await applyItem(item, suggestion);
      if (ok) {
        applied += 1;
        log[0] = `Applied ${metaLabel(suggestion.type)} to "${item.title}"`;
      } else {
        attention += 1;
        log[0] = `Failed "${item.title}"`;
      }
      setBatchLog([...log]);
    }
    setBatchRunning(false);
    setSummary(`Apply-all done: ${applied} applied · ${attention} need attention.`);
  }

  const remaining = useMemo(
    () => items.filter((item) => {
      const s = rows[rowKey(item)]?.status;
      return s !== "applied" && s !== "skipped";
    }).length,
    [items, rows],
  );

  return (
    <Panel className="capture-workspace-panel p-4">
      <header className="flex flex-none items-center gap-3 border-b border-white/8 pb-3">
        <button
          aria-label="Back to home"
          className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/[0.035] text-slate-300 transition hover:border-sky-300/30 hover:text-sky-200"
          onClick={onClose}
          type="button"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white">Sweep the pile</h2>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {items.length ? `${remaining} of ${items.length} still waiting` : "Nothing waiting to triage"}
          </p>
        </div>
        <button
          className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-slate-200 transition hover:border-sky-300/30 hover:text-sky-100 disabled:opacity-50"
          disabled={batchRunning || loading || !items.length}
          onClick={() => void triageAll()}
          type="button"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Triage all
        </button>
        <button
          className="flex h-9 items-center gap-2 rounded-lg border border-emerald-300/25 bg-emerald-300/10 px-3 text-xs font-medium text-emerald-100 transition hover:bg-emerald-300/16 disabled:opacity-50"
          disabled={batchRunning || loading || !items.length}
          onClick={() => void applyAllHighConfidence()}
          type="button"
        >
          {batchRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
          Apply all high-confidence
        </button>
      </header>

      {batchLog.length ? (
        <div className="mt-3 flex-none rounded-lg border border-white/8 bg-black/20 p-2.5">
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Run log</div>
          <ul className="mt-1 max-h-24 space-y-0.5 overflow-y-auto text-xs text-slate-400">
            {batchLog.slice(0, 8).map((line, index) => (
              <li key={`${line}-${index}`} className="truncate">{line}</li>
            ))}
          </ul>
          {summary ? <div className="mt-1.5 text-xs font-medium text-sky-200">{summary}</div> : null}
        </div>
      ) : null}

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-gutter:stable]">
        {error ? <div className="rounded-lg border border-rose-400/25 bg-rose-400/10 p-3 text-sm text-rose-100">{error}</div> : null}
        {!error && loading && !items.length ? <div className="p-6 text-center text-sm text-slate-500">Loading the pile...</div> : null}
        {!error && !loading && !items.length ? (
          <div className="grid place-items-center gap-2 p-10 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-300" />
            <div className="text-sm font-medium text-white">Inbox clear</div>
            <div className="text-xs text-slate-500">Nothing waiting to triage right now.</div>
          </div>
        ) : null}

        <div className="grid gap-2">
          {items.map((item) => {
            const key = rowKey(item);
            const state = rows[key] ?? { status: "idle" as RowStatus };
            const done = state.status === "applied" || state.status === "skipped";
            const suggestion = state.suggestion;
            return (
              <div
                key={key}
                className={`rounded-xl border p-3 transition ${
                  done ? "border-white/6 bg-white/[0.015] opacity-55" : "border-white/10 bg-white/[0.025]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-slate-400">
                        {sourceLabel(item.source)}
                      </span>
                      {item.blank ? (
                        <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-amber-200">
                          Looks empty
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1.5 truncate text-sm font-medium text-white">{item.title}</div>
                    <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                      {item.blank ? item.blankReason || "This looks empty." : item.textPreview || "No body text."}
                    </div>
                  </div>

                  {/* Suggestion chip + confidence */}
                  <div className="flex flex-none flex-col items-end gap-1">
                    {suggestion ? (
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${confidenceTone(suggestion.confidence)}`}>
                        {metaLabel(suggestion.type)} · {suggestion.confidence}
                      </span>
                    ) : state.status === "no_suggestion" ? (
                      <span className="rounded-full border border-slate-400/25 bg-white/[0.03] px-2.5 py-1 text-[11px] text-slate-400">No clear action</span>
                    ) : null}
                  </div>
                </div>

                {/* Row actions */}
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {done ? (
                    <>
                      <span className="flex items-center gap-1.5 text-xs text-emerald-200">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {state.status === "skipped" ? "Skipped" : state.message || "Done"}
                      </span>
                      {state.undoToken && !state.undone ? (
                        <button
                          className="flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-xs text-slate-200 transition hover:border-amber-300/30 hover:text-amber-100"
                          onClick={() => void undoItem(item)}
                          type="button"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Undo
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <>
                      {!suggestion && state.status !== "no_suggestion" ? (
                        <button
                          className="flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-xs font-medium text-slate-200 transition hover:border-sky-300/30 hover:text-sky-100 disabled:opacity-50"
                          disabled={state.status === "triaging"}
                          onClick={() => void triageAndMaybeShow(item)}
                          type="button"
                        >
                          {state.status === "triaging" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                          {state.status === "triaging" ? "Reading" : "Suggest action"}
                        </button>
                      ) : null}

                      {suggestion ? (
                        <button
                          className="flex h-8 items-center gap-1.5 rounded-lg border border-emerald-300/25 bg-emerald-300/10 px-3 text-xs font-medium text-emerald-100 transition hover:bg-emerald-300/16 disabled:opacity-50"
                          disabled={state.status === "applying"}
                          onClick={() => void applyItem(item, suggestion)}
                          type="button"
                        >
                          {state.status === "applying" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          Apply {metaLabel(suggestion.type)}
                        </button>
                      ) : null}

                      <button
                        className="flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 text-xs text-slate-300 transition hover:border-white/20 hover:text-slate-100"
                        onClick={() => void skipItem(item)}
                        type="button"
                      >
                        Skip
                      </button>

                      <button
                        className="flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 text-xs text-slate-300 transition hover:border-sky-300/30 hover:text-sky-100"
                        onClick={() => onOpenSingle(item)}
                        type="button"
                      >
                        More
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>

                      {item.blank ? (
                        <button
                          className="flex h-8 items-center gap-1.5 rounded-lg border border-rose-400/25 bg-rose-400/10 px-2.5 text-xs text-rose-100 transition hover:bg-rose-400/16"
                          onClick={() => void deleteBlankItem(item)}
                          type="button"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      ) : null}
                    </>
                  )}

                  {state.status === "error" && state.message ? (
                    <span className="flex items-center gap-1.5 text-xs text-rose-300">
                      <X className="h-3.5 w-3.5" />
                      {state.message}
                    </span>
                  ) : null}
                  {state.status === "no_suggestion" && state.message ? (
                    <span className="text-xs text-slate-500">{state.message}</span>
                  ) : null}
                  {state.undone ? <span className="text-xs text-amber-200/80">{state.message}</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}
