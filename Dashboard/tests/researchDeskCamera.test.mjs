import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  configFile: false,
  logLevel: "silent",
  root: fileURLToPath(new URL("..", import.meta.url)),
  server: { middlewareMode: true },
});

try {
const {
  RESEARCH_DESK_100_PERCENT_SCALE,
  RESEARCH_DESK_MAX_INTERACTION_SCALE,
  RESEARCH_DESK_MIN_INTERACTION_SCALE,
  centerResearchDeskCameraOnRect,
  clampResearchDeskInteractionScale,
  fitResearchDeskWorld,
  panResearchDeskCamera,
  panResearchDeskCameraFromWheel,
  researchDeskCameraAt100Percent,
  researchDeskScreenToWorld,
  researchDeskWorldToScreen,
  zoomResearchDeskCameraAtPoint,
  zoomResearchDeskCameraBy,
  zoomResearchDeskCameraToRect,
} = await vite.ssrLoadModule("/src/components/panels/researchDeskCamera.ts");

const closeTo = (actual, expected, message) => {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: expected ${expected}, received ${actual}`);
};

const assertFiniteCamera = (camera, message) => {
  assert.ok(Number.isFinite(camera.scale) && camera.scale > 0, `${message}: finite positive scale`);
  assert.ok(Number.isFinite(camera.x), `${message}: finite x`);
  assert.ok(Number.isFinite(camera.y), `${message}: finite y`);
};

assert.equal(RESEARCH_DESK_MIN_INTERACTION_SCALE, 0.02);
assert.equal(RESEARCH_DESK_MAX_INTERACTION_SCALE, 8);
assert.equal(RESEARCH_DESK_100_PERCENT_SCALE, 1);
assert.equal(clampResearchDeskInteractionScale(0), 0.02);
assert.equal(clampResearchDeskInteractionScale(100), 8);
assert.equal(clampResearchDeskInteractionScale(Number.NaN), 1);

const camera = { scale: 2.5, x: -420, y: 175 };
const worldPoint = { x: -1_250.25, y: 3_800.5 };
const projectedPoint = researchDeskWorldToScreen(worldPoint, camera);
const roundTrip = researchDeskScreenToWorld(projectedPoint, camera);
closeTo(roundTrip.x, worldPoint.x, "world/screen round trip x");
closeTo(roundTrip.y, worldPoint.y, "world/screen round trip y");

const unboundedPan = panResearchDeskCamera(camera, { x: 5_000_000, y: -7_000_000 });
assert.deepEqual(unboundedPan, { scale: 2.5, x: 4_999_580, y: -6_999_825 });
const wheelPan = panResearchDeskCameraFromWheel(camera, { x: 37, y: -91 });
assert.deepEqual(wheelPan, { scale: 2.5, x: -457, y: 266 });
const wheelPanWithGain = panResearchDeskCameraFromWheel(camera, { x: 10, y: 20 }, 0.5);
assert.deepEqual(wheelPanWithGain, { scale: 2.5, x: -425, y: 165 });

const anchor = { x: 640, y: 360 };
const anchoredWorldBefore = researchDeskScreenToWorld(anchor, camera);
const zoomed = zoomResearchDeskCameraAtPoint(camera, 6.25, anchor);
const anchoredWorldAfter = researchDeskScreenToWorld(anchor, zoomed);
closeTo(anchoredWorldAfter.x, anchoredWorldBefore.x, "absolute zoom anchor x");
closeTo(anchoredWorldAfter.y, anchoredWorldBefore.y, "absolute zoom anchor y");
assert.equal(zoomed.scale, 6.25);

const maxZoom = zoomResearchDeskCameraAtPoint(camera, 50, anchor);
const minZoom = zoomResearchDeskCameraAtPoint(camera, 0.00001, anchor);
assert.equal(maxZoom.scale, RESEARCH_DESK_MAX_INTERACTION_SCALE);
assert.equal(minZoom.scale, RESEARCH_DESK_MIN_INTERACTION_SCALE);
const factorZoom = zoomResearchDeskCameraBy(camera, 0.5, anchor);
assert.equal(factorZoom.scale, 1.25);
closeTo(
  researchDeskScreenToWorld(anchor, factorZoom).x,
  anchoredWorldBefore.x,
  "factor zoom anchor x",
);

const veryLargeBounds = { x: -1_000_000, y: -500_000, width: 2_000_000, height: 1_000_000 };
const fitted = fitResearchDeskWorld({
  bounds: veryLargeBounds,
  minScale: 0.0001,
  padding: 40,
  viewport: { width: 1_280, height: 720 },
});
assert.ok(fitted.scale < RESEARCH_DESK_MIN_INTERACTION_SCALE, "Fit may recover a world below 2% scale");
const fittedLeft = veryLargeBounds.x * fitted.scale + fitted.x;
const fittedRight = (veryLargeBounds.x + veryLargeBounds.width) * fitted.scale + fitted.x;
const fittedTop = veryLargeBounds.y * fitted.scale + fitted.y;
const fittedBottom = (veryLargeBounds.y + veryLargeBounds.height) * fitted.scale + fitted.y;
assert.ok(fittedLeft >= 39.999 && fittedRight <= 1_240.001, "fit horizontal padding");
assert.ok(fittedTop >= 39.999 && fittedBottom <= 680.001, "fit vertical padding");
closeTo((fittedLeft + fittedRight) / 2, 640, "fit horizontal center");
closeTo((fittedTop + fittedBottom) / 2, 360, "fit vertical center");

const rect = { x: 1_000, y: -300, width: 268, height: 340 };
const centered = centerResearchDeskCameraOnRect({
  rect,
  scale: 2,
  viewport: { width: 1_280, height: 720 },
});
assert.deepEqual(centered, { scale: 2, x: -1_628, y: 620 });
const rectCenter = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
assert.deepEqual(researchDeskWorldToScreen(rectCenter, centered), { x: 640, y: 360 });

const zoomedToRect = zoomResearchDeskCameraToRect({
  padding: 50,
  rect,
  viewport: { width: 1_280, height: 720 },
});
assert.ok(
  zoomedToRect.scale >= RESEARCH_DESK_MIN_INTERACTION_SCALE
    && zoomedToRect.scale <= RESEARCH_DESK_MAX_INTERACTION_SCALE,
  "zoom-to-rect uses normal interaction range",
);
const zoomedRectCenter = researchDeskWorldToScreen(rectCenter, zoomedToRect);
closeTo(zoomedRectCenter.x, 640, "zoom-to-rect center x");
closeTo(zoomedRectCenter.y, 360, "zoom-to-rect center y");

const centerWorldBefore = researchDeskScreenToWorld({ x: 640, y: 360 }, camera);
const oneHundred = researchDeskCameraAt100Percent(camera, { width: 1_280, height: 720 });
assert.equal(oneHundred.scale, 1);
const centerWorldAfter = researchDeskScreenToWorld({ x: 640, y: 360 }, oneHundred);
closeTo(centerWorldAfter.x, centerWorldBefore.x, "100% preserves viewport-center world x");
closeTo(centerWorldAfter.y, centerWorldBefore.y, "100% preserves viewport-center world y");

const malformedCamera = { scale: Number.NaN, x: Number.POSITIVE_INFINITY, y: Number.NEGATIVE_INFINITY };
const malformedPoint = { x: Number.NaN, y: Number.POSITIVE_INFINITY };
assertFiniteCamera(panResearchDeskCamera(malformedCamera, malformedPoint), "malformed pan");
assertFiniteCamera(zoomResearchDeskCameraAtPoint(malformedCamera, Number.NaN, malformedPoint), "malformed zoom");
assertFiniteCamera(researchDeskCameraAt100Percent(malformedCamera, { width: Number.NaN, height: -10 }), "malformed 100%");
assertFiniteCamera(fitResearchDeskWorld({
  bounds: { x: Number.NaN, y: Number.POSITIVE_INFINITY, width: -10, height: Number.NaN },
  maxScale: Number.NaN,
  minScale: Number.NaN,
  padding: Number.NaN,
  viewport: { width: Number.NaN, height: Number.NEGATIVE_INFINITY },
}), "malformed fit");
assertFiniteCamera(centerResearchDeskCameraOnRect({
  rect: { x: Number.NaN, y: Number.POSITIVE_INFINITY, width: -10, height: Number.NaN },
  scale: Number.POSITIVE_INFINITY,
  viewport: { width: Number.NaN, height: Number.NEGATIVE_INFINITY },
}), "malformed center");
assertFiniteCamera(zoomResearchDeskCameraToRect({
  maxScale: Number.NaN,
  minScale: Number.NaN,
  padding: Number.NaN,
  rect: { x: Number.NaN, y: Number.POSITIVE_INFINITY, width: -10, height: Number.NaN },
  viewport: { width: Number.NaN, height: Number.NEGATIVE_INFINITY },
}), "malformed zoom-to-rect");

console.log("RESEARCH DESK CAMERA PASS");
} finally {
  await vite.close();
}
