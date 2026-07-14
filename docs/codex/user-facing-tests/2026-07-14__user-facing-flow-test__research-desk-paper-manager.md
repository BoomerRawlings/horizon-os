# User-Facing Flow Test

## Objective

Verify that a user can find one paper without disrupting the desk, spread its pile in place, reach readable paper detail, rearrange the desk without losing context, recover the full canvas, and move to Constellation without white pages or stray document scrolling.

## Test Environment

- Horizon 0.3.0 production renderer served by Horizon's local-only server on Windows.
- Current 85-paper library, 12 subject piles, and two existing research sticky notes.
- 1280 x 720 viewport, representing a constrained laptop or half-screen window.
- No application edits or test-data edits during the final flow.

## Starting Assumptions

- Search and filters should reveal papers without deleting, hiding, or relocating sticky-note work.
- A pile should spread on the same continuous desk and preserve collision-free ordering.
- Zoom should progressively reveal useful citation, summary, or abstract content without nested paper scrollbars.
- Sorting should visibly animate and keep the matching area reachable.
- Research and Constellation should contain their own spatial navigation without moving the outer Horizon page.

## Steps Taken

1. Opened Research and searched for `group psychotherapy`.
2. Focused the single result and confirmed both sticky notes remained on the desk.
3. Expanded the matching pile and selected *The theory and practice of group psychotherapy*.
4. Zoomed from browse view through summary view to the full read tier at 276%.
5. Changed arrangement from Subject to Author and observed the arrangement transition.
6. Confirmed the matching Authors U-Z pile remained visible, then used **Fit** to recover the whole desk.
7. Opened Constellation and inspected its rendered canvas and page geometry.
8. Repeated keyboard pile expansion to confirm accessible parity; inspected the native React double-click binding because the browser automation wrapper does not emit a real `dblclick` event.

## What Worked

- Search returned `1 / 1 match` without rearranging the desk or removing either sticky note.
- The pile expanded into ordered papers in the same workspace; Enter provides equivalent accessible expansion.
- Semantic zoom advanced from browse to summary to read. At read tier, the selected paper displayed its complete saved citation under a clear **Summary** label.
- The selected paper used `overflow: hidden` with a zero scroll position; the Research canvas and outer document also stayed at scroll position 0.
- Changing arrangement applied the shared `is-arranging` transition and settled cleanly. The matching Authors U-Z pile remained inside the visible canvas at 276%.
- **Fit** recovered all seven author piles at 13% with seven visible pile cards and no page movement.
- Constellation rendered its full dark spatial map rather than a white page. The document height exactly matched the 720-pixel viewport and remained at scroll position 0.
- The Constellation canvas used the available lower half of the window while retaining its own pan and zoom controls.

## What Felt Intuitive

- Search-match navigation, **Spread all**, **Fit**, zoom controls, and the persistent status message make recovery obvious.
- The paper's content becomes progressively more useful as it grows instead of exposing miniature form rows.
- Sorting keeps the user on the same spatial surface and communicates movement rather than replacing the desk abruptly.
- Research and Constellation now feel like peer workspaces with consistent height, motion, and scroll containment.

## What Felt Unintuitive

- At very deep zoom, only part of a large paper fits in a short viewport; this is expected on a spatial canvas and **Fit** provides immediate recovery.
- A sorted pile may replace an individually selected paper with the pile's front card. The active search result remains visible and the **Focus search match** button restores exact focus.

## Visual Cohesion Notes

- The spatial workspaces stay within Horizon's shared `motion-stage` / `motion-layer` transition system.
- Paper, pile, sticky, toolbar, inspector, and connection styling remain visually consistent through every semantic zoom tier.
- The compact viewport has no unused lower-page dead space and no browser scrollbar flash.

## Broken or Dead Interactions

- None remained in the tested source build.

## Missing Feedback

- No blocking feedback was missing.
- A future minimap may become useful for much larger libraries, but **Fit** and search-focus navigation are sufficient for the current 85-paper desk.

## Errors Encountered

- The browser-control wrapper's `dblclick()` did not synthesize a real browser double-click event. The React `onDoubleClick` handlers are present on both the pile heading and pile card, and Enter expansion was verified in the live UI. This was treated as a test-driver limitation rather than a product failure.
- Earlier sorting could leave the camera over empty space. The current sort transition refits the desk or recenters the selected area before settling.
- Earlier paper cards exposed illegible overflow at close zoom. The current semantic tiers clamp content and never create nested scrollable paper surfaces.

## Completion Result

PASS for the production source build. Paper search, sticky-note continuity, pile expansion, semantic zoom, animated sorting, Fit recovery, responsive workspace height, and Constellation rendering all passed. Installed-app parity remains the final release gate before publication.

## Severity Summary

- Blocker: 0 unresolved in source; installed-app parity pending
- High: 0 unresolved
- Medium: 0 unresolved
- Low: 0 unresolved in the tested flow

## Recommended Next Actions

1. Build the installer from the clean release commit.
2. Install it and repeat the Research and Constellation launch checks from the installed shortcut.
3. Publish only the installer that passes packaged-source, privacy, shortcut, and installed-app parity checks.
