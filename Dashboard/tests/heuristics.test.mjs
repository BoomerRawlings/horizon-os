// PHASE-08 heuristics unit test. Run: node tests/heuristics.test.mjs
// Pure/deterministic — pins today to 2026-07-08 (a Wednesday) so relative dates are stable.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { heuristicActions } = require("../server/captureHeuristics.cjs");

const TODAY = "2026-07-08"; // Wednesday
const hasAction = (id) => ["create_calendar_item", "save_research", "save_note", "draft_email", "create_project", "queue_review"].includes(id);
const run = (text) => heuristicActions(text, { today: TODAY, hasAction });

let failures = 0;
function check(label, cond, detail) {
  if (cond) {
    console.log(`  ok - ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL - ${label}${detail ? ` :: ${detail}` : ""}`);
  }
}
const primary = (text) => run(text)[0];
const typeOf = (text) => primary(text)?.type;

// 1. Explicit ISO date + meridiem time → calendar, high, exact fields.
{
  const a = primary("Dentist appointment on 2026-08-14 at 2pm");
  check("ISO date+time → calendar high", a?.type === "create_calendar_item" && a?.confidence === "high", JSON.stringify(a));
  check("ISO date parsed exactly", a?.payload.date === "2026-08-14", a?.payload.date);
  check("2pm → 14:00", a?.payload.time_start === "14:00", a?.payload.time_start);
  check("title excludes date/time", /dentist/i.test(a?.payload.title) && !/2026|2pm/i.test(a?.payload.title), a?.payload.title);
}

// 2. Relative "tomorrow" + "3pm" — resolves correctly but stays MEDIUM (clock-relative,
//    so a stale capture must never batch-auto-apply a wrong day).
{
  const a = primary("Dentist tomorrow 3pm");
  check("tomorrow → 2026-07-09", a?.payload.date === "2026-07-09", a?.payload.date);
  check("3pm → 15:00", a?.payload.time_start === "15:00", a?.payload.time_start);
  check("tomorrow → medium (relative, not high)", a?.confidence === "medium", a?.confidence);
}
{
  const a = primary("Fireworks tonight");
  check("tonight → today, medium", a?.payload.date === "2026-07-08" && a?.confidence === "medium", JSON.stringify(a));
}

// 3. US M/D, no year, future-rolled within year.
{
  const a = primary("Call mom 8/14");
  check("8/14 → 2026-08-14", a?.payload.date === "2026-08-14", a?.payload.date);
}
{
  // A month/day already past this year rolls to next year (conservative scheduling).
  const a = primary("Taxes 1/15");
  check("1/15 (past) → 2027-01-15", a?.payload.date === "2027-01-15", a?.payload.date);
}

// 4. Weekday → medium, deterministic next occurrence, 24h time.
{
  const a = primary("Team sync next Friday 10:30");
  check("next Friday from Wed → 2026-07-17", a?.payload.date === "2026-07-17", a?.payload.date);
  check("10:30 → 10:30", a?.payload.time_start === "10:30", a?.payload.time_start);
  check("weekday → medium (not high)", a?.confidence === "medium", a?.confidence);
}

// 5. DOI → research high.
{
  const a = primary("https://doi.org/10.1000/xyz notes on attention");
  check("DOI → save_research high", a?.type === "save_research" && a?.confidence === "high", JSON.stringify(a));
  check("DOI captured", a?.payload.doi === "10.1000/xyz", a?.payload.doi);
}

// 6. URL with paper context → research; plain URL → note.
check("paper-context URL → save_research", typeOf("read this paper https://example.com/x") === "save_research");
{
  const a = primary("cool link https://example.com/thing");
  check("plain URL → save_note medium", a?.type === "save_note" && a?.confidence === "medium", JSON.stringify(a));
  check("plain URL preserved", a?.payload.url === "https://example.com/thing", a?.payload.url);
}

// 7. Reminder (no date) → open reminder calendar, date unknown, medium.
{
  const a = primary("remind me to renew the domain");
  check("reminder → calendar", a?.type === "create_calendar_item", a?.type);
  check("reminder date unknown", a?.payload.date === "unknown", a?.payload.date);
  check("reminder medium", a?.confidence === "medium", a?.confidence);
  check("reminder title strips lead-in", /renew the domain/i.test(a?.payload.title) && !/remind/i.test(a?.payload.title), a?.payload.title);
}

// 8. Email + verb → draft_email medium.
{
  const a = primary("email alice@example.com about the invoice");
  check("email → draft_email", a?.type === "draft_email", a?.type);
  check("email_to captured", a?.payload.email_to === "alice@example.com", a?.payload.email_to);
}

// 9. DON'T GUESS — ambiguous/garbage fire nothing.
check("'meeting maybe sometime' → [] (no invented date)", run("meeting maybe sometime").length === 0, JSON.stringify(run("meeting maybe sometime")));
check("garbage → []", run("asdf qwer zxcv").length === 0, JSON.stringify(run("asdf qwer zxcv")));
check("bare number is not a time/date", run("buy 3 apples").length === 0, JSON.stringify(run("buy 3 apples")));
check("empty → []", run("   ").length === 0);

// 10. Explicit project language → reviewed project proposal, even without AI.
{
  const a = primary("Create a project for garden planning");
  check("explicit project request → create_project", a?.type === "create_project", JSON.stringify(a));
  check("project title strips the lead-in", a?.payload.title === "garden planning", a?.payload.title);
  check("project proposal stays medium confidence", a?.confidence === "medium", a?.confidence);
}

// 11. save_research unavailable (registry lacks it) → research falls back to save_note.
{
  const noResearch = heuristicActions("https://doi.org/10.1/x paper", { today: TODAY, hasAction: (id) => id !== "save_research" });
  check("no save_research → save_note", noResearch[0]?.type === "save_note", JSON.stringify(noResearch[0]));
}

if (failures) {
  console.error(`\nHEURISTICS FAIL: ${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nHEURISTICS PASS");
