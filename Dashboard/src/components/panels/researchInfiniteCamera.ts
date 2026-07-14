export type ResearchWorldPoint = {
  x: number;
  y: number;
};

export type ResearchWorldRect = ResearchWorldPoint & {
  height: number;
  width: number;
};

export type ResearchWorldViewport = {
  height: number;
  width: number;
};

export type ResearchInfiniteCamera = {
  scale: number;
  x: number;
  y: number;
};

export type ResearchSemanticTier = "library" | "collection" | "preview" | "paper" | "reading";

// These are engineering limits, not user-facing zoom stops. A logarithmic wheel needs
// thousands of ordinary gestures to reach either edge, so the space feels continuous.
export const RESEARCH_INFINITE_MIN_SCALE = 0.00001;
export const RESEARCH_INFINITE_MAX_SCALE = 4096;
export const RESEARCH_INFINITE_DEFAULT_SCALE = 1;
export const RESEARCH_INFINITE_FIT_PADDING = 72;
export const RESEARCH_INFINITE_WHEEL_SENSITIVITY = 0.00165;

function finite(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function positive(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function clampResearchInfiniteScale(scale: number, fallback = RESEARCH_INFINITE_DEFAULT_SCALE) {
  const safeFallback = Math.min(
    RESEARCH_INFINITE_MAX_SCALE,
    Math.max(RESEARCH_INFINITE_MIN_SCALE, positive(fallback, RESEARCH_INFINITE_DEFAULT_SCALE)),
  );
  return Math.min(
    RESEARCH_INFINITE_MAX_SCALE,
    Math.max(RESEARCH_INFINITE_MIN_SCALE, finite(scale, safeFallback)),
  );
}

export function normalizeResearchInfiniteCamera(camera: Partial<ResearchInfiniteCamera> | null | undefined): ResearchInfiniteCamera {
  return {
    scale: clampResearchInfiniteScale(Number(camera?.scale), RESEARCH_INFINITE_DEFAULT_SCALE),
    x: finite(Number(camera?.x)),
    y: finite(Number(camera?.y)),
  };
}

export function researchWorldToScreen(point: ResearchWorldPoint, camera: ResearchInfiniteCamera): ResearchWorldPoint {
  const next = normalizeResearchInfiniteCamera(camera);
  return {
    x: finite(point.x) * next.scale + next.x,
    y: finite(point.y) * next.scale + next.y,
  };
}

export function researchScreenToWorld(point: ResearchWorldPoint, camera: ResearchInfiniteCamera): ResearchWorldPoint {
  const next = normalizeResearchInfiniteCamera(camera);
  return {
    x: (finite(point.x) - next.x) / next.scale,
    y: (finite(point.y) - next.y) / next.scale,
  };
}

export function panResearchInfiniteCamera(
  camera: ResearchInfiniteCamera,
  screenDelta: ResearchWorldPoint,
): ResearchInfiniteCamera {
  const next = normalizeResearchInfiniteCamera(camera);
  return {
    ...next,
    x: next.x + finite(screenDelta.x),
    y: next.y + finite(screenDelta.y),
  };
}

export function zoomResearchInfiniteCameraAtPoint(
  camera: ResearchInfiniteCamera,
  targetScale: number,
  screenAnchor: ResearchWorldPoint,
): ResearchInfiniteCamera {
  const next = normalizeResearchInfiniteCamera(camera);
  const anchor = { x: finite(screenAnchor.x), y: finite(screenAnchor.y) };
  const worldAnchor = researchScreenToWorld(anchor, next);
  const scale = clampResearchInfiniteScale(targetScale, next.scale);
  return {
    scale,
    x: anchor.x - worldAnchor.x * scale,
    y: anchor.y - worldAnchor.y * scale,
  };
}

/** Logarithmic zoom keeps trackpads and mouse wheels smooth across many orders of magnitude. */
export function zoomResearchInfiniteCameraFromWheel(
  camera: ResearchInfiniteCamera,
  deltaY: number,
  screenAnchor: ResearchWorldPoint,
  sensitivity = RESEARCH_INFINITE_WHEEL_SENSITIVITY,
): ResearchInfiniteCamera {
  const next = normalizeResearchInfiniteCamera(camera);
  const safeDelta = Math.max(-2400, Math.min(2400, finite(deltaY)));
  const gain = Math.max(0.00001, finite(sensitivity, RESEARCH_INFINITE_WHEEL_SENSITIVITY));
  return zoomResearchInfiniteCameraAtPoint(next, next.scale * Math.exp(-safeDelta * gain), screenAnchor);
}

export function researchWorldRectUnion(rects: readonly ResearchWorldRect[], padding = 0): ResearchWorldRect {
  const usable = rects.filter((rect) => Number.isFinite(rect.x)
    && Number.isFinite(rect.y)
    && Number.isFinite(rect.width)
    && Number.isFinite(rect.height)
    && rect.width >= 0
    && rect.height >= 0);
  if (!usable.length) return { height: 0, width: 0, x: 0, y: 0 };
  const gap = Math.max(0, finite(padding));
  const left = Math.min(...usable.map((rect) => rect.x)) - gap;
  const top = Math.min(...usable.map((rect) => rect.y)) - gap;
  const right = Math.max(...usable.map((rect) => rect.x + rect.width)) + gap;
  const bottom = Math.max(...usable.map((rect) => rect.y + rect.height)) + gap;
  return { height: bottom - top, width: right - left, x: left, y: top };
}

export function fitResearchInfiniteCamera(
  bounds: ResearchWorldRect,
  viewport: ResearchWorldViewport,
  options: { maxScale?: number; minScale?: number; padding?: number } = {},
): ResearchInfiniteCamera {
  const width = Math.max(1, finite(viewport.width, 1));
  const height = Math.max(1, finite(viewport.height, 1));
  const padding = Math.max(0, finite(options.padding ?? RESEARCH_INFINITE_FIT_PADDING));
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const contentWidth = Math.max(1, finite(bounds.width, 1));
  const contentHeight = Math.max(1, finite(bounds.height, 1));
  const minimum = clampResearchInfiniteScale(options.minScale ?? RESEARCH_INFINITE_MIN_SCALE);
  const maximum = Math.max(minimum, clampResearchInfiniteScale(options.maxScale ?? RESEARCH_INFINITE_DEFAULT_SCALE));
  const scale = Math.min(maximum, Math.max(minimum, Math.min(availableWidth / contentWidth, availableHeight / contentHeight)));
  return {
    scale,
    x: width / 2 - (finite(bounds.x) + contentWidth / 2) * scale,
    y: height / 2 - (finite(bounds.y) + contentHeight / 2) * scale,
  };
}

export function focusResearchInfiniteCamera(
  rect: ResearchWorldRect,
  viewport: ResearchWorldViewport,
  targetScale?: number,
): ResearchInfiniteCamera {
  const width = Math.max(1, finite(viewport.width, 1));
  const height = Math.max(1, finite(viewport.height, 1));
  const scale = clampResearchInfiniteScale(targetScale ?? RESEARCH_INFINITE_DEFAULT_SCALE);
  return {
    scale,
    x: width / 2 - (finite(rect.x) + Math.max(0, finite(rect.width)) / 2) * scale,
    y: height / 2 - (finite(rect.y) + Math.max(0, finite(rect.height)) / 2) * scale,
  };
}

export function visibleResearchWorldRect(
  camera: ResearchInfiniteCamera,
  viewport: ResearchWorldViewport,
  overscanScreenPixels = 0,
): ResearchWorldRect {
  const next = normalizeResearchInfiniteCamera(camera);
  const overscan = Math.max(0, finite(overscanScreenPixels));
  const topLeft = researchScreenToWorld({ x: -overscan, y: -overscan }, next);
  const bottomRight = researchScreenToWorld({
    x: Math.max(1, finite(viewport.width, 1)) + overscan,
    y: Math.max(1, finite(viewport.height, 1)) + overscan,
  }, next);
  return {
    height: bottomRight.y - topLeft.y,
    width: bottomRight.x - topLeft.x,
    x: topLeft.x,
    y: topLeft.y,
  };
}

export function researchWorldRectsIntersect(first: ResearchWorldRect, second: ResearchWorldRect) {
  return first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y;
}

export function researchSemanticTier(scale: number, paperWorldWidth = 268): ResearchSemanticTier {
  const projectedWidth = clampResearchInfiniteScale(scale) * Math.max(1, finite(paperWorldWidth, 268));
  if (projectedWidth < 12) return "library";
  if (projectedWidth < 52) return "collection";
  if (projectedWidth < 190) return "preview";
  if (projectedWidth < 680) return "paper";
  return "reading";
}

export function researchSemanticZoomLabel(tier: ResearchSemanticTier) {
  if (tier === "library") return "Library";
  if (tier === "collection") return "Collections";
  if (tier === "preview") return "Previews";
  if (tier === "paper") return "Pages";
  return "Reading";
}
