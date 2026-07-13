# Horizon

Horizon is a desktop workspace for your calendar, projects, research, files, capture queue, and focus sessions. It works directly from an Obsidian vault.

## Install on Windows

### 1. Finish setting up Obsidian

I recommend using [Obsidian Sync](https://obsidian.md/help/sync/setup) so the same vault is available on every computer.

On the new computer:

1. Install Obsidian.
2. Open the vault switcher. Under **Open vault from Obsidian Sync**, choose **Setup**.
3. Sign in, choose your remote vault, and create the local vault on this computer.
4. Wait until Obsidian shows the green check and **Fully Synced**.
5. Open the vault once and make sure your notes are there.

Obsidian calls the copy on this computer the **local vault**. That local folder is the one Horizon uses. Horizon does not connect directly to the remote vault stored by Obsidian Sync. See [Local and remote vaults](https://obsidian.md/help/Obsidian%2BSync/Local%2Band%2Bremote%2Bvaults).

If the vault is already on this computer and fully synced, skip to the next section.

### 2. Install Horizon

1. Open the [latest release](https://github.com/BoomerRawlings/horizon-os/releases/latest).
2. Download `Horizon-Setup-<version>.zip`.
3. Extract the entire ZIP to a normal folder.
4. Double-click `Install Horizon.cmd`.
5. When Horizon opens, choose the top-level folder of the local vault you just opened in Obsidian.
6. Open **Settings > Integrations** and connect the services you use.

That is it. Horizon uses the vault in place. It does not make a second copy, move the vault, or replace any notes.

Horizon expects an existing Horizon vault. The folder picker checks for `00_Index.md`, `HORIZON.md`, `Calendar`, `Inbox`, and `Runs`. If it rejects the folder, make sure you selected the top-level vault folder and that Obsidian Sync has finished.

More detail: [Windows installation](docs/WINDOWS.md)

## What moves between computers

Obsidian Sync carries the vault itself: notes, calendar items, projects, research records, and captures.

Each computer still needs its own:

- Horizon installation
- saved path to the local vault
- Microsoft, Google, Zotero, Codex, and other integration sign-ins

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

## Build from source

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
