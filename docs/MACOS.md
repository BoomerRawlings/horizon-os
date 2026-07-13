# Run Horizon on macOS

There is not a current macOS installer for this release. Horizon can be built on a Mac, but the build is unsigned and some Windows launchers are not available.

## Prepare the vault

1. Install Obsidian.
2. Use **Open vault from Obsidian Sync > Setup** to connect the remote vault.
3. Create the local vault on the Mac.
4. Wait until Obsidian shows **Fully Synced**.
5. Open the vault once and confirm that your notes are present.

Horizon uses that local vault folder in place.

## Build Horizon

Install Node.js 22 or newer and Git, then run:

```bash
git clone https://github.com/BoomerRawlings/horizon-os.git
cd horizon-os/Dashboard
npm ci
npm run native:pack:mac
```

The DMG and ZIP files will be in `Dashboard/native-dist/`.

To build one architecture only:

```bash
# Apple Silicon
npx electron-builder --mac --arm64

# Intel
npx electron-builder --mac --x64
```

Open the DMG and drag Horizon into Applications. Because the preview is not signed or notarized, macOS may block the first launch. Right-click Horizon and choose **Open**. If needed, use **System Settings > Privacy & Security > Open Anyway** after confirming the app came from this repository.

On first launch, select the local vault's top-level folder. Horizon saves that path in `~/Library/Application Support/Horizon/vault-connection.json`. Connect integrations separately on the Mac.

## Current limits

- Windows-specific Office and Codex launchers are not available.
- Start-at-login and automatic source updates need Mac-specific work.
- A normal public Mac installer still needs Apple signing and notarization.
