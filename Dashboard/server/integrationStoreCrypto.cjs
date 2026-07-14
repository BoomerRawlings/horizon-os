const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const AUTH_TAG_BYTES = 16;
const DEFAULT_AUTH_CONTEXT = "com.rawlings.horizon/integration-store";
const ENVELOPE_KIND = "horizon.integration-store";
const ENVELOPE_VERSION = 1;
const IV_BYTES = 12;

const ERROR_MESSAGES = Object.freeze({
  AUTHENTICATION_FAILED: "Encrypted integration settings could not be authenticated.",
  INVALID_CONTEXT: "Integration encryption context is invalid.",
  INVALID_ENVELOPE: "Encrypted integration settings are invalid.",
  INVALID_KEY: "Integration encryption key is invalid.",
  INVALID_PAYLOAD: "Integration settings payload is invalid.",
  PLAINTEXT_STORE: "Integration settings are not encrypted.",
  UNSUPPORTED_VERSION: "Encrypted integration settings use an unsupported version.",
});

class IntegrationStoreCryptoError extends Error {
  constructor(code) {
    super(ERROR_MESSAGES[code] || ERROR_MESSAGES.INVALID_ENVELOPE);
    this.code = code;
    this.name = "IntegrationStoreCryptoError";
  }
}

function fail(code) {
  throw new IntegrationStoreCryptoError(code);
}

function parseMasterKey(encodedKey) {
  if (typeof encodedKey !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(encodedKey)) {
    fail("INVALID_KEY");
  }
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32 || key.toString("base64") !== encodedKey) {
    fail("INVALID_KEY");
  }
  return key;
}

function normalizeContext(context) {
  if (typeof context !== "string" || context.length < 1 || context.length > 256 || context.includes("\0")) {
    fail("INVALID_CONTEXT");
  }
  return context;
}

function authenticatedData(context) {
  return Buffer.from(JSON.stringify({
    algorithm: ALGORITHM,
    context,
    kind: ENVELOPE_KIND,
    version: ENVELOPE_VERSION,
  }), "utf8");
}

function decodeCanonicalBase64(value, expectedBytes = null) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    fail("INVALID_ENVELOPE");
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value || (expectedBytes !== null && decoded.length !== expectedBytes)) {
    fail("INVALID_ENVELOPE");
  }
  return decoded;
}

function parseSerializedValue(serialized) {
  if (typeof serialized === "string") {
    try {
      return JSON.parse(serialized);
    } catch {
      return null;
    }
  }
  return serialized;
}

function isEncryptedIntegrationStore(serialized) {
  const value = parseSerializedValue(serialized);
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && value.kind === ENVELOPE_KIND
    && Number.isInteger(value.version),
  );
}

function parseEnvelope(serialized) {
  const value = parseSerializedValue(serialized);
  if (!value || typeof value !== "object" || Array.isArray(value) || value.kind !== ENVELOPE_KIND) {
    fail("PLAINTEXT_STORE");
  }
  if (value.version !== ENVELOPE_VERSION) fail("UNSUPPORTED_VERSION");
  if (
    value.algorithm !== ALGORITHM
    || typeof value.context !== "string"
    || typeof value.iv !== "string"
    || typeof value.authTag !== "string"
    || typeof value.ciphertext !== "string"
  ) {
    fail("INVALID_ENVELOPE");
  }
  return value;
}

function serializeStore(store) {
  if (!store || typeof store !== "object" || Array.isArray(store)) fail("INVALID_PAYLOAD");
  try {
    const serialized = JSON.stringify(store);
    if (typeof serialized !== "string") fail("INVALID_PAYLOAD");
    return serialized;
  } catch {
    fail("INVALID_PAYLOAD");
  }
}

function encryptIntegrationStore(store, encodedKey, options = {}) {
  const key = parseMasterKey(encodedKey);
  const context = normalizeContext(options.context === undefined ? DEFAULT_AUTH_CONTEXT : options.context);
  const plaintext = Buffer.from(serializeStore(store), "utf8");
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_BYTES });
  cipher.setAAD(authenticatedData(context));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${JSON.stringify({
    algorithm: ALGORITHM,
    authTag: authTag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    context,
    iv: iv.toString("base64"),
    kind: ENVELOPE_KIND,
    version: ENVELOPE_VERSION,
  }, null, 2)}\n`;
}

function decryptIntegrationStore(serialized, encodedKey, options = {}) {
  const key = parseMasterKey(encodedKey);
  const expectedContext = normalizeContext(options.context === undefined ? DEFAULT_AUTH_CONTEXT : options.context);
  const envelope = parseEnvelope(serialized);
  if (envelope.context !== expectedContext) fail("AUTHENTICATION_FAILED");

  const iv = decodeCanonicalBase64(envelope.iv, IV_BYTES);
  const authTag = decodeCanonicalBase64(envelope.authTag, AUTH_TAG_BYTES);
  const ciphertext = decodeCanonicalBase64(envelope.ciphertext);
  let plaintext;
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_BYTES });
    decipher.setAAD(authenticatedData(expectedContext));
    decipher.setAuthTag(authTag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    fail("AUTHENTICATION_FAILED");
  }

  try {
    const store = JSON.parse(plaintext);
    if (!store || typeof store !== "object" || Array.isArray(store)) fail("INVALID_PAYLOAD");
    return store;
  } catch (error) {
    if (error instanceof IntegrationStoreCryptoError) throw error;
    fail("INVALID_PAYLOAD");
  }
}

async function createSafeStorageAdapter(safeStorage) {
  if (!safeStorage || typeof safeStorage !== "object") return null;
  const hasAsync = (
    typeof safeStorage.isAsyncEncryptionAvailable === "function"
    && typeof safeStorage.encryptStringAsync === "function"
    && typeof safeStorage.decryptStringAsync === "function"
  );
  if (hasAsync) {
    try {
      if (await safeStorage.isAsyncEncryptionAvailable()) {
        return {
          mode: "async",
          async decryptString(value) {
            let unlocked = await safeStorage.decryptStringAsync(value);
            const shouldReEncrypt = Boolean(unlocked?.shouldReEncrypt);
            if (shouldReEncrypt) unlocked = await safeStorage.decryptStringAsync(value);
            return {
              result: typeof unlocked === "string"
                ? unlocked
                : typeof unlocked?.result === "string" ? unlocked.result : "",
              shouldReEncrypt,
            };
          },
          async encryptString(value) {
            return Buffer.from(await safeStorage.encryptStringAsync(value));
          },
        };
      }
    } catch {
      // Fall through to the synchronous OS-backed implementation when available.
    }
  }

  try {
    if (
      !safeStorage.isEncryptionAvailable()
      || typeof safeStorage.encryptString !== "function"
      || typeof safeStorage.decryptString !== "function"
    ) return null;
    return {
      mode: "sync",
      async decryptString(value) {
        return { result: safeStorage.decryptString(value), shouldReEncrypt: false };
      },
      async encryptString(value) {
        return safeStorage.encryptString(value);
      },
    };
  } catch {
    return null;
  }
}

module.exports = {
  DEFAULT_AUTH_CONTEXT,
  ENVELOPE_VERSION,
  IntegrationStoreCryptoError,
  createSafeStorageAdapter,
  decryptIntegrationStore,
  encryptIntegrationStore,
  isEncryptedIntegrationStore,
  parseMasterKey,
};
