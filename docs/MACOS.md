# macOS installation and status

macOS support is an early preview. Horizon's vault connection, capture queue, calendar, projects, research, files, and Focus screen are designed to run on macOS. Windows-specific Office/Codex launchers, the startup toggle, and in-app source rebuilding are not available yet.

## Install a release

1. Install Obsidian and let Obsidian Sync fully download the existing vault.
2. Open the newest release that includes v0.2.2-or-newer Mac assets. The older v0.2.0 preview does not include the new attached-vault handoff.
3. Download `Horizon-<version>-arm64.dmg` for an Apple Silicon Mac or `Horizon-<version>-x64.dmg` for an Intel Mac.
4. Open the DMG and drag Horizon into Applications.
5. Right-click Horizon in Applications and choose **Open** for the first launch.
6. Select the synced vault's top-level folder, then connect integrations.

The preview is not signed or notarized with an Apple Developer certificate. If macOS still blocks it, open **System Settings > Privacy & Security**, verify that the blocked app is Horizon from this repository, and choose **Open Anyway**. Do not weaken system-wide security settings.

Horizon stores the selected path in `~/Library/Application Support/Horizon/vault-connection.json` and uses the vault in place. Credentials remain in that machine-local app-data directory.

## Build on a Mac

Install Node.js 22+ and Git:

```bash
git clone https://github.com/BoomerRawlings/horizon-os.git
cd horizon-os/Dashboard
npm ci
npm run native:pack:mac
```

To build a specific architecture instead:

```bash
# Apple Silicon
npx electron-builder --mac --arm64

# Intel
npx electron-builder --mac --x64
```

DMG and ZIP files are written to `Dashboard/native-dist/`.

## Path to a polished Mac release

A production-grade Mac release still needs:

1. An Apple Developer account.
2. A Developer ID Application certificate configured for the release build.
3. Apple notarization credentials.
4. Validation of launchers and startup behavior with Mac-native implementations.

Until signing and notarization are configured, macOS downloads are clearly labeled unsigned previews.
