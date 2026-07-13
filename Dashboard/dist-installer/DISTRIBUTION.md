# Distributing Horizon

Horizon ships as an app-only installer. A vault is never bundled, copied, merged, or used as the application's update checkout.

## Build the Windows handoff

From `Dashboard/`:

```powershell
npm run native:pack:safe
npm run make:dist
```

The builder writes `Horizon-Setup-<version>.zip` to the Desktop. The recipient extracts the entire ZIP and runs `Install Horizon.cmd`.

The ZIP contains:

```text
Install Horizon.cmd
bootstrap-install.ps1
SETUP.html
distribution.json
README.txt
HorizonOS/
  Dashboard/       app source plus the prebuilt Windows application
```

It does not contain Calendar, Inbox, Runs, Project Registry, Research Papers, `.obsidian`, credentials, or machine-local Horizon state. The builder exits if anything is staged beside `HorizonOS/Dashboard`.

## Laptop handoff

1. Install Obsidian and allow Obsidian Sync to finish downloading the existing vault.
2. Run the Horizon installer.
3. On first launch, select the synced vault's top-level folder.
4. Connect machine-specific integrations.

The vault path is stored in Horizon's private application-data directory. Horizon validates the folder before starting and confirms that the local server is using that exact vault.

## Updates

`distribution.json` points to the public, code-only repository. During packaging, the builder stamps the current branch and commit into the bundled copy of that file. The installer creates a sparse app-only checkout, so update operations can see only `Dashboard/` and cannot touch the selected vault.

Node.js and Git are update helpers only. The prebuilt application can launch without them.

## macOS path

The same vault-selection and machine-local connection code is cross-platform. Build the Mac artifacts on macOS from `Dashboard/` with:

```bash
npm ci
npm run native:pack:mac
```

This produces DMG and ZIP artifacts in `Dashboard/native-dist/`. A signed/notarized public Mac release still requires an Apple Developer identity; an unsigned local build can be opened through macOS Privacy & Security. The Windows `.cmd` installer does not run on macOS.
