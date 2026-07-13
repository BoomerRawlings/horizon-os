const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  defaultHorizonAppDataDir,
  readVaultConnection,
  samePath,
  vaultConnectionPath,
  vaultStructureStatus,
  writeVaultConnection,
} = require("../server/vaultConnection.cjs");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "horizon-vault-connection-"));
const vault = path.join(root, "Synced Vault");
const appData = path.join(root, "app-data");

function ok(label) {
  console.log(`  ok - ${label}`);
}

try {
  fs.mkdirSync(vault, { recursive: true });
  const incomplete = vaultStructureStatus(vault);
  assert.equal(incomplete.exists, true);
  assert.equal(incomplete.ready, false);
  assert.ok(incomplete.missingRequired.includes("00_Index.md"));
  assert.throws(() => writeVaultConnection(vaultConnectionPath(appData), vault), /not a ready Horizon vault/);
  ok("incomplete sync folder is rejected without writing a connection");

  fs.writeFileSync(path.join(vault, "00_Index.md"), "# Synced vault\n", "utf8");
  fs.writeFileSync(path.join(vault, "HORIZON.md"), "# Horizon vault\n", "utf8");
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
