import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 3901;
const BASE = `http://127.0.0.1:${PORT}`;
const here = path.dirname(fileURLToPath(import.meta.url));
const dashboardDir = path.resolve(here, "..");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "horizon-updater-test-"));
const sourceRoot = path.join(tempRoot, "source");
fs.mkdirSync(sourceRoot, { recursive: true });

execFileSync("git", ["init", "-b", "main"], { cwd: sourceRoot, stdio: "ignore" });
execFileSync("git", ["config", "user.email", "updater-test@localhost"], { cwd: sourceRoot, stdio: "ignore" });
execFileSync("git", ["config", "user.name", "Horizon Updater Test"], { cwd: sourceRoot, stdio: "ignore" });
fs.writeFileSync(path.join(sourceRoot, "fixture.txt"), "updater fixture\n", "utf8");
execFileSync("git", ["add", "fixture.txt"], { cwd: sourceRoot, stdio: "ignore" });
execFileSync("git", ["commit", "-m", "fixture"], { cwd: sourceRoot, stdio: "ignore" });
execFileSync("git", ["remote", "add", "origin", path.join(tempRoot, "missing-remote.git")], {
  cwd: sourceRoot,
  stdio: "ignore",
});

const server = spawn(process.execPath, [path.join(dashboardDir, "server.cjs")], {
  env: {
    ...process.env,
    HORIZON_APP_SOURCE_ROOT: sourceRoot,
    HORIZON_SOURCE_DASHBOARD: dashboardDir,
    HORIZON_VAULT_ROOT: tempRoot,
    PORT: String(PORT),
    RSB_DISABLE_AI: "1",
    RSB_DISABLE_EXTERNAL_INTEGRATIONS: "1",
  },
  stdio: "ignore",
});

function cleanup() {
  try {
    fs.rmSync(tempRoot, { force: true, recursive: true });
  } catch {
    // Windows can hold the fixture briefly while the child process exits.
  }
}

function shutdown(code) {
  if (server.exitCode === null && server.signalCode === null) {
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
  cleanup();
  process.exit(code);
}

for (let attempt = 0; attempt < 40; attempt += 1) {
  try {
    const response = await fetch(`${BASE}/api/update/check`);
    if (response.ok) {
      const result = await response.json();
      if (!result.fetchFailed || result.checkState !== "fetch_failed" || result.updateAvailable) {
        console.error(`UPDATER TEST FAIL: ${JSON.stringify(result)}`);
        shutdown(1);
      }
      if (/up to date/i.test(result.message || "")) {
        console.error("UPDATER TEST FAIL: a failed fetch was labeled up to date");
        shutdown(1);
      }
      console.log("UPDATER FAILURE PATH PASS");
      shutdown(0);
    }
  } catch {
    // Server is still starting.
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}

console.error("UPDATER TEST FAIL: server did not return an update status");
shutdown(1);
