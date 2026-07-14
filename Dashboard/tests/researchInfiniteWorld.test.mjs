import assert from "node:assert/strict";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});

const cameraModule = await vite.ssrLoadModule("/src/components/panels/researchInfiniteCamera.ts");
const boardModule = await vite.ssrLoadModule("/src/components/panels/researchBoardState.ts");
const boardLayoutModule = await vite.ssrLoadModule("/src/components/panels/researchBoardLayout.ts");
const exploreLayoutModule = await vite.ssrLoadModule("/src/components/panels/researchExploreLayout.ts");

const {
  RESEARCH_INFINITE_MAX_SCALE,
  RESEARCH_INFINITE_MIN_SCALE,
  fitResearchInfiniteCamera,
  researchScreenToWorld,
  researchSemanticTier,
  researchWorldRectsIntersect,
  researchWorldToScreen,
  visibleResearchWorldRect,
  zoomResearchInfiniteCameraFromWheel,
} = cameraModule;

const {
  commitResearchBoardHistory,
  createResearchBoardRelationship,
  createResearchBoardHistory,
  createEmptyResearchBoardState,
  ensureResearchBoardObjects,
  moveResearchBoardObject,
  removeResearchBoardRelationship,
  redoResearchBoardHistory,
  researchBoardGeometrySnapshot,
  seedResearchBoardStackRects,
  toggleResearchBoardStack,
  undoResearchBoardHistory,
  updateResearchBoardRelationship,
} = boardModule;
const { planResearchBoardLayout } = boardLayoutModule;
const { planResearchExploreLayout, researchStackPeekRects } = exploreLayoutModule;

try {
  const anchor = { x: 777, y: 333 };
  const startCamera = { scale: 0.75, x: 123, y: -45 };
  const anchorWorldBefore = researchScreenToWorld(anchor, startCamera);
  const zoomed = zoomResearchInfiniteCameraFromWheel(startCamera, -480, anchor);
  const anchorWorldAfter = researchScreenToWorld(anchor, zoomed);
  assert.ok(Math.abs(anchorWorldBefore.x - anchorWorldAfter.x) < 1e-8, "pointer x must remain anchored");
  assert.ok(Math.abs(anchorWorldBefore.y - anchorWorldAfter.y) < 1e-8, "pointer y must remain anchored");
  assert.ok(zoomed.scale > startCamera.scale, "negative wheel delta zooms inward");

  let extreme = startCamera;
  for (let index = 0; index < 20_000; index += 1) extreme = zoomResearchInfiniteCameraFromWheel(extreme, index % 2 ? 2400 : -2400, anchor);
  assert.ok(Number.isFinite(extreme.scale) && Number.isFinite(extreme.x) && Number.isFinite(extreme.y));
  const fullyIn = zoomResearchInfiniteCameraFromWheel(startCamera, -1e9, anchor);
  const fullyOut = zoomResearchInfiniteCameraFromWheel(startCamera, 1e9, anchor);
  assert.ok(fullyIn.scale <= RESEARCH_INFINITE_MAX_SCALE);
  assert.ok(fullyOut.scale >= RESEARCH_INFINITE_MIN_SCALE);

  for (const camera of [startCamera, zoomed, fullyIn, fullyOut]) {
    const world = { x: 98213.52, y: -7712.4 };
    const roundTrip = researchScreenToWorld(researchWorldToScreen(world, camera), camera);
    assert.ok(Math.abs(world.x - roundTrip.x) < 0.0001);
    assert.ok(Math.abs(world.y - roundTrip.y) < 0.0001);
  }

  assert.deepEqual(
    [0.00001, 0.02, 0.25, 1, 4].map((scale) => researchSemanticTier(scale)),
    ["library", "library", "preview", "paper", "reading"],
  );

  const fit = fitResearchInfiniteCamera(
    { x: -50_000, y: 10_000, width: 2_000_000, height: 800_000 },
    { width: 1_280, height: 720 },
  );
  assert.ok(fit.scale >= RESEARCH_INFINITE_MIN_SCALE && fit.scale <= 1);
  const visible = visibleResearchWorldRect(fit, { width: 1_280, height: 720 });
  assert.ok(visible.width >= 2_000_000 && visible.height >= 800_000);

  const seeded = seedResearchBoardStackRects(
    Array.from({ length: 12 }, (_, index) => ({ key: `stack-${index}`, paperCount: index + 1 })),
    4,
  );
  assert.equal(Object.keys(seeded).length, 12);
  assert.equal(new Set(Object.values(seeded).map((rect) => `${rect.x}:${rect.y}`)).size, 12);

  const staleBoard = ensureResearchBoardObjects(
    moveResearchBoardObject(createEmptyResearchBoardState(), "paper", "removed-paper", { x: 9_000_000, y: 9_000_000, width: 268, height: 360 }),
    [{ key: "current-stack", paperCount: 1, paperIds: ["current-paper"] }],
    [],
  );
  assert.deepEqual(staleBoard.loosePaperIds, [], "removed papers cannot leave invisible Fit outliers behind");
  assert.deepEqual(staleBoard.paperRects, {}, "removed paper geometry is pruned during library reconciliation");

  let board = ensureResearchBoardObjects(
    createEmptyResearchBoardState(),
    [{ key: "subject-a", paperCount: 40 }, { key: "subject-b", paperCount: 60 }],
    ["idea-a"],
  );
  const originalGeometry = researchBoardGeometrySnapshot(board);
  board = moveResearchBoardObject(board, "paper", "paper-a", { x: 900, y: -250, width: 268, height: 360 });
  board = toggleResearchBoardStack(board, "subject-a");
  assert.ok(board.loosePaperIds.includes("paper-a"));
  assert.ok(board.expandedStackKeys.includes("subject-a"));
  assert.notEqual(researchBoardGeometrySnapshot(board), originalGeometry);

  let history = createResearchBoardHistory(ensureResearchBoardObjects(
    createEmptyResearchBoardState(),
    [{ key: "subject-a", paperCount: 40 }],
    [],
  ));
  const historyStart = researchBoardGeometrySnapshot(history.present);
  history = commitResearchBoardHistory(history, moveResearchBoardObject(
    history.present,
    "stack",
    "subject-a",
    { x: 1_200, y: 400, width: 268, height: 360 },
  ));
  const historyMoved = researchBoardGeometrySnapshot(history.present);
  assert.notEqual(historyMoved, historyStart);
  history = undoResearchBoardHistory(history);
  assert.equal(researchBoardGeometrySnapshot(history.present), historyStart);
  history = redoResearchBoardHistory(history);
  assert.equal(researchBoardGeometrySnapshot(history.present), historyMoved);

  const relationshipStart = researchBoardGeometrySnapshot(history.present);
  history = commitResearchBoardHistory(history, createResearchBoardRelationship(history.present, {
    a: { id: "subject-a", kind: "stack" },
    b: { id: "paper-a", kind: "paper" },
    label: "supports",
  }));
  assert.equal(history.present.relationships.length, 1);
  const relationshipId = history.present.relationships[0].id;
  history = commitResearchBoardHistory(history, updateResearchBoardRelationship(history.present, relationshipId, {
    label: "contrasts with",
    labelOffset: { x: 18, y: -12 },
  }));
  assert.equal(history.present.relationships[0].label, "contrasts with");
  assert.deepEqual(history.present.relationships[0].labelOffset, { x: 18, y: -12 });
  history = commitResearchBoardHistory(history, removeResearchBoardRelationship(history.present, relationshipId));
  assert.equal(history.present.relationships.length, 0);
  assert.equal(researchBoardGeometrySnapshot(history.present), relationshipStart);

  const layoutBoard = ensureResearchBoardObjects(
    toggleResearchBoardStack(createEmptyResearchBoardState(), "large"),
    [{ key: "large", paperCount: 16 }, { key: "neighbor", paperCount: 2 }],
    [],
    2,
  );
  const boardStacks = [
    { key: "large", label: "Large", papers: Array.from({ length: 16 }, (_, index) => ({ id: `large-${index}` })) },
    { key: "neighbor", label: "Neighbor", papers: [{ id: "neighbor-1" }, { id: "neighbor-2" }] },
  ];
  const boardPlan = planResearchBoardLayout(boardStacks, layoutBoard);
  assert.equal(Object.keys(boardPlan.paperRects).length, 16);
  const [largeGroup, neighborGroup] = boardPlan.groups;
  assert.ok(largeGroup.rect.y + largeGroup.rect.height < neighborGroup.rect.y, "expanded stacks push later stacks clear");

  const fixturePapers = Array.from({ length: 10_000 }, (_, index) => ({ id: `fixture-${index}` }));
  const exploreStacks = Array.from({ length: 20 }, (_, stackIndex) => ({
    key: `group-${stackIndex}`,
    label: `Group ${stackIndex}`,
    papers: fixturePapers.slice(stackIndex * 500, (stackIndex + 1) * 500),
  }));
  const boardBeforeExplore = researchBoardGeometrySnapshot(layoutBoard);
  const explorePlan = planResearchExploreLayout(exploreStacks, ["group-0", "group-1"], { maxWorldWidth: 2_000 });
  assert.equal(explorePlan.groups.length, 20);
  assert.equal(Object.keys(explorePlan.paperRects).length, 1_000, "only expanded Explore groups materialize paper geometry");
  assert.equal(researchBoardGeometrySnapshot(layoutBoard), boardBeforeExplore, "Explore planning cannot mutate Board geometry");
  const peek = researchStackPeekRects({ x: 0, y: 0, width: 268, height: 360 }, fixturePapers.slice(0, 20).map((paper) => paper.id));
  assert.equal(Object.keys(peek).length, 7, "stack peeks stay bounded");

  const scaleResults = [];
  for (const paperCount of [100, 1_000, 10_000]) {
    const groupCount = Math.min(20, Math.max(1, Math.ceil(paperCount / 500)));
    const papersPerGroup = Math.ceil(paperCount / groupCount);
    const papers = Array.from({ length: paperCount }, (_, index) => ({ id: `scale-${paperCount}-${index}` }));
    const stacks = Array.from({ length: groupCount }, (_, groupIndex) => ({
      key: `scale-${paperCount}-group-${groupIndex}`,
      label: `Scale group ${groupIndex}`,
      papers: papers.slice(groupIndex * papersPerGroup, Math.min(paperCount, (groupIndex + 1) * papersPerGroup)),
    }));
    const expandedKeys = stacks.map((stack) => stack.key);
    const startedAt = performance.now();
    const plan = planResearchExploreLayout(stacks, expandedKeys, { maxWorldWidth: 2_000 });
    const elapsed = performance.now() - startedAt;
    assert.equal(Object.keys(plan.paperRects).length, paperCount);
    assert.ok(elapsed < 1_500, `${paperCount.toLocaleString()}-paper layout should finish inside the interaction budget (was ${elapsed.toFixed(1)}ms)`);

    const closeViewport = visibleResearchWorldRect({ scale: 0.8, x: 60, y: 80 }, { width: 1_280, height: 720 }, 420);
    const closePaperNodes = Object.values(plan.paperRects).filter((rect) => researchWorldRectsIntersect(rect, closeViewport)).length;
    assert.ok(closePaperNodes <= 60, `${paperCount.toLocaleString()}-paper close view should mount at most 60 paper cards, found ${closePaperNodes}`);

    const overviewCamera = fitResearchInfiniteCamera(plan.bounds, { width: 1_280, height: 720 }, { maxScale: 1, padding: 72 });
    if (paperCount >= 1_000) assert.equal(researchSemanticTier(overviewCamera.scale), "library");
    assert.ok(plan.groups.length <= 20, "overview node count stays grouped instead of following paper count");
    scaleResults.push(`${paperCount.toLocaleString()}: ${elapsed.toFixed(1)}ms / ${closePaperNodes} close-view cards / ${plan.groups.length} overview groups`);
  }

  console.log(`SCALE FIXTURES ${scaleResults.join(" | ")}`);
  console.log("INFINITE RESEARCH CAMERA + BOARD STATE PASS");
} finally {
  await vite.close();
}
