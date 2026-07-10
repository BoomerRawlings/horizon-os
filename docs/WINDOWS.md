# Windows installation

## Recommended: install a release

1. Open the [latest release](https://github.com/BoomerRawlings/horizon-os/releases/latest).
2. Download `Horizon-Setup-<version>.zip`.
3. Extract the whole ZIP to a normal folder. Do not run the installer from inside the compressed preview.
4. Double-click `Install Horizon.cmd`.
5. Accept the default `%USERPROFILE%\HorizonOS` location or enter another folder.

The bundle contains a prebuilt app and an empty starter vault. Node.js and Git are optional for basic use; the installer may offer to add them so Horizon can rebuild future source updates.

## Windows security prompts

Preview builds are not code-signed yet. Windows may show Microsoft Defender SmartScreen. Confirm that the ZIP came from this repository's Releases page, then choose **More info > Run anyway** if you trust the build. Do not bypass a warning for a file obtained elsewhere.

## Where things live

- App and vault: `%USERPROFILE%\HorizonOS` by default
- Main executable: `%USERPROFILE%\HorizonOS\Dashboard\native-dist\win-unpacked\Horizon.exe`
- Local integration settings: `%APPDATA%\Horizon`
- Desktop and Start menu shortcuts: created by the installer

Back up the whole HorizonOS folder to preserve your notes and project state. Credentials in `%APPDATA%\Horizon` require separate handling.

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

The ZIP is written to your Desktop and contains only the app plus the empty starter vault.

## Remove Horizon

Close Horizon, remove its shortcuts, then delete the folder you selected during installation. Delete `%APPDATA%\Horizon` only if you also want to remove saved local integration settings. Back up your vault first.
