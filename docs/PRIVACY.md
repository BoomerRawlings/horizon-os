# Privacy and credentials

## Vault data

Calendar items, captures, projects, research notes, and workflow logs stay in the selected Horizon workspace. That folder is Obsidian-compatible, but Obsidian is optional. The Horizon application is installed separately.

Horizon's local server listens on `127.0.0.1`. State-changing requests are accepted only from Horizon's own local window, requests with a body must use JSON, and the interface cannot be embedded in another webpage. The app does not include analytics or telemetry.

## Optional OpenAI-assisted Capture parsing

This feature is off until the user enables **Settings > Privacy > OpenAI-assisted capture parsing**. With it enabled, Horizon sends OpenAI the complete capture text, the current date and time zone, and relative names of project, research paper, and research idea notes so the model can suggest connections. It does not send note contents or the workspace's filesystem path. Deterministic local Capture rules remain available while the setting is off. Responses are requested with API storage disabled.

Choosing **Connect OpenAI** sends the fixed text `Reply OK.` in one small Responses API request, capped at 16 output tokens, after loading the models visible to the key. This confirms that the saved key can use the same API Horizon needs instead of showing a false connected state.

## Credentials and settings

Integration tokens, API keys, and the saved vault pointer stay in Horizon's application-data folder. They are not committed to Git or included in an installer. Integration secrets are not written to the vault; only an explicitly redacted connection summary may be mirrored there.

- Windows: `%APPDATA%\Horizon`
- macOS: `~/Library/Application Support/Horizon`

The installed desktop app encrypts the complete `integration-settings.json` store with AES-256-GCM. Its random 32-byte master key is never written in plaintext: Electron `safeStorage` protects the key with the current operating-system account and Horizon stores only the protected key blob as `integration-master-key.safe-storage`. On supported Windows systems this uses Windows account credential protection; macOS uses the user's Keychain. Horizon passes the unlocked key only to its isolated local server process and removes it from that process's inherited environment before launching any helpers.

Existing plaintext integration settings are migrated atomically the first time the installed app reads them. If operating-system protection is unavailable, an existing protected key cannot be unlocked, or encrypted settings have lost their protected key, Horizon stops with a non-secret error instead of replacing or exposing credentials.

Running `node Dashboard/server.cjs` directly is developer mode. Unless `HORIZON_REQUIRE_CREDENTIAL_ENCRYPTION=1` and a valid `HORIZON_INTEGRATION_STORE_KEY` are supplied, that direct server mode may keep its isolated integration settings in plaintext. Public installed Windows builds always require encryption.

The vault pointer in `vault-connection.json` is a local filesystem path, not a credential, and remains readable so Horizon can reconnect to the selected workspace.

Google OAuth client settings may also be read from the vault's ignored `00_System/local/Horizon/credentials/` folder. Keep that path out of Git.

## Before publishing a build

From `Dashboard/`, run:

```bash
node scripts/privacy-scan.mjs
```

Before sharing `Dashboard/native-dist/Horizon-Setup.exe`, run the guarded `npm run native:installer` builder and review its packaged-content checks and printed SHA256. It rejects personal workspace roots beside the app and verifies the bundled blank starter workspace separately.
