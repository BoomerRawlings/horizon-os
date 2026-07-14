const assert = require("assert");
const crypto = require("crypto");
const {
  DEFAULT_AUTH_CONTEXT,
  ENVELOPE_VERSION,
  IntegrationStoreCryptoError,
  createSafeStorageAdapter,
  decryptIntegrationStore,
  encryptIntegrationStore,
  isEncryptedIntegrationStore,
  parseMasterKey,
} = require("../server/integrationStoreCrypto.cjs");

function ok(label) {
  console.log(`  ok - ${label}`);
}

function mutateBase64(value) {
  const replacement = value[0] === "A" ? "B" : "A";
  return `${replacement}${value.slice(1)}`;
}

function expectCryptoError(action, code, forbidden = []) {
  let caught = null;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof IntegrationStoreCryptoError);
  assert.equal(caught.code, code);
  for (const secret of forbidden) {
    if (!secret) continue;
    assert.equal(caught.message.includes(secret), false);
    assert.equal(String(caught.stack || "").includes(secret), false);
  }
  return caught;
}

const key = crypto.randomBytes(32).toString("base64");
const wrongKey = crypto.randomBytes(32).toString("base64");
const secretToken = "fixture-secret-sentinel-that-must-never-appear";
const store = {
  integrations: {
    "ai-agent": { settings: { apiKey: secretToken, model: "test-model" } },
    zotero: { settings: { username: "Example User", writeAccess: true } },
  },
  note: "Unicode survives: café / 日本語",
  version: 1,
};

const encrypted = encryptIntegrationStore(store, key);
assert.equal(encrypted.includes(secretToken), false);
assert.equal(isEncryptedIntegrationStore(encrypted), true);
assert.equal(JSON.parse(encrypted).version, ENVELOPE_VERSION);
assert.equal(JSON.parse(encrypted).context, DEFAULT_AUTH_CONTEXT);
assert.deepEqual(decryptIntegrationStore(encrypted, key), store);
assert.notEqual(encryptIntegrationStore(store, key), encrypted);
ok("AES-256-GCM envelope round-trips JSON with a fresh nonce");

const context = "com.rawlings.horizon/integration-store/test-profile";
const contextual = encryptIntegrationStore(store, key, { context });
assert.deepEqual(decryptIntegrationStore(contextual, key, { context }), store);
expectCryptoError(
  () => decryptIntegrationStore(contextual, key, { context: `${context}/other` }),
  "AUTHENTICATION_FAILED",
  [secretToken, key],
);
const changedContext = JSON.parse(contextual);
changedContext.context = `${context}/tampered`;
expectCryptoError(
  () => decryptIntegrationStore(JSON.stringify(changedContext), key, { context: changedContext.context }),
  "AUTHENTICATION_FAILED",
  [secretToken, key],
);
ok("authenticated context prevents cross-context and context-tampering reuse");

const tampered = JSON.parse(encrypted);
tampered.ciphertext = mutateBase64(tampered.ciphertext);
expectCryptoError(
  () => decryptIntegrationStore(JSON.stringify(tampered), key),
  "AUTHENTICATION_FAILED",
  [secretToken, key, tampered.ciphertext],
);
ok("ciphertext tampering is rejected without exposing secrets");

expectCryptoError(
  () => decryptIntegrationStore(encrypted, wrongKey),
  "AUTHENTICATION_FAILED",
  [secretToken, key, wrongKey],
);
ok("wrong master key is rejected without exposing either key");

const plaintext = JSON.stringify(store);
assert.equal(isEncryptedIntegrationStore(plaintext), false);
expectCryptoError(
  () => decryptIntegrationStore(plaintext, key),
  "PLAINTEXT_STORE",
  [secretToken, key],
);
ok("plaintext integration stores are detected and refused");

assert.equal(parseMasterKey(key).length, 32);
for (const invalidKey of [
  "",
  ` ${key}`,
  `${key}\n`,
  crypto.randomBytes(31).toString("base64"),
  crypto.randomBytes(33).toString("base64"),
  `${key.slice(0, 43)}-`,
]) {
  expectCryptoError(() => parseMasterKey(invalidKey), "INVALID_KEY", [invalidKey]);
}
ok("master key accepts only canonical base64 encoding of exactly 32 bytes");

const unsupported = JSON.parse(encrypted);
unsupported.version = ENVELOPE_VERSION + 1;
expectCryptoError(() => decryptIntegrationStore(JSON.stringify(unsupported), key), "UNSUPPORTED_VERSION", [key, secretToken]);
ok("unsupported envelope versions fail closed");

async function testSafeStorageAdapters() {
  let asyncDecryptCalls = 0;
  const asyncSafeStorage = {
    async decryptStringAsync() {
      asyncDecryptCalls += 1;
      return { result: key, shouldReEncrypt: asyncDecryptCalls === 1 };
    },
    async encryptStringAsync(value) {
      assert.equal(value, key);
      return Buffer.from("async-protected-value");
    },
    async isAsyncEncryptionAvailable() {
      return true;
    },
    decryptString() {
      throw new Error("sync decrypt should not run");
    },
    encryptString() {
      throw new Error("sync encrypt should not run");
    },
    isEncryptionAvailable() {
      return true;
    },
  };
  const asyncAdapter = await createSafeStorageAdapter(asyncSafeStorage);
  assert.equal(asyncAdapter.mode, "async");
  assert.equal((await asyncAdapter.encryptString(key)).toString("utf8"), "async-protected-value");
  const asyncUnlocked = await asyncAdapter.decryptString(Buffer.from("fixture"));
  assert.equal(asyncUnlocked.result, key);
  assert.equal(asyncUnlocked.shouldReEncrypt, true);
  assert.equal(asyncDecryptCalls, 2);

  const syncSafeStorage = {
    decryptString() {
      return key;
    },
    encryptString(value) {
      assert.equal(value, key);
      return Buffer.from("sync-protected-value");
    },
    async isAsyncEncryptionAvailable() {
      return false;
    },
    isEncryptionAvailable() {
      return true;
    },
  };
  const syncAdapter = await createSafeStorageAdapter(syncSafeStorage);
  assert.equal(syncAdapter.mode, "sync");
  assert.equal((await syncAdapter.encryptString(key)).toString("utf8"), "sync-protected-value");
  assert.deepEqual(await syncAdapter.decryptString(Buffer.from("fixture")), { result: key, shouldReEncrypt: false });
  assert.equal(await createSafeStorageAdapter({ isEncryptionAvailable: () => false }), null);
  ok("Electron safeStorage adapter normalizes async rotation results and sync fallback");
}

testSafeStorageAdapters()
  .then(() => console.log("INTEGRATION STORE CRYPTO PASS"))
  .catch((error) => {
    console.error(`INTEGRATION STORE CRYPTO FAIL: ${error.message}`);
    process.exitCode = 1;
  });
