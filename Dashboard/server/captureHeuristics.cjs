// captureHeuristics.cjs — PHASE-08: deterministic, zero-AI, zero-network pre-triage.
//
// Many captures are mechanically obvious: a date+time is a calendar item, a DOI/URL is
// research, "remind me to X" is an open reminder. This module turns those into suggested
// action buttons INSTANTLY and for free, so the pile is useful even when the ai-agent
// integration isn't configured. When the AI IS configured it REFINES these (server merges;
// see triageCapture in server.cjs) rather than gatekeeping.
//
// PRIME DIRECTIVE (AGENTS.md + phase card STOP rules): DON'T GUESS. Under-suggest rather
// than over-suggest. NEVER invent a date — no date parsed means the calendar rule simply
// doesn't fire. Anything ambiguous is "medium" confidence at most (so the sweep's
// "apply all high-confidence" skips it and waits for a human).
//
// Output: raw action objects the server normalizes via normalizeCaptureTriageResult:
//   { type, label, confidence: "high"|"medium", reason, payload: { ...subset } }
// Payload fields must match the canonical capture payload the apply executors read.
//
// ── Worked test cases (each verified in tests/heuristics.test.mjs) ─────────────────────
//   "Dentist appointment on 2026-08-14 at 2pm" → create_calendar_item high
//        date 2026-08-14, time_start 14:00, title "Dentist appointment"
//   "Dentist tomorrow 3pm"        (today 2026-07-08) → create_calendar_item high, date 2026-07-09, 15:00
//   "Call mom 8/14"               (today 2026-07-08) → create_calendar_item high, date 2026-08-14
//   "Team sync next Friday 10:30" (today 2026-07-08=Wed) → create_calendar_item medium, date 2026-07-17, 10:30
//   "https://doi.org/10.1000/xyz on attention" → save_research high, doi 10.1000/xyz
//   "read this paper https://example.com/x"    → save_research high (paper context)
//   "cool link https://example.com/thing"      → save_note medium (plain URL)
//   "remind me to renew the domain"            → create_calendar_item medium, date unknown (open reminder)
//   "email alice@example.com about the invoice"→ draft_email medium, email_to alice@example.com
//   "create a project for garden planning"      → create_project medium (reviewed proposal)
//   "meeting maybe sometime"                   → []  (NO invented date)
//   "asdf qwer"                                → []  (garbage → queue_review fallback upstream)

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const WEEKDAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isoFromParts(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function validYmd(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

function isoAddDays(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function isoWeekday(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Resolve a named weekday to a concrete date. Deterministic; never today or the past.
//   bare/"this <wd>": the soonest upcoming occurrence (today → the one next week).
//   "next <wd>":      a further week out, the common distinct meaning of "next".
// Weekday dates are always MEDIUM confidence (English is genuinely fuzzy here; a human
// approves before anything is written).
function weekdayDate(todayIso, targetDow, isNext) {
  const todayDow = isoWeekday(todayIso);
  const base = (targetDow - todayDow + 7) % 7; // 0..6, 0 = today
  const offset = isNext ? base + 7 : base || 7;
  return isoAddDays(todayIso, offset);
}

// ── Time ──────────────────────────────────────────────────────────────────────────────
// Returns { time: "HH:MM", raw } or null. Supports 3pm, 3:30 pm, 15:30. Conservative:
// bare "3" is NOT a time (too ambiguous); a meridiem or an explicit HH:MM is required.
function parseTime(text) {
  const twelve = text.match(/\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*([ap])\.?m\.?\b/i);
  if (twelve) {
    let hour = Number(twelve[1]) % 12;
    if (/p/i.test(twelve[3])) hour += 12;
    return { time: `${pad2(hour)}:${twelve[2] || "00"}`, raw: twelve[0] };
  }
  const twentyFour = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (twentyFour) {
    return { time: `${pad2(Number(twentyFour[1]))}:${twentyFour[2]}`, raw: twentyFour[0] };
  }
  return null;
}

// ── Date ──────────────────────────────────────────────────────────────────────────────
// Returns { date: "YYYY-MM-DD", raw, explicit } or null. `explicit` gates HIGH confidence
// and, crucially, safe batch auto-apply: an ABSOLUTE date (ISO / M-D / month-name) is
// correct no matter when the pile is swept, so it's high-eligible. A RELATIVE date
// (today / tonight / tomorrow / weekday) resolves against the SERVER clock, so a stale
// capture saying "tonight" would resolve to the wrong day if swept days later — those stay
// MEDIUM so "apply all high-confidence" never auto-applies a possibly-wrong date; a human
// eyeballs the resolved date on one-click apply. NEVER invents a date — no parse → null.
function parseDate(text, todayIso) {
  const lower = text.toLowerCase();

  // ISO 2026-08-14
  const iso = text.match(/\b(20\d{2})-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])\b/);
  if (iso) {
    const [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    if (validYmd(y, m, d)) return { date: isoFromParts(y, m, d), raw: iso[0], explicit: true };
  }

  // US M/D or M/D/YY(YY). No year → current year, rolled to next year if already past.
  const us = text.match(/\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])(?:\/(\d{2,4}))?\b/);
  if (us) {
    const month = Number(us[1]);
    const day = Number(us[2]);
    let year;
    if (us[3]) {
      year = Number(us[3].length === 2 ? `20${us[3]}` : us[3]);
    } else {
      year = Number(todayIso.slice(0, 4));
      if (validYmd(year, month, day) && isoFromParts(year, month, day) < todayIso) year += 1;
    }
    if (validYmd(year, month, day)) return { date: isoFromParts(year, month, day), raw: us[0], explicit: true };
  }

  // Month-name forms: "Aug 14", "August 14th, 2026", "14 August", "14th of Aug".
  const monthDay = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?\b/i);
  const dayMonth = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(?:,?\s*(20\d{2}))?\b/i);
  const nameMatch = monthDay
    ? { month: MONTHS[monthDay[1].toLowerCase().slice(0, monthDay[1].toLowerCase() === "sept" ? 4 : 3)], day: Number(monthDay[2]), year: monthDay[3], raw: monthDay[0] }
    : dayMonth
      ? { month: MONTHS[dayMonth[2].toLowerCase().slice(0, dayMonth[2].toLowerCase() === "sept" ? 4 : 3)], day: Number(dayMonth[1]), year: dayMonth[3], raw: dayMonth[0] }
      : null;
  if (nameMatch && nameMatch.month) {
    let year = nameMatch.year ? Number(nameMatch.year) : Number(todayIso.slice(0, 4));
    if (!nameMatch.year && validYmd(year, nameMatch.month, nameMatch.day) && isoFromParts(year, nameMatch.month, nameMatch.day) < todayIso) {
      year += 1;
    }
    if (validYmd(year, nameMatch.month, nameMatch.day)) {
      return { date: isoFromParts(year, nameMatch.month, nameMatch.day), raw: nameMatch.raw, explicit: true };
    }
  }

  // Relative day words — resolved against the server clock, so NOT explicit (medium only).
  if (/\btoday\b/.test(lower)) return { date: todayIso, raw: (text.match(/\btoday\b/i) || [])[0], explicit: false };
  if (/\btonight\b/.test(lower)) return { date: todayIso, raw: (text.match(/\btonight\b/i) || [])[0], explicit: false };
  if (/\btomorrow\b/.test(lower)) return { date: isoAddDays(todayIso, 1), raw: (text.match(/\btomorrow\b/i) || [])[0], explicit: false };

  // Weekday names (optionally "this"/"next"). Deterministic but clock-relative → medium.
  const wd = text.match(/\b(?:(this|next)\s+)?(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/i);
  if (wd) {
    const dow = WEEKDAYS[wd[2].toLowerCase().slice(0, 3)];
    return { date: weekdayDate(todayIso, dow, /next/i.test(wd[1] || "")), raw: wd[0], explicit: false };
  }

  return null;
}

// Strip matched date/time/lead-in fragments to get a title. Only dangling date/time
// prepositions (on/at/by) left behind by fragment removal are dropped — NOT articles like
// "the/a", which are part of the real title ("renew the domain" must stay intact).
function titleFromRemainder(text, fragments) {
  let out = text;
  for (const frag of fragments) {
    if (frag) out = out.split(frag).join(" ");
  }
  return out
    .replace(/\s+\b(on|at|by)\b\s*$/i, " ")
    .replace(/\b(on|at|by)\b\s*$/i, "")
    .replace(/^\s*\b(on|at|by)\b\s+/i, " ")
    .replace(/\s+\b(on|at|by)\b(?=\s|$)/gi, " ")
    .replace(/[–—:;]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.-]+|[\s,.-]+$/g, "")
    .trim()
    .slice(0, 80);
}

const COURSEWORK_DEADLINE_CONTEXT = /\b(homework|assignment|canvas|coursework|quiz|exam|module|discussion(?:\s+post)?|lab|problem\s+set)\b/i;

function applyCourseworkDeadlineDefault(action, sourceText = "") {
  if (!action || action.type !== "create_calendar_item") return action;
  const payload = { ...(action.payload || {}) };
  const context = [sourceText, payload.title, payload.body, payload.action_needed, payload.category].filter(Boolean).join(" ");
  const hasDate = /^\d{4}-\d{2}-\d{2}$/.test(String(payload.date || ""));
  if (!hasDate || payload.time_start || !COURSEWORK_DEADLINE_CONTEXT.test(context)) return action;
  return {
    ...action,
    reason: `${String(action.reason || "Detected a coursework deadline.").replace(/\s+$/, "")} No time was specified, so Horizon used the safe coursework default of 23:58.`,
    payload: { ...payload, time_start: "23:58" },
  };
}

function calendarAction(text, todayIso) {
  const date = parseDate(text, todayIso);
  if (!date) return null;
  const time = parseTime(text);
  const title = titleFromRemainder(text, [date.raw, time?.raw]);
  // HIGH only for an ABSOLUTE date with a title (safe to batch-apply). Relative dates
  // (today/tomorrow/weekday) stay medium so a stale capture never auto-applies a wrong day.
  const highEligible = date.explicit && Boolean(title);
  return applyCourseworkDeadlineDefault({
    type: "create_calendar_item",
    label: title ? `Calendar: ${title}`.slice(0, 48) : "Calendar event",
    confidence: highEligible ? "high" : "medium",
    reason: `Detected ${date.explicit ? "a specific date" : "a relative date"}${time ? " and time" : ""} in the capture.`,
    payload: {
      title: title || "",
      date: date.date,
      time_start: time ? time.time : "",
      action_needed: title || "",
    },
  }, text);
}

const PAPER_CONTEXT = /\b(paper|study|studies|article|journal|preprint|research|arxiv|abstract|citation|cite|doi)\b/i;

function researchAction(text, hasAction) {
  const doi = (text.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i) || [])[0]?.replace(/[.,;:!?]+$/, "");
  const url = (text.match(/https?:\/\/[^\s<>"')]+/i) || [])[0]?.replace(/[.,;:!?]+$/, "");
  const arxiv = /arxiv\.org/i.test(text) || /\barxiv:\s*\d{4}\.\d{4,5}/i.test(text);
  if (!doi && !url && !arxiv) return null;

  const researchAvailable = hasAction("save_research");
  const paperLike = Boolean(doi) || arxiv || (url && PAPER_CONTEXT.test(text));
  const title = titleFromRemainder(text, [doi, url]).slice(0, 80);

  if (paperLike && researchAvailable) {
    return {
      type: "save_research",
      label: "Save as research",
      confidence: "high",
      reason: doi ? "Detected a DOI." : arxiv ? "Detected an arXiv link." : "Detected a link in a research context.",
      payload: { title, doi: doi || "", url: url || "", source: url || "", body: text.trim() },
    };
  }
  // Plain link (or research action unavailable) → keep it as a note, link preserved.
  return {
    type: "save_note",
    label: "Save link as note",
    confidence: "medium",
    reason: "Detected a link; saving it as a note keeps it without guessing it's a paper.",
    payload: { title, url: url || "", source: url || (doi ? `https://doi.org/${doi}` : ""), body: text.trim() },
  };
}

const RESEARCH_IDEA_CONTEXT = /\b(rough\s+research\s+note|research\s+(?:idea|question|note)|look\s+into|investigate|study\s+whether)\b/i;

function researchIdeaAction(text, hasAction) {
  if (!hasAction("save_research_idea") || !RESEARCH_IDEA_CONTEXT.test(text)) return null;
  if (/https?:\/\//i.test(text) || /\b10\.\d{4,9}\//i.test(text)) return null;
  const title = titleFromRemainder(text, [(text.match(RESEARCH_IDEA_CONTEXT) || [])[0]])
    .replace(/\[\[[^\]]+\]\]/g, " ")
    .replace(/\bconnected\s+to\b\s*:?/i, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    type: "save_research_idea",
    label: "Save research idea",
    confidence: "medium",
    reason: "Detected an explicit research note or open question without a paper citation.",
    payload: {
      title: title || "Research note",
      body: text.trim(),
    },
  };
}

const GENERAL_NOTE_LEAD = /^\s*(?:rough\s+)?(?:note|thought|idea)\s*[:\-]/i;

function generalNoteAction(text, hasAction) {
  const lead = text.match(GENERAL_NOTE_LEAD);
  if (!lead || !hasAction("save_note")) return null;
  const title = titleFromRemainder(text, [lead[0]]);
  return {
    type: "save_note",
    label: "Save cleaned note",
    confidence: "medium",
    reason: "Detected an explicit rough note for the Workbench.",
    payload: { title: title || "Workbench note", body: text.trim(), destination: "Inbox" },
  };
}

const REMINDER_LEAD = /\b(remind me(?: to)?|reminder to|don'?t forget(?: to)?|remember to|to-?do:?|todo:?|follow ?up(?: on)?)\b/i;

function reminderAction(text) {
  const lead = text.match(REMINDER_LEAD);
  if (!lead) return null;
  const title = titleFromRemainder(text, [lead[0]]);
  return {
    type: "create_calendar_item",
    label: title ? `Reminder: ${title}`.slice(0, 48) : "Open reminder",
    confidence: "medium",
    reason: "Looks like a reminder with no specific date, so this becomes an open (undated) reminder.",
    payload: {
      title: title || text.trim().slice(0, 80),
      date: "unknown",
      action_needed: title || text.trim().slice(0, 80),
    },
  };
}

const EMAIL_VERB = /\b(e-?mail|send(?:\s+an?\s+e-?mail)?|reply|respond|write\s+to|message)\b/i;

function emailAction(text) {
  const address = (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0];
  if (!address || !EMAIL_VERB.test(text)) return null;
  const title = titleFromRemainder(text, [address]).replace(/\b(e-?mail|send|reply|respond|write|message|about|re)\b/gi, " ").replace(/\s+/g, " ").trim();
  return {
    type: "draft_email",
    label: "Draft email",
    confidence: "medium",
    reason: "Detected an email address and a send/reply verb.",
    payload: {
      title: title ? `Email: ${title}`.slice(0, 80) : `Email ${address}`,
      email_to: address,
      email_subject: title.slice(0, 80),
      body: text.trim(),
    },
  };
}

const PROJECT_LEAD = /^\s*(?:(?:create|start|make|set\s+up)\s+(?:a\s+)?(?:new\s+)?project|new\s+project)\b(?:\s+(?:for|called|named))?\s*[:\-–—]?\s*/i;

function projectAction(text, hasAction) {
  if (!hasAction("create_project")) return null;
  const lead = text.match(PROJECT_LEAD);
  if (!lead) return null;
  const title = titleFromRemainder(text, [lead[0]]) || "New project proposal";
  return {
    type: "create_project",
    label: `Project proposal: ${title}`.slice(0, 48),
    confidence: "medium",
    reason: "Detected an explicit request to start a project; Horizon will stage a local proposal without inventing a folder or registry location.",
    payload: {
      title,
      body: text.trim(),
    },
  };
}

const CONFIDENCE_RANK = { high: 2, medium: 1, low: 0 };

/**
 * @param {string} text
 * @param {{ today?: string, hasAction?: (id: string) => boolean }} [options]
 * @returns {Array<{type,label,confidence,reason,payload}>}
 */
function heuristicActions(text, options = {}) {
  const clean = String(text || "").trim();
  if (!clean) return [];
  const today = /^\d{4}-\d{2}-\d{2}$/.test(options.today || "") ? options.today : new Date().toISOString().slice(0, 10);
  const hasAction = typeof options.hasAction === "function" ? options.hasAction : () => true;

  const fired = [];
  const calendar = calendarAction(clean, today);
  if (calendar) fired.push(calendar);
  const research = researchAction(clean, hasAction);
  if (research) fired.push(research);
  if (!research) {
    const researchIdea = researchIdeaAction(clean, hasAction);
    if (researchIdea) fired.push(researchIdea);
  }
  const generalNote = generalNoteAction(clean, hasAction);
  if (generalNote) fired.push(generalNote);
  // A reminder is only meaningful when no concrete date was already detected (a dated
  // "remind me ... tomorrow" is already covered by the calendar action above).
  if (!calendar) {
    const reminder = reminderAction(clean);
    if (reminder) fired.push(reminder);
  }
  const email = emailAction(clean);
  if (email) fired.push(email);
  const project = projectAction(clean, hasAction);
  if (project) fired.push(project);

  // Dedupe by type (keep the higher-confidence one) and order high→medium.
  const byType = new Map();
  for (const action of fired) {
    const existing = byType.get(action.type);
    if (!existing || CONFIDENCE_RANK[action.confidence] > CONFIDENCE_RANK[existing.confidence]) {
      byType.set(action.type, action);
    }
  }
  return [...byType.values()].sort((a, b) => CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence]);
}

module.exports = { applyCourseworkDeadlineDefault, heuristicActions };
