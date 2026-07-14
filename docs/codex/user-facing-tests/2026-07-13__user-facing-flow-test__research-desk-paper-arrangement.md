# User-Facing Flow Test

## Objective

Verify that Research Desk makes individual papers easy to find and manipulate: double-clicking piles must spread them in place, expanding every pile must produce an ordered non-overlapping grid, pile headings and papers must move independently, manual paper positions must persist, deep zoom must expose readable summary or abstract text, and neither Research nor Constellation may create stray page scrolling or dead space.

## Test Environment

- Horizon 0.3.0 production UI build served through Horizon's local-only server on Windows.
- The attached 17-paper vault, loaded with isolated Horizon app-data so the test did not alter the installed profile.
- Nine subject piles and two existing research ideas.
- Viewports: 1280 x 720, 1706 x 1433, 1050 x 850, and 2495 x 1661.
- Constellation fixture: six live projects plus their connected registry notes; the automated density check generated 160 project positions.

## Starting Assumptions

- A user may want several piles open on one continuous desk.
- Automatically laid-out papers must never overlap; explicitly moved papers retain the user's saved placement.
- Expanding, collapsing, filtering, or spreading other piles must not rewrite a manually placed paper.
- Wheel input over either spatial canvas must zoom that canvas without moving the outer Horizon page.
- Close zoom should reveal useful paper content without putting a scrollbar inside each card.

## Steps Taken

1. Opened Research and used **Spread all** to expand all nine subject piles and 17 papers.
2. Measured every rendered paper rectangle at laptop-half, narrow-half, and ultrawide-half sizes and checked all pairs for intersection.
3. Used **Fit desk**, panned to the last pile, and confirmed that the full ordered grid remained reachable at the 12% overview minimum.
4. Dragged one expanded pile heading 40 pixels and compared its paper's screen coordinates before and after.
5. Dragged one paper independently, collapsed and reopened an unrelated pile with real pointer double-clicks, then reloaded Horizon and spread the piles again.
6. Compared the moved paper's saved inline position before collapse, after reopen, and after reload.
7. Dragged one paper onto another to connect them, confirmed the visible paper-link curve, then repeated the drop to disconnect them.
8. Zoomed a paper to exactly 250% and 400% and inspected its summary label, effective text size, card/detail overflow behavior, and outer scroll positions.
9. Exercised wheel zoom and pile focus at every responsive test size while measuring the body, document, Horizon shell, and Research canvas scroll positions.
10. Opened Constellation at the same three half-window sizes, confirmed the same-origin frame rendered non-white content, and measured the iframe and inner document geometry while zooming.
11. Ran the dense Constellation position regression for 160 projects while preserving the original first 21 project positions.

## What Worked

- All nine piles expanded on one desk. The 17 automatically placed papers had zero pairwise overlaps at 1706 x 1433, 1050 x 850, and 2495 x 1661.
- Expanded groups retained pile order and pushed every later group downward, so opening all piles produced one large deterministic grid.
- The 12% overview made the full tall grid reachable; normal zoom scales continuously to 400%.
- The expanded heading moved 39.996 pixels while its paper moved 0 pixels.
- A manually moved paper kept the exact same saved `left`, `top`, and `z-index` through an unrelated pile collapse/reopen and a full page reload.
- Paper-to-paper drag created one visible connection curve and an explicit connected message. Repeating the same gesture removed the curve and produced an explicit disconnected message. The dragged source paper returned to its original visible position rather than covering the target.
- At 250%, the labeled summary rendered at an effective 17.61 pixels. At 400%, it rendered at 28.16 pixels. Cards and detail text used hidden/clamped overflow, not nested `auto` or `scroll` surfaces.
- At all responsive sizes, body width/height equaled its scroll width/height and outer body, Horizon shell, and Research canvas scroll positions stayed at 0 during wheel zoom.
- Research used the available lower screen area: the workspace reached within 4-31 pixels of the tested viewport bottoms without creating a document scrollbar.
- Constellation rendered dark, populated content instead of a white frame. Its iframe reached within 5 pixels of the 1706 x 1433 bottom, 31 pixels at 1050 x 850, and 9 pixels at 2495 x 1661.
- Constellation wheel zoom changed the inner camera while the outer body, Horizon shell, and iframe document remained at scroll position 0.
- The scalable Constellation placement retained the original first 21 coordinates and produced 160 unique project centers with at least 500 pixels of separation.

## What Felt Intuitive

- The desk hint states the essential gestures: double-click to spread, drag papers independently, drop paper on paper to connect or disconnect, and wheel to reveal detail.
- **Spread all**, **Restack open**, **Fit desk**, and **Stack desk** make the grid state and the intentional reset action explicit.
- The heading itself explains that it moves independently while a pile is open.
- Deep zoom reveals a labeled **Summary** or **Abstract** in the paper rather than turning the card into a miniature scrolling form.
- Constellation's canvas fills the available workspace and keeps its zoom controls inside the same visual surface.

## What Felt Unintuitive

- At extreme zoom a large paper can extend beyond the short canvas; this is expected spatial behavior, and blank-desk pan plus the fixed reading inspector provide recovery.
- A connection line is naturally offscreen if one endpoint has been panned away, but the connect/disconnect status message remains explicit.

## Visual Cohesion Notes

- Research and Constellation stay inside the shared `motion-stage` / `motion-layer` workspace choreography.
- Expanded piles remain visually grouped even though the heading can be moved independently.
- Summary labels, paper typography, reading inspector, toolbar, sticky notes, and connection curves retain Horizon's restrained dark-desk treatment.
- Tall and ultrawide-half windows use their available vertical area instead of preserving the former empty lower half.

## Broken or Dead Interactions

- None remained in the tested source build.

## Missing Feedback

- No blocking feedback was missing.
- A future optional minimap could make navigation faster once a library grows far beyond the tested 17 papers, but the current Fit/Pan controls are complete.

## Errors Encountered

- Expanded groups previously used fixed-height positioning and could collide. They now occupy full grid rows and grow naturally with their paper count.
- An expanded pile heading previously carried all of its papers when dragged. The heading offset is now separate from paper positions.
- A resize correction from an offscreen heading could leak into detached papers. Paper correction is now computed independently.
- Opening an unrelated pile could rewrite a reachable paper's saved position. Ordinary expand/collapse/filter/spread changes no longer invoke the resize clamp; only a real viewport resize may adapt geometry.
- `overflow: hidden` allowed Chromium to programmatically set a 23-pixel Research canvas scroll offset when focusing a transformed element. The canvas now uses `overflow: clip`, and canvas/body/shell scroll remained 0 in the reproduced flow.
- The original fixed Constellation ring capacities repeated coordinates after project 21. Deterministic outer rings now expand in capacity and radius without repeated centers.
- The installed pre-release build still carried frame-denial headers and showed a white Constellation. Source routes now use `SAMEORIGIN` and `frame-ancestors 'self'`; the final installer must package this exact build.

## Completion Result

PASS for the production source build. The requested pile expansion, zero-overlap automatic grid, independent heading/paper placement, persistence, paper linking, readable deep zoom, responsive height use, and scroll containment all completed successfully. Final installed-app parity remains a separate release gate before publishing 0.3.0.

## Severity Summary

- Blocker: 0 unresolved in source; final installer parity still pending
- High: 0 unresolved
- Medium: 0 unresolved
- Low: 0 unresolved in the tested flow

## Recommended Next Actions

1. Build the guarded installer from the final clean commit and repeat the Constellation and Research checks against the installed application.
2. Keep the dense 160-project and Research layout checks in the installer gate.
3. Consider an optional overview minimap only when real library size proves it necessary.
