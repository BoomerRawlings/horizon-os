const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  LEGACY_TASK_NAME,
  attemptLegacyWindowsMigration,
  createScheduledTaskRunner,
  legacyWindowsPaths,
  migrateLegacyWindowsInstall,
} = require("../electron/legacyWindowsMigration.cjs");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "horizon-legacy-migration-"));
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  const paths = legacyWindowsPaths({
    desktopDir: path.join(root, "Desktop"),
    roamingAppDataDir: path.join(root, "RoamingAppData"),
    userDataDir: path.join(root, "HorizonUserData"),
  });
  const installedExe = path.join(root, "Installed", "Horizon.exe");
  writeFile(installedExe, "packaged Horizon executable");
  return { installedExe, paths, root };
}

function writeFile(filePath, content = "legacy shortcut") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function allLegacyEntries(paths) {
  return [...paths.legacyShortcuts, ...paths.legacyStartupLaunchShortcuts];
}

function absentTaskRunner() {
  return {
    query(taskName) {
      assert.equal(taskName, LEGACY_TASK_NAME);
      return { exists: false };
    },
    remove() {
      assert.fail("An absent legacy task must not be removed.");
    },
  };
}

test("migrates only exact v0.2.7 artifacts, preserves startup, and is idempotent", (t) => {
  const { installedExe, paths, root } = fixture(t);
  for (const entry of allLegacyEntries(paths)) writeFile(entry.path);

  const protectedFiles = new Map([
    [path.join(root, "Desktop", "Horizon.lnk"), "new NSIS desktop shortcut"],
    [path.join(root, "RoamingAppData", "Microsoft", "Windows", "Start Menu", "Programs", "Horizon.lnk"), "new NSIS Start Menu shortcut"],
    [path.join(root, "Desktop", "HorizonOS Backup.lnk"), "near-name shortcut"],
    [path.join(root, "LocalAppData", "HorizonOS", "settings.json"), "legacy app data"],
    [path.join(root, "HorizonUserData", "integration-settings.json"), "encrypted credentials stay here"],
    [path.join(root, "Workspace", "00_Index.md"), "personal workspace"],
  ]);
  for (const [filePath, content] of protectedFiles) writeFile(filePath, content);

  let taskExists = true;
  const taskEvents = [];
  const taskRunner = {
    query(taskName) {
      taskEvents.push(["query", taskName]);
      return { exists: taskExists };
    },
    remove(taskName) {
      taskEvents.push(["remove", taskName]);
      taskExists = false;
    },
  };
  const shortcutWrites = [];
  const completedAt = new Date("2026-07-13T21:00:00.000Z");
  const summary = migrateLegacyWindowsInstall({
    installedExe,
    now: () => completedAt,
    paths,
    taskRunner,
    writeShortcut(shortcutPath, target) {
      shortcutWrites.push({ shortcutPath, target });
      writeFile(shortcutPath, JSON.stringify({ target }));
    },
  });

  assert.deepEqual(taskEvents, [
    ["query", LEGACY_TASK_NAME],
    ["remove", LEGACY_TASK_NAME],
    ["query", LEGACY_TASK_NAME],
  ]);
  assert.deepEqual(shortcutWrites, [{ shortcutPath: paths.canonicalStartupShortcut, target: installedExe }]);
  assert.equal(JSON.parse(fs.readFileSync(paths.canonicalStartupShortcut, "utf8")).target, installedExe);
  for (const entry of allLegacyEntries(paths)) assert.equal(fs.existsSync(entry.path), false, entry.id);
  for (const [filePath, content] of protectedFiles) assert.equal(fs.readFileSync(filePath, "utf8"), content, filePath);

  assert.equal(summary.alreadyComplete, false);
  assert.equal(summary.completedAt, completedAt.toISOString());
  assert.deepEqual(summary.scheduledTask, {
    name: LEGACY_TASK_NAME,
    found: true,
    removed: true,
    verifiedAbsent: true,
  });
  assert.equal(summary.shortcuts.preservedLaunchAtSignIn, true);
  assert.equal(summary.shortcuts.canonicalStartupCreated, true);
  assert.equal(summary.shortcuts.removed.length, allLegacyEntries(paths).length);
  assert.deepEqual(summary.shortcuts.skippedNonFiles, []);
  assert.equal(JSON.parse(fs.readFileSync(paths.markerPath, "utf8")).status, "complete");

  const secondSummary = migrateLegacyWindowsInstall({
    installedExe,
    paths,
    taskRunner: {
      query() {
        assert.fail("A completed migration must not query Windows again.");
      },
      remove() {
        assert.fail("A completed migration must not remove a task again.");
      },
    },
    writeShortcut() {
      assert.fail("A completed migration must not rewrite the startup shortcut.");
    },
  });
  assert.equal(secondSummary.alreadyComplete, true);
  assert.equal(secondSummary.completedAt, completedAt.toISOString());
});

test("does not mark or change shortcuts when the legacy task cannot be removed", (t) => {
  const { installedExe, paths } = fixture(t);
  for (const entry of allLegacyEntries(paths)) writeFile(entry.path);
  let shortcutWrites = 0;

  assert.throws(
    () => migrateLegacyWindowsInstall({
      installedExe,
      paths,
      taskRunner: {
        query() {
          return { exists: true };
        },
        remove() {
          throw new Error("Access is denied.");
        },
      },
      writeShortcut() {
        shortcutWrites += 1;
      },
    }),
    /found the old .*Windows could not remove it.*no legacy shortcuts were changed.*Access is denied/is,
  );

  assert.equal(shortcutWrites, 0);
  assert.equal(fs.existsSync(paths.markerPath), false);
  for (const entry of allLegacyEntries(paths)) assert.equal(fs.existsSync(entry.path), true, entry.id);
});

test("does not create a startup shortcut when the user had not enabled legacy startup", (t) => {
  const { installedExe, paths } = fixture(t);
  for (const entry of paths.legacyShortcuts) writeFile(entry.path);

  const summary = migrateLegacyWindowsInstall({
    installedExe,
    paths,
    taskRunner: absentTaskRunner(),
    writeShortcut() {
      assert.fail("Startup should remain disabled.");
    },
  });

  assert.equal(summary.shortcuts.preservedLaunchAtSignIn, false);
  assert.equal(summary.shortcuts.canonicalStartupCreated, false);
  assert.equal(fs.existsSync(paths.canonicalStartupShortcut), false);
  for (const entry of paths.legacyShortcuts) assert.equal(fs.existsSync(entry.path), false, entry.id);
  assert.equal(fs.existsSync(paths.markerPath), true);
});

test("refuses to mark completion when task deletion cannot be verified", (t) => {
  const { installedExe, paths } = fixture(t);
  for (const entry of allLegacyEntries(paths)) writeFile(entry.path);
  let queryCount = 0;

  assert.throws(
    () => migrateLegacyWindowsInstall({
      installedExe,
      paths,
      taskRunner: {
        query() {
          queryCount += 1;
          return { exists: true };
        },
        remove() {},
      },
      writeShortcut() {
        assert.fail("Shortcuts must not change before task deletion is verified.");
      },
    }),
    /still reports that the task exists after deletion/i,
  );

  assert.equal(queryCount, 2);
  assert.equal(fs.existsSync(paths.markerPath), false);
  for (const entry of allLegacyEntries(paths)) assert.equal(fs.existsSync(entry.path), true, entry.id);
});

test("startup migration failures remain fail-closed, do not expose details, and retry next launch", (t) => {
  const { installedExe, paths, root } = fixture(t);
  for (const entry of allLegacyEntries(paths)) writeFile(entry.path);

  const firstAttempt = attemptLegacyWindowsMigration(() => migrateLegacyWindowsInstall({
    installedExe,
    paths,
    taskRunner: {
      query() {
        throw new Error(`Access denied while inspecting ${root}`);
      },
      remove() {
        assert.fail("A failed task check must not remove anything.");
      },
    },
    writeShortcut() {
      assert.fail("A failed task check must not write a shortcut.");
    },
  }));

  assert.deepEqual(firstAttempt, {
    ok: false,
    retryOnNextLaunch: true,
    summary: null,
  });
  assert.equal(JSON.stringify(firstAttempt).includes(root), false);
  assert.equal(fs.existsSync(paths.markerPath), false);
  for (const entry of allLegacyEntries(paths)) assert.equal(fs.existsSync(entry.path), true, entry.id);

  const secondAttempt = attemptLegacyWindowsMigration(() => migrateLegacyWindowsInstall({
    installedExe,
    paths,
    taskRunner: absentTaskRunner(),
    writeShortcut(shortcutPath, target) {
      writeFile(shortcutPath, JSON.stringify({ target }));
    },
  }));

  assert.equal(secondAttempt.ok, true);
  assert.equal(secondAttempt.retryOnNextLaunch, false);
  assert.equal(secondAttempt.summary.status, "complete");
  assert.equal(fs.existsSync(paths.markerPath), true);
  for (const entry of allLegacyEntries(paths)) assert.equal(fs.existsSync(entry.path), false, entry.id);
});

test("scheduled-task runner uses locale-independent queries and exact deletion arguments", () => {
  const calls = [];
  const runner = createScheduledTaskRunner({
    command: "mock-schtasks.exe",
    queryCommand: "mock-powershell.exe",
    spawnSync(command, args, options) {
      calls.push({ command, args, options });
      if (command === "mock-powershell.exe") {
        const taskName = options.env.HORIZON_LEGACY_TASK_NAME;
        return taskName === LEGACY_TASK_NAME
          ? { status: 3, stderr: "", stdout: "absent" }
          : { status: 0, stderr: "", stdout: "exists" };
      }
      return { status: 0, stderr: "", stdout: "SUCCESS" };
    },
  });

  assert.deepEqual(runner.query(LEGACY_TASK_NAME), { exists: false });
  assert.deepEqual(runner.query("Existing Task"), { exists: true });
  runner.remove(LEGACY_TASK_NAME);
  assert.deepEqual(calls.map(({ command }) => command), [
    "mock-powershell.exe",
    "mock-powershell.exe",
    "mock-schtasks.exe",
  ]);
  assert.deepEqual(calls[0].args.slice(0, 3), ["-NoProfile", "-NonInteractive", "-Command"]);
  assert.match(calls[0].args[3], /Schedule\.Service/);
  assert.equal(calls[0].options.env.HORIZON_LEGACY_TASK_NAME, LEGACY_TASK_NAME);
  assert.equal(calls[1].options.env.HORIZON_LEGACY_TASK_NAME, "Existing Task");
  assert.deepEqual(calls[2].args, ["/Delete", "/TN", LEGACY_TASK_NAME, "/F"]);
  assert.equal(calls.every(({ options }) => options.shell === false && options.windowsHide === true), true);

  const failingRunner = createScheduledTaskRunner({
    command: "mock-schtasks.exe",
    queryCommand: "mock-powershell.exe",
    spawnSync(command) {
      if (command === "mock-powershell.exe") {
        return { status: 1, stderr: "COM query unavailable.", stdout: "" };
      }
      return { status: 1, stderr: "ERROR: Access is denied.", stdout: "" };
    },
  });
  assert.throws(() => failingRunner.query(LEGACY_TASK_NAME), /could not check.*Access is denied/is);
});
