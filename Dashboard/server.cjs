const assert = require("assert");
const childProcess = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

// Single source of truth for capture action definitions.
const {
  CAPTURE_TRIAGE_ACTION_TYPES,
  captureActionById,
  captureActionPlan,
  captureActionMetadata,
  captureTriageHints,
} = require("./server/captureActions.cjs");
// Deterministic local pre-triage.
const { applyCourseworkDeadlineDefault, heuristicActions } = require("./server/captureHeuristics.cjs");
const { currentLocalIsoDate } = require("./server/currentDate.cjs");
const {
  defaultHorizonAppDataDir,
  pathExistsDirectory,
  vaultConnectionPath,
  vaultStructureStatus,
} = require("./server/vaultConnection.cjs");
const {
  decryptIntegrationStore,
  encryptIntegrationStore,
  isEncryptedIntegrationStore,
  parseMasterKey,
} = require("./server/integrationStoreCrypto.cjs");

const ROOT = process.env.HORIZON_VAULT_ROOT || path.resolve(__dirname, "..");
const HORIZON_APP_DATA_DIR = defaultHorizonAppDataDir();
const HORIZON_VAULT_CONNECTION_PATH = process.env.HORIZON_VAULT_CONNECTION_PATH || vaultConnectionPath(HORIZON_APP_DATA_DIR);
const APP_SOURCE_ROOT = path.resolve(process.env.HORIZON_APP_SOURCE_ROOT || ROOT);
const ITEMS_DIR = path.join(ROOT, "Calendar", "Items");
const NOW_PATH = path.join(ROOT, "Calendar", "Now.md");
const DIST_DIR = path.join(__dirname, "dist");
const LEGACY_PUBLIC_DIR = path.join(__dirname, "public");
const APP_VERSION = (() => {
  if (process.env.HORIZON_PACKAGED_VERSION) return String(process.env.HORIZON_PACKAGED_VERSION);
  try {
    return String(JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8")).version || "unknown");
  } catch {
    return "unknown";
  }
})();
const CONSTELLATION_BUNDLED_PATHS = [
  path.join(DIST_DIR, "constellation.html"),
  path.join(LEGACY_PUBLIC_DIR, "constellation.html"),
];
const CAPTURES_DIR = path.join(ROOT, "Inbox", "Captures");
const CAPTURE_QUEUE_DIR = path.join(ROOT, "Runs", "CaptureQueue");
const CAPTURE_QUEUE_INDEX = path.join(CAPTURE_QUEUE_DIR, "index.md");
const INCOMING_CAPTURE_DIR = path.join(ROOT, "Inbox", "To Triage");
const INCOMING_CAPTURE_INDEX = path.join(INCOMING_CAPTURE_DIR, "index.md");
const HORIZON_LOCAL_DIR = path.join(ROOT, "00_System", "local", "Horizon");
const HORIZON_LOCAL_STATE_PATH = path.join(HORIZON_LOCAL_DIR, "runtime-state.json");
const HORIZON_LOCAL_INDEX_PATH = path.join(HORIZON_LOCAL_DIR, "index.md");
const DEVELOPMENT_SANDBOX_DIR = path.join(HORIZON_LOCAL_DIR, "Development Sandbox");
const DEVELOPMENT_SANDBOX_INDEX_PATH = path.join(DEVELOPMENT_SANDBOX_DIR, "index.html");
const HORIZON_REDACTED_INTEGRATIONS_PATH = path.join(HORIZON_LOCAL_DIR, "integration-settings.redacted.json");
const CAPTURE_ACTION_HISTORY_PATH = path.join(HORIZON_LOCAL_DIR, "capture-action-history.json");
const RESEARCH_LIBRARY_CACHE_PATH = path.join(HORIZON_LOCAL_DIR, "research-library-cache.json");
const RESEARCH_METADATA_CACHE_PATH = path.join(HORIZON_LOCAL_DIR, "research-metadata-cache.json");
const RESEARCH_PAPER_STATE_PATH = path.join(HORIZON_LOCAL_DIR, "research-paper-state.json");
const RESEARCH_INDEX_PATH = path.join(ROOT, "Research Papers", "index.md");
const RESEARCH_SUBJECTS_START = "<!-- horizon:custom-subjects:start -->";
const RESEARCH_SUBJECTS_END = "<!-- horizon:custom-subjects:end -->";
const GOOGLE_OAUTH_CLIENT_PATH = path.join(HORIZON_LOCAL_DIR, "credentials", "google-oauth-client.json");
const STARTUP_DIR = path.join(
  process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
  "Microsoft",
  "Windows",
  "Start Menu",
  "Programs",
  "Startup",
);
const STARTUP_LAUNCH_SHORTCUT = path.join(STARTUP_DIR, "Horizon.lnk");
const LEGACY_STARTUP_LAUNCH_SHORTCUTS = [
  path.join(STARTUP_DIR, "HorizonOS.lnk"),
  path.join(STARTUP_DIR, "Horizon OS.lnk"),
  path.join(STARTUP_DIR, "HorizonOS Server.lnk"),
  path.join(STARTUP_DIR, "Horizon OS Server.lnk"),
];
const HORIZON_HIDDEN_RUNNER = path.join(__dirname, "run-hidden.vbs");
const HORIZON_ICON = path.join(__dirname, "public", "horizon-os-icon.ico");
const HORIZON_NATIVE_APP_EXE = process.env.HORIZON_NATIVE_APP_EXE ||
  path.join(__dirname, "native-dist", "win-unpacked", "Horizon.exe");
// The source checkout (with node_modules + the build/packaging toolchain) always lives at
// <vault>/Dashboard, even when this server is the PACKAGED app running from native-dist —
// which has no toolchain of its own. Self-updates must build and repackage there.
const REPO_DASHBOARD_DIR = path.resolve(process.env.HORIZON_SOURCE_DASHBOARD || path.join(APP_SOURCE_ROOT, "Dashboard"));
const REPO_HIDDEN_RUNNER = path.join(REPO_DASHBOARD_DIR, "run-hidden.vbs");
const REPO_PACK_SCRIPT = path.join(REPO_DASHBOARD_DIR, "scripts", "pack-native.ps1");
const PACKAGED_BUILD_INFO_PATH = path.resolve(
  process.env.HORIZON_PACKAGED_BUILD_INFO_PATH || path.join(DIST_DIR, "build-info.json"),
);
const IS_PACKAGED_RUNTIME = Boolean(process.env.HORIZON_NATIVE_APP_EXE);
const HORIZON_INSTALLER_ASSET = "Horizon-Setup.exe";
const HORIZON_INSTALLER_DOWNLOAD_URL = "https://github.com/BoomerRawlings/horizon-os/releases/latest/download/Horizon-Setup.exe";
const HORIZON_LATEST_RELEASE_API = "https://api.github.com/repos/BoomerRawlings/horizon-os/releases/latest";
const TEST_RELEASE_FIXTURE_PATH = String(process.env.HORIZON_TEST_RELEASE_FIXTURE_PATH || "");
const INTEGRATION_SETTINGS_PATH = path.join(HORIZON_APP_DATA_DIR, "integration-settings.json");
const REQUIRE_CREDENTIAL_ENCRYPTION = process.env.HORIZON_REQUIRE_CREDENTIAL_ENCRYPTION === "1";
const INTEGRATION_STORE_MASTER_KEY = String(process.env.HORIZON_INTEGRATION_STORE_KEY || "");
const TEST_NATIVE_RELAUNCH_PLAN_PATH = String(process.env.HORIZON_TEST_NATIVE_RELAUNCH_PLAN_PATH || "");
delete process.env.HORIZON_INTEGRATION_STORE_KEY;
let INTEGRATION_STORE_ENCRYPTION_ACTIVE = false;
if (INTEGRATION_STORE_MASTER_KEY) {
  try {
    parseMasterKey(INTEGRATION_STORE_MASTER_KEY);
    INTEGRATION_STORE_ENCRYPTION_ACTIVE = true;
  } catch {
    throw new Error("Horizon credential encryption could not start because its protected key is invalid.");
  }
}
if (REQUIRE_CREDENTIAL_ENCRYPTION && !INTEGRATION_STORE_ENCRYPTION_ACTIVE) {
  throw new Error("Horizon credential encryption is required, but no protected key was provided.");
}
const INTEGRATION_RUN_LOG_DIR = path.join(ROOT, "Runs", "IntegrationTests");
const PORT = Number(process.env.PORT || 3873);
const HOST = "127.0.0.1";
const TRUSTED_APP_HOST = `${HOST}:${PORT}`;
const TRUSTED_APP_ORIGIN = `http://${HOST}:${PORT}`;
const ALLOW_ORIGINLESS_MUTATIONS = process.env.HORIZON_ALLOW_ORIGINLESS_MUTATIONS === "1";
const GOOGLE_OAUTH_REDIRECT_URI = `http://${HOST}:${PORT}`;
const APP_TIME_ZONE = process.env.HORIZON_TIME_ZONE || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
function currentToday() {
  return currentLocalIsoDate({
    override: process.env.RSB_TODAY,
    timeZone: APP_TIME_ZONE,
  });
}
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";
const POWERSHELL = process.env.ComSpec ? "powershell.exe" : "pwsh";
const WSCRIPT_EXE = process.env.WINDIR
  ? path.join(process.env.WINDIR, "System32", "wscript.exe")
  : "wscript.exe";

const FIELD_ORDER = [
  "date",
  "time_start",
  "time_end",
  "importance",
  "category",
  "name",
  "action_needed",
  "status",
];

const RESEARCH_NOTES_PATH = process.env.HORIZON_RESEARCH_NOTES_PATH || path.join(ROOT, "Research Papers");
const DEFAULT_AI_AGENT_MODEL = "gpt-5.4-mini";
const AI_AGENT_VALIDATION_VERSION = 3;
const DEFAULT_AI_AGENT_MODELS = [
  { id: "gpt-5.4-mini", label: "GPT-5.4 mini", source: "recommended" },
  { id: "gpt-5.4", label: "GPT-5.4", source: "default" },
  { id: "gpt-5.5", label: "GPT-5.5", source: "default" },
  { id: "gpt-5-mini", label: "GPT-5 mini", source: "default" },
  { id: "gpt-5", label: "GPT-5", source: "default" },
];

function aiModelLabel(id) {
  const value = String(id || "").trim();
  if (!value) return "Unknown model";
  return value.replace(/^gpt-([^-]+)-?/i, "GPT_$1 ").trim().replace(/-/g, " ").replace(/^GPT_/, "GPT-");
}

function isLikelyOpenAiTextModel(id) {
  const value = String(id || "").toLowerCase();
  if (!value) return false;
  if (/(audio|dall|embedding|image|moderation|realtime|sora|speech|tts|transcrib|video|vision|whisper)/.test(value)) return false;
  return /^(gpt-|o\d|chatgpt)/.test(value);
}

function mergeAiModelOptions(apiModels, currentModel, options = {}) {
  const includeDefaults = options.includeDefaults !== false;
  const includeSelected = options.includeSelected !== false;
  const byId = new Map();
  if (includeDefaults) {
    for (const model of DEFAULT_AI_AGENT_MODELS) {
      byId.set(model.id, { ...model });
    }
  }
  for (const model of apiModels || []) {
    const id = String(model.id || "").trim();
    if (!id || !isLikelyOpenAiTextModel(id)) continue;
    byId.set(id, {
      created: typeof model.created === "number" ? model.created : undefined,
      id,
      label: aiModelLabel(id),
      owned_by: model.owned_by ? String(model.owned_by) : undefined,
      source: "api",
    });
  }
  const selected = String(currentModel || DEFAULT_AI_AGENT_MODEL).trim() || DEFAULT_AI_AGENT_MODEL;
  if (includeSelected && !byId.has(selected)) {
    byId.set(selected, { id: selected, label: aiModelLabel(selected), source: "selected" });
  }
  const preferred = DEFAULT_AI_AGENT_MODELS.map((model) => model.id);
  return [...byId.values()].sort((a, b) => {
    const aPreferred = preferred.indexOf(a.id);
    const bPreferred = preferred.indexOf(b.id);
    if (aPreferred !== -1 || bPreferred !== -1) {
      if (aPreferred === -1) return 1;
      if (bPreferred === -1) return -1;
      return aPreferred - bPreferred;
    }
    return a.id.localeCompare(b.id);
  });
}

// `capability` is the integration's real ceiling today, used by the UI to derive the
// honest four-state display (Connected / Local launcher / Needs setup / Planned):
//   "integration" = real data integration exists when configured
//   "launcher"    = only launches local apps / web pages; never shows as Connected
//   "planned"     = reserved; no real behavior yet
// Keep this the single source of truth — the frontend derives from /api/integrations.
const INTEGRATION_DEFINITIONS = {
  obsidian: {
    actionLabel: "Choose workspace",
    capability: "integration",
    category: "notes",
    defaultSettings: { vaultPath: ROOT },
    detailLabel: "Choose a Horizon workspace or Obsidian vault",
    id: "obsidian",
    label: "Obsidian",
    permissionSummary: "Reads and writes the selected local Markdown workspace after you validate it.",
    status: "vault_missing",
    statusLabel: "Workspace not selected",
    type: "local_folder",
  },
  codex: {
    actionLabel: "Open Codex",
    capability: "launcher",
    category: "developer",
    defaultSettings: { workspacePath: ROOT },
    detailLabel: "Opens Codex; sign in securely inside Codex",
    id: "codex",
    label: "Codex",
    permissionSummary: "Passes no password, session, or API key to Codex.",
    status: "connected_limited",
    statusLabel: "Launcher ready",
    type: "local_app",
  },
  microsoft: {
    actionLabel: "Open apps",
    capability: "launcher",
    category: "files",
    defaultSettings: {},
    detailLabel: "Opens Microsoft apps or their official websites",
    id: "microsoft",
    label: "Microsoft",
    permissionSummary: "Sign in inside Microsoft apps or websites; Horizon never receives your password.",
    status: "connected_limited",
    statusLabel: "Launcher ready",
    type: "local_app",
  },
  "google-drive": {
    actionLabel: "Connect",
    capability: "integration",
    category: "files",
    defaultSettings: { accountEmail: "", clientId: "", scopes: "drive.metadata.readonly" },
    detailLabel: "Google sign-in is not available in this copy",
    id: "google-drive",
    label: "Google Drive",
    permissionSummary: "Uses Google OAuth and read-only Drive metadata access when publisher sign-in is available.",
    status: "permission_missing",
    statusLabel: "Sign-in unavailable",
    type: "oauth",
  },
  research: {
    actionLabel: "Configure",
    capability: "integration",
    category: "research",
    defaultSettings: { sourcePath: path.join(ROOT, "Research Papers") },
    detailLabel: "Add research sources in Settings",
    id: "research",
    label: "Research",
    permissionSummary: "Connects folders and research tools into a local-first research library.",
    status: "not_connected",
    statusLabel: "No sources connected",
    type: "compound",
  },
  zotero: {
    actionLabel: "Connect",
    capability: "integration",
    category: "research",
    defaultSettings: { zoteroApiKey: "", zoteroUserId: "", zoteroUsername: "", zoteroLocal: { enabled: false, verifiedAt: null } },
    detailLabel: "Connect the Zotero desktop app, or add an optional cloud key",
    id: "zotero",
    label: "Zotero",
    permissionSummary: "Reads the local Zotero desktop library without a key. An optional cloud key enables sync when Zotero is closed and approved writes.",
    status: "api_key_required",
    statusLabel: "Desktop connection available",
    type: "compound",
  },
  "ai-agent": {
    actionLabel: "Connect",
    capability: "integration",
    category: "ai",
    defaultSettings: { model: DEFAULT_AI_AGENT_MODEL, provider: "OpenAI", tokenOrKey: "" },
    detailLabel: "OpenAI API key not connected",
    id: "ai-agent",
    label: "AI Agent",
    permissionSummary: "Uses your own OpenAI API account for optional Capture triage and workflow assistance.",
    status: "api_key_required",
    statusLabel: "API key required",
    type: "api_key",
  },
};

const googleOAuthSessions = new Map();

function localAppCandidates(...segments) {
  const candidates = [];
  if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, ...segments));
  candidates.push(path.join(os.homedir(), "AppData", "Local", ...segments));
  return candidates;
}

const LAUNCH_ACTIONS = {
  "obsidian.open": {
    id: "obsidian.open",
    label: "Obsidian",
    kind: "uri",
    target: "obsidian://open",
  },
  "codex.open": {
    id: "codex.open",
    label: "Codex",
    kind: "local_app",
    executable: "Codex.exe",
    candidates: [
      ...localAppCandidates("Programs", "Codex", "Codex.exe"),
      ...localAppCandidates("Programs", "codex", "Codex.exe"),
    ],
  },
  "microsoft.word": {
    id: "microsoft.word",
    label: "Word",
    kind: "local_app",
    executable: "WINWORD.EXE",
    fallbackUrl: "https://www.microsoft365.com/launch/word",
  },
  "microsoft.excel": {
    id: "microsoft.excel",
    label: "Excel",
    kind: "local_app",
    executable: "EXCEL.EXE",
    fallbackUrl: "https://www.microsoft365.com/launch/excel",
  },
  "microsoft.powerpoint": {
    id: "microsoft.powerpoint",
    label: "PowerPoint",
    kind: "local_app",
    executable: "POWERPNT.EXE",
    fallbackUrl: "https://www.microsoft365.com/launch/powerpoint",
  },
  "microsoft.outlook": {
    id: "microsoft.outlook",
    label: "Outlook",
    kind: "local_app",
    executable: "OUTLOOK.EXE",
    fallbackUrl: "https://outlook.office.com",
  },
  "microsoft.onenote": {
    id: "microsoft.onenote",
    label: "OneNote",
    kind: "local_app",
    executable: "ONENOTE.EXE",
    fallbackUrl: "https://www.onenote.com",
  },
  "microsoft.onedrive": {
    id: "microsoft.onedrive",
    label: "OneDrive",
    kind: "one_drive",
    executable: "OneDrive.exe",
    fallbackUrl: "https://onedrive.live.com",
  },
  "google.drive": { id: "google.drive", label: "Google Drive", kind: "web_url", target: "https://drive.google.com" },
  "google.docs": { id: "google.docs", label: "Google Docs", kind: "web_url", target: "https://docs.google.com" },
  "google.sheets": { id: "google.sheets", label: "Google Sheets", kind: "web_url", target: "https://sheets.google.com" },
  "google.slides": { id: "google.slides", label: "Google Slides", kind: "web_url", target: "https://slides.google.com" },
  "google.forms": { id: "google.forms", label: "Google Forms", kind: "web_url", target: "https://forms.google.com" },
  "google.calendar": { id: "google.calendar", label: "Google Calendar", kind: "web_url", target: "https://calendar.google.com" },
  "google.gmail": { id: "google.gmail", label: "Gmail", kind: "web_url", target: "https://mail.google.com" },
  "research.worldcat": {
    id: "research.worldcat",
    label: "WorldCat",
    kind: "web_url",
    target: "https://search.worldcat.org",
  },
  "research.google_scholar": {
    id: "research.google_scholar",
    label: "Google Scholar",
    kind: "web_url",
    target: "https://scholar.google.com/scholar",
    // "Start researching" can prefill the search with a research idea's topic.
    searchParam: "q",
  },
  "research.notes": {
    id: "research.notes",
    label: "Research Notes",
    kind: "local_folder",
    target: RESEARCH_NOTES_PATH,
  },
  "research.saved_papers": {
    id: "research.saved_papers",
    label: "Saved Papers",
    kind: "internal_route",
    route: "/research/papers",
  },
  "research.ideas": {
    id: "research.ideas",
    label: "Research Ideas",
    kind: "internal_route",
    route: "/research/ideas",
  },
  "research.saved_pdfs": {
    id: "research.saved_pdfs",
    label: "Saved PDFs",
    kind: "disabled_placeholder",
    message: "Saved PDFs is planned but not connected yet. This will eventually run through your Obsidian-backed research database.",
  },
  "research.packets": {
    id: "research.packets",
    label: "Research Packets",
    kind: "disabled_placeholder",
    message: "Research Packets is planned but not connected yet. This will eventually run through your Obsidian-backed research database.",
  },
};

function execFile(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    childProcess.execFile(
      command,
      args,
      {
        cwd: options.cwd || ROOT,
        maxBuffer: 2_000_000,
        timeout: options.timeout || 30_000,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
          return;
        }
        resolve(String(stdout || "").trim());
      },
    );
  });
}

function git(args, options = {}) {
  return execFile("git", args, { ...options, cwd: APP_SOURCE_ROOT });
}

function isSafeWebUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function isTrustedUri(value) {
  return /^obsidian:\/\/open(?:$|[?#])/.test(String(value || ""));
}

async function startProcess(target) {
  if (process.platform === "win32") {
    await execFile(
      POWERSHELL,
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `Start-Process -FilePath ${shellQuote(target)}`],
      { cwd: ROOT, timeout: 15_000 },
    );
    return;
  }
  if (process.platform === "darwin") {
    await execFile("open", [target], { cwd: ROOT, timeout: 15_000 });
    return;
  }
  await execFile("xdg-open", [target], { cwd: ROOT, timeout: 15_000 });
}

const FOCUS_CODEX_SCRIPT = String.raw`
$ErrorActionPreference = "Stop"
$processes = Get-CimInstance Win32_Process -Filter "Name = 'Codex.exe'" |
  Where-Object {
    $_.CommandLine -and
    $_.CommandLine -notmatch "--type=" -and
    $_.CommandLine -notmatch "app-server" -and
    $_.ExecutablePath -and
    $_.ExecutablePath -notmatch "\\resources\\" -and
    $_.ExecutablePath -notmatch "\\bin\\"
  } |
  Sort-Object CreationDate

if (-not $processes) {
  exit 2
}

$targetProcessId = [int]$processes[0].ProcessId
$targetProcess = Get-Process -Id $targetProcessId -ErrorAction Stop

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class HorizonWindowFocus {
  [DllImport("user32.dll")]
  public static extern bool IsIconic(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool BringWindowToTop(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  public static bool Focus(IntPtr hWnd) {
    if (hWnd == IntPtr.Zero) return false;
    if (IsIconic(hWnd)) {
      ShowWindowAsync(hWnd, 9);
    } else {
      ShowWindowAsync(hWnd, 5);
    }
    BringWindowToTop(hWnd);
    return SetForegroundWindow(hWnd);
  }
}
"@

$focused = [HorizonWindowFocus]::Focus($targetProcess.MainWindowHandle)
if (-not $focused) {
  $shell = New-Object -ComObject WScript.Shell
  Start-Sleep -Milliseconds 80
  $focused = $shell.AppActivate($targetProcessId)
}

if ($focused) {
  "focused"
  exit 0
}

"found"
exit 3
`;

const RESOLVE_CODEX_APPX_SCRIPT = String.raw`
$package = Get-AppxPackage -Name OpenAI.Codex -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $package) {
  exit 2
}

$candidate = Join-Path $package.InstallLocation "app\Codex.exe"
if (Test-Path -LiteralPath $candidate) {
  [Console]::Out.Write($candidate)
  exit 0
}

exit 3
`;

async function focusCodexIfRunning() {
  if (process.platform !== "win32") return false;

  try {
    await execFile(
      POWERSHELL,
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", FOCUS_CODEX_SCRIPT],
      { cwd: ROOT, timeout: 10_000 },
    );
    return true;
  } catch (error) {
    return error.code === 3;
  }
}

async function resolveCodexExecutable(action) {
  if (process.platform === "win32") {
    try {
      const executable = await execFile(
        POWERSHELL,
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", RESOLVE_CODEX_APPX_SCRIPT],
        { cwd: ROOT, timeout: 10_000 },
      );
      if (executable && fs.existsSync(executable)) return executable;
    } catch {
      // Fall back to ordinary executable discovery below.
    }
  }

  return resolveExecutable(action);
}

const GOOGLE_SCOPE_ALIASES = {
  calendar: "https://www.googleapis.com/auth/calendar.events",
  "calendar.events": "https://www.googleapis.com/auth/calendar.events",
  drive: "https://www.googleapis.com/auth/drive.file",
  "drive.file": "https://www.googleapis.com/auth/drive.file",
  "drive.metadata": "https://www.googleapis.com/auth/drive.metadata.readonly",
  "drive.metadata.readonly": "https://www.googleapis.com/auth/drive.metadata.readonly",
  "drive.readonly": "https://www.googleapis.com/auth/drive.readonly",
  "drive.full": "https://www.googleapis.com/auth/drive",
};

function normalizeGoogleScopes(value) {
  const rawScopes = String(value || "https://www.googleapis.com/auth/drive.metadata.readonly")
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
  const scopes = rawScopes.map((scope) => GOOGLE_SCOPE_ALIASES[scope] || scope);
  return Array.from(new Set(scopes.length ? scopes : ["https://www.googleapis.com/auth/drive.metadata.readonly"]));
}

function ensureGoogleDriveBrowseScopes(scopes) {
  const normalized = Array.from(new Set(scopes));
  const canBrowse = normalized.some((scope) =>
    scope === "https://www.googleapis.com/auth/drive" ||
    scope === "https://www.googleapis.com/auth/drive.readonly" ||
    scope === "https://www.googleapis.com/auth/drive.metadata.readonly",
  );
  if (!canBrowse) normalized.push("https://www.googleapis.com/auth/drive.metadata.readonly");
  return normalized;
}

function base64Url(buffer) {
  return Buffer.from(buffer).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomOAuthValue(bytes = 32) {
  return base64Url(crypto.randomBytes(bytes));
}

function pkceChallenge(verifier) {
  return base64Url(crypto.createHash("sha256").update(verifier).digest());
}

function readGoogleOAuthClient(settings = {}) {
  const candidates = [settings.credentialPath, GOOGLE_OAUTH_CLIENT_PATH].filter(Boolean);
  let lastError = "";

  for (const candidate of candidates) {
    try {
      const credentialPath = path.resolve(String(candidate));
      if (!fs.existsSync(credentialPath)) continue;
      const json = JSON.parse(fs.readFileSync(credentialPath, "utf8"));
      const client = json.installed || json.web || json;
      const clientId = String(client.client_id || settings.clientId || "").trim();
      if (!clientId) {
        lastError = "Credential JSON did not include a client_id.";
        continue;
      }
      return {
        authUri: "https://accounts.google.com/o/oauth2/v2/auth",
        clientId,
        clientSecret: String(client.client_secret || ""),
        credentialPath,
        tokenUri: String(client.token_uri || "https://oauth2.googleapis.com/token"),
      };
    } catch (error) {
      lastError = error.message;
    }
  }

  const fallbackClientId = String(settings.clientId || "").trim();
  if (fallbackClientId) {
    return {
      authUri: "https://accounts.google.com/o/oauth2/v2/auth",
      clientId: fallbackClientId,
      clientSecret: "",
      credentialPath: "",
      tokenUri: "https://oauth2.googleapis.com/token",
    };
  }

  throw new Error(lastError || `Google OAuth credential JSON was not found at ${GOOGLE_OAUTH_CLIENT_PATH}.`);
}

async function whereExecutable(executable) {
  try {
    const output = await execFile("where.exe", [executable], { cwd: ROOT, timeout: 10_000 });
    const match = output.split(/\r?\n/).find((line) => line.trim() && fs.existsSync(line.trim()));
    return match ? match.trim() : null;
  } catch {
    return null;
  }
}

async function registryAppPath(executable) {
  const keys = [
    `HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${executable}`,
    `HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${executable}`,
    `HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${executable}`,
  ];

  for (const key of keys) {
    try {
      const output = await execFile("reg.exe", ["query", key, "/ve"], { cwd: ROOT, timeout: 10_000 });
      const match = output.match(/REG_SZ\s+(.+)\s*$/m);
      if (match && fs.existsSync(match[1].trim())) return match[1].trim();
    } catch {
      // Missing registry keys are normal on machines without that app.
    }
  }

  return null;
}

function officeCandidates(executable) {
  const roots = [
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
  ].filter(Boolean);
  const versions = ["Office16", "Office15", "Office14"];
  const candidates = [];

  for (const root of roots) {
    candidates.push(path.join(root, "Microsoft Office", "root", "Office16", executable));
    for (const version of versions) {
      candidates.push(path.join(root, "Microsoft Office", version, executable));
    }
  }

  return candidates;
}

async function resolveExecutable(action) {
  const candidates = [...(action.candidates || []), ...officeCandidates(action.executable || "")];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }

  if (action.executable) {
    const fromRegistry = await registryAppPath(action.executable);
    if (fromRegistry) return fromRegistry;

    const fromPath = await whereExecutable(action.executable);
    if (fromPath) return fromPath;
  }

  return null;
}

async function launchLocalApp(action) {
  const executable = await resolveExecutable(action);
  if (!executable) {
    if (action.fallbackUrl && isSafeWebUrl(action.fallbackUrl)) {
      await startProcess(action.fallbackUrl);
      return {
        ok: true,
        state: "opened",
        message: `${action.label} is not installed, so Horizon opened the official web version instead.`,
      };
    }
    return {
      ok: false,
      state: "missing_app",
      message: `${action.label} was not found on this PC.`,
      fallbackUrl: action.fallbackUrl,
    };
  }

  await startProcess(executable);
  return { ok: true, state: "launching", message: `Launching ${action.label}...` };
}

async function launchCodex(action) {
  if (await focusCodexIfRunning()) {
    return { ok: true, state: "focused", message: "Codex is already running. Focusing..." };
  }

  const executable = await resolveCodexExecutable(action);
  if (!executable) {
    return {
      ok: false,
      state: "missing_app",
      message: "Codex was not found on this PC.",
    };
  }

  await startProcess(executable);
  return { ok: true, state: "launching", message: "Launching Codex..." };
}

async function launchOneDrive(action) {
  const folder = process.env.OneDrive || path.join(os.homedir(), "OneDrive");
  if (fs.existsSync(folder)) {
    await startProcess(folder);
    return { ok: true, state: "launching", message: "Opening OneDrive folder..." };
  }
  return launchLocalApp(action);
}

async function launchAction(actionId, options = {}) {
  const action = LAUNCH_ACTIONS[actionId];
  if (!action) {
    return { ok: false, state: "error", message: "Unknown launcher action." };
  }

  if (action.kind === "disabled_placeholder") {
    return { ok: false, state: "disabled_placeholder", message: action.message };
  }

  if (action.kind === "internal_route") {
    return { ok: true, state: "internal_route", message: `Opening ${action.label}...`, route: action.route };
  }

  if (action.kind === "web_url") {
    // A web_url action with searchParam can be opened prefilled with a query
    // (e.g. Google Scholar for a research idea's topic). Built from the trusted base URL.
    let target = action.target;
    const query = String(options.query || "").trim();
    if (query && action.searchParam) {
      const built = new URL(action.target);
      built.searchParams.set(action.searchParam, query);
      target = built.toString();
    }
    if (!isSafeWebUrl(target)) {
      return { ok: false, state: "error", message: `Blocked unsafe URL for ${action.label}.` };
    }
    await startProcess(target);
    return { ok: true, state: "launching", message: `Opening ${action.label}...` };
  }

  if (action.kind === "uri") {
    if (!isTrustedUri(action.target)) {
      return { ok: false, state: "error", message: `Blocked untrusted URI for ${action.label}.` };
    }
    await startProcess(action.target);
    return { ok: true, state: "launching", message: `Launching ${action.label}...` };
  }

  if (action.kind === "local_folder") {
    if (!fs.existsSync(action.target)) {
      return {
        ok: false,
        state: "missing_path",
        message: `${action.label} folder not found: ${action.target}`,
      };
    }
    await startProcess(action.target);
    return { ok: true, state: "launching", message: `Opening ${action.label}...` };
  }

  if (action.kind === "one_drive") {
    return launchOneDrive(action);
  }

  if (action.kind === "local_app") {
    if (action.id === "codex.open") {
      return launchCodex(action);
    }
    return launchLocalApp(action);
  }

  return { ok: false, state: "error", message: `Could not open ${action.label}.` };
}

async function trackedBranch() {
  try {
    return await git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  } catch {
    const branch = await git(["rev-parse", "--abbrev-ref", "HEAD"]);
    return `origin/${branch}`;
  }
}

function statusPathFromPorcelain(line) {
  const body = String(line || "").trim().slice(3).trim();
  if (!body) return "";
  return body.split(" -> ").pop().replace(/\\/g, "/");
}

function isAppUpdatePath(filePath) {
  return filePath.startsWith("Dashboard/");
}

function packageVersionAt(filePath) {
  try {
    return String(JSON.parse(fs.readFileSync(filePath, "utf8")).version || "unknown");
  } catch {
    return "unknown";
  }
}

function packagedBuildInfo() {
  try {
    const value = JSON.parse(fs.readFileSync(PACKAGED_BUILD_INFO_PATH, "utf8"));
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

function parseReleaseVersion(value) {
  const match = String(value || "").trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/i);
  return match ? match.slice(1).map((part) => Number(part)) : null;
}

function compareReleaseVersions(left, right) {
  const leftParts = parseReleaseVersion(left);
  const rightParts = parseReleaseVersion(right);
  if (!leftParts || !rightParts) throw new Error("Horizon received an invalid release version.");
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] > rightParts[index] ? 1 : -1;
  }
  return 0;
}

let latestReleaseCache = null;

async function latestReleasePayload({ fetchRemote }) {
  if (TEST_RELEASE_FIXTURE_PATH) {
    return JSON.parse(fs.readFileSync(TEST_RELEASE_FIXTURE_PATH, "utf8"));
  }
  if (!fetchRemote && latestReleaseCache) return latestReleaseCache;
  if (!fetchRemote) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(HORIZON_LATEST_RELEASE_API, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": `HorizonOS/${APP_VERSION} (+https://github.com/BoomerRawlings/horizon-os)`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}.`);
    latestReleaseCache = await response.json();
    return latestReleaseCache;
  } finally {
    clearTimeout(timeout);
  }
}

async function packagedReleaseSnapshot({ checkedAt, fetchRemote, packagedCommit }) {
  const base = {
    branch: null,
    checkedAt,
    current: APP_VERSION,
    dirty: false,
    downloadUrl: HORIZON_INSTALLER_DOWNLOAD_URL,
    fetchFailed: false,
    latest: null,
    packageStale: false,
    packagedCommit,
    packagedVersion: APP_VERSION,
    remote: "https://github.com/BoomerRawlings/horizon-os/releases/latest",
    sourceUpdateAvailable: false,
    sourceVersion: null,
    supported: true,
    updateAvailable: false,
    updateMode: "installer",
    upstream: null,
    version: APP_VERSION,
  };

  try {
    const release = await latestReleasePayload({ fetchRemote });
    if (!release) {
      return {
        ...base,
        checkState: "current",
        message: "Horizon is ready to relaunch.",
      };
    }
    const latestVersion = String(release.tag_name || "").trim().replace(/^v/i, "");
    const comparison = compareReleaseVersions(latestVersion, APP_VERSION);
    const installerAsset = Array.isArray(release.assets)
      ? release.assets.find((asset) => asset?.name === HORIZON_INSTALLER_ASSET)
      : null;
    const downloadUrl = String(installerAsset?.browser_download_url || HORIZON_INSTALLER_DOWNLOAD_URL);
    if (comparison > 0 && !installerAsset) {
      return {
        ...base,
        checkState: "fetch_failed",
        downloadUrl: String(release.html_url || base.remote),
        fetchFailed: true,
        latest: latestVersion,
        message: `Horizon ${latestVersion} is listed, but its Windows installer is not available yet. Try again shortly.`,
        sourceVersion: latestVersion,
      };
    }
    if (comparison > 0) {
      return {
        ...base,
        checkState: "update_available",
        downloadUrl,
        latest: latestVersion,
        message: `Horizon ${latestVersion} is available. Download the installer, close Horizon, and run it; your workspace and connections stay in place.`,
        sourceUpdateAvailable: true,
        sourceVersion: latestVersion,
        updateAvailable: true,
      };
    }
    return {
      ...base,
      checkState: "current",
      downloadUrl,
      latest: latestVersion,
      message: comparison === 0
        ? `Horizon ${APP_VERSION} is up to date.`
        : `This Horizon ${APP_VERSION} build is newer than the latest public release (${latestVersion}).`,
      sourceVersion: latestVersion,
    };
  } catch {
    return {
      ...base,
      checkState: "fetch_failed",
      fetchFailed: true,
      message: "Horizon could not check the latest release. Retry when you are online, or use the installer link below.",
    };
  }
}

async function updateSnapshot(fetchRemote) {
  const checkedAt = nowIso();
  const sourceVersion = packageVersionAt(path.join(REPO_DASHBOARD_DIR, "package.json"));
  const packagedBuild = packagedBuildInfo();
  const packagedCommit = String(packagedBuild?.commit || "").trim() || null;
  const packagedVersion = APP_VERSION;
  const unavailable = (message, checkState = "unsupported") => ({
    branch: null,
    checkedAt,
    checkState,
    current: null,
    dirty: false,
    fetchFailed: checkState === "fetch_failed",
    latest: null,
    message,
    packageStale: sourceVersion !== "unknown" && packagedVersion !== sourceVersion,
    packagedCommit,
    packagedVersion,
    remote: null,
    sourceUpdateAvailable: false,
    sourceVersion,
    supported: false,
    updateAvailable: false,
    upstream: null,
    version: APP_VERSION,
  });

  if (IS_PACKAGED_RUNTIME) {
    return packagedReleaseSnapshot({ checkedAt, fetchRemote, packagedCommit });
  }

  if (!fs.existsSync(path.join(APP_SOURCE_ROOT, ".git")) || !fs.existsSync(path.join(REPO_DASHBOARD_DIR, "package.json"))) {
    return unavailable("This Horizon installation is not connected to an update checkout. Run the current installer once to repair it.");
  }

  let branch;
  let current;
  let remote = null;
  let upstream;
  try {
    branch = await git(["rev-parse", "--abbrev-ref", "HEAD"]);
    current = await git(["rev-parse", "HEAD"]);
    upstream = await trackedBranch();
    try {
      remote = await git(["remote", "get-url", "origin"]);
    } catch {
      remote = null;
    }
  } catch {
    return unavailable("Horizon found its update checkout, but Git could not read it. Run the current installer once to repair the updater.");
  }

  let fetchFailed = false;
  if (fetchRemote) {
    try {
      await git(["fetch", "--prune", "origin"], { timeout: 90_000 });
    } catch {
      fetchFailed = true;
    }
  }

  let latest = current;
  try {
    latest = await git(["rev-parse", upstream]);
  } catch {
    fetchFailed = true;
  }

  let status = "";
  try {
    status = await git(["status", "--porcelain"]);
  } catch {
    return unavailable("Horizon could not inspect its update checkout. Run the current installer once to repair the updater.");
  }
  const trackedChanges = status
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("??"))
    .map(statusPathFromPorcelain)
    .filter(isAppUpdatePath);
  const dirty = trackedChanges.length > 0;
  const sourceUpdateAvailable = current !== latest;
  const versionMismatch = sourceVersion !== "unknown" && packagedVersion !== sourceVersion;
  const commitMismatch = Boolean(packagedCommit && packagedCommit !== current);
  const missingPackagedIdentity = IS_PACKAGED_RUNTIME && !packagedCommit;
  const packageStale = versionMismatch || commitMismatch || missingPackagedIdentity;
  const updateAvailable = !fetchFailed && (sourceUpdateAvailable || packageStale);
  let checkState = sourceUpdateAvailable ? "update_available" : packageStale ? "package_stale" : "current";
  let message = sourceUpdateAvailable
    ? packageStale
      ? "An update is available, and the installed app also needs rebuilding."
      : "An update is available."
    : packageStale
      ? "Horizon source is current, but the installed app is still an older build. Repair is available."
      : "Horizon is up to date.";
  if (fetchFailed) {
    checkState = "fetch_failed";
    message = "Horizon could not refresh the update source. The hashes below are only the last known values; retry when online.";
  } else if (dirty) {
    checkState = "dirty";
    message = updateAvailable
      ? "An update is available, but local changes need to be saved first."
      : "The update source is current, but local app changes are present.";
  }

  return {
    branch,
    checkedAt,
    checkState,
    current,
    dirty,
    fetchFailed,
    latest,
    message,
    packageStale,
    packagedCommit,
    packagedVersion,
    remote,
    sourceUpdateAvailable,
    sourceVersion,
    supported: true,
    updateAvailable,
    upstream,
    version: APP_VERSION,
  };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function nowIso() {
  return new Date().toISOString();
}

function safeJsonRead(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(`${filePath}.tmp`, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(`${filePath}.tmp`, filePath);
}

function integrationDefinition(id) {
  return INTEGRATION_DEFINITIONS[id] || null;
}

function writePrivateText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, value, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
}

function validIntegrationStore(store) {
  return Boolean(store && typeof store === "object" && store.integrations && typeof store.integrations === "object");
}

function writeIntegrationStoreFile(store) {
  if (INTEGRATION_STORE_ENCRYPTION_ACTIVE) {
    writePrivateText(INTEGRATION_SETTINGS_PATH, encryptIntegrationStore(store, INTEGRATION_STORE_MASTER_KEY));
    return;
  }
  if (REQUIRE_CREDENTIAL_ENCRYPTION) {
    throw new Error("Horizon refused to save integration settings without credential encryption.");
  }
  writeJson(INTEGRATION_SETTINGS_PATH, store);
}

function readIntegrationStore() {
  if (!fs.existsSync(INTEGRATION_SETTINGS_PATH)) return { integrations: {}, updatedAt: null, version: 1 };

  let serialized;
  try {
    serialized = fs.readFileSync(INTEGRATION_SETTINGS_PATH, "utf8");
  } catch {
    throw new Error("Horizon could not read the protected integration settings file.");
  }

  let store;
  if (isEncryptedIntegrationStore(serialized)) {
    if (!INTEGRATION_STORE_ENCRYPTION_ACTIVE) {
      throw new Error("Encrypted integration settings cannot be opened without the installed Horizon app.");
    }
    try {
      store = decryptIntegrationStore(serialized, INTEGRATION_STORE_MASTER_KEY);
    } catch {
      throw new Error("Horizon could not authenticate the protected integration settings file.");
    }
  } else {
    try {
      store = JSON.parse(serialized);
    } catch {
      throw new Error("Horizon could not read the integration settings file.");
    }
  }

  if (!validIntegrationStore(store)) {
    throw new Error("Horizon found an invalid integration settings file.");
  }
  if (!isEncryptedIntegrationStore(serialized) && INTEGRATION_STORE_ENCRYPTION_ACTIVE) {
    writeIntegrationStoreFile(store);
  }
  return store;
}

function saveIntegrationStore(store) {
  const persistedStore = {
    ...store,
    updatedAt: nowIso(),
    version: 1,
  };
  writeIntegrationStoreFile(persistedStore);

  try {
    writeHorizonRedactedIntegrations(store);
  } catch {
    // Local vault summaries should never block integration saves.
  }
}

function mergedIntegrationSettings(id, store = readIntegrationStore()) {
  const definition = integrationDefinition(id);
  if (!definition) throw new Error("Unknown integration");
  const settings = {
    ...definition.defaultSettings,
    ...(store.integrations[id]?.settings || {}),
  };
  if (id === "obsidian") settings.vaultPath = ROOT;
  return settings;
}

function secretTail(value) {
  const text = String(value || "");
  return text ? text.slice(-4) : "";
}

const SENSITIVE_SETTING_KEYS = new Set([
  "accessToken",
  "apiKey",
  "clientSecret",
  "idToken",
  "refreshToken",
  "token",
  "tokenOrKey",
  "zoteroApiKey",
]);

function redactSensitiveSettings(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redactSensitiveSettings);

  const redacted = {};
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_SETTING_KEYS.has(key)) {
      const tail = secretTail(item);
      redacted[key] = "";
      redacted[`${key}Saved`] = Boolean(tail);
      redacted[`${key}Tail`] = tail;
      continue;
    }
    redacted[key] = redactSensitiveSettings(item);
  }
  return redacted;
}

function redactIntegrationSettings(id, settings) {
  const redacted = redactSensitiveSettings(settings);
  if (id === "google-drive") {
    try {
      redacted.googleOAuthAvailable = Boolean(readGoogleOAuthClient(settings).clientId);
    } catch {
      redacted.googleOAuthAvailable = false;
    }
  }
  return redacted;
}

function redactedIntegrationSettingsStore(store = readIntegrationStore()) {
  const integrations = {};
  for (const id of Object.keys(INTEGRATION_DEFINITIONS)) {
    const saved = store.integrations[id] || {};
    const settings = {
      ...INTEGRATION_DEFINITIONS[id].defaultSettings,
      ...(saved.settings || {}),
    };

    integrations[id] = {
      label: INTEGRATION_DEFINITIONS[id].label,
      settings: redactIntegrationSettings(id, settings),
      lastSavedAt: saved.lastSavedAt || null,
      lastTestedAt: saved.lastTestedAt || null,
      lastTestResult: saved.lastTestResult || null,
    };
  }

  return {
    generatedAt: nowIso(),
    source: "Horizon app-data/integration-settings.json",
    secretsPolicy: "Secrets are redacted. Installed Horizon encrypts the complete integration store with operating-system-protected key material; direct developer-server mode may use local plaintext.",
    integrations,
    version: 1,
  };
}

function writeHorizonRedactedIntegrations(store = readIntegrationStore()) {
  const snapshot = redactedIntegrationSettingsStore(store);
  if (process.env.RSB_DISABLE_INTEGRATION_MIRROR !== "1") {
    writeJson(HORIZON_REDACTED_INTEGRATIONS_PATH, snapshot);
  }
  return snapshot;
}

function horizonStateSummary(state, redactedIntegrations) {
  const appSettings = state.appSettings || {};
  const profile = state.profile || {};
  const integrations = Array.isArray(state.integrationConnections) ? state.integrationConnections : [];
  const connected = integrations.filter((item) => String(item.status || "").startsWith("connected")).length;
  const spotlightPreferences = state.spotlightPreferences || {};

  return [
    "# Horizon Local State",
    "",
    "Local, Git-ignored runtime state mirrored from Horizon OS.",
    "",
    "## Files",
    "",
    "- `runtime-state.json` - local app/profile/settings snapshot.",
    "- `integration-settings.redacted.json` - redacted integration settings summary.",
    "",
    "## Current Snapshot",
    "",
    `- Updated: ${state.updatedAt || "unknown"}`,
    `- Display name: ${profile.displayName || "unknown"}`,
    `- Account email present: ${Boolean(profile.accountEmail)}`,
    `- Theme: ${profile.theme?.accentColor || "unknown"} / ${profile.theme?.backgroundTheme || "unknown"}`,
    `- Focus sound volume: ${appSettings.focus?.soundVolume ?? "unknown"}`,
    `- Launch at startup: ${appSettings.general?.launchAtStartup ?? "unknown"}`,
    `- Calendar week starts Monday: ${appSettings.calendar?.weekStartsMonday ?? "unknown"}`,
    `- Integration tiles tracked: ${integrations.length}`,
    `- Connected or limited integrations: ${connected}`,
    `- Spotlight mode stored: ${spotlightPreferences.manualProjectId ? "manual" : "auto/default"}`,
    `- Redacted integration summary updated: ${redactedIntegrations.generatedAt || "unknown"}`,
    "",
    "## Git Policy",
    "",
    "This folder is ignored by Git. It may contain personal preferences and local machine paths.",
    "Do not move secrets here. Installed Horizon keeps the encrypted integration store in app-data and mirrors only redacted summaries.",
    "",
  ];
}

function normalizeHorizonStatePayload(payload, existing = {}) {
  return {
    appSettings: payload.appSettings || existing.appSettings || null,
    integrationConnections: Array.isArray(payload.integrationConnections)
      ? payload.integrationConnections
      : existing.integrationConnections || [],
    profile: payload.profile || existing.profile || null,
    spotlightPreferences: payload.spotlightPreferences || existing.spotlightPreferences || {},
  };
}

function saveHorizonLocalState(payload) {
  const existing = safeJsonRead(HORIZON_LOCAL_STATE_PATH, {});
  const normalized = normalizeHorizonStatePayload(payload || {}, existing);
  const redactedIntegrations = writeHorizonRedactedIntegrations();
  const state = {
    ...normalized,
    redactedIntegrationSettingsPath: "00_System/local/Horizon/integration-settings.redacted.json",
    updatedAt: nowIso(),
    version: 1,
  };

  const summaryLines = horizonStateSummary(state, redactedIntegrations);
  writeJson(HORIZON_LOCAL_STATE_PATH, state);
  fs.mkdirSync(path.dirname(HORIZON_LOCAL_INDEX_PATH), { recursive: true });
  fs.writeFileSync(HORIZON_LOCAL_INDEX_PATH, `${summaryLines.join("\n")}\n`, "utf8");
  return state;
}

function readHorizonLocalState() {
  return {
    exists: fs.existsSync(HORIZON_LOCAL_STATE_PATH),
    localStatePath: "00_System/local/Horizon/runtime-state.json",
    redactedIntegrationSettings: redactedIntegrationSettingsStore(),
    state: safeJsonRead(HORIZON_LOCAL_STATE_PATH, null),
  };
}

function integrationRecord(id) {
  const definition = integrationDefinition(id);
  if (!definition) throw new Error("Unknown integration");
  const store = readIntegrationStore();
  const settings = mergedIntegrationSettings(id, store);
  const saved = store.integrations[id] || {};
  return {
    definition,
    rawSettings: settings,
    redactedSettings: redactIntegrationSettings(id, settings),
    saved,
  };
}

function googleTokenStatus(settings) {
  const tokens = settings.oauthTokens || {};
  const expiry = Number(tokens.expiryDate || 0);
  const hasAccessToken = Boolean(tokens.accessToken);
  const hasRefreshToken = Boolean(tokens.refreshToken);
  const accessStillValid = hasAccessToken && expiry > Date.now() + 60_000;
  if (hasRefreshToken) return "refreshable";
  if (accessStillValid) return "access_valid";
  if (hasAccessToken) return "access_expired";
  return "missing";
}

function connectionForIntegration(id) {
  const { definition, rawSettings, saved } = integrationRecord(id);
  const lastCheckedLabel = saved.lastTestedAt
    ? `Tested ${new Date(saved.lastTestedAt).toLocaleString()}`
    : saved.lastSavedAt
      ? `Saved ${new Date(saved.lastSavedAt).toLocaleString()}`
      : "Not checked";

  if (id === "obsidian") {
    const vault = vaultStructureStatus(rawSettings.vaultPath);
    if (!rawSettings.vaultPath || !vault.exists) {
      return {
        ...definition,
        actionLabel: "Choose workspace",
        detailLabel: rawSettings.vaultPath || "Workspace path needed",
        lastCheckedLabel,
        status: "vault_missing",
        statusLabel: "Workspace missing",
      };
    }
    return {
      ...definition,
      actionLabel: "Manage workspace",
      detailLabel: vault.initialized ? `Ready: ${vault.path}` : `Needs initialization: ${vault.path}`,
      lastCheckedLabel,
      status: vault.initialized ? "connected" : "connected_limited",
      statusLabel: vault.initialized ? "Workspace ready" : "Workspace valid",
    };
  }

  if (id === "codex") {
    const workspacePath = String(rawSettings.workspacePath || "").trim();
    return {
      ...definition,
      actionLabel: "Open Codex",
      detailLabel: workspacePath ? `Workspace ready: ${workspacePath}` : "Choose a workspace in Codex",
      lastCheckedLabel,
      status: pathExistsDirectory(workspacePath) ? "connected_limited" : "stale",
      statusLabel: pathExistsDirectory(workspacePath) ? "Launcher ready" : "Choose workspace in Codex",
    };
  }

  if (id === "microsoft") {
    return {
      ...definition,
      actionLabel: "Open apps",
      detailLabel: "Opens Microsoft apps and official websites; account sync is not available yet",
      lastCheckedLabel,
      status: "connected_limited",
      statusLabel: "Launcher ready",
    };
  }

  if (id === "google-drive") {
    const accountLabel = String(rawSettings.accountEmail || "").trim() || undefined;
    const tokenState = googleTokenStatus(rawSettings);
    const failedState = saved.lastTestResult && !saved.lastTestResult.ok
      ? ["needs_reauth", "offline", "rate_limited", "permission_missing", "error"].includes(saved.lastTestResult.state)
        ? saved.lastTestResult.state
        : "error"
      : null;
    const isConnected = !failedState && (tokenState === "refreshable" || tokenState === "access_valid");
    const oauthAvailable = (() => {
      try {
        return Boolean(readGoogleOAuthClient(rawSettings).clientId);
      } catch {
        return false;
      }
    })();
    return {
      ...definition,
      accountLabel,
      actionLabel: isConnected ? "Manage" : failedState === "needs_reauth" ? "Reconnect" : "Connect",
      detailLabel: isConnected
        ? accountLabel
          ? `Connected as ${accountLabel}`
          : "Google authorized locally"
        : failedState === "needs_reauth"
          ? "Google access expired or was revoked"
          : failedState === "offline"
            ? "Google could not be reached during the last check"
            : oauthAvailable
              ? "Ready for browser sign-in"
              : "Google sign-in is not available in this copy",
      lastCheckedLabel,
      status: isConnected ? "connected" : failedState || (oauthAvailable ? "auth_pending" : "permission_missing"),
      statusLabel: isConnected
        ? "Connected"
        : failedState === "needs_reauth"
          ? "Reconnect required"
          : failedState === "offline"
            ? "Could not verify"
            : failedState === "rate_limited"
              ? "Google asked Horizon to wait"
              : failedState
                ? "Sign-in needs attention"
                : oauthAvailable
                  ? "Sign-in required"
                  : "Sign-in unavailable",
    };
  }

  if (id === "research") {
    const sourcePath = String(rawSettings.sourcePath || "").trim();
    const hasFolder = pathExistsDirectory(sourcePath);
    return {
      ...definition,
      actionLabel: "Manage",
      detailLabel: sourcePath || "Research source needed",
      lastCheckedLabel,
      status: hasFolder ? "connected_limited" : "not_connected",
      statusLabel: hasFolder ? "Folder connected" : "No sources connected",
    };
  }

  if (id === "zotero") {
    const userId = String(rawSettings.zoteroUserId || "").trim();
    const username = String(rawSettings.zoteroUsername || "").trim();
    const hasKey = Boolean(rawSettings.zoteroApiKey);
    const localVerified = Boolean(rawSettings.zoteroLocal?.enabled && rawSettings.zoteroLocal?.verifiedAt);
    const localFailureState = !localVerified && ["offline", "permission_missing", "error"].includes(rawSettings.zoteroLocal?.state)
      ? rawSettings.zoteroLocal.state
      : null;
    const canReadLibrary = rawSettings.zoteroAccess?.library === true || localVerified;
    const canWriteLibrary = rawSettings.zoteroAccess?.write === true;
    const cloudVerified = Boolean(
      hasKey &&
      userId &&
      rawSettings.zoteroAccess?.library === true &&
      saved.lastTestResult?.ok &&
      ["connected", "connected_limited"].includes(saved.lastTestResult?.state),
    );
    const verified = cloudVerified || localVerified;
    const failedState = saved.lastTestResult && !saved.lastTestResult.ok
      ? ["not_connected", "missing_credentials", "api_key_required"].includes(saved.lastTestResult.state)
        ? "api_key_required"
        : ["offline", "permission_missing", "rate_limited"].includes(saved.lastTestResult.state)
          ? saved.lastTestResult.state
          : "api_key_invalid"
      : null;
    return {
      ...definition,
      actionLabel: verified || hasKey ? "Manage" : "Connect",
      accountLabel: username || (localVerified ? "Zotero Desktop" : undefined),
      detailLabel: cloudVerified
        ? `${username || `Zotero user ${userId}`}, cloud key saved`
        : localVerified
          ? "Zotero Desktop connected locally"
          : hasKey
            ? "Cloud key saved; verification needed"
            : "Open Zotero Desktop, then connect without a key",
      lastCheckedLabel,
      status: verified
        ? canWriteLibrary ? "connected" : "connected_limited"
        : failedState || localFailureState || (hasKey ? "auth_pending" : "not_connected"),
      statusLabel: verified
        ? canWriteLibrary
          ? "Connected"
          : "Read-only connection"
        : failedState
          ? failedState === "api_key_required"
            ? "Key needed"
            : failedState === "offline"
              ? "Could not reach Zotero"
              : failedState === "permission_missing"
                ? "Permissions need attention"
                : "Key needs attention"
          : localFailureState === "offline"
            ? "Open Zotero Desktop"
            : localFailureState === "permission_missing"
              ? "Enable local access in Zotero"
              : localFailureState
                ? "Desktop connection needs attention"
                : hasKey
            ? "Verification needed"
            : "Connect Zotero Desktop",
    };
  }

  if (id === "ai-agent") {
    const provider = String(rawSettings.provider || "AI provider").trim();
    const model = String(rawSettings.model || "").trim();
    const hasKey = Boolean(rawSettings.tokenOrKey);
    const verified = Boolean(
      hasKey
      && saved.lastTestResult?.ok
      && saved.lastTestResult?.state === "responses_verified"
      && saved.lastTestResult?.validationVersion === AI_AGENT_VALIDATION_VERSION
      && saved.lastTestResult?.verifiedModel === model,
    );
    const failedState = saved.lastTestResult && !saved.lastTestResult.ok
      ? ["not_connected", "api_key_required"].includes(saved.lastTestResult.state)
        ? "api_key_required"
        : ["api_key_invalid", "offline", "permission_missing", "rate_limited", "billing_required"].includes(saved.lastTestResult.state)
          ? saved.lastTestResult.state
          : "error"
      : null;
    return {
      ...definition,
      actionLabel: hasKey ? "Manage" : "Connect",
      detailLabel: hasKey ? `${provider} key ending ${secretTail(rawSettings.tokenOrKey)}${model ? `, ${model}` : ""}` : `${provider} key not stored`,
      lastCheckedLabel,
      status: verified ? "connected" : failedState || (hasKey ? "auth_pending" : "api_key_required"),
      statusLabel: verified
        ? "Capture access verified"
        : failedState
          ? failedState === "api_key_invalid"
            ? "Key needs attention"
            : failedState === "api_key_required"
              ? "API key required"
              : failedState === "offline"
                ? "OpenAI is unreachable"
                : failedState === "rate_limited"
                  ? "Rate or quota limit"
                  : failedState === "billing_required"
                    ? "API billing needed"
                    : failedState === "permission_missing"
                      ? "Key permissions needed"
                      : "Connection needs attention"
          : hasKey
            ? "Verification needed"
            : "API key required",
    };
  }

  return { ...definition, lastCheckedLabel };
}

function allIntegrationConnections() {
  return Object.keys(INTEGRATION_DEFINITIONS).map(connectionForIntegration);
}

function sanitizeIntegrationPayload(id, payload) {
  const existing = mergedIntegrationSettings(id);
  const settings = { ...existing, ...(payload.settings || payload || {}) };
  if (id === "obsidian") settings.vaultPath = ROOT;
  for (const key of ["apiKey", "tokenOrKey", "zoteroApiKey"]) {
    if (Object.prototype.hasOwnProperty.call(settings, key) && !String(settings[key] || "").trim()) {
      settings[key] = existing[key] || "";
    }
  }
  return settings;
}

function saveIntegrationSettings(id, payload) {
  if (!integrationDefinition(id)) throw new Error("Unknown integration");
  const store = readIntegrationStore();
  const previousSettings = mergedIntegrationSettings(id, store);
  const settings = sanitizeIntegrationPayload(id, payload);
  const secretChanged = ["tokenOrKey", "zoteroApiKey"].some((key) =>
    Object.prototype.hasOwnProperty.call(payload.settings || payload || {}, key) &&
    String(settings[key] || "").trim() !== String(previousSettings[key] || "").trim(),
  );
  const verificationChanged = secretChanged || (
    id === "ai-agent"
    && ["provider", "model"].some((key) =>
      Object.prototype.hasOwnProperty.call(payload.settings || payload || {}, key)
      && String(settings[key] || "").trim() !== String(previousSettings[key] || "").trim(),
    )
  );
  if (id === "zotero" && secretChanged) {
    settings.zoteroAccess = null;
    settings.zoteroUserId = "";
    settings.zoteroUsername = "";
  }
  store.integrations[id] = {
    ...(store.integrations[id] || {}),
    settings,
    lastSavedAt: nowIso(),
    ...(verificationChanged ? { lastTestedAt: null, lastTestResult: null } : {}),
  };
  saveIntegrationStore(store);
  const connection = connectionForIntegration(id);
  writeIntegrationRunLog({
    actionId: `${id}.save-settings`,
    integrationId: id,
    inputsSummary: "Saved integration settings.",
    outputsSummary: connection.statusLabel,
    status: "success",
  });
  return {
    connection,
    message: `${connection.label} settings saved.`,
    settings: redactIntegrationSettings(id, settings),
  };
}

function disconnectIntegration(id) {
  if (!integrationDefinition(id)) throw new Error("Unknown integration");
  const store = readIntegrationStore();
  const current = mergedIntegrationSettings(id, store);
  let settings = current;

  if (id === "zotero") {
    settings = {
      ...current,
      zoteroAccess: null,
      zoteroApiKey: "",
      zoteroLocal: { enabled: false, verifiedAt: null },
      zoteroUserId: "",
      zoteroUsername: "",
    };
  } else if (id === "ai-agent") {
    settings = { ...current, tokenOrKey: "" };
  } else if (id === "google-drive") {
    settings = { ...current, oauthTokens: {} };
  } else {
    return {
      connection: connectionForIntegration(id),
      message: `${integrationDefinition(id).label} does not have a removable sign-in yet.`,
      ok: false,
      settings: redactIntegrationSettings(id, current),
    };
  }

  store.integrations[id] = {
    ...(store.integrations[id] || {}),
    lastSavedAt: nowIso(),
    lastTestedAt: null,
    lastTestResult: null,
    settings,
  };
  saveIntegrationStore(store);
  writeIntegrationRunLog({
    actionId: `${id}.disconnect`,
    integrationId: id,
    inputsSummary: "Removed locally stored integration credentials.",
    outputsSummary: "Disconnected on this PC.",
    status: "success",
  });
  return {
    connection: connectionForIntegration(id),
    message: `${integrationDefinition(id).label} disconnected on this PC.`,
    ok: true,
    settings: redactIntegrationSettings(id, settings),
  };
}

function saveIntegrationSettingsPatch(id, patch, options = {}) {
  if (!integrationDefinition(id)) throw new Error("Unknown integration");
  const store = readIntegrationStore();
  const settings = {
    ...mergedIntegrationSettings(id, store),
    ...(patch || {}),
  };
  store.integrations[id] = {
    ...(store.integrations[id] || {}),
    settings,
    lastSavedAt: options.lastSavedAt || nowIso(),
    lastTestedAt: options.lastTestedAt || store.integrations[id]?.lastTestedAt || null,
    lastTestResult: options.lastTestResult || store.integrations[id]?.lastTestResult || null,
  };
  saveIntegrationStore(store);
  return settings;
}

function ensureRunLogIndex() {
  fs.mkdirSync(INTEGRATION_RUN_LOG_DIR, { recursive: true });
  const indexPath = path.join(INTEGRATION_RUN_LOG_DIR, "index.md");
  if (!fs.existsSync(indexPath)) {
    fs.writeFileSync(
      indexPath,
      [
        "# Integration Test Runs",
        "",
        "Compact logs from Horizon OS integration validation, setup, and test actions.",
        "",
        "## Runs",
        "",
      ].join("\n"),
      "utf8",
    );
  }
  return indexPath;
}

function writeIntegrationRunLog({ actionId, errors = [], filesTouched = [], inputsSummary, integrationId, outputsSummary, status }) {
  if (process.env.RSB_DISABLE_RUN_LOGS === "1") return;
  try {
    const started = nowIso();
    const stamp = started.replace(/:/g, "-").replace(/\.\d{3}Z$/, "Z");
    const id = `run_${stamp}_${String(actionId || "integration").replace(/[^a-z0-9._-]+/gi, "-")}`;
    const indexPath = ensureRunLogIndex();
    const fileName = `${id}.md`;
    const body = [
      "---",
      `id: ${id}`,
      "type: workflow-run",
      `workflow_id: ${actionId}`,
      `skill_id: ${integrationId || "integration"}`,
      `status: ${status}`,
      `started: ${started}`,
      `completed: ${nowIso()}`,
      "token_estimate: 0",
      `inputs_summary: "${String(inputsSummary || "").replace(/"/g, "'")}"`,
      `outputs_summary: "${String(outputsSummary || "").replace(/"/g, "'")}"`,
      `artifacts: [${filesTouched.map((file) => `"${String(file).replace(/"/g, "'")}"`).join(", ")}]`,
      `errors: [${errors.map((error) => `"${String(error).replace(/"/g, "'")}"`).join(", ")}]`,
      "followups: []",
      "quality_notes: \"Compact automated run log.\"",
      "next_iteration_notes: \"Review repeated failures before adding more automation.\"",
      "---",
      "",
      `# ${actionId}`,
      "",
      `- Integration: ${integrationId || "unknown"}`,
      `- Result: ${status}`,
      `- Output: ${outputsSummary || "No output summary."}`,
      "",
    ].join("\n");
    fs.writeFileSync(path.join(INTEGRATION_RUN_LOG_DIR, fileName), body, "utf8");
    fs.appendFileSync(indexPath, `- [[${fileName.replace(/\.md$/, "")}]] - ${actionId} - ${status}\n`, "utf8");
  } catch {
    // Run logging should never break the user action it records.
  }
}

async function testZotero(settings) {
  const zoteroApiKey = String(settings.zoteroApiKey || "").trim();
  if (!zoteroApiKey) {
    return {
      ok: false,
      message: "Paste the Zotero key you created for Horizon, then connect again.",
      state: "missing_credentials",
    };
  }

  try {
    const response = await fetch("https://api.zotero.org/keys/current", {
      headers: {
        "Zotero-API-Key": zoteroApiKey,
        "Zotero-API-Version": "3",
      },
    });
    const body = await response.text();
    let data = null;
    try {
      data = body ? JSON.parse(body) : null;
    } catch {
      data = null;
    }
    if (response.status === 403) {
      return { ok: false, message: "Zotero rejected this key. Create a fresh Horizon key and try again.", state: "api_key_invalid" };
    }
    if (response.status === 404) {
      return { ok: false, message: "Zotero could not find this key. Create a fresh Horizon key and try again.", state: "not_found" };
    }
    if (response.status === 429) {
      return { ok: false, message: "Zotero is temporarily rate limiting connection checks. Keep this key and try again shortly.", state: "rate_limited" };
    }
    if (response.status >= 500) {
      return { ok: false, message: "Zotero is temporarily unavailable. Keep this key and try again later.", state: "offline" };
    }
    if (!response.ok) {
      return { ok: false, message: `Zotero connection failed with HTTP ${response.status}.`, state: "error" };
    }

    const zoteroUserId = String(data?.userID || data?.userId || "").trim();
    const zoteroUsername = String(data?.username || "").trim();
    const userAccess = data?.access?.user || {};
    const canReadLibrary = userAccess.library === true;
    const canWriteLibrary = userAccess.write === true;
    const settingsPatch = {
      zoteroAccess: {
        library: canReadLibrary,
        write: canWriteLibrary,
      },
      zoteroUserId,
      zoteroUsername,
    };

    if (!zoteroUserId || !canReadLibrary) {
      return {
        ok: false,
        message: "This key cannot read your personal Zotero library. Create a Horizon key with Personal Library access.",
        settingsPatch,
        state: "permission_missing",
      };
    }
    if (!canWriteLibrary) {
      return {
        ok: true,
        message: `Zotero connected${zoteroUsername ? ` as ${zoteroUsername}` : ""} for reading. Add write access to let approved Capture actions create Zotero items.`,
        settingsPatch,
        state: "connected_limited",
      };
    }
    return {
      ok: true,
      message: `Zotero connected${zoteroUsername ? ` as ${zoteroUsername}` : ""}. Library read and write access confirmed.`,
      settingsPatch,
      state: "connected",
    };
  } catch (error) {
    return { ok: false, message: `Zotero test could not reach the API: ${error.message}`, state: "offline" };
  }
}

async function connectZoteroDesktop() {
  const integrationId = "zotero";
  const instructions = "Open Zotero, then go to Edit > Settings > Advanced and enable 'Allow other applications on this computer to communicate with Zotero'.";
  let result;

  try {
    const response = await fetch("http://127.0.0.1:23119/api/users/0/items/top?format=json&limit=1", {
      headers: { "Zotero-API-Version": "3" },
      signal: AbortSignal.timeout(4_000),
    });
    if (response.status === 403) {
      result = { ok: false, message: `Zotero is running but local access is off. ${instructions}`, state: "permission_missing" };
    } else if (!response.ok) {
      result = { ok: false, message: `Zotero Desktop answered with HTTP ${response.status}. Update Zotero, restart it, and try again.`, state: "error" };
    } else {
      const data = await response.json().catch(() => null);
      result = Array.isArray(data)
        ? { ok: true, message: "Zotero Desktop connected. Horizon can read this library while Zotero is running; no API key is needed.", state: "local_connected" }
        : { ok: false, message: "Zotero Desktop returned an unreadable library response. Update Zotero and try again.", state: "error" };
    }
  } catch {
    result = {
      ok: false,
      message: `Zotero Desktop was not found. Install or open Zotero, wait for the library window, then try again. If it is already open, ${instructions}`,
      state: "offline",
    };
  }

  const settings = saveIntegrationSettingsPatch(integrationId, {
    zoteroLocal: result.ok
      ? { enabled: true, lastCheckedAt: nowIso(), lastMessage: result.message, state: result.state, verifiedAt: nowIso() }
      : { enabled: false, lastCheckedAt: nowIso(), lastMessage: result.message, state: result.state, verifiedAt: null },
  });
  writeIntegrationRunLog({
    actionId: "zotero.connect-desktop",
    errors: result.ok ? [] : [result.message],
    inputsSummary: "Checked the official Zotero Desktop local API on this PC.",
    integrationId,
    outputsSummary: result.message,
    status: result.ok ? "success" : "failed",
  });
  return {
    ...result,
    connection: connectionForIntegration(integrationId),
    settings: redactIntegrationSettings(integrationId, settings),
  };
}

async function exchangeGoogleCodeForTokens(session, code) {
  const body = new URLSearchParams({
    client_id: session.client.clientId,
    code,
    code_verifier: session.codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: GOOGLE_OAUTH_REDIRECT_URI,
  });
  if (session.client.clientSecret) body.set("client_secret", session.client.clientSecret);

  const response = await fetch(session.client.tokenUri, {
    body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error_description || data.error || `Google token exchange failed with HTTP ${response.status}.`);
  }
  return data;
}

async function refreshGoogleAccessToken(settings) {
  const tokens = settings.oauthTokens || {};
  const refreshToken = String(tokens.refreshToken || "").trim();
  if (!refreshToken) throw new Error("No Google refresh token is stored.");

  const client = readGoogleOAuthClient(settings);
  const body = new URLSearchParams({
    client_id: client.clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  if (client.clientSecret) body.set("client_secret", client.clientSecret);

  let response;
  try {
    response = await fetch(client.tokenUri, {
      body,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
  } catch {
    const message = "Google could not be reached. Check your internet connection and try again.";
    saveIntegrationSettingsPatch("google-drive", { oauthTokens: tokens }, {
      lastTestedAt: nowIso(),
      lastTestResult: { message, ok: false, state: "offline" },
    });
    const error = new Error(message);
    error.integrationState = "offline";
    throw error;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerCode = String(data.error || "").trim();
    const needsReauth = providerCode === "invalid_grant";
    const state = needsReauth
      ? "needs_reauth"
      : response.status === 429
        ? "rate_limited"
        : response.status >= 500
          ? "offline"
          : response.status === 401 || response.status === 403
            ? "permission_missing"
            : "error";
    const message = needsReauth
      ? "Google access expired or was revoked. Choose Reconnect Google and approve access again."
      : state === "rate_limited"
        ? "Google asked Horizon to wait before checking again. Try again in a few minutes."
        : state === "offline"
          ? "Google could not be reached. Check your internet connection and try again."
          : state === "permission_missing"
            ? "Google rejected the saved sign-in. Choose Reconnect Google and approve access again."
            : data.error_description || providerCode || `Google refresh failed with HTTP ${response.status}.`;
    saveIntegrationSettingsPatch("google-drive", { oauthTokens: needsReauth ? {} : tokens }, {
      lastTestedAt: nowIso(),
      lastTestResult: { message, ok: false, state },
    });
    const error = new Error(message);
    error.integrationState = state;
    throw error;
  }

  const updatedTokens = {
    ...tokens,
    accessToken: data.access_token || tokens.accessToken || "",
    expiryDate: data.expires_in ? Date.now() + Number(data.expires_in) * 1000 : tokens.expiryDate || 0,
    obtainedAt: nowIso(),
    scope: data.scope || tokens.scope || "",
    tokenType: data.token_type || tokens.tokenType || "Bearer",
  };
  saveIntegrationSettingsPatch("google-drive", { oauthTokens: updatedTokens }, {
    lastTestedAt: nowIso(),
    lastTestResult: { message: "Google token refresh succeeded.", ok: true, state: "connected" },
  });
  return updatedTokens;
}

async function testGoogle(settings) {
  try {
    readGoogleOAuthClient(settings);
  } catch {
    return {
      ok: false,
      message: "Google sign-in is not included in this copy of Horizon. You did not miss a setup step.",
      state: "permission_missing",
    };
  }

  const tokenState = googleTokenStatus(settings);
  if (tokenState === "refreshable") {
    try {
      await refreshGoogleAccessToken(settings);
      return { ok: true, message: "Google Drive is connected and will stay signed in on this PC.", state: "connected" };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Google sign-in could not be verified.",
        state: error?.integrationState || "offline",
      };
    }
  }
  if (tokenState === "access_valid") {
    return { ok: true, message: "Google Drive is connected on this PC.", state: "connected" };
  }
  if (tokenState === "access_expired") {
    return { ok: false, message: "Google access expired. Choose Reconnect Google and approve access again.", state: "needs_reauth" };
  }
  return { ok: false, message: "Choose Connect Google, sign in in your browser, then return to Horizon.", state: "auth_pending" };
}

async function startGoogleOAuth(payload = {}) {
  const inputSettings = sanitizeIntegrationPayload("google-drive", payload);
  const client = readGoogleOAuthClient(inputSettings);
  const scopes = ensureGoogleDriveBrowseScopes(normalizeGoogleScopes(inputSettings.scopes));
  const codeVerifier = randomOAuthValue(64);
  const state = randomOAuthValue(32);
  const authorizationUrl = new URL(client.authUri);

  authorizationUrl.searchParams.set("access_type", "offline");
  authorizationUrl.searchParams.set("client_id", client.clientId);
  authorizationUrl.searchParams.set("code_challenge", pkceChallenge(codeVerifier));
  authorizationUrl.searchParams.set("code_challenge_method", "S256");
  authorizationUrl.searchParams.set("include_granted_scopes", "true");
  authorizationUrl.searchParams.set("prompt", "consent");
  authorizationUrl.searchParams.set("redirect_uri", GOOGLE_OAUTH_REDIRECT_URI);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", scopes.join(" "));
  authorizationUrl.searchParams.set("state", state);

  const settings = saveIntegrationSettingsPatch("google-drive", {
    ...inputSettings,
    clientId: client.clientId,
    credentialPath: client.credentialPath || inputSettings.credentialPath || "",
    redirectUri: GOOGLE_OAUTH_REDIRECT_URI,
    scopes: scopes.join(" "),
  }, {
    lastTestedAt: nowIso(),
    lastTestResult: { message: "Google OAuth browser sign-in started.", ok: true, state: "auth_pending" },
  });

  googleOAuthSessions.set(state, {
    client,
    codeVerifier,
    createdAt: Date.now(),
    settings,
  });

  for (const [sessionState, session] of googleOAuthSessions) {
    if (Date.now() - session.createdAt > 10 * 60_000) googleOAuthSessions.delete(sessionState);
  }

  await startProcess(authorizationUrl.toString());
  writeIntegrationRunLog({
    actionId: "google-drive.oauth-start",
    integrationId: "google-drive",
    inputsSummary: "Started Google OAuth desktop browser flow.",
    outputsSummary: "Google authorization URL opened in the system browser.",
    status: "success",
  });

  return {
    authUrl: authorizationUrl.toString(),
    connection: connectionForIntegration("google-drive"),
    message: "Google sign-in opened in your browser. Approve access there, then return to Horizon.",
    ok: true,
    settings: redactIntegrationSettings("google-drive", settings),
  };
}

async function finishGoogleOAuthCallback(callbackUrl) {
  const state = callbackUrl.searchParams.get("state") || "";
  const error = callbackUrl.searchParams.get("error");
  const code = callbackUrl.searchParams.get("code");
  const session = googleOAuthSessions.get(state);

  if (error) {
    throw new Error(`Google authorization was not completed: ${error}`);
  }
  if (!code || !session) {
    throw new Error("Google authorization session was not recognized. Start the connection again from Horizon.");
  }

  googleOAuthSessions.delete(state);
  const tokenResponse = await exchangeGoogleCodeForTokens(session, code);
  const existingRefreshToken = session.settings.oauthTokens?.refreshToken || "";
  const oauthTokens = {
    accessToken: tokenResponse.access_token || "",
    expiryDate: tokenResponse.expires_in ? Date.now() + Number(tokenResponse.expires_in) * 1000 : 0,
    idToken: tokenResponse.id_token || "",
    obtainedAt: nowIso(),
    refreshToken: tokenResponse.refresh_token || existingRefreshToken,
    scope: tokenResponse.scope || session.settings.scopes || "",
    tokenType: tokenResponse.token_type || "Bearer",
  };

  saveIntegrationSettingsPatch("google-drive", {
    ...session.settings,
    oauthTokens,
  }, {
    lastTestedAt: nowIso(),
    lastTestResult: { message: "Google authorization completed.", ok: true, state: "connected" },
  });

  writeIntegrationRunLog({
    actionId: "google-drive.oauth-callback",
    integrationId: "google-drive",
    inputsSummary: "Received Google OAuth callback.",
    outputsSummary: "Stored redacted Google OAuth tokens locally.",
    status: "success",
  });

  return {
    connection: connectionForIntegration("google-drive"),
    message: "Google Drive is connected to Horizon on this PC.",
  };
}

async function testIntegration(id, payload = {}) {
  let settings = sanitizeIntegrationPayload(id, payload);
  let result;

  if (id === "obsidian") {
    const vault = vaultStructureStatus(settings.vaultPath);
    result = vault.exists
      ? {
          ok: true,
          message: vault.initialized
            ? "Obsidian vault is valid and initialized."
            : "Obsidian vault is valid. Horizon structure can be initialized next.",
          state: vault.initialized ? "connected" : "connected_limited",
          vault,
        }
      : { ok: false, message: "Vault path was not found.", state: "vault_missing", vault };
  } else if (id === "zotero") {
    settings = {
      ...settings,
      zoteroAccess: null,
      zoteroUserId: "",
      zoteroUsername: "",
    };
    result = await testZotero(settings);
  } else if (id === "research") {
    const sourcePath = String(settings.sourcePath || "").trim();
    result = pathExistsDirectory(sourcePath)
      ? { ok: true, message: "Research folder is available.", state: "connected_limited" }
      : { ok: false, message: "Research folder was not found.", state: "missing_path" };
  } else if (id === "codex") {
    const workspacePath = String(settings.workspacePath || "").trim();
    result = pathExistsDirectory(workspacePath)
      ? { ok: true, message: "Codex workspace path is available.", state: "connected_limited" }
      : { ok: false, message: "Codex workspace path was not found.", state: "missing_path" };
  } else if (id === "google-drive") {
    result = await testGoogle(settings);
    settings = mergedIntegrationSettings(id);
  } else if (id === "microsoft") {
    result = String(settings.clientId || "").trim()
      ? { ok: true, message: "OAuth client configuration is saved. Authorization flow is still pending.", state: "auth_pending" }
      : { ok: false, message: "OAuth client ID is required before testing authorization.", state: "permission_missing" };
  } else if (id === "ai-agent") {
    result = String(settings.tokenOrKey || "").trim()
      ? { ok: true, message: "AI key metadata is present. Use Refresh models to check which OpenAI models this key can access.", state: "connected_limited" }
      : { ok: false, message: "API key is required before testing.", state: "api_key_required" };
  } else {
    result = { ok: false, message: "No test is available for this integration yet.", state: "not_implemented" };
  }

  if (result.settingsPatch && typeof result.settingsPatch === "object") {
    settings = { ...settings, ...result.settingsPatch };
  }

  const store = readIntegrationStore();
  store.integrations[id] = {
    ...(store.integrations[id] || {}),
    settings,
    lastTestedAt: nowIso(),
    lastTestResult: { message: result.message, ok: result.ok, state: result.state },
  };
  saveIntegrationStore(store);
  writeIntegrationRunLog({
    actionId: `${id}.test-connection`,
    errors: result.ok ? [] : [result.message],
    inputsSummary: "Ran integration connection test.",
    integrationId: id,
    outputsSummary: result.message,
    status: result.ok ? "success" : "failed",
  });

  const { settingsPatch: _settingsPatch, ...publicResult } = result;
  return {
    ...publicResult,
    connection: connectionForIntegration(id),
    settings: redactIntegrationSettings(id, settings),
  };
}

async function listAiAgentModels(payload = {}) {
  const integrationId = "ai-agent";
  const settings = sanitizeIntegrationPayload(integrationId, payload);
  const provider = String(settings.provider || "OpenAI").trim();
  const apiKey = String(settings.tokenOrKey || "").trim();
  const selectedModel = String(settings.model || DEFAULT_AI_AGENT_MODEL).trim() || DEFAULT_AI_AGENT_MODEL;
  let activeModel = selectedModel;

  if (provider.toLowerCase() !== "openai") {
    return {
      ok: false,
      message: `AI provider ${provider} is not supported for model refresh yet.`,
      state: "provider_not_supported",
    };
  }
  if (!apiKey) {
    return {
      ok: false,
      message: "API key is required before Horizon can refresh available models.",
      state: "api_key_required",
    };
  }

  let result;
  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
      method: "GET",
    });
    const body = await response.text();
    let data = null;
    try {
      data = body ? JSON.parse(body) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      const message = data?.error?.message || body || "OpenAI model refresh failed.";
      const errorCode = String(data?.error?.code || data?.error?.type || "").toLowerCase();
      const billingOrQuota = /billing|credit|quota/.test(`${errorCode} ${message}`.toLowerCase());
      const state = response.status === 401
        ? "api_key_invalid"
        : response.status === 403
          ? "permission_missing"
          : response.status === 429 && billingOrQuota
            ? "billing_required"
            : response.status === 429
              ? "rate_limited"
              : "models_request_failed";
      result = { ok: false, message, state };
    } else {
      const models = mergeAiModelOptions(Array.isArray(data?.data) ? data.data : [], selectedModel, {
        includeDefaults: false,
        includeSelected: false,
      });
      if (!models.length) {
        result = {
          ok: false,
          message: "OpenAI accepted the key, but it did not return a compatible text model for Horizon.",
          models,
          state: "models_unavailable",
        };
      } else {
        const selectedIsVisible = models.some((model) => model.id === selectedModel);
        activeModel = selectedIsVisible ? selectedModel : models[0].id;
        settings.model = activeModel;
        const verificationResponse = await fetch("https://api.openai.com/v1/responses", {
          body: JSON.stringify({
            input: "Reply OK.",
            max_output_tokens: 16,
            model: activeModel,
            store: false,
          }),
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          method: "POST",
        });
        const verificationBody = await verificationResponse.text();
        let verificationData = null;
        try {
          verificationData = verificationBody ? JSON.parse(verificationBody) : null;
        } catch {
          verificationData = null;
        }

        if (!verificationResponse.ok || verificationData?.error) {
          const message = verificationData?.error?.message || verificationBody || "OpenAI Responses access could not be verified.";
          const errorCode = String(verificationData?.error?.code || verificationData?.error?.type || "").toLowerCase();
          const billingOrQuota = /billing|credit|quota/.test(`${errorCode} ${message}`.toLowerCase());
          const state = verificationResponse.status === 401
            ? "api_key_invalid"
            : verificationResponse.status === 403
              ? "permission_missing"
              : verificationResponse.status === 429 && billingOrQuota
                ? "billing_required"
                : verificationResponse.status === 429
                  ? "rate_limited"
                  : "responses_request_failed";
          result = { message, models, ok: false, selectedModel: activeModel, state };
        } else {
          result = {
            ok: true,
            message: selectedIsVisible
              ? `OpenAI connected. ${models.length} text model${models.length === 1 ? " is" : "s are"} visible, and Capture access passed a tiny test request.`
              : `OpenAI connected. ${selectedModel} is not visible, so Horizon selected ${activeModel} and verified Capture access with a tiny test request.`,
            models,
            selectedModel: activeModel,
            state: "responses_verified",
          };
        }
      }
    }
  } catch (error) {
    result = {
      ok: false,
      message: error instanceof Error ? error.message : "OpenAI model refresh could not run.",
      state: "offline",
    };
  }

  const store = readIntegrationStore();
  store.integrations[integrationId] = {
    ...(store.integrations[integrationId] || {}),
    settings,
    lastTestedAt: nowIso(),
    lastTestResult: {
      message: result.message,
      ok: result.ok,
      state: result.state,
      ...(result.ok && result.state === "responses_verified"
        ? { validationVersion: AI_AGENT_VALIDATION_VERSION, verifiedModel: activeModel }
        : {}),
    },
  };
  saveIntegrationStore(store);
  writeIntegrationRunLog({
    actionId: "ai-agent.refresh-models",
    errors: result.ok ? [] : [result.message],
    inputsSummary: "Requested available OpenAI model list for AI Agent.",
    integrationId,
    outputsSummary: result.ok ? result.message : "Model refresh failed.",
    status: result.ok ? "success" : "failed",
  });

  return {
    connection: connectionForIntegration(integrationId),
    models: result.models || mergeAiModelOptions([], activeModel),
    selectedModel: activeModel,
    ...result,
  };
}

function ensureTextFile(filePath, lines) {
  if (fs.existsSync(filePath)) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
  return true;
}

function initializeHorizonStructure(vaultPath) {
  const vault = vaultStructureStatus(vaultPath);
  if (!vault.exists) throw new Error("Vault path was not found.");
  const touched = [];

  const files = [
    [
      path.join(vault.path, "HORIZON.md"),
      [
        "# Horizon OS Vault Guide",
        "",
        "This vault is the durable, human-readable memory layer for Horizon OS.",
        "",
        "## Navigation",
        "",
        "- Start at `00_Index.md`, then use the nearest folder `index.md`.",
        "- Prefer manifests in `00_System/manifests/` before opening full notes.",
        "- Keep raw captures in `Inbox/Captures/` and pending parse requests in `Runs/CaptureQueue/`.",
        "- Keep workflow and integration logs compact in `Runs/`.",
        "",
        "## Write Rules",
        "",
        "- Do not invent dates, facts, categories, or relationships.",
        "- Store dated items in `Calendar/Items/` using RCF.",
        "- Use small, targeted edits and preserve raw source material.",
        "- Update manifests after changing dynamic data that Horizon reads.",
      ],
    ],
    [
      path.join(vault.path, "00_System", "index.md"),
      [
        "# System",
        "",
        "Machine-readable manifests, schemas, and navigation notes for Horizon OS.",
        "",
        "- `manifests/` holds compact metadata used by the app.",
      ],
    ],
    [
      path.join(vault.path, "00_System", "manifests", "index.md"),
      [
        "# Manifests",
        "",
        "Compact metadata files for fast retrieval. Do not store full note bodies here.",
      ],
    ],
    [
      path.join(vault.path, "06_Integrations", "index.md"),
      [
        "# Integrations",
        "",
        "Configuration summaries and sync notes for Horizon OS integrations.",
        "",
        "- Keep secrets out of notes.",
        "- Store only summaries, status, and troubleshooting notes here.",
      ],
    ],
    [
      path.join(vault.path, "06_Integrations", "obsidian", "index.md"),
      ["# Obsidian", "", "Vault status, index rebuild notes, and Horizon structure checks."],
    ],
    [
      path.join(vault.path, "06_Integrations", "zotero", "index.md"),
      ["# Zotero", "", "Zotero configuration summary and sync notes. Do not store API keys here."],
    ],
  ];

  for (const [filePath, lines] of files) {
    if (ensureTextFile(filePath, lines)) touched.push(path.relative(vault.path, filePath).replace(/\\/g, "/"));
  }

  const manifests = rebuildVaultManifests(vault.path);
  touched.push(...manifests.filesTouched);
  writeIntegrationRunLog({
    actionId: "obsidian.initialize-horizon-structure",
    filesTouched: touched,
    inputsSummary: `Initialized structure at ${vault.path}.`,
    integrationId: "obsidian",
    outputsSummary: `Created or verified ${touched.length} files.`,
    status: "success",
  });

  return {
    connection: connectionForIntegration("obsidian"),
    filesTouched: touched,
    message: touched.length ? `Initialized ${touched.length} Horizon files.` : "Horizon structure was already initialized.",
    vault: vaultStructureStatus(vault.path),
  };
}

function classifyManifestType(relativePath) {
  if (relativePath.startsWith("Calendar/")) return "calendar";
  if (relativePath.startsWith("Inbox/Captures/")) return "capture";
  if (relativePath.startsWith("Inbox/")) return "inbox";
  if (relativePath.startsWith("Runs/")) return "workflow-run";
  if (relativePath.startsWith("06_Integrations/")) return "integration-log";
  if (relativePath.startsWith("00_System/")) return "system";
  return "note";
}

function listMarkdownMetadata(root, current = root, items = []) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "native-dist" || entry.name === "dist") {
      continue;
    }
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      listMarkdownMetadata(root, fullPath, items);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const stat = fs.statSync(fullPath);
    const relativePath = path.relative(root, fullPath).replace(/\\/g, "/");
    items.push({
      id: relativePath.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase(),
      path: relativePath,
      size: stat.size,
      status: relativePath.includes("/Archive/") ? "archived" : "active",
      summary: "",
      tags: [],
      type: classifyManifestType(relativePath),
      updated: stat.mtime.toISOString(),
    });
  }
  return items;
}

function rebuildVaultManifests(vaultPath = ROOT) {
  const root = path.resolve(vaultPath);
  if (!pathExistsDirectory(root)) throw new Error("Vault path was not found.");
  const manifestDir = path.join(root, "00_System", "manifests");
  fs.mkdirSync(manifestDir, { recursive: true });
  const generatedAt = nowIso();
  const notes = listMarkdownMetadata(root).sort((a, b) => a.path.localeCompare(b.path));
  const captures = notes.filter((item) => item.type === "capture");
  const projects = notes.filter((item) => item.path.includes("Project") || item.path.includes("Projects"));
  const workflows = notes.filter((item) => item.type === "workflow-run");
  const integrations = notes.filter((item) => item.type === "integration-log");
  const dashboard = {
    generated_at: generatedAt,
    items: [
      { id: "notes_count", label: "Indexed notes", value: notes.length },
      { id: "captures_count", label: "Captures", value: captures.length },
      { id: "workflow_runs_count", label: "Workflow runs", value: workflows.length },
      { id: "integrations_count", label: "Integration notes", value: integrations.length },
    ],
  };
  const manifests = {
    "captures.manifest.json": { generated_at: generatedAt, items: captures },
    "dashboard.manifest.json": dashboard,
    "integrations.manifest.json": { generated_at: generatedAt, items: integrations },
    "notes.manifest.json": { generated_at: generatedAt, items: notes },
    "projects.manifest.json": { generated_at: generatedAt, items: projects },
    "workflows.manifest.json": { generated_at: generatedAt, items: workflows },
  };
  const filesTouched = [];
  for (const [fileName, data] of Object.entries(manifests)) {
    const filePath = path.join(manifestDir, fileName);
    writeJson(filePath, data);
    filesTouched.push(path.relative(root, filePath).replace(/\\/g, "/"));
  }
  writeIntegrationRunLog({
    actionId: "obsidian.rebuild-indexes",
    filesTouched,
    inputsSummary: `Indexed ${notes.length} markdown files without reading note bodies.`,
    integrationId: "obsidian",
    outputsSummary: `Wrote ${filesTouched.length} manifests.`,
    status: "success",
  });
  return {
    filesTouched,
    generatedAt,
    itemCount: notes.length,
    manifestDir,
  };
}

function relaunchAndExit({ boot = false } = {}) {
  if (IS_PACKAGED_RUNTIME) {
    if (!fs.existsSync(HORIZON_NATIVE_APP_EXE) || !Number.isInteger(process.ppid) || process.ppid <= 0) {
      return false;
    }
    const plan = {
      args: boot ? ["--boot"] : [],
      executable: path.resolve(HORIZON_NATIVE_APP_EXE),
      helper: "detached-powershell",
      parentPid: process.ppid,
    };
    if (TEST_NATIVE_RELAUNCH_PLAN_PATH) {
      writeJson(TEST_NATIVE_RELAUNCH_PLAN_PATH, plan);
      return true;
    }
    if (process.platform !== "win32") return false;

    const argumentTail = plan.args.length
      ? ` -ArgumentList @(${plan.args.map((argument) => shellQuote(argument)).join(", ")})`
      : "";
    const command = [
      "$ErrorActionPreference = 'SilentlyContinue'",
      "Start-Sleep -Milliseconds 500",
      `Stop-Process -Id ${plan.parentPid} -Force -ErrorAction SilentlyContinue`,
      `for ($attempt = 0; $attempt -lt 60; $attempt += 1) { if (-not (Get-Process -Id ${plan.parentPid} -ErrorAction SilentlyContinue)) { break }; Start-Sleep -Milliseconds 100 }`,
      `Start-Process -FilePath ${shellQuote(plan.executable)}${argumentTail}`,
    ].join(" ; ");
    try {
      childProcess.spawn(
        POWERSHELL,
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-Command", command],
        { detached: true, stdio: "ignore", windowsHide: true },
      ).unref();
      setTimeout(() => process.exit(0), 750);
      return true;
    } catch {
      return false;
    }
  }

  if (!fs.existsSync(HORIZON_HIDDEN_RUNNER)) {
    return false;
  }

  const launcherArgs = ["launch.ps1"];
  if (boot) {
    launcherArgs.push("-ShowBoot");
    launcherArgs.push("-AutoRestartDelayMs");
    launcherArgs.push("1000");
  }
  childProcess.spawn(
    WSCRIPT_EXE,
    [HORIZON_HIDDEN_RUNNER, ...launcherArgs],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    },
  ).unref();
  setTimeout(() => process.exit(0), 750);
  return true;
}

// Rebuild the web bundle AND repackage native-dist (the app the taskbar launches) in a
// DETACHED process, then relaunch. It must be detached because native:pack:safe stops the
// running Horizon.exe to swap files — a child of this process would be killed mid-update.
// It runs against the source checkout (REPO_DASHBOARD_DIR), the only place with the toolchain.
function startDetachedRepack({ relaunch = true } = {}) {
  if (!fs.existsSync(REPO_PACK_SCRIPT)) {
    return false;
  }

  const relaunchTail =
    relaunch && fs.existsSync(REPO_HIDDEN_RUNNER) && fs.existsSync(WSCRIPT_EXE)
      ? ` ; if ($LASTEXITCODE -eq 0) { & ${shellQuote(WSCRIPT_EXE)} ${shellQuote(REPO_HIDDEN_RUNNER)} launch.ps1 -ShowBoot }`
      : "";
  const command = `Set-Location -LiteralPath ${shellQuote(REPO_DASHBOARD_DIR)} ; npm run native:pack:safe${relaunchTail}`;

  childProcess
    .spawn(
      POWERSHELL,
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-Command", command],
      { cwd: REPO_DASHBOARD_DIR, detached: true, stdio: "ignore", windowsHide: true },
    )
    .unref();
  return true;
}

async function applyUpdate() {
  const before = await updateSnapshot(true);
  if (before.updateMode === "installer") {
    return {
      ...before,
      message: before.updateAvailable
        ? "Download the current installer, close Horizon, then run it. Your workspace and connections stay in place."
        : before.message,
      restarting: false,
    };
  }
  if (!before.supported) return { ...before, restarting: false };
  if (before.fetchFailed) {
    return {
      ...before,
      message: "Update installation cannot start until Horizon can refresh the update source.",
      restarting: false,
    };
  }
  if (before.dirty) {
    return {
      ...before,
      message: "Local changes are present. Save or commit them before installing an update.",
      restarting: false,
    };
  }
  if (!before.updateAvailable) {
    return {
      ...before,
      message: "No updates found. Horizon OS is already up to date.",
      restarting: false,
    };
  }

  try {
    await git(["pull", "--ff-only"], { timeout: 180_000 });
    await execFile(NPM, ["install"], { cwd: REPO_DASHBOARD_DIR, timeout: 240_000 });
  } catch (error) {
    return {
      ...before,
      message: `Update install failed: ${error?.message ?? "unknown error"}`,
      restarting: false,
    };
  }

  // Repackage the native app in a detached helper. The previous inline path called
  // `native:pack`, a disabled guard-rail stub that always exits 1, so updates rebuilt
  // source but never regenerated native-dist — which is why the taskbar app stayed stale.
  const started = startDetachedRepack({ relaunch: true });
  if (!started) {
    return {
      ...before,
      message: "Update downloaded, but the packaging helper (Dashboard/scripts/pack-native.ps1) was not found. Run `npm run native:pack:safe` in Dashboard to finish.",
      restarting: false,
    };
  }

  const after = await updateSnapshot(false);
  return {
    ...after,
    message: "Update downloaded. Horizon is rebuilding and will restart shortly.",
    restarting: true,
  };
}

function startupSnapshot(message = "Startup setting loaded.") {
  const legacyEnabled = LEGACY_STARTUP_LAUNCH_SHORTCUTS.some((shortcutPath) => fs.existsSync(shortcutPath));
  return {
    launchAtStartup: fs.existsSync(STARTUP_LAUNCH_SHORTCUT) || legacyEnabled,
    message,
    path: STARTUP_LAUNCH_SHORTCUT,
    supported: process.platform === "win32",
  };
}

async function setLaunchAtStartup(enabled) {
  if (process.platform !== "win32") {
    return {
      launchAtStartup: false,
      message: "Startup launch is only wired on Windows right now.",
      path: STARTUP_LAUNCH_SHORTCUT,
      supported: false,
    };
  }

  fs.mkdirSync(STARTUP_DIR, { recursive: true });

  if (!enabled) {
    for (const shortcutPath of [STARTUP_LAUNCH_SHORTCUT, ...LEGACY_STARTUP_LAUNCH_SHORTCUTS]) {
      if (fs.existsSync(shortcutPath)) {
        fs.unlinkSync(shortcutPath);
      }
    }
    return startupSnapshot("Horizon will not open automatically at Windows sign-in.");
  }

  for (const shortcutPath of LEGACY_STARTUP_LAUNCH_SHORTCUTS) {
    if (fs.existsSync(shortcutPath)) {
      fs.unlinkSync(shortcutPath);
    }
  }

  const command = [
    "$shell = New-Object -ComObject WScript.Shell",
    `$shortcut = $shell.CreateShortcut(${shellQuote(STARTUP_LAUNCH_SHORTCUT)})`,
    fs.existsSync(HORIZON_NATIVE_APP_EXE)
      ? `$shortcut.TargetPath = ${shellQuote(HORIZON_NATIVE_APP_EXE)}`
      : `$shortcut.TargetPath = ${shellQuote(WSCRIPT_EXE)}`,
    fs.existsSync(HORIZON_NATIVE_APP_EXE)
      ? "$shortcut.Arguments = ''"
      : `$shortcut.Arguments = ${shellQuote(`"${HORIZON_HIDDEN_RUNNER}" "launch.ps1"`)}`,
    fs.existsSync(HORIZON_NATIVE_APP_EXE)
      ? `$shortcut.WorkingDirectory = ${shellQuote(path.dirname(HORIZON_NATIVE_APP_EXE))}`
      : `$shortcut.WorkingDirectory = ${shellQuote(ROOT)}`,
    `$shortcut.IconLocation = ${shellQuote(`${HORIZON_ICON},0`)}`,
    "$shortcut.Description = 'Launches Horizon at Windows sign-in.'",
    "$shortcut.Save()",
  ].join("; ");

  await execFile(
    POWERSHELL,
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    { cwd: ROOT, timeout: 15_000 },
  );

  return startupSnapshot("Horizon will open automatically at Windows sign-in.");
}

function unquoteYaml(value) {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed === "\"\"") return "";
  if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
    return trimmed.slice(1, -1).replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
  }
  return trimmed;
}

function quoteYaml(key, value) {
  const text = String(value || "").trim();
  if (!text) return `${key}:`;
  const plain = /^(date|time_start|time_end|importance|category|status)$/.test(key);
  if (plain && /^[A-Za-z0-9 _./-]+$/.test(text)) return `${key}: ${text}`;
  return `${key}: "${text.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

function parseItemContent(content) {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  if (lines[0] !== "---") throw new Error("Missing frontmatter");
  const end = lines.indexOf("---", 1);
  if (end < 0) throw new Error("Unclosed frontmatter");

  const fields = {};
  for (const line of lines.slice(1, end)) {
    const match = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (match) fields[match[1]] = unquoteYaml(match[2]);
  }
  for (const field of FIELD_ORDER) fields[field] = fields[field] || "";

  return {
    fields,
    body: lines.slice(end + 1).join("\n").replace(/^\n+/, ""),
  };
}

function buildItemContent(fields, body) {
  const frontmatter = FIELD_ORDER.map((field) => quoteYaml(field, fields[field]));
  return `---\n${frontmatter.join("\n")}\n---\n\n${String(body || "").replace(/^\n+/, "")}`;
}

function safeItemPath(id) {
  const fileName = path.basename(id);
  if (!fileName.endsWith(".md") || fileName === "index.md") throw new Error("Bad item id");
  const resolved = path.resolve(ITEMS_DIR, fileName);
  const itemsRoot = path.resolve(ITEMS_DIR);
  if (resolved !== itemsRoot && !resolved.startsWith(`${itemsRoot}${path.sep}`)) throw new Error("Bad item path");
  return resolved;
}

function parseIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function rangeEndFromBody(body, fallback) {
  const match = String(body || "").match(/^- RCF date used:\s*\d{4}-\d{2}-\d{2}\s+to\s+(\d{4}-\d{2}-\d{2})\s*$/m);
  return match ? match[1] : fallback;
}

function dateLabel(fields, body) {
  const match = String(body || "").match(/^- RCF date used:\s*(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})\s*$/m);
  if (match) return `${match[1]} to ${match[2]}`;
  return fields.date || "unknown";
}

function isOpenReminder(body) {
  return /^- Open reminder:\s*yes\s*$/im.test(String(body || ""));
}

function issueList(fields, body, todayIso = currentToday()) {
  const issues = [];
  const today = parseIsoDate(todayIso);
  const status = (fields.status || "").toLowerCase();
  const date = parseIsoDate(fields.date);
  const end = parseIsoDate(rangeEndFromBody(body, fields.date));

  if (status === "active" && (!fields.date || fields.date === "unknown") && !isOpenReminder(body)) {
    issues.push({ key: "date", label: "Date unknown" });
  }
  for (const field of ["importance", "category", "name", "action_needed", "status"]) {
    if (!fields[field]) issues.push({ key: field, label: `${field.replace("_", " ")} blank` });
  }
  if (/confirm the exact canvas/i.test(`${fields.action_needed}\n${body}`)) {
    issues.push({ key: "canvas", label: "Confirm in Canvas" });
  }
  if (today && date && end && end < today && status === "active") {
    issues.push({ key: "past", label: "Past active" });
  }
  return issues;
}

function itemFromFile(fileName, todayIso = currentToday()) {
  const filePath = safeItemPath(fileName);
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = parseItemContent(raw);
  const fields = parsed.fields;
  const date = parseIsoDate(fields.date);
  const endDate = parseIsoDate(rangeEndFromBody(parsed.body, fields.date));
  const today = parseIsoDate(todayIso);
  const sortDate = date ? fields.date : "9999-12-31";
  const days = date && today ? daysBetween(today, date) : null;
  return {
    id: fileName,
    fields,
    body: parsed.body,
    dateLabel: dateLabel(fields, parsed.body),
    issues: issueList(fields, parsed.body, todayIso),
    sortDate,
    endDate: endDate ? endDate.toISOString().slice(0, 10) : "",
    days,
  };
}

function listItems(todayIso = currentToday()) {
  return fs.readdirSync(ITEMS_DIR)
    .filter((name) => name.endsWith(".md") && name !== "index.md")
    .map((name) => itemFromFile(name, todayIso))
    .sort((a, b) => a.sortDate.localeCompare(b.sortDate) || a.fields.name.localeCompare(b.fields.name));
}

function saveItem(id, payload) {
  const filePath = safeItemPath(id);
  const current = parseItemContent(fs.readFileSync(filePath, "utf8"));
  const fields = { ...current.fields };
  for (const field of FIELD_ORDER) {
    if (Object.prototype.hasOwnProperty.call(payload.fields || {}, field)) {
      fields[field] = String(payload.fields[field] || "").trim();
    }
  }
  const body = Object.prototype.hasOwnProperty.call(payload, "body") ? String(payload.body || "") : current.body;
  fs.writeFileSync(filePath, buildItemContent(fields, body), "utf8");
  const items = listItems();
  writeNow(items);
  return items.find((item) => item.id === path.basename(id));
}

function writeNow(items) {
  const todayIso = currentToday();
  const today = parseIsoDate(todayIso);
  const upcoming = items
    .filter((item) => {
      const status = (item.fields.status || "").toLowerCase();
      if (status !== "active") return false;
      const date = parseIsoDate(item.fields.date);
      const end = parseIsoDate(item.endDate || item.fields.date);
      return date && end && today && end >= today;
    })
    .sort((a, b) => a.sortDate.localeCompare(b.sortDate) || a.fields.name.localeCompare(b.fields.name));

  const lines = [
    "# Now",
    "",
    `Upcoming and currently active dated calendar items from ${todayIso} onward.`,
    "",
    "## Next Items",
    "",
    ...upcoming.slice(0, 20).map((item) => {
      const link = `[[Items/${item.id.replace(/\.md$/, "")}|${item.fields.name}]]`;
      return `- ${item.dateLabel} - ${link} - ${item.fields.action_needed}`;
    }),
    "",
    "## Notes",
    "",
    `- Showing first ${Math.min(20, upcoming.length)} of ${upcoming.length} active dated or currently active range items.`,
    `- ${items.filter((item) => item.fields.date === "unknown" && (item.fields.status || "").toLowerCase() === "active").length} active items currently use \`date: unknown\`; keep those out of this view until they get real dates.`,
    "- This page was regenerated by the dashboard.",
    "",
  ];
  fs.writeFileSync(NOW_PATH, lines.join("\n"), "utf8");
}

function safeSlug(value) {
  const slug = String(value || "capture")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "capture";
}

function captureStamp() {
  return new Date().toISOString().replace(/:/g, "-").replace(/\.\d{3}Z$/, "Z");
}

function uniqueFilePath(filePath) {
  if (!fs.existsSync(filePath)) return filePath;
  const parsed = path.parse(filePath);
  for (let index = 2; index < 1000; index += 1) {
    const candidate = path.join(parsed.dir, `${parsed.name}-${index}${parsed.ext}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`Could not create a unique file path for ${filePath}`);
}

function vaultRelative(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, "/");
}

function captureTitleFromText(text) {
  return String(text || "").split(/\r?\n/)[0].slice(0, 72) || "Capture";
}

function ensureIncomingCaptureQueue() {
  fs.mkdirSync(INCOMING_CAPTURE_DIR, { recursive: true });
  if (!fs.existsSync(INCOMING_CAPTURE_INDEX)) {
    fs.writeFileSync(
      INCOMING_CAPTURE_INDEX,
      [
        "# To Triage",
        "",
        "Drop quick notes here from Obsidian mobile or any synced device.",
        "",
        "Horizon reads each markdown file in this folder as one capture queue entry.",
        "",
        "## Workflow",
        "",
        "1. Capture quickly on any device.",
        "2. Let Obsidian Sync bring the note to this vault.",
        "3. Open Horizon on desktop and send each note through Capture triage.",
        "4. Move, rename, or delete the original note only after it has been handled.",
        "",
      ].join("\n"),
      "utf8",
    );
  }
}

function stripFrontmatter(content) {
  const text = String(content || "").replace(/\r\n/g, "\n");
  if (!text.startsWith("---\n")) return text.trim();
  const end = text.indexOf("\n---", 4);
  if (end < 0) return text.trim();
  return text.slice(end + 4).trim();
}

function titleFromIncomingCapture(fileName, content) {
  const body = stripFrontmatter(content);
  const heading = body.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim();
  if (heading) return heading.slice(0, 90);

  const firstLine = body
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#"));
  if (firstLine) return firstLine.slice(0, 90);

  return path.basename(fileName, ".md").replace(/[-_]+/g, " ").slice(0, 90) || "Untitled capture";
}

function previewFromIncomingCapture(content) {
  const body = stripFrontmatter(content)
    .replace(/^#\s+.+$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return body.slice(0, 180);
}

function meaningfulIncomingCaptureText(fileName, content) {
  return stripFrontmatter(content)
    .replace(/^#\s*(untitled|new note|blank)?\s*$/gim, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^\s*[-*]\s*$/gm, "")
    .trim();
}

function emptyIncomingCaptureReason(fileName, content) {
  const meaningful = meaningfulIncomingCaptureText(fileName, content);
  if (meaningful.length === 0) return "This file is empty.";
  if (/^(untitled|new note|blank)$/i.test(meaningful)) return "This looks like a placeholder note.";
  return "";
}

function safeIncomingCapturePath(id) {
  const fileName = path.basename(String(id || ""));
  if (!fileName.endsWith(".md") || fileName.toLowerCase() === "index.md") {
    throw new Error("Bad capture queue file.");
  }

  const resolved = path.resolve(INCOMING_CAPTURE_DIR, fileName);
  const root = path.resolve(INCOMING_CAPTURE_DIR);
  if (resolved === root || !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Bad capture queue path.");
  }
  return resolved;
}

function listIncomingCaptureQueue() {
  ensureIncomingCaptureQueue();

  const items = fs.readdirSync(INCOMING_CAPTURE_DIR)
    .filter((name) => name.endsWith(".md") && name.toLowerCase() !== "index.md")
    .map((name) => {
      const filePath = path.join(INCOMING_CAPTURE_DIR, name);
      const stat = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, "utf8");
      const body = stripFrontmatter(content);
      const emptyReason = emptyIncomingCaptureReason(name, content);
      return {
        content: body,
        createdAt: stat.birthtime.toISOString(),
        emptyLike: Boolean(emptyReason),
        emptyReason,
        id: name,
        path: vaultRelative(filePath),
        preview: previewFromIncomingCapture(content),
        title: titleFromIncomingCapture(name, content),
        updatedAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.title.localeCompare(b.title));

  return {
    count: items.length,
    folder: vaultRelative(INCOMING_CAPTURE_DIR),
    items,
    ok: true,
  };
}

function deleteIncomingCaptureQueueFile(id) {
  ensureIncomingCaptureQueue();
  const filePath = safeIncomingCapturePath(id);
  if (!fs.existsSync(filePath)) {
    return {
      deleted: false,
      id: path.basename(String(id || "")),
      message: "That queue file was already gone.",
      ok: true,
      state: "missing",
    };
  }

  const fileName = path.basename(filePath);
  fs.unlinkSync(filePath);
  return {
    deleted: true,
    id: fileName,
    message: "Deleted empty capture file.",
    ok: true,
    state: "deleted",
  };
}

// ---- Read and resolve the unhandled capture pile -------------------------------------
// The "pile" the owner sweeps has two real sources, both unhandled captures:
//   to_triage: Inbox/To Triage/*.md   - phone/synced notes dropped by Obsidian Sync
//              (already enumerated by listIncomingCaptureQueue; the body IS the text).
//   queue:     Runs/CaptureQueue/*.md  - pending app-capture parse requests
//              (status: pending); the raw text lives in the linked Inbox/Captures/ packet.
// Enumeration is READ-ONLY. Applying reuses POST /api/capture/apply UNCHANGED (see
// applyCaptureAction). Source cleanup happens one item at a time via resolveCapturePileItem
// - never a bulk delete. Kept in server.cjs (not extracted) because it reuses many
// existing capture helpers (listIncomingCaptureQueue, deleteIncomingCaptureQueueFile,
// stripFrontmatter, readMarkdownFrontmatter, ensureCaptureQueue, vaultRelative).

// Pull the "## Raw Capture" body out of an Inbox/Captures/*.md packet linked from a queue
// request. Returns "" if the path is unsafe/missing so the item degrades to blank.
function rawCaptureTextFromPacket(relCapturePath) {
  const rel = normalizeVaultRelativePath(relCapturePath);
  if (!rel || !rel.startsWith("Inbox/Captures/")) return "";
  const abs = path.resolve(ROOT, ...rel.split("/"));
  const root = path.resolve(ROOT);
  if (abs !== root && !abs.startsWith(`${root}${path.sep}`)) return "";
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return "";
  const content = fs.readFileSync(abs, "utf8").replace(/\r\n/g, "\n");
  const marker = content.indexOf("## Raw Capture");
  if (marker < 0) return stripFrontmatter(content);
  const after = content.slice(marker + "## Raw Capture".length);
  const next = after.indexOf("\n## ");
  return (next < 0 ? after : after.slice(0, next)).trim();
}

function safeCaptureQueuePath(id) {
  const fileName = path.basename(String(id || ""));
  if (!fileName.endsWith(".md") || fileName.toLowerCase() === "index.md") {
    throw new Error("Bad capture queue file.");
  }
  const resolved = path.resolve(CAPTURE_QUEUE_DIR, fileName);
  const root = path.resolve(CAPTURE_QUEUE_DIR);
  if (resolved === root || !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Bad capture queue path.");
  }
  return resolved;
}

// ~500-char single-line preview, headings stripped (mirrors previewFromIncomingCapture,
// just a longer cap for the sweep row).
function pilePreview(text) {
  return String(text || "")
    .replace(/^#\s+.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function pileTitleFromText(text, fallbackName) {
  const line = String(text || "")
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry && !entry.startsWith("#"));
  if (line) return line.slice(0, 90);
  return path.basename(String(fallbackName || ""), ".md").replace(/[-_]+/g, " ").slice(0, 90) || "Untitled capture";
}

function listPendingCaptureQueue() {
  ensureCaptureQueue();
  return fs
    .readdirSync(CAPTURE_QUEUE_DIR)
    .filter((name) => name.endsWith(".md") && name.toLowerCase() !== "index.md")
    .map((name) => {
      const filePath = path.join(CAPTURE_QUEUE_DIR, name);
      const stat = fs.statSync(filePath);
      const fields = readMarkdownFrontmatter(fs.readFileSync(filePath, "utf8"));
      const text = rawCaptureTextFromPacket(fields.capture || "");
      return { fields, filePath, name, stat, text };
    })
    .filter((entry) => (entry.fields.status || "pending").toLowerCase() === "pending")
    .map((entry) => {
      const meaningful = entry.text.replace(/^#\s*(capture|untitled|new note|blank)?\s*$/gim, "").trim();
      const blankReason = meaningful ? "" : "This capture packet has no readable text.";
      return {
        blank: Boolean(blankReason),
        blankReason,
        id: entry.name,
        modified: entry.stat.mtime.toISOString(),
        path: vaultRelative(entry.filePath),
        source: "queue",
        text: entry.text,
        textPreview: pilePreview(entry.text),
        title: pileTitleFromText(entry.text, entry.name),
      };
    })
    .sort((a, b) => b.modified.localeCompare(a.modified));
}

function listCapturePile() {
  const toTriage = listIncomingCaptureQueue().items.map((item) => ({
    blank: item.emptyLike,
    blankReason: item.emptyReason,
    id: item.id,
    modified: item.updatedAt,
    path: item.path,
    source: "to_triage",
    text: item.content,
    textPreview: pilePreview(item.content),
    title: item.title,
  }));
  const queue = listPendingCaptureQueue();
  const items = [...toTriage, ...queue].sort((a, b) => String(b.modified).localeCompare(String(a.modified)));
  return {
    counts: { queue: queue.length, toTriage: toTriage.length, total: items.length },
    folders: { queue: vaultRelative(CAPTURE_QUEUE_DIR), toTriage: vaultRelative(INCOMING_CAPTURE_DIR) },
    items,
    ok: true,
  };
}

// Look up one pile item's text so the client can trigger triage/apply without re-sending
// the whole body (or to validate an id it does hold).
function capturePileItemText({ id, source }) {
  const wantedId = String(id || "").trim();
  if (!wantedId) return "";
  const list = source === "queue" ? listPendingCaptureQueue() : listCapturePile().items;
  const match = list.find((item) => item.id === wantedId && (!source || item.source === source));
  return match ? match.text : "";
}

// Mark a Runs/CaptureQueue/ request handled: flip status pending -> done and check its
// index line. Idempotent (missing file returns ok). NEVER deletes the file - it's the
// historical parse record; only To-Triage source files are deleted (by their own helper).
function markCaptureQueueRequestDone(id) {
  ensureCaptureQueue();
  const filePath = safeCaptureQueuePath(id);
  const fileName = path.basename(filePath);
  if (!fs.existsSync(filePath)) {
    return { done: false, id: fileName, message: "That queue request was already gone.", ok: true, state: "missing" };
  }
  const content = fs.readFileSync(filePath, "utf8");
  fs.writeFileSync(filePath, content.replace(/^status:\s*pending\s*$/im, "status: done"), "utf8");

  if (fs.existsSync(CAPTURE_QUEUE_INDEX)) {
    const base = fileName.replace(/\.md$/, "");
    const lines = fs.readFileSync(CAPTURE_QUEUE_INDEX, "utf8").split(/\r?\n/);
    const patched = lines.map((line) =>
      line.includes("- [ ]") && (line.includes(`[[${base}|`) || line.includes(`[[${base}]]`))
        ? line.replace("- [ ]", "- [x]")
        : line,
    );
    fs.writeFileSync(CAPTURE_QUEUE_INDEX, patched.join("\n"), "utf8");
  }
  return { done: true, id: fileName, message: "Marked capture queue request done.", ok: true, state: "done" };
}

// One-item source cleanup for the sweep. "applied": the source is now redundant (its
// content was written elsewhere by /api/capture/apply) so remove/mark it; "delete_blank":
// same, gated by the client to blank items (mirrors the existing red Delete); "skip":
// nothing changes. Only ever touches the single named file.
function resolveCapturePileItem(payload) {
  const id = String(payload?.id || "").trim();
  const source = String(payload?.source || "").trim();
  const disposition = String(payload?.disposition || "").trim();
  if (!id) return { ok: false, message: "Item id is required.", state: "missing_id" };
  if (!["applied", "skip", "delete_blank"].includes(disposition)) {
    return { ok: false, message: `Unknown disposition: ${disposition}.`, state: "bad_disposition" };
  }
  if (disposition === "skip") {
    return { disposition, id, ok: true, message: "Left this capture untouched.", source, state: "skipped" };
  }

  if (source === "to_triage") {
    return { ...deleteIncomingCaptureQueueFile(id), disposition, source };
  }
  if (source === "queue") {
    return { ...markCaptureQueueRequestDone(id), disposition, source };
  }
  return { ok: false, message: `Unknown pile source: ${source}.`, state: "bad_source" };
}

function ensureCaptureQueue() {
  fs.mkdirSync(CAPTURES_DIR, { recursive: true });
  fs.mkdirSync(CAPTURE_QUEUE_DIR, { recursive: true });
  if (!fs.existsSync(CAPTURE_QUEUE_INDEX)) {
    fs.writeFileSync(
      CAPTURE_QUEUE_INDEX,
      [
        "# Capture Queue",
        "",
        "Captures waiting for Codex parsing live here.",
        "",
        "## Workflow",
        "",
        "For each pending capture:",
        "",
        "1. Read the capture packet.",
        "2. Use `$horizon-capture-triage` to classify the capture into safe proposed actions.",
        "3. Decide whether it belongs in Calendar, Inbox, Runs, or another existing folder.",
        "4. If it has a date, create or update an RCF item in `Calendar/Items/`.",
        "5. If it is only reference context, keep it in Inbox or mark the capture handled.",
        "6. Never invent unknown dates or facts.",
        "",
        "## Pending",
        "",
      ].join("\n"),
      "utf8",
    );
  }
}

function writeCapturePacket(payload, options = {}) {
  const text = String(payload.text || "").trim();
  const kind = safeSlug(payload.kind || options.kind || "capture");
  const status = String(payload.status || options.status || "pending_codex")
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .slice(0, 48) || "pending_codex";
  const queue = options.queue !== false;
  if (!text) throw new Error("Capture text is required");
  ensureCaptureQueue();

  const stamp = captureStamp();
  const title = captureTitleFromText(text);
  const fileName = `${stamp}__${kind}__${safeSlug(title)}.md`;
  const capturePath = uniqueFilePath(path.join(CAPTURES_DIR, fileName));
  const writtenCaptureName = path.basename(capturePath);
  const queuePath = path.join(CAPTURE_QUEUE_DIR, fileName);
  const writtenQueuePath = uniqueFilePath(queuePath);
  const writtenQueueName = path.basename(writtenQueuePath);
  const relCapture = `Inbox/Captures/${writtenCaptureName}`;
  const relQueue = `Runs/CaptureQueue/${writtenQueueName}`;

  const captureBody = [
    "---",
    `captured_at: ${stamp}`,
    `kind: ${kind}`,
    `status: ${status}`,
    "---",
    "",
    `# ${title}`,
    "",
    "## Raw Capture",
    text,
    "",
    "## Codex Parsing Request",
    "Use `$horizon-capture-triage` to parse this capture and decide where it belongs in the Horizon workspace.",
    "",
    "- If it has a date, create or update an RCF file in `Calendar/Items/`.",
    "- If it is a general note, keep or move it inside `Inbox/` unless a better existing folder applies.",
    "- If information is missing, use `unknown` instead of guessing.",
    "- Preserve the user's wording where useful.",
    "",
  ].join("\n");

  fs.writeFileSync(capturePath, captureBody, "utf8");

  const result = {
    status: queue ? "queued_for_codex" : status,
    capture: relCapture,
    title,
  };

  if (queue) {
    const queueBody = [
      "---",
      `created_at: ${stamp}`,
      `capture: ${relCapture}`,
      "status: pending",
      "---",
      "",
      `# Codex Capture Parse: ${title}`,
      "",
      "## Source",
      `- ${relCapture}`,
      "",
      "## Task",
      "Read the linked capture, use `$horizon-capture-triage`, and sort/save it into the vault using existing conventions.",
      "",
      "## Required Output",
      "- Update the relevant vault file(s).",
      "- Mark this queue file `status: done` once handled.",
      "- Add a short note explaining what changed.",
      "",
    ].join("\n");

    fs.writeFileSync(writtenQueuePath, queueBody, "utf8");
    fs.appendFileSync(CAPTURE_QUEUE_INDEX, `- [ ] [[${writtenQueueName.replace(/\.md$/, "")}|${title}]] - ${stamp}\n`, "utf8");
    result.queue = relQueue;
  }

  return result;
}

function createCapture(payload) {
  return writeCapturePacket({ ...payload, status: "pending_codex" }, { kind: payload.kind || "note", queue: true });
}

// CAPTURE_TRIAGE_ACTION_TYPES comes from server/captureActions.cjs.
const CAPTURE_TRIAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "confidence", "needs_input", "actions", "questions"],
  properties: {
    summary: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    needs_input: { type: "boolean" },
    questions: {
      type: "array",
      items: { type: "string" },
    },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "label", "type", "confidence", "reason", "requires_approval", "payload"],
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          type: { type: "string", enum: CAPTURE_TRIAGE_ACTION_TYPES },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          reason: { type: "string" },
          requires_approval: { type: "boolean" },
          payload: {
            type: "object",
            additionalProperties: false,
            required: [
              "title",
              "body",
              "date",
              "time_start",
              "time_end",
              "importance",
              "category",
              "action_needed",
              "destination",
              "source",
              "url",
              "doi",
              "authors",
              "publication_title",
              "zotero_item_type",
              "project",
              "note_path",
              "email_to",
              "email_subject",
              "connections",
            ],
            properties: {
              title: { type: "string" },
              body: { type: "string" },
              date: { type: "string" },
              time_start: { type: "string" },
              time_end: { type: "string" },
              importance: { type: "string" },
              category: { type: "string" },
              action_needed: { type: "string" },
              destination: { type: "string" },
              source: { type: "string" },
              url: { type: "string" },
              doi: { type: "string" },
              authors: { type: "string" },
              publication_title: { type: "string" },
              zotero_item_type: { type: "string" },
              project: { type: "string" },
              note_path: { type: "string" },
              email_to: { type: "string" },
              email_subject: { type: "string" },
              connections: { type: "string" },
            },
          },
        },
      },
    },
  },
};

function openAiTextFromResponse(response) {
  if (typeof response.output_text === "string") return response.output_text;
  for (const output of response.output || []) {
    for (const content of output.content || []) {
      if (typeof content.text === "string") return content.text;
    }
  }
  return "";
}

function normalizeCaptureDestination(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const normalizedRaw = raw.replace(/\\/g, "/").replace(/\/+$/, "");
  const normalizedRoot = ROOT.replace(/\\/g, "/").replace(/\/+$/, "");

  if (normalizedRaw.toLowerCase() === normalizedRoot.toLowerCase()) return "Inbox";
  if (normalizedRaw.toLowerCase().startsWith(`${normalizedRoot.toLowerCase()}/`)) {
    const relative = normalizedRaw.slice(normalizedRoot.length + 1);
    return relative || "Inbox";
  }

  return raw;
}

function semanticConnectionTargets() {
  const paths = [
    ...listProjectRegistry().map((project) => project.path),
    ...listVaultResearchPapers().map((paper) => paper.path),
    ...listResearchIdeas().map((idea) => idea.path),
  ];
  return [...new Set(paths.map((entry) => String(entry || "").replace(/\\/g, "/").replace(/\.md$/i, "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function normalizeConnectionInput(value) {
  const catalog = semanticConnectionTargets();
  if (!catalog.length) return "";

  const aliases = new Map();
  const ambiguous = new Set();
  for (const target of catalog) {
    aliases.set(target.toLowerCase(), target);
    const base = path.posix.basename(target).toLowerCase();
    if (aliases.has(base) && aliases.get(base) !== target) ambiguous.add(base);
    else aliases.set(base, target);
  }
  ambiguous.forEach((key) => aliases.delete(key));

  const raw = String(value || "");
  const candidates = [
    ...Array.from(raw.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g), (match) => match[1]),
    ...raw.split(/\r?\n|,\s*/g),
  ];
  const accepted = [];
  for (const candidate of candidates) {
    const normalized = String(candidate || "")
      .trim()
      .replace(/^\[\[/, "")
      .replace(/\]\]$/, "")
      .split("|")[0]
      .split("#")[0]
      .replace(/\\/g, "/")
      .replace(/\.md$/i, "")
      .trim();
    const target = aliases.get(normalized.toLowerCase());
    if (target && !accepted.includes(target)) accepted.push(target);
    if (accepted.length === 3) break;
  }
  return accepted.join("\n");
}

const CONNECTION_ACTION_TYPES = new Set(["save_note", "create_project", "save_research", "save_research_idea"]);

function normalizeActionConnections(action, sourceText = "") {
  if (!action || !CONNECTION_ACTION_TYPES.has(action.type)) return action;
  const payload = { ...(action.payload || {}) };
  const connections = normalizeConnectionInput(`${payload.connections || ""}\n${sourceText || ""}`);
  return { ...action, payload: { ...payload, connections } };
}

function normalizeCaptureTriageResult(result) {
  const actions = Array.isArray(result.actions) ? result.actions.slice(0, 5) : [];
  return {
    summary: String(result.summary || "Capture parsed.").slice(0, 240),
    confidence: ["high", "medium", "low"].includes(result.confidence) ? result.confidence : "low",
    needs_input: Boolean(result.needs_input),
    actions: actions.map((action, index) => ({
      id: safeSlug(action.id || action.label || `action-${index + 1}`),
      label: String(action.label || "Review").slice(0, 48),
      type: CAPTURE_TRIAGE_ACTION_TYPES.includes(action.type) ? action.type : "queue_review",
      confidence: ["high", "medium", "low"].includes(action.confidence) ? action.confidence : "low",
      reason: String(action.reason || "").slice(0, 240),
      requires_approval: action.requires_approval !== false,
      payload: {
        title: String(action.payload?.title || ""),
        body: String(action.payload?.body || ""),
        date: String(action.payload?.date || ""),
        time_start: String(action.payload?.time_start || ""),
        time_end: String(action.payload?.time_end || ""),
        importance: String(action.payload?.importance || ""),
        category: String(action.payload?.category || ""),
        action_needed: String(action.payload?.action_needed || ""),
        destination: normalizeCaptureDestination(action.payload?.destination),
        source: String(action.payload?.source || ""),
        url: String(action.payload?.url || ""),
        doi: String(action.payload?.doi || ""),
        authors: String(action.payload?.authors || ""),
        publication_title: String(action.payload?.publication_title || ""),
        zotero_item_type: String(action.payload?.zotero_item_type || ""),
        project: String(action.payload?.project || ""),
        note_path: String(action.payload?.note_path || ""),
        email_to: String(action.payload?.email_to || ""),
        email_subject: String(action.payload?.email_subject || ""),
        connections: normalizeConnectionInput(action.payload?.connections),
      },
    })),
    questions: (Array.isArray(result.questions) ? result.questions : []).map((question) => String(question)).filter(Boolean).slice(0, 3),
  };
}

async function triageCaptureWithAi(payload) {
  const text = String(payload.text || "").trim();
  if (!text) {
    return { ok: false, message: "Capture text is required.", state: "missing_text" };
  }

  const settings = mergedIntegrationSettings("ai-agent");
  const zoteroSettings = mergedIntegrationSettings("zotero");
  const zoteroConfigured = Boolean(
    String(zoteroSettings.zoteroUserId || "").trim()
    && String(zoteroSettings.zoteroApiKey || "").trim()
    && zoteroSettings.zoteroAccess?.write === true,
  );
  const provider = String(settings.provider || "OpenAI").trim().toLowerCase();
  const apiKey = String(settings.tokenOrKey || "").trim();
  const model = String(settings.model || DEFAULT_AI_AGENT_MODEL).trim() || DEFAULT_AI_AGENT_MODEL;
  const connectionTargets = semanticConnectionTargets();

  if (!apiKey) {
    return { ok: false, message: "AI Agent API key is not configured.", state: "api_key_required" };
  }

  const aiConnection = connectionForIntegration("ai-agent");
  if (aiConnection.status !== "connected") {
    return {
      ok: false,
      message: `AI Agent is not verified (${aiConnection.statusLabel}). Reconnect OpenAI in Settings > Integrations before assisted Capture triage.`,
      state: aiConnection.status,
    };
  }

  if (provider !== "openai") {
    return { ok: false, message: `AI provider ${settings.provider || provider} is not supported for live Capture triage yet.`, state: "provider_not_supported" };
  }

  const systemPrompt = [
    "You are Horizon Capture Triage.",
    "Turn one raw capture into safe, deterministic next-action buttons for Horizon OS.",
    "Follow the $horizon-capture-triage contract: local-first, approve-before-act, no invented dates/times/facts.",
    "Use unknown or an empty string for missing fields.",
    // Per-action guidance comes from the registry so new actions teach the AI
    // automatically. The zotero hint is config-dependent: registry supplies the
    // configured variant; the unconfigured replacement is state, so it lives here.
    ...captureTriageHints({ zoteroConfigured }),
    connectionTargets.length
      ? `For payload.connections, use at most three newline-separated exact targets from this existing-note allowlist: ${connectionTargets.join("; ")}. Leave it empty when no connection is clearly useful.`
      : "No semantic connection targets currently exist, so leave payload.connections empty.",
    ...(zoteroConfigured
      ? []
      : ["Zotero is not connected with write access. Do not include add_to_zotero actions; use save_note, queue_review, or ask_clarification instead."]),
    "Prefer 1-3 useful actions. Add ask_clarification only when missing information blocks useful progress.",
    `Current date is ${currentToday()}; timezone is ${APP_TIME_ZONE}.`,
  ].join(" ");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      max_output_tokens: 1100,
      store: false,
      text: {
        format: {
          type: "json_schema",
          name: "horizon_capture_triage",
          strict: true,
          schema: CAPTURE_TRIAGE_SCHEMA,
        },
      },
    }),
  });

  const body = await response.text();
  let data = null;
  try {
    data = body ? JSON.parse(body) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = data?.error?.message || body || "OpenAI request failed.";
    writeIntegrationRunLog({
      actionId: "ai-agent.capture-triage",
      errors: [message],
      integrationId: "ai-agent",
      inputsSummary: `Capture triage failed for ${text.length} characters.`,
      outputsSummary: message,
      status: "failed",
    });
    return { ok: false, message, state: "ai_request_failed" };
  }

  let parsed = data?.output_parsed || null;
  if (!parsed) {
    const outputText = openAiTextFromResponse(data || {});
    parsed = outputText ? JSON.parse(outputText) : null;
  }

  const triage = normalizeCaptureTriageResult(parsed || {});
  writeIntegrationRunLog({
    actionId: "ai-agent.capture-triage",
    integrationId: "ai-agent",
    inputsSummary: `Triaged ${text.length} capture characters with ${model}.`,
    outputsSummary: `${triage.actions.length} suggested action(s), confidence ${triage.confidence}.`,
    status: "success",
  });

  return {
    ok: true,
    message: "Capture triaged.",
    model,
    state: "triaged",
    triage,
  };
}

function normalizeCaptureAction(action, sourceText = "") {
  const normalized = normalizeCaptureTriageResult({
    actions: [action || {}],
    confidence: action?.confidence || "low",
    needs_input: false,
    questions: [],
    summary: action?.reason || "Capture action selected.",
  }).actions[0];
  return applyCourseworkDeadlineDefault(normalizeActionConnections(normalized, sourceText), sourceText);
}

// ── Heuristics-first triage orchestrator ───────────────────────────────────────────────
// Runs the deterministic local heuristics ALWAYS, then the AI (when configured) to refine,
// then merges. Result: the pile shows useful buttons instantly even with no AI key, and
// the AI enriches rather than gatekeeps. This replaces the raw triageCaptureWithAi call at
// both triage routes; triageCaptureWithAi itself is unchanged (still the AI path).
const TRIAGE_CONFIDENCE_RANK = { high: 2, medium: 1, low: 0 };

function normalizeTriageActionsWithSource(rawActions, source) {
  return normalizeCaptureTriageResult({ actions: rawActions }).actions.map((action) => ({ ...action, source }));
}

// Dedupe by action type. AI entries are the base (richer payloads); a matching heuristic
// lifts the confidence floor but never demotes or drops it — a high-confidence heuristic
// calendar action always survives. Heuristic-only types are appended. Sorted high→low.
function mergeTriageActions(heuristicList, aiList) {
  const byType = new Map();
  for (const action of aiList) byType.set(action.type, action);
  for (const heuristic of heuristicList) {
    const existing = byType.get(heuristic.type);
    if (!existing) {
      byType.set(heuristic.type, heuristic);
    } else {
      const confidence =
        TRIAGE_CONFIDENCE_RANK[heuristic.confidence] > TRIAGE_CONFIDENCE_RANK[existing.confidence]
          ? heuristic.confidence
          : existing.confidence;
      byType.set(heuristic.type, { ...existing, confidence });
    }
  }
  return [...byType.values()].sort(
    (a, b) => TRIAGE_CONFIDENCE_RANK[b.confidence] - TRIAGE_CONFIDENCE_RANK[a.confidence],
  );
}

async function triageCapture(payload) {
  const text = String(payload.text || "").trim();
  if (!text) return { ok: false, message: "Capture text is required.", state: "missing_text" };

  const heuristic = normalizeTriageActionsWithSource(
    heuristicActions(text, { today: currentToday(), hasAction: (id) => captureActionById(id).id === id }),
    "heuristic",
  );

  let aiActions = [];
  let aiSummary = "";
  let aiQuestions = [];
  let aiNeedsInput = false;
  let model;
  let aiState = "disabled";
  if (process.env.RSB_DISABLE_AI !== "1" && payload.allowAi === true) {
    const ai = await triageCaptureWithAi(payload);
    if (ai.ok) {
      aiActions = (ai.triage.actions || []).map((action) => ({ ...action, source: "ai" }));
      aiSummary = ai.triage.summary || "";
      aiQuestions = ai.triage.questions || [];
      aiNeedsInput = Boolean(ai.triage.needs_input);
      model = ai.model;
      aiState = "triaged";
    } else {
      aiState = ai.state || "ai_unavailable";
    }
  }

  let actions = mergeTriageActions(heuristic, aiActions).map((action) =>
    applyCourseworkDeadlineDefault(normalizeActionConnections(action, text), text),
  );
  let needsInput = aiNeedsInput;
  if (!actions.length) {
    // Nothing fired locally and no AI actions — keep the capture safe/actionable with a
    // queue_review button instead of a dead end.
    actions = normalizeTriageActionsWithSource(
      [{ type: "queue_review", label: "Queue for review", confidence: "low", reason: "No obvious action detected locally; hold this for manual review.", payload: {} }],
      "heuristic",
    );
    needsInput = true;
  }

  const confidence = actions.reduce(
    (max, action) => (TRIAGE_CONFIDENCE_RANK[action.confidence] > TRIAGE_CONFIDENCE_RANK[max] ? action.confidence : max),
    "low",
  );
  const heuristicCount = actions.filter((action) => action.source === "heuristic").length;
  const summary =
    aiSummary ||
    (heuristicCount
      ? `${heuristicCount} instant suggestion${heuristicCount === 1 ? "" : "s"} from local heuristics${aiState === "triaged" ? "" : " (AI triage not used)"}.`
      : "No obvious local action; queued for review.");

  return {
    ok: true,
    state: "triaged",
    model,
    aiState,
    triage: { summary, confidence, needs_input: needsInput, actions, questions: aiQuestions.slice(0, 3) },
  };
}

function normalizedImportance(value) {
  const importance = String(value || "").trim().toLowerCase();
  return ["high", "medium", "low"].includes(importance) ? importance : "medium";
}

function normalizedRcfDate(value) {
  const date = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "unknown";
}

function normalizedRcfTime(value) {
  const time = String(value || "").trim();
  return /^\d{2}:\d{2}$/.test(time) ? time : "";
}

function rcfItemFileName(fields) {
  const date = normalizedRcfDate(fields.date);
  const time = normalizedRcfTime(fields.time_start).replace(":", "");
  const category = safeSlug(fields.category || "other");
  const title = safeSlug(fields.name || "capture");
  return `${date}${time ? `__${time}` : ""}__${category}__${title}.md`;
}

// captureActionPlan comes from server/captureActions.cjs.

function writeInboxNote(title, sections, prefix = "capture") {
  fs.mkdirSync(path.join(ROOT, "Inbox"), { recursive: true });
  const stamp = captureStamp();
  const notePath = uniqueFilePath(path.join(ROOT, "Inbox", `${stamp}__${safeSlug(prefix)}__${safeSlug(title)}.md`));
  const body = [
    `# ${title}`,
    "",
    ...sections.flatMap((section) => [section.heading, "", ...section.lines, ""]),
  ].join("\n");
  fs.writeFileSync(notePath, body, "utf8");
  return vaultRelative(notePath);
}

function appendBehaviorRule(title, lines) {
  fs.mkdirSync(HORIZON_LOCAL_DIR, { recursive: true });
  const behaviorPath = path.join(HORIZON_LOCAL_DIR, "behavior-rules.md");
  if (!fs.existsSync(behaviorPath)) {
    fs.writeFileSync(behaviorPath, "# Horizon Behavior Rules\n\nReusable preferences captured from Horizon Capture.\n\n", "utf8");
  }
  fs.appendFileSync(
    behaviorPath,
    [`## ${title}`, "", ...lines, "", `- Captured at: ${nowIso()}`, ""].join("\n"),
    "utf8",
  );
  return vaultRelative(behaviorPath);
}

function applyCalendarCaptureAction(action, capture) {
  fs.mkdirSync(ITEMS_DIR, { recursive: true });
  const payload = action.payload || {};
  const fields = {
    date: normalizedRcfDate(payload.date),
    time_start: normalizedRcfTime(payload.time_start),
    time_end: normalizedRcfTime(payload.time_end),
    importance: normalizedImportance(payload.importance),
    category: String(payload.category || payload.destination || payload.project || "Other").trim() || "Other",
    name: String(payload.title || action.label || capture.title || "Capture").trim(),
    action_needed: String(payload.action_needed || action.reason || "Review capture.").trim(),
    status: "active",
  };
  const body = [
    `# ${fields.name}`,
    "",
    "## What is this?",
    String(payload.body || action.reason || "Created from Horizon Capture.").trim(),
    "",
    "## Action Needed",
    fields.action_needed,
    "",
    "## More Information",
    "- Created from Horizon Capture.",
    `- Source capture: [[${capture.capture.replace(/\.md$/, "")}]]`,
    ...(fields.date === "unknown" ? ["- Open reminder: yes"] : []),
    "",
  ].join("\n");
  const filePath = uniqueFilePath(path.join(ITEMS_DIR, rcfItemFileName(fields)));
  fs.writeFileSync(filePath, buildItemContent(fields, body), "utf8");
  const items = listItems();
  writeNow(items);
  return {
    refreshCalendar: true,
    relPath: vaultRelative(filePath),
  };
}

function firstUrlFromText(value) {
  const match = String(value || "").match(/https?:\/\/[^\s<>"')]+/i);
  return match ? match[0].replace(/[.,;:!?]+$/, "") : "";
}

function firstDoiFromText(value) {
  const match = String(value || "").match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
  return match ? match[0].replace(/[.,;:!?]+$/, "") : "";
}

// Research Papers/index.md convention: "Author-YYYY.md" - capitalized author name kept
// as-is (Philip-2017.md, Wang-2023b.md), not lowercase-slugified like safeSlug().
function safeFileNameSegment(value) {
  return String(value || "").replace(/[<>:"/\\|?*\\u0000-\\u001f]/g, "").trim().slice(0, 60);
}

function firstYearFromText(value) {
  const match = String(value || "").match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : "";
}

function researchCitekeyFromAction(action, text) {
  const payload = action.payload || {};
  const authorsRaw = String(payload.authors || "").trim();
  const firstAuthorSegment = authorsRaw.split(/[;\n]|,\s*(?:and|&)\s+| and | & /i)[0] || "";
  // "Smith, John" (Last, First) -> Smith; "John Smith" -> last word -> Smith.
  const surname = firstAuthorSegment.includes(",")
    ? firstAuthorSegment.split(",")[0].trim()
    : firstAuthorSegment.trim().split(/\s+/).pop() || "";

  const year =
    firstYearFromText(payload.date) ||
    firstYearFromText(payload.title) ||
    firstYearFromText(payload.doi) ||
    firstYearFromText(payload.url) ||
    firstYearFromText(text);

  const cleanSurname = safeFileNameSegment(surname);
  if (cleanSurname && year) {
    return { citekey: `${cleanSurname}-${year}`, needsCitekey: false, year };
  }
  return { citekey: `Untitled-${year || currentToday().slice(0, 4)}`, needsCitekey: true, year: year || "" };
}

function researchCitationLine(action, text) {
  const payload = action.payload || {};
  const authors = String(payload.authors || "").trim();
  const year = firstYearFromText(payload.date) || firstYearFromText(text);
  const title = String(payload.title || payload.publication_title || "").trim();
  const publicationTitle = String(payload.publication_title || "").trim();
  const doi = String(payload.doi || firstDoiFromText(text)).trim();
  const url = String(payload.url || payload.source || firstUrlFromText(text)).trim();
  const link = doi ? (doi.startsWith("http") ? doi : `https://doi.org/${doi}`) : url;

  const parts = [];
  if (authors) parts.push(`${authors.replace(/\.+$/, "")}.`);
  if (year) parts.push(`(${year}).`);
  if (title) parts.push(`${title.replace(/\.+$/, "")}.`);
  if (publicationTitle && publicationTitle !== title) parts.push(`${publicationTitle.replace(/\.+$/, "")}.`);
  if (link) parts.push(link);

  const assembled = parts.join(" ").trim();
  return assembled || String(text || "").trim().slice(0, 300) || "Citation not available.";
}

async function applyResearchPaperCaptureAction(action, capture, text) {
  const payload = action.payload || {};
  const doi = normalizeDoi(payload.doi || firstDoiFromText(`${payload.body || ""}\n${text}`));
  const metadata = await metadataForDoi(doi, { allowFetch: true });
  const capturedTitle = String(payload.title || payload.publication_title || "").trim();
  const enrichedAction = {
    ...action,
    payload: {
      ...payload,
      authors: payload.authors || metadata?.authors?.join("; ") || "",
      date: payload.date || metadata?.datePublished || "",
      doi,
      publication_title: payload.publication_title || metadata?.publicationTitle || "",
      title: researchTitleIsPlaceholder(capturedTitle, doi) ? metadata?.title || capturedTitle : capturedTitle || metadata?.title || "",
    },
  };
  const { citekey, needsCitekey, year } = researchCitekeyFromAction(enrichedAction, text);
  const title = String(enrichedAction.payload.title || citekey.replace(/[-_]+/g, " ")).trim();
  const authors = String(enrichedAction.payload.authors || "").trim();
  const datePublished = String(enrichedAction.payload.date || year || "unknown").trim() || "unknown";
  const rawSummary = String(payload.body || "").trim();
  const summary = metadata?.abstract || (rawSummary && rawSummary !== text.trim() ? rawSummary : "") || String(text || "").trim() || "unknown";
  const summaryType = metadata?.abstract ? "abstract" : "summary";
  const primarySubject = String(payload.subject || payload.category || "General Research").trim() || "General Research";
  const needsMetadata = !doi || datePublished === "unknown" || !authors || researchTitleIsPlaceholder(title, doi) || summary === "unknown";
  const dir = path.join(ROOT, "Research Papers");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = uniqueFilePath(path.join(dir, `${citekey}.md`));
  const finalCitekey = path.basename(filePath, ".md");

  const frontmatterLines = [
    "---",
    "type: research-paper",
    `citekey: ${finalCitekey}`,
    `year: ${year || "unknown"}`,
    `title: ${JSON.stringify(title)}`,
    `authors: ${JSON.stringify(authors || "unknown")}`,
    `doi: ${JSON.stringify(doi || "unknown")}`,
    `date_published: ${JSON.stringify(datePublished)}`,
    `primary_subject: ${JSON.stringify(primarySubject)}`,
    "reading_status: to_read",
    "dog_eared: false",
    `summary_type: ${summaryType}`,
    "status: captured",
  ];
  if (needsCitekey) frontmatterLines.push("needs_citekey: true");
  if (needsMetadata) frontmatterLines.push("needs_metadata: true");
  frontmatterLines.push("---", "");
  const connectionLines = normalizeConnectionInput(action.payload?.connections)
    .split("\n")
    .filter(Boolean)
    .map((target) => `- [[${target}]]`);

  const body = [
    ...frontmatterLines,
    researchCitationLine(enrichedAction, text),
    "",
    "[[Reference]]",
    "",
    `## ${summaryType === "abstract" ? "Abstract" : "Summary"}`,
    "",
    summary,
    ...(connectionLines.length ? ["", "## Connections", "", ...connectionLines] : []),
    "",
    `- Source capture: [[${capture.capture.replace(/\.md$/, "")}]]`,
  ].join("\n");

  fs.writeFileSync(filePath, body, "utf8");
  return { relPath: vaultRelative(filePath), citekey: finalCitekey };
}

// A research idea is a topic or question to explore later, distinct from a citable
// paper (Author-YYYY.md). Kept in a sibling Research Papers/Ideas/ folder, own note type.
function applyResearchIdeaCaptureAction(action, capture, text) {
  const dir = path.join(ROOT, "Research Papers", "Ideas");
  fs.mkdirSync(dir, { recursive: true });
  const payload = action.payload || {};
  const topic = String(payload.title || payload.topic || text).trim().replace(/\s+/g, " ").slice(0, 120) || "Untitled idea";
  const today = currentToday();
  const filePath = uniqueFilePath(path.join(dir, `${today}__${safeSlug(topic)}.md`));
  const connectionLines = normalizeConnectionInput(payload.connections)
    .split("\n")
    .filter(Boolean)
    .map((target) => `- [[${target}]]`);
  const body = [
    "---",
    "type: research-idea",
    "status: new",
    `created: ${today}`,
    `topic: ${JSON.stringify(topic)}`,
    "---",
    "",
    String(payload.body || text).trim(),
    ...(connectionLines.length ? ["", "## Connections", "", ...connectionLines] : []),
    "",
    `- Source capture: [[${capture.capture.replace(/\.md$/, "")}]]`,
    "",
  ].join("\n");
  fs.writeFileSync(filePath, body, "utf8");
  return { relPath: vaultRelative(filePath), topic };
}

function normalizeResearchPaperRef(value) {
  const ref = String(value || "").trim();
  if (ref.toLowerCase().startsWith("doi:")) {
    const doi = normalizeDoi(ref.slice(4));
    return doi ? `doi:${doi}` : "";
  }
  if (/^zotero:[A-Za-z0-9]+$/i.test(ref)) return `zotero:${ref.slice(7)}`;
  if (/^vault:Research Papers\/[^/]+\.md$/i.test(ref)) return `vault:${normalizeVaultRelativePath(ref.slice(6))}`;
  return "";
}

function researchPaperRef(paper) {
  const doi = normalizeDoi(paper?.doi);
  if (doi) return `doi:${doi}`;
  if (paper?.zoteroKey) return `zotero:${paper.zoteroKey}`;
  if (paper?.path) return `vault:${normalizeVaultRelativePath(paper.path)}`;
  return "";
}

function researchPaperMatchesRef(paper, value) {
  const ref = normalizeResearchPaperRef(value);
  if (!ref || !paper) return false;
  if (ref.startsWith("doi:")) return normalizeDoi(paper.doi) === ref.slice(4);
  if (ref.startsWith("zotero:")) return String(paper.zoteroKey || "") === ref.slice(7);
  return normalizeVaultRelativePath(paper.path) === ref.slice(6);
}

function researchPaperRefs(value) {
  let refs = [];
  if (Array.isArray(value)) {
    refs = value;
  } else {
    try {
      const parsed = JSON.parse(String(value || "[]"));
      refs = Array.isArray(parsed) ? parsed : [];
    } catch {
      refs = String(value || "").split(",");
    }
  }
  return [...new Set(refs.map(normalizeResearchPaperRef).filter(Boolean))].slice(0, 80);
}

function safeResearchIdeaPath(value) {
  const normalized = normalizeVaultRelativePath(value);
  if (!/^Research Papers\/Ideas\/[^/]+\.md$/i.test(normalized)) return "";
  const filePath = path.resolve(ROOT, ...normalized.split("/"));
  const ideasRoot = path.resolve(ROOT, "Research Papers", "Ideas");
  return filePath.startsWith(`${ideasRoot}${path.sep}`) ? filePath : "";
}

function researchIdeaBody(raw) {
  const body = stripFrontmatter(raw);
  const section = body.search(/(?:^|\n)## Connected papers\s*(?:\n|$)/i);
  return (section >= 0 ? body.slice(0, section) : body).trim();
}

function researchIdeaRecord(filePath, raw = fs.readFileSync(filePath, "utf8")) {
  const fields = readMarkdownFrontmatter(raw);
  const body = researchIdeaBody(raw);
  const name = path.basename(filePath);
  return {
    body,
    connectedPaperRefs: researchPaperRefs(fields.connected_papers),
    created: fields.created || "",
    id: name,
    path: `Research Papers/Ideas/${name}`,
    preview: body.replace(/\s+/g, " ").slice(0, 240),
    status: fields.status || "new",
    topic: fields.topic || path.basename(name, ".md").replace(/^\d{4}-\d{2}-\d{2}__/, "").replace(/[-_]+/g, " "),
  };
}

function researchIdeaConnectionLines(refs, papers) {
  const connected = refs
    .map((ref) => papers.find((paper) => researchPaperMatchesRef(paper, ref)))
    .filter(Boolean)
    .filter((paper, index, all) => all.findIndex((candidate) => candidate.id === paper.id) === index);
  if (!connected.length) return [];
  return [
    "",
    "## Connected papers",
    "",
    ...connected.map((paper) => {
      const label = researchMarkdownText(paper.title) || "Untitled paper";
      const identity = `${researchMarkdownText(paper.authorLabel) || "Unknown"}, ${researchMarkdownText(paper.year) || "n.d."}`;
      if (paper.path) return `- [[${paper.path.replace(/\.md$/i, "")}|${label}]] — ${identity}`;
      const doi = normalizeDoi(paper.doi);
      if (doi) return `- [${label}](https://doi.org/${doi}) — ${identity}`;
      if (paper.zoteroUrl) return `- [${label}](${paper.zoteroUrl}) — ${identity}`;
      return `- ${label} — ${identity}`;
    }),
  ];
}

function writeResearchIdea(filePath, idea, papers = []) {
  const refs = researchPaperRefs(idea.connectedPaperRefs);
  const markdown = [
    "---",
    "type: research-idea",
    `status: ${String(idea.status || "new").trim() || "new"}`,
    `created: ${String(idea.created || currentToday()).trim()}`,
    `topic: ${JSON.stringify(String(idea.topic || "Research idea").trim() || "Research idea")}`,
    `connected_papers: ${JSON.stringify(refs)}`,
    "---",
    "",
    String(idea.body || "").trim(),
    ...researchIdeaConnectionLines(refs, papers),
    "",
  ].join("\n");
  fs.writeFileSync(filePath, markdown, "utf8");
  return researchIdeaRecord(filePath, markdown);
}

function listResearchIdeas() {
  const dir = path.join(ROOT, "Research Papers", "Ideas");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".md") && name !== "index.md")
    .map((name) => researchIdeaRecord(path.join(dir, name)))
    .sort((a, b) => String(b.created).localeCompare(String(a.created)) || b.id.localeCompare(a.id));
}

function createResearchDeskIdea(payload) {
  const body = String(payload?.body || payload?.text || "").trim().slice(0, 8000);
  if (!body) return { message: "Write something on the sticky before saving it.", ok: false, state: "empty", statusCode: 400 };

  const dir = path.join(ROOT, "Research Papers", "Ideas");
  fs.mkdirSync(dir, { recursive: true });
  const topic = String(payload?.title || body.split(/\r?\n/, 1)[0] || "Research idea")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120) || "Research idea";
  const created = currentToday();
  const filePath = uniqueFilePath(path.join(dir, `${created}__${safeSlug(topic)}.md`));
  const idea = writeResearchIdea(filePath, {
    body,
    connectedPaperRefs: [],
    created,
    status: "new",
    topic,
  });
  return {
    idea,
    message: "Sticky note saved to Research Ideas.",
    ok: true,
    state: "created",
    statusCode: 201,
  };
}

function updateResearchDeskIdea(payload, papers) {
  const filePath = safeResearchIdeaPath(payload?.path);
  if (!filePath || !fs.existsSync(filePath)) {
    return { message: "Sticky note not found.", ok: false, state: "not_found", statusCode: 404 };
  }
  const current = researchIdeaRecord(filePath);
  const bodyProvided = Object.prototype.hasOwnProperty.call(payload || {}, "body");
  const body = bodyProvided ? String(payload.body || "").trim().slice(0, 8000) : current.body;
  if (!body) return { message: "A sticky note cannot be empty.", ok: false, state: "empty", statusCode: 400 };
  const topic = bodyProvided
    ? String(body.split(/\r?\n/, 1)[0] || current.topic).replace(/\s+/g, " ").trim().slice(0, 120) || current.topic
    : current.topic;
  const connectedPaperRefs = Object.prototype.hasOwnProperty.call(payload || {}, "connectedPaperRefs")
    ? researchPaperRefs(payload.connectedPaperRefs)
    : current.connectedPaperRefs;
  const idea = writeResearchIdea(filePath, { ...current, body, connectedPaperRefs, topic }, papers);
  return {
    idea,
    message: bodyProvided ? "Sticky note updated." : "Paper connections updated.",
    ok: true,
    state: "updated",
    statusCode: 200,
  };
}

function deleteResearchDeskIdea(payload) {
  const filePath = safeResearchIdeaPath(payload?.path);
  if (!filePath || !fs.existsSync(filePath)) {
    return { message: "Sticky note was already gone.", ok: true, state: "missing", statusCode: 200 };
  }
  const idea = researchIdeaRecord(filePath);
  fs.unlinkSync(filePath);
  return {
    idea,
    message: "Sticky note deleted.",
    ok: true,
    state: "deleted",
    statusCode: 200,
  };
}

// Small generic frontmatter reader for Research Papers/*.md.
// Not the RCF parser (parseItemContent) - that one is fixed to FIELD_ORDER; this is a
// permissive key:value reader for whatever a research note's frontmatter happens to have.
function readMarkdownFrontmatter(raw) {
  if (!raw.startsWith("---")) return {};
  const lines = raw.split(/\r?\n/);
  const end = lines.indexOf("---", 1);
  if (end < 0) return {};
  const fields = {};
  for (const line of lines.slice(1, end)) {
    const match = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (match) fields[match[1]] = match[2].replace(/^"(.*)"$/, "$1").trim();
  }
  return fields;
}

// Split a Research Papers/*.md note into its citation and a clearly labelled abstract or
// summary. Older "Insights" notes remain readable as Summary without rewriting the vault.
function researchPaperParts(raw) {
  const lines = raw.split(/\r?\n/);
  const bodyStart = raw.startsWith("---") ? lines.indexOf("---", 1) + 1 : 0;
  const bodyLines = lines.slice(bodyStart);
  const citationIdx = bodyLines.findIndex((line) => line.trim());
  const citation = citationIdx >= 0 ? bodyLines[citationIdx].trim() : "";
  const remaining = bodyLines.slice(citationIdx + 1);
  const abstractLabel = remaining.some((line) => /^\s*(?:#{1,6}\s*|\*\*)abstract(?:\*\*)?\s*$/i.test(line)) ? "Abstract" : "Summary";
  const sectionStart = remaining.findIndex((line) => /^\s*(?:#{1,6}\s*|\*\*)(abstract|summary|insights)(?:\*\*)?\s*$/i.test(line));
  const contentLines = remaining.slice(sectionStart >= 0 ? sectionStart + 1 : 0);
  const nextSection = contentLines.findIndex((line) => /^\s*#{1,6}\s+(connections|source|references?)\s*$/i.test(line));
  const abstract = (nextSection >= 0 ? contentLines.slice(0, nextSection) : contentLines)
    .filter((line) => line.trim() !== "[[Reference]]")
    .filter((line) => !/^\s*-\s*Source capture:/i.test(line))
    .filter((line) => !/^\s*(?:\[\[[^\]]+\]\]\s*)+$/.test(line))
    .join("\n")
    .replace(/^#{1,6}\s*(abstract|summary|insights|reference)\s*$/gim, "")
    .replace(/^\*\*(abstract|summary|insights|reference)\*\*\s*$/gim, "")
    .replace(/^Captured via Horizon:\s*/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { citation, abstract, abstractLabel };
}

function researchPaperSubjects(raw, selfKey = "") {
  const ignored = new Set(["reference"]);
  return [...new Set(
    Array.from(String(raw || "").matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g))
      .map((match) => ({ label: String(match[2] || match[1]).trim(), target: String(match[1] || "").trim() }))
      .filter(({ target }) => {
        if (!target || ignored.has(target.toLowerCase()) || /^(Inbox\/Captures|Runs\/|Calendar\/Items\/)/i.test(target)) return false;
        if (/\.(?:png|jpe?g|gif|webp|svg|pdf)$/i.test(target)) return false;
        return path.posix.basename(target.replace(/\\/g, "/")).toLowerCase() !== String(selfKey || "").toLowerCase();
      })
      .map(({ label, target }) => label || path.posix.basename(target.replace(/\\/g, "/")))
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b));
}

const RESEARCH_READING_STATUSES = new Set(["to_read", "skimming", "read", "annotated"]);
const RESEARCH_LIBRARY_CACHE_MAX_AGE_MS = 15 * 60 * 1000;
let researchMetadataCache = null;
const researchMetadataInflight = new Map();

function knownResearchValue(value) {
  const text = String(value || "").trim();
  return Boolean(text && text.toLowerCase() !== "unknown" && text.toLowerCase() !== "n.d.");
}

function normalizeDoi(value) {
  const text = String(value || "").trim();
  if (!text || /^file:/i.test(text)) return "";
  const match = text.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
  return match ? match[0].replace(/[.,;:!?]+$/, "").toLowerCase() : "";
}

function cleanResearchText(value) {
  return String(value || "")
    .replace(/<\/?(?:div|p|br|span|i|b|em|strong|sub|sup)[^>]*>/gi, " ")
    .replace(/<a\b[^>]*>(.*?)<\/a>/gi, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/(^|\s)[#>-]+\s+/g, "$1")
    .replace(/[*_`]+/g, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function parseResearchAuthors(value) {
  const text = String(value || "").trim().replace(/^"|"$/g, "");
  if (!text) return [];
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map((item) => cleanResearchText(item)).filter(Boolean);
    } catch {
      // Older notes use a compact string rather than a YAML array.
    }
  }
  return text.split(/\s*;\s*/).map(cleanResearchText).filter(Boolean);
}

function citationResearchIdentity(citation, fallbackCitekey = "") {
  const raw = String(citation || "").trim();
  const plain = cleanResearchText(raw.replace(/[_*]/g, ""));
  const dateMatch = plain.match(/\((?:(19|20)\d{2}|n\.d\.)\)\.?/i);
  const authorText = dateMatch ? plain.slice(0, dateMatch.index).replace(/[.,\s]+$/, "") : "";
  let title = "";

  if (dateMatch) {
    const rawDateMatch = raw.match(/\((?:(19|20)\d{2}|n\.d\.)\)\.?/i);
    const remainder = rawDateMatch ? raw.slice(rawDateMatch.index + rawDateMatch[0].length).trim() : "";
    if (/^[_*]/.test(remainder)) {
      const marker = remainder[0];
      const closing = remainder.indexOf(marker, 1);
      title = cleanResearchText(closing > 1 ? remainder.slice(1, closing) : remainder);
    } else {
      const titleMatch = remainder.match(/^(.+?)\.\s+(?:[_*]|[A-Z][^:]{1,80}(?:,|\.|\d))/);
      title = cleanResearchText(titleMatch?.[1] || remainder.split(/\.\s+_/)[0]);
    }
  } else {
    const beforePublication = raw.split(/\.\s+[_*]/)[0];
    const authorBreak = beforePublication.match(/^(.+?\.)\s+([A-Z].+)$/);
    title = cleanResearchText(authorBreak?.[2] || "");
  }

  const fallbackAuthor = String(fallbackCitekey || "").split("-")[0].replace(/[_-]+/g, " ");
  return {
    authors: authorText ? [authorText] : fallbackAuthor ? [fallbackAuthor] : [],
    title: title || String(fallbackCitekey || "").replace(/[-_]+/g, " "),
  };
}

function researchAuthorLabel(authors, citekey = "") {
  const values = Array.isArray(authors) ? authors.filter(Boolean) : [];
  if (!values.length) return String(citekey || "Unknown author").split("-")[0].replace(/[_-]+/g, " ");
  const first = values[0];
  const surname = first.includes(",")
    ? first.split(",")[0].trim()
    : first.trim().split(/\s+/).slice(-1)[0];
  return values.length > 1 ? `${surname} et al.` : surname || first;
}

function researchSummaryPreview(value, limit = 210) {
  const clean = cleanResearchText(value).replace(/^Captured via Horizon:\s*/i, "");
  if (clean.length <= limit) return clean;
  const clipped = clean.slice(0, limit + 1);
  const sentence = clipped.lastIndexOf(". ");
  const word = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, sentence > limit * 0.55 ? sentence + 1 : word > 0 ? word : limit).trim()}…`;
}

function normalizedResearchTitle(value) {
  return cleanResearchText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function researchTitleIsPlaceholder(value, doi = "") {
  const title = cleanResearchText(value);
  if (!knownResearchValue(title) || /^(?:untitled(?: paper)?|unknown|new item)$/i.test(title)) return true;
  if (/^https?:\/\/\S+$/i.test(title)) return true;

  const normalizedDoi = normalizeDoi(doi);
  const titleDoi = normalizeDoi(title);
  return Boolean(
    normalizedDoi
    && titleDoi === normalizedDoi
    && normalizedResearchTitle(title) === normalizedResearchTitle(normalizedDoi),
  );
}

function finalizeResearchPaper(paper) {
  const doi = normalizeDoi(paper.doi) || "unknown";
  const datePublished = knownResearchValue(paper.datePublished) ? String(paper.datePublished) : "unknown";
  const authors = Array.isArray(paper.authors) ? paper.authors.filter(Boolean) : [];
  const title = knownResearchValue(paper.title) ? cleanResearchText(paper.title) : String(paper.citekey || "Untitled paper").replace(/[-_]+/g, " ");
  const abstract = cleanResearchText(paper.abstract);
  const primarySubject = knownResearchValue(paper.primarySubject) ? cleanResearchText(paper.primarySubject) : "General Research";
  const subjects = [...new Set([primarySubject, ...(paper.subjects || []).map(cleanResearchText).filter(Boolean)])];
  const missingFields = [];
  if (researchTitleIsPlaceholder(title, doi)) missingFields.push("Title");
  if (!authors.length) missingFields.push("Author");
  if (doi === "unknown") missingFields.push("DOI");
  if (datePublished === "unknown") missingFields.push("Date published");
  if (!abstract) missingFields.push("Abstract or summary");
  const readingStatus = RESEARCH_READING_STATUSES.has(paper.readingStatus) ? paper.readingStatus : "to_read";
  return {
    ...paper,
    abstract,
    abstractLabel: paper.abstractLabel === "Abstract" ? "Abstract" : "Summary",
    apaCitation: cleanResearchText(paper.apaCitation || paper.citation),
    authorLabel: researchAuthorLabel(authors, paper.citekey),
    authors,
    citation: cleanResearchText(paper.citation || paper.apaCitation),
    dateAdded: knownResearchValue(paper.dateAdded) ? String(paper.dateAdded) : "",
    datePublished,
    dogEared: Boolean(paper.dogEared),
    doi,
    duplicateCopies: Math.max(1, Number(paper.duplicateCopies) || 1),
    metadataComplete: missingFields.length === 0,
    metadataConflicts: Array.isArray(paper.metadataConflicts) ? paper.metadataConflicts : [],
    missingFields,
    primarySubject,
    readingStatus,
    subjects,
    summary: researchSummaryPreview(abstract || paper.citation || title),
    summaryPreview: researchSummaryPreview(abstract || paper.citation || title),
    title,
    year: firstYearFromText(datePublished) || String(paper.year || "unknown"),
  };
}

function listVaultResearchPapers() {
  const dir = path.join(ROOT, "Research Papers");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".md") && name !== "index.md")
    .map((name) => ({ name, raw: fs.readFileSync(path.join(dir, name), "utf8") }))
    .filter(({ raw }) => readMarkdownFrontmatter(raw).type !== "zotero-library-shelf")
    .map(({ name, raw }) => {
      const fields = readMarkdownFrontmatter(raw);
      const { citation, abstract, abstractLabel } = researchPaperParts(raw);
      const citekey = fields.citekey || path.basename(name, ".md");
      const identity = citationResearchIdentity(citation, citekey);
      const authors = parseResearchAuthors(fields.authors);
      const linkedSubjects = researchPaperSubjects(raw, citekey);
      const legacyStatus = String(fields.status || "").toLowerCase();
      const readingStatus = RESEARCH_READING_STATUSES.has(fields.reading_status)
        ? fields.reading_status
        : ["read", "annotated"].includes(legacyStatus) ? legacyStatus : "to_read";
      const datePublished = fields.date_published || fields.publication_date || fields.published || fields.date || fields.year || firstYearFromText(citation) || "unknown";
      const citationYear = firstYearFromText(citation);
      const storedYear = firstYearFromText(datePublished);
      const metadataConflicts = citationYear && storedYear && citationYear !== storedYear
        ? [`Vault metadata year ${storedYear} differs from the citation year ${citationYear}.`]
        : [];
      return finalizeResearchPaper({
        abstract,
        abstractLabel,
        apaCitation: citation,
        authors: authors.length ? authors : identity.authors,
        citation,
        citekey,
        dateAdded: fields.date_added || fields.created || "",
        datePublished,
        dogEared: fields.dog_eared === "true",
        doi: normalizeDoi(fields.doi || firstDoiFromText(raw)) || "unknown",
        id: `vault:Research Papers/${name}`,
        metadataConflicts,
        needsCitekey: fields.needs_citekey === "true",
        path: `Research Papers/${name}`,
        primarySubject: fields.primary_subject || linkedSubjects[0] || "General Research",
        readingStatus,
        source: "vault",
        status: fields.status || "unknown",
        subjects: linkedSubjects,
        title: fields.title || identity.title,
        year: fields.year || "unknown",
        zoteroKey: fields.zotero_key || "",
        zoteroUrl: "",
      });
    })
    .sort((a, b) => String(b.year).localeCompare(String(a.year)) || a.citekey.localeCompare(b.citekey));
}

function zoteroCredentials() {
  const settings = mergedIntegrationSettings("zotero");
  return {
    apiKey: String(settings.zoteroApiKey || "").trim(),
    localEnabled: Boolean(settings.zoteroLocal?.enabled && settings.zoteroLocal?.verifiedAt),
    userId: String(settings.zoteroUserId || "").trim(),
  };
}

function researchExternalIntegrationsDisabled() {
  return process.env.RSB_DISABLE_EXTERNAL_INTEGRATIONS === "1";
}

async function fetchZoteroPages(userId, apiKey, resource, query = {}) {
  const all = [];
  for (let start = 0; ; start += 100) {
    const params = new URLSearchParams({ ...query, limit: "100", start: String(start) });
    const response = await fetch(`https://api.zotero.org/users/${encodeURIComponent(userId)}/${resource}?${params}`, {
      headers: { "Zotero-API-Key": apiKey, "Zotero-API-Version": "3" },
    });
    if (!response.ok) throw new Error(`Zotero library request failed with HTTP ${response.status}.`);
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error("Zotero returned an unreadable library response.");
    all.push(...page);
    const total = Number(response.headers.get("total-results") || all.length);
    if (!page.length || all.length >= total) break;
  }
  return all;
}

async function fetchZoteroDesktopPages(resource, query = {}) {
  const all = [];
  for (let start = 0; ; start += 100) {
    const params = new URLSearchParams({ ...query, limit: "100", start: String(start) });
    const response = await fetch(`http://127.0.0.1:23119/api/users/0/${resource}?${params}`, {
      headers: { "Zotero-API-Version": "3" },
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status === 403) {
      throw new Error("Zotero local access is off. Enable 'Allow other applications on this computer to communicate with Zotero' in Zotero Settings > Advanced.");
    }
    if (!response.ok) throw new Error(`Zotero Desktop library request failed with HTTP ${response.status}.`);
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error("Zotero Desktop returned an unreadable library response.");
    all.push(...page);
    const total = Number(response.headers.get("total-results") || all.length);
    if (!page.length || all.length >= total) break;
  }
  return all;
}

async function readZoteroResearchLibrary({ force = false } = {}) {
  const cached = safeJsonRead(RESEARCH_LIBRARY_CACHE_PATH, null);
  const cachedAt = Date.parse(cached?.fetchedAt || "");
  if (!force && cached && Number.isFinite(cachedAt) && Date.now() - cachedAt < RESEARCH_LIBRARY_CACHE_MAX_AGE_MS) {
    return { ...cached, status: "cached" };
  }

  const { apiKey, localEnabled, userId } = zoteroCredentials();
  const useCloud = Boolean(apiKey && userId);
  if (!useCloud && !localEnabled) return { collections: [], fetchedAt: null, items: [], status: "not_configured", userId: "" };
  if (researchExternalIntegrationsDisabled()) {
    return cached ? { ...cached, status: "cached" } : { collections: [], fetchedAt: null, items: [], status: "offline", userId: useCloud ? userId : "0" };
  }

  try {
    const [items, collections] = useCloud
      ? await Promise.all([
          fetchZoteroPages(userId, apiKey, "items/top", { format: "json", include: "data,bib", linkwrap: "1", style: "apa" }),
          fetchZoteroPages(userId, apiKey, "collections", { format: "json" }),
        ])
      : await Promise.all([
          fetchZoteroDesktopPages("items/top", { format: "json", include: "data,bib", linkwrap: "1", style: "apa" }),
          fetchZoteroDesktopPages("collections", { format: "json" }),
        ]);
    const next = { collections, fetchedAt: nowIso(), items, source: useCloud ? "cloud" : "desktop", userId: useCloud ? userId : "0", version: 1 };
    writeJson(RESEARCH_LIBRARY_CACHE_PATH, next);
    return { ...next, status: "connected" };
  } catch (error) {
    if (useCloud && localEnabled) {
      try {
        const [items, collections] = await Promise.all([
          fetchZoteroDesktopPages("items/top", { format: "json", include: "data,bib", linkwrap: "1", style: "apa" }),
          fetchZoteroDesktopPages("collections", { format: "json" }),
        ]);
        const next = { collections, fetchedAt: nowIso(), items, source: "desktop", userId: "0", version: 1 };
        writeJson(RESEARCH_LIBRARY_CACHE_PATH, next);
        return { ...next, cloudError: error.message, status: "connected" };
      } catch {
        // If both sources fail, preserve the last good cache below.
      }
    }
    if (cached) return { ...cached, error: error.message, status: "stale" };
    return { collections: [], error: error.message, fetchedAt: null, items: [], status: "offline", userId: useCloud ? userId : "0" };
  }
}

function zoteroCollectionRoots(collections) {
  const byKey = new Map(collections.map((collection) => [collection.key, collection]));
  const roots = new Map();
  function rootName(key, seen = new Set()) {
    if (!key || seen.has(key)) return "";
    seen.add(key);
    const collection = byKey.get(key);
    if (!collection) return "";
    const parent = collection.data?.parentCollection;
    return parent ? rootName(parent, seen) : cleanResearchText(collection.data?.name);
  }
  for (const key of byKey.keys()) roots.set(key, rootName(key));
  return roots;
}

function zoteroCreators(data) {
  return (Array.isArray(data?.creators) ? data.creators : [])
    .filter((creator) => creator.creatorType === "author" || creator.creatorType === "editor")
    .map((creator) => cleanResearchText(creator.name || [creator.lastName, creator.firstName].filter(Boolean).join(", ")))
    .filter(Boolean);
}

function normalizedPublicationDate(value) {
  const text = cleanResearchText(value);
  const compact = text.match(/^((?:19|20)\d{2})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const compactMonth = text.match(/^((?:19|20)\d{2})(\d{2})$/);
  if (compactMonth) return `${compactMonth[1]}-${compactMonth[2]}`;
  return text;
}

function zoteroPapers(library) {
  const collectionRoots = zoteroCollectionRoots(library.collections || []);
  return (library.items || []).map((item) => {
    const data = item.data || {};
    const datePublished = normalizedPublicationDate(data.date);
    const citekey = `${researchAuthorLabel(zoteroCreators(data), "Unknown")}-${firstYearFromText(datePublished) || "n.d."}`;
    const subjects = [...new Set((data.collections || []).map((key) => collectionRoots.get(key)).filter(Boolean))];
    const primarySubject = subjects[0] || "Unsorted";
    return finalizeResearchPaper({
      abstract: data.abstractNote || "",
      abstractLabel: data.abstractNote ? "Abstract" : "Summary",
      apaCitation: item.bib || "",
      authors: zoteroCreators(data),
      citation: item.bib || "",
      citekey,
      dateAdded: data.dateAdded || "",
      datePublished: datePublished || "unknown",
      dogEared: false,
      doi: normalizeDoi(data.DOI || data.extra || data.url || data.title) || "unknown",
      id: `zotero:${item.key}`,
      itemType: data.itemType || "document",
      metadataConflicts: [],
      needsCitekey: false,
      path: "",
      primarySubject,
      readingStatus: "to_read",
      source: "zotero",
      status: "zotero",
      subjects,
      title: data.title || "Untitled paper",
      year: firstYearFromText(datePublished) || "unknown",
      zoteroKey: item.key,
      zoteroUrl: item.links?.alternate?.href || (library.source === "desktop"
        ? `zotero://select/library/items/${encodeURIComponent(item.key)}`
        : `https://www.zotero.org/users/${encodeURIComponent(library.userId)}/items/${encodeURIComponent(item.key)}`),
    });
  });
}

function zoteroPaperQuality(paper) {
  return (
    (researchTitleIsPlaceholder(paper.title, paper.doi) ? 0 : 12)
    + Math.min(8, paper.authors?.length || 0)
    + (knownResearchValue(paper.datePublished) ? 5 : 0)
    + (paper.abstract ? Math.min(8, Math.ceil(paper.abstract.length / 180)) : 0)
    + (paper.itemType === "journalArticle" ? 3 : 0)
  );
}

function collapseZoteroDuplicates(papers) {
  const unique = [];
  const indexByDoi = new Map();
  for (const paper of papers) {
    const doi = normalizeDoi(paper.doi);
    if (!doi) {
      unique.push(paper);
      continue;
    }
    const existingIndex = indexByDoi.get(doi);
    if (existingIndex === undefined) {
      indexByDoi.set(doi, unique.length);
      unique.push(paper);
      continue;
    }

    const existing = unique[existingIndex];
    const preferred = zoteroPaperQuality(paper) > zoteroPaperQuality(existing) ? paper : existing;
    const other = preferred === paper ? existing : paper;
    unique[existingIndex] = finalizeResearchPaper({
      ...preferred,
      abstract: preferred.abstract || other.abstract,
      authors: preferred.authors?.length ? preferred.authors : other.authors,
      datePublished: knownResearchValue(preferred.datePublished) ? preferred.datePublished : other.datePublished,
      duplicateCopies: (existing.duplicateCopies || 1) + (paper.duplicateCopies || 1),
      primarySubject: preferred.primarySubject !== "Unsorted" ? preferred.primarySubject : other.primarySubject,
      subjects: [...new Set([...(preferred.subjects || []), ...(other.subjects || [])])],
      title: researchTitleIsPlaceholder(preferred.title, doi) ? other.title : preferred.title,
    });
  }
  return unique;
}

function describeZoteroDuplicateGroups(papers) {
  const byDoi = new Map();
  for (const paper of papers) {
    const doi = normalizeDoi(paper.doi);
    if (!doi) continue;
    byDoi.set(doi, [...(byDoi.get(doi) || []), paper]);
  }
  return [...byDoi.entries()]
    .filter(([, copies]) => copies.length > 1)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([doi, copies]) => ({
      doi,
      copies: copies.map((paper) => ({
        authorLabel: paper.authorLabel,
        datePublished: paper.datePublished,
        id: paper.id,
        primarySubject: paper.primarySubject,
        title: paper.title,
        year: paper.year,
        zoteroKey: paper.zoteroKey,
        zoteroUrl: paper.zoteroUrl,
      })),
    }));
}

function crossrefDate(message) {
  const candidates = [message?.["published-print"], message?.["published-online"], message?.issued, message?.created];
  for (const candidate of candidates) {
    const parts = candidate?.["date-parts"]?.[0];
    if (Array.isArray(parts) && parts[0]) return parts.filter(Boolean).join("-");
  }
  return "";
}

function researchAuthorInitials(value) {
  return cleanResearchText(value)
    .split(/[\s-]+/)
    .map((part) => part.match(/[\p{L}]/u)?.[0])
    .filter(Boolean)
    .map((initial) => `${initial.toUpperCase()}.`)
    .join(" ");
}

function crossrefApaCitation(message, doi) {
  const authorNames = (message?.author || [])
    .map((author) => {
      const family = cleanResearchText(author.family || "");
      const initials = researchAuthorInitials(author.given || "");
      return family ? `${family}${initials ? `, ${initials}` : ""}` : "";
    })
    .filter(Boolean);
  const authorText = authorNames.length > 1
    ? `${authorNames.slice(0, -1).join(", ")}, & ${authorNames.at(-1)}`
    : authorNames[0] || "";
  const year = firstYearFromText(crossrefDate(message)) || "n.d.";
  const title = cleanResearchText(message?.title?.[0] || "");
  const journal = cleanResearchText(message?.["container-title"]?.[0] || "");
  const volume = cleanResearchText(message?.volume || "");
  const issue = cleanResearchText(message?.issue || "");
  const pages = cleanResearchText(message?.page || "").replace(/(\d)\s*-\s*(\d)/g, "$1–$2");
  const publication = journal
    ? `${journal}${volume ? `, ${volume}` : ""}${issue ? `(${issue})` : ""}${pages ? `, ${pages}` : ""}.`
    : "";
  return [
    authorText ? `${authorText} (${year}).` : `(${year}).`,
    title ? `${title.replace(/\.+$/, "")}.` : "",
    publication,
    normalizeDoi(doi) ? `https://doi.org/${normalizeDoi(doi)}` : "",
  ].filter(Boolean).join(" ");
}

async function metadataForDoi(value, { allowFetch = false } = {}) {
  const doi = normalizeDoi(value);
  if (!doi) return null;
  if (!researchMetadataCache) {
    researchMetadataCache = safeJsonRead(RESEARCH_METADATA_CACHE_PATH, { entries: {}, version: 1 });
  }
  const cache = researchMetadataCache;
  if (cache.entries?.[doi]) return cache.entries[doi];
  if (!allowFetch || researchExternalIntegrationsDisabled()) return null;
  if (researchMetadataInflight.has(doi)) return researchMetadataInflight.get(doi);

  const request = (async () => {
    try {
      const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
        headers: { "User-Agent": `HorizonOS/${APP_VERSION} (+https://github.com/BoomerRawlings/horizon-os)` },
        signal: AbortSignal.timeout(12000),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.message) return null;
      const message = body.message;
      const metadata = {
        abstract: cleanResearchText(message.abstract || "").replace(/^abstract\s+/i, ""),
        apaCitation: crossrefApaCitation(message, doi),
        authors: (message.author || []).map((author) => cleanResearchText([author.family, author.given].filter(Boolean).join(", "))).filter(Boolean),
        datePublished: crossrefDate(message),
        doi,
        fetchedAt: nowIso(),
        publicationTitle: cleanResearchText(message["container-title"]?.[0] || ""),
        source: "crossref",
        title: cleanResearchText(message.title?.[0] || ""),
      };
      cache.entries = { ...(cache.entries || {}), [doi]: metadata };
      cache.updatedAt = nowIso();
      writeJson(RESEARCH_METADATA_CACHE_PATH, cache);
      return metadata;
    } catch {
      return null;
    } finally {
      researchMetadataInflight.delete(doi);
    }
  })();
  researchMetadataInflight.set(doi, request);
  return request;
}

function applyExactResearchMetadata(paper, metadata) {
  if (!metadata) return paper;
  const placeholderTitle = researchTitleIsPlaceholder(paper.title, paper.doi);
  const useExactAbstract = Boolean(metadata.abstract && (!paper.abstract || placeholderTitle));
  const useExactCitation = Boolean(metadata.apaCitation && (placeholderTitle || !knownResearchValue(paper.apaCitation || paper.citation)));
  return finalizeResearchPaper({
    ...paper,
    abstract: useExactAbstract ? metadata.abstract : paper.abstract,
    abstractLabel: useExactAbstract ? "Abstract" : paper.abstractLabel,
    apaCitation: useExactCitation ? metadata.apaCitation : paper.apaCitation,
    authors: paper.authors.length ? paper.authors : metadata.authors,
    citation: useExactCitation ? metadata.apaCitation : paper.citation,
    datePublished: knownResearchValue(paper.datePublished) ? paper.datePublished : metadata.datePublished,
    title: placeholderTitle ? metadata.title || paper.title : paper.title,
  });
}

function researchPaperNeedsExactMetadata(paper) {
  return Boolean(
    normalizeDoi(paper.doi)
    && (
      researchTitleIsPlaceholder(paper.title, paper.doi)
      || !paper.authors?.length
      || !knownResearchValue(paper.datePublished)
      || !paper.abstract
      || !knownResearchValue(paper.apaCitation || paper.citation)
    ),
  );
}

function mergeResearchPapers(localPaper, zoteroPaper) {
  if (!localPaper) return zoteroPaper;
  if (!zoteroPaper) return localPaper;
  const conflicts = [...(localPaper.metadataConflicts || [])];
  const localYear = firstYearFromText(localPaper.datePublished);
  const zoteroYear = firstYearFromText(zoteroPaper.datePublished);
  if (localYear && zoteroYear && localYear !== zoteroYear) {
    conflicts.push(`Vault year ${localYear} differs from Zotero year ${zoteroYear}.`);
  }
  return finalizeResearchPaper({
    ...zoteroPaper,
    ...localPaper,
    abstract: localPaper.abstract || zoteroPaper.abstract,
    abstractLabel: localPaper.abstract ? localPaper.abstractLabel : zoteroPaper.abstractLabel,
    apaCitation: zoteroPaper.apaCitation || localPaper.apaCitation,
    authors: zoteroPaper.authors.length ? zoteroPaper.authors : localPaper.authors,
    citation: zoteroPaper.apaCitation || localPaper.citation,
    dateAdded: localPaper.dateAdded || zoteroPaper.dateAdded,
    datePublished: knownResearchValue(localPaper.datePublished) ? localPaper.datePublished : zoteroPaper.datePublished,
    doi: normalizeDoi(localPaper.doi) || normalizeDoi(zoteroPaper.doi) || "unknown",
    duplicateCopies: Math.max(localPaper.duplicateCopies || 1, zoteroPaper.duplicateCopies || 1),
    metadataConflicts: conflicts,
    primarySubject: zoteroPaper.primarySubject !== "Unsorted" ? zoteroPaper.primarySubject : localPaper.primarySubject,
    source: "vault+zotero",
    subjects: [...new Set([...(zoteroPaper.subjects || []), ...(localPaper.subjects || [])])],
    title: researchTitleIsPlaceholder(zoteroPaper.title, zoteroPaper.doi) ? localPaper.title : zoteroPaper.title,
    zoteroKey: zoteroPaper.zoteroKey,
    zoteroUrl: zoteroPaper.zoteroUrl,
  });
}

function applyResearchPaperState(paper, state) {
  const stored = state?.[paper.id] || state?.[`zotero:${paper.zoteroKey}`] || null;
  if (!stored) return paper;
  return finalizeResearchPaper({
    ...paper,
    dogEared: stored.dogEared === undefined ? paper.dogEared : Boolean(stored.dogEared),
    readingStatus: RESEARCH_READING_STATUSES.has(stored.readingStatus) ? stored.readingStatus : paper.readingStatus,
  });
}

async function listResearchLibrary({ enrich = false, force = false } = {}) {
  const localPapers = listVaultResearchPapers();
  const library = await readZoteroResearchLibrary({ force });
  const rawRemotePapers = zoteroPapers(library);
  const duplicateGroups = describeZoteroDuplicateGroups(rawRemotePapers);
  const remotePapers = collapseZoteroDuplicates(rawRemotePapers);
  const remoteByDoi = new Map(remotePapers.filter((paper) => normalizeDoi(paper.doi)).map((paper) => [normalizeDoi(paper.doi), paper]));
  const remoteByTitle = new Map(remotePapers.filter((paper) => normalizedResearchTitle(paper.title).length > 16).map((paper) => [normalizedResearchTitle(paper.title), paper]));
  const matchedRemote = new Set();
  const merged = localPapers.map((paper) => {
    const remote = remoteByDoi.get(normalizeDoi(paper.doi)) || remoteByTitle.get(normalizedResearchTitle(paper.title));
    if (remote) matchedRemote.add(remote.id);
    return mergeResearchPapers(paper, remote);
  });
  merged.push(...remotePapers.filter((paper) => !matchedRemote.has(paper.id)));

  const enriched = await Promise.all(merged.map(async (paper) => (
    applyExactResearchMetadata(paper, await metadataForDoi(paper.doi))
  )));
  const enrichment = { attempted: 0, resolved: 0, unresolved: 0 };
  if (enrich) {
    const candidates = enriched
      .map((paper, index) => ({ index, paper }))
      .filter(({ paper }) => researchPaperNeedsExactMetadata(paper));
    enrichment.attempted = candidates.length;

    // Crossref asks clients to be polite. Three requests at a time also prevents one
    // noisy refresh from silently dropping most of a library's metadata lookups.
    for (let start = 0; start < candidates.length; start += 3) {
      const batch = candidates.slice(start, start + 3);
      const completed = await Promise.all(batch.map(async ({ index, paper }) => ({
        index,
        paper: applyExactResearchMetadata(paper, await metadataForDoi(paper.doi, { allowFetch: true })),
      })));
      for (const item of completed) enriched[item.index] = item.paper;
    }
    enrichment.resolved = candidates.filter(({ index }) => !researchPaperNeedsExactMetadata(enriched[index])).length;
    enrichment.unresolved = enrichment.attempted - enrichment.resolved;
  }
  const state = safeJsonRead(RESEARCH_PAPER_STATE_PATH, {});
  const papers = enriched
    .map((paper) => applyResearchPaperState(paper, state))
    .sort((a, b) => {
      const aKnown = knownResearchValue(a.datePublished);
      const bKnown = knownResearchValue(b.datePublished);
      if (aKnown !== bKnown) return aKnown ? -1 : 1;
      return String(b.datePublished).localeCompare(String(a.datePublished)) || a.title.localeCompare(b.title);
    });

  return {
    enrichment,
    papers,
    sources: {
      duplicateCount: rawRemotePapers.length - remotePapers.length,
      duplicateGroups,
      lastSyncedAt: library.fetchedAt || null,
      mergedCount: papers.length,
      status: library.status,
      subjects: researchSubjectRecords(papers),
      vaultCount: localPapers.length,
      zoteroCount: rawRemotePapers.length,
    },
  };
}

function researchMarkdownText(value) {
  return String(value || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/[\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function replaceHorizonMarkdownBlock(raw, startMarker, endMarker, content) {
  const block = `${startMarker}\n${content.trim()}\n${endMarker}`;
  const start = raw.indexOf(startMarker);
  const end = raw.indexOf(endMarker);
  if (start >= 0 && end > start) {
    return `${raw.slice(0, start)}${block}${raw.slice(end + endMarker.length)}`;
  }
  return `${raw.replace(/\s+$/, "")}\n\n${block}\n`;
}

function normalizeResearchSubjectName(value) {
  return researchMarkdownText(value)
    .replace(/[`<>|]/g, "")
    .replace(/^[-#]+\s*/, "")
    .slice(0, 72)
    .trim();
}

function readCustomResearchSubjects() {
  if (!fs.existsSync(RESEARCH_INDEX_PATH)) return [];
  const raw = fs.readFileSync(RESEARCH_INDEX_PATH, "utf8");
  const start = raw.indexOf(RESEARCH_SUBJECTS_START);
  const end = raw.indexOf(RESEARCH_SUBJECTS_END);
  if (start < 0 || end <= start) return [];
  return [...new Set(raw
    .slice(start + RESEARCH_SUBJECTS_START.length, end)
    .split(/\r?\n/)
    .map((line) => line.match(/^-\s+(.+)$/)?.[1] || "")
    .map(normalizeResearchSubjectName)
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function writeCustomResearchSubjects(subjects) {
  fs.mkdirSync(path.dirname(RESEARCH_INDEX_PATH), { recursive: true });
  const raw = fs.existsSync(RESEARCH_INDEX_PATH)
    ? fs.readFileSync(RESEARCH_INDEX_PATH, "utf8")
    : "# Research Papers\n";
  const values = [...new Set(subjects.map(normalizeResearchSubjectName).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  if (!values.length) {
    const start = raw.indexOf(RESEARCH_SUBJECTS_START);
    const end = raw.indexOf(RESEARCH_SUBJECTS_END);
    if (start >= 0 && end > start) {
      const before = raw.slice(0, start).replace(/\s+$/, "");
      const after = raw.slice(end + RESEARCH_SUBJECTS_END.length).replace(/^\s+/, "").replace(/\s+$/, "");
      fs.writeFileSync(RESEARCH_INDEX_PATH, `${before}${after ? `\n\n${after}` : ""}\n`, "utf8");
    }
    return [];
  }
  const content = [
    "## Custom research subjects",
    "",
    "Subjects created intentionally in Horizon live in this one compact list. Paper-derived subjects remain attached to their source records.",
    "",
    ...values.map((subject) => `- ${subject}`),
  ].join("\n");
  fs.writeFileSync(
    RESEARCH_INDEX_PATH,
    replaceHorizonMarkdownBlock(raw, RESEARCH_SUBJECTS_START, RESEARCH_SUBJECTS_END, content),
    "utf8",
  );
  return values;
}

function researchSubjectRecords(papers) {
  const counts = new Map();
  for (const paper of papers || []) {
    const name = normalizeResearchSubjectName(paper.primarySubject) || "General Research";
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  const customSubjects = readCustomResearchSubjects();
  const customNames = new Set(customSubjects.map((subject) => subject.toLowerCase()));
  return [...new Set([...counts.keys(), ...customSubjects])]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      custom: customNames.has(name.toLowerCase()),
      deletable: customNames.has(name.toLowerCase()) && !counts.get(name),
      name,
      paperCount: counts.get(name) || 0,
    }));
}

function createResearchSubject(payload, papers) {
  const name = normalizeResearchSubjectName(payload?.name);
  if (!name || /^all subjects$/i.test(name)) {
    return { message: "Enter a useful subject name.", ok: false, state: "invalid_subject", statusCode: 400 };
  }
  const records = researchSubjectRecords(papers);
  if (records.some((subject) => subject.name.toLowerCase() === name.toLowerCase())) {
    return { message: `${name} already exists.`, ok: false, state: "already_exists", statusCode: 409 };
  }
  const values = writeCustomResearchSubjects([...readCustomResearchSubjects(), name]);
  return {
    message: `${name} added. It is ready for intentional organization.`,
    ok: true,
    state: "created",
    statusCode: 201,
    subject: name,
    subjects: researchSubjectRecords(papers).filter((subject) => values.includes(subject.name) || subject.paperCount),
  };
}

function deleteResearchSubject(payload, papers) {
  const requested = normalizeResearchSubjectName(payload?.name);
  const customSubjects = readCustomResearchSubjects();
  const name = customSubjects.find((subject) => subject.toLowerCase() === requested.toLowerCase());
  if (!name) {
    return { message: "Only subjects created in Horizon can be deleted here.", ok: false, state: "protected_subject", statusCode: 409 };
  }
  const record = researchSubjectRecords(papers).find((subject) => subject.name === name);
  if (record?.paperCount) {
    return {
      message: `${name} is still used by ${record.paperCount} paper${record.paperCount === 1 ? "" : "s"}. Move those papers before deleting it.`,
      ok: false,
      state: "subject_in_use",
      statusCode: 409,
    };
  }
  writeCustomResearchSubjects(customSubjects.filter((subject) => subject !== name));
  return {
    message: `${name} deleted. No papers were changed.`,
    ok: true,
    state: "deleted",
    statusCode: 200,
    subjects: researchSubjectRecords(papers).filter((subject) => subject.name !== name),
  };
}

function groupedResearchPapers(papers) {
  const groups = new Map();
  for (const paper of papers) {
    const subject = researchMarkdownText(paper.primarySubject) || "General Research";
    groups.set(subject, [...(groups.get(subject) || []), paper]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([subject, items]) => [
      subject,
      [...items].sort((a, b) => a.title.localeCompare(b.title) || a.authorLabel.localeCompare(b.authorLabel)),
    ]);
}

function writeResearchNavigationArtifacts(library) {
  const researchDir = path.join(ROOT, "Research Papers");
  fs.mkdirSync(researchDir, { recursive: true });
  const vaultPapers = library.papers.filter((paper) => paper.path);
  const zoteroPapers = library.papers.filter((paper) => paper.zoteroKey);
  const researchIdeas = listResearchIdeas();
  const today = currentToday();
  const indexPath = path.join(researchDir, "index.md");
  const existingIndex = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, "utf8") : "# Research Papers\n";
  const indexLines = [
    "## Obsidian paper notes",
    "",
    "These are the papers with a real vault note. This directory is navigational only: it reflects existing notes and does not create subject or concept files.",
    "",
  ];
  for (const [subject, papers] of groupedResearchPapers(vaultPapers)) {
    indexLines.push(`### ${subject}`, "");
    for (const paper of papers) {
      const target = paper.path.replace(/\.md$/i, "");
      const identity = `${researchMarkdownText(paper.authorLabel) || "Unknown"} (${researchMarkdownText(paper.year) || "n.d."})`;
      indexLines.push(`- [[${target}|${identity}]] — ${researchMarkdownText(paper.title)}`);
    }
    indexLines.push("");
  }
  if (researchIdeas.length) {
    indexLines.push(
      "## Research ideas",
      "",
      "These are the open questions on the Research Desk. They stay separate from citable papers until you add a real source.",
      "",
    );
    for (const idea of researchIdeas) {
      const target = idea.path.replace(/\.md$/i, "");
      indexLines.push(`- [[${target}|${researchMarkdownText(idea.topic) || "Research idea"}]]`);
    }
    indexLines.push("");
  }
  indexLines.push(
    "## Zotero Shelf",
    "",
    `[[Zotero Shelf|Browse ${zoteroPapers.length} Zotero records]] without creating one Markdown file per record. Zotero remains the source for those records; create a connected note only when you have something to add.`,
  );
  const nextIndex = replaceHorizonMarkdownBlock(
    existingIndex,
    "<!-- horizon:paper-directory:start -->",
    "<!-- horizon:paper-directory:end -->",
    indexLines.join("\n"),
  );
  if (nextIndex !== existingIndex) fs.writeFileSync(indexPath, nextIndex, "utf8");

  const shelfPath = path.join(researchDir, "Zotero Shelf.md");
  const existingShelf = fs.existsSync(shelfPath) ? fs.readFileSync(shelfPath, "utf8") : "";
  const shelfStart = "<!-- horizon:zotero-shelf:start -->";
  const shelfEnd = "<!-- horizon:zotero-shelf:end -->";
  let shelfUpdated = false;
  if (!existingShelf || existingShelf.includes(shelfStart)) {
    const shelfLines = [
      "## Browse by subject",
      "",
      "This is a compact, generated view of Zotero. It does not create separate paper notes, copy PDFs, or add tags.",
      "",
    ];
    for (const [subject, papers] of groupedResearchPapers(zoteroPapers)) {
      shelfLines.push(`### ${subject}`, "");
      for (const paper of papers) {
        const title = researchMarkdownText(paper.title) || "Untitled paper";
        const identity = `${researchMarkdownText(paper.authorLabel) || "Unknown"} (${researchMarkdownText(paper.year) || "n.d."})`;
        const url = String(paper.zoteroUrl || "").replace(/[<>]/g, "");
        const source = url ? `[${identity} — ${title}](<${url}>)` : `${identity} — ${title}`;
        const vaultLink = paper.path ? ` · [[${paper.path.replace(/\.md$/i, "")}|Obsidian note]]` : "";
        shelfLines.push(`- ${source}${vaultLink}`);
      }
      shelfLines.push("");
    }
    const shelfHeader = existingShelf || [
      "---",
      "type: zotero-library-shelf",
      "source: zotero",
      "managed_by: Horizon",
      `refreshed: ${today}`,
      "---",
      "",
      "# Zotero Shelf",
      "",
      "A readable Zotero mirror for Obsidian browsing. Zotero remains the canonical library; only papers you annotate need their own Markdown note.",
      "",
      "[[index|Back to Research Papers]]",
    ].join("\n");
    const withRefreshedHeader = existingShelf
      ? updateMarkdownFrontmatterFields(shelfHeader, { refreshed: today })
      : shelfHeader;
    const nextShelf = replaceHorizonMarkdownBlock(withRefreshedHeader, shelfStart, shelfEnd, shelfLines.join("\n"));
    if (nextShelf !== existingShelf) fs.writeFileSync(shelfPath, nextShelf, "utf8");
    shelfUpdated = true;
  }

  return {
    indexPath: vaultRelative(indexPath),
    shelfPath: vaultRelative(shelfPath),
    shelfUpdated,
    vaultPaperCount: vaultPapers.length,
    zoteroPaperCount: zoteroPapers.length,
  };
}

function safeResearchPaperPath(value) {
  const normalized = normalizeVaultRelativePath(value);
  if (!/^Research Papers\/[^/]+\.md$/i.test(normalized)) return "";
  const filePath = path.resolve(ROOT, ...normalized.split("/"));
  const root = path.resolve(ROOT, "Research Papers");
  return filePath.startsWith(`${root}${path.sep}`) ? filePath : "";
}

async function updateResearchPaperState(payload) {
  const id = String(payload.id || "").trim();
  const pathValue = String(payload.path || (id.startsWith("vault:") ? id.slice(6) : "")).trim();
  const readingStatus = String(payload.readingStatus || "").trim();
  if (readingStatus && !RESEARCH_READING_STATUSES.has(readingStatus)) {
    return { message: "Unknown reading stage.", ok: false, state: "invalid_status", statusCode: 400 };
  }
  const filePath = safeResearchPaperPath(pathValue);
  if (filePath && fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, "utf8");
    const updates = {};
    if (readingStatus) updates.reading_status = readingStatus;
    if (typeof payload.dogEared === "boolean") updates.dog_eared = payload.dogEared ? "true" : "false";
    fs.writeFileSync(filePath, updateMarkdownFrontmatterFields(raw, updates), "utf8");
    return { ok: true, state: "updated", statusCode: 200 };
  }

  const zoteroKey = String(payload.zoteroKey || (id.startsWith("zotero:") ? id.slice(7) : "")).trim();
  if (!zoteroKey) return { message: "Paper not found.", ok: false, state: "not_found", statusCode: 404 };
  const state = safeJsonRead(RESEARCH_PAPER_STATE_PATH, {});
  const key = `zotero:${zoteroKey}`;
  state[key] = {
    ...(state[key] || {}),
    ...(readingStatus ? { readingStatus } : {}),
    ...(typeof payload.dogEared === "boolean" ? { dogEared: payload.dogEared } : {}),
    updatedAt: nowIso(),
  };
  writeJson(RESEARCH_PAPER_STATE_PATH, state);
  return { ok: true, state: "updated", statusCode: 200 };
}

async function syncResearchLibrary() {
  const firstPass = await listResearchLibrary({ enrich: true, force: true });
  let updatedNotes = 0;
  for (const paper of firstPass.papers.filter((item) => item.path)) {
    const filePath = safeResearchPaperPath(paper.path);
    if (!filePath || !fs.existsSync(filePath)) continue;
    const raw = fs.readFileSync(filePath, "utf8");
    const fields = readMarkdownFrontmatter(raw);
    const updates = {};
    const setMissing = (key, value, { replacePlaceholder = false } = {}) => {
      const currentIsPlaceholder = replacePlaceholder && researchTitleIsPlaceholder(fields[key], paper.doi);
      if ((!knownResearchValue(fields[key]) || currentIsPlaceholder) && knownResearchValue(value)) {
        updates[key] = JSON.stringify(String(value));
      }
    };
    setMissing("title", paper.title, { replacePlaceholder: true });
    setMissing("authors", paper.authors.join("; "));
    setMissing("date_published", paper.datePublished);
    if (normalizeDoi(paper.doi)) setMissing("doi", normalizeDoi(paper.doi));
    setMissing("primary_subject", paper.primarySubject);
    if (paper.zoteroKey) setMissing("zotero_key", paper.zoteroKey);
    if (!RESEARCH_READING_STATUSES.has(fields.reading_status)) updates.reading_status = paper.readingStatus || "to_read";
    if (!knownResearchValue(fields.dog_eared)) updates.dog_eared = paper.dogEared ? "true" : "false";
    if (Object.keys(updates).length) {
      updates.metadata_updated = currentToday();
      fs.writeFileSync(filePath, updateMarkdownFrontmatterFields(raw, updates), "utf8");
      updatedNotes += 1;
    }
  }
  const result = await listResearchLibrary();
  const navigation = writeResearchNavigationArtifacts(result);
  return {
    ...result,
    navigation,
    sync: {
      metadataAttempted: firstPass.enrichment.attempted,
      metadataResolved: firstPass.enrichment.resolved,
      metadataUnresolved: firstPass.enrichment.unresolved,
      updatedNotes,
    },
  };
}

function copyResearchTextToClipboard(value) {
  const text = String(value || "");
  if (!text || text.length > 50000) return false;
  let result;
  if (process.platform === "win32") {
    result = childProcess.spawnSync(
      POWERSHELL,
      ["-NoProfile", "-NonInteractive", "-Command", "Set-Clipboard -Value ([Console]::In.ReadToEnd())"],
      { encoding: "utf8", input: text, windowsHide: true },
    );
  } else if (process.platform === "darwin") {
    result = childProcess.spawnSync("pbcopy", [], { encoding: "utf8", input: text });
  } else {
    result = childProcess.spawnSync("xclip", ["-selection", "clipboard"], { encoding: "utf8", input: text });
  }
  return !result.error && result.status === 0;
}

// Vault Project Registry/*.md is the maintained source
// of truth (see Project Registry/index.md convention). Cached on directory+file mtime so
// a dropped note appears on next read without a server restart.
const PROJECT_REGISTRY_DIR = path.join(ROOT, "Project Registry");
const RETIRED_PROJECT_STATUSES = new Set(["retired", "frozen-archive"]);
let projectRegistryCache = { mtimeMs: -1, projects: [] };

function firstBodyLine(raw) {
  const lines = raw.split(/\r?\n/);
  const fmEnd = raw.startsWith("---") ? lines.indexOf("---", 1) : -1;
  const bodyLines = lines.slice(fmEnd + 1);
  const line = bodyLines.find((entry) => entry.trim() && !/^#{1,6}\s/.test(entry.trim()));
  return (line || "").trim();
}

function listProjectRegistry({ includeAll = false } = {}) {
  if (!fs.existsSync(PROJECT_REGISTRY_DIR)) return [];
  const files = fs.readdirSync(PROJECT_REGISTRY_DIR).filter((name) => name.endsWith(".md") && name !== "index.md");
  const latestMtime = files.reduce((max, name) => {
    const stat = fs.statSync(path.join(PROJECT_REGISTRY_DIR, name));
    return Math.max(max, stat.mtimeMs);
  }, 0);

  if (projectRegistryCache.mtimeMs !== latestMtime || projectRegistryCache.projects.length !== files.length) {
    projectRegistryCache = {
      mtimeMs: latestMtime,
      projects: files.map((name) => {
        const filePath = path.join(PROJECT_REGISTRY_DIR, name);
        const raw = fs.readFileSync(filePath, "utf8");
        const fields = readMarkdownFrontmatter(raw);
        const id = path.basename(name, ".md");
        // Count capture bullets under "## Captures" so Projects can show attached activity.
        const capturesSection = raw.split(/^## Captures\s*$/m)[1] || "";
        const capturesBlock = capturesSection.split(/^## /m)[0] || "";
        const captures = (capturesBlock.match(/^- /gm) || []).length;
        return {
          captures,
          description: firstBodyLine(raw).slice(0, 160),
          id,
          location: fields.location || "",
          name: fields.project || id,
          path: `Project Registry/${name}`,
          status: fields.status || "active",
          type: fields.type || "",
          updated: fields.updated || "",
        };
      }),
    };
  }

  const projects = projectRegistryCache.projects.filter((project) => project.type === "project-registry");
  return includeAll ? projects : projects.filter((project) => !RETIRED_PROJECT_STATUSES.has(project.status));
}

function findProjectRegistryEntry(identifier) {
  const needle = String(identifier || "").trim().toLowerCase();
  if (!needle) return null;
  const projects = listProjectRegistry({ includeAll: true });
  return projects.find((project) => project.id.toLowerCase() === needle || project.name.toLowerCase() === needle) || null;
}

function updateMarkdownFrontmatterFields(raw, updates) {
  const eol = String(raw || "").includes("\r\n") ? "\r\n" : "\n";
  const lines = String(raw || "").replace(/\r\n/g, "\n").split("\n");
  if (lines[0] !== "---") throw new Error("Project registry note is missing frontmatter.");
  let closingIndex = lines.indexOf("---", 1);
  if (closingIndex < 0) throw new Error("Project registry note has incomplete frontmatter.");

  for (const [key, value] of Object.entries(updates)) {
    const fieldIndex = lines.slice(1, closingIndex).findIndex((line) => line.startsWith(`${key}:`));
    if (fieldIndex >= 0) {
      lines[fieldIndex + 1] = `${key}: ${value}`;
    } else {
      lines.splice(closingIndex, 0, `${key}: ${value}`);
      closingIndex += 1;
    }
  }

  return lines.join(eol);
}

function updateProjectRegistryStatus(identifier, status) {
  const allowedStatuses = new Set(["active", "dormant", "retired"]);
  if (!allowedStatuses.has(status)) return { ok: false, state: "invalid_status", statusCode: 400 };

  const entry = findProjectRegistryEntry(identifier);
  if (!entry) return { ok: false, state: "not_found", statusCode: 404 };

  const fileName = path.basename(entry.path);
  const filePath = path.resolve(PROJECT_REGISTRY_DIR, fileName);
  const registryRoot = path.resolve(PROJECT_REGISTRY_DIR);
  if (!filePath.startsWith(`${registryRoot}${path.sep}`)) {
    return { ok: false, state: "invalid_path", statusCode: 400 };
  }

  const raw = fs.readFileSync(filePath, "utf8");
  fs.writeFileSync(
    filePath,
    updateMarkdownFrontmatterFields(raw, { status, updated: currentToday() }),
    "utf8",
  );
  projectRegistryCache = { mtimeMs: -1, projects: [] };

  return {
    message: status === "retired" ? `${entry.name} retired.` : `${entry.name} restored to ${status}.`,
    ok: true,
    project: listProjectRegistry({ includeAll: true }).find((project) => project.id === entry.id),
    state: "updated",
    statusCode: 200,
  };
}

// Appends `line` at the end of a `## <heading>` section (before the next heading, or EOF
// if the section doesn't exist yet). Existing content is left in place.
function appendLineToMarkdownSection(raw, heading, line) {
  const lines = raw.split(/\r?\n/);
  const headingLine = `## ${heading}`;
  const headingIndex = lines.findIndex((entry) => entry.trim() === headingLine);

  if (headingIndex === -1) {
    const trimmed = raw.replace(/\s+$/, "");
    return `${trimmed}\n\n${headingLine}\n${line}\n`;
  }

  let insertAt = lines.length;
  for (let i = headingIndex + 1; i < lines.length; i += 1) {
    if (/^#{1,6}\s/.test(lines[i])) {
      insertAt = i;
      break;
    }
  }
  while (insertAt > headingIndex + 1 && lines[insertAt - 1].trim() === "") insertAt -= 1;
  lines.splice(insertAt, 0, line);
  return lines.join("\n");
}

function applyProjectAttachCaptureAction(action, capture, text) {
  const payload = action.payload || {};
  const match = findProjectRegistryEntry(payload.project);
  if (!match) return null;

  const filePath = path.join(ROOT, ...match.path.split("/"));
  const raw = fs.readFileSync(filePath, "utf8");
  const preview = String(payload.body || text).trim().replace(/\s+/g, " ").slice(0, 140);
  const line = `- ${currentToday()}: ${preview} ([[${capture.capture.replace(/\.md$/, "")}]])`;
  fs.writeFileSync(filePath, appendLineToMarkdownSection(raw, "Captures", line), "utf8");

  return { line, project: match.name, relPath: match.path };
}

function zoteroItemTypeFromAction(action, text) {
  const payload = action.payload || {};
  const requested = String(payload.zotero_item_type || payload.category || "").trim();
  const allowed = new Set(["journalArticle", "webpage", "document", "book", "bookSection", "conferencePaper", "report", "thesis"]);
  if (allowed.has(requested)) return requested;

  const doi = String(payload.doi || firstDoiFromText(text)).trim();
  const url = String(payload.url || payload.source || firstUrlFromText(text)).trim();
  if (doi) return "journalArticle";
  if (url && /^https?:\/\//i.test(url)) return "webpage";
  return "document";
}

function zoteroCreatorsFromText(value) {
  return String(value || "")
    .split(/[;\n]+/)
    .map((name) => name.trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((name) => ({ creatorType: "author", name }));
}

function fillZoteroTemplate(template, fields) {
  const item = { ...template };
  const setIfPresent = (key, value) => {
    const text = String(value || "").trim();
    if (text && Object.prototype.hasOwnProperty.call(item, key)) item[key] = text;
  };

  setIfPresent("title", fields.title);
  setIfPresent("abstractNote", fields.body);
  setIfPresent("url", fields.url);
  setIfPresent("DOI", fields.doi);
  setIfPresent("date", fields.date);
  setIfPresent("publicationTitle", fields.publicationTitle);
  setIfPresent("websiteTitle", fields.publicationTitle);
  setIfPresent("accessDate", fields.url ? "CURRENT_TIMESTAMP" : "");

  if (Array.isArray(item.creators)) {
    const creators = zoteroCreatorsFromText(fields.authors);
    if (creators.length) item.creators = creators;
  }

  // Keep Zotero taxonomy human-owned. Horizon uses collections as broad subjects and
  // does not add arbitrary machine tags to every captured item.
  if (Array.isArray(item.tags)) item.tags = [];

  if (Object.prototype.hasOwnProperty.call(item, "extra")) {
    item.extra = [
      fields.extra,
      fields.doi && !Object.prototype.hasOwnProperty.call(item, "DOI") ? `DOI: ${fields.doi}` : "",
      fields.source && fields.source !== fields.url ? `Source: ${fields.source}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return item;
}

async function applyZoteroCaptureAction(action, capture, text) {
  const settings = mergedIntegrationSettings("zotero");
  const zoteroUserId = String(settings.zoteroUserId || "").trim();
  const zoteroApiKey = String(settings.zoteroApiKey || "").trim();
  if (!zoteroUserId || !zoteroApiKey || settings.zoteroAccess?.write !== true) {
    throw new Error("Zotero is not connected with personal-library write access. Reconnect one Horizon key in Settings > Integrations > Zotero.");
  }

  const payload = action.payload || {};
  const title = String(payload.title || action.label || capture.title || "Horizon Capture").trim();
  const source = String(payload.source || "").trim();
  const url = String(payload.url || source || firstUrlFromText(text)).trim();
  const doi = normalizeDoi(payload.doi || firstDoiFromText(text));
  const metadata = await metadataForDoi(doi, { allowFetch: true });
  const capturedBody = String(payload.body || "").trim();
  const itemType = zoteroItemTypeFromAction(action, text);
  const templateResponse = await fetch(`https://api.zotero.org/items/new?itemType=${encodeURIComponent(itemType)}`, {
    headers: { "Zotero-API-Version": "3" },
  });
  const template = await templateResponse.json().catch(() => null);
  if (!templateResponse.ok || !template || typeof template !== "object") {
    throw new Error(`Zotero item template request failed with HTTP ${templateResponse.status}.`);
  }

  const zoteroItem = fillZoteroTemplate(template, {
    authors: payload.authors || metadata?.authors?.join("; "),
    body: metadata?.abstract || (capturedBody && capturedBody !== text.trim() ? capturedBody : "") || action.reason || text,
    date: payload.date || metadata?.datePublished,
    doi,
    extra: `Created from Horizon Capture.\nSource capture: ${capture.capture}`,
    publicationTitle: payload.publication_title || metadata?.publicationTitle,
    source,
    title: researchTitleIsPlaceholder(title, doi) ? metadata?.title || title : title,
    url,
  });

  const writeToken = crypto.randomBytes(16).toString("hex");
  const writeResponse = await fetch(`https://api.zotero.org/users/${encodeURIComponent(zoteroUserId)}/items`, {
    body: JSON.stringify([zoteroItem]),
    headers: {
      "content-type": "application/json",
      "Zotero-API-Key": zoteroApiKey,
      "Zotero-API-Version": "3",
      "Zotero-Write-Token": writeToken,
    },
    method: "POST",
  });
  const writeBody = await writeResponse.json().catch(() => ({}));
  const failed = writeBody?.failed?.["0"];
  if (!writeResponse.ok || failed) {
    const message = failed?.message || writeBody?.message || `Zotero write failed with HTTP ${writeResponse.status}.`;
    throw new Error(message);
  }

  const itemKey = writeBody?.success?.["0"] || writeBody?.successful?.["0"]?.key || writeBody?.successful?.["0"];
  if (!itemKey) {
    throw new Error("Zotero did not return a created item key.");
  }

  const zoteroUrl = `https://www.zotero.org/users/${encodeURIComponent(zoteroUserId)}/items/${encodeURIComponent(itemKey)}`;
  try { fs.unlinkSync(RESEARCH_LIBRARY_CACHE_PATH); } catch { /* no cache yet */ }

  return {
    itemKey,
    itemType,
    relPath: "",
    zoteroUrl,
  };
}

const CAPTURE_UNDO_PATH_PREFIXES = ["Inbox/", "Calendar/Items/", "Runs/CaptureQueue/", "Research Papers/"];

function normalizeVaultRelativePath(value) {
  const normalized = path.posix.normalize(String(value || "").replace(/\\/g, "/").replace(/^\/+/, ""));
  if (!normalized || normalized === "." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) return "";
  return normalized;
}

function undoableCaptureFile(relativePath) {
  const normalized = normalizeVaultRelativePath(relativePath);
  if (!normalized || !CAPTURE_UNDO_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return null;
  const absolutePath = path.resolve(ROOT, ...normalized.split("/"));
  const root = path.resolve(ROOT);
  if (absolutePath !== root && !absolutePath.startsWith(`${root}${path.sep}`)) return null;
  return { absolutePath, relativePath: normalized };
}

function captureUndoFilesFromOutputs(outputs) {
  const files = [];
  const seen = new Set();
  for (const output of outputs || []) {
    const undoable = undoableCaptureFile(output?.path);
    if (!undoable) return [];
    if (!fs.existsSync(undoable.absolutePath) || !fs.statSync(undoable.absolutePath).isFile()) return [];
    if (!seen.has(undoable.relativePath)) {
      seen.add(undoable.relativePath);
      files.push(undoable.relativePath);
    }
  }
  return files;
}

function readCaptureActionHistory() {
  const history = safeJsonRead(CAPTURE_ACTION_HISTORY_PATH, null);
  return {
    actions: Array.isArray(history?.actions) ? history.actions.slice(-100) : [],
    updatedAt: history?.updatedAt || null,
    version: 1,
  };
}

function saveCaptureActionHistory(history) {
  writeJson(CAPTURE_ACTION_HISTORY_PATH, {
    actions: (Array.isArray(history.actions) ? history.actions : []).slice(-100),
    updatedAt: nowIso(),
    version: 1,
  });
}

function recordCaptureUndo(action, outputs, refreshCalendar, message) {
  const files = captureUndoFilesFromOutputs(outputs);
  if (!files.length) {
    return {
      available: false,
      label: "Undo unavailable for this action",
      reason: "At least one visible output cannot be safely removed as a whole file.",
    };
  }

  const token = crypto.randomUUID();
  const history = readCaptureActionHistory();
  history.actions.push({
    actionType: action.type,
    createdAt: nowIso(),
    files,
    message,
    refreshCalendar: Boolean(refreshCalendar),
    token,
    used: false,
  });
  saveCaptureActionHistory(history);

  return {
    available: true,
    files,
    label: "Undo local files",
    token,
  };
}

// attach_to_project's registry-note append isn't a whole-file undo (the note pre-exists
// and is an existing document) - kind: "line_patch" undo removes just
// the one appended line instead of deleting the file.
function recordProjectAttachUndo(action, attachResult, message) {
  const token = crypto.randomUUID();
  const history = readCaptureActionHistory();
  history.actions.push({
    actionType: action.type,
    createdAt: nowIso(),
    file: attachResult.relPath,
    kind: "line_patch",
    line: attachResult.line,
    message,
    refreshCalendar: false,
    token,
    used: false,
  });
  saveCaptureActionHistory(history);

  return {
    available: true,
    files: [attachResult.relPath],
    label: "Undo local files",
    token,
  };
}

function undoableProjectRegistryFile(relativePath) {
  const normalized = normalizeVaultRelativePath(relativePath);
  if (!normalized || !normalized.startsWith("Project Registry/")) return null;
  const absolutePath = path.resolve(ROOT, ...normalized.split("/"));
  const root = path.resolve(ROOT);
  if (absolutePath !== root && !absolutePath.startsWith(`${root}${path.sep}`)) return null;
  return { absolutePath, relativePath: normalized };
}

function undoLinePatchAction(entry, history) {
  const undoable = undoableProjectRegistryFile(entry.file);
  if (!undoable) throw new Error(`Refusing to undo unsafe path: ${entry.file}`);

  let removed = [];
  if (fs.existsSync(undoable.absolutePath)) {
    const raw = fs.readFileSync(undoable.absolutePath, "utf8");
    const lines = raw.split(/\r?\n/);
    const lineIndex = lines.lastIndexOf(entry.line);
    if (lineIndex !== -1) {
      lines.splice(lineIndex, 1);
      fs.writeFileSync(undoable.absolutePath, lines.join("\n"), "utf8");
      removed = [entry.file];
    }
  }

  entry.used = true;
  entry.usedAt = nowIso();
  entry.removed = removed;
  saveCaptureActionHistory(history);

  writeIntegrationRunLog({
    actionId: `capture.undo.${entry.actionType || "action"}`,
    integrationId: "ai-agent",
    inputsSummary: `Undid capture action ${entry.token}.`,
    outputsSummary: removed.length ? `Removed appended line from ${entry.file}.` : "Appended line was not found (already edited).",
    status: "success",
  });

  return {
    message: removed.length ? `Removed the appended line from ${entry.file}.` : "Undo completed. The appended line was not found (already edited).",
    ok: true,
    refreshCalendar: false,
    removed,
    state: "undone",
  };
}

function pruneCaptureQueueIndex(removed) {
  if (!fs.existsSync(CAPTURE_QUEUE_INDEX)) return;
  const queueNames = (removed || [])
    .filter((item) => item.startsWith("Runs/CaptureQueue/"))
    .map((item) => path.basename(item, ".md"));
  if (!queueNames.length) return;
  const lines = fs.readFileSync(CAPTURE_QUEUE_INDEX, "utf8").split(/\r?\n/);
  const filtered = lines.filter((line) => !queueNames.some((name) => line.includes(`[[${name}|`) || line.includes(`[[${name}]]`)));
  fs.writeFileSync(CAPTURE_QUEUE_INDEX, filtered.join("\n"), "utf8");
}

function undoCaptureAction(payload) {
  const token = String(payload?.token || "").trim();
  if (!token) return { ok: false, message: "Undo token is required.", state: "missing_token" };

  const history = readCaptureActionHistory();
  const entry = history.actions.find((item) => item.token === token);
  if (!entry) return { ok: false, message: "Undo record was not found.", state: "not_found" };
  if (entry.used) return { ok: false, message: "This capture action was already undone.", state: "already_undone" };

  if (entry.kind === "line_patch") return undoLinePatchAction(entry, history);

  const removed = [];
  for (const relativePath of entry.files || []) {
    const undoable = undoableCaptureFile(relativePath);
    if (!undoable) throw new Error(`Refusing to undo unsafe path: ${relativePath}`);
    if (fs.existsSync(undoable.absolutePath)) {
      const stat = fs.statSync(undoable.absolutePath);
      if (!stat.isFile()) throw new Error(`Refusing to undo non-file path: ${relativePath}`);
      fs.unlinkSync(undoable.absolutePath);
      removed.push(undoable.relativePath);
    }
  }

  pruneCaptureQueueIndex(removed);
  if (entry.refreshCalendar) writeNow(listItems());

  entry.used = true;
  entry.usedAt = nowIso();
  entry.removed = removed;
  saveCaptureActionHistory(history);

  writeIntegrationRunLog({
    actionId: `capture.undo.${entry.actionType || "action"}`,
    integrationId: "ai-agent",
    inputsSummary: `Undid capture action ${token}.`,
    outputsSummary: removed.join(", ") || "No files needed removal.",
    status: "success",
  });

  return {
    message: removed.length ? `Removed ${removed.length} local file${removed.length === 1 ? "" : "s"}.` : "Undo completed. No files needed removal.",
    ok: true,
    refreshCalendar: Boolean(entry.refreshCalendar),
    removed,
    state: "undone",
  };
}

function writeCaptureInboxNote(action, capture, text, title) {
  const connectionLines = normalizeConnectionInput(action.payload?.connections)
    .split("\n")
    .filter(Boolean)
    .map((target) => `- [[${target}]]`);
  return writeInboxNote(
    title,
    [
      {
        heading: "## What Horizon Will Do",
        lines: [captureActionPlan(action)],
      },
      {
        heading: "## Cleaned Capture",
        lines: [String(action.payload?.body || text).trim()],
      },
      ...(connectionLines.length
        ? [{ heading: "## Connections", lines: connectionLines }]
        : []),
      {
        heading: "## Triage",
        lines: [
          `- Action type: ${action.type}`,
          `- Confidence: ${action.confidence}`,
          `- Reason: ${action.reason || "No reason provided."}`,
          `- Source capture: [[${capture.capture.replace(/\.md$/, "")}]]`,
        ],
      },
    ],
    action.type,
  );
}

async function applyCaptureAction(payload) {
  const text = String(payload.text || "").trim();
  if (!text) return { ok: false, message: "Capture text is required.", state: "missing_text" };

  const action = normalizeCaptureAction(payload.action, text);
  // Dispatch metadata comes from the registry; executor implementations live below.
  const definition = captureActionById(action.type);
  const queue = definition.queueLike;
  const capture = writeCapturePacket(
    { kind: "triaged", status: queue ? "pending_review" : "triaged", text },
    { queue },
  );
  const title = String(action.payload?.title || action.label || capture.title || "Capture").trim();
  const outputs = [{ label: "Raw capture saved", path: capture.capture }];
  let message = "Capture action completed.";
  let refreshCalendar = false;
  let projectAttachResult = null;

  if (definition.executor === "calendar") {
    const calendarResult = applyCalendarCaptureAction(action, capture);
    outputs.push({ label: "Calendar item created", path: calendarResult.relPath });
    refreshCalendar = true;
    message = "Calendar item created in RCF.";
  } else if (definition.executor === "zotero") {
    let zoteroResult;
    try {
      zoteroResult = await applyZoteroCaptureAction(action, capture, text);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Zotero action failed.";
      writeIntegrationRunLog({
        actionId: `capture.apply.${action.type}`,
        errors: [errorMessage],
        integrationId: "zotero",
        inputsSummary: `Failed to apply Zotero action for ${text.length} capture characters.`,
        outputsSummary: errorMessage,
        status: "failed",
      });
      return {
        capture,
        message: errorMessage,
        ok: false,
        outputs,
        state: "zotero_failed",
      };
    }
    outputs.push({ label: "Zotero item created", path: zoteroResult.zoteroUrl });
    if (zoteroResult.relPath) outputs.push({ label: "Local Zotero note created", path: zoteroResult.relPath });
    message = `Zotero item created (${zoteroResult.itemKey}).`;
  } else if (definition.executor === "behavior_rule") {
    const relPath = appendBehaviorRule(title, [
      String(action.payload?.body || action.reason || text).trim(),
      "",
      `- Source capture: [[${capture.capture.replace(/\.md$/, "")}]]`,
    ]);
    outputs.push({ label: "Behavior rule saved", path: relPath });
    message = "Behavior rule saved locally.";
  } else if (definition.executor === "research_paper") {
    const researchResult = await applyResearchPaperCaptureAction(action, capture, text);
    outputs.push({ label: "Research note saved", path: researchResult.relPath });
    message = `Research note saved (${researchResult.citekey}).`;
  } else if (definition.executor === "research_idea") {
    const ideaResult = applyResearchIdeaCaptureAction(action, capture, text);
    outputs.push({ label: "Research idea saved", path: ideaResult.relPath });
    message = "Research idea saved to Research Papers/Ideas.";
  } else if (definition.executor === "queue") {
    if (capture.queue) outputs.push({ label: "Review queue item created", path: capture.queue });
    message = action.type === "ask_clarification" ? "Capture queued for clarification." : "Capture queued for review.";
  } else if (definition.executor === "project_attach") {
    // attach_to_project: append to the matched vault Project Registry/*.md note. Falls
    // back to a staged inbox note (old behavior) if payload.project matches no project.
    projectAttachResult = applyProjectAttachCaptureAction(action, capture, text);
    if (projectAttachResult) {
      outputs.push({ label: "Project registry note updated", path: projectAttachResult.relPath });
      message = `Attached to project registry note (${projectAttachResult.project}).`;
    } else {
      const relPath = writeCaptureInboxNote(action, capture, text, title);
      outputs.push({ label: "Local note created", path: relPath });
      message = "Capture saved as a local markdown note (no matching project found).";
    }
  } else {
    // executor "inbox_note" (save_note, create_project, organize_file, draft_email, and
    // any future note-writing action).
    const relPath = writeCaptureInboxNote(action, capture, text, title);
    outputs.push({ label: "Local note created", path: relPath });
    message = "Capture saved as a local markdown note.";
  }

  writeIntegrationRunLog({
    actionId: `capture.apply.${action.type}`,
    integrationId: action.type === "add_to_zotero" ? "zotero" : "ai-agent",
    inputsSummary: `Applied ${action.type} action for ${text.length} capture characters.`,
    outputsSummary: outputs.map((output) => output.path).join(", "),
    status: "success",
  });

  const undo = projectAttachResult
    ? recordProjectAttachUndo(action, projectAttachResult, message)
    : recordCaptureUndo(action, outputs, refreshCalendar, message);
  let queueSource = null;
  let queueCleanupError = "";

  if (payload.queueSource?.id) {
    try {
      const cleanup = deleteIncomingCaptureQueueFile(payload.queueSource.id);
      queueSource = {
        deleted: Boolean(cleanup.deleted),
        id: cleanup.id,
        path: payload.queueSource.path || `Inbox/To Triage/${cleanup.id}`,
        state: cleanup.state,
      };
    } catch (error) {
      queueCleanupError = error instanceof Error ? error.message : "Capture queue source could not be removed.";
      message = `${message} Queue cleanup needs attention: ${queueCleanupError}`;
    }
  }

  return {
    action,
    capture,
    explanation: captureActionPlan(action),
    message,
    ok: true,
    outputs,
    queueCleanupError,
    queueSource,
    refreshCalendar,
    state: "applied",
    undo,
  };
}

function sendJson(res, status, data) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function requestHasBody(req) {
  const contentLength = Number(req.headers["content-length"] || 0);
  return Boolean(req.headers["transfer-encoding"]) || (Number.isFinite(contentLength) && contentLength > 0);
}

function mutationRequestIsAllowed(req, res) {
  if (!MUTATION_METHODS.has(String(req.method || "").toUpperCase())) return true;

  const origin = String(req.headers.origin || "").trim();
  const fetchSite = String(req.headers["sec-fetch-site"] || "").trim().toLowerCase();
  const trustedCaller = origin
    ? origin === TRUSTED_APP_ORIGIN
    : fetchSite === "same-origin" || (ALLOW_ORIGINLESS_MUTATIONS && !fetchSite);

  if (!trustedCaller) {
    sendJson(res, 403, { message: "This change can only be made from the Horizon app.", ok: false });
    return false;
  }

  if (requestHasBody(req) && !String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    sendJson(res, 415, { message: "Horizon change requests must use JSON.", ok: false });
    return false;
  }

  return true;
}

function sendConstellation(res) {
  const headers = {
    "cache-control": "no-store, max-age=0",
    "content-security-policy": "frame-ancestors 'self'",
    "content-type": "text/html; charset=utf-8",
    "x-frame-options": "SAMEORIGIN",
    "x-robots-tag": "noindex, nofollow",
  };

  const bundledPath = CONSTELLATION_BUNDLED_PATHS.find((candidate) => fs.existsSync(candidate));
  const constellationPath = bundledPath || (fs.existsSync(DEVELOPMENT_SANDBOX_INDEX_PATH) ? DEVELOPMENT_SANDBOX_INDEX_PATH : "");
  if (constellationPath) {
    res.writeHead(200, {
      ...headers,
      "x-horizon-constellation-source": bundledPath ? "bundled" : "legacy-local",
    });
    fs.createReadStream(constellationPath).pipe(res);
    return;
  }

  res.writeHead(200, headers);
  res.end(`<!doctype html>
<html><head><meta charset="utf-8"><title>Constellation</title><style>
html,body{height:100%;margin:0}body{display:grid;place-items:center;background:#030812;color:#dbeafe;font:14px Inter,Segoe UI,sans-serif}
main{max-width:520px;padding:28px;text-align:center}p{color:#7f8da3;line-height:1.6}
</style></head><body><main><h1>Constellation</h1><p>The Constellation interface is unavailable. Rebuild Horizon, then reload this workspace.</p></main></body></html>`);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sendOAuthHtml(res, status, title, message) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  res.end(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #030812; color: #e5edf8; font-family: Inter, Segoe UI, Arial, sans-serif; }
      main { width: min(520px, calc(100vw - 40px)); border: 1px solid rgba(56, 189, 248, .25); border-radius: 18px; background: rgba(8, 20, 33, .92); padding: 28px; box-shadow: 0 24px 80px rgba(0,0,0,.42); }
      h1 { margin: 0 0 10px; font-size: 22px; }
      p { margin: 0; line-height: 1.55; color: #b8c4d6; }
      p.fallback { display: none; margin-top: 12px; color: #7f8da3; font-size: 13px; }
      button { margin-top: 22px; height: 38px; border: 1px solid rgba(56, 189, 248, .4); border-radius: 10px; background: rgba(56, 189, 248, .14); color: white; padding: 0 16px; cursor: pointer; }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      <p class="fallback" id="fallback">If your browser keeps this tab open, you can close it now.</p>
      <button onclick="window.close()">Close this tab</button>
    </main>
    <script>
      window.setTimeout(() => {
        window.close();
        window.setTimeout(() => {
          const fallback = document.getElementById("fallback");
          if (fallback) fallback.style.display = "block";
        }, 500);
      }, 1800);
    </script>
  </body>
</html>`);
}

function staticRoot() {
  const distIndex = path.join(DIST_DIR, "index.html");
  if (fs.existsSync(distIndex)) return DIST_DIR;
  return LEGACY_PUBLIC_DIR;
}

function sendStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const root = path.resolve(staticRoot());
  let filePath = path.resolve(root, `.${requested}`);

  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if ((!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) && !path.extname(requested)) {
    filePath = path.join(root, "index.html");
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("Build not found. Run `npm install` and `npm run build` inside Dashboard.");
    return;
  }

  const ext = path.extname(filePath);
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".map": "application/json; charset=utf-8",
    ".woff2": "font/woff2",
  };
  const headers = { "content-type": types[ext] || "application/octet-stream" };
  if (ext === ".html" || ext === ".webmanifest" || ext === ".json") {
    headers["cache-control"] = "no-store, max-age=0";
  } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
    headers["cache-control"] = "public, max-age=31536000, immutable";
  } else {
    headers["cache-control"] = "no-cache";
  }

  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    let rejected = false;
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 2_000_000 && !rejected) {
        rejected = true;
        reject(new Error("Request too large"));
      }
    });
    req.on("end", () => {
      if (rejected) return;
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Invalid JSON request body."));
      }
    });
    req.on("error", reject);
  });
}

const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
const FILE_BROWSER_LIMIT = 250;

const FILE_BROWSER_SKIP_NAMES = new Set([
  ".git",
  ".obsidian",
  ".vite",
  "dist",
  "native-dist",
  "node_modules",
  "out",
  "test-results",
  "tmp",
]);

function firstExistingPath(candidates) {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || "";
}

function fileBrowserRootDefinitions(sourceId) {
  if (sourceId === "local") {
    const home = os.homedir();
    const oneDrive = process.env.OneDrive || process.env.OneDriveCommercial || process.env.OneDriveConsumer || "";
    const roots = [
      { key: "home", label: "Home", path: home },
      {
        key: "desktop",
        label: "Desktop",
        path: firstExistingPath([path.join(oneDrive, "Desktop"), path.join(home, "OneDrive", "Desktop"), path.join(home, "Desktop")]),
      },
      {
        key: "documents",
        label: "Documents",
        path: firstExistingPath([path.join(oneDrive, "Documents"), path.join(home, "OneDrive", "Documents"), path.join(home, "Documents")]),
      },
      { key: "downloads", label: "Downloads", path: path.join(home, "Downloads") },
      { key: "onedrive", label: "OneDrive", path: oneDrive },
      { key: "horizon", label: "Horizon Vault", path: ROOT },
    ];
    const seen = new Set();
    return roots
      .filter((root) => root.path && fs.existsSync(root.path))
      .filter((root) => {
        const resolved = path.resolve(root.path).toLowerCase();
        if (seen.has(resolved)) return false;
        seen.add(resolved);
        return true;
      });
  }

  if (sourceId === "obsidian") {
    const settings = mergedIntegrationSettings("obsidian");
    return [{ key: "vault", label: "Vault", path: String(settings.vaultPath || ROOT).trim() }];
  }

  if (sourceId === "research") {
    const settings = mergedIntegrationSettings("research");
    return [{ key: "research", label: "Research Library", path: String(settings.sourcePath || RESEARCH_NOTES_PATH).trim() }];
  }

  return [];
}

function sourceDisplay(sourceId) {
  if (sourceId === "obsidian") {
    return {
      detail: "Obsidian vault",
      title: "Obsidian Vault",
      status: "Vault browser",
    };
  }
  if (sourceId === "google-drive") {
    return {
      detail: "Google Drive",
      title: "Google Drive",
      status: "Drive browser",
    };
  }
  if (sourceId === "research") {
    return {
      detail: "Research sources",
      title: "Research Library",
      status: "Folder browser",
    };
  }
  return {
    detail: "This PC",
    title: "Local Files",
    status: "Local browser",
  };
}

function toBrowserPath(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/g, "");
}

function browserPathJoin(...parts) {
  return toBrowserPath(parts.filter(Boolean).join("/"));
}

function resolveInsideRoot(rootPath, relativePath = "") {
  const root = path.resolve(rootPath);
  const normalizedRelative = path.normalize(toBrowserPath(relativePath).replace(/\//g, path.sep));
  if (path.isAbsolute(normalizedRelative) || normalizedRelative.startsWith("..")) {
    throw new Error("That path is outside the selected source.");
  }

  const target = path.resolve(root, normalizedRelative === "." ? "" : normalizedRelative);
  const relativeFromRoot = path.relative(root, target);
  if (relativeFromRoot && (relativeFromRoot.startsWith("..") || path.isAbsolute(relativeFromRoot))) {
    throw new Error("That path is outside the selected source.");
  }
  return { root, target };
}

function formatBrowserDate(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function formatBrowserSize(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 || unitIndex === 0 ? Math.round(size) : size.toFixed(1)} ${units[unitIndex]}`;
}

function fileTypeForName(name, mimeType = "") {
  if (mimeType === DRIVE_FOLDER_MIME) return "Folder";
  const googleMime = {
    "application/vnd.google-apps.document": "Google Doc",
    "application/vnd.google-apps.drawing": "Google Drawing",
    "application/vnd.google-apps.form": "Google Form",
    "application/vnd.google-apps.jam": "Google Jam",
    "application/vnd.google-apps.presentation": "Google Slides",
    "application/vnd.google-apps.script": "Apps Script",
    "application/vnd.google-apps.shortcut": "Drive Shortcut",
    "application/vnd.google-apps.spreadsheet": "Google Sheet",
  }[mimeType];
  if (googleMime) return googleMime;

  const ext = path.extname(String(name || "")).toLowerCase();
  const labels = {
    ".csv": "CSV",
    ".doc": "Word",
    ".docx": "Word",
    ".html": "HTML",
    ".ics": "Calendar",
    ".jpeg": "Image",
    ".jpg": "Image",
    ".json": "JSON",
    ".md": "Markdown",
    ".pdf": "PDF",
    ".png": "Image",
    ".ppt": "PowerPoint",
    ".pptx": "PowerPoint",
    ".txt": "Text",
    ".xls": "Excel",
    ".xlsx": "Excel",
    ".zip": "Archive",
  };
  return labels[ext] || (ext ? `${ext.slice(1).toUpperCase()} file` : "File");
}

function sourceContextLabels(sourceId) {
  if (sourceId === "obsidian") return ["Vault"];
  if (sourceId === "google-drive") return ["Drive"];
  if (sourceId === "research") return ["Research"];
  return ["Local"];
}

function makeFsBreadcrumbs(root, relativePath) {
  const breadcrumbs = [{ label: root.label, rootKey: root.key, path: "" }];
  const segments = toBrowserPath(relativePath).split("/").filter(Boolean);
  let current = "";
  for (const segment of segments) {
    current = browserPathJoin(current, segment);
    breadcrumbs.push({ label: segment, rootKey: root.key, path: current });
  }
  return breadcrumbs;
}

function normalizeFsBrowserItem(sourceId, root, parentRelativePath, entry, stat) {
  const itemPath = browserPathJoin(parentRelativePath, entry.name);
  const isFolder = entry.isDirectory();
  return {
    appActionLabel: isFolder ? "Open folder" : "Open",
    context: sourceContextLabels(sourceId),
    description: isFolder ? `Browse ${entry.name}.` : `${fileTypeForName(entry.name)} in ${root.label}.`,
    fileType: isFolder ? "Folder" : fileTypeForName(entry.name),
    id: `${sourceId}:${root.key}:${itemPath}`,
    kind: isFolder ? "folder" : "file",
    modified: formatBrowserDate(stat.mtime),
    name: entry.name,
    parentPath: toBrowserPath(parentRelativePath),
    path: itemPath,
    related: [],
    rootKey: root.key,
    size: isFolder ? "" : formatBrowserSize(stat.size),
    sourceId,
  };
}

function shouldSkipBrowserEntry(sourceId, name) {
  if (sourceId === "local") return false;
  return FILE_BROWSER_SKIP_NAMES.has(name);
}

async function listFilesystemBrowserSource({ sourceId, rootKey, relativePath, query }) {
  const roots = fileBrowserRootDefinitions(sourceId);
  const display = sourceDisplay(sourceId);
  if (!roots.length) {
    return { ok: false, message: "No folders are configured for this source.", sourceId, state: "missing_source" };
  }

  const root = roots.find((candidate) => candidate.key === rootKey) || roots[0];
  if (!root.path || !fs.existsSync(root.path)) {
    return {
      breadcrumbs: [{ label: root.label, rootKey: root.key, path: "" }],
      items: [],
      message: `${root.label} is not available. Configure this source in Settings.`,
      ok: false,
      rootKey: root.key,
      roots: roots.map(({ key, label, path: rootPath }) => ({ key, label, path: rootPath })),
      sourceId,
      state: "missing_path",
      subtitle: root.path || "No path configured",
      title: display.title,
    };
  }

  const { target } = resolveInsideRoot(root.path, relativePath);
  const stat = fs.statSync(target);
  if (!stat.isDirectory()) {
    return {
      message: "Select a folder to browse.",
      ok: false,
      sourceId,
      state: "not_folder",
      title: display.title,
    };
  }

  const queryText = String(query || "").trim().toLowerCase();
  const entries = fs
    .readdirSync(target, { withFileTypes: true })
    .filter((entry) => !shouldSkipBrowserEntry(sourceId, entry.name))
    .filter((entry) => !queryText || entry.name.toLowerCase().includes(queryText))
    .map((entry) => {
      try {
        const entryPath = path.join(target, entry.name);
        return normalizeFsBrowserItem(sourceId, root, relativePath, entry, fs.statSync(entryPath));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    })
    .slice(0, FILE_BROWSER_LIMIT);

  const parentPath = toBrowserPath(relativePath).split("/").filter(Boolean).slice(0, -1).join("/");
  return {
    breadcrumbs: makeFsBreadcrumbs(root, relativePath),
    detail: display.detail,
    items: entries,
    message: "",
    ok: true,
    parentPath,
    path: toBrowserPath(relativePath),
    pathLabel: target,
    rootKey: root.key,
    roots: roots.map(({ key, label, path: rootPath }) => ({ key, label, path: rootPath })),
    sourceId,
    state: "ready",
    status: display.status,
    subtitle: target,
    title: display.title,
  };
}

async function googleDriveAccessToken() {
  const settings = mergedIntegrationSettings("google-drive");
  const tokenState = googleTokenStatus(settings);
  if (tokenState === "refreshable") return refreshGoogleAccessToken(settings);
  if (tokenState === "access_valid") return settings.oauthTokens || {};
  throw new Error("Google Drive is not connected. Open Settings > Integrations > Google Drive to connect it.");
}

function googleDriveCanBrowseAllFiles(tokens) {
  const scopeText = String(tokens.scope || mergedIntegrationSettings("google-drive").scopes || "");
  const scopes = scopeText.split(/[\s,]+/).filter(Boolean);
  return scopes.some((scope) =>
    scope === "https://www.googleapis.com/auth/drive" ||
    scope === "https://www.googleapis.com/auth/drive.readonly" ||
    scope === "https://www.googleapis.com/auth/drive.metadata.readonly" ||
    scope === "drive.full" ||
    scope === "drive.readonly" ||
    scope === "drive.metadata.readonly" ||
    scope === "drive.metadata",
  );
}

async function fetchGoogleDriveJson(url, accessToken) {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = data.error || {};
    const message = error.message || data.error_description || `Google Drive request failed with HTTP ${response.status}.`;
    const scopeHint = response.status === 403
      ? " Google says the saved permission is too narrow for this view. Reconnect Google Drive with Drive metadata access."
      : "";
    throw new Error(`${message}${scopeHint}`);
  }
  return data;
}

async function googleDriveBreadcrumbs(folderId, accessToken) {
  if (!folderId || folderId === "root") return [{ label: "My Drive", path: "root" }];
  const chain = [];
  let currentId = folderId;
  for (let index = 0; index < 12 && currentId && currentId !== "root"; index += 1) {
    const params = new URLSearchParams({ fields: "id,name,parents" });
    const metadata = await fetchGoogleDriveJson(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(currentId)}?${params}`, accessToken);
    chain.unshift({ label: metadata.name || "Folder", path: metadata.id || currentId });
    currentId = Array.isArray(metadata.parents) ? metadata.parents[0] : "";
  }
  return [{ label: "My Drive", path: "root" }, ...chain];
}

function normalizeGoogleDriveItem(file) {
  const isFolder = file.mimeType === DRIVE_FOLDER_MIME;
  return {
    appActionLabel: isFolder ? "Open folder" : "Open in Drive",
    context: sourceContextLabels("google-drive"),
    description: isFolder ? "Google Drive folder." : `${fileTypeForName(file.name, file.mimeType)} in Google Drive.`,
    fileType: isFolder ? "Folder" : fileTypeForName(file.name, file.mimeType),
    id: `google-drive:${file.id}`,
    kind: isFolder ? "folder" : "file",
    mimeType: file.mimeType || "",
    modified: formatBrowserDate(file.modifiedTime),
    name: file.name || "Untitled",
    parentPath: Array.isArray(file.parents) ? file.parents[0] || "root" : "root",
    path: file.id,
    related: [],
    rootKey: "drive",
    size: formatBrowserSize(file.size),
    sourceId: "google-drive",
    webViewLink: file.webViewLink || "",
  };
}

async function listGoogleDriveBrowserSource({ relativePath, query }) {
  const display = sourceDisplay("google-drive");
  let tokens;
  try {
    tokens = await googleDriveAccessToken();
  } catch (error) {
    return {
      breadcrumbs: [{ label: "My Drive", path: "root" }],
      items: [],
      message: error.message,
      ok: false,
      path: "root",
      rootKey: "drive",
      sourceId: "google-drive",
      state: "needs_auth",
      subtitle: "Connect Google Drive in Settings",
      title: display.title,
    };
  }

  const accessToken = tokens.accessToken;
  if (!googleDriveCanBrowseAllFiles(tokens)) {
    return {
      breadcrumbs: [{ label: "My Drive", path: "root" }],
      items: [],
      message: "Google Drive is connected, but the saved permission can only see files Horizon created. Reconnect Google Drive with Drive metadata access to browse all files.",
      ok: false,
      path: "root",
      rootKey: "drive",
      sourceId: "google-drive",
      state: "needs_scope",
      subtitle: "Reconnect with Drive metadata access",
      title: display.title,
    };
  }

  const folderId = !relativePath || relativePath === "root" ? "root" : String(relativePath);
  const queryText = String(query || "").trim().replace(/'/g, "\\'");
  const driveQuery = [`'${folderId}' in parents`, "trashed = false"];
  if (queryText) driveQuery.push(`name contains '${queryText}'`);
  const params = new URLSearchParams({
    fields: "files(id,name,mimeType,modifiedTime,size,webViewLink,parents),nextPageToken",
    orderBy: "folder,name",
    pageSize: String(FILE_BROWSER_LIMIT),
    q: driveQuery.join(" and "),
  });

  try {
    const data = await fetchGoogleDriveJson(`https://www.googleapis.com/drive/v3/files?${params}`, accessToken);
    const items = (Array.isArray(data.files) ? data.files : []).map(normalizeGoogleDriveItem);
    const breadcrumbs = await googleDriveBreadcrumbs(folderId, accessToken);
    const parentPath = breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 2].path : "";
    return {
      breadcrumbs,
      detail: display.detail,
      items,
      message: "",
      ok: true,
      parentPath,
      path: folderId,
      pathLabel: breadcrumbs.map((crumb) => crumb.label).join(" / "),
      rootKey: "drive",
      roots: [{ key: "drive", label: "My Drive", path: "root" }],
      sourceId: "google-drive",
      state: "ready",
      status: display.status,
      subtitle: "My Drive",
      title: display.title,
    };
  } catch (error) {
    return {
      breadcrumbs: [{ label: "My Drive", path: "root" }],
      items: [],
      message: error.message,
      ok: false,
      path: folderId,
      rootKey: "drive",
      sourceId: "google-drive",
      state: "drive_error",
      subtitle: "Reconnect may be needed",
      title: display.title,
    };
  }
}

async function listFileBrowserSource({ sourceId, rootKey, relativePath, query }) {
  if (sourceId === "google-drive") return listGoogleDriveBrowserSource({ relativePath, query });
  if (sourceId === "local" || sourceId === "obsidian" || sourceId === "research") {
    return listFilesystemBrowserSource({ sourceId, rootKey, relativePath, query });
  }
  return {
    breadcrumbs: [],
    items: [],
    message: "This source is not ready for in-app browsing yet.",
    ok: false,
    sourceId,
    state: "not_supported",
    title: "Source unavailable",
  };
}

async function openFileBrowserItem(payload) {
  const sourceId = String(payload.sourceId || "");
  if (sourceId === "google-drive") {
    const webViewLink = String(payload.webViewLink || "");
    if (!isSafeWebUrl(webViewLink)) throw new Error("This Drive item does not have a safe web link to open.");
    await startProcess(webViewLink);
    return { message: "Opening Google Drive item.", ok: true, state: "opening" };
  }

  if (sourceId === "local" || sourceId === "obsidian" || sourceId === "research") {
    const roots = fileBrowserRootDefinitions(sourceId);
    const root = roots.find((candidate) => candidate.key === payload.rootKey) || roots[0];
    if (!root || !root.path || !fs.existsSync(root.path)) throw new Error("That source folder is not available.");
    const { target } = resolveInsideRoot(root.path, payload.path || "");
    if (!fs.existsSync(target)) throw new Error("That file or folder no longer exists.");
    await startProcess(target);
    return { message: "Opening item.", ok: true, state: "opening" };
  }

  throw new Error("This source cannot be opened yet.");
}

async function handle(req, res) {
  try {
    res.setHeader("content-security-policy", "frame-ancestors 'none'");
    res.setHeader("referrer-policy", "no-referrer");
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("x-frame-options", "DENY");
    if (String(req.headers.host || "").trim().toLowerCase() !== TRUSTED_APP_HOST) {
      sendJson(res, 403, { message: "This request did not come through Horizon's local address.", ok: false });
      return;
    }
    const url = new URL(req.url, TRUSTED_APP_ORIGIN);
    if (!mutationRequestIsAllowed(req, res)) return;
    if (
      req.method === "GET" &&
      url.pathname === "/" &&
      url.searchParams.has("state") &&
      (url.searchParams.has("code") || url.searchParams.has("error"))
    ) {
      try {
        const result = await finishGoogleOAuthCallback(url);
        sendOAuthHtml(res, 200, "Google Connected", result.message);
      } catch (error) {
        writeIntegrationRunLog({
          actionId: "google-drive.oauth-callback",
          errors: [error.message],
          integrationId: "google-drive",
          inputsSummary: "Received Google OAuth callback.",
          outputsSummary: error.message,
          status: "failed",
        });
        sendOAuthHtml(res, 400, "Google Connection Failed", error.message);
      }
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/health") {
      const vault = vaultStructureStatus(ROOT);
      const buildInfo = packagedBuildInfo();
      sendJson(res, 200, {
        app: "rawlings-os",
        buildCommit: String(buildInfo?.commit || "").trim() || null,
        buildRenderer: String(buildInfo?.renderer || "").trim() || null,
        credentialEncryption: REQUIRE_CREDENTIAL_ENCRYPTION && INTEGRATION_STORE_ENCRYPTION_ACTIVE
          ? "os_protected"
          : INTEGRATION_STORE_ENCRYPTION_ACTIVE ? "key_encrypted" : "developer_plaintext",
        version: APP_VERSION,
        ui: "horizon-react-vite",
        staticRoot: path.basename(staticRoot()),
        vaultPath: ROOT,
        vaultReady: vault.ready,
        vaultSelectionStored: fs.existsSync(HORIZON_VAULT_CONNECTION_PATH),
      });
      return;
    }
    if (
      req.method === "GET" &&
      (url.pathname === "/api/constellation" || url.pathname === "/api/development-sandbox")
    ) {
      sendConstellation(res);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/integrations") {
      sendJson(res, 200, { connections: allIntegrationConnections() });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/horizon/state") {
      sendJson(res, 200, readHorizonLocalState());
      return;
    }
    if (req.method === "PUT" && url.pathname === "/api/horizon/state") {
      const payload = await readBody(req);
      sendJson(res, 200, { state: saveHorizonLocalState(payload) });
      return;
    }
    if (req.method === "PUT" && url.pathname === "/api/horizon/spotlight-preferences") {
      const payload = await readBody(req);
      const existing = safeJsonRead(HORIZON_LOCAL_STATE_PATH, {});
      sendJson(res, 200, {
        state: saveHorizonLocalState({
          ...existing,
          spotlightPreferences: payload.preferences || payload || {},
        }),
      });
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/integrations/") && url.pathname.endsWith("/settings")) {
      const id = decodeURIComponent(url.pathname.slice("/api/integrations/".length, -"/settings".length));
      const record = integrationRecord(id);
      sendJson(res, 200, {
        connection: connectionForIntegration(id),
        settings: record.redactedSettings,
      });
      return;
    }
    if (req.method === "PUT" && url.pathname.startsWith("/api/integrations/") && url.pathname.endsWith("/settings")) {
      const id = decodeURIComponent(url.pathname.slice("/api/integrations/".length, -"/settings".length));
      const payload = await readBody(req);
      sendJson(res, 200, saveIntegrationSettings(id, payload));
      return;
    }
    if (req.method === "POST" && url.pathname.startsWith("/api/integrations/") && url.pathname.endsWith("/test")) {
      const id = decodeURIComponent(url.pathname.slice("/api/integrations/".length, -"/test".length));
      const payload = await readBody(req);
      const result = await testIntegration(id, payload);
      sendJson(res, result.ok ? 200 : 409, result);
      return;
    }
    if (req.method === "POST" && url.pathname.startsWith("/api/integrations/") && url.pathname.endsWith("/disconnect")) {
      if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
        sendJson(res, 415, { message: "Disconnect requests must come from Horizon.", ok: false });
        return;
      }
      await readBody(req);
      const id = decodeURIComponent(url.pathname.slice("/api/integrations/".length, -"/disconnect".length));
      const result = disconnectIntegration(id);
      sendJson(res, result.ok ? 200 : 409, result);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/integrations/ai-agent/models") {
      const payload = await readBody(req);
      const result = await listAiAgentModels(payload);
      sendJson(res, result.ok ? 200 : 409, result);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/integrations/zotero/local/connect") {
      const result = await connectZoteroDesktop();
      sendJson(res, result.ok ? 200 : 409, result);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/integrations/google-drive/oauth/start") {
      const payload = await readBody(req);
      const result = await startGoogleOAuth(payload);
      sendJson(res, 200, result);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/integrations/obsidian/validate") {
      const payload = await readBody(req);
      const settings = sanitizeIntegrationPayload("obsidian", payload);
      const vault = vaultStructureStatus(settings.vaultPath);
      writeIntegrationRunLog({
        actionId: "obsidian.validate-vault",
        errors: vault.exists ? [] : ["Vault path was not found."],
        inputsSummary: `Validated ${settings.vaultPath || "blank vault path"}.`,
        integrationId: "obsidian",
        outputsSummary: vault.exists ? "Vault path exists." : "Vault path missing.",
        status: vault.exists ? "success" : "failed",
      });
      sendJson(res, vault.exists ? 200 : 409, {
        connection: connectionForIntegration("obsidian"),
        message: vault.exists
          ? vault.initialized
            ? "Vault path is valid and initialized."
            : "Vault path is valid. Horizon structure can be initialized."
          : "Vault path was not found.",
        ok: vault.exists,
        vault,
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/integrations/obsidian/initialize") {
      const payload = await readBody(req);
      const settings = sanitizeIntegrationPayload("obsidian", payload);
      const result = initializeHorizonStructure(settings.vaultPath);
      sendJson(res, 200, result);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/integrations/obsidian/rebuild-indexes") {
      const payload = await readBody(req);
      const settings = sanitizeIntegrationPayload("obsidian", payload);
      const result = rebuildVaultManifests(settings.vaultPath);
      sendJson(res, 200, {
        connection: connectionForIntegration("obsidian"),
        message: `Rebuilt ${result.filesTouched.length} manifests for ${result.itemCount} notes.`,
        ...result,
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/integrations/obsidian/open") {
      const settings = mergedIntegrationSettings("obsidian");
      const vaultPath = path.resolve(String(settings.vaultPath || ROOT));
      if (!pathExistsDirectory(vaultPath)) {
        sendJson(res, 409, { message: "Vault path was not found.", ok: false });
        return;
      }
      await startProcess(vaultPath);
      sendJson(res, 200, { message: "Opening vault folder...", ok: true });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/files/list") {
      const sourceId = url.searchParams.get("source") || "local";
      const rootKey = url.searchParams.get("root") || "";
      const relativePath = url.searchParams.get("path") || "";
      const query = url.searchParams.get("q") || "";
      const result = await listFileBrowserSource({ sourceId, rootKey, relativePath, query });
      sendJson(res, result.ok ? 200 : 409, result);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/files/open") {
      const payload = await readBody(req);
      const result = await openFileBrowserItem(payload);
      sendJson(res, 200, result);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/items") {
      const today = currentToday();
      sendJson(res, 200, { today, items: listItems(today) });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/update/check") {
      sendJson(res, 200, await updateSnapshot(true));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/update/restart") {
      const snapshot = await updateSnapshot(false);
      const restarted = relaunchAndExit({ boot: true });
      sendJson(
        res,
        restarted ? 200 : 503,
        {
          ...snapshot,
          message: restarted ? "Relaunching Horizon OS." : "Relaunch command could not be started. Check startup shortcuts/permissions.",
          restarting: restarted,
        },
      );
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/startup") {
      sendJson(res, 200, startupSnapshot());
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/startup") {
      const payload = await readBody(req);
      sendJson(res, 200, await setLaunchAtStartup(Boolean(payload.enabled)));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/update/apply") {
      const result = await applyUpdate();
      sendJson(res, result.dirty ? 409 : 200, result);
      return;
    }
    if (req.method === "POST" && url.pathname.startsWith("/api/items/")) {
      const id = decodeURIComponent(url.pathname.slice("/api/items/".length));
      const payload = await readBody(req);
      sendJson(res, 200, { item: saveItem(id, payload) });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/capture/queue") {
      sendJson(res, 200, listIncomingCaptureQueue());
      return;
    }
    if (req.method === "DELETE" && url.pathname.startsWith("/api/capture/queue/")) {
      const id = decodeURIComponent(url.pathname.slice("/api/capture/queue/".length));
      sendJson(res, 200, deleteIncomingCaptureQueueFile(id));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/capture") {
      const payload = await readBody(req);
      sendJson(res, 200, { capture: createCapture(payload) });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/capture/actions") {
      sendJson(res, 200, { actions: captureActionMetadata() });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/research/papers") {
      const library = await listResearchLibrary({
        enrich: url.searchParams.get("enrich") === "1",
        force: url.searchParams.get("force") === "1",
      });
      sendJson(res, 200, library);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/research/papers/state") {
      const payload = await readBody(req);
      const result = await updateResearchPaperState(payload);
      sendJson(res, result.statusCode, result);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/research/papers/sync") {
      const result = await syncResearchLibrary();
      sendJson(res, 200, result);
      return;
    }
    if ((req.method === "POST" || req.method === "DELETE") && url.pathname === "/api/research/subjects") {
      const payload = await readBody(req);
      const library = await listResearchLibrary();
      const result = req.method === "POST"
        ? createResearchSubject(payload, library.papers)
        : deleteResearchSubject(payload, library.papers);
      sendJson(res, result.statusCode, result);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/research/obsidian-shelf") {
      const library = await listResearchLibrary();
      const navigation = writeResearchNavigationArtifacts(library);
      sendJson(res, 200, { ...navigation, ok: true });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/research/ideas") {
      const payload = await readBody(req);
      const result = createResearchDeskIdea(payload);
      sendJson(res, result.statusCode, result);
      return;
    }
    if (req.method === "PATCH" && url.pathname === "/api/research/ideas") {
      const payload = await readBody(req);
      const library = await listResearchLibrary();
      const result = updateResearchDeskIdea(payload, library.papers);
      sendJson(res, result.statusCode, result);
      return;
    }
    if (req.method === "DELETE" && url.pathname === "/api/research/ideas") {
      const payload = await readBody(req);
      const result = deleteResearchDeskIdea(payload);
      sendJson(res, result.statusCode, result);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/research/copy") {
      const payload = await readBody(req);
      const copied = copyResearchTextToClipboard(payload.text);
      sendJson(res, copied ? 200 : 409, { copied, ok: copied });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/research/ideas") {
      sendJson(res, 200, { ideas: listResearchIdeas() });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/projects") {
      sendJson(res, 200, { projects: listProjectRegistry({ includeAll: url.searchParams.get("all") === "1" }) });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/projects/status") {
      const payload = await readBody(req);
      const result = updateProjectRegistryStatus(payload.id, String(payload.status || "").trim().toLowerCase());
      sendJson(res, result.statusCode, result);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/projects/open") {
      // Open a project's workspace folder. The location is looked up server-side
      // from the owner's own Project Registry note (by id) — a client can never pass an
      // arbitrary path here, so the trust boundary is "folders the owner wrote down".
      const payload = await readBody(req);
      const entry = findProjectRegistryEntry(payload.id);
      if (!entry) {
        sendJson(res, 404, { ok: false, state: "not_found", message: "No registry entry matches that project." });
        return;
      }
      const location = String(entry.location || "").trim();
      if (!location || !fs.existsSync(location)) {
        sendJson(res, 409, { ok: false, state: "missing_path", message: `Project folder not found: ${location || "(no location in the registry note)"}` });
        return;
      }
      await startProcess(location);
      sendJson(res, 200, { ok: true, state: "opening", message: `Opening ${entry.name}...` });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/capture/pile") {
      sendJson(res, 200, listCapturePile());
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/capture/pile/triage") {
      const payload = await readBody(req);
      const text = String(payload.text || "").trim() || capturePileItemText(payload);
      const result = await triageCapture({ ...payload, text });
      sendJson(res, result.ok ? 200 : 409, result);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/capture/pile/resolve") {
      const payload = await readBody(req);
      const result = resolveCapturePileItem(payload);
      sendJson(res, result.ok ? 200 : 409, result);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/capture/triage") {
      const payload = await readBody(req);
      const result = await triageCapture(payload);
      sendJson(res, result.ok ? 200 : 409, result);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/capture/apply") {
      const payload = await readBody(req);
      const result = await applyCaptureAction(payload);
      sendJson(res, result.ok ? 200 : 409, result);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/capture/undo") {
      const payload = await readBody(req);
      const result = undoCaptureAction(payload);
      sendJson(res, result.ok ? 200 : 409, result);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/launch") {
      const payload = await readBody(req);
      const result = await launchAction(String(payload.actionId || ""), { query: payload.query });
      sendJson(res, result.ok ? 200 : 409, result);
      return;
    }
    sendStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

function selfCheck() {
  const sample = "---\ndate: unknown\ntime_start:\ntime_end:\nimportance: high\ncategory: School\nname: \"Demo\"\naction_needed: \"Confirm the exact course due time.\"\nstatus: active\n---\n\n# Demo\n";
  const parsed = parseItemContent(sample);
  assert.strictEqual(parsed.fields.name, "Demo");
  assert.strictEqual(parsed.fields.time_start, "");
  assert.ok(issueList(parsed.fields, parsed.body).some((issue) => issue.key === "date"));
  assert.strictEqual(issueList(parsed.fields, `${parsed.body}\n- Open reminder: yes\n`).some((issue) => issue.key === "date"), false);
  const rebuilt = buildItemContent(parsed.fields, parsed.body);
  assert.strictEqual(parseItemContent(rebuilt).fields.action_needed, "Confirm the exact course due time.");
  const paperParts = researchPaperParts("---\ntype: research-paper\n---\n\nCitation.\n\n## Summary\n\nUseful context.\n\n## Connections\n\n- [[Topic]]\n");
  assert.strictEqual(paperParts.abstractLabel, "Summary");
  assert.strictEqual(paperParts.abstract, "Useful context.");
  assert.strictEqual(normalizeDoi("https://doi.org/10.1037/H0040957"), "10.1037/h0040957");
  assert.strictEqual(normalizeDoi("file:///C:/papers/10.1000/not-a-doi.pdf"), "");
  assert.strictEqual(researchTitleIsPlaceholder("10.1111/joms.13246", "10.1111/joms.13246"), true);
  assert.strictEqual(researchTitleIsPlaceholder("A useful paper title", "10.1111/joms.13246"), false);
  const identity = citationResearchIdentity("Smith, J. (2024). A useful paper title. _Journal of Examples, 2_(1), 1-4.", "Smith-2024");
  assert.strictEqual(identity.title, "A useful paper title");
  const apa = crossrefApaCitation({
    author: [{ family: "Smith", given: "Jamie L" }, { family: "Jones", given: "Avery" }],
    issue: "2",
    page: "10-19",
    "published-print": { "date-parts": [[2026, 3]] },
    title: ["A useful paper title"],
    volume: "63",
    "container-title": ["Journal of Examples"],
  }, "10.1000/example");
  assert.ok(apa.includes("Smith, J. L., & Jones, A. (2026)."));
  assert.ok(apa.includes("Journal of Examples, 63(2), 10–19."));
  console.log("Dashboard self-check passed.");
}

if (process.argv.includes("--check")) {
  selfCheck();
} else {
  http.createServer(handle).listen(PORT, HOST, () => {
    console.log(`Horizon running at http://${HOST}:${PORT}`);
  });
}
