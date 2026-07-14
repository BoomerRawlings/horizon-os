# Objective

Validate Infinite Research as a person would use it: enter Research, manipulate stacks and papers, switch between Board and Explore, filter and sort, open and close Reader, create and label a relationship, zoom, resize the application, and confirm the same full-height behavior in Constellation.

# Test Environment

- Built production UI served by the Horizon local server at `127.0.0.1`.
- Real 17-paper vault library and two existing research stickies.
- Active-workspace checks at 1280 × 720, 1920 × 1080, 1720 × 1000, 900 × 700, and 3840 × 2160.
- Deterministic 100, 1,000, and 10,000-paper scale fixtures.
- Isolated local-PDF route fixture with full and byte-range reads.
- Installed Horizon v0.3.0 remained running separately; the v0.4 branch used an isolated port and test app-data directory.

# Starting Assumptions

- Board geometry must persist independently from Explore sorting and filtering.
- Double-clicking a stack must spread it in place without opening another window.
- Double-clicking a paper must open Reader and return to the same world state.
- Wheel input over the canvas must zoom without scrolling the document.
- No test should rewrite a real paper or sticky-note file.

# Steps Taken

1. Opened Research from Home with the real library loaded.
2. Visually inspected the initial fitted Board.
3. Double-clicked a three-paper stack and inspected collision-free expansion.
4. Double-clicked a paper, read its fallback Reader view, and returned to Board.
5. Switched to Explore, changed sort from Subject to Author, and searched for `ChatGPT`.
6. Confirmed both stickies stayed available in the Explore sticky shelf.
7. Returned to Board and compared rendered Board geometry before and after Explore.
8. Dragged a paper free from its stack and used Undo.
9. Created a paper-to-stack relationship with the explicit stack target, labeled it, and removed it.
10. Opened a paper right-click menu.
11. Zoomed at the pointer and checked document/canvas scroll positions.
12. Checked laptop/4K-scale, half-ultrawide, and narrow-window geometry.
13. Repeated responsive checks against only the active workspace after every size change and checked Constellation at narrow and full-4K sizes.
14. Verified first-page fallback behavior in the live library and the secure local-PDF route with a temporary isolated vault.
15. Reconciled a stale removed-paper fixture and confirmed it could not distort Fit.

# What Worked

- Research loaded into the existing application motion layer with the real paper and sticky data.
- The Board and Explore distinction was immediately visible.
- Double-click stack expansion worked and produced separated paper cards.
- Paper body dragging produced a loose paper; Undo returned it to the stack.
- Explore sorting and filtering did not mutate the Board. The 15 rendered Board object positions were identical before and after the Explore round trip.
- Search dimmed non-matches instead of deleting them.
- Both stickies remained present while Explore was filtered.
- Reader opened on double-click and returned to the same Board mode with the same expanded stack.
- Right-click produced a concise paper action menu.
- Wheel zoom changed the world transform while document scroll and canvas scroll remained at zero.
- 1920 × 1080 and 1720 × 1000 used the available lower screen area with no document scrollbar.
- Rendering was viewport-bounded: only visible objects were mounted.
- Paper, stack, and sticky targets expose an explicit connection action; relationship selection, label save, label movement, reversal, and removal all worked.
- Fit reserves the top control area; every tested viewport reported zero object/control overlaps.
- 100, 1,000, and 10,000-paper layout fixtures completed in 0.1 ms, 0.8 ms, and 9.7 ms respectively on the final test run, with 20 close-view cards mounted in each case.
- Local PDFs are exposed only through a same-origin, vault-confined route with byte-range support; missing PDFs keep the citation fallback.
- Constellation rendered its dark canvas rather than a white page and used the full available panel at narrow and full-4K sizes.
- The document and workspace scroll positions remained at zero, with scroll dimensions equal to client dimensions, at every tested size.

# What Felt Intuitive

- Board/Explore tabs communicate the persistent-versus-temporary model better than a single overloaded desk.
- Stack double-click and paper double-click have distinct, predictable outcomes.
- Dragging a paper body means move; the separate link handle clearly means connect.
- The semantic label (`Pages`, `Previews`) is more meaningful than an extreme zoom percentage.
- Reader's “Back to Board” action makes continuity explicit.

# What Felt Unintuitive

- At extreme overview scale, individual title text intentionally gives way to collection shapes; the semantic label is the cue for zooming inward.
- A very distant deliberately loose paper can make Fit Everything zoom farther out than expected. Fit Selection and Back provide targeted recovery, while stale removed papers are now pruned automatically.

# Visual Cohesion Notes

- The board surface, paper stock, sticky colors, and Reader are cohesive with Horizon.
- Expanded cards are clean and do not contain nested scrollbars.
- Real first-page imagery is shown when a document is available; citation cards remain deliberate rather than pretending a document exists.
- Controls now have a reserved safe area, and content begins below them after Fit.

# Broken or Dead Interactions

- None found in the final pass.

# Missing Feedback

- None blocking. New relationships select themselves and immediately expose the label editor; narrow layouts retain a 452-pixel canvas at 900 × 700.

# Errors Encountered

- The first standalone server inherited the installed app's encrypted integration-settings location and could not read it without the installed encryption key. The test server was restarted with isolated app data; no credentials were accessed or copied.
- A first responsive pass measured hidden pre-mounted workspace layers during the launch sequence. The full matrix was repeated using only the active motion layer.

# Completion Result

Pass. Gates G1 through G8 are closed: world navigation, tactile Board manipulation, preview/fallback behavior, labeled relationships, Explore isolation, Reader continuity, deterministic scale fixtures, responsive Research, and Constellation all passed.

# Severity Summary

- No open high, medium, or release-blocking findings.
- Low: citation-only libraries remain visually more text-heavy than libraries with attached PDFs; this is an honest fallback.

# Recommended Next Actions

1. Run the complete automated suite and privacy scan.
2. Build the v0.4.0 installer and verify packaged parity.
3. Exercise fresh install, v0.3.0 upgrade, Start Menu, desktop shortcut, and installed-app Research/Constellation flows.
4. Publish only if every G9 check passes.
