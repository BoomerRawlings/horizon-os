# Install Horizon on Windows

## Quick install

If an older Horizon window is open, close it first. Your workspace and saved connections remain in place.

1. [Download `Horizon-Setup.exe`](https://github.com/BoomerRawlings/horizon-os/releases/latest/download/Horizon-Setup.exe).
2. Double-click `Horizon-Setup.exe`.
3. When Horizon opens, choose **Create my workspace**.

You can begin immediately. Obsidian, Git, Node.js, API keys, and integrations are not required for first use.

Do not download GitHub's automatic **Source code (zip)** files unless you want the developer source. The normal Windows download is the single `Horizon-Setup.exe` file.

### Upgrading from 0.2.7

Use the same three steps above. On its first start, Horizon 0.3.0 removes the old `Horizon OS Dev Auto Update` task and only the exact old Horizon shortcuts so the two versions cannot compete. It preserves your workspace, saved connections, launch-at-sign-in choice, and the old `%LOCALAPPDATA%\HorizonOS` app folder. That old folder is left untouched as a rollback copy and no longer runs automatically.

## Windows security prompt

This preview is not code-signed yet. If Microsoft Defender SmartScreen appears:

1. On **Windows protected your PC**, choose **More info**.
2. Confirm **App** is `Horizon-Setup.exe` and **Publisher** is **Unknown publisher**.
3. Choose **Run anyway**.
4. If Windows then asks whether to allow the app to make changes, choose **Yes** to install it.

Only continue when the file came from the Horizon release link above.

## Use an existing Obsidian vault (optional)

If you already have a workspace in Obsidian, choose the existing-vault option on first launch and select its top-level folder. If Horizon structure is missing, the app asks before adding only the missing starter folders and files. It never moves, deletes, or replaces an existing note.

If the vault uses Obsidian Sync, wait for the green check and **Fully Synced** before selecting it. [Obsidian Sync setup](https://obsidian.md/help/sync/setup)

Horizon checks for the Horizon workspace structure before saving the connection. The correct folder contains `00_Index.md`, `HORIZON.md`, `Calendar`, `Inbox`, and `Runs`.

## Where Horizon stores things

- Application: installed for your Windows account, normally under `%LOCALAPPDATA%\Programs\Horizon`
- Workspace: the folder Horizon created or the existing vault you selected
- Workspace path and integration settings: `%APPDATA%\Horizon`
- Shortcuts: Desktop and Start menu

The workspace path and optional integration sign-ins are saved only on this computer. Obsidian Sync carries vault files, not those computer-specific settings.

When using Obsidian Sync, do not put its local vault inside OneDrive, Dropbox, or another sync service. See [Obsidian Sync FAQ](https://obsidian.md/help/sync/faq). Keep a [separate backup](https://obsidian.md/help/backup) as well; sync is not a backup.

## Optional advanced setup: build from source

This is only for developers. It is not needed to install or use Horizon.

Install Node.js 22 or newer and Git, then run:

```powershell
git clone https://github.com/BoomerRawlings/horizon-os.git
Set-Location horizon-os\Dashboard
npm ci
npm run build
npm run native:installer
```

The installer will be in `Dashboard\native-dist\Horizon-Setup.exe`.

## Remove Horizon

Use **Settings > Apps > Installed apps > Horizon > Uninstall**.

Delete `%APPDATA%\Horizon` only if you also want to remove the saved workspace path and local integration settings. Uninstalling Horizon does not delete your workspace or Obsidian vault.
