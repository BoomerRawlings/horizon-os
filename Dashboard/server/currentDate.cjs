function localIsoDateInTimeZone(date = new Date(), timeZone = "UTC") {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function currentLocalIsoDate({
  date = new Date(),
  override = "",
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
} = {}) {
  const fixedDate = String(override || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(fixedDate)
    ? fixedDate
    : localIsoDateInTimeZone(date, timeZone);
}

module.exports = { currentLocalIsoDate, localIsoDateInTimeZone };
