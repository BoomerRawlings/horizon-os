// Shared one-click calendar item actions (PHASE-06). Both TodayPanel and
// ExpandedCalendar patch the same RCF item file via POST /api/items/:id and open the
// underlying markdown via the existing obsidian file-browser source (POST
// /api/files/open) - no new server routes needed, this just reuses what exists.
import { addDays, localIsoDate, parseIsoDate } from "./rcfCalendar";
import type { RcfCalendarItem } from "../types";

async function patchItem(id: string, fields: Record<string, string>) {
  const response = await fetch(`/api/items/${encodeURIComponent(id)}`, {
    body: JSON.stringify({ fields }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!response.ok) throw new Error(`Save failed (${response.status})`);
}

export async function markItemDone(item: RcfCalendarItem) {
  await patchItem(item.id, { status: "done" });
}

export async function snoozeItem(item: RcfCalendarItem, days: number) {
  const current = parseIsoDate(item.fields.date);
  const base = current ?? new Date();
  const next = localIsoDate(addDays(base, days));
  await patchItem(item.id, { date: next });
}

export async function openItemFile(item: RcfCalendarItem) {
  const response = await fetch("/api/files/open", {
    body: JSON.stringify({ kind: "file", path: `Calendar/Items/${item.id}`, rootKey: "vault", sourceId: "obsidian" }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const data = (await response.json().catch(() => ({}))) as { message?: string; ok?: boolean };
  if (!response.ok || data.ok === false) throw new Error(data.message || "Could not open this item.");
}
