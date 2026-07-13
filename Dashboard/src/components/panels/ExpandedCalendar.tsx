import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent as ReactFocusEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  ListChecks,
  RefreshCw,
  Save,
  Settings,
  X,
} from "lucide-react";
import type { RcfCalendarItem, RcfCalendarItemFields } from "../../types";
import {
  activeDatedItems,
  addDays,
  calendarCategoryKey,
  categoryDisplayLabel,
  categoryKey,
  formatMonthLabel,
  formatWeekRange,
  isRangeItem,
  isTimedItem,
  itemIntersectsRange,
  itemStartDate,
  itemTimeLabel,
  localIsoDate,
  parseIsoDate,
  startOfWeek,
  upcomingPriorityItems,
  upcomingItems,
} from "../../utils/rcfCalendar";
import { markItemDone, openItemFile, snoozeItem } from "../../utils/calendarItemActions";
import { Panel } from "../ui/Panel";

const calendarFilters = [
  { key: "ucsd", label: "University", description: "University coursework", color: "bg-amber-300" },
  { key: "swc", label: "College", description: "College coursework", color: "bg-violet-400" },
  { key: "life", label: "Life Admin", description: "Personal admin", color: "bg-cyan-300" },
  { key: "business", label: "Business", description: "Work and company", color: "bg-emerald-400" },
  { key: "reference", label: "Reference", description: "Holidays and observances", color: "bg-slate-500" },
  { key: "other", label: "Other", description: "Unsorted items", color: "bg-slate-400" },
];

const eventColorClass: Record<string, string> = {
  business: "border-emerald-300/24 bg-emerald-500/22 text-emerald-50 shadow-[inset_3px_0_0_rgba(34,197,94,0.78)]",
  life: "border-cyan-300/24 bg-cyan-500/18 text-cyan-50 shadow-[inset_3px_0_0_rgba(103,232,249,0.72)]",
  other: "border-slate-300/18 bg-slate-500/18 text-slate-100 shadow-[inset_3px_0_0_rgba(148,163,184,0.64)]",
  reference: "border-slate-300/14 bg-slate-500/12 text-slate-200 shadow-[inset_3px_0_0_rgba(100,116,139,0.62)]",
  swc: "border-violet-300/30 bg-violet-500/24 text-violet-50 shadow-[inset_3px_0_0_rgba(167,139,250,0.78)]",
  ucsd: "border-yellow-300/28 bg-yellow-500/20 text-yellow-50 shadow-[inset_3px_0_0_rgba(250,204,21,0.75)]",
};

const dotClass: Record<string, string> = {
  business: "bg-emerald-400",
  life: "bg-cyan-300",
  other: "bg-slate-400",
  reference: "bg-slate-500",
  swc: "bg-violet-400",
  ucsd: "bg-amber-300",
};

const timeRows = ["all-day", "8 AM", "9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM", "6 PM", "7 PM", "8 PM", "9 PM"];
const viewModes = ["Week", "Month", "Agenda"] as const;
type CalendarViewMode = (typeof viewModes)[number];
type CalendarDraft = RcfCalendarItemFields & { body: string };
type CalendarTooltip = {
  item: RcfCalendarItem;
  style: CSSProperties;
};

type ExpandedCalendarProps = {
  calendarItems: RcfCalendarItem[];
  error: string | null;
  eventFocusKey?: number;
  loading: boolean;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  priorityFocusKey?: number;
  reviewFocusKey?: number;
  showCompletedItems: boolean;
  today: string;
  weekStartsMonday: boolean;
};

function sameDay(a: Date, b: Date) {
  return localIsoDate(a) === localIsoDate(b);
}

function startsOn(item: RcfCalendarItem, date: Date) {
  const start = itemStartDate(item);
  return Boolean(start && sameDay(start, date));
}

function dayLabels(weekStartsMonday: boolean) {
  return weekStartsMonday ? ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] : ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
}

function monthCells(monthCursor: Date, weekStartsMonday: boolean) {
  const monthStart = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
  const gridStart = startOfWeek(monthStart, weekStartsMonday);
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

function timedGridRow(item: RcfCalendarItem) {
  const match = item.fields.time_start.match(/^(\d{2}):(\d{2})$/);
  if (!match) return { row: 1, span: 1 };

  const hour = Number(match[1]);
  const startRow = Math.max(2, Math.min(timeRows.length, hour - 8 + 2));
  const endMatch = item.fields.time_end.match(/^(\d{2}):(\d{2})$/);
  const endHour = endMatch ? Number(endMatch[1]) : hour + 1;
  const span = Math.max(1, Math.min(4, endHour - hour || 1));
  return { row: startRow, span };
}

function compactDayItems(items: RcfCalendarItem[], date: Date, dayIndex = 0) {
  return items
    .filter((item) => {
      if (startsOn(item, date)) return true;
      return isRangeItem(item) && dayIndex === 0 && itemIntersectsRange(item, date, date);
    })
    .sort((a, b) => {
      const exactCompare = Number(!startsOn(a, date)) - Number(!startsOn(b, date));
      if (exactCompare !== 0) return exactCompare;
      return (a.fields.time_start || "99:99").localeCompare(b.fields.time_start || "99:99");
    });
}

function eventTitle(item: RcfCalendarItem) {
  return `${item.fields.name}\n${itemTimeLabel(item)}\n${item.fields.action_needed}`;
}

function eventAccessibleLabel(item: RcfCalendarItem) {
  return `${item.fields.name}, ${displayDateTime(item)}, ${categoryDisplayLabel(item)}`;
}

function displayDateTime(item: RcfCalendarItem) {
  const time = itemTimeLabel(item);
  if (time === "All day") return item.dateLabel;
  return `${item.dateLabel} - ${time}`;
}

function bodyValue(body: string, labels: string[]) {
  const lines = String(body || "").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    for (const label of labels) {
      const prefix = `- ${label}:`;
      if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
        return trimmed.slice(prefix.length).trim();
      }
    }
  }
  return "";
}

function eventPlace(item: RcfCalendarItem) {
  const explicitPlace = bodyValue(item.body, ["Place", "Location", "Where"]);
  if (explicitPlace) return explicitPlace;
  const joinLink = bodyValue(item.body, ["Join link", "Zoom link", "Meeting link"]);
  if (!joinLink) return "";
  return /zoom/i.test(joinLink) ? "Online (Zoom)" : "Online";
}

function eventSource(item: RcfCalendarItem) {
  return bodyValue(item.body, ["Source", "Sources"]);
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function tooltipStyleFromAnchor(anchor: HTMLElement, boundary: HTMLElement | null): CSSProperties {
  const tooltipWidth = 318;
  const tooltipHeight = 236;
  const gap = 12;
  const padding = 12;
  const anchorRect = anchor.getBoundingClientRect();
  const boundaryRect = boundary?.getBoundingClientRect() ?? {
    height: typeof window === "undefined" ? 900 : window.innerHeight,
    left: 0,
    top: 0,
    width: typeof window === "undefined" ? 1400 : window.innerWidth,
  };
  const maxLeft = Math.max(padding, boundaryRect.width - tooltipWidth - padding);
  const maxTop = Math.max(padding, boundaryRect.height - tooltipHeight - padding);
  const rightOfAnchor = anchorRect.right - boundaryRect.left + gap;
  const leftOfAnchor = anchorRect.left - boundaryRect.left - tooltipWidth - gap;
  const centeredOnAnchor = anchorRect.left - boundaryRect.left + anchorRect.width / 2 - tooltipWidth / 2;
  let left = rightOfAnchor;

  if (left + tooltipWidth > boundaryRect.width - padding) {
    left = leftOfAnchor;
  }
  if (left < padding) {
    left = centeredOnAnchor;
  }

  const anchorTop = anchorRect.top - boundaryRect.top;
  const anchorBottom = anchorRect.bottom - boundaryRect.top;
  let top = anchorTop;
  if (top + tooltipHeight > boundaryRect.height - padding) {
    top = anchorBottom - tooltipHeight;
  }

  return {
    left: Math.round(clampNumber(left, padding, maxLeft)),
    top: Math.round(clampNumber(top, padding, maxTop)),
  };
}

function eventDraftFromItem(item: RcfCalendarItem): CalendarDraft {
  return { ...item.fields, body: item.body || "" };
}

function eventPatchFromDraft(draft: CalendarDraft) {
  const { body, ...fields } = draft;
  return { body, fields };
}

export function ExpandedCalendar({
  calendarItems,
  error,
  eventFocusKey,
  loading,
  onClose,
  onRefresh,
  priorityFocusKey,
  reviewFocusKey,
  showCompletedItems,
  today,
  weekStartsMonday,
}: ExpandedCalendarProps) {
  const [viewMode, setViewMode] = useState<CalendarViewMode>("Week");
  const [priorityOnly, setPriorityOnly] = useState(false);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState(() => new Set(calendarFilters.map((filter) => filter.key)));
  const [activeCategoryKey, setActiveCategoryKey] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [eventDraft, setEventDraft] = useState<CalendarDraft | null>(null);
  const [tooltip, setTooltip] = useState<CalendarTooltip | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savingEvent, setSavingEvent] = useState(false);
  const [quickActionPending, setQuickActionPending] = useState<"done" | "snooze1" | "snooze7" | "open" | null>(null);
  const [userMovedCalendar, setUserMovedCalendar] = useState(false);
  const calendarSurfaceRef = useRef<HTMLElement | null>(null);
  const todayDate = useMemo(() => parseIsoDate(today) ?? new Date(), [today]);
  const visibleItems = useMemo(() => activeDatedItems(calendarItems, showCompletedItems), [calendarItems, showCompletedItems]);

  const defaultAnchor = todayDate;

  const [weekStart, setWeekStart] = useState(() => startOfWeek(defaultAnchor, weekStartsMonday));

  useEffect(() => {
    if (userMovedCalendar) return;
    setWeekStart(startOfWeek(defaultAnchor, weekStartsMonday));
  }, [defaultAnchor, userMovedCalendar, weekStartsMonday]);

  const filteredItems = useMemo(
    () => visibleItems.filter((item) => selectedCategories.has(categoryKey(item))),
    [selectedCategories, visibleItems],
  );

  const categoryCounts = useMemo(() => {
    return calendarFilters.reduce<Record<string, number>>((counts, filter) => {
      counts[filter.key] = visibleItems.filter((item) => categoryKey(item) === filter.key).length;
      return counts;
    }, {});
  }, [visibleItems]);

  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const weekEnd = weekDates[6] ?? weekStart;
  const weekItems = useMemo(
    () => filteredItems.filter((item) => itemIntersectsRange(item, weekStart, weekEnd)),
    [filteredItems, weekEnd, weekStart],
  );
  const weekDayActivity = useMemo(
    () => weekDates.map((date, dayIndex) => compactDayItems(weekItems, date, dayIndex).length),
    [weekDates, weekItems],
  );
  const weekGridColumns = useMemo(
    () => `64px ${weekDayActivity.map((count) => (count ? "minmax(122px,1.35fr)" : "minmax(50px,0.5fr)")).join(" ")}`,
    [weekDayActivity],
  );
  const weekGridRows = useMemo(() => {
    const activeRows = new Set<number>();
    weekItems.forEach((item) => {
      if (!isTimedItem(item)) {
        activeRows.add(0);
        return;
      }

      const { row, span } = timedGridRow(item);
      for (let offset = 0; offset < span; offset += 1) {
        activeRows.add(row - 1 + offset);
      }
    });

    return timeRows.map((_, index) => {
      if (index === 0) return activeRows.has(0) ? "104px" : "42px";
      return activeRows.has(index) ? "42px" : "24px";
    }).join(" ");
  }, [weekItems]);
  const monthGrid = useMemo(() => monthCells(weekStart, weekStartsMonday), [weekStart, weekStartsMonday]);
  const monthStart = new Date(weekStart.getFullYear(), weekStart.getMonth(), 1);
  const monthEnd = new Date(weekStart.getFullYear(), weekStart.getMonth() + 1, 0);
  const monthItems = useMemo(
    () => filteredItems.filter((item) => itemIntersectsRange(item, monthStart, monthEnd)),
    [filteredItems, monthEnd, monthStart],
  );
  const agendaItems = upcomingItems(filteredItems, today, 30);
  // This is the same three-item working set shown on Home and counted in the status row.
  // Dedicated priority mode intentionally ignores category filters so its count and
  // destination cannot drift apart.
  const priorityItems = upcomingPriorityItems(visibleItems, today, 3);
  // Items flagged with issues (e.g. "Past active") — surfaced by the "needs review" view.
  // These are often past-dated, so they never appear in the week/month/agenda views; the
  // review list shows them regardless of date so they can actually be resolved.
  const reviewItems = useMemo(
    () => calendarItems.filter((item) => item.issues.length > 0),
    [calendarItems],
  );
  const issueCount = reviewItems.length;
  const activeCategory = calendarFilters.find((filter) => filter.key === activeCategoryKey) ?? null;
  const activeCategoryItems = useMemo(
    () => (activeCategoryKey ? visibleItems.filter((item) => categoryKey(item) === activeCategoryKey) : []),
    [activeCategoryKey, visibleItems],
  );
  const selectedItem = useMemo(
    () => calendarItems.find((item) => item.id === selectedItemId) ?? null,
    [calendarItems, selectedItemId],
  );
  const selectedItemCategoryKey = eventDraft ? calendarCategoryKey(eventDraft.category) : selectedItem ? categoryKey(selectedItem) : "other";

  useEffect(() => {
    if (!selectedItemId) setEventDraft(null);
  }, [selectedItemId]);

  // Activate the "needs review" view when the status-row review counter is clicked.
  // reviewFocusKey starts at 0 (no focus) and increments on each request.
  useEffect(() => {
    if (!reviewFocusKey) return;
    setPriorityOnly(false);
    setReviewOnly(true);
  }, [reviewFocusKey]);

  useEffect(() => {
    if (!priorityFocusKey) return;
    setViewMode("Agenda");
    setReviewOnly(false);
    setPriorityOnly(true);
  }, [priorityFocusKey]);

  // "Events" is the calendar's base destination. It must reset focused list modes even
  // when Calendar is already open, so the status-row control can never look selected while
  // a priorities/review list remains visible.
  useEffect(() => {
    if (!eventFocusKey) return;
    setViewMode("Month");
    setReviewOnly(false);
    setPriorityOnly(false);
    setUserMovedCalendar(false);
    setWeekStart(new Date(todayDate.getFullYear(), todayDate.getMonth(), 1));
  }, [eventFocusKey, todayDate]);

  function moveCalendar(direction: -1 | 1) {
    setUserMovedCalendar(true);
    setWeekStart((current) => {
      if (viewMode === "Month") {
        return new Date(current.getFullYear(), current.getMonth() + direction, 1);
      }
      return addDays(current, direction * 7);
    });
  }

  function jumpToToday() {
    setUserMovedCalendar(true);
    setWeekStart(startOfWeek(todayDate, weekStartsMonday));
  }

  function toggleCategory(key: string) {
    setSelectedCategories((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next.size ? next : current;
    });
  }

  function selectCategory(key: string) {
    setActiveCategoryKey((current) => (current === key ? null : key));
  }

  function selectItem(item: RcfCalendarItem) {
    setSelectedItemId(item.id);
    setEventDraft(eventDraftFromItem(item));
    setSaveMessage(null);
  }

  function closeItemEditor() {
    setSelectedItemId(null);
    setEventDraft(null);
    setSaveMessage(null);
  }

  function showItemTooltip(item: RcfCalendarItem, event: ReactMouseEvent<HTMLElement> | ReactPointerEvent<HTMLElement>) {
    setTooltip({ item, style: tooltipStyleFromAnchor(event.currentTarget, calendarSurfaceRef.current) });
  }

  function moveItemTooltip(event: ReactMouseEvent<HTMLElement> | ReactPointerEvent<HTMLElement>) {
    const style = tooltipStyleFromAnchor(event.currentTarget, calendarSurfaceRef.current);
    setTooltip((current) => (current ? { ...current, style } : null));
  }

  function focusItemTooltip(item: RcfCalendarItem, event: ReactFocusEvent<HTMLElement>) {
    setTooltip({ item, style: tooltipStyleFromAnchor(event.currentTarget, calendarSurfaceRef.current) });
  }

  function itemTooltipProps(item: RcfCalendarItem) {
    return {
      "aria-label": eventAccessibleLabel(item),
      onBlur: () => setTooltip(null),
      onFocus: (event: ReactFocusEvent<HTMLElement>) => focusItemTooltip(item, event),
      onMouseEnter: (event: ReactMouseEvent<HTMLElement>) => showItemTooltip(item, event),
      onMouseLeave: () => setTooltip(null),
      onMouseMove: moveItemTooltip,
      onMouseOver: (event: ReactMouseEvent<HTMLElement>) => showItemTooltip(item, event),
      onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => showItemTooltip(item, event),
      onPointerLeave: () => setTooltip(null),
      onPointerMove: moveItemTooltip,
      onPointerOver: (event: ReactPointerEvent<HTMLElement>) => showItemTooltip(item, event),
    };
  }

  function updateDraft<Field extends keyof CalendarDraft>(field: Field, value: CalendarDraft[Field]) {
    setEventDraft((current) => (current ? { ...current, [field]: value } : current));
  }

  async function saveEventEdits() {
    if (!selectedItem || !eventDraft) return;
    setSavingEvent(true);
    setSaveMessage(null);
    try {
      const response = await fetch(`/api/items/${encodeURIComponent(selectedItem.id)}`, {
        body: JSON.stringify(eventPatchFromDraft(eventDraft)),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error(`Save failed (${response.status})`);
      await onRefresh();
      setSaveMessage("Saved to calendar database.");
    } catch (caughtError) {
      setSaveMessage(caughtError instanceof Error ? caughtError.message : "Save failed.");
    } finally {
      setSavingEvent(false);
    }
  }

  async function quickMarkDone() {
    if (!selectedItem) return;
    setQuickActionPending("done");
    setSaveMessage(null);
    try {
      await markItemDone(selectedItem);
      setEventDraft((current) => (current ? { ...current, status: "done" } : current));
      await onRefresh();
      setSaveMessage(showCompletedItems ? "Marked done." : "Marked done. Hidden until “show completed” is on.");
    } catch (caughtError) {
      setSaveMessage(caughtError instanceof Error ? caughtError.message : "Could not mark done.");
    } finally {
      setQuickActionPending(null);
    }
  }

  async function quickSnooze(days: number) {
    if (!selectedItem) return;
    setQuickActionPending(days === 1 ? "snooze1" : "snooze7");
    setSaveMessage(null);
    try {
      await snoozeItem(selectedItem, days);
      const base = parseIsoDate(selectedItem.fields.date) ?? new Date();
      const nextDate = localIsoDate(addDays(base, days));
      setEventDraft((current) => (current ? { ...current, date: nextDate } : current));
      await onRefresh();
      setSaveMessage(`Snoozed ${days === 1 ? "1 day" : "1 week"}.`);
    } catch (caughtError) {
      setSaveMessage(caughtError instanceof Error ? caughtError.message : "Could not snooze.");
    } finally {
      setQuickActionPending(null);
    }
  }

  async function quickOpenFile() {
    if (!selectedItem) return;
    setQuickActionPending("open");
    setSaveMessage(null);
    try {
      await openItemFile(selectedItem);
      setSaveMessage("Opening file...");
    } catch (caughtError) {
      setSaveMessage(caughtError instanceof Error ? caughtError.message : "Could not open this item.");
    } finally {
      setQuickActionPending(null);
    }
  }

  return (
    <Panel className="calendar-expanded-panel overflow-hidden">
      <header className="flex items-center justify-between border-b border-white/8 px-5 py-3">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-5 w-5 text-slate-300" />
          <h2 className="text-lg font-medium text-white">Calendar</h2>
          {issueCount ? (
            <button
              className={`ml-5 flex items-center gap-2 rounded-lg px-2 py-1 text-sm transition ${
                reviewOnly ? "bg-amber-300/12 text-amber-100" : "text-slate-400 hover:bg-white/[0.05] hover:text-amber-100"
              }`}
              onClick={() => {
                setPriorityOnly(false);
                setReviewOnly((current) => !current);
              }}
              title="Show only the items that need review"
              type="button"
            >
              <CheckCircle2 className="h-4 w-4 text-amber-300" />
              {issueCount} needs review
            </button>
          ) : (
            <span className="ml-5 flex items-center gap-2 text-sm text-slate-400">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              All synced
            </span>
          )}
          <button
            className={`ml-1 flex items-center gap-2 rounded-lg px-2 py-1 text-sm transition ${
              priorityOnly ? "bg-sky-300/12 text-sky-100" : "text-slate-400 hover:bg-white/[0.05] hover:text-sky-100"
            }`}
            onClick={() => {
              setViewMode("Agenda");
              setReviewOnly(false);
              setPriorityOnly((current) => !current);
            }}
            title="Show upcoming high-priority items"
            type="button"
          >
            <ListChecks className="h-4 w-4 text-sky-300" />
            {priorityItems.length} priorities
          </button>
        </div>
        <button
          aria-label="Close calendar"
          className="grid h-8 w-8 place-items-center rounded-full border border-transparent text-slate-400 transition hover:border-white/10 hover:bg-white/[0.04] hover:text-white"
          onClick={onClose}
          type="button"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="calendar-expanded-body grid grid-cols-[240px_minmax(0,1fr)]">
        <aside className="border-r border-white/8 bg-[#0b1726]/74 px-5 py-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm font-medium text-white">{formatMonthLabel(weekStart)}</div>
            <div className="flex gap-1 text-slate-400">
              <button className="grid h-6 w-6 place-items-center rounded hover:bg-white/[0.05] hover:text-white" onClick={() => moveCalendar(-1)} type="button">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button className="grid h-6 w-6 place-items-center rounded hover:bg-white/[0.05] hover:text-white" onClick={() => moveCalendar(1)} type="button">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-y-3 text-center text-sm">
            {(weekStartsMonday ? ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] : ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]).map((day) => (
              <div key={day} className="text-xs text-slate-500">
                {day}
              </div>
            ))}
            {monthCells(weekStart, weekStartsMonday).slice(0, 35).map((date, index) => {
              const active = sameDay(date, todayDate);
              const muted = date.getMonth() !== weekStart.getMonth();
              const hasItems = filteredItems.some((item) => startsOn(item, date));
              return (
                <button
                  key={`${localIsoDate(date)}-${index}`}
                  className={`relative mx-auto grid h-7 w-7 place-items-center rounded-full ${
                    active
                      ? "bg-sky-400 text-white shadow-[0_0_18px_rgba(56,189,248,0.28)]"
                      : muted
                        ? "text-slate-600 hover:bg-white/[0.03]"
                        : "text-slate-300 hover:bg-white/[0.05]"
                  }`}
                  onClick={() => {
                    setUserMovedCalendar(true);
                    setWeekStart(startOfWeek(date, weekStartsMonday));
                  }}
                  type="button"
                >
                  {date.getDate()}
                  {hasItems ? <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-sky-300" /> : null}
                </button>
              );
            })}
          </div>

          <div className="mt-8">
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Calendars</div>
            <div className="grid gap-2">
              {calendarFilters.map((filter) => (
                <div
                  key={filter.key}
                  className={`group flex items-center gap-3 rounded-lg border px-2.5 py-2 text-left transition ${
                    activeCategoryKey === filter.key
                      ? "border-sky-300/28 bg-sky-400/10"
                      : "border-transparent bg-transparent hover:border-white/8 hover:bg-white/[0.035]"
                  }`}
                >
                  <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => selectCategory(filter.key)} type="button">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${filter.color}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-200">{filter.label}</span>
                      <span className="block truncate text-[11px] text-slate-500">{filter.description}</span>
                    </span>
                    <span className="text-xs text-slate-500">{categoryCounts[filter.key] ?? 0}</span>
                  </button>
                  <button
                    aria-label={`Toggle ${filter.label}`}
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded text-[11px] ${
                      selectedCategories.has(filter.key) ? "bg-sky-500 text-white" : "border border-white/10 text-slate-600"
                    }`}
                    onClick={() => toggleCategory(filter.key)}
                    type="button"
                  >
                    {selectedCategories.has(filter.key) ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {activeCategory ? (
            <div className="mt-5 border-t border-white/8 pt-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <ListChecks className="h-4 w-4 shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{activeCategory.label} items</div>
                    <div className="text-[11px] text-slate-600">{activeCategoryItems.length} considered</div>
                  </div>
                </div>
                <button className="text-xs text-slate-500 hover:text-sky-300" onClick={() => setActiveCategoryKey(null)} type="button">
                  Clear
                </button>
              </div>
              <div className="max-h-[196px] space-y-1.5 overflow-y-auto pr-1">
                {activeCategoryItems.length === 0 ? <div className="rounded-lg border border-white/8 bg-white/[0.025] px-3 py-3 text-xs text-slate-500">No items in this calendar.</div> : null}
                {activeCategoryItems.map((item) => (
                  <button
                    key={item.id}
                    className={`block w-full rounded-lg border px-3 py-2 text-left transition ${
                      selectedItemId === item.id ? "border-sky-300/30 bg-sky-400/10" : "border-white/8 bg-white/[0.025] hover:border-white/14 hover:bg-white/[0.045]"
                    }`}
                    onClick={() => selectItem(item)}
                    title={eventTitle(item)}
                    type="button"
                  >
                    <span className="block truncate text-xs text-slate-500">{displayDateTime(item)}</span>
                    <span className="mt-0.5 block truncate text-sm text-slate-200">{item.fields.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <button className="mt-7 flex items-center gap-2 border-0 bg-transparent p-0 text-sm text-slate-500 hover:text-sky-300" type="button">
            <Settings className="h-4 w-4" />
            Settings
          </button>
        </aside>

        <section ref={calendarSurfaceRef} className="relative min-w-0 px-5 py-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <button className="h-9 rounded-lg border border-white/8 bg-white/[0.04] px-4 text-sm text-slate-200 hover:bg-white/[0.07]" onClick={jumpToToday} type="button">
                Today
              </button>
              <div className="flex overflow-hidden rounded-lg border border-white/8">
                <button className="grid h-9 w-10 place-items-center text-slate-400 hover:bg-white/[0.04] hover:text-white" onClick={() => moveCalendar(-1)} type="button">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button className="grid h-9 w-10 place-items-center border-l border-white/8 text-slate-400 hover:bg-white/[0.04] hover:text-white" onClick={() => moveCalendar(1)} type="button">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="text-lg font-medium text-white">{viewMode === "Month" ? formatMonthLabel(weekStart) : formatWeekRange(weekStart)}</div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex overflow-hidden rounded-lg border border-white/8 bg-white/[0.025] text-sm">
                {viewModes.map((view) => (
                  <button
                    key={view}
                    className={`h-9 px-4 ${view === viewMode && !reviewOnly && !priorityOnly ? "bg-sky-400/12 text-sky-300" : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"}`}
                    onClick={() => {
                      setViewMode(view);
                      setPriorityOnly(false);
                      setReviewOnly(false);
                    }}
                    type="button"
                  >
                    {view}
                  </button>
                ))}
              </div>
              <button className="flex h-9 items-center gap-2 rounded-lg border border-sky-300/24 bg-sky-500/16 px-4 text-sm font-medium text-sky-100 shadow-[0_10px_22px_rgba(56,189,248,0.12)] hover:bg-sky-400/20" onClick={() => void onRefresh()} type="button">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>
          </div>

          {loading ? (
            <div className="rounded-xl border border-white/8 bg-[#081421]/74 px-5 py-10 text-center text-sm text-slate-400">Loading calendar...</div>
          ) : null}
          {!loading && error ? (
            <div className="rounded-xl border border-rose-300/20 bg-rose-500/8 px-5 py-10 text-center text-sm text-rose-100">{error}</div>
          ) : null}

          {!loading && !error && reviewOnly ? (
            <div className="calendar-content-surface max-h-[490px] overflow-y-auto rounded-xl border border-amber-300/20 bg-[#0b1726]/74">
              <div className="border-b border-white/8 px-5 py-3 text-xs font-medium uppercase tracking-[0.14em] text-amber-200">
                Needs review — open an item to fix its date or mark it done
              </div>
              {reviewItems.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-emerald-200">Nothing to review — all items look good.</div>
              ) : null}
              {reviewItems.map((item) => (
                <button
                  key={item.id}
                  className="flex w-full gap-4 border-b border-white/8 px-5 py-4 text-left transition hover:bg-white/[0.035] last:border-b-0"
                  onClick={() => selectItem(item)}
                  type="button"
                  {...itemTooltipProps(item)}
                >
                  <div className="w-24 shrink-0 text-sm text-slate-400">{item.dateLabel}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${dotClass[categoryKey(item)]}`} />
                      <h3 className="truncate text-sm font-medium text-white">{item.fields.name}</h3>
                      {item.issues.map((issue) => (
                        <span
                          key={issue.key}
                          className="rounded-full border border-amber-300/24 bg-amber-300/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-amber-100"
                        >
                          {issue.label}
                        </span>
                      ))}
                    </div>
                    <p className="mt-1 text-sm text-slate-400">{itemTimeLabel(item)} - {categoryDisplayLabel(item)}</p>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-300">{item.fields.action_needed}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : null}

          {!loading && !error && priorityOnly ? (
            <div className="calendar-content-surface max-h-[490px] overflow-y-auto rounded-xl border border-sky-300/18 bg-[#081421]/74">
              <div className="border-b border-white/8 px-5 py-3 text-xs font-medium uppercase tracking-[0.14em] text-sky-200">
                Upcoming priorities — the high-importance items that need attention first
              </div>
              {priorityItems.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-slate-400">No upcoming high-priority items.</div>
              ) : null}
              {priorityItems.map((item) => (
                <button
                  key={item.id}
                  className="flex w-full gap-4 border-b border-white/8 px-5 py-4 text-left transition hover:bg-white/[0.035] last:border-b-0"
                  onClick={() => selectItem(item)}
                  type="button"
                  {...itemTooltipProps(item)}
                >
                  <div className="w-24 shrink-0 text-sm text-slate-400">{item.dateLabel}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${dotClass[categoryKey(item)]}`} />
                      <h3 className="truncate text-sm font-medium text-white">{item.fields.name}</h3>
                      <span className="rounded-full border border-rose-300/22 bg-rose-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-rose-100">High</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-400">{itemTimeLabel(item)} - {categoryDisplayLabel(item)}</p>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-300">{item.fields.action_needed}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : null}

          {!loading && !error && !reviewOnly && !priorityOnly && viewMode === "Week" ? (
            <div className="calendar-content-surface calendar-week-grid overflow-hidden rounded-xl border border-white/8 bg-[#081421]/74">
              <div className="calendar-week-grid-table grid border-b border-white/8" style={{ gridTemplateColumns: weekGridColumns }}>
                <div />
                {weekDates.map((date, index) => (
                  <div key={localIsoDate(date)} className="border-l border-white/8 px-2 py-2 text-center">
                    <div className="text-[11px] font-semibold text-slate-500">{dayLabels(weekStartsMonday)[index]}</div>
                    <div className={`mt-1 text-sm ${sameDay(date, todayDate) ? "text-sky-200" : "text-slate-300"}`}>{date.getDate()}</div>
                  </div>
                ))}
              </div>

              <div
                className="calendar-week-grid-table relative grid"
                style={{
                  gridTemplateColumns: weekGridColumns,
                  gridTemplateRows: weekGridRows,
                }}
              >
                {timeRows.map((time, rowIndex) => (
                  <div
                    key={time}
                    className="border-b border-white/8 pr-3 pt-2 text-right text-xs text-slate-500"
                    style={{ gridColumn: 1, gridRow: rowIndex + 1 }}
                  >
                    {time}
                  </div>
                ))}

                {timeRows.flatMap((time, rowIndex) =>
                  weekDates.map((date, dayIndex) => (
                    <div
                      key={`${time}-${localIsoDate(date)}`}
                      className="border-b border-l border-white/8"
                      style={{ gridColumn: dayIndex + 2, gridRow: rowIndex + 1 }}
                    />
                  )),
                )}

                {weekDates.flatMap((date, dayIndex) => {
                  const dayItems = compactDayItems(weekItems, date, dayIndex);
                  const allDaySourceItems = dayItems.filter((item) => !isTimedItem(item));
                  const allDayItems = allDaySourceItems.slice(0, 2);
                  const timedItems = dayItems.filter(isTimedItem);
                  const hiddenAllDayCount = Math.max(0, allDaySourceItems.length - allDayItems.length);

                  return [
                    ...allDayItems.map((item, itemIndex) => (
                      <button
                        key={`${item.id}-all-day-${dayIndex}`}
                        className={`calendar-week-all-day-event z-10 mx-1 flex rounded-md border px-2 text-left text-[11px] transition hover:brightness-110 ${eventColorClass[categoryKey(item)]}`}
                        onClick={() => selectItem(item)}
                        style={{ gridColumn: dayIndex + 2, gridRow: 1, marginTop: `${itemIndex * 27 + 8}px` }}
                        type="button"
                        {...itemTooltipProps(item)}
                      >
                        <span className="calendar-event-single-line">
                          {isRangeItem(item) && !startsOn(item, date) ? <span className="opacity-70">Ongoing: </span> : null}
                          {item.fields.name}
                        </span>
                      </button>
                    )),
                    hiddenAllDayCount ? (
                      <button
                        key={`more-${localIsoDate(date)}`}
                        className="calendar-week-more z-10 mx-1 self-end rounded border border-white/8 bg-black/20 px-2 py-0.5 text-left text-[11px] leading-none text-slate-400 transition hover:border-sky-300/20 hover:bg-sky-400/8 hover:text-sky-200"
                        onClick={() => setActiveCategoryKey(categoryKey(allDaySourceItems[0]))}
                        style={{ gridColumn: dayIndex + 2, gridRow: 1 }}
                        type="button"
                      >
                        +{hiddenAllDayCount} more
                      </button>
                    ) : null,
                    ...timedItems.map((item) => {
                      const { row, span } = timedGridRow(item);
                      return (
                        <button
                          key={`${item.id}-timed`}
                          className={`calendar-week-timed-event z-10 mx-1 overflow-hidden rounded-md border px-2 py-1 text-left text-xs leading-tight transition hover:brightness-110 ${eventColorClass[categoryKey(item)]}`}
                          onClick={() => selectItem(item)}
                          style={{ gridColumn: dayIndex + 2, gridRow: `${row} / span ${span}` }}
                          type="button"
                          {...itemTooltipProps(item)}
                        >
                          <div className="truncate text-[11px] opacity-75">{itemTimeLabel(item)}</div>
                          <div className="mt-0.5 truncate font-medium">{item.fields.name}</div>
                        </button>
                      );
                    }),
                  ];
                })}
              </div>
            </div>
          ) : null}

          {!loading && !error && !reviewOnly && !priorityOnly && viewMode === "Month" ? (
            <div className="calendar-content-surface calendar-month-grid overflow-hidden rounded-xl border border-white/8 bg-[#081421]/74">
              <div className="calendar-month-grid-table grid grid-cols-7 border-b border-white/8">
                {dayLabels(weekStartsMonday).map((day) => (
                  <div key={day} className="border-l border-white/8 px-3 py-2 text-center text-[11px] font-semibold text-slate-500 first:border-l-0">
                    {day}
                  </div>
                ))}
              </div>
              <div className="calendar-month-grid-table grid grid-cols-7">
                {monthGrid.map((date) => {
                  const allItems = compactDayItems(monthItems, date, 1);
                  const dayItems = allItems.slice(0, 3);
                  const muted = date.getMonth() !== weekStart.getMonth();
                  return (
                    <div key={localIsoDate(date)} className="min-h-[92px] border-b border-l border-white/8 p-2 first:border-l-0">
                      <div className={`mb-2 text-xs ${sameDay(date, todayDate) ? "text-sky-200" : muted ? "text-slate-600" : "text-slate-400"}`}>{date.getDate()}</div>
                      <div className="grid gap-1">
                        {dayItems.map((item) => (
                          <button
                            key={item.id}
                            className="flex min-w-0 items-center gap-1.5 rounded bg-white/[0.035] px-1.5 py-1 text-left text-[11px] text-slate-200 transition hover:bg-white/[0.07]"
                            onClick={() => selectItem(item)}
                            type="button"
                            {...itemTooltipProps(item)}
                          >
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass[categoryKey(item)]}`} />
                            <span className="truncate">{item.fields.name}</span>
                          </button>
                        ))}
                        {allItems.length > dayItems.length ? <div className="px-1.5 text-[11px] text-slate-500">+{allItems.length - dayItems.length} more</div> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {!loading && !error && !reviewOnly && !priorityOnly && viewMode === "Agenda" ? (
            <div className="calendar-content-surface max-h-[490px] overflow-y-auto rounded-xl border border-white/8 bg-[#081421]/74">
              {agendaItems.length === 0 ? <div className="px-5 py-10 text-center text-sm text-slate-400">No upcoming calendar items.</div> : null}
              {agendaItems.map((item) => (
                <button
                  key={item.id}
                  className="flex w-full gap-4 border-b border-white/8 px-5 py-4 text-left transition hover:bg-white/[0.035] last:border-b-0"
                  onClick={() => selectItem(item)}
                  type="button"
                  {...itemTooltipProps(item)}
                >
                  <div className="w-24 shrink-0 text-sm text-slate-400">{item.dateLabel}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${dotClass[categoryKey(item)]}`} />
                      <h3 className="truncate text-sm font-medium text-white">{item.fields.name}</h3>
                    </div>
                    <p className="mt-1 text-sm text-slate-400">{itemTimeLabel(item)} - {categoryDisplayLabel(item)}</p>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-300">{item.fields.action_needed}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : null}

          {selectedItem && eventDraft ? (
            <aside className="calendar-event-editor absolute bottom-4 right-4 top-[68px] z-20 flex w-[min(360px,calc(100%-2rem))] flex-col overflow-hidden rounded-2xl border border-sky-200/18 bg-[#071523]/95 shadow-[0_28px_70px_rgba(0,0,0,0.48),0_0_34px_rgba(56,189,248,0.10)] backdrop-blur-xl">
              <header className="flex items-start justify-between gap-4 border-b border-white/8 px-4 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-sky-200">
                    <CalendarCheck2 className="h-4 w-4" />
                    Edit event
                  </div>
                  <h3 className="mt-2 truncate text-base font-medium text-white">{selectedItem.fields.name}</h3>
                  <p className="mt-1 truncate text-xs text-slate-500">{displayDateTime(selectedItem)}</p>
                </div>
                <button
                  aria-label="Close event editor"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/8 bg-white/[0.035] text-slate-400 transition hover:border-white/14 hover:bg-white/[0.07] hover:text-white"
                  onClick={closeItemEditor}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </header>

              <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
                <button
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-emerald-300/24 bg-emerald-500/12 px-2.5 text-xs font-medium text-emerald-100 transition hover:bg-emerald-400/18 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={quickActionPending !== null}
                  onClick={() => void quickMarkDone()}
                  type="button"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {quickActionPending === "done" ? "Marking..." : "Done"}
                </button>
                <button
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.035] px-2.5 text-xs font-medium text-slate-200 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={quickActionPending !== null}
                  onClick={() => void quickSnooze(1)}
                  type="button"
                >
                  <Clock className="h-3.5 w-3.5" />
                  {quickActionPending === "snooze1" ? "..." : "+1d"}
                </button>
                <button
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.035] px-2.5 text-xs font-medium text-slate-200 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={quickActionPending !== null}
                  onClick={() => void quickSnooze(7)}
                  type="button"
                >
                  <Clock className="h-3.5 w-3.5" />
                  {quickActionPending === "snooze7" ? "..." : "+1w"}
                </button>
                <button
                  className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.035] px-2.5 text-xs font-medium text-slate-200 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={quickActionPending !== null}
                  onClick={() => void quickOpenFile()}
                  type="button"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open file
                </button>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                <label className="block text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                  Title
                  <input
                    className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-white/[0.035] px-3 text-sm normal-case tracking-normal text-white outline-none transition placeholder:text-slate-600 focus:border-sky-300/50 focus:bg-white/[0.055]"
                    onChange={(event) => updateDraft("name", event.target.value)}
                    value={eventDraft.name}
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                    Date
                    <input
                      className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-white/[0.035] px-3 text-sm normal-case tracking-normal text-white outline-none transition focus:border-sky-300/50 focus:bg-white/[0.055]"
                      onChange={(event) => updateDraft("date", event.target.value)}
                      type="date"
                      value={eventDraft.date}
                    />
                  </label>
                  <label className="block text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                    Status
                    <select
                      className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#081421] px-3 text-sm normal-case tracking-normal text-white outline-none transition focus:border-sky-300/50"
                      onChange={(event) => updateDraft("status", event.target.value)}
                      value={eventDraft.status || "active"}
                    >
                      <option value="active">Active</option>
                      <option value="done">Done</option>
                      <option value="canceled">Canceled</option>
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                    Start
                    <input
                      className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-white/[0.035] px-3 text-sm normal-case tracking-normal text-white outline-none transition focus:border-sky-300/50 focus:bg-white/[0.055]"
                      onChange={(event) => updateDraft("time_start", event.target.value)}
                      type="time"
                      value={eventDraft.time_start}
                    />
                  </label>
                  <label className="block text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                    End
                    <input
                      className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-white/[0.035] px-3 text-sm normal-case tracking-normal text-white outline-none transition focus:border-sky-300/50 focus:bg-white/[0.055]"
                      onChange={(event) => updateDraft("time_end", event.target.value)}
                      type="time"
                      value={eventDraft.time_end}
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                    Calendar
                    <select
                      className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#081421] px-3 text-sm normal-case tracking-normal text-white outline-none transition focus:border-sky-300/50"
                      onChange={(event) => {
                        const next = calendarFilters.find((filter) => filter.key === event.target.value);
                        updateDraft("category", next?.label ?? "Other");
                      }}
                      value={selectedItemCategoryKey}
                    >
                      {calendarFilters.map((filter) => (
                        <option key={filter.key} value={filter.key}>
                          {filter.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                    Importance
                    <select
                      className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#081421] px-3 text-sm normal-case tracking-normal text-white outline-none transition focus:border-sky-300/50"
                      onChange={(event) => updateDraft("importance", event.target.value)}
                      value={eventDraft.importance || "medium"}
                    >
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </label>
                </div>

                <label className="block text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                  Action needed
                  <textarea
                    className="mt-2 min-h-[86px] w-full resize-none rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-sm normal-case leading-relaxed tracking-normal text-white outline-none transition placeholder:text-slate-600 focus:border-sky-300/50 focus:bg-white/[0.055]"
                    onChange={(event) => updateDraft("action_needed", event.target.value)}
                    value={eventDraft.action_needed}
                  />
                </label>

                <label className="block text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                  Note body
                  <textarea
                    className="mt-2 min-h-[118px] w-full resize-none rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-sm normal-case leading-relaxed tracking-normal text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-sky-300/50 focus:bg-white/[0.055]"
                    onChange={(event) => updateDraft("body", event.target.value)}
                    value={eventDraft.body}
                  />
                </label>
              </div>

              <footer className="border-t border-white/8 px-4 py-3">
                {saveMessage ? <div className="mb-3 rounded-lg border border-white/8 bg-white/[0.035] px-3 py-2 text-xs text-slate-300">{saveMessage}</div> : null}
                <button
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-sky-300/28 bg-sky-500/18 text-sm font-medium text-sky-50 shadow-[0_0_24px_rgba(56,189,248,0.12)] transition hover:bg-sky-400/22 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={savingEvent}
                  onClick={() => void saveEventEdits()}
                  type="button"
                >
                  <Save className="h-4 w-4" />
                  {savingEvent ? "Saving..." : "Save calendar event"}
                </button>
              </footer>
            </aside>
          ) : null}

          {tooltip ? <CalendarEventTooltip item={tooltip.item} style={tooltip.style} /> : null}
        </section>
      </div>
    </Panel>
  );
}

function CalendarEventTooltip({ item, style }: { item: RcfCalendarItem; style: CSSProperties }) {
  const place = eventPlace(item);
  const source = eventSource(item);
  const action = item.fields.action_needed || "";
  return (
    <div className="calendar-event-tooltip" style={style}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-200">{categoryDisplayLabel(item)}</div>
      <div className="mt-1 text-sm font-medium leading-snug text-white">{item.fields.name}</div>
      <dl className="mt-3 grid gap-2 text-xs">
        <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-3">
          <dt className="text-slate-500">Time</dt>
          <dd className="text-slate-200">{displayDateTime(item)}</dd>
        </div>
        {place ? (
          <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-3">
            <dt className="text-slate-500">Place</dt>
            <dd className="truncate text-slate-200">{place}</dd>
          </div>
        ) : null}
        {source ? (
          <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-3">
            <dt className="text-slate-500">Source</dt>
            <dd className="truncate text-slate-200">{source}</dd>
          </div>
        ) : null}
      </dl>
      {action ? <div className="mt-3 line-clamp-3 border-t border-white/8 pt-3 text-xs leading-relaxed text-slate-300">{action}</div> : null}
    </div>
  );
}
