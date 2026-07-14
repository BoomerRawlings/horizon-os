# Deep System Audit

## Audit Scope

Research Desk interaction, visual, connection, and maintainability audit after the installed v0.3.0 candidate failed human review. Constellation and installer routing were checked only where they affect the Research release decision.

## Test Environment

- Windows installed candidate launched from the real Start-menu shortcut.
- Version `0.3.0`, commit `fb88db1a139a04937ac2e15f9a672d4b91169164`, renderer `assets/index-DYe-cqlN.js`.
- Live vault: 85 unified papers, 17 vault notes, 82 Zotero records, and two research ideas.
- Installed window: 1706 x 1433 on the right half of a two-screen desktop.
- Prior source checks: 1050 x 850, 1706 x 1433, and 2495 x 1661.
- Source and tests inspected at the same clean commit.

## App Purpose Summary

Horizon is a local-first workspace over an Obsidian vault. Research Desk is meant to make a large paper library spatially browsable: piles can open on one continuous desk, papers can be moved and connected, ideas remain available while searching, and close zoom reveals useful reading detail.

The current Research Desk satisfies several mechanical geometry checks, but its interaction model does not satisfy that purpose. It is a responsive CSS grid with movable offsets inside a clipped viewport, presented as an unbounded spatial canvas.

## Routes and Navigation

- Home, Research, and Constellation are reachable through the shared motion-layer workspace system.
- The installed Start-menu shortcut launches the expected v0.3.0 executable.
- Constellation renders from the installed build instead of showing the former white frame.
- No duplicate app-level transition or route system was found.
- The release remains blocked by Research behavior, not routing.

## User Interaction Findings

### The desk is not actually unbounded

Severity: `high`
Area: `Interaction`
Location: `Dashboard/src/components/panels/ResearchWorkspace.tsx:1110`
Status: `confirmed`

Issue:
Paper and pile drags are clamped to a fraction of the current viewport. Camera bounds measure the grid and negative moved extents, but omit positive right and bottom object extents. At normal zoom, a paper can be placed hundreds of pixels farther right or down than the recovery camera can reach.

Why it matters:
The core promise is a large spatial desk. A viewport-relative clamp makes the canvas feel small and can strand a freely moved paper.

Suggested next action:
Replace viewport-relative offsets with absolute world rectangles and derive fit/recovery from the union of every object rectangle. Ordinary pan should not use content-derived hard limits.

### One gesture has two incompatible meanings

Severity: `high`
Area: `Interaction`
Location: `Dashboard/src/components/panels/ResearchWorkspace.tsx:1547`
Status: `confirmed`

Issue:
Dragging a paper body moves it unless the release happens over another paper, in which case the same gesture toggles a relationship and snaps the source back. Double-click also means create a sticky, open/restack a pile, or select a paper depending on the target.

Why it matters:
The result is difficult to predict and makes arranging papers feel unsafe.

Suggested next action:
Make body drag move only. Create connections from an explicit handle or connection mode. Reserve double-click for opening/restacking piles and focusing papers; keep sticky creation explicit.

### Expanded headings have unclear ownership

Severity: `high`
Area: `Interaction`
Location: `Dashboard/src/components/panels/ResearchWorkspace.tsx:2018`
Status: `confirmed`

Issue:
An expanded heading visually separates from its papers, but it still shares the collapsed pile's saved position and can change the reconstructed pile anchor.

Why it matters:
The user cannot tell whether the heading owns distant papers, is only a label, or is a movable object.

Suggested next action:
Make an expanded heading a fixed section label/control. To move the group, restack it and move the collapsed pile. Freely moved papers remain independent loose papers.

### Search changes spatial and selection state

Severity: `medium`
Area: `Interaction`
Location: `Dashboard/src/components/panels/ResearchWorkspace.tsx:623`
Status: `confirmed`

Issue:
Filtering rebuilds the visible pile grid and silently selects the first visible result when the prior selection is filtered out.

Why it matters:
Search should help attach one idea to several papers without erasing orientation, selection, camera, or the note being linked.

Suggested next action:
Treat search as a view lens. Preserve layout and selection, dim nonmatches or temporarily surface matches, and provide Next/Previous plus Center result controls.

## Visual Cohesion Findings

### The inspector permanently removes too much desk

Severity: `high`
Area: `Visual`
Location: `Dashboard/src/styles/globals.css:2937`
Status: `confirmed`

Issue:
The first paper is auto-selected, so the inspector is effectively always open. The grid and inspector duplicate a 36–45% width reservation. In the narrow tested geometry, the paper region and inspector each receive only about half of a 712px desk.

Why it matters:
The desk reads as a small panel beside a reading form rather than the primary workspace. Deep zoom is cropped by an inspector the user did not explicitly open.

Suggested next action:
Default the inspector to closed. Open it as an overlay on double-click/Enter or an explicit Details action; use a bottom drawer on narrow windows.

### Semantic zoom gets smaller at the deepest tier

Severity: `high`
Area: `Visual`
Location: `Dashboard/src/styles/globals.css:3042`
Status: `confirmed`

Issue:
At the 250% threshold, spread-paper title size drops from `0.82rem` to `0.64rem`, and detail text drops from `0.56rem` to `0.44rem`. Every tier remains a fixed 176px world card while more content is inserted.

Why it matters:
Crossing into deeper zoom causes a composition discontinuity. At 400%, the installed app showed giant cropped cards containing many wrapped lines rather than a calm reading view.

Suggested next action:
Use monotonic projected-size tiers: silhouette, browse, summary, read. At read tier keep text near 15–18 screen pixels, use a normal reading measure, and show one useful abstract or summary excerpt.

### Arbitrary word breaks create excessive wrapping

Severity: `high`
Area: `Visual`
Location: `Dashboard/src/styles/globals.css:3206`
Status: `confirmed`

Issue:
Close/detail cards apply `overflow-wrap: anywhere` and keep the same narrow card width. The installed 42-paper view visibly broke titles and prose into dense columns.

Why it matters:
The paper face becomes harder to scan as more information appears.

Suggested next action:
Remove arbitrary wrapping. Clamp titles by tier, keep DOI/citation in the inspector, and use normal word wrapping only for a summary/abstract reading block.

### Research height has two owners

Severity: `medium`
Area: `Visual`
Location: `Dashboard/src/styles/globals.css:2492`
Status: `confirmed`

Issue:
The shared motion stage owns workspace height, while Research also uses `max(480px, calc(100dvh - 220px))` and a wrapping bottom toolbar.

Why it matters:
This duplicates geometry responsibilities and makes dead space or squeezed canvas height more likely across 4K, ultrawide-half, and narrow-half layouts.

Suggested next action:
Let the motion-stage flex layout own the remaining height and keep the bottom controls to one compact row.

## System Connection Findings

### Relationship rendering depends on repeated DOM measurement

Severity: `medium`
Area: `System`
Location: `Dashboard/src/components/panels/ResearchWorkspace.tsx:636`
Status: `confirmed`

Issue:
Connection endpoints are recalculated from rendered DOM rectangles, while object placement is split among CSS grid, transforms, and saved offsets.

Why it matters:
Lines and objects do not share one source of geometry, increasing drift and resize complexity.

Suggested next action:
Store object rectangles in world coordinates and render connection paths in the same transformed world layer.

### Data and integrations are not the redesign problem

Severity: `low`
Area: `System`
Location: `Dashboard/server.cjs`
Status: `confirmed`

Issue:
No issue was found requiring a research API, Zotero, Obsidian, installer, or vault-schema rewrite.

Why it matters:
The redesign can remain contained to the Research client and avoid destabilizing local-first storage or integrations.

Suggested next action:
Preserve current APIs, metadata mutations, sticky-note storage, and saved relationships.

## Efficiency and Maintainability Findings

### ResearchWorkspace has too many responsibilities

Severity: `high`
Area: `Maintainability`
Location: `Dashboard/src/components/panels/ResearchWorkspace.tsx:453`
Status: `confirmed`

Issue:
The component is 2,765 lines with 37 state hooks, data fetching, mutations, persistence, collision correction, camera handling, gesture handling, connection measurement, dialogs, inspector rendering, and desk rendering.

Why it matters:
Local fixes repeatedly create new interactions between unrelated behavior and make meaningful user testing expensive.

Suggested next action:
Keep ResearchWorkspace as the data/composition boundary and extract a pure layout module, camera/interaction controller, canvas renderer, semantic paper, and closeable inspector.

### Tests preserve source patterns more than user behavior

Severity: `high`
Area: `Maintainability`
Location: `Dashboard/tests/researchDeskLayout.test.mjs:61`
Status: `confirmed`

Issue:
Most current checks are regular-expression assertions over source and CSS. The pure helper does not calculate paper rectangles, collision resolution, density tiers, or interaction transitions.

Why it matters:
The previous report marked the flow as passing while installed human review still found the core workflow confusing.

Suggested next action:
Move geometry and tiers into pure functions with numeric tests, then add browser interaction assertions for pan, zoom, expand, move, connect, search persistence, and inspector states.

## Dead or Fake UI

- No major button is entirely dead.
- The phrase and visual treatment of an expansive desk are misleading while movement remains viewport-clamped.
- `Spread all`, `Restack open`, `Show all`, `Fit desk`, and `Stack desk` expose overlapping state concepts without one visible state model.
- The desk hint describes overloaded gestures rather than reducing them.

## Unreachable or Disconnected Areas

- A paper moved far enough right or down can be outside normal-zoom recovery because positive extents are not in the camera bounds.
- A filtered-out selected paper becomes disconnected from its previous context through automatic reselection.
- Deep-zoom content can be physically present but practically unreadable because of cropping, arbitrary wrapping, and the permanent inspector.

## Files Future Codex Should Inspect First

1. `Dashboard/src/components/panels/ResearchWorkspace.tsx`
2. `Dashboard/src/components/panels/researchDeskLayout.ts`
3. `Dashboard/src/styles/globals.css`
4. `Dashboard/tests/researchDeskLayout.test.mjs`
5. `Dashboard/src/App.tsx`

## Files Future Codex Should Usually Ignore

- `Dashboard/dist/`
- `Dashboard/native-dist/`
- `Dashboard/node_modules/`
- Installer/updater code until the redesigned source passes user-facing tests.
- Research server and integration routes unless a new client contract exposes a concrete data defect.

## Highest-Risk Issues

1. The current layout is not a real world canvas and can strand positive-offset papers.
2. Gestures are overloaded, especially paper move versus relationship creation.
3. The always-open inspector makes the primary workspace materially smaller.
4. Deep zoom changes density non-monotonically and relies on arbitrary word wrapping.
5. Geometry and interaction ownership are split across CSS, DOM measurement, mixed-unit persistence, and component state.

## Quick Wins

- Keep release publication paused.
- Stop auto-selecting the first paper and default the inspector to closed.
- Remove `overflow-wrap: anywhere` from paper faces.
- Separate body dragging from relationship creation.
- Replace duplicated inspector width values with one owner.

These are necessary but not sufficient on their own; they should land as part of the coherent canvas replacement rather than as another release patch set.

## Recommended Next Actions

1. Define one interaction contract: blank drag pans; body drag moves; connection handle connects; pile double-click expands/restacks; paper double-click opens details.
2. Give piles, papers, headings, and stickies absolute rectangles in one world-pixel coordinate system.
3. Build deterministic ordered packing that treats manually placed items as obstacles and never overlaps papers at rest.
4. Make the camera effectively unbounded, with Fit all, 100%, and Zoom to selection for recovery.
5. Use projected on-screen width for monotonic semantic tiers and normal reading typography.
6. Make the inspector a closed-by-default overlay/bottom drawer.
7. Preserve APIs, integration state, sticky-note files, and saved relationships.
8. Replace source-pattern tests with pure geometry tests and real browser interaction checks.
9. Rebuild and reinstall only after source interaction testing passes at 1050 x 850, 1706 x 1433, and 2495 x 1661.

## Human Review Needed

Before v0.3.0 publication, verify the redesigned installed app without guidance:

- Open several piles in quick succession and confirm the ordered grid remains understandable.
- Move a paper several screen widths away and recover it with pan and Fit all.
- Connect two papers without moving either paper.
- Search for several papers while one sticky remains available for linking.
- Zoom one paper into its summary/abstract and judge typography, wrapping, and orientation.
- Open and close the inspector and confirm the canvas does not reflow.
- Repeat on the 4K laptop half-screen, ultrawide half-screen, and a narrow half-window.

Release only if those flows feel self-explanatory in the installed Start-menu build.
