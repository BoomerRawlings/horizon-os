# Horizon OS

Horizon is a local-first desktop workspace for turning loose captures into calendar items, projects, notes, and focused work sessions. Its source of truth is a plain folder of Markdown and JSON files that you can inspect, back up, or open in another editor.

> Early preview: the core local workflow works, but several third-party integrations are still launchers or setup placeholders. Read the platform notes before installing.

## Download

Download the newest build from [GitHub Releases](https://github.com/BoomerRawlings/horizon-os/releases/latest).

### Windows 10/11

1. Download `Horizon-Setup-<version>.zip`.
2. Extract the entire ZIP.
3. Double-click `Install Horizon.cmd`.
4. Follow the first-run walkthrough in Horizon.

The installer creates a local vault at `%USERPROFILE%\HorizonOS` by default. See [Windows installation](docs/WINDOWS.md) for SmartScreen guidance, custom locations, building from source, and updates.

### macOS

1. Download the DMG that matches your Mac:
   - `arm64` for Apple Silicon (M-series)
   - `x64` for Intel
2. Open the DMG and drag Horizon into Applications.
3. Because preview builds are not notarized yet, right-click Horizon and choose **Open** the first time.

The macOS build creates its vault in `~/Documents/HorizonOS`. Core capture, calendar, project, file, and focus workflows are available; Windows-specific app launchers and automatic rebuilding are not. See [macOS installation and status](docs/MACOS.md).

## The basic workflow

1. **Capture** anything without deciding where it belongs.
2. **Triage** the queue into a dated item, project, note, research item, or follow-up question.
3. **Choose a project** and identify one concrete next action.
4. **Start Focus** from Home, a project, or the Focus screen.
5. **Finish or recapture** what remains, then return to the queue later.

The full walkthrough is in [How to use Horizon](docs/USAGE.md) and inside the app under **Settings > Advanced > How to use Horizon**.

## What is local

- Your vault lives on your computer as readable files.
- Horizon's server listens only on `127.0.0.1`.
- There is no built-in analytics or telemetry service.
- OAuth tokens and API keys are excluded from Git and release bundles.
- In this preview, manually entered API keys are stored in Horizon's local app-data file, not an OS keychain. Use limited-purpose credentials and read [Privacy and credentials](docs/PRIVACY.md).

This repository contains an empty starter vault only. Runtime calendar items, captures, project notes, integration logs, credentials, build output, and local settings are ignored.

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
- `Calendar/`, `Inbox/`, `Project Registry/`, `Research Papers/`, `Runs/` - empty starter vault
- `docs/` - installation, usage, privacy, and platform notes

## License

No open-source license has been selected yet. The source is public for inspection and preview use, but publication alone does not grant redistribution rights.
