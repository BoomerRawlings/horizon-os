# Horizon 0.4.0

Horizon 0.4.0 turns Research into one scalable space for papers, connections, and brainstorming while keeping installation to one Windows installer.

## Highlights

- Added a persistent **Board** for freely arranging papers, stacks, sticky notes, and labeled relationships.
- Added a separate **Explore** view for animated sorting, search, and filters. Explore never rewrites Board positions or hides sticky-note context.
- Double-click a stack to spread or restack it in place. Expanded stacks push later groups clear instead of overlapping them.
- Drag papers loose, move stacks and stickies directly, right-click for object actions, and use Undo/Redo for spatial changes.
- Added logarithmic pointer-anchored zoom across library, collection, preview, paper, and reading levels, with Fit, Fit Selection, and Back recovery controls.
- Papers render a real first page when a local or Zotero PDF is available. Preview loading is lazy and cancellable; missing documents use an honest citation-card fallback.
- Double-click a paper to open the full Reader, then return to the exact same mode, camera, selection, and geometry.
- Connections can link papers, stacks, and sticky notes. Labels follow their lines and can be edited, moved, reversed, or removed.
- Viewport virtualization and semantic grouping were verified with deterministic 100, 1,000, and 10,000-paper fixtures.
- Research and Constellation fill laptop, half-ultrawide, 4K, and narrow windows without stray document scrolling or white-page failures.

## Documents and privacy

Local PDFs are served only from inside the selected workspace. Zotero PDFs are proxied through Horizon so credentials never reach the renderer. Both paths support the byte-range reads used by the first-page renderer and full Reader. The installer contains no personal workspace data or credentials.

## Install

1. Download `Horizon-Setup.exe` from this release.
2. Run it. Windows may show an unsigned-app warning because this preview is not yet code-signed.
3. Horizon opens automatically. Choose **Create my workspace** or select an existing Horizon/Obsidian folder.

Existing Horizon 0.3.0 users can run the same installer. The upgrade preserves the selected workspace, saved connections, integration credentials, Research layout, and launch-at-sign-in choice.

Windows is the supported packaged platform for 0.4.0. A signed and notarized macOS installer is not included.
