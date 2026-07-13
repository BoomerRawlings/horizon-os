# Privacy and credentials

## Vault data

Calendar items, captures, projects, research notes, and workflow logs stay in the selected Obsidian vault. The Horizon application is installed separately.

Horizon's local server listens on `127.0.0.1`. The app does not include analytics or telemetry.

## Credentials and settings

Integration tokens, API keys, and the saved vault path are stored in Horizon's application-data folder. They are not saved in the vault, committed to Git, or included in an installer.

- Windows: `%APPDATA%\Horizon`
- macOS: `~/Library/Application Support/Horizon`

Manually entered API keys are currently stored in a local JSON file, not Windows Credential Manager or macOS Keychain. Use limited-purpose credentials and restrict their permissions.

Google OAuth client settings may also be read from the vault's ignored `00_System/local/Horizon/credentials/` folder. Keep that path out of Git.

## Before publishing a build

From `Dashboard/`, run:

```bash
node scripts/privacy-scan.mjs
```

Check `git status` and confirm that the installer contains `HorizonOS/Dashboard` only. The Windows distribution builder stops if vault folders are staged beside the application.
