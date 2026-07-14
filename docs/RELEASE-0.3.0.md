# Horizon 0.3.0

Horizon 0.3.0 is the first release packaged for straightforward sharing: download one Windows installer, run it, and choose or create a workspace inside the app. Git, GitHub, Node.js, Obsidian, API keys, and integrations are not required for first use.

## Highlights

- Rebuilt Research Desk as a continuous spatial canvas with 2%-800% zoom, free pan, movable papers, loose-paper recovery, explicit paper connections, and persistent sticky notes.
- Double-click a paper pile to spread it in place. Expanded piles use deterministic, collision-free rows and preserve their order as other piles open.
- Semantic paper zoom now reveals readable citation, summary, and abstract content instead of miniature scrolling fields.
- Search and filters preserve the desk and sticky-note context; match navigation finds exact papers without rearranging them.
- Arrangement changes animate spatially, while **Fit** and focus controls provide immediate recovery.
- Research and Constellation use the available window height on laptop, half-screen, 4K, and ultrawide layouts without stray page scrollbars.
- Fixed the installed Constellation white-page failure and kept both spatial workspaces inside Horizon's shared transition system.
- Added clearer first-run setup and integration guidance for every advertised integration.
- Zotero Desktop can connect locally and read-only without an API key. Optional cloud/write access has direct official links and automatic User ID discovery.
- Integration secrets are encrypted outside the workspace in the installed desktop app; the installer contains no personal workspace data or credentials.

## Install

1. Download `Horizon-Setup.exe` from this release.
2. Run it. Windows may show an unsigned-app warning because this release is not yet code-signed.
3. Horizon opens automatically. Choose **Create my workspace** or select an existing Horizon/Obsidian folder.

Existing Horizon 0.2.7 users can run the same installer. The upgrade preserves the selected workspace, saved connections, and launch-at-sign-in choice while retiring the old development shortcuts and scheduled updater.

Windows is the supported packaged platform for 0.3.0. A signed and notarized macOS installer is not included.
