// Minimal smoke test: boots the server on a scratch port, checks core APIs, exits.
// Run: npm run smoke   (from Dashboard/)
import { execFileSync } from "node:child_process";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import integrationStoreCrypto from "../server/integrationStoreCrypto.cjs";

const { decryptIntegrationStore, isEncryptedIntegrationStore } = integrationStoreCrypto;

const PORT = 3899;
const BASE = `http://127.0.0.1:${PORT}`;
const here = path.dirname(fileURLToPath(import.meta.url));
const expectedVersion = JSON.parse(readFileSync(path.join(here, "..", "package.json"), "utf8")).version;
const expectedVersionParts = expectedVersion.split(".").map((part) => Number(part));
const releaseFixtureVersion = `${expectedVersionParts[0]}.${expectedVersionParts[1]}.${expectedVersionParts[2] + 1}`;
const scratchAppData = mkdtempSync(path.join(tmpdir(), "horizon-smoke-"));
const scratchVault = path.join(scratchAppData, "vault");
const integrationStorePath = path.join(scratchAppData, "integration-settings.json");
const integrationStoreKey = randomBytes(32).toString("base64");
const nativeRelaunchPlanPath = path.join(scratchAppData, "native-relaunch-plan.json");
const releaseFixturePath = path.join(scratchAppData, "latest-release.json");
cpSync(path.join(here, "..", "server", "starter-vault"), scratchVault, { recursive: true });
writeFileSync(releaseFixturePath, `${JSON.stringify({
  assets: [{
    browser_download_url: "https://example.invalid/Horizon-Setup.exe",
    name: "Horizon-Setup.exe",
  }],
  html_url: "https://example.invalid/horizon-release",
  tag_name: `v${releaseFixtureVersion}`,
}, null, 2)}\n`, "utf8");

function writeIntegrationFixture(integrations) {
  writeFileSync(integrationStorePath, `${JSON.stringify({ integrations, updatedAt: new Date().toISOString(), version: 1 }, null, 2)}\n`, "utf8");
}

writeIntegrationFixture({
  "ai-agent": {
    lastTestResult: { message: "Legacy model refresh.", ok: true, state: "models_refreshed" },
    lastTestedAt: "2026-07-01T00:00:00.000Z",
    settings: { model: "gpt-5.4-mini", provider: "OpenAI", tokenOrKey: "legacy-openai-key" },
  },
  "google-drive": {
    lastTestResult: { message: "Google access was revoked.", ok: false, state: "needs_reauth" },
    lastTestedAt: "2026-07-13T00:00:00.000Z",
    settings: {
      accountEmail: "smoke@example.com",
      clientId: "smoke-google-client",
      oauthTokens: { accessToken: "google-access-secret", expiryDate: Date.now() + 3_600_000, refreshToken: "google-refresh-secret" },
    },
  },
  zotero: {
    lastTestResult: { message: "Legacy Zotero connection.", ok: true, state: "connected" },
    lastTestedAt: "2026-07-01T00:00:00.000Z",
    settings: { zoteroApiKey: "legacy-zotero-key", zoteroUserId: "123", zoteroUsername: "legacy-user" },
  },
});
const server = spawn(process.execPath, [path.join(here, "..", "server.cjs")], {
  // Capture requests remain offline unless they explicitly opt in. The fixture removes
  // its fake AI key before Capture tests, so the explicit-opt-in branch can be verified
  // without making a network request.
  env: {
    ...process.env,
    HORIZON_ALLOW_ORIGINLESS_MUTATIONS: "1",
    HORIZON_APP_DATA_DIR: scratchAppData,
    HORIZON_INTEGRATION_STORE_KEY: integrationStoreKey,
    HORIZON_NATIVE_APP_EXE: process.execPath,
    HORIZON_REQUIRE_CREDENTIAL_ENCRYPTION: "1",
    HORIZON_TEST_NATIVE_RELAUNCH_PLAN_PATH: nativeRelaunchPlanPath,
    HORIZON_TEST_RELEASE_FIXTURE_PATH: releaseFixturePath,
    HORIZON_VAULT_ROOT: scratchVault,
    PORT: String(PORT),
    RSB_DISABLE_AI: "0",
    RSB_DISABLE_EXTERNAL_INTEGRATIONS: "1",
    RSB_DISABLE_INTEGRATION_MIRROR: "1",
    RSB_DISABLE_RUN_LOGS: "1",
  },
  stdio: "ignore",
});

// child_process.kill() on Windows emulates POSIX signals through an internal async
// handle; under Node 24 that path can race libuv's handle-close bookkeeping and crash
// with "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" even after the test
// itself has already passed. taskkill terminates the process tree directly, bypassing
// that emulation layer entirely, so it doesn't hit the race.
function shutdown(code) {
  const cleanup = () => {
    try { rmSync(scratchAppData, { force: true, recursive: true }); } catch {}
  };
  if (server.exitCode !== null || server.signalCode !== null) {
    cleanup();
    process.exit(code);
    return;
  }
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      // Already exited or couldn't be found - fine, we're exiting either way.
    }
    cleanup();
    process.exit(code);
    return;
  }
  server.once("exit", () => {
    cleanup();
    process.exit(code);
  });
  server.kill();
}

const fail = (msg) => { console.error(`SMOKE FAIL: ${msg}`); shutdown(1); };
const ok = (msg) => console.log(`  ok - ${msg}`);

function assertEncryptedIntegrationStore(label, forbiddenSecrets) {
  const serialized = readFileSync(integrationStorePath, "utf8");
  if (!isEncryptedIntegrationStore(serialized)) fail(`${label}: integration store remained plaintext`);
  for (const secret of [...forbiddenSecrets, integrationStoreKey]) {
    if (secret && serialized.includes(secret)) fail(`${label}: raw integration store exposed a test credential`);
  }
  let decrypted;
  try {
    decrypted = decryptIntegrationStore(serialized, integrationStoreKey);
  } catch {
    fail(`${label}: encrypted integration store could not be authenticated`);
  }
  if (!decrypted?.integrations || typeof decrypted.integrations !== "object") {
    fail(`${label}: decrypted integration store was invalid`);
  }
  ok(`${label}: raw integration store is encrypted and contains no test credentials`);
  return decrypted;
}

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
if (health.app !== "rawlings-os") fail(`unexpected health payload: ${JSON.stringify(health)}`);
if (health.version !== expectedVersion) fail(`/api/health returned the wrong app version: ${JSON.stringify(health)}`);
if (!health.vaultReady || !health.vaultPath) fail(`/api/health did not identify a ready active vault: ${JSON.stringify(health)}`);
if (health.credentialEncryption !== "os_protected") fail(`/api/health did not require protected integration settings: ${JSON.stringify(health)}`);
ok(`/api/health identifies Horizon ${expectedVersion} and its ready active vault`);

const reboundStatus = await new Promise((resolve, reject) => {
  const request = httpRequest({
    headers: { host: "malicious.example" },
    hostname: "127.0.0.1",
    method: "GET",
    path: "/api/health",
    port: PORT,
  }, (response) => {
    response.resume();
    response.on("end", () => resolve(response.statusCode));
  });
  request.on("error", reject);
  request.end();
});
if (reboundStatus !== 403) fail(`unexpected Host header should be rejected with 403, got ${reboundStatus}`);

const captureFolder = path.join(scratchVault, "Inbox", "Captures");
const capturesBeforeHostileRequests = readdirSync(captureFolder).sort();
const hostileCapture = await fetch(`${BASE}/api/capture`, {
  body: JSON.stringify({ text: "This hostile capture must never be saved." }),
  headers: {
    "content-type": "text/plain",
    origin: "https://malicious.example",
  },
  method: "POST",
});
if (hostileCapture.status !== 403) {
  fail(`cross-origin capture write should be rejected with 403, got ${hostileCapture.status}`);
}
const nonJsonCapture = await fetch(`${BASE}/api/capture`, {
  body: JSON.stringify({ text: "This non-JSON capture must never be saved." }),
  headers: {
    "content-type": "text/plain",
    origin: BASE,
  },
  method: "POST",
});
if (nonJsonCapture.status !== 415) {
  fail(`non-JSON capture write should be rejected with 415, got ${nonJsonCapture.status}`);
}
const capturesAfterHostileRequests = readdirSync(captureFolder).sort();
if (JSON.stringify(capturesAfterHostileRequests) !== JSON.stringify(capturesBeforeHostileRequests)) {
  fail("rejected browser writes changed the Capture folder");
}
ok("localhost rejects DNS-rebinding hosts, hostile origins, and non-JSON writes without changing the workspace");

const updateResponse = await fetch(`${BASE}/api/update/check`);
const update = await updateResponse.json();
if (!updateResponse.ok || update.version !== health.version || !update.checkedAt || !update.checkState) {
  fail(`/api/update/check returned an incomplete status: ${JSON.stringify(update)}`);
}
if (update.updateMode !== "installer" || !String(update.downloadUrl || "").endsWith("/Horizon-Setup.exe")) {
  fail(`/api/update/check did not use the packaged installer update path: ${JSON.stringify(update)}`);
}
if (!update.updateAvailable || update.sourceVersion !== releaseFixtureVersion || update.checkState !== "update_available") {
  fail(`/api/update/check did not identify the newer installer fixture: ${JSON.stringify(update)}`);
}
if (update.fetchFailed && /up to date/i.test(update.message || "")) {
  fail("/api/update/check claimed Horizon was current after its fetch failed");
}
if (update.checkState === "current" && update.packageStale) {
  fail("/api/update/check labeled a stale packaged app current");
}
ok(`/api/update/check returned a truthful ${update.checkState} status for Horizon ${update.version}`);

const restartResponse = await fetch(`${BASE}/api/update/restart`, { method: "POST" });
const restart = await restartResponse.json();
if (!restartResponse.ok || !restart.restarting) fail(`/api/update/restart did not prepare the native relaunch: ${JSON.stringify(restart)}`);
const nativeRelaunchPlan = JSON.parse(readFileSync(nativeRelaunchPlanPath, "utf8"));
if (
  nativeRelaunchPlan.executable !== path.resolve(process.execPath)
  || nativeRelaunchPlan.helper !== "detached-powershell"
  || nativeRelaunchPlan.parentPid !== process.pid
  || JSON.stringify(nativeRelaunchPlan.args) !== JSON.stringify(["--boot"])
) {
  fail(`/api/update/restart did not preserve the installed executable and boot argument: ${JSON.stringify(nativeRelaunchPlan)}`);
}
ok("/api/update/restart targets the exact installed executable through a detached helper");

const constellationResponse = await fetch(`${BASE}/api/constellation`);
const constellationHtml = await constellationResponse.text();
if (!constellationResponse.ok || constellationResponse.headers.get("x-horizon-constellation-source") !== "bundled") {
  fail("/api/constellation did not serve the bundled workspace");
}
if (!constellationHtml.includes("Projects · Notes · Relationships")) {
  fail("/api/constellation did not return the Constellation workspace");
}
const constellationAlias = await fetch(`${BASE}/api/development-sandbox`);
if (!constellationAlias.ok) fail("legacy Constellation route did not remain compatible");
ok("/api/constellation serves the bundled workspace and preserves the legacy route");

const items = await (await fetch(`${BASE}/api/items`)).json();
const list = Array.isArray(items) ? items : items.items;
if (!Array.isArray(list)) fail("/api/items did not return an item list");
ok(`/api/items returned ${list.length} calendar item(s)`);

const integ = await (await fetch(`${BASE}/api/integrations`)).json();
if (!Array.isArray(integ.connections) || !integ.connections.length) fail("/api/integrations empty");
if (!integ.connections.every((c) => c.capability)) fail("integration missing capability field");
const obsidian = integ.connections.find((connection) => connection.id === "obsidian");
if (!obsidian || !String(obsidian.detailLabel || "").includes(health.vaultPath)) {
  fail("Obsidian integration does not match the server's active vault");
}
ok(`/api/integrations returned ${integ.connections.length} connections, all with capability`);

const legacyZotero = integ.connections.find((connection) => connection.id === "zotero");
const legacyAi = integ.connections.find((connection) => connection.id === "ai-agent");
const revokedGoogle = integ.connections.find((connection) => connection.id === "google-drive");
if (legacyZotero?.status !== "auth_pending" || legacyZotero?.statusLabel !== "Verification needed") {
  fail(`legacy Zotero state was trusted without permission proof: ${JSON.stringify(legacyZotero)}`);
}
if (legacyAi?.status !== "auth_pending" || legacyAi?.statusLabel !== "Verification needed") {
  fail(`legacy OpenAI state was trusted without current model proof: ${JSON.stringify(legacyAi)}`);
}
if (revokedGoogle?.status !== "needs_reauth" || revokedGoogle?.statusLabel !== "Reconnect required") {
  fail(`revoked Google refresh token was still presented as connected: ${JSON.stringify(revokedGoogle)}`);
}
const googleSettingsResponse = await fetch(`${BASE}/api/integrations/google-drive/settings`);
const googleSettings = await googleSettingsResponse.json();
if (
  !googleSettingsResponse.ok
  || googleSettings.settings?.oauthTokens?.refreshToken
  || googleSettings.settings?.oauthTokens?.refreshTokenSaved !== true
  || googleSettings.settings?.googleOAuthAvailable !== true
  || googleSettings.settings?.scopes !== "drive.metadata.readonly"
) {
  fail(`Google settings were not capability-aware and redacted: ${JSON.stringify(googleSettings)}`);
}
ok("legacy integration records require one fresh verification");
const migratedLegacyStore = assertEncryptedIntegrationStore("legacy migration", [
  "legacy-openai-key",
  "google-access-secret",
  "google-refresh-secret",
  "legacy-zotero-key",
]);
if (migratedLegacyStore.integrations?.zotero?.settings?.zoteroApiKey !== "legacy-zotero-key") {
  fail("legacy migration did not preserve the decrypted integration settings");
}

writeIntegrationFixture({
  "ai-agent": {
    lastTestResult: {
      message: "Capture access verified.",
      ok: true,
      state: "responses_verified",
      validationVersion: 3,
      verifiedModel: "gpt-5.4-mini",
    },
    lastTestedAt: "2026-07-13T00:00:00.000Z",
    settings: { model: "gpt-5.4-mini", provider: "OpenAI", tokenOrKey: "verified-openai-key" },
  },
  zotero: {
    lastTestResult: { message: "Read-only Zotero connection.", ok: true, state: "connected_limited" },
    lastTestedAt: "2026-07-13T00:00:00.000Z",
    settings: {
      zoteroAccess: { library: true, write: false },
      zoteroApiKey: "verified-zotero-key",
      zoteroUserId: "456",
      zoteroUsername: "verified-user",
    },
  },
});

const verifiedIntegrations = await (await fetch(`${BASE}/api/integrations`)).json();
const readOnlyZotero = verifiedIntegrations.connections.find((connection) => connection.id === "zotero");
const verifiedAi = verifiedIntegrations.connections.find((connection) => connection.id === "ai-agent");
if (readOnlyZotero?.status !== "connected_limited" || readOnlyZotero?.statusLabel !== "Read-only connection") {
  fail(`Zotero read-only permissions were not reflected honestly: ${JSON.stringify(readOnlyZotero)}`);
}
if (verifiedAi?.status !== "connected" || verifiedAi?.statusLabel !== "Capture access verified") {
  fail(`current OpenAI Responses proof was not accepted: ${JSON.stringify(verifiedAi)}`);
}
ok("Zotero read/write state and current OpenAI Responses proof drive connection status");
assertEncryptedIntegrationStore("verified fixture migration", ["verified-openai-key", "verified-zotero-key"]);

const untrustedDisconnect = await fetch(`${BASE}/api/integrations/zotero/disconnect`, { method: "POST" });
if (untrustedDisconnect.status !== 415) {
  fail(`bodyless disconnect should be rejected with 415, got ${untrustedDisconnect.status}`);
}
const trustedDisconnect = await fetch(`${BASE}/api/integrations/zotero/disconnect`, {
  body: "{}",
  headers: { "content-type": "application/json" },
  method: "POST",
});
const disconnectedZotero = await trustedDisconnect.json();
if (!trustedDisconnect.ok || disconnectedZotero.connection?.status !== "not_connected" || disconnectedZotero.connection?.statusLabel !== "Connect Zotero Desktop") {
  fail(`trusted local disconnect did not return an ordinary setup state: ${JSON.stringify(disconnectedZotero)}`);
}
ok("disconnect rejects untrusted form posts and clears only the isolated test credential");
assertEncryptedIntegrationStore("encrypted disconnect save", ["verified-openai-key", "verified-zotero-key"]);

writeIntegrationFixture({
  zotero: {
    settings: { zoteroLocal: { enabled: true, verifiedAt: "2026-07-13T00:00:00.000Z" } },
  },
});
const localZoteroIntegrations = await (await fetch(`${BASE}/api/integrations`)).json();
const localZotero = localZoteroIntegrations.connections.find((connection) => connection.id === "zotero");
if (localZotero?.status !== "connected_limited" || localZotero?.statusLabel !== "Read-only connection") {
  fail(`verified Zotero Desktop local access was not recognized: ${JSON.stringify(localZotero)}`);
}
ok("Zotero Desktop can be a keyless, read-only Research source");
assertEncryptedIntegrationStore("local Zotero fixture migration", [
  "legacy-openai-key",
  "google-access-secret",
  "google-refresh-secret",
  "legacy-zotero-key",
  "verified-openai-key",
  "verified-zotero-key",
]);

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
if (
  !papers.sources
  || typeof papers.sources.vaultCount !== "number"
  || typeof papers.sources.mergedCount !== "number"
  || typeof papers.sources.duplicateCount !== "number"
  || !Array.isArray(papers.sources.duplicateGroups)
  || !Array.isArray(papers.sources.subjects)
) {
  fail("/api/research/papers did not return merged source counts");
}
if (papers.sources.duplicateGroups.some((group) => !group.doi || !Array.isArray(group.copies) || group.copies.length < 2)) {
  fail("/api/research/papers returned an invalid exact-duplicate review group");
}
if (papers.sources.subjects.some((subject) => !subject.name || typeof subject.paperCount !== "number" || typeof subject.deletable !== "boolean")) {
  fail("/api/research/papers returned an invalid subject catalog");
}
if (!papers.enrichment || typeof papers.enrichment.attempted !== "number" || typeof papers.enrichment.unresolved !== "number") {
  fail("/api/research/papers did not return metadata enrichment status");
}
// The Research Desk always receives honest paper metadata. Missing values are explicit,
// never omitted or guessed, so the UI can offer a focused repair action.
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
if (papers.papers.some((paper) => paper.path === "Research Papers/Zotero Shelf.md")) {
  fail("/api/research/papers treated the generated Zotero Shelf as a paper");
}
const knownDois = papers.papers.map((paper) => paper.doi).filter((doi) => doi && doi !== "unknown");
if (new Set(knownDois).size !== knownDois.length) {
  fail("/api/research/papers returned duplicate DOI cards");
}
ok(`/api/research/papers returned ${papers.papers.length} paper(s) with labeled summaries and metadata status`);

// Research ideas endpoint; an empty result is valid.
const ideas = await (await fetch(`${BASE}/api/research/ideas`)).json();
if (!Array.isArray(ideas.ideas)) fail("/api/research/ideas did not return an ideas array");
if (ideas.ideas.some((idea) => typeof idea.body !== "string" || !Array.isArray(idea.connectedPaperRefs))) {
  fail("/api/research/ideas omitted sticky body or persistent paper references");
}
ok(`/api/research/ideas returned ${ideas.ideas.length} idea(s)`);

const emptyIdea = await fetch(`${BASE}/api/research/ideas`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ body: " " }),
});
if (emptyIdea.status !== 400) fail(`/api/research/ideas should reject an empty sticky with 400, got ${emptyIdea.status}`);
ok("/api/research/ideas rejects an empty sticky without writing a note");

// A temporary sticky exercises the complete persistence lifecycle. It is always deleted
// before a failure is reported, so smoke never leaves test material in the active vault.
const smokePaper = papers.papers.find((paper) => (
  (paper.doi && paper.doi !== "unknown") || paper.zoteroKey || paper.path
));
const smokePaperRef = smokePaper
  ? smokePaper.doi && smokePaper.doi !== "unknown"
    ? `doi:${smokePaper.doi.toLowerCase()}`
    : smokePaper.zoteroKey
      ? `zotero:${smokePaper.zoteroKey}`
      : `vault:${String(smokePaper.path).replaceAll("\\", "/")}`
  : "";
const smokeStickyText = `Horizon smoke sticky ${Date.now()}`;
let smokeStickyPath = "";
let smokeStickyError = "";
try {
  const createResponse = await fetch(`${BASE}/api/research/ideas`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body: smokeStickyText }),
  });
  const created = await createResponse.json();
  if (!createResponse.ok || !created.idea?.path) throw new Error("temporary sticky could not be created");
  smokeStickyPath = created.idea.path;

  const editedBody = `${smokeStickyText} edited`;
  const patchResponse = await fetch(`${BASE}/api/research/ideas`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      body: editedBody,
      connectedPaperRefs: smokePaperRef ? [smokePaperRef] : [],
      path: smokeStickyPath,
    }),
  });
  const patched = await patchResponse.json();
  if (!patchResponse.ok || patched.idea?.body !== editedBody) throw new Error("temporary sticky edit was not persisted");
  if (smokePaperRef && !patched.idea.connectedPaperRefs?.includes(smokePaperRef)) {
    throw new Error("temporary sticky paper connection was not persisted");
  }

  const refreshed = await (await fetch(`${BASE}/api/research/ideas`)).json();
  const reloadedSticky = refreshed.ideas?.find((idea) => idea.path === smokeStickyPath);
  if (!reloadedSticky || reloadedSticky.body !== editedBody) throw new Error("temporary sticky did not survive an API reload");
  if (smokePaperRef && !reloadedSticky.connectedPaperRefs?.includes(smokePaperRef)) {
    throw new Error("temporary sticky paper connection did not survive an API reload");
  }
} catch (error) {
  smokeStickyError = error instanceof Error ? error.message : String(error);
} finally {
  if (smokeStickyPath) {
    try {
      const deleteResponse = await fetch(`${BASE}/api/research/ideas`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: smokeStickyPath }),
      });
      const deleted = await deleteResponse.json();
      if (!deleteResponse.ok || !deleted.ok) smokeStickyError ||= "temporary sticky could not be deleted";
    } catch (error) {
      smokeStickyError ||= error instanceof Error ? error.message : String(error);
    }
  }
}
if (smokeStickyError) fail(`/api/research/ideas persistence lifecycle failed: ${smokeStickyError}`);
ok(`/api/research/ideas persists edits${smokePaperRef ? " and paper connections" : ""}, reloads them, and deletes cleanly`);

const projects = await (await fetch(`${BASE}/api/projects`)).json();
if (!Array.isArray(projects.projects)) fail("/api/projects did not return a projects array");
if (!projects.projects.every((p) => p.name && p.location !== undefined && p.status)) {
  fail("project registry entry missing name/location/status");
}
if (!projects.projects.every((p) => typeof p.captures === "number")) {
  fail("project registry entry missing captures count");
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

// The open-workspace route must reject unknown ids cleanly without side effects.
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

// Local heuristics produce suggestions without AI unless the request explicitly opts in.
async function triage(text, allowAi) {
  const payload = { text };
  if (typeof allowAi === "boolean") payload.allowAi = allowAi;
  const r = await fetch(`${BASE}/api/capture/triage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.json();
}
const cal = await triage("Dentist tomorrow 3pm");
if (!cal.ok || !cal.triage?.actions?.some((a) => a.type === "create_calendar_item")) {
  fail(`heuristic triage did not suggest a calendar item for a dated capture: ${JSON.stringify(cal.triage?.actions)}`);
}
if (cal.aiState !== "disabled") fail(`omitted AI consent should stay local, got ${cal.aiState}`);
const explicitLocal = await triage("Keep this local", false);
if (explicitLocal.aiState !== "disabled") fail(`false AI consent should stay local, got ${explicitLocal.aiState}`);
const explicitOptIn = await triage("Use OpenAI if configured", true);
if (explicitOptIn.aiState !== "api_key_required") {
  fail(`explicit AI consent should enter the AI path and report the missing test key, got ${explicitOptIn.aiState}`);
}
ok("Capture uses OpenAI only after explicit opt-in; omitted and false consent stay local");
ok(`/api/capture/triage suggested create_calendar_item with no AI (source ${cal.triage.actions.find((a) => a.type === "create_calendar_item").source})`);

const doi = await triage("https://doi.org/10.1000/xyz interesting study");
if (!doi.ok || !doi.triage?.actions?.some((a) => a.type === "save_research" || a.type === "save_note")) {
  fail(`heuristic triage did not suggest research/note for a link capture: ${JSON.stringify(doi.triage?.actions)}`);
}
ok(`/api/capture/triage suggested ${doi.triage.actions[0].type} for a DOI with no AI`);

console.log("SMOKE PASS");
shutdown(0);
