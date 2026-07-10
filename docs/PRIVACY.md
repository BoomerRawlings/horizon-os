# Privacy and credentials

Horizon is local-first, but local-first does not mean every optional integration is risk-free. This document describes the current preview honestly.

## Data that stays in the vault

Calendar items, captures, project records, research notes, and workflow logs are stored under your HorizonOS folder. The repository's ignore rules exclude generated vault content from Git by default.

The local server binds to `127.0.0.1`; it is not intended to accept connections from other devices. Horizon does not include an analytics or telemetry client.

## Credentials

OAuth tokens and manually entered API keys are written to Horizon's local app-data folder and are excluded from the vault, Git, installer bundles, and redacted settings summaries.

Current limitation: manually entered API keys are stored in a local JSON file and are not protected by Windows Credential Manager or macOS Keychain yet. Use limited-purpose credentials, restrict scopes, and rotate a key if the machine or account may be compromised.

- Windows app data: `%APPDATA%\Horizon`
- macOS app data: `~/Library/Application Support/Horizon`

Google OAuth client configuration may also be loaded from the vault's ignored `00_System/local/Horizon/credentials/` folder. Never remove that path from `.gitignore`.

## Before sharing a fork or release

Run `npm run privacy:scan` from `Dashboard/`, inspect `git status`, and confirm that the release contains the empty starter vault rather than your working vault. The Windows distribution builder performs a second count of calendar items and captures before creating its ZIP.
