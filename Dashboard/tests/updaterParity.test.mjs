import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dashboardDir = path.resolve(here, "..");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "horizon-updater-parity-"));
const remoteRoot = path.join(tempRoot, "remote.git");
const sourceRoot = path.join(tempRoot, "source");
const sourceDashboard = path.join(sourceRoot, "Dashboard");
const buildInfoPath = path.join(tempRoot, "packaged-build-info.json");

function git(args, cwd = tempRoot) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

git(["init", "--bare", "--initial-branch=main", remoteRoot]);
git(["clone", remoteRoot, sourceRoot]);
git(["config", "user.email", "updater-parity@localhost"], sourceRoot);
git(["config", "user.name", "Horizon Updater Parity Test"], sourceRoot);
fs.mkdirSync(sourceDashboard, { recursive: true });
fs.writeFileSync(path.join(sourceDashboard, "package.json"), `${JSON.stringify({ version: "0.2.5" }, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(sourceRoot, "fixture.txt"), "package parity fixture\n", "utf8");
git(["add", "."], sourceRoot);
git(["commit", "-m", "fixture"], sourceRoot);
git(["push", "-u", "origin", "main"], sourceRoot);
const currentCommit = git(["rev-parse", "HEAD"], sourceRoot);

function stopServer(server) {
  if (server.exitCode !== null || server.signalCode !== null) return;
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      // The server may already have exited.
    }
  } else {
    server.kill();
  }
}

async function snapshot(port, packagedVersion, packagedCommit) {
  fs.writeFileSync(
    buildInfoPath,
    `${JSON.stringify({ commit: packagedCommit, dirty: false, renderer: "assets/index-test.js", version: packagedVersion }, null, 2)}\n`,
    "utf8",
  );
  const server = spawn(process.execPath, [path.join(dashboardDir, "server.cjs")], {
    env: {
      ...process.env,
      HORIZON_APP_SOURCE_ROOT: sourceRoot,
      HORIZON_NATIVE_APP_EXE: path.join(tempRoot, "Horizon.exe"),
      HORIZON_PACKAGED_BUILD_INFO_PATH: buildInfoPath,
      HORIZON_PACKAGED_VERSION: packagedVersion,
      HORIZON_SOURCE_DASHBOARD: sourceDashboard,
      HORIZON_VAULT_ROOT: tempRoot,
      PORT: String(port),
      RSB_DISABLE_AI: "1",
      RSB_DISABLE_EXTERNAL_INTEGRATIONS: "1",
    },
    stdio: "ignore",
  });
  try {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/update/check`);
        if (response.ok) return await response.json();
      } catch {
        // Server is still starting.
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("server did not return an update snapshot");
  } finally {
    stopServer(server);
  }
}

try {
  const stale = await snapshot(3902, "0.2.4", "0000000000000000000000000000000000000000");
  if (
    stale.checkState !== "package_stale"
    || !stale.packageStale
    || !stale.updateAvailable
    || stale.sourceUpdateAvailable
    || stale.current !== stale.latest
    || stale.packagedVersion !== "0.2.4"
    || stale.sourceVersion !== "0.2.5"
    || /up to date/i.test(stale.message || "")
  ) {
    throw new Error(`stale package was not detected: ${JSON.stringify(stale)}`);
  }

  const current = await snapshot(3903, "0.2.5", currentCommit);
  if (current.checkState !== "current" || current.packageStale || current.updateAvailable || current.current !== currentCommit) {
    throw new Error(`matching package was not current: ${JSON.stringify(current)}`);
  }

  console.log("UPDATER PACKAGE PARITY PASS");
} catch (error) {
  console.error(`UPDATER PARITY TEST FAIL: ${error.message}`);
  process.exitCode = 1;
} finally {
  try {
    fs.rmSync(tempRoot, { force: true, recursive: true });
  } catch {
    // Windows can hold a fixture briefly after process termination.
  }
}
