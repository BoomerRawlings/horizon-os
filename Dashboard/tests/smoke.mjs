// Minimal smoke test: boots the server on a scratch port, checks core APIs, exits.
// Run: npm run smoke   (from Dashboard/)
import { execFileSync } from "node:child_process";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 3899;
const BASE = `http://127.0.0.1:${PORT}`;
const here = path.dirname(fileURLToPath(import.meta.url));
const server = spawn(process.execPath, [path.join(here, "..", "server.cjs")], {
  // HORIZON_DISABLE_AI keeps triage deterministic + offline for smoke: it exercises the
  // PHASE-08 local heuristics (no network, no key needed), which is exactly the path we
  // want smoke to guard. AI refinement is tested manually, not in the 10-second smoke.
  env: { ...process.env, PORT: String(PORT), HORIZON_DISABLE_AI: "1", HORIZON_DISABLE_EXTERNAL_INTEGRATIONS: "1" },
  stdio: "ignore",
});

// child_process.kill() on Windows emulates POSIX signals through an internal async
// handle; under Node 24 that path can race libuv's handle-close bookkeeping and crash
// with "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" even after the test
// itself has already passed. taskkill terminates the process tree directly, bypassing
// that emulation layer entirely, so it doesn't hit the race.
function shutdown(code) {
  if (server.exitCode !== null || server.signalCode !== null) {
    process.exit(code);
    return;
  }
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      // Already exited or couldn't be found - fine, we're exiting either way.
    }
    process.exit(code);
    return;
  }
  server.once("exit", () => process.exit(code));
  server.kill();
}

const fail = (msg) => { console.error(`SMOKE FAIL: ${msg}`); shutdown(1); };
const ok = (msg) => console.log(`  ok - ${msg}`);

async function waitForHealth(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return r.json();
    } catch {}
    await new Promise((res) => setTimeout(res, 250));
  }
  fail("server did not answer /api/health within 10s");
}

const health = await waitForHealth();
if (health.app !== "horizon-os") fail(`unexpected health payload: ${JSON.stringify(health)}`);
ok("/api/health identifies horizon-os");

const developmentSandboxResponse = await fetch(`${BASE}/api/development-sandbox`);
const developmentSandboxHtml = await developmentSandboxResponse.text();
if (!developmentSandboxResponse.ok || developmentSandboxResponse.headers.get("x-horizon-local-only") !== "true") {
  fail("/api/development-sandbox is missing its local-only response boundary");
}
if (!developmentSandboxHtml.includes("Constellation")) {
  fail("/api/development-sandbox did not return a usable local experiment or fallback");
}
ok("/api/development-sandbox serves a Git-ignored local experiment boundary");

const items = await (await fetch(`${BASE}/api/items`)).json();
const list = Array.isArray(items) ? items : items.items;
if (!Array.isArray(list)) fail("/api/items did not return an item list");
ok(`/api/items returned ${list.length} calendar item(s)`);

const integ = await (await fetch(`${BASE}/api/integrations`)).json();
if (!Array.isArray(integ.connections) || !integ.connections.length) fail("/api/integrations empty");
if (!integ.connections.every((c) => c.capability)) fail("integration missing capability field");
ok(`/api/integrations returned ${integ.connections.length} connections, all with capability`);

const captureActions = await (await fetch(`${BASE}/api/capture/actions`)).json();
if (!Array.isArray(captureActions.actions) || captureActions.actions.length < 10) {
  fail("/api/capture/actions returned fewer than 10 actions");
}
if (!captureActions.actions.every((a) => a.id && a.reviewLabel && a.plan && a.permission)) {
  fail("capture action missing id/reviewLabel/plan/permission");
}
ok(`/api/capture/actions returned ${captureActions.actions.length} actions with full metadata`);

const papers = await (await fetch(`${BASE}/api/research/papers`)).json();
if (!Array.isArray(papers.papers)) fail("/api/research/papers did not return a papers list");
if (!papers.sources || typeof papers.sources.vaultCount !== "number" || typeof papers.sources.mergedCount !== "number" || typeof papers.sources.duplicateCount !== "number") {
  fail("/api/research/papers did not return merged source counts");
}
if (!papers.enrichment || typeof papers.enrichment.attempted !== "number" || typeof papers.enrichment.unresolved !== "number") {
  fail("/api/research/papers did not return metadata enrichment status");
}
if (papers.papers.length && papers.papers.some((p) => (
  p.citation === undefined
  || p.abstract === undefined
  || !["Abstract", "Summary"].includes(p.abstractLabel)
  || typeof p.doi !== "string"
  || typeof p.datePublished !== "string"
  || !Array.isArray(p.missingFields)
  || typeof p.metadataComplete !== "boolean"
  || !p.id
  || !p.title
  || !Array.isArray(p.authors)
  || !["to_read", "skimming", "read", "annotated"].includes(p.readingStatus)
  || typeof p.dogEared !== "boolean"
  || typeof p.duplicateCopies !== "number"
  || typeof p.primarySubject !== "string"
))) {
  fail("/api/research/papers missing citation/abstract/DOI/date/workflow fields");
}
const knownDois = papers.papers.map((paper) => paper.doi).filter((doi) => doi && doi !== "unknown");
if (new Set(knownDois).size !== knownDois.length) {
  fail("/api/research/papers returned duplicate DOI cards");
}
ok(`/api/research/papers returned ${papers.papers.length} paper(s) with labeled summaries and metadata status`);

// Research ideas endpoint: an empty result is valid for a new vault.
const ideas = await (await fetch(`${BASE}/api/research/ideas`)).json();
if (!Array.isArray(ideas.ideas)) fail("/api/research/ideas did not return an ideas array");
ok(`/api/research/ideas returned ${ideas.ideas.length} idea(s)`);

const projects = await (await fetch(`${BASE}/api/projects`)).json();
if (!Array.isArray(projects.projects)) fail("/api/projects did not return a projects array");
if (!projects.projects.every((p) => p.name && p.location !== undefined && p.status)) {
  fail("project registry entry missing name/location/status");
}
if (!projects.projects.every((p) => typeof p.captures === "number")) {
  fail("project registry entry missing captures count (PHASE-13)");
}
if (!projects.projects.every((p) => p.type === "project-registry")) {
  fail("/api/projects included a non-project registry note");
}
ok(`/api/projects returned ${projects.projects.length} true project record(s) with name/location/status/captures`);

const badStatus = await fetch(`${BASE}/api/projects/status`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ id: "__smoke_no_such_project__", status: "not-a-status" }),
});
if (badStatus.status !== 400) fail(`/api/projects/status should reject invalid statuses with 400, got ${badStatus.status}`);
const missingStatusProject = await fetch(`${BASE}/api/projects/status`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ id: "__smoke_no_such_project__", status: "retired" }),
});
if (missingStatusProject.status !== 404) fail(`/api/projects/status should 404 for unknown ids, got ${missingStatusProject.status}`);
ok("/api/projects/status validates status changes without mutating unknown projects");

// PHASE-13: the open-workspace route must reject unknown ids cleanly (no side effects).
const badOpen = await fetch(`${BASE}/api/projects/open`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ id: "__smoke_no_such_project__" }),
});
if (badOpen.status !== 404) fail(`/api/projects/open should 404 for unknown ids, got ${badOpen.status}`);
ok("/api/projects/open rejects unknown project ids");

const pile = await (await fetch(`${BASE}/api/capture/pile`)).json();
if (!Array.isArray(pile.items)) fail("/api/capture/pile did not return an items array");
if (!pile.counts || typeof pile.counts.total !== "number") fail("/api/capture/pile missing counts.total");
if (!pile.items.every((it) => it.id && (it.source === "to_triage" || it.source === "queue") && typeof it.blank === "boolean")) {
  fail("pile item missing id/source/blank");
}
ok(`/api/capture/pile returned ${pile.counts.total} item(s) (${pile.counts.toTriage} to-triage + ${pile.counts.queue} queue)`);

// Local heuristics produce suggestions with no AI configured.
async function triage(text) {
  const r = await fetch(`${BASE}/api/capture/triage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return r.json();
}
const cal = await triage("Dentist tomorrow 3pm");
if (!cal.ok || !cal.triage?.actions?.some((a) => a.type === "create_calendar_item")) {
  fail(`heuristic triage did not suggest a calendar item for a dated capture: ${JSON.stringify(cal.triage?.actions)}`);
}
ok(`/api/capture/triage suggested create_calendar_item with no AI (source ${cal.triage.actions.find((a) => a.type === "create_calendar_item").source})`);

const doi = await triage("https://doi.org/10.1000/xyz interesting study");
if (!doi.ok || !doi.triage?.actions?.some((a) => a.type === "save_research" || a.type === "save_note")) {
  fail(`heuristic triage did not suggest research/note for a link capture: ${JSON.stringify(doi.triage?.actions)}`);
}
ok(`/api/capture/triage suggested ${doi.triage.actions[0].type} for a DOI with no AI`);

console.log("SMOKE PASS");
shutdown(0);
