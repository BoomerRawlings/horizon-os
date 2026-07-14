const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");

const LEGACY_TASK_NAME = "Horizon OS Dev Auto Update";
const MIGRATION_ID = "v0.2.7-to-v0.3.0";
const MARKER_VERSION = 1;
const MARKER_FILE_NAME = "legacy-windows-migration-v0.3.0.json";
const TASK_QUERY_SCRIPT = String.raw`$ErrorActionPreference = 'Stop'
$taskName = $env:HORIZON_LEGACY_TASK_NAME
if ([string]::IsNullOrWhiteSpace($taskName)) {
  throw 'The scheduled-task name was not provided.'
}
try {
  $service = New-Object -ComObject 'Schedule.Service'
  $service.Connect()
  $root = $service.GetFolder('\')
  try {
    $null = $root.GetTask($taskName)
    [Console]::Out.Write('exists')
    exit 0
  } catch {
    $win32Code = $_.Exception.HResult -band 0xffff
    if ($win32Code -eq 2) {
      [Console]::Out.Write('absent')
      exit 3
    }
    throw
  }
} catch {
  [Console]::Error.Write($_.Exception.Message)
  exit 1
}`;

function requiredPath(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required for the Horizon legacy cleanup.`);
  }
  return path.resolve(value);
}

function legacyWindowsPaths({ desktopDir, roamingAppDataDir, userDataDir }) {
  const desktop = requiredPath(desktopDir, "desktopDir");
  const roamingAppData = requiredPath(roamingAppDataDir, "roamingAppDataDir");
  const userData = requiredPath(userDataDir, "userDataDir");
  const programsDir = path.join(roamingAppData, "Microsoft", "Windows", "Start Menu", "Programs");
  const startupDir = path.join(programsDir, "Startup");
  const taskbarDir = path.join(
    roamingAppData,
    "Microsoft",
    "Internet Explorer",
    "Quick Launch",
    "User Pinned",
    "TaskBar",
  );

  return {
    canonicalStartupShortcut: path.join(startupDir, "Horizon.lnk"),
    legacyShortcuts: [
      { id: "desktop:HorizonOS.lnk", path: path.join(desktop, "HorizonOS.lnk") },
      { id: "desktop:Horizon OS.lnk", path: path.join(desktop, "Horizon OS.lnk") },
      { id: "start-menu:HorizonOS.lnk", path: path.join(programsDir, "HorizonOS.lnk") },
      { id: "start-menu:Horizon OS/Horizon OS.lnk", path: path.join(programsDir, "Horizon OS", "Horizon OS.lnk") },
      { id: "taskbar:HorizonOS.lnk", path: path.join(taskbarDir, "HorizonOS.lnk") },
      { id: "taskbar:Horizon OS.lnk", path: path.join(taskbarDir, "Horizon OS.lnk") },
      { id: "startup:HorizonOS Server.lnk", path: path.join(startupDir, "HorizonOS Server.lnk") },
      { id: "startup:Horizon OS Server.lnk", path: path.join(startupDir, "Horizon OS Server.lnk") },
    ],
    legacyStartupLaunchShortcuts: [
      { id: "startup:HorizonOS.lnk", path: path.join(startupDir, "HorizonOS.lnk") },
      { id: "startup:Horizon OS.lnk", path: path.join(startupDir, "Horizon OS.lnk") },
    ],
    markerPath: path.join(userData, MARKER_FILE_NAME),
    scheduledTaskName: LEGACY_TASK_NAME,
  };
}

function commandOutput(result) {
  return [result?.stdout, result?.stderr]
    .map((value) => (value === undefined || value === null ? "" : String(value).trim()))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 500);
}

function taskCommandError(action, taskName, result) {
  const detail = commandOutput(result);
  return new Error(
    `Windows could not ${action} the exact scheduled task "${taskName}"${detail ? `: ${detail}` : "."}`,
  );
}

function createScheduledTaskRunner({
  command = "schtasks.exe",
  queryCommand = "powershell.exe",
  spawnSync = childProcess.spawnSync,
} = {}) {
  if (typeof command !== "string" || !command.trim()) throw new Error("A scheduled-task command is required.");
  if (typeof queryCommand !== "string" || !queryCommand.trim()) {
    throw new Error("A scheduled-task query command is required.");
  }
  if (typeof spawnSync !== "function") throw new Error("A scheduled-task command runner is required.");

  function run(executable, args, action, taskName, extraOptions = {}) {
    const result = spawnSync(executable, args, {
      encoding: "utf8",
      shell: false,
      windowsHide: true,
      ...extraOptions,
    });
    if (result?.error || typeof result?.status !== "number") {
      throw taskCommandError(action, taskName, result?.error ? { stderr: result.error.message } : result);
    }
    return result;
  }

  return {
    query(taskName) {
      let comResult = null;
      try {
        comResult = run(
          queryCommand,
          ["-NoProfile", "-NonInteractive", "-Command", TASK_QUERY_SCRIPT],
          "check",
          taskName,
          {
            env: {
              ...process.env,
              HORIZON_LEGACY_TASK_NAME: taskName,
            },
          },
        );
      } catch {
        // Some managed Windows environments restrict PowerShell or COM. The exact
        // schtasks fallback below remains available and keeps ambiguous results closed.
      }
      if (comResult?.status === 0 && String(comResult.stdout || "").trim() === "exists") {
        return { exists: true };
      }
      if (comResult?.status === 3 && String(comResult.stdout || "").trim() === "absent") {
        return { exists: false };
      }

      // COM provides locale-independent results. If it is unavailable or restricted,
      // fall back to the old exact schtasks query and still fail closed on ambiguity.
      const result = run(command, ["/Query", "/TN", taskName], "check", taskName);
      if (result.status === 0) return { exists: true };

      const output = commandOutput(result);
      const isAbsent = [
        /cannot find the file specified/i,
        /cannot find the task/i,
        /scheduled task .* does not exist/i,
        /task .* not found/i,
      ].some((pattern) => pattern.test(output));
      if (isAbsent) return { exists: false };
      throw taskCommandError("check", taskName, result);
    },

    remove(taskName) {
      const result = run(command, ["/Delete", "/TN", taskName, "/F"], "remove", taskName);
      if (result.status !== 0) throw taskCommandError("remove", taskName, result);
    },
  };
}

function attemptLegacyWindowsMigration(runMigration) {
  if (typeof runMigration !== "function") {
    throw new Error("A Horizon legacy cleanup function is required.");
  }
  try {
    return {
      ok: true,
      retryOnNextLaunch: false,
      summary: runMigration(),
    };
  } catch {
    // The migration itself stays fail-closed: it does not write a completion marker
    // after an uncertain cleanup. Startup can continue and safely retry next launch.
    return {
      ok: false,
      retryOnNextLaunch: true,
      summary: null,
    };
  }
}

function readCompletedMarker(markerPath, fsImpl) {
  let serialized;
  try {
    serialized = fsImpl.readFileSync(markerPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error(`Horizon could not read its v0.3.0 cleanup marker: ${error.message}`);
  }

  try {
    const marker = JSON.parse(serialized);
    if (
      marker?.markerVersion === MARKER_VERSION
      && marker?.migration === MIGRATION_ID
      && marker?.status === "complete"
    ) {
      return marker;
    }
  } catch {
    // A partial or corrupt marker is not completion evidence; safely rerun the idempotent cleanup.
  }
  return null;
}

function shortcutKind(shortcutPath, fsImpl) {
  try {
    const stat = fsImpl.lstatSync(shortcutPath);
    if (stat.isFile()) return "file";
    if (stat.isSymbolicLink()) return "symbolic-link";
    return "non-file";
  } catch (error) {
    if (error?.code === "ENOENT") return "missing";
    throw error;
  }
}

function removeExactShortcut(entry, fsImpl, removed, skippedNonFiles) {
  const kind = shortcutKind(entry.path, fsImpl);
  if (kind === "missing") return;
  if (kind === "non-file") {
    skippedNonFiles.push(entry.id);
    return;
  }
  fsImpl.unlinkSync(entry.path);
  removed.push(entry.id);
}

function writeMarkerAtomically(markerPath, marker, fsImpl, now) {
  fsImpl.mkdirSync(path.dirname(markerPath), { recursive: true });
  const temporaryPath = `${markerPath}.tmp-${process.pid}-${now.getTime()}`;
  try {
    fsImpl.writeFileSync(temporaryPath, `${JSON.stringify(marker, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    if (shortcutKind(markerPath, fsImpl) === "file") fsImpl.unlinkSync(markerPath);
    fsImpl.renameSync(temporaryPath, markerPath);
  } catch (error) {
    try {
      if (shortcutKind(temporaryPath, fsImpl) !== "missing") fsImpl.unlinkSync(temporaryPath);
    } catch {
      // Preserve the original marker-write failure.
    }
    throw error;
  }
}

function validateTaskQuery(result) {
  if (!result || typeof result.exists !== "boolean") {
    throw new Error("The scheduled-task check returned an invalid result.");
  }
  return result.exists;
}

function errorDetail(error) {
  return error instanceof Error ? error.message : String(error);
}

function migrateLegacyWindowsInstall({
  fsImpl = fs,
  installedExe,
  now = () => new Date(),
  paths,
  taskRunner,
  writeShortcut,
}) {
  if (!paths || !Array.isArray(paths.legacyShortcuts) || !Array.isArray(paths.legacyStartupLaunchShortcuts)) {
    throw new Error("Horizon legacy cleanup paths are incomplete.");
  }
  if (!taskRunner || typeof taskRunner.query !== "function" || typeof taskRunner.remove !== "function") {
    throw new Error("Horizon legacy cleanup needs a scheduled-task runner.");
  }
  if (typeof writeShortcut !== "function") {
    throw new Error("Horizon legacy cleanup needs a Windows shortcut writer.");
  }

  const completedMarker = readCompletedMarker(paths.markerPath, fsImpl);
  if (completedMarker) return { ...completedMarker, alreadyComplete: true };

  let taskExisted;
  try {
    taskExisted = validateTaskQuery(taskRunner.query(paths.scheduledTaskName));
  } catch (error) {
    throw new Error(
      `Horizon could not verify the old "${paths.scheduledTaskName}" scheduled task. No cleanup was marked complete and no legacy shortcuts were changed. ${errorDetail(error)}`,
    );
  }

  if (taskExisted) {
    try {
      taskRunner.remove(paths.scheduledTaskName);
      if (validateTaskQuery(taskRunner.query(paths.scheduledTaskName))) {
        throw new Error("Windows still reports that the task exists after deletion.");
      }
    } catch (error) {
      throw new Error(
        `Horizon found the old "${paths.scheduledTaskName}" scheduled task, but Windows could not remove it. Cleanup was not marked complete and no legacy shortcuts were changed. Close Horizon and try again as the same Windows user. ${errorDetail(error)}`,
      );
    }
  }

  const legacyStartupPreference = paths.legacyStartupLaunchShortcuts.some((entry) => {
    const kind = shortcutKind(entry.path, fsImpl);
    return kind === "file" || kind === "symbolic-link";
  });
  const removed = [];
  const skippedNonFiles = [];

  if (legacyStartupPreference) {
    const executable = requiredPath(installedExe, "installedExe");
    let executableStat;
    try {
      executableStat = fsImpl.statSync(executable);
    } catch (error) {
      throw new Error(`Horizon could not preserve launch at sign-in because its installed app was not found: ${error.message}`);
    }
    if (!executableStat.isFile()) {
      throw new Error("Horizon could not preserve launch at sign-in because its installed app path is not a file.");
    }
    fsImpl.mkdirSync(path.dirname(paths.canonicalStartupShortcut), { recursive: true });
    try {
      const written = writeShortcut(paths.canonicalStartupShortcut, executable);
      if (written === false) {
        throw new Error("Windows did not create the replacement shortcut.");
      }
    } catch (error) {
      throw new Error(
        `Horizon could not preserve your launch-at-sign-in setting, so the old startup shortcuts were left in place. Cleanup was not marked complete. ${errorDetail(error)}`,
      );
    }
  }

  try {
    for (const entry of paths.legacyShortcuts) {
      removeExactShortcut(entry, fsImpl, removed, skippedNonFiles);
    }
    for (const entry of paths.legacyStartupLaunchShortcuts) {
      removeExactShortcut(entry, fsImpl, removed, skippedNonFiles);
    }
  } catch (error) {
    throw new Error(
      `Horizon could not finish removing its exact old shortcuts. Cleanup was not marked complete and will retry safely the next time Horizon opens. ${errorDetail(error)}`,
    );
  }

  const completedAt = now();
  if (!(completedAt instanceof Date) || Number.isNaN(completedAt.getTime())) {
    throw new Error("Horizon legacy cleanup received an invalid completion time.");
  }
  const marker = {
    markerVersion: MARKER_VERSION,
    migration: MIGRATION_ID,
    status: "complete",
    completedAt: completedAt.toISOString(),
    scheduledTask: {
      name: paths.scheduledTaskName,
      found: taskExisted,
      removed: taskExisted,
      verifiedAbsent: true,
    },
    shortcuts: {
      canonicalStartupCreated: legacyStartupPreference,
      preservedLaunchAtSignIn: legacyStartupPreference,
      removed,
      skippedNonFiles,
    },
  };
  try {
    writeMarkerAtomically(paths.markerPath, marker, fsImpl, completedAt);
  } catch (error) {
    throw new Error(
      `Horizon completed the old shortcut cleanup but could not record it. The safe cleanup will run again the next time Horizon opens. ${errorDetail(error)}`,
    );
  }
  return { ...marker, alreadyComplete: false };
}

module.exports = {
  LEGACY_TASK_NAME,
  MARKER_FILE_NAME,
  MIGRATION_ID,
  attemptLegacyWindowsMigration,
  createScheduledTaskRunner,
  legacyWindowsPaths,
  migrateLegacyWindowsInstall,
};
