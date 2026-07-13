# Horizon OS

Horizon is a local-first desktop workspace for turning loose captures into calendar items, projects, notes, and focused work sessions. Its source of truth is a plain folder of Markdown and JSON files that you can inspect, back up, or open in another editor.

> Early preview: the core local workflow works, but several third-party integrations are still launchers or setup placeholders. Read the platform notes before installing.

## Download

Download the newest build from [GitHub Releases](https://github.com/BoomerRawlings/horizon-os/releases/latest).

### Windows 10/11

1. Install Obsidian, sign in to Obsidian Sync, and let the existing vault finish downloading.
2. Open the vault once in Obsidian to confirm it is complete.
3. Download `Horizon-Setup-<version>.zip` and extract the entire ZIP.
4. Double-click `Install Horizon.cmd`.
5. On first launch, choose the synced vault's top-level folder.
6. Connect the integrations you use.

Horizon installs app code under `%LOCALAPPDATA%\HorizonOS` and reads the selected vault in place. It does not import, copy, merge, or replace the vault. See [Windows installation](docs/WINDOWS.md) for details.

### macOS

The vault-selection layer is cross-platform, but the current downloadable Mac preview predates this handoff flow. Until a new DMG is published, build v0.2.2 on a Mac using the [macOS instructions](docs/MACOS.md).

When a v0.2.2-or-newer DMG is available:

1. Install Obsidian and finish syncing the existing vault.
2. Download the DMG that matches your Mac:
   - `arm64` for Apple Silicon (M-series)
   - `x64` for Intel
3. Open the DMG and drag Horizon into Applications.
4. Because preview builds are not notarized yet, right-click Horizon and choose **Open** the first time.
5. Choose the synced vault's top-level folder, then connect integrations.

Core capture, calendar, project, file, research, and focus workflows are portable; Windows-specific app launchers and automatic rebuilding are not. See [macOS installation and status](docs/MACOS.md).

## The basic workflow

1. **Capture** anything without deciding where it belongs.
2. **Triage** the queue into a dated item, project, note, research item, or follow-up question.
3. **Choose a project** and identify one concrete next action.
4. **Start Focus** from Home, a project, or the Focus screen.
5. **Finish or recapture** what remains, then return to the queue later.

The full walkthrough is in [How to use Horizon](docs/USAGE.md) and inside the app under **Settings > Advanced > How to use Horizon**.

## What is local

- Your selected Obsidian vault remains where Obsidian Sync placed it.
- The app, vault pointer, and vault are separate; uninstalling Horizon does not remove the vault.
- Horizon's server listens only on `127.0.0.1`.
- There is no built-in analytics or telemetry service.
- OAuth tokens and API keys are excluded from Git and release bundles.
- In this preview, manually entered API keys are stored in Horizon's local app-data file, not an OS keychain. Use limited-purpose credentials and read [Privacy and credentials](docs/PRIVACY.md).

This repository contains app code plus empty fixtures for development. Release bundles contain the app only. Runtime calendar items, captures, project notes, integration logs, credentials, build output, and local settings are ignored.

## Develop locally

Requirements: Node.js 22 or newer and Git.

```bash
git clone https://github.com/BoomerRawlings/horizon-os.git
cd horizon-os/Dashboard
npm ci
npm run build
npm run native:dev
```

Useful checks:

```bash
npm run test:heuristics
npm run smoke
npm run privacy:scan
```

Release artifacts are built and tested on their target operating system. The release page includes separate unsigned macOS builds for Intel and Apple Silicon.

## Repository layout

- `Dashboard/` - React, Vite, Node, and Electron application
- `Calendar/`, `Inbox/`, `Project Registry/`, `Research Papers/`, `Runs/` - empty development fixtures (not included in the installer)
- `docs/` - installation, usage, privacy, and platform notes

## License

No open-source license has been selected yet. The source is public for inspection and preview use, but publication alone does not grant redistribution rights.
