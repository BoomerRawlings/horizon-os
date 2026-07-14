# Horizon

Horizon is a desktop workspace for your calendar, projects, research, files, capture queue, and focus sessions. Its data stays in a plain Markdown workspace that can also be opened as an Obsidian vault.

## Install on Windows

1. [Download `Horizon-Setup.exe`](https://github.com/BoomerRawlings/horizon-os/releases/latest/download/Horizon-Setup.exe).
2. Double-click `Horizon-Setup.exe`.
3. When Horizon opens, choose **Create my workspace**.

That is all you need for first use. Obsidian, Git, Node.js, API keys, and integrations are optional and can be added later.

Because this preview is not code-signed yet, Windows may show **Windows protected your PC**. Choose **More info**, confirm the app is `Horizon-Setup.exe` and the publisher is **Unknown publisher**, then choose **Run anyway**.

Already have a workspace in Obsidian? Choose the existing-vault option on first launch and select the vault's top-level folder. If Horizon structure is missing, it offers to add only the missing starter folders and files. It never moves, deletes, or replaces an existing note.

On the Releases page, the automatic **Source code (zip)** downloads are for developers. Most people should use `Horizon-Setup.exe`.

More detail: [Windows installation](docs/WINDOWS.md)

## What moves between computers

The workspace created by Horizon starts on this computer. If you connect an Obsidian vault, Obsidian Sync can carry its notes, calendar items, projects, research records, and captures between computers.

Each computer still needs its own:

- Horizon installation
- saved path to the local workspace
- optional Microsoft, Google, Zotero, Codex, and other integration sign-ins

If you use Obsidian Sync, keep its local vault out of OneDrive, Dropbox, or another sync service. See [Obsidian Sync FAQ](https://obsidian.md/help/sync/faq). Obsidian also recommends keeping a [separate backup](https://obsidian.md/help/backup); sync is not a backup.

## macOS

There is not a current macOS installer for this release. Horizon can be built on a Mac, but the build is unsigned and some Windows launchers are not available.

See [macOS installation](docs/MACOS.md).

## Use Horizon

1. Capture a task, idea, link, paper, or deadline.
2. Sweep the queue and send each item to Calendar, Projects, Research, or Notes.
3. Choose one project and one clear next action.
4. Start a Focus session.
5. Mark the action complete or capture what remains.

See [How to use Horizon](docs/USAGE.md), or open **Settings > Advanced > How to use Horizon** inside the app.

Optional services: [step-by-step integration setup](docs/INTEGRATIONS.md)

## Optional: build from source (advanced)

This is a developer workflow, not part of the normal installation.

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
npm run test:vault
npm run test:heuristics
npm run smoke
npm run privacy:scan
```

## Privacy

The vault stays in the folder you selected. Horizon's local server listens only on `127.0.0.1`, and the app has no analytics or telemetry service. Integration credentials are stored outside the vault and are not included in this repository or its installers.

See [Privacy and credentials](docs/PRIVACY.md).

## License

No open-source license has been selected yet. The source is public for inspection and preview use, but publication alone does not grant redistribution rights.
