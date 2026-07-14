const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  addHorizonToExistingVault,
  createStarterVault,
  defaultHorizonAppDataDir,
  nextAvailableVaultPath,
  readVaultConnection,
  samePath,
  vaultConnectionPath,
  vaultStructureStatus,
  writeVaultConnection,
} = require("../server/vaultConnection.cjs");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "horizon-vault-connection-"));
const vault = path.join(root, "Synced Vault");
const appData = path.join(root, "app-data");
const starterTemplate = path.resolve(__dirname, "..", "server", "starter-vault");

function ok(label) {
  console.log(`  ok - ${label}`);
}

try {
  const starterStatus = vaultStructureStatus(starterTemplate);
  assert.equal(starterStatus.ready, true);
  assert.equal(starterStatus.initialized, true);
  assert.deepEqual(starterStatus.missingWorkspace, []);
  assert.equal(fs.existsSync(path.join(starterTemplate, ".obsidian", "app.json")), true);
  const starterFiles = fs.readdirSync(starterTemplate, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath || entry.path, entry.name));
  const starterText = starterFiles.map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
  assert.doesNotMatch(starterText, /[A-Z]:\\Users\\|boome_/i);
  const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "package.json"), "utf8"));
  assert.equal(packageJson.build.files.some((pattern) => pattern === "server/**/*"), true);
  ok("bundled starter workspace is complete and initialized");

  const preferredVault = path.join(root, "Horizon Vault");
  assert.equal(nextAvailableVaultPath(preferredVault), preferredVault);
  const created = createStarterVault(starterTemplate, preferredVault);
  assert.equal(created.path, preferredVault);
  assert.equal(created.status.ready, true);
  assert.equal(created.status.initialized, true);
  assert.equal(created.status.hasObsidianConfig, true);
  assert.equal(fs.existsSync(path.join(preferredVault, "Research Papers", "index.md")), true);
  assert.throws(() => createStarterVault(starterTemplate, preferredVault), /will not replace an existing folder/);
  assert.equal(nextAvailableVaultPath(preferredVault), `${preferredVault} 2`);
  ok("new starter workspace is created without replacing an existing folder");

  const existingObsidian = path.join(root, "Existing Obsidian Vault");
  fs.mkdirSync(path.join(existingObsidian, ".obsidian"), { recursive: true });
  fs.writeFileSync(path.join(existingObsidian, "00_Index.md"), "# Keep my index\n", "utf8");
  const prepared = addHorizonToExistingVault(starterTemplate, existingObsidian);
  assert.equal(prepared.status.ready, true);
  assert.equal(prepared.status.initialized, true);
  assert.deepEqual(prepared.status.missingWorkspace, []);
  assert.equal(fs.readFileSync(path.join(existingObsidian, "00_Index.md"), "utf8"), "# Keep my index\n");
  assert.equal(prepared.filesCreated.includes("00_Index.md"), false);
  assert.equal(prepared.filesCreated.includes("HORIZON.md"), true);
  ok("existing Obsidian vault gains only missing Horizon files");

  const ordinaryFolder = path.join(root, "Ordinary Folder");
  fs.mkdirSync(ordinaryFolder, { recursive: true });
  assert.throws(
    () => addHorizonToExistingVault(starterTemplate, ordinaryFolder),
    /Choose an Obsidian vault or an existing Horizon workspace/,
  );
  assert.equal(fs.readdirSync(ordinaryFolder).length, 0);
  ok("ordinary folders are left untouched");

  fs.mkdirSync(vault, { recursive: true });
  const incomplete = vaultStructureStatus(vault);
  assert.equal(incomplete.exists, true);
  assert.equal(incomplete.ready, false);
  assert.ok(incomplete.missingRequired.includes("00_Index.md"));
  assert.throws(() => writeVaultConnection(vaultConnectionPath(appData), vault), /not a ready Horizon vault/);
  ok("incomplete sync folder is rejected without writing a connection");

  fs.writeFileSync(path.join(vault, "00_Index.md"), "# Synced vault\n", "utf8");
  fs.writeFileSync(path.join(vault, "AGENTS.md"), "# Instructions\n", "utf8");
  for (const directory of [".obsidian", "Calendar", "Inbox", "Runs", "Project Registry", "Research Papers"]) {
    fs.mkdirSync(path.join(vault, directory), { recursive: true });
  }

  const ready = vaultStructureStatus(vault);
  assert.equal(ready.ready, true);
  assert.equal(ready.hasObsidianConfig, true);
  assert.deepEqual(ready.missingWorkspace, []);
  ok("fully synced Obsidian vault is recognized as ready");

  const configPath = vaultConnectionPath(appData);
  const saved = writeVaultConnection(configPath, vault, "test");
  const loaded = readVaultConnection(configPath);
  assert.equal(saved.source, "test");
  assert.equal(loaded.version, 1);
  assert.equal(samePath(loaded.vaultPath, vault), true);
  assert.equal(fs.existsSync(path.join(vault, "vault-connection.json")), false);
  ok("machine-local connection round-trips outside the synced vault");

  const winPath = defaultHorizonAppDataDir({ env: { APPDATA: "C:\\Users\\Example\\AppData\\Roaming" }, homeDir: "C:\\Users\\Example", platform: "win32" });
  const macPath = defaultHorizonAppDataDir({ env: {}, homeDir: "/Users/example", platform: "darwin" });
  assert.equal(winPath, path.join("C:\\Users\\Example\\AppData\\Roaming", "Horizon"));
  assert.equal(macPath, path.join("/Users/example", "Library", "Application Support", "Horizon"));
  ok("Windows and Mac store the vault pointer in platform-local app data");

  console.log("VAULT CONNECTION PASS");
} finally {
  fs.rmSync(root, { force: true, recursive: true });
}
