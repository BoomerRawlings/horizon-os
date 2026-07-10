import type { RcfCalendarItem } from "../types";

const dayMs = 86_400_000;

export function localIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfWeek(date: Date, weekStartsMonday: boolean) {
  const next = new Date(date);
  const day = next.getDay();
  const offset = weekStartsMonday ? (day === 0 ? -6 : 1 - day) : -day;
  next.setDate(next.getDate() + offset);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function daysBetween(start: Date, end: Date) {
  const startOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endOnly.getTime() - startOnly.getTime()) / dayMs);
}

export function isActiveCalendarItem(item: RcfCalendarItem) {
  return (item.fields.status || "").toLowerCase() === "active";
}

export function isDatedCalendarItem(item: RcfCalendarItem) {
  return Boolean(parseIsoDate(item.fields.date));
}

export function itemStartDate(item: RcfCalendarItem) {
  return parseIsoDate(item.fields.date);
}

export function itemEndDate(item: RcfCalendarItem) {
  return parseIsoDate(item.endDate || item.fields.date);
}

export function isRangeItem(item: RcfCalendarItem) {
  return Boolean(item.endDate && item.endDate !== item.fields.date);
}

export function isTimedItem(item: RcfCalendarItem) {
  return /^\d{2}:\d{2}$/.test(item.fields.time_start || "");
}

export function activeDatedItems(items: RcfCalendarItem[], showCompletedItems = false) {
  return items
    .filter((item) => (showCompletedItems || isActiveCalendarItem(item)) && isDatedCalendarItem(item))
    .sort(compareCalendarItems);
}

export function compareCalendarItems(a: RcfCalendarItem, b: RcfCalendarItem) {
  const dateCompare = a.sortDate.localeCompare(b.sortDate);
  if (dateCompare !== 0) return dateCompare;
  const timeCompare = (a.fields.time_start || "99:99").localeCompare(b.fields.time_start || "99:99");
  if (timeCompare !== 0) return timeCompare;
  return a.fields.name.localeCompare(b.fields.name);
}

export function itemIntersectsRange(item: RcfCalendarItem, start: Date, end: Date) {
  const itemStart = itemStartDate(item);
  const itemEnd = itemEndDate(item) ?? itemStart;
  if (!itemStart || !itemEnd) return false;
  return itemStart <= end && itemEnd >= start;
}

export function itemStartsOn(item: RcfCalendarItem, date: Date) {
  const itemStart = itemStartDate(item);
  return Boolean(itemStart && localIsoDate(itemStart) === localIsoDate(date));
}

export function upcomingItems(items: RcfCalendarItem[], today: string, limit: number) {
  const todayDate = parseIsoDate(today) ?? new Date();
  return activeDatedItems(items)
    .filter((item) => {
      const end = itemEndDate(item) ?? itemStartDate(item);
      return Boolean(end && end >= todayDate);
    })
    .sort((a, b) => {
      const aRange = isRangeItem(a) ? 1 : 0;
      const bRange = isRangeItem(b) ? 1 : 0;
      if (aRange !== bRange) return aRange - bRange;
      return compareCalendarItems(a, b);
    })
    .slice(0, limit);
}

export function upcomingPriorityItems(items: RcfCalendarItem[], today: string, limit: number) {
  return upcomingItems(items, today, 80)
    .filter((item) => (item.fields.importance || "").toLowerCase() === "high")
    .slice(0, limit);
}

export function countUpcomingExactItems(items: RcfCalendarItem[], today: string, days: number) {
  const todayDate = parseIsoDate(today) ?? new Date();
  const endDate = addDays(todayDate, days);
  return activeDatedItems(items).filter((item) => {
    const start = itemStartDate(item);
    return Boolean(start && start >= todayDate && start <= endDate && !isRangeItem(item));
  }).length;
}

export function formatClock(time: string) {
  if (!/^\d{2}:\d{2}$/.test(time || "")) return "";
  const [hourText, minuteText] = time.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

export function itemTimeLabel(item: RcfCalendarItem) {
  const start = formatClock(item.fields.time_start);
  const end = formatClock(item.fields.time_end);
  if (start && end) return `${start} - ${end}`;
  if (start) return start;
  if (isRangeItem(item)) return item.dateLabel;
  return "All day";
}

export function relativeDateLabel(item: RcfCalendarItem, today: string) {
  const date = itemStartDate(item);
  const todayDate = parseIsoDate(today);
  if (!date || !todayDate) return item.dateLabel;
  const diff = daysBetween(todayDate, date);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff > 1 && diff < 7) {
    return date.toLocaleDateString(undefined, { weekday: "short" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatWeekRange(start: Date) {
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const sameYear = start.getFullYear() === end.getFullYear();
  const startMonth = start.toLocaleDateString(undefined, { month: "short" });
  const endMonth = end.toLocaleDateString(undefined, { month: "short" });

  if (sameMonth && sameYear) {
    return `${startMonth} ${start.getDate()} - ${end.getDate()}, ${start.getFullYear()}`;
  }

  if (sameYear) {
    return `${startMonth} ${start.getDate()} - ${endMonth} ${end.getDate()}, ${start.getFullYear()}`;
  }

  return `${startMonth} ${start.getDate()}, ${start.getFullYear()} - ${endMonth} ${end.getDate()}, ${end.getFullYear()}`;
}

export function formatMonthLabel(date: Date) {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function calendarCategoryKey(categoryValue: string, contextValue = "") {
  const category = (categoryValue || "").toLowerCase();
  const context = `${category} ${contextValue || ""}`.toLowerCase();
  if (category.includes("university")) return "university";
  if (category.includes("college") || category.includes("school")) return "college";
  if (/\b(reference|observance|holiday|daylight|dst)\b/.test(context)) return "reference";
  if (category.includes("business")) return "business";
  if (category.includes("life")) return "life";
  return "other";
}

export function categoryKey(item: RcfCalendarItem) {
  return calendarCategoryKey(item.fields.category, `${item.fields.name} ${item.fields.action_needed} ${item.body}`);
}

export function categoryDisplayLabel(item: RcfCalendarItem) {
  const key = categoryKey(item);
  if (key === "college") return "College";
  if (key === "university") return "University";
  if (key === "reference") return "Reference";
  if (key === "life") return "Life Admin";
  if (key === "business") return "Business";
  return item.fields.category || "Other";
}
