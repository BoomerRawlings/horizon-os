# Building the Windows distribution

The distribution builder creates one shareable ZIP containing a prebuilt Windows app, the one-click installer, and a clean starter vault.

## Build

From `Dashboard/`:

```powershell
npm ci
npm run native:pack:safe
npm run make:dist
```

The result is `Horizon-Setup-<version>.zip` on your Desktop. To choose another destination:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/make-distribution.ps1 -OutputDirectory C:\path\to\output
```

## Recipient instructions

The recipient extracts the complete ZIP and double-clicks `Install Horizon.cmd`. The installer copies Horizon to `%USERPROFILE%\HorizonOS` by default, creates shortcuts, and opens the setup guide.

## Privacy boundary

The builder copies the app and `dist-installer/starter-vault` only. It does not copy calendar items, captures, projects, credentials, local state, or integration logs from a working vault. Before sharing, confirm that the builder reports zero calendar items, captures, and pending triage files.

`distribution.json` defines the public code-only repository used for optional source updates. Fork maintainers should change that URL to their own clean repository before distributing a fork.

## macOS

The Windows distribution script is intentionally Windows-only. Build macOS DMG and ZIP artifacts on a Mac using the commands in `docs/MACOS.md` at the repository root.
