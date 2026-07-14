# Infinite Research v0.4 Interaction Contract

## Purpose

Infinite Research is one continuous research, connection, and brainstorming space. It must feel direct and tactile with roughly 100 papers, while remaining navigable and responsive with 1,000 or 10,000 papers.

Published Horizon v0.3.0 remains the stable baseline. This redesign ships only after every gate below passes.

## Three surfaces, one library

### Board

The Board is the user's persistent spatial world.

- Papers, stacks, sticky notes, and relationships can be positioned freely.
- Board positions never change because of a search, filter, or Explore arrangement.
- Pulling a paper from a stack makes it a loose Board object without deleting its library membership.
- Sticky notes remain visible, movable, and connectable in every Board state.
- Restacking is explicit and reversible.

### Explore

Explore is a temporary projection of the library.

- Search, filters, and ordered sort fields determine the projection.
- Arrangement changes animate only rendered objects.
- Explore never writes Board positions.
- A paper can be placed on the Board intentionally from Explore.
- Clearing Explore returns to the same Board state.

### Reader

Reader is focused document inspection.

- Double-clicking a paper opens Reader.
- Closing Reader restores the same Board/Explore mode, selection, camera, and object positions.
- A real PDF opens when available; otherwise Reader shows the complete saved citation, abstract or summary, and source actions honestly.

## Gesture grammar

| Gesture | Empty canvas | Stack | Paper | Sticky | Relationship |
| --- | --- | --- | --- | --- | --- |
| Click | Clear/select canvas | Select | Select | Select | Select |
| Drag | Pan | Move stack | Pull loose and move | Move | Move label only |
| Double-click | Fit nearby content | Spread/restack | Open Reader | Edit | Edit label |
| Right-click | Canvas menu | Stack menu | Paper menu | Sticky menu | Relationship menu |
| Hover | No state change | Stable vertical peek | Lift and preview | Lift and highlight links | Highlight endpoints |
| Wheel/pinch | Zoom at pointer | Zoom at pointer | Zoom at pointer | Zoom at pointer | Zoom at pointer |

Dragging an object body always means move. Relationships begin only from a visible connection handle or a context-menu command.

## Camera and semantic zoom

- Zoom is logarithmic and anchored to the pointer.
- The UI does not expose an arbitrary percentage limit.
- Safe internal bounds and coordinate rebasing are implementation details.
- Recovery controls are always available: **Fit board**, **Fit selection**, and **Back to last focus**.

Outward semantic progression:

`document -> paper -> stack -> subject/collection -> library overview`

Inward semantic progression:

`library overview -> stack -> first-page preview -> readable page -> Reader`

## Paper visual contract

- A visible paper uses a cached first-page preview when a PDF is available.
- Preview rendering is lazy and cancellable.
- Missing or inaccessible PDFs use a deliberate citation-card fallback.
- Cards never expose nested scrollbars.
- At close zoom, readable detail replaces overview decoration instead of shrinking more fields into the card.

## Stack contract

- A collapsed stack has one stable position and visible count.
- Hover reveals a bounded fan of nearby papers; it does not mutate layout.
- The hovered page remains targetable while the pointer crosses the fan.
- Expanding a stack creates collision-free paper placement on the Board.
- Dragging a peeked or expanded paper makes it loose.
- Restacking gathers only papers that have not been deliberately kept loose.

## Relationship contract

- Papers, stacks, and sticky notes may be relationship endpoints.
- Each relationship has a stable id, two stable endpoint references, and an optional text label.
- A label follows the line and remains independently selectable.
- Selecting a relationship exposes edit, reverse, and remove actions.
- Search and filters may dim an endpoint but never delete or silently rewrite its relationship.
- At overview scale, distant relationships aggregate or hide; selected relationships remain visible.

## State boundaries

Persistent Board state contains only:

- object positions and z-order;
- loose-paper membership;
- expanded stack state;
- camera history;
- relationships and labels.

Explore state contains only:

- query;
- active filters;
- ordered sort fields;
- temporary projection layout.

Reader state contains only:

- active paper;
- page and reading position.

No Explore action may mutate persistent Board geometry.

## Scale architecture

### 100 papers

- Individual cards and first-page previews may render directly.
- Tactile movement and sorting target 60 frames per second.

### 1,000 papers

- Offscreen cards are virtualized.
- Preview rendering is limited to the viewport plus a small prefetch margin.
- Sorting animates visible objects and summarizes the remainder.

### 10,000 papers

- Overview begins with clusters, counts, and density regions.
- Individual papers materialize only after zooming, filtering, or selecting a cluster.
- Distant relationship lines aggregate.
- Layout and search must not block pointer movement.

At every scale, the rendered paper-node count is bounded by the visible viewport rather than total library size.

## Release gates

1. **G0 Interaction contract** — this document is internally consistent and represented in tests.
2. **G1 Camera/world** — infinite-feeling pointer zoom, pan, persistence, recovery, and coordinate precision pass with placeholder objects.
3. **G2 Board manipulation** — click, drag, double-click, right-click, selection, sticky placement, and undo pass a hands-on flow.
4. **G3 Paper visual layer** — preview/fallback, semantic detail, hover peek, and loose-paper movement pass at 100 papers.
5. **G4 Relationships** — create, label, edit, move, and remove pass for every endpoint type.
6. **G5 Explore** — sort/filter animations pass while a byte-for-byte Board geometry snapshot remains unchanged.
7. **G6 Reader continuity** — opening and closing Reader preserves mode, selection, camera, and geometry.
8. **G7 Scale** — deterministic 100, 1,000, and 10,000-paper fixtures pass virtualization and interaction budgets.
9. **G8 Responsive polish** — laptop, 4K, ultrawide-half, and narrow-window flows pass without document scrolling or dead space.
10. **G9 Release** — clean build, privacy, packaged parity, fresh install/upgrade, shortcuts, and installed-app flows pass.

## Non-goals for the redesign

- Rewriting Zotero, Obsidian, capture, integration, or credential storage systems without a demonstrated document-asset requirement.
- Persisting generated Explore coordinates.
- Rendering every PDF page or every paper at once.
- Publishing over the existing v0.3.0 tag or installer.
