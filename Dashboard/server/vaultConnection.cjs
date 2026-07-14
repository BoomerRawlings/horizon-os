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
  path.join(".obsidian", "app.json"),
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

function validateStarterTemplate(templatePath) {
  const status = vaultStructureStatus(templatePath);
  if (!status.ready || !status.initialized || status.missingWorkspace.length > 0) {
    const missing = [...status.missingRequired, ...status.missingWorkspace, ...status.missingHorizon];
    throw new Error(`Horizon's starter workspace is incomplete${missing.length ? `: ${missing.join(", ")}` : "."}`);
  }
  return status.path;
}

function copyMissingStarterEntries(templatePath, destinationPath) {
  const templateRoot = validateStarterTemplate(templatePath);
  const destinationRoot = path.resolve(destinationPath);
  const created = [];

  function copyEntry(sourcePath, targetPath) {
    const sourceStat = fs.lstatSync(sourcePath);
    if (sourceStat.isSymbolicLink()) {
      throw new Error("The Horizon starter workspace contains an unsupported symbolic link.");
    }
    if (sourceStat.isDirectory()) {
      if (fs.existsSync(targetPath) && !fs.statSync(targetPath).isDirectory()) {
        throw new Error(`${path.relative(destinationRoot, targetPath)} already exists and is not a folder.`);
      }
      fs.mkdirSync(targetPath, { recursive: true });
      for (const entry of fs.readdirSync(sourcePath).sort()) {
        copyEntry(path.join(sourcePath, entry), path.join(targetPath, entry));
      }
      return;
    }
    if (!sourceStat.isFile() || fs.existsSync(targetPath)) return;
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath, fs.constants.COPYFILE_EXCL);
    created.push(path.relative(destinationRoot, targetPath).replace(/\\/g, "/"));
  }

  fs.mkdirSync(destinationRoot, { recursive: true });
  for (const entry of fs.readdirSync(templateRoot).sort()) {
    copyEntry(path.join(templateRoot, entry), path.join(destinationRoot, entry));
  }
  return created;
}

function nextAvailableVaultPath(preferredPath) {
  const preferred = path.resolve(String(preferredPath || "").trim());
  if (!fs.existsSync(preferred)) return preferred;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${preferred} ${suffix}`;
    if (!fs.existsSync(candidate)) return candidate;
  }
  throw new Error("Horizon could not find an unused name for the new workspace.");
}

function createStarterVault(templatePath, destinationPath) {
  const templateRoot = validateStarterTemplate(templatePath);
  const destinationInput = String(destinationPath || "").trim();
  if (!destinationInput) throw new Error("Choose where Horizon should create the workspace.");
  const destinationRoot = path.resolve(destinationInput);
  if (fs.existsSync(destinationRoot)) {
    throw new Error("Horizon will not replace an existing folder. Choose a new workspace location.");
  }

  const parent = path.dirname(destinationRoot);
  fs.mkdirSync(parent, { recursive: true });
  const temporaryRoot = path.join(parent, `.${path.basename(destinationRoot)}.horizon-setup-${process.pid}-${Date.now()}`);
  try {
    if (fs.existsSync(temporaryRoot)) throw new Error("A temporary Horizon setup folder already exists.");
    copyMissingStarterEntries(templateRoot, temporaryRoot);
    const status = vaultStructureStatus(temporaryRoot);
    if (!status.ready || !status.initialized || status.missingWorkspace.length > 0) {
      throw new Error("The new workspace did not pass Horizon's safety check.");
    }
    fs.renameSync(temporaryRoot, destinationRoot);
    return {
      path: destinationRoot,
      status: vaultStructureStatus(destinationRoot),
    };
  } catch (error) {
    if (fs.existsSync(temporaryRoot)) fs.rmSync(temporaryRoot, { force: true, recursive: true });
    throw error;
  }
}

function addHorizonToExistingVault(templatePath, vaultPath) {
  const before = vaultStructureStatus(vaultPath);
  const looksLikeHorizon = before.exists && fs.existsSync(path.join(before.path, "HORIZON.md"));
  if (!before.exists || (!before.hasObsidianConfig && !looksLikeHorizon)) {
    throw new Error("Choose an Obsidian vault or an existing Horizon workspace.");
  }
  const filesCreated = copyMissingStarterEntries(templatePath, before.path);
  const status = vaultStructureStatus(before.path);
  if (!status.ready || !status.initialized || status.missingWorkspace.length > 0) {
    throw new Error("Horizon could not finish preparing that vault. Existing files were not replaced.");
  }
  return { filesCreated, path: status.path, status };
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
  addHorizonToExistingVault,
  comparablePath,
  createStarterVault,
  defaultHorizonAppDataDir,
  pathExistsDirectory,
  nextAvailableVaultPath,
  readVaultConnection,
  samePath,
  vaultConnectionPath,
  vaultStructureStatus,
  writeVaultConnection,
};
