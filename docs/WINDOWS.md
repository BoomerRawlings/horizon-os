# Windows installation

## Recommended: install a release

1. Install Obsidian and allow Obsidian Sync to finish downloading the existing vault.
2. Open the vault once in Obsidian and confirm the expected notes are present.
3. Open the [latest release](https://github.com/BoomerRawlings/horizon-os/releases/latest).
4. Download `Horizon-Setup-<version>.zip`.
5. Extract the whole ZIP to a normal folder. Do not run the installer from inside the compressed preview.
6. Double-click `Install Horizon.cmd`.
7. When Horizon asks, select the vault's top-level folder.
8. Connect machine-specific integrations under **Settings > Integrations**.

The bundle contains a prebuilt app, not a vault. Horizon validates the selected folder and reads it in place. Node.js and Git are optional for basic use; the installer may add them so Horizon can rebuild future source updates.

## Windows security prompts

Preview builds are not code-signed yet. Windows may show Microsoft Defender SmartScreen. Confirm that the ZIP came from this repository's Releases page, then choose **More info > Run anyway** if you trust the build. Do not bypass a warning for a file obtained elsewhere.

## Where things live

- App code: `%LOCALAPPDATA%\HorizonOS`
- Main executable: `%LOCALAPPDATA%\HorizonOS\Dashboard\native-dist\win-unpacked\Horizon.exe`
- Vault: the existing folder selected after Obsidian Sync finishes
- Vault pointer and integration settings: `%APPDATA%\Horizon`
- Desktop and Start menu shortcuts: created by the installer

Obsidian Sync and your own backup plan protect the vault. The app folder can be reinstalled. Credentials in `%APPDATA%\Horizon` must be reconnected or handled separately on each computer.

## Build from source

Install Node.js 22+ and Git, then run:

```powershell
git clone https://github.com/BoomerRawlings/horizon-os.git
Set-Location horizon-os\Dashboard
npm ci
npm run build
npm run native:pack:safe
```

The packaged executable will be at `Dashboard\native-dist\win-unpacked\Horizon.exe`.

To make a clean shareable installer ZIP:

```powershell
npm run make:dist
```

The ZIP is written to your Desktop and contains only the app. The builder exits if vault folders are staged beside it.

## Remove Horizon

Close Horizon, remove its shortcuts, then delete `%LOCALAPPDATA%\HorizonOS`. Delete `%APPDATA%\Horizon` only if you also want to remove the saved vault pointer and local integration settings. The selected Obsidian vault is separate and should not be deleted.
