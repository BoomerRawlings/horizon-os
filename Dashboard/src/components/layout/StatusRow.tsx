import { CalendarDays, CheckCircle2, CircleDot, Inbox, ListChecks } from "lucide-react";

type StatusRowProps = {
  eventCount: number;
  issueCount: number;
  priorityCount: number;
  triageCount: number;
  focusLabel: string;
  onOpenCalendar: () => void;
  onOpenReview: () => void;
  onOpenSweep: () => void;
};

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function StatusRow({
  eventCount,
  issueCount,
  priorityCount,
  triageCount,
  focusLabel,
  onOpenCalendar,
  onOpenReview,
  onOpenSweep,
}: StatusRowProps) {
  // Every counter here is backed by real data (PHASE-10 truthfulness pass): events /
  // priorities / review-items come from the live calendar; focus reflects the real timer
  // state; to-triage is the live capture-pile count. The calendar-derived counters open the
  // calendar; review-items opens the calendar focused on the flagged items; to-triage opens
  // the sweep. Focus is a passive status, not a link.
  const pillClass =
    "-my-1 flex items-center gap-2 whitespace-nowrap rounded-lg px-2 py-1 transition hover:bg-white/[0.05] hover:text-white";

  return (
    <div className="mt-6 inline-flex items-center gap-4 rounded-xl border border-white/10 bg-[#0d1928]/82 px-5 py-3 text-sm text-slate-300 shadow-[0_10px_24px_rgba(0,0,0,0.18)]">
      <button className={pillClass} onClick={onOpenCalendar} title="Open the calendar" type="button">
        <CalendarDays className="h-4 w-4 text-slate-400" />
        {pluralize(eventCount, "event")}
      </button>

      <button className={pillClass} onClick={onOpenCalendar} title="See upcoming priorities" type="button">
        <ListChecks className="h-4 w-4 text-slate-400" />
        {pluralize(priorityCount, "priority", "priorities")}
      </button>

      <span className="flex items-center gap-2 whitespace-nowrap px-2">
        <CircleDot className="h-4 w-4 text-slate-400" />
        {focusLabel}
      </span>

      {issueCount ? (
        <button
          className="-my-1 flex items-center gap-2 whitespace-nowrap rounded-lg px-2 py-1 text-amber-100 transition hover:bg-amber-300/10"
          onClick={onOpenReview}
          title="Open the items that need review"
          type="button"
        >
          <CheckCircle2 className="h-4 w-4 text-amber-300" />
          {pluralize(issueCount, "review item")}
        </button>
      ) : (
        <span className="flex items-center gap-2 whitespace-nowrap px-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          All synced
        </span>
      )}

      {/* The one actionable capture counter — jumps straight to the sweep (the whole pile). */}
      <button
        className={`-my-1 flex items-center gap-2 whitespace-nowrap rounded-lg px-2 py-1 transition ${
          triageCount ? "text-amber-100 hover:bg-amber-300/10" : "text-emerald-300 hover:bg-emerald-300/10"
        }`}
        onClick={onOpenSweep}
        title={triageCount ? "Open the sweep to triage these" : "Nothing waiting — open the sweep anyway"}
        type="button"
      >
        <Inbox className={`h-4 w-4 ${triageCount ? "text-amber-300" : "text-emerald-400"}`} />
        {triageCount ? `${triageCount} to triage` : "Inbox clear"}
      </button>
    </div>
  );
}
