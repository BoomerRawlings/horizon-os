import assert from "node:assert/strict";
import {
  RESEARCH_DESK_FIT_PADDING,
  RESEARCH_DESK_PADDING,
  RESEARCH_GROUP_GAP,
  RESEARCH_GROUP_HEADING_GAP,
  RESEARCH_GROUP_HEADING_HEIGHT,
  RESEARCH_PAPER_COLUMN_GAP,
  RESEARCH_PAPER_HEIGHT,
  RESEARCH_PAPER_ROW_GAP,
  RESEARCH_PAPER_WIDTH,
  RESEARCH_SEMANTIC_WIDTHS,
  fitResearchDeskCamera,
  isFreeResearchPaperPosition,
  nearestOpenResearchPaperRect,
  planExpandedResearchStacks,
  planResearchDeskWorldLayout,
  researchDeskColumnCount,
  researchDeskRectsIntersect,
  researchDeskSemanticTier,
  researchDeskSemanticTierForScale,
  screenBoundsToResearchWorld,
  unionResearchDeskRects,
} from "../src/components/panels/researchDeskLayout.ts";

assert.equal(RESEARCH_PAPER_WIDTH, 268);
assert.equal(RESEARCH_PAPER_HEIGHT, 340);
assert.ok(RESEARCH_PAPER_COLUMN_GAP > 0);
assert.ok(RESEARCH_PAPER_ROW_GAP > 0);
assert.ok(RESEARCH_DESK_PADDING > 0);
assert.ok(RESEARCH_GROUP_HEADING_HEIGHT > 0);
assert.ok(RESEARCH_GROUP_HEADING_GAP > 0);

const worldBounds = screenBoundsToResearchWorld(
  { bottom: 440, left: 20, right: 620, top: 40 },
  { scale: 2, x: -100, y: 50 },
);
assert.deepEqual(worldBounds, { bottom: 195, left: 60, right: 360, top: -5 });

assert.equal(isFreeResearchPaperPosition(undefined), false);
assert.equal(isFreeResearchPaperPosition({ x: 0, y: 0 }), false);
assert.equal(isFreeResearchPaperPosition({ x: -1, y: 0 }), true);

const stackGroups = [
  { key: "stack:subject:First", paperIds: ["alpha", "beta"] },
  { key: "stack:subject:Second", paperIds: ["gamma"] },
];
const stackPlan = planExpandedResearchStacks(stackGroups, ["stack:subject:Second"]);
assert.deepEqual(stackPlan.map(({ expanded, groupOrder, key }) => ({ expanded, groupOrder, key })), [
  { expanded: false, groupOrder: 0, key: "stack:subject:First" },
  { expanded: true, groupOrder: 1, key: "stack:subject:Second" },
]);
assert.notEqual(stackPlan[0].paperIds, stackGroups[0].paperIds);

function assertNoIntersections(rects, label) {
  for (let first = 0; first < rects.length; first += 1) {
    for (let second = first + 1; second < rects.length; second += 1) {
      assert.equal(
        researchDeskRectsIntersect(rects[first], rects[second]),
        false,
        `${label}: rectangles ${first} and ${second} intersect`,
      );
    }
  }
}

function assertStableGroupOrder(layout, label) {
  for (let index = 0; index < layout.groups.length; index += 1) {
    assert.equal(layout.groups[index].groupOrder, index, `${label}: stable group order ${index}`);
  }
}

function assertOrderedGroups(layout, label) {
  assertStableGroupOrder(layout, label);
  for (let index = 1; index < layout.groups.length; index += 1) {
    const previous = layout.groups[index - 1];
    const current = layout.groups[index];
    assert.ok(current.groupRect.y >= previous.groupRect.y + previous.groupRect.height + RESEARCH_GROUP_GAP, `${label}: group order ${index}`);
  }
}

function visibleLayoutRects(layout) {
  return [
    ...layout.groups.map((group) => group.headingRect),
    ...layout.groups.map((group) => group.stackRect).filter(Boolean),
    ...Object.values(layout.automaticPaperRects),
  ];
}

function makeGroups(totalPapers, preferredGroupSize = 11) {
  const groups = [];
  let paperIndex = 0;
  while (paperIndex < totalPapers) {
    const groupIndex = groups.length;
    const count = Math.min(preferredGroupSize, totalPapers - paperIndex);
    groups.push({
      key: `group-${groupIndex}`,
      paperIds: Array.from({ length: count }, (_, index) => `paper-${paperIndex + index}`),
    });
    paperIndex += count;
  }
  return groups;
}

const seventeenGroups = [
  { key: "g0", paperIds: ["p0", "p1", "p2"] },
  { key: "g1", paperIds: ["p3", "p4"] },
  { key: "g2", paperIds: ["p5", "p6", "p7", "p8"] },
  { key: "g3", paperIds: ["p9"] },
  { key: "g4", paperIds: ["p10", "p11", "p12"] },
  { key: "g5", paperIds: ["p13", "p14"] },
  { key: "g6", paperIds: ["p15", "p16"] },
];

const twelveCollapsedGroups = Array.from({ length: 12 }, (_, index) => ({
  key: `collapsed-${index}`,
  paperIds: [`collapsed-paper-${index}`],
}));
const collapsedGroupHeight = RESEARCH_GROUP_HEADING_HEIGHT
  + RESEARCH_GROUP_HEADING_GAP
  + RESEARCH_PAPER_HEIGHT;
for (const viewportWidth of [880, 1050, 1706]) {
  const layout = planResearchDeskWorldLayout({
    expandedKeys: [],
    groups: twelveCollapsedGroups,
    viewportWidth,
  });
  const columnCount = researchDeskColumnCount(viewportWidth);
  const rowCount = Math.ceil(twelveCollapsedGroups.length / columnCount);
  const layoutWidth = columnCount * RESEARCH_PAPER_WIDTH
    + (columnCount - 1) * RESEARCH_PAPER_COLUMN_GAP;
  const contentX = Math.max(RESEARCH_DESK_PADDING, (viewportWidth - layoutWidth) / 2);
  const expectedHeight = rowCount * collapsedGroupHeight + (rowCount - 1) * RESEARCH_GROUP_GAP;
  assert.equal(layout.bounds.height, expectedHeight, `${viewportWidth}px: compact collapsed height`);
  assert.ok(layout.bounds.height < 5000, `${viewportWidth}px: collapsed layout is not a tall strip`);
  assertStableGroupOrder(layout, `${viewportWidth}px compact collapsed grid`);
  for (let index = 0; index < layout.groups.length; index += 1) {
    const group = layout.groups[index];
    const column = index % columnCount;
    const row = Math.floor(index / columnCount);
    assert.equal(group.headingRect.width, RESEARCH_PAPER_WIDTH, `${viewportWidth}px: heading width ${index}`);
    assert.equal(group.headingRect.x, contentX + column * (RESEARCH_PAPER_WIDTH + RESEARCH_PAPER_COLUMN_GAP), `${viewportWidth}px: column ${index}`);
    assert.equal(group.headingRect.y, RESEARCH_DESK_PADDING + row * (collapsedGroupHeight + RESEARCH_GROUP_GAP), `${viewportWidth}px: row ${index}`);
    assert.equal(group.stackRect.x, group.headingRect.x, `${viewportWidth}px: aligned pile ${index}`);
    assert.equal(group.stackRect.y, group.headingRect.y + RESEARCH_GROUP_HEADING_HEIGHT + RESEARCH_GROUP_HEADING_GAP, `${viewportWidth}px: pile below heading ${index}`);
  }
  assertNoIntersections(visibleLayoutRects(layout), `${viewportWidth}px compact collapsed grid`);
}

const mixedFlowGroups = [
  { key: "before-a", paperIds: ["before-paper-a"] },
  { key: "before-b", paperIds: ["before-paper-b"] },
  { key: "expanded-middle", paperIds: ["middle-a", "middle-b", "middle-c", "middle-d"] },
  { key: "after-a", paperIds: ["after-paper-a"] },
  { key: "after-b", paperIds: ["after-paper-b"] },
  { key: "after-c", paperIds: ["after-paper-c"] },
];
const mixedFlowLayout = planResearchDeskWorldLayout({
  expandedKeys: ["expanded-middle"],
  groups: mixedFlowGroups,
  viewportWidth: 1050,
});
const mixedExpandedGroup = mixedFlowLayout.groups[2];
const firstCollapsedBottom = Math.max(
  ...mixedFlowLayout.groups.slice(0, 2).map((group) => group.groupRect.y + group.groupRect.height),
);
assert.equal(mixedFlowLayout.groups[0].headingRect.y, mixedFlowLayout.groups[1].headingRect.y);
assert.ok(mixedExpandedGroup.groupRect.y >= firstCollapsedBottom + RESEARCH_GROUP_GAP);
assert.equal(mixedExpandedGroup.headingRect.width, mixedFlowLayout.columnCount * RESEARCH_PAPER_WIDTH
  + (mixedFlowLayout.columnCount - 1) * RESEARCH_PAPER_COLUMN_GAP);
assert.equal(Object.keys(mixedExpandedGroup.automaticPaperRects).length, 4);
for (const group of mixedFlowLayout.groups.slice(3)) {
  assert.ok(group.groupRect.y >= mixedExpandedGroup.groupRect.y + mixedExpandedGroup.groupRect.height + RESEARCH_GROUP_GAP);
  assert.equal(group.headingRect.y, mixedFlowLayout.groups[3].headingRect.y);
}
assertStableGroupOrder(mixedFlowLayout, "collapsed expanded collapsed flow");
assertNoIntersections(visibleLayoutRects(mixedFlowLayout), "collapsed expanded collapsed flow");

const expandAllLayout = planResearchDeskWorldLayout({
  expandedKeys: twelveCollapsedGroups.map((group) => group.key),
  groups: twelveCollapsedGroups,
  viewportWidth: 1050,
});
assert.ok(expandAllLayout.groups.every((group) => group.expanded && group.stackRect === null));
assert.equal(Object.keys(expandAllLayout.automaticPaperRects).length, 12);
assertOrderedGroups(expandAllLayout, "expand-all grid");
assertNoIntersections(visibleLayoutRects(expandAllLayout), "expand-all grid");

const allSeventeenExpanded = planResearchDeskWorldLayout({
  expandedKeys: seventeenGroups.map((group) => group.key),
  groups: seventeenGroups,
  viewportWidth: 1706,
});
assert.equal(Object.keys(allSeventeenExpanded.automaticPaperRects).length, 17);
assertNoIntersections(Object.values(allSeventeenExpanded.automaticPaperRects), "17-paper expansion");
assertOrderedGroups(allSeventeenExpanded, "17-paper expansion");
assert.ok(allSeventeenExpanded.groups.every((group) => group.expanded && group.stackRect === null));

const mixedLayout = planResearchDeskWorldLayout({
  expandedKeys: [stackGroups[1].key],
  groups: stackGroups,
  viewportWidth: 1050,
});
assert.ok(mixedLayout.groups[0].stackRect);
assert.equal(mixedLayout.groups[0].rowCount, 1);
assert.equal(mixedLayout.groups[1].stackRect, null);
assert.equal(Object.keys(mixedLayout.groups[1].automaticPaperRects).length, 1);
assertOrderedGroups(mixedLayout, "mixed collapsed and expanded groups");

const manualViewportWidth = 1050;
const manualColumnCount = researchDeskColumnCount(manualViewportWidth);
const manualLayoutWidth = manualColumnCount * RESEARCH_PAPER_WIDTH
  + (manualColumnCount - 1) * RESEARCH_PAPER_COLUMN_GAP;
const preferredFirstSlot = {
  height: RESEARCH_PAPER_HEIGHT,
  width: RESEARCH_PAPER_WIDTH,
  x: (manualViewportWidth - manualLayoutWidth) / 2,
  y: RESEARCH_DESK_PADDING + RESEARCH_GROUP_HEADING_HEIGHT + RESEARCH_GROUP_HEADING_GAP,
};
const manualRect = { ...preferredFirstSlot };
const obstacleRect = {
  ...preferredFirstSlot,
  x: preferredFirstSlot.x + RESEARCH_PAPER_WIDTH + RESEARCH_PAPER_COLUMN_GAP,
};
const manualLayout = planResearchDeskWorldLayout({
  expandedKeys: ["manual-group"],
  groups: [{ key: "manual-group", paperIds: ["manual-paper", "automatic-a", "automatic-b"] }],
  manualPaperRects: { "manual-paper": manualRect },
  obstacles: [obstacleRect],
  viewportWidth: manualViewportWidth,
});
assert.deepEqual(manualLayout.manualPaperRects["manual-paper"], manualRect);
assert.equal(manualLayout.automaticPaperRects["manual-paper"], undefined);
assert.equal(Object.keys(manualLayout.automaticPaperRects).length, 2);
for (const rect of Object.values(manualLayout.automaticPaperRects)) {
  assert.equal(researchDeskRectsIntersect(rect, manualRect), false);
  assert.equal(researchDeskRectsIntersect(rect, obstacleRect), false);
}
assert.ok(Object.values(manualLayout.automaticPaperRects).some((rect) => rect.y > manualRect.y));

const savedManualPile = {
  height: RESEARCH_PAPER_HEIGHT,
  width: RESEARCH_PAPER_WIDTH,
  x: -1200,
  y: 900,
};
const movablePileGroups = [
  { key: "manual-pile", paperIds: ["pile-a", "pile-b"] },
  { key: "automatic-section", paperIds: ["auto-a", "auto-b", "auto-c"] },
];
const movablePileLayout = planResearchDeskWorldLayout({
  expandedKeys: ["automatic-section"],
  groups: movablePileGroups,
  manualStackRects: { "manual-pile": savedManualPile },
  viewportWidth: 1050,
});
const manualPileGroup = movablePileLayout.groups[0];
const automaticSection = movablePileLayout.groups[1];
assert.deepEqual(movablePileLayout.manualStackRects["manual-pile"], savedManualPile);
assert.deepEqual(manualPileGroup.stackRect, savedManualPile);
assert.deepEqual(manualPileGroup.headingRect, {
  height: RESEARCH_GROUP_HEADING_HEIGHT,
  width: savedManualPile.width,
  x: savedManualPile.x,
  y: savedManualPile.y - RESEARCH_GROUP_HEADING_HEIGHT - RESEARCH_GROUP_HEADING_GAP,
});
assert.ok(manualPileGroup.groupRect.x <= savedManualPile.x);
assert.ok(manualPileGroup.groupRect.y <= manualPileGroup.headingRect.y);
assert.ok(manualPileGroup.groupRect.x + manualPileGroup.groupRect.width >= savedManualPile.x + savedManualPile.width);
assert.ok(manualPileGroup.groupRect.y + manualPileGroup.groupRect.height >= savedManualPile.y + savedManualPile.height);
for (const rect of Object.values(automaticSection.automaticPaperRects)) {
  assert.equal(researchDeskRectsIntersect(rect, savedManualPile), false);
  assert.equal(researchDeskRectsIntersect(rect, manualPileGroup.headingRect), false);
}
assert.deepEqual(movablePileLayout.groups.map((group) => group.key), movablePileGroups.map((group) => group.key));
assertStableGroupOrder(movablePileLayout, "movable collapsed pile followed by automatic section");

const manualGridViewportWidth = 1050;
const manualGridColumnCount = researchDeskColumnCount(manualGridViewportWidth);
const manualGridLayoutWidth = manualGridColumnCount * RESEARCH_PAPER_WIDTH
  + (manualGridColumnCount - 1) * RESEARCH_PAPER_COLUMN_GAP;
const manualGridX = (manualGridViewportWidth - manualGridLayoutWidth) / 2;
const manualGridPile = {
  height: RESEARCH_PAPER_HEIGHT,
  width: RESEARCH_PAPER_WIDTH,
  x: manualGridX,
  y: RESEARCH_DESK_PADDING + RESEARCH_GROUP_HEADING_HEIGHT + RESEARCH_GROUP_HEADING_GAP,
};
const manualGridGroups = [
  { key: "automatic-before-manual", paperIds: ["automatic-before-paper"] },
  { key: "manual-grid-pile", paperIds: ["manual-grid-paper"] },
  { key: "automatic-after-manual", paperIds: ["automatic-after-paper"] },
];
const manualGridLayout = planResearchDeskWorldLayout({
  expandedKeys: [],
  groups: manualGridGroups,
  manualStackRects: { "manual-grid-pile": manualGridPile },
  viewportWidth: manualGridViewportWidth,
});
assert.deepEqual(manualGridLayout.groups[1].stackRect, manualGridPile);
assert.deepEqual(manualGridLayout.groups[1].headingRect, {
  height: RESEARCH_GROUP_HEADING_HEIGHT,
  width: RESEARCH_PAPER_WIDTH,
  x: manualGridPile.x,
  y: manualGridPile.y - RESEARCH_GROUP_HEADING_HEIGHT - RESEARCH_GROUP_HEADING_GAP,
});
assert.equal(manualGridLayout.groups[0].headingRect.x, manualGridX + RESEARCH_PAPER_WIDTH + RESEARCH_PAPER_COLUMN_GAP);
assert.equal(manualGridLayout.groups[2].headingRect.x, manualGridX + 2 * (RESEARCH_PAPER_WIDTH + RESEARCH_PAPER_COLUMN_GAP));
assertStableGroupOrder(manualGridLayout, "manual pile reserved inside compact grid");
assertNoIntersections(visibleLayoutRects(manualGridLayout), "manual pile reserved inside compact grid");

const blockedPileHeading = {
  height: RESEARCH_GROUP_HEADING_HEIGHT,
  width: RESEARCH_PAPER_WIDTH,
  x: 300,
  y: 428,
};
const obstacleAwarePile = planResearchDeskWorldLayout({
  expandedKeys: [],
  groups: [{ key: "obstacle-aware-pile", paperIds: ["obstacle-paper"] }],
  manualStackRects: {
    "obstacle-aware-pile": {
      height: RESEARCH_PAPER_HEIGHT,
      width: RESEARCH_PAPER_WIDTH,
      x: 300,
      y: 500,
    },
  },
  obstacles: [blockedPileHeading],
  viewportWidth: 1050,
});
const obstacleAwareGroup = obstacleAwarePile.groups[0];
assert.notDeepEqual(obstacleAwareGroup.headingRect, blockedPileHeading);
assert.equal(researchDeskRectsIntersect(obstacleAwareGroup.headingRect, blockedPileHeading), false);
assert.equal(researchDeskRectsIntersect(obstacleAwareGroup.headingRect, obstacleAwareGroup.stackRect), false);
assert.ok(obstacleAwareGroup.headingRect.y + obstacleAwareGroup.headingRect.height < obstacleAwareGroup.stackRect.y);

const negativeManualPile = {
  height: RESEARCH_PAPER_HEIGHT,
  width: RESEARCH_PAPER_WIDTH,
  x: -5000,
  y: -3000,
};
const positiveManualPile = {
  height: RESEARCH_PAPER_HEIGHT,
  width: RESEARCH_PAPER_WIDTH,
  x: 9000,
  y: 7000,
};
const farManualPileGroups = [
  { key: "negative-pile", paperIds: ["negative-paper"] },
  { key: "positive-pile", paperIds: ["positive-paper"] },
];
const farManualPileLayout = planResearchDeskWorldLayout({
  expandedKeys: [],
  groups: farManualPileGroups,
  manualStackRects: {
    "negative-pile": negativeManualPile,
    "positive-pile": positiveManualPile,
  },
  viewportWidth: 1050,
});
assert.deepEqual(farManualPileLayout.groups[0].stackRect, negativeManualPile);
assert.deepEqual(farManualPileLayout.groups[1].stackRect, positiveManualPile);
assert.deepEqual(farManualPileLayout.groups.map((group) => group.key), farManualPileGroups.map((group) => group.key));
assert.ok(farManualPileLayout.bounds.x <= negativeManualPile.x);
assert.ok(farManualPileLayout.bounds.y <= negativeManualPile.y);
assert.ok(farManualPileLayout.bounds.x + farManualPileLayout.bounds.width >= positiveManualPile.x + positiveManualPile.width);
assert.ok(farManualPileLayout.bounds.y + farManualPileLayout.bounds.height >= positiveManualPile.y + positiveManualPile.height);

const savedExpandedPile = {
  height: RESEARCH_PAPER_HEIGHT,
  width: RESEARCH_PAPER_WIDTH,
  x: -8000,
  y: -6000,
};
const persistentPileGroups = [
  { key: "persistent-pile", paperIds: ["persistent-a", "persistent-b", "persistent-c"] },
  { key: "persistent-next", paperIds: ["persistent-next-a"] },
];
const expandedSavedPile = planResearchDeskWorldLayout({
  expandedKeys: ["persistent-pile", "persistent-next"],
  groups: persistentPileGroups,
  manualStackRects: { "persistent-pile": savedExpandedPile },
  viewportWidth: 1050,
});
assert.deepEqual(expandedSavedPile.manualStackRects["persistent-pile"], savedExpandedPile);
assert.equal(expandedSavedPile.groups[0].stackRect, null);
assert.equal(Object.keys(expandedSavedPile.groups[0].automaticPaperRects).length, 3);
assertNoIntersections([
  expandedSavedPile.groups[0].headingRect,
  ...Object.values(expandedSavedPile.groups[0].automaticPaperRects),
], "expanded saved pile");
assert.ok(expandedSavedPile.bounds.x > savedExpandedPile.x + savedExpandedPile.width);
assert.ok(expandedSavedPile.bounds.y > savedExpandedPile.y + savedExpandedPile.height);
assert.deepEqual(expandedSavedPile.groups.map((group) => group.key), persistentPileGroups.map((group) => group.key));
assertOrderedGroups(expandedSavedPile, "expanded saved pile order");

const restackedSavedPile = planResearchDeskWorldLayout({
  expandedKeys: ["persistent-next"],
  groups: persistentPileGroups,
  manualStackRects: { "persistent-pile": savedExpandedPile },
  viewportWidth: 1050,
});
assert.deepEqual(restackedSavedPile.groups[0].stackRect, savedExpandedPile);
assert.deepEqual(restackedSavedPile.groups.map((group) => group.key), persistentPileGroups.map((group) => group.key));
assertStableGroupOrder(restackedSavedPile, "restacked saved pile order");

const occupiedOrigin = { height: RESEARCH_PAPER_HEIGHT, width: RESEARCH_PAPER_WIDTH, x: 0, y: 0 };
const nearest = nearestOpenResearchPaperRect(
  { x: 0, y: 0 },
  [occupiedOrigin],
  { clearance: 0 },
);
assert.deepEqual(nearest, {
  height: RESEARCH_PAPER_HEIGHT,
  width: RESEARCH_PAPER_WIDTH,
  x: RESEARCH_PAPER_WIDTH + RESEARCH_PAPER_COLUMN_GAP,
  y: 0,
});
assert.equal(researchDeskRectsIntersect(nearest, occupiedOrigin), false);
assert.deepEqual(
  nearestOpenResearchPaperRect({ x: 25, y: 35 }, []),
  { height: RESEARCH_PAPER_HEIGHT, width: RESEARCH_PAPER_WIDTH, x: 25, y: 35 },
);

const farNegative = { height: RESEARCH_PAPER_HEIGHT, width: RESEARCH_PAPER_WIDTH, x: -5000, y: -3000 };
const farPositive = { height: RESEARCH_PAPER_HEIGHT, width: RESEARCH_PAPER_WIDTH, x: 9000, y: 7000 };
const farBounds = unionResearchDeskRects([farNegative, farPositive]);
assert.deepEqual(farBounds, { height: 10340, width: 14268, x: -5000, y: -3000 });
const farLayoutBounds = planResearchDeskWorldLayout({
  expandedKeys: [],
  groups: [],
  manualPaperRects: { negative: farNegative },
  obstacles: [farPositive],
  viewportWidth: 1050,
}).bounds;
assert.deepEqual(farLayoutBounds, farBounds);

const fitted = fitResearchDeskCamera({
  bounds: farBounds,
  maxScale: 4,
  minScale: 0.001,
  padding: 50,
  viewportHeight: 850,
  viewportWidth: 1050,
});
const fittedLeft = farBounds.x * fitted.scale + fitted.x;
const fittedRight = (farBounds.x + farBounds.width) * fitted.scale + fitted.x;
const fittedTop = farBounds.y * fitted.scale + fitted.y;
const fittedBottom = (farBounds.y + farBounds.height) * fitted.scale + fitted.y;
assert.ok(fittedLeft >= 49.999 && fittedRight <= 1000.001);
assert.ok(fittedTop >= 49.999 && fittedBottom <= 800.001);
assert.ok(Math.abs((fittedLeft + fittedRight) / 2 - 525) < 0.001);
assert.ok(Math.abs((fittedTop + fittedBottom) / 2 - 425) < 0.001);

assert.equal(researchDeskSemanticTier(RESEARCH_SEMANTIC_WIDTHS.browse - 0.001), "overview");
assert.equal(researchDeskSemanticTier(RESEARCH_SEMANTIC_WIDTHS.browse), "browse");
assert.equal(researchDeskSemanticTier(RESEARCH_SEMANTIC_WIDTHS.summary - 0.001), "browse");
assert.equal(researchDeskSemanticTier(RESEARCH_SEMANTIC_WIDTHS.summary), "summary");
assert.equal(researchDeskSemanticTier(RESEARCH_SEMANTIC_WIDTHS.read - 0.001), "summary");
assert.equal(researchDeskSemanticTier(RESEARCH_SEMANTIC_WIDTHS.read), "read");
assert.equal(researchDeskSemanticTierForScale(RESEARCH_SEMANTIC_WIDTHS.summary / RESEARCH_PAPER_WIDTH), "summary");
const tierRank = { overview: 0, browse: 1, summary: 2, read: 3 };
let previousTier = -1;
for (let width = 0; width <= 800; width += 2) {
  const rank = tierRank[researchDeskSemanticTier(width)];
  assert.ok(rank >= previousTier, `semantic tier regressed at ${width}px`);
  previousTier = rank;
}

for (const totalPapers of [17, 85, 500]) {
  for (const viewportWidth of [1050, 1706, 2495]) {
    const groups = makeGroups(totalPapers);
    const layout = planResearchDeskWorldLayout({
      expandedKeys: groups.map((group) => group.key),
      groups,
      viewportWidth,
    });
    const label = `${totalPapers} papers at ${viewportWidth}px`;
    assert.equal(layout.columnCount, researchDeskColumnCount(viewportWidth), `${label}: columns`);
    assert.equal(Object.keys(layout.automaticPaperRects).length, totalPapers, `${label}: paper count`);
    assertNoIntersections(Object.values(layout.automaticPaperRects), label);
    assertOrderedGroups(layout, label);
    assert.ok(Number.isFinite(layout.bounds.x) && Number.isFinite(layout.bounds.y), `${label}: finite origin`);
    assert.ok(layout.bounds.width > 0 && layout.bounds.height > 0, `${label}: positive bounds`);
    const camera = fitResearchDeskCamera({
      bounds: layout.bounds,
      viewportHeight: 850,
      viewportWidth,
    });
    const left = layout.bounds.x * camera.scale + camera.x;
    const right = (layout.bounds.x + layout.bounds.width) * camera.scale + camera.x;
    const top = layout.bounds.y * camera.scale + camera.y;
    const bottom = (layout.bounds.y + layout.bounds.height) * camera.scale + camera.y;
    assert.ok(left >= RESEARCH_DESK_FIT_PADDING - 0.001, `${label}: fitted left`);
    assert.ok(right <= viewportWidth - RESEARCH_DESK_FIT_PADDING + 0.001, `${label}: fitted right`);
    assert.ok(top >= RESEARCH_DESK_FIT_PADDING - 0.001, `${label}: fitted top`);
    assert.ok(bottom <= 850 - RESEARCH_DESK_FIT_PADDING + 0.001, `${label}: fitted bottom`);
  }
}

console.log("RESEARCH DESK WORLD LAYOUT PASS");
