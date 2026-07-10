import { ArrowRight, ChevronsUpDown, Inbox, Layers, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Panel } from "../ui/Panel";

export type CaptureQueueItem = {
  content: string;
  emptyLike?: boolean;
  emptyReason?: string;
  id: string;
  path: string;
  preview: string;
  title: string;
  updatedAt: string;
};

type CaptureQueueResponse = {
  count: number;
  folder: string;
  items: CaptureQueueItem[];
  ok: boolean;
};

type CaptureQueuePanelProps = {
  onTriageItem: (item: CaptureQueueItem) => void;
  onSweepAll?: () => void;
  refreshKey?: number;
};

function timeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "synced";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function CaptureQueuePanel({ onTriageItem, onSweepAll, refreshKey = 0 }: CaptureQueuePanelProps) {
  const [items, setItems] = useState<CaptureQueueItem[]>([]);
  const [folder, setFolder] = useState("Inbox/To Triage");
  const [deletingId, setDeletingId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/capture/queue", { cache: "no-store" });
      const data = (await response.json()) as CaptureQueueResponse & { error?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Capture queue could not be loaded.");
      }
      setItems(data.items ?? []);
      setFolder(data.folder || "Inbox/To Triage");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Capture queue could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  async function deleteQueueFile(item: CaptureQueueItem) {
    const confirmed = window.confirm(`Permanently delete "${item.title}" from ${folder}?`);
    if (!confirmed) return;

    setDeletingId(item.id);
    setError("");
    try {
      const response = await fetch(`/api/capture/queue/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      const data = (await response.json()) as { error?: string; message?: string; ok?: boolean };
      if (!response.ok || !data.ok) {
        throw new Error(data.error || data.message || "Capture file could not be deleted.");
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Capture file could not be deleted.");
    } finally {
      setDeletingId("");
    }
  }

  const scrollable = items.length > 3;

  return (
    <Panel className="capture-queue-panel mt-3 p-4">
      <header className="flex items-center gap-3">
        <div className="capture-queue-icon">
          <Inbox className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white">Capture Queue</h2>
            <span className="capture-queue-count">{items.length}</span>
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-500">{folder}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {onSweepAll ? (
            <button
              className="capture-queue-sync"
              onClick={onSweepAll}
              title="Batch-triage the whole pile with one-click action buttons"
              type="button"
            >
              <Layers className="h-3.5 w-3.5" />
              Sweep all
            </button>
          ) : null}
          <button
            aria-label="Sync capture queue"
            className="capture-queue-sync"
            disabled={loading}
            onClick={() => void refresh()}
            type="button"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Sync
          </button>
        </div>
      </header>

      <div className="mt-3">
        {error ? <div className="capture-queue-empty capture-queue-error">{error}</div> : null}
        {!error && !loading && !items.length ? <div className="capture-queue-empty">Capture queue is empty.</div> : null}
        {!error && loading && !items.length ? <div className="capture-queue-empty">Checking queue...</div> : null}

        {items.length ? (
          <div
            aria-label={scrollable ? `${items.length} captures waiting. Scroll to browse all items.` : undefined}
            className={`capture-queue-list ${scrollable ? "capture-queue-list-scrollable" : ""}`}
            tabIndex={scrollable ? 0 : undefined}
          >
            {items.map((item) => (
              <div className={`capture-queue-item-wrap ${item.emptyLike ? "capture-queue-item-wrap-empty" : ""}`} key={item.id}>
                <button
                  className="capture-queue-item"
                  onClick={() => onTriageItem(item)}
                  title={item.path}
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-100">{item.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      {item.emptyLike ? item.emptyReason || "This looks empty." : item.preview || "No body text yet."}
                    </span>
                  </span>
                  <span className="capture-queue-item-action">
                    <span>{timeLabel(item.updatedAt)}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </button>
                {item.emptyLike ? (
                  <button
                    className="capture-queue-delete"
                    disabled={deletingId === item.id}
                    onClick={() => void deleteQueueFile(item)}
                    type="button"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {deletingId === item.id ? "Deleting" : "Delete file"}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {scrollable ? (
          <div className="capture-queue-scroll-hint">
            <ChevronsUpDown className="h-3 w-3" />
            Scroll inside the queue to browse all {items.length}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
