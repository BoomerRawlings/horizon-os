const { app, BrowserWindow, Menu, dialog, ipcMain, safeStorage, shell, screen } = require("electron");
const childProcess = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const {
  addHorizonToExistingVault,
  createStarterVault,
  nextAvailableVaultPath,
  readVaultConnection,
  samePath,
  vaultConnectionPath,
  vaultStructureStatus,
  writeVaultConnection,
} = require("../server/vaultConnection.cjs");
const {
  createSafeStorageAdapter,
  decryptIntegrationStore,
  isEncryptedIntegrationStore,
  parseMasterKey,
} = require("../server/integrationStoreCrypto.cjs");
const {
  attemptLegacyWindowsMigration,
  createScheduledTaskRunner,
  legacyWindowsPaths,
  migrateLegacyWindowsInstall,
} = require("./legacyWindowsMigration.cjs");

const APP_ID = "com.rawlings.horizon";
const HOST = "127.0.0.1";
const PORT = 3873;
const APP_ORIGIN = `http://${HOST}:${PORT}/`;
const shouldLaunchWithBoot = process.argv.includes("--boot");
const APP_URL = `${APP_ORIGIN}${shouldLaunchWithBoot ? "?boot=1" : ""}`;
const INTEGRATION_KEY_FILE = "integration-master-key.safe-storage";

let mainWindow = null;
let serverProcess = null;
let activeVaultRoot = "";
let appSourceRoot = "";
let connectionConfigPath = "";
let integrationStoreMasterKey = "";

app.setName("Horizon");

function applyEndToEndPathOverrides() {
  if (process.env.HORIZON_E2E_MODE !== "1") return;
  const overrides = [
    ["appData", process.env.HORIZON_E2E_APP_DATA_DIR],
    ["userData", process.env.HORIZON_E2E_USER_DATA_DIR],
    ["desktop", process.env.HORIZON_E2E_DESKTOP_DIR],
    ["documents", process.env.HORIZON_E2E_DOCUMENTS_DIR],
  ];
  for (const [name, value] of overrides) {
    const requestedPath = String(value || "").trim();
    if (!requestedPath) continue;
    const resolved = path.resolve(requestedPath);
    fs.mkdirSync(resolved, { recursive: true });
    app.setPath(name, resolved);
  }
}

applyEndToEndPathOverrides();
app.setAppUserModelId(APP_ID);
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
Menu.setApplicationMenu(null);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

function appRoot() {
  return app.isPackaged ? app.getAppPath() : path.resolve(__dirname, "..");
}

function runLegacyWindowsMigration() {
  const migrationPaths = legacyWindowsPaths({
    desktopDir: app.getPath("desktop"),
    roamingAppDataDir: app.getPath("appData"),
    userDataDir: app.getPath("userData"),
  });

  return migrateLegacyWindowsInstall({
    installedExe: process.execPath,
    paths: migrationPaths,
    taskRunner: createScheduledTaskRunner(),
    writeShortcut(shortcutPath, executable) {
      fs.mkdirSync(path.dirname(shortcutPath), { recursive: true });
      const written = shell.writeShortcutLink(shortcutPath, {
        appUserModelId: APP_ID,
        args: "",
        cwd: path.dirname(executable),
        description: "Launches Horizon at Windows sign-in.",
        icon: executable,
        iconIndex: 0,
        target: executable,
      });
      if (!written) {
        throw new Error("Windows did not create Horizon's replacement launch-at-sign-in shortcut.");
      }
    },
  });
}

function writeProtectedKey(filePath, protectedValue) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(temporaryPath, protectedValue, { flag: "wx", mode: 0o600 });
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    try {
      if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    } catch {
      // A failed cleanup must not replace the safe, non-secret setup error below.
    }
    throw error;
  }
}

async function loadOrCreateIntegrationMasterKey() {
  const userDataPath = app.getPath("userData");
  const keyPath = path.join(userDataPath, INTEGRATION_KEY_FILE);
  const settingsPath = path.join(userDataPath, "integration-settings.json");
  const credentialStorage = await createSafeStorageAdapter(safeStorage);
  if (!credentialStorage) {
    throw new Error("Horizon cannot access operating-system credential protection. Integration credentials were not opened or changed.");
  }

  if (fs.existsSync(keyPath)) {
    try {
      const protectedValue = fs.readFileSync(keyPath);
      if (!protectedValue.length) throw new Error("empty protected key");
      const unlocked = await credentialStorage.decryptString(protectedValue);
      const unlockedKey = unlocked.result;
      parseMasterKey(unlockedKey);
      if (fs.existsSync(settingsPath)) {
        const serializedSettings = fs.readFileSync(settingsPath, "utf8");
        if (isEncryptedIntegrationStore(serializedSettings)) {
          decryptIntegrationStore(serializedSettings, unlockedKey);
        }
      }
      if (unlocked.shouldReEncrypt) {
        const refreshedValue = await credentialStorage.encryptString(unlockedKey);
        const refreshed = await credentialStorage.decryptString(refreshedValue);
        const expected = parseMasterKey(unlockedKey);
        const verified = parseMasterKey(refreshed.result);
        if (!crypto.timingSafeEqual(expected, verified)) throw new Error("safe storage refresh verification failed");
        writeProtectedKey(keyPath, refreshedValue);
      }
      return unlockedKey;
    } catch {
      throw new Error("Horizon could not unlock its saved integration credentials. It stopped without reading, replacing, or exposing them.");
    }
  }

  if (fs.existsSync(settingsPath)) {
    let serializedSettings;
    try {
      serializedSettings = fs.readFileSync(settingsPath, "utf8");
    } catch {
      throw new Error("Horizon could not inspect existing integration settings. It stopped without reading or replacing them.");
    }
    if (isEncryptedIntegrationStore(serializedSettings)) {
      throw new Error("Horizon found encrypted integration credentials but their operating-system-protected key is missing. It stopped without replacing them.");
    }
  }

  try {
    const newKey = crypto.randomBytes(32).toString("base64");
    parseMasterKey(newKey);
    const protectedValue = await credentialStorage.encryptString(newKey);
    const verification = await credentialStorage.decryptString(protectedValue);
    const expected = parseMasterKey(newKey);
    const verified = parseMasterKey(verification.result);
    if (!crypto.timingSafeEqual(expected, verified)) throw new Error("safe storage verification failed");
    writeProtectedKey(keyPath, protectedValue);
    return newKey;
  } catch {
    throw new Error("Horizon could not create an operating-system-protected credential key. No integration credentials were opened or changed.");
  }
}

function sourceRoot() {
  if (process.env.HORIZON_APP_SOURCE_ROOT) return path.resolve(process.env.HORIZON_APP_SOURCE_ROOT);
  let candidate = appRoot();
  for (let depth = 0; depth < 9; depth += 1) {
    if (
      fs.existsSync(path.join(candidate, "Dashboard", "package.json"))
      && fs.existsSync(path.join(candidate, "Dashboard", "scripts"))
    ) {
      return candidate;
    }
    const parent = path.dirname(candidate);
    if (parent === candidate) break;
    candidate = parent;
  }
  return app.isPackaged ? appRoot() : path.resolve(appRoot(), "..");
}

function legacyIntegrationVault() {
  try {
    const settingsPath = path.join(app.getPath("userData"), "integration-settings.json");
    if (!fs.existsSync(settingsPath)) return "";
    const serialized = fs.readFileSync(settingsPath, "utf8");
    const settings = isEncryptedIntegrationStore(serialized)
      ? decryptIntegrationStore(serialized, integrationStoreMasterKey)
      : JSON.parse(serialized);
    return String(settings?.integrations?.obsidian?.settings?.vaultPath || "").trim();
  } catch {
    return "";
  }
}

function saveVaultConnection(vaultPath, source) {
  return writeVaultConnection(connectionConfigPath, vaultPath, source);
}

function invalidVaultDetail(status) {
  if (!status.exists) return "That folder is not currently available. Choose the folder that opens as your vault in Obsidian.";
  const missing = status.missingRequired.join(", ");
  return `That folder is missing Horizon's core workspace items: ${missing}. Choose an Obsidian vault so Horizon can add only the missing files, or choose another Horizon workspace.`;
}

function showFolderDialog(options) {
  return mainWindow ? dialog.showOpenDialog(mainWindow, options) : dialog.showOpenDialog(options);
}

function showSetupMessage(options) {
  return mainWindow ? dialog.showMessageBox(mainWindow, options) : dialog.showMessageBox(options);
}

async function chooseVault({ initialPath = "" } = {}) {
  let defaultPath = initialPath && fs.existsSync(initialPath) ? initialPath : os.homedir();
  while (true) {
    const selection = await showFolderDialog({
      buttonLabel: "Use this vault",
      defaultPath,
      message: "Choose the top-level folder that opens as your vault in Obsidian.",
      properties: ["openDirectory"],
      title: "Use an existing workspace",
    });
    if (selection.canceled || !selection.filePaths[0]) return "";

    const status = vaultStructureStatus(selection.filePaths[0]);
    if (status.ready) {
      saveVaultConnection(status.path, "folder-picker");
      return status.path;
    }

    const canPrepare = status.exists && (status.hasObsidianConfig || fs.existsSync(path.join(status.path, "HORIZON.md")));
    if (canPrepare) {
      const prepare = await showSetupMessage({
        buttons: ["Add missing Horizon files", "Choose another folder", "Cancel"],
        cancelId: 2,
        defaultId: 0,
        detail: "Horizon will create only its missing folders and starter files. It will not replace, move, or delete any note already in this vault.",
        message: "Make this vault ready for Horizon?",
        noLink: true,
        title: "Horizon setup",
        type: "question",
      });
      if (prepare.response === 0) {
        try {
          const prepared = addHorizonToExistingVault(path.join(appRoot(), "server", "starter-vault"), status.path);
          saveVaultConnection(prepared.path, "existing-vault-prepared");
          return prepared.path;
        } catch (error) {
          await showSetupMessage({
            buttons: ["Choose another folder"],
            detail: error instanceof Error ? error.message : String(error),
            message: "Horizon could not prepare that vault",
            noLink: true,
            title: "Horizon setup",
            type: "error",
          });
          continue;
        }
      }
      if (prepare.response === 1) {
        defaultPath = status.path;
        continue;
      }
      return "";
    }

    defaultPath = status.exists ? status.path : defaultPath;
    const retry = await showSetupMessage({
      buttons: ["Choose another folder", "Cancel"],
      cancelId: 1,
      defaultId: 0,
      detail: invalidVaultDetail(status),
      message: "This folder is not ready for Horizon",
      noLink: true,
      title: "Horizon setup",
      type: "warning",
    });
    if (retry.response !== 0) return "";
  }
}

async function chooseInitialVault(initialPath = "") {
  while (true) {
    const preferredPath = nextAvailableVaultPath(path.join(app.getPath("documents"), "Horizon Vault"));
    const intro = await showSetupMessage({
      buttons: ["Create my workspace", "Use an existing vault", "Quit"],
      cancelId: 2,
      defaultId: 0,
      detail: `Recommended: Horizon creates a new workspace at ${preferredPath}. Nothing else is required. You can open this folder in Obsidian or move it later.`,
      message: "Welcome to Horizon",
      noLink: true,
      title: "Horizon setup",
      type: "info",
    });

    if (intro.response === 2) return "";
    if (intro.response === 1) {
      const selected = await chooseVault({ initialPath });
      if (selected) return selected;
      continue;
    }

    try {
      const created = createStarterVault(path.join(appRoot(), "server", "starter-vault"), preferredPath);
      saveVaultConnection(created.path, "starter-workspace");
      return created.path;
    } catch (error) {
      const retry = await showSetupMessage({
        buttons: ["Try again", "Use an existing vault", "Quit"],
        cancelId: 2,
        defaultId: 0,
        detail: error instanceof Error ? error.message : String(error),
        message: "Horizon could not create the workspace",
        noLink: true,
        title: "Horizon setup",
        type: "error",
      });
      if (retry.response === 2) return "";
      if (retry.response === 1) {
        const selected = await chooseVault({ initialPath });
        if (selected) return selected;
      }
    }
  }
}

async function resolveVaultRoot() {
  const explicit = String(process.env.HORIZON_VAULT_ROOT || "").trim();
  if (explicit) {
    const status = vaultStructureStatus(explicit);
    if (!status.ready) throw new Error(`HORIZON_VAULT_ROOT is not a ready Horizon vault: ${status.path || explicit}`);
    return status.path;
  }

  const forceSelection = process.argv.includes("--choose-vault");
  const saved = readVaultConnection(connectionConfigPath);
  if (!forceSelection && saved) {
    const status = vaultStructureStatus(saved.vaultPath);
    if (status.ready) return status.path;
  }

  if (!forceSelection) {
    const migrationCandidates = [legacyIntegrationVault(), appSourceRoot];
    for (const candidate of migrationCandidates) {
      const status = vaultStructureStatus(candidate);
      if (!status.ready) continue;
      saveVaultConnection(status.path, "legacy-migration");
      return status.path;
    }
  }

  return chooseInitialVault(saved?.vaultPath || legacyIntegrationVault());
}

function iconPath() {
  return path.join(appRoot(), "public", process.platform === "win32" ? "horizon-os-icon.ico" : "horizon-os-icon.png");
}

function rightHalfBounds() {
  const { workArea } = screen.getPrimaryDisplay();
  const width = Math.floor(workArea.width / 2);

  return {
    x: workArea.x + workArea.width - width,
    y: workArea.y,
    width,
    height: workArea.height,
  };
}

function healthSnapshot() {
  return new Promise((resolve) => {
    const request = http.get(`http://${HOST}:${PORT}/api/health`, { timeout: 1000 }, (response) => {
      let body = "";
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(null);
        }
      });
    });

    request.on("timeout", () => {
      request.destroy();
      resolve(null);
    });
    request.on("error", () => resolve(null));
  });
}

async function healthCheck() {
  const health = await healthSnapshot();
  return Boolean(
    health
    && health.app === "rawlings-os"
    && health.ui === "horizon-react-vite"
    && health.credentialEncryption === "os_protected"
    && health.version === app.getVersion()
    && samePath(health.vaultPath, activeVaultRoot),
  );
}

async function waitForServer() {
  for (let i = 0; i < 40; i += 1) {
    if (await healthCheck()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function ensureServer(masterKey) {
  const running = await healthSnapshot();
  const isHorizonServer = running?.app === "rawlings-os" && running?.ui === "horizon-react-vite";
  if (
    isHorizonServer
    && running.credentialEncryption === "os_protected"
    && running.version === app.getVersion()
    && samePath(running.vaultPath, activeVaultRoot)
  ) return;
  if (isHorizonServer) {
    throw new Error("A different Horizon window is already running. Close every Horizon window, then reopen Horizon.");
  }

  const serverPath = path.join(appRoot(), "server.cjs");
  if (!fs.existsSync(serverPath)) {
    throw new Error(`Horizon server was not found at ${serverPath}`);
  }

  const outLog = path.join(os.tmpdir(), "horizon-native-server.log");
  const errLog = path.join(os.tmpdir(), "horizon-native-server.err.log");
  const out = fs.openSync(outLog, "a");
  const err = fs.openSync(errLog, "a");

  serverProcess = childProcess.spawn(process.execPath, [serverPath], {
    cwd: appRoot(),
    detached: false,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      HORIZON_ALLOW_ORIGINLESS_MUTATIONS: "0",
      HORIZON_APP_DATA_DIR: app.getPath("userData"),
      HORIZON_APP_SOURCE_ROOT: appSourceRoot,
      HORIZON_INTEGRATION_STORE_KEY: masterKey,
      HORIZON_NATIVE_APP_EXE: process.execPath,
      HORIZON_REQUIRE_CREDENTIAL_ENCRYPTION: "1",
      HORIZON_SOURCE_DASHBOARD: path.join(appSourceRoot, "Dashboard"),
      HORIZON_TIME_ZONE: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      HORIZON_VAULT_CONNECTION_PATH: connectionConfigPath,
      HORIZON_VAULT_ROOT: activeVaultRoot,
      PORT: String(PORT),
    },
    stdio: ["ignore", out, err],
    windowsHide: true,
  });

  serverProcess.once("exit", () => {
    serverProcess = null;
  });

  if (!(await waitForServer())) {
    throw new Error(`Horizon server did not start. Logs are in ${outLog} and ${errLog}.`);
  }
}

function createWindow({ legacyCleanupNeedsRetry = false } = {}) {
  const bounds = rightHalfBounds();

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 860,
    minHeight: 720,
    title: "Horizon",
    autoHideMenuBar: true,
    backgroundColor: "#020813",
    icon: iconPath(),
    show: false,
    webPreferences: {
      contextIsolation: true,
      backgroundThrottling: false,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: true,
    },
  });
  mainWindow.removeMenu();
  mainWindow.setMenuBarVisibility(false);

  mainWindow.once("ready-to-show", () => {
    mainWindow.setBounds(rightHalfBounds(), false);
    mainWindow.show();
    mainWindow.webContents
      .executeJavaScript("window.__horizonWindowVisible = true; window.dispatchEvent(new Event('horizon-window-visible'));")
      .catch(() => undefined);
    if (legacyCleanupNeedsRetry) {
      setTimeout(() => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        void dialog.showMessageBox(mainWindow, {
          buttons: ["Continue"],
          cancelId: 0,
          defaultId: 0,
          detail: "Windows did not let Horizon finish cleaning up an older v0.2.7 installation. Your workspace and saved integration settings were left unchanged. Horizon will safely try the cleanup again the next time it opens. If this notice returns, close Horizon and reopen it as the same Windows user.",
          message: "Horizon is ready to use.",
          noLink: true,
          title: "Older Horizon cleanup needs another try",
          type: "warning",
        }).catch(() => undefined);
      }, 250);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(APP_ORIGIN)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.loadURL(APP_URL);
}

function restartForVault() {
  const relaunchArgs = process.argv.slice(1).filter((argument) => argument !== "--choose-vault");
  app.relaunch({ args: relaunchArgs });
  app.exit(0);
}

async function chooseDifferentVault() {
  const previous = activeVaultRoot;
  const selected = await chooseVault({ initialPath: previous });
  if (!selected) return { canceled: true, ok: false, restarting: false, vaultPath: previous };
  if (samePath(selected, previous)) return { canceled: false, ok: true, restarting: false, vaultPath: previous };
  setTimeout(restartForVault, 500);
  return { canceled: false, ok: true, restarting: true, vaultPath: selected };
}

function registerDesktopBridge() {
  ipcMain.handle("horizon:vault-status", () => ({
    configStored: fs.existsSync(connectionConfigPath),
    ok: true,
    status: vaultStructureStatus(activeVaultRoot),
    vaultPath: activeVaultRoot,
  }));
  ipcMain.handle("horizon:choose-vault", chooseDifferentVault);
}

app.on("second-instance", (_event, commandLine) => {
  if (commandLine.includes("--choose-vault")) {
    void chooseDifferentVault();
    return;
  }
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.setBounds(rightHalfBounds(), true);
  mainWindow.focus();
});

app.whenReady().then(async () => {
  try {
    let legacyCleanupNeedsRetry = false;
    if (app.isPackaged && process.platform === "win32") {
      const migrationAttempt = attemptLegacyWindowsMigration(runLegacyWindowsMigration);
      legacyCleanupNeedsRetry = migrationAttempt.retryOnNextLaunch;
    }
    appSourceRoot = sourceRoot();
    integrationStoreMasterKey = await loadOrCreateIntegrationMasterKey();
    connectionConfigPath = process.env.HORIZON_VAULT_CONNECTION_PATH || vaultConnectionPath(app.getPath("userData"));
    activeVaultRoot = await resolveVaultRoot();
    if (!activeVaultRoot) {
      app.quit();
      return;
    }
    registerDesktopBridge();
    await ensureServer(integrationStoreMasterKey);
    createWindow({ legacyCleanupNeedsRetry });
  } catch (error) {
    dialog.showErrorBox("Horizon could not start", error instanceof Error ? error.message : String(error));
    app.quit();
  } finally {
    integrationStoreMasterKey = "";
  }
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
