const { app, BrowserWindow, Menu, dialog, shell, screen } = require("electron");
const childProcess = require("child_process");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const APP_ID = "io.github.boomerrawlings.horizon";
const HOST = "127.0.0.1";
const PORT = 3873;
const APP_ORIGIN = `http://${HOST}:${PORT}/`;
const shouldLaunchWithBoot = process.argv.includes("--boot");
const APP_URL = `${APP_ORIGIN}${shouldLaunchWithBoot ? "?boot=1" : ""}`;

let mainWindow = null;
let serverProcess = null;

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

function vaultRoot() {
  if (process.env.HORIZON_VAULT_ROOT) return path.resolve(process.env.HORIZON_VAULT_ROOT);
  if (!app.isPackaged) return path.resolve(appRoot(), "..");

  let candidate = appRoot();
  for (let depth = 0; depth < 8; depth += 1) {
    if (fs.existsSync(path.join(candidate, "HORIZON.md")) || fs.existsSync(path.join(candidate, "AGENTS.md"))) {
      return candidate;
    }
    const parent = path.dirname(candidate);
    if (parent === candidate) break;
    candidate = parent;
  }

  const defaultVault = path.join(app.getPath("documents"), "HorizonOS");
  const starterVault = path.join(process.resourcesPath, "starter-vault");
  if (!fs.existsSync(defaultVault)) {
    if (fs.existsSync(starterVault)) {
      fs.cpSync(starterVault, defaultVault, { recursive: true });
    } else {
      fs.mkdirSync(defaultVault, { recursive: true });
    }
  }
  return defaultVault;
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

function healthCheck() {
  return new Promise((resolve) => {
    const request = http.get(`http://${HOST}:${PORT}/api/health`, { timeout: 1000 }, (response) => {
      let body = "";
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        try {
          const health = JSON.parse(body);
          resolve(health.app === "horizon-os" && health.ui === "horizon-react-vite");
        } catch {
          resolve(false);
        }
      });
    });

    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

async function waitForServer() {
  for (let i = 0; i < 40; i += 1) {
    if (await healthCheck()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function ensureServer() {
  if (await healthCheck()) return;

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
      HORIZON_NATIVE_APP_EXE: process.execPath,
      HORIZON_VAULT_ROOT: vaultRoot(),
      PORT: String(PORT),
    },
    stdio: ["ignore", out, err],
    windowsHide: process.platform === "win32",
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
      sandbox: true,
    },
  });
  mainWindow.removeMenu();
  mainWindow.setMenuBarVisibility(false);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

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

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.setBounds(rightHalfBounds(), true);
  mainWindow.focus();
});

app.whenReady().then(async () => {
  try {
    await ensureServer();
    createWindow();
  } catch (error) {
    dialog.showErrorBox("Horizon could not start", error instanceof Error ? error.message : String(error));
    app.quit();
  }
});

app.on("activate", () => {
  if (!mainWindow) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
