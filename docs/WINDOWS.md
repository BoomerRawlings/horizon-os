# Install Horizon on Windows

## Before installing Horizon

Set up the vault in Obsidian first.

1. Install Obsidian.
2. Open the vault switcher. Under **Open vault from Obsidian Sync**, choose **Setup**.
3. Sign in and connect the remote vault.
4. Create its local vault on this computer.
5. Wait for the green check and **Fully Synced**.
6. Open the vault and confirm that your notes are present.

These are Obsidian's terms: the **remote vault** is stored by Obsidian Sync, and the **local vault** is its folder on this computer. Horizon needs the local vault folder. [Obsidian Sync setup](https://obsidian.md/help/sync/setup)

If the local vault is already present and fully synced, you can move directly to installation.

## Install Horizon

1. Open the [latest Horizon release](https://github.com/BoomerRawlings/horizon-os/releases/latest).
2. Download `Horizon-Setup-<version>.zip`.
3. Extract the entire ZIP. Do not run the installer from inside the ZIP preview.
4. Double-click `Install Horizon.cmd`.
5. On first launch, choose the local vault's top-level folder.
6. Open **Settings > Integrations** and connect the services you use.

Horizon checks for the Horizon vault structure before saving the connection. The correct folder contains `00_Index.md`, `Calendar`, `Inbox`, and `Runs`.

Horizon reads that folder in place. It does not import, copy, merge, move, or replace the vault.

## Windows security prompt

The preview is not code-signed yet, so Windows may show Microsoft Defender SmartScreen. Confirm that the ZIP came from this repository's Releases page. If you trust it, choose **More info > Run anyway**.

## Where Horizon stores things

- Application: `%LOCALAPPDATA%\HorizonOS`
- Executable: `%LOCALAPPDATA%\HorizonOS\Dashboard\native-dist\win-unpacked\Horizon.exe`
- Vault: the local vault folder you selected
- Vault path and integration settings: `%APPDATA%\Horizon`
- Shortcuts: Desktop and Start menu

The vault path and integration sign-ins are saved only on this computer. Obsidian Sync carries the vault files, not those computer-specific settings.

When using Obsidian Sync, do not put its local vault inside OneDrive, Dropbox, or another sync service. See [Obsidian Sync FAQ](https://obsidian.md/help/sync/faq). Keep a [separate backup](https://obsidian.md/help/backup) as well; sync is not a backup.

## Build from source

Install Node.js 22 or newer and Git, then run:

```powershell
git clone https://github.com/BoomerRawlings/horizon-os.git
Set-Location horizon-os\Dashboard
npm ci
npm run build
npm run native:pack:safe
```

The packaged app will be in `Dashboard\native-dist\win-unpacked\Horizon.exe`.

To create the installer ZIP:

```powershell
npm run make:dist
```

## Remove Horizon

Close Horizon, remove its shortcuts, and delete `%LOCALAPPDATA%\HorizonOS`.

Delete `%APPDATA%\Horizon` only if you also want to remove the saved vault path and local integration settings. Do not delete the Obsidian vault.
