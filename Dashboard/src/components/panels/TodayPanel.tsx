import { useState } from "react";
import { CalendarDays, CheckCircle2, Clock, ExternalLink } from "lucide-react";
import type { RcfCalendarItem } from "../../types";
import { categoryDisplayLabel, categoryKey, itemTimeLabel, relativeDateLabel, upcomingItems, upcomingPriorityItems } from "../../utils/rcfCalendar";
import { markItemDone, openItemFile, snoozeItem } from "../../utils/calendarItemActions";
import { Panel } from "../ui/Panel";
import { PriorityBadge } from "../ui/Badge";

const accentClass = {
  business: "bg-emerald-400",
  life: "bg-cyan-300",
  other: "bg-slate-400",
  reference: "bg-slate-500",
  swc: "bg-violet-400",
  ucsd: "bg-amber-300",
};

const chipClass = {
  high: "High",
  low: "Low",
  medium: "Medium",
} as const;

type TodayPanelProps = {
  calendarItems: RcfCalendarItem[];
  error: string | null;
  loading: boolean;
  onRefresh: () => Promise<void>;
  onViewCalendar: () => void;
  today: string;
};

type PendingAction = "done" | "snooze1" | "snooze7" | "open";

export function TodayPanel({ calendarItems, error, loading, onRefresh, onViewCalendar, today }: TodayPanelProps) {
  const nextItems = upcomingItems(calendarItems, today, 3);
  const priorityItems = upcomingPriorityItems(calendarItems, today, 3);
  const [pending, setPending] = useState<{ id: string; action: PendingAction } | null>(null);
  const [rowMessage, setRowMessage] = useState<{ id: string; text: string } | null>(null);

  async function runAction(item: RcfCalendarItem, action: PendingAction) {
    setPending({ id: item.id, action });
    setRowMessage(null);
    try {
      if (action === "done") await markItemDone(item);
      else if (action === "snooze1") await snoozeItem(item, 1);
      else if (action === "snooze7") await snoozeItem(item, 7);
      else await openItemFile(item);
      if (action !== "open") await onRefresh();
      setRowMessage({ id: item.id, text: action === "done" ? "Marked done" : action === "open" ? "Opening file..." : "Snoozed" });
    } catch (caughtError) {
      setRowMessage({ id: item.id, text: caughtError instanceof Error ? caughtError.message : "Action failed." });
    } finally {
      setPending(null);
    }
  }

  return (
    <Panel className="p-4">
      <header className="mb-4 flex items-center justify-between border-b border-white/8 pb-3">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-5 w-5 text-slate-300" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white">Today</h2>
        </div>
        <button
          className="rounded-md px-2 py-1 text-sm text-slate-400 underline-offset-4 transition hover:bg-sky-400/8 hover:text-sky-300 hover:underline active:bg-sky-400/14"
          onClick={onViewCalendar}
          type="button"
        >
          View calendar
        </button>
      </header>

      <div>
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Up next</div>
        <div className="grid gap-2">
          {loading ? <p className="rounded-xl border border-white/8 bg-white/[0.025] px-4 py-3 text-sm text-slate-400">Loading calendar...</p> : null}
          {!loading && error ? <p className="rounded-xl border border-rose-300/20 bg-rose-500/8 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
          {!loading && !error && nextItems.length === 0 ? (
            <p className="rounded-xl border border-white/8 bg-white/[0.025] px-4 py-3 text-sm text-slate-400">No upcoming dated items.</p>
          ) : null}
          {!loading && !error
            ? nextItems.map((item) => {
                const busy = pending?.id === item.id ? pending.action : null;
                const disabled = busy !== null;
                return (
                  <article key={item.id} className="group relative rounded-xl border border-white/8 bg-white/[0.025] px-4 py-2.5">
                    <span className={`absolute bottom-3 left-0 top-3 w-1.5 rounded-r ${accentClass[categoryKey(item)]}`} />
                    <div className="flex items-start justify-between gap-3 pl-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-400">
                          {relativeDateLabel(item, today)} - {itemTimeLabel(item)}
                        </p>
                        <h3 className="mt-1 text-base font-medium text-white">{item.fields.name}</h3>
                        <p className="mt-1 text-sm text-slate-400">{categoryDisplayLabel(item)}</p>
                        {rowMessage?.id === item.id ? <p className="mt-1 text-xs text-sky-300">{rowMessage.text}</p> : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                        <button
                          aria-label="Mark done"
                          className="grid h-7 w-7 place-items-center rounded-full border border-emerald-300/24 bg-emerald-500/12 text-emerald-100 transition hover:bg-emerald-400/18 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={disabled}
                          onClick={() => void runAction(item, "done")}
                          title="Mark done"
                          type="button"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          aria-label="Snooze 1 day"
                          className="grid h-7 w-7 place-items-center rounded-full border border-white/10 bg-white/[0.035] text-slate-300 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={disabled}
                          onClick={() => void runAction(item, "snooze1")}
                          title="Snooze 1 day"
                          type="button"
                        >
                          <Clock className="h-3.5 w-3.5" />
                        </button>
                        <button
                          aria-label="Open file"
                          className="grid h-7 w-7 place-items-center rounded-full border border-white/10 bg-white/[0.035] text-slate-300 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={disabled}
                          onClick={() => void runAction(item, "open")}
                          title="Open file"
                          type="button"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })
            : null}
        </div>
      </div>

      <div className="mt-4 border-t border-white/8 pt-4">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Calendar priorities</div>
        <div className="grid gap-3">
          {priorityItems.length === 0 ? <p className="text-sm text-slate-500">No high-priority upcoming items.</p> : null}
          {priorityItems.map((item) => {
            const disabled = pending?.id === item.id;
            return (
              <div key={item.id} className="flex min-w-0 items-start gap-3">
                <button
                  aria-label={`Mark ${item.fields.name} done`}
                  className="group/priority mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full border border-slate-500 text-transparent transition hover:border-emerald-300/60 hover:bg-emerald-400/10 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={disabled}
                  onClick={() => void runAction(item, "done")}
                  title="Mark priority done"
                  type="button"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </button>
                <span className="min-w-0 flex-1 text-[15px] leading-snug text-slate-200">
                  {item.fields.action_needed}
                  {rowMessage?.id === item.id ? <span className="mt-1 block text-xs text-sky-300">{rowMessage.text}</span> : null}
                </span>
                <PriorityBadge priority={chipClass[(item.fields.importance || "").toLowerCase() as keyof typeof chipClass] ?? "Medium"} />
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}
