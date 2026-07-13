const { app, BrowserWindow, Menu, dialog, ipcMain, shell, screen } = require("electron");
const childProcess = require("child_process");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const {
  readVaultConnection,
  samePath,
  vaultConnectionPath,
  vaultStructureStatus,
  writeVaultConnection,
} = require("../server/vaultConnection.cjs");

const APP_ID = "com.rawlings.horizon";
const HOST = "127.0.0.1";
const PORT = 3873;
const APP_ORIGIN = `http://${HOST}:${PORT}/`;
const shouldLaunchWithBoot = process.argv.includes("--boot");
const APP_URL = `${APP_ORIGIN}${shouldLaunchWithBoot ? "?boot=1" : ""}`;

let mainWindow = null;
let serverProcess = null;
let activeVaultRoot = "";
let appSourceRoot = "";
let connectionConfigPath = "";

app.setName("Horizon");
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
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    return String(settings?.integrations?.obsidian?.settings?.vaultPath || "").trim();
  } catch {
    return "";
  }
}

function saveVaultConnection(vaultPath, source) {
  return writeVaultConnection(connectionConfigPath, vaultPath, source);
}

function invalidVaultDetail(status) {
  if (!status.exists) return "That folder is not currently available. Make sure Obsidian Sync has created it locally, then try again.";
  const missing = status.missingRequired.join(", ");
  return `That folder exists, but it is missing Horizon's core vault structure: ${missing}. Let Obsidian Sync finish and choose the vault's top-level folder.`;
}

function showFolderDialog(options) {
  return mainWindow ? dialog.showOpenDialog(mainWindow, options) : dialog.showOpenDialog(options);
}

function showSetupMessage(options) {
  return mainWindow ? dialog.showMessageBox(mainWindow, options) : dialog.showMessageBox(options);
}

async function chooseVault({ initialPath = "", showIntroduction = false } = {}) {
  if (showIntroduction) {
    const intro = await dialog.showMessageBox({
      buttons: ["Choose synced vault", "Quit"],
      cancelId: 1,
      defaultId: 0,
      detail: "Open Obsidian and let Sync finish first. Horizon will use the files in place; it will not copy, merge, or replace your vault. Integration sign-ins stay local to this machine.",
      message: "Connect Horizon to your existing Obsidian vault",
      noLink: true,
      title: "Horizon setup",
      type: "info",
    });
    if (intro.response !== 0) return "";
  }

  let defaultPath = initialPath && fs.existsSync(initialPath) ? initialPath : os.homedir();
  while (true) {
    const selection = await showFolderDialog({
      buttonLabel: "Use this vault",
      defaultPath,
      message: "Choose the top-level folder Obsidian Sync created on this computer.",
      properties: ["openDirectory"],
      title: "Choose your synced Obsidian vault",
    });
    if (selection.canceled || !selection.filePaths[0]) return "";

    const status = vaultStructureStatus(selection.filePaths[0]);
    if (status.ready) {
      saveVaultConnection(status.path, "folder-picker");
      return status.path;
    }

    defaultPath = status.exists ? status.path : defaultPath;
    const retry = await showSetupMessage({
      buttons: ["Choose another folder", "Cancel"],
      cancelId: 1,
      defaultId: 0,
      detail: invalidVaultDetail(status),
      message: "This is not the synced Horizon vault yet",
      noLink: true,
      title: "Horizon setup",
      type: "warning",
    });
    if (retry.response !== 0) return "";
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

  return chooseVault({
    initialPath: saved?.vaultPath || legacyIntegrationVault(),
    showIntroduction: true,
  });
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

async function ensureServer() {
  const running = await healthSnapshot();
  if (
    running?.app === "rawlings-os"
    && running?.ui === "horizon-react-vite"
    && samePath(running.vaultPath, activeVaultRoot)
  ) return;
  if (running?.app === "rawlings-os" && running?.ui === "horizon-react-vite") {
    throw new Error(`Another Horizon server is already using ${running.vaultPath}. Close that Horizon window, then open this one again for ${activeVaultRoot}.`);
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
      HORIZON_APP_DATA_DIR: app.getPath("userData"),
      HORIZON_APP_SOURCE_ROOT: appSourceRoot,
      HORIZON_NATIVE_APP_EXE: process.execPath,
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

function createWindow() {
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
    appSourceRoot = sourceRoot();
    connectionConfigPath = process.env.HORIZON_VAULT_CONNECTION_PATH || vaultConnectionPath(app.getPath("userData"));
    activeVaultRoot = await resolveVaultRoot();
    if (!activeVaultRoot) {
      app.quit();
      return;
    }
    registerDesktopBridge();
    await ensureServer();
    createWindow();
  } catch (error) {
    dialog.showErrorBox("Horizon could not start", error instanceof Error ? error.message : String(error));
    app.quit();
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
