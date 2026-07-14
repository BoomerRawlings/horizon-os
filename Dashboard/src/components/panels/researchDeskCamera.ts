import {
  RESEARCH_DESK_FIT_PADDING,
  RESEARCH_DESK_MIN_FIT_SCALE,
  fitResearchDeskCamera,
  type ResearchDeskCamera,
  type ResearchDeskRect,
} from "./researchDeskLayout";

export type { ResearchDeskCamera, ResearchDeskRect };

export const RESEARCH_DESK_MIN_INTERACTION_SCALE = 0.02;
export const RESEARCH_DESK_MAX_INTERACTION_SCALE = 8;
export const RESEARCH_DESK_100_PERCENT_SCALE = 1;

export type ResearchDeskPoint = {
  x: number;
  y: number;
};

export type ResearchDeskViewport = {
  height: number;
  width: number;
};

export type ResearchDeskCameraFitOptions = {
  maxScale?: number;
  minScale?: number;
  padding?: number;
};

export type ResearchDeskCameraFitInput = ResearchDeskCameraFitOptions & {
  bounds: ResearchDeskRect;
  viewport: ResearchDeskViewport;
};

export type ResearchDeskCameraCenterInput = {
  rect: ResearchDeskRect;
  scale?: number;
  viewport: ResearchDeskViewport;
};

export type ResearchDeskCameraZoomToRectInput = ResearchDeskCameraFitOptions & {
  rect: ResearchDeskRect;
  viewport: ResearchDeskViewport;
};

function finiteNumber(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function positiveFiniteNumber(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function safeCamera(camera: ResearchDeskCamera): ResearchDeskCamera {
  return {
    scale: positiveFiniteNumber(camera.scale, RESEARCH_DESK_100_PERCENT_SCALE),
    x: finiteNumber(camera.x),
    y: finiteNumber(camera.y),
  };
}

function safePoint(point: ResearchDeskPoint): ResearchDeskPoint {
  return {
    x: finiteNumber(point.x),
    y: finiteNumber(point.y),
  };
}

function safeViewport(viewport: ResearchDeskViewport): ResearchDeskViewport {
  return {
    height: Math.max(1, finiteNumber(viewport.height, 1)),
    width: Math.max(1, finiteNumber(viewport.width, 1)),
  };
}

function safeRect(rect: ResearchDeskRect): ResearchDeskRect {
  return {
    height: Math.max(0, finiteNumber(rect.height)),
    width: Math.max(0, finiteNumber(rect.width)),
    x: finiteNumber(rect.x),
    y: finiteNumber(rect.y),
  };
}

export function clampResearchDeskInteractionScale(
  scale: number,
  fallback = RESEARCH_DESK_100_PERCENT_SCALE,
) {
  const safeFallback = Math.min(
    RESEARCH_DESK_MAX_INTERACTION_SCALE,
    Math.max(RESEARCH_DESK_MIN_INTERACTION_SCALE, finiteNumber(fallback, RESEARCH_DESK_100_PERCENT_SCALE)),
  );
  return Math.min(
    RESEARCH_DESK_MAX_INTERACTION_SCALE,
    Math.max(RESEARCH_DESK_MIN_INTERACTION_SCALE, finiteNumber(scale, safeFallback)),
  );
}

/** Convert a screen-space point into the single, unbounded desk coordinate system. */
export function researchDeskScreenToWorld(
  point: ResearchDeskPoint,
  camera: ResearchDeskCamera,
): ResearchDeskPoint {
  const nextCamera = safeCamera(camera);
  const nextPoint = safePoint(point);
  return {
    x: (nextPoint.x - nextCamera.x) / nextCamera.scale,
    y: (nextPoint.y - nextCamera.y) / nextCamera.scale,
  };
}

/** Project an unbounded world-space point into the viewport. */
export function researchDeskWorldToScreen(
  point: ResearchDeskPoint,
  camera: ResearchDeskCamera,
): ResearchDeskPoint {
  const nextCamera = safeCamera(camera);
  const nextPoint = safePoint(point);
  return {
    x: nextPoint.x * nextCamera.scale + nextCamera.x,
    y: nextPoint.y * nextCamera.scale + nextCamera.y,
  };
}

/** Translate the camera by a screen-pixel delta. There are deliberately no world bounds. */
export function panResearchDeskCamera(
  camera: ResearchDeskCamera,
  screenDelta: ResearchDeskPoint,
): ResearchDeskCamera {
  const nextCamera = safeCamera(camera);
  const delta = safePoint(screenDelta);
  return {
    ...nextCamera,
    x: nextCamera.x + delta.x,
    y: nextCamera.y + delta.y,
  };
}

/**
 * Apply native wheel/touchpad deltas. Positive browser deltas move the viewed world left/up,
 * while horizontal and vertical deltas remain independent.
 */
export function panResearchDeskCameraFromWheel(
  camera: ResearchDeskCamera,
  wheelDelta: ResearchDeskPoint,
  multiplier = 1,
): ResearchDeskCamera {
  const delta = safePoint(wheelDelta);
  const gain = finiteNumber(multiplier, 1);
  return panResearchDeskCamera(camera, {
    x: -delta.x * gain,
    y: -delta.y * gain,
  });
}

/** Zoom to an absolute interaction scale without moving the world point under the pointer. */
export function zoomResearchDeskCameraAtPoint(
  camera: ResearchDeskCamera,
  targetScale: number,
  screenPoint: ResearchDeskPoint,
): ResearchDeskCamera {
  const nextCamera = safeCamera(camera);
  const anchor = safePoint(screenPoint);
  const scale = clampResearchDeskInteractionScale(targetScale, nextCamera.scale);
  const worldPoint = researchDeskScreenToWorld(anchor, nextCamera);
  return {
    scale,
    x: anchor.x - worldPoint.x * scale,
    y: anchor.y - worldPoint.y * scale,
  };
}

/** Zoom by a multiplicative factor, using the same pointer anchoring and interaction limits. */
export function zoomResearchDeskCameraBy(
  camera: ResearchDeskCamera,
  scaleFactor: number,
  screenPoint: ResearchDeskPoint,
): ResearchDeskCamera {
  const nextCamera = safeCamera(camera);
  const factor = positiveFiniteNumber(scaleFactor, 1);
  return zoomResearchDeskCameraAtPoint(
    nextCamera,
    nextCamera.scale * factor,
    screenPoint,
  );
}

/**
 * Fit the whole desk. Unlike ordinary zoom interactions, this intentionally permits a scale
 * below 2% so every paper remains recoverable even when the world is extremely large.
 */
export function fitResearchDeskWorld({
  bounds,
  maxScale = RESEARCH_DESK_100_PERCENT_SCALE,
  minScale = RESEARCH_DESK_MIN_FIT_SCALE,
  padding = RESEARCH_DESK_FIT_PADDING,
  viewport,
}: ResearchDeskCameraFitInput): ResearchDeskCamera {
  const nextViewport = safeViewport(viewport);
  return fitResearchDeskCamera({
    bounds: safeRect(bounds),
    maxScale: positiveFiniteNumber(maxScale, RESEARCH_DESK_100_PERCENT_SCALE),
    minScale: positiveFiniteNumber(minScale, RESEARCH_DESK_MIN_FIT_SCALE),
    padding: Math.max(0, finiteNumber(padding, RESEARCH_DESK_FIT_PADDING)),
    viewportHeight: nextViewport.height,
    viewportWidth: nextViewport.width,
  });
}

/** Center a world rectangle at an explicit, normally clamped zoom scale. */
export function centerResearchDeskCameraOnRect({
  rect,
  scale = RESEARCH_DESK_100_PERCENT_SCALE,
  viewport,
}: ResearchDeskCameraCenterInput): ResearchDeskCamera {
  const nextRect = safeRect(rect);
  const nextViewport = safeViewport(viewport);
  const nextScale = clampResearchDeskInteractionScale(scale);
  return {
    scale: nextScale,
    x: nextViewport.width / 2 - (nextRect.x + nextRect.width / 2) * nextScale,
    y: nextViewport.height / 2 - (nextRect.y + nextRect.height / 2) * nextScale,
  };
}

/** Fit and center one target rectangle within the normal 2%-800% interaction range. */
export function zoomResearchDeskCameraToRect({
  maxScale = RESEARCH_DESK_MAX_INTERACTION_SCALE,
  minScale = RESEARCH_DESK_MIN_INTERACTION_SCALE,
  padding = RESEARCH_DESK_FIT_PADDING,
  rect,
  viewport,
}: ResearchDeskCameraZoomToRectInput): ResearchDeskCamera {
  const lowerScale = clampResearchDeskInteractionScale(minScale, RESEARCH_DESK_MIN_INTERACTION_SCALE);
  const upperScale = Math.max(
    lowerScale,
    clampResearchDeskInteractionScale(maxScale, RESEARCH_DESK_MAX_INTERACTION_SCALE),
  );
  const nextViewport = safeViewport(viewport);
  return fitResearchDeskCamera({
    bounds: safeRect(rect),
    maxScale: upperScale,
    minScale: lowerScale,
    padding: Math.max(0, finiteNumber(padding, RESEARCH_DESK_FIT_PADDING)),
    viewportHeight: nextViewport.height,
    viewportWidth: nextViewport.width,
  });
}

/** Return to 100% while keeping the world point at the viewport center stationary. */
export function researchDeskCameraAt100Percent(
  camera: ResearchDeskCamera,
  viewport: ResearchDeskViewport,
): ResearchDeskCamera {
  const nextViewport = safeViewport(viewport);
  return zoomResearchDeskCameraAtPoint(
    camera,
    RESEARCH_DESK_100_PERCENT_SCALE,
    { x: nextViewport.width / 2, y: nextViewport.height / 2 },
  );
}
