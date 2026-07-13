const fs = require("fs");
const os = require("os");
const path = require("path");

const REQUIRED_VAULT_PATHS = [
  "00_Index.md",
  "AGENTS.md",
  "Calendar",
  "Inbox",
  "Runs",
];

const PORTABLE_WORKSPACE_PATHS = [
  "Project Registry",
  "Research Papers",
];

const HORIZON_STRUCTURE_PATHS = [
  "HORIZON.md",
  path.join("00_System", "manifests", "integrations.manifest.json"),
  path.join("00_System", "manifests", "dashboard.manifest.json"),
  path.join("06_Integrations", "index.md"),
];

function pathExistsDirectory(value) {
  try {
    return Boolean(value && fs.existsSync(value) && fs.statSync(value).isDirectory());
  } catch {
    return false;
  }
}

function vaultStructureStatus(vaultPath, fallbackPath = "") {
  const input = String(vaultPath || fallbackPath || "").trim();
  const resolved = input ? path.resolve(input) : "";
  const exists = pathExistsDirectory(resolved);
  const missingRequired = exists
    ? REQUIRED_VAULT_PATHS.filter((item) => !fs.existsSync(path.join(resolved, item)))
    : [...REQUIRED_VAULT_PATHS];
  const missingWorkspace = exists
    ? PORTABLE_WORKSPACE_PATHS.filter((item) => !fs.existsSync(path.join(resolved, item)))
    : [...PORTABLE_WORKSPACE_PATHS];
  const missingHorizon = exists
    ? HORIZON_STRUCTURE_PATHS.filter((item) => !fs.existsSync(path.join(resolved, item)))
    : [...HORIZON_STRUCTURE_PATHS];

  return {
    exists,
    hasObsidianConfig: exists && fs.existsSync(path.join(resolved, ".obsidian")),
    initialized: exists && missingHorizon.length === 0,
    missingHorizon,
    missingRequired,
    missingWorkspace,
    path: resolved,
    ready: exists && missingRequired.length === 0,
  };
}

function defaultHorizonAppDataDir({ env = process.env, homeDir = os.homedir(), platform = process.platform } = {}) {
  if (env.HORIZON_APP_DATA_DIR) return path.resolve(env.HORIZON_APP_DATA_DIR);
  if (platform === "win32") {
    return path.join(env.APPDATA || path.join(homeDir, "AppData", "Roaming"), "Horizon");
  }
  if (platform === "darwin") {
    return path.join(homeDir, "Library", "Application Support", "Horizon");
  }
  return path.join(env.XDG_CONFIG_HOME || path.join(homeDir, ".config"), "Horizon");
}

function vaultConnectionPath(appDataDir = defaultHorizonAppDataDir()) {
  return path.join(appDataDir, "vault-connection.json");
}

function readVaultConnection(configPath = vaultConnectionPath()) {
  try {
    if (!fs.existsSync(configPath)) return null;
    const value = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (!value || typeof value !== "object" || !String(value.vaultPath || "").trim()) return null;
    return {
      selectedAt: value.selectedAt || null,
      source: value.source || "saved",
      vaultPath: path.resolve(String(value.vaultPath)),
      version: Number(value.version) || 1,
    };
  } catch {
    return null;
  }
}

function writeVaultConnection(configPath, vaultPath, source = "folder-picker") {
  const status = vaultStructureStatus(vaultPath);
  if (!status.ready) {
    throw new Error("The selected folder is not a ready Horizon vault.");
  }
  const connection = {
    selectedAt: new Date().toISOString(),
    source,
    vaultPath: status.path,
    version: 1,
  };
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const temporaryPath = `${configPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(connection, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, configPath);
  return connection;
}

function comparablePath(value, platform = process.platform) {
  const resolved = path.resolve(String(value || ""));
  return platform === "win32" ? resolved.toLowerCase() : resolved;
}

function samePath(left, right, platform = process.platform) {
  if (!left || !right) return false;
  return comparablePath(left, platform) === comparablePath(right, platform);
}

module.exports = {
  HORIZON_STRUCTURE_PATHS,
  PORTABLE_WORKSPACE_PATHS,
  REQUIRED_VAULT_PATHS,
  comparablePath,
  defaultHorizonAppDataDir,
  pathExistsDirectory,
  readVaultConnection,
  samePath,
  vaultConnectionPath,
  vaultStructureStatus,
  writeVaultConnection,
};
