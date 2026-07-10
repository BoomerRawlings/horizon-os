# macOS installation and status

macOS support is an early preview. Horizon's local vault, capture queue, calendar, projects, files, and Focus screen are designed to run on macOS. Windows-specific Office/Codex launchers, the startup toggle, and in-app source rebuilding are not available yet.

## Install a release

1. Open the [latest release](https://github.com/BoomerRawlings/horizon-os/releases/latest).
2. Download `Horizon-<version>-arm64.dmg` for an Apple Silicon Mac or `Horizon-<version>-x64.dmg` for an Intel Mac.
3. Open the DMG and drag Horizon into Applications.
4. Right-click Horizon in Applications and choose **Open** for the first launch.

The preview is not signed or notarized with an Apple Developer certificate. If macOS still blocks it, open **System Settings > Privacy & Security**, verify that the blocked app is Horizon from this repository, and choose **Open Anyway**. Do not weaken system-wide security settings.

Horizon creates a starter vault in `~/Documents/HorizonOS` on first launch. Set the `HORIZON_VAULT_ROOT` environment variable before launching if you are developing against a different vault.

## Build on a Mac

Install Node.js 22+ and Git:

```bash
git clone https://github.com/BoomerRawlings/horizon-os.git
cd horizon-os/Dashboard
npm ci
npm run build
npm run native:dev
```

Package the architecture you are currently using:

```bash
# Apple Silicon
npx electron-builder --mac --arm64

# Intel
npx electron-builder --mac --x64
```

DMG and ZIP files are written to `Dashboard/native-dist/`.

## Path to a polished Mac release

The published preview includes builds produced on native Intel and Apple-Silicon Mac runners. A production-grade Mac release still needs:

1. An Apple Developer account.
2. A Developer ID Application certificate configured for the release build.
3. Apple notarization credentials.
4. Validation of launchers and startup behavior with Mac-native implementations.

Until signing and notarization are configured, macOS downloads are clearly labeled unsigned previews.
