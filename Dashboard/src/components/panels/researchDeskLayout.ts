export const RESEARCH_PAPER_WIDTH = 268;
export const RESEARCH_PAPER_HEIGHT = 340;
export const RESEARCH_PAPER_COLUMN_GAP = 32;
export const RESEARCH_PAPER_ROW_GAP = 40;
export const RESEARCH_DESK_PADDING = 48;
export const RESEARCH_GROUP_HEADING_HEIGHT = 52;
export const RESEARCH_GROUP_HEADING_GAP = 20;
export const RESEARCH_GROUP_GAP = 72;
export const RESEARCH_PAPER_OBSTACLE_CLEARANCE = 12;
export const RESEARCH_DESK_FIT_PADDING = 64;
export const RESEARCH_DESK_MIN_FIT_SCALE = 0.0025;

export const RESEARCH_SEMANTIC_WIDTHS = {
  browse: 150,
  read: 460,
  summary: 280,
} as const;

export type ResearchDeskCamera = {
  scale: number;
  x: number;
  y: number;
};

export type ResearchDeskPosition = {
  rotation: number;
  x: number;
  y: number;
  z: number;
};

export type ResearchDeskRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type ResearchDeskScreenBounds = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

export type ResearchDeskStackGroup = {
  key: string;
  paperIds: readonly string[];
};

export type ResearchDeskStackPlan = ResearchDeskStackGroup & {
  expanded: boolean;
  groupOrder: number;
};

export type ResearchDeskGroupWorldLayout = ResearchDeskStackPlan & {
  automaticPaperRects: Readonly<Record<string, ResearchDeskRect>>;
  groupRect: ResearchDeskRect;
  headingRect: ResearchDeskRect;
  rowCount: number;
  stackRect: ResearchDeskRect | null;
};

export type ResearchDeskWorldLayout = {
  automaticPaperRects: Readonly<Record<string, ResearchDeskRect>>;
  bounds: ResearchDeskRect;
  columnCount: number;
  groupRects: Readonly<Record<string, ResearchDeskRect>>;
  groups: readonly ResearchDeskGroupWorldLayout[];
  headingRects: Readonly<Record<string, ResearchDeskRect>>;
  manualPaperRects: Readonly<Record<string, ResearchDeskRect>>;
  manualStackRects: Readonly<Record<string, ResearchDeskRect>>;
};

export type ResearchDeskWorldLayoutInput = {
  expandedKeys: readonly string[];
  groups: readonly ResearchDeskStackGroup[];
  manualPaperRects?: Readonly<Record<string, ResearchDeskRect>>;
  manualStackRects?: Readonly<Record<string, ResearchDeskRect>>;
  obstacles?: readonly ResearchDeskRect[];
  originY?: number;
  viewportWidth: number;
};

export type ResearchDeskOpenPositionOptions = {
  clearance?: number;
  columnStep?: number;
  height?: number;
  maxRings?: number;
  rowStep?: number;
  width?: number;
};

export type ResearchDeskFitCameraInput = {
  bounds: ResearchDeskRect;
  maxScale?: number;
  minScale?: number;
  padding?: number;
  viewportHeight: number;
  viewportWidth: number;
};

export type ResearchDeskSemanticTier = "overview" | "browse" | "summary" | "read";

export type ResearchDeskCameraBoundsInput = {
  contentHeight: number;
  contentLeft?: number;
  contentTop?: number;
  contentWidth: number;
  overscan?: number;
  scale: number;
  viewportHeight: number;
  viewportWidth: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function finiteNumber(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizedRect(rect: ResearchDeskRect): ResearchDeskRect {
  return {
    height: Math.max(0, finiteNumber(rect.height)),
    width: Math.max(0, finiteNumber(rect.width)),
    x: finiteNumber(rect.x),
    y: finiteNumber(rect.y),
  };
}

function normalizedRectRecord(rects: Readonly<Record<string, ResearchDeskRect>>) {
  const result: Record<string, ResearchDeskRect> = {};
  for (const [key, source] of Object.entries(rects)) {
    const rect = normalizedRect(source);
    if (rect.width > 0 && rect.height > 0) result[key] = rect;
  }
  return result;
}

function rectRight(rect: ResearchDeskRect) {
  return rect.x + rect.width;
}

function rectBottom(rect: ResearchDeskRect) {
  return rect.y + rect.height;
}

export function screenBoundsToResearchWorld(
  bounds: ResearchDeskScreenBounds,
  camera: ResearchDeskCamera,
): ResearchDeskScreenBounds {
  const scale = Math.max(0.01, camera.scale);
  return {
    bottom: (bounds.bottom - camera.y) / scale,
    left: (bounds.left - camera.x) / scale,
    right: (bounds.right - camera.x) / scale,
    top: (bounds.top - camera.y) / scale,
  };
}

export function isFreeResearchPaperPosition(position: Pick<ResearchDeskPosition, "x" | "y"> | undefined) {
  return Boolean(position && (position.x !== 0 || position.y !== 0));
}

export function planExpandedResearchStacks(
  groups: readonly ResearchDeskStackGroup[],
  expandedKeys: readonly string[],
): ResearchDeskStackPlan[] {
  const expanded = new Set(expandedKeys);
  return groups.map((group, groupOrder) => ({
    ...group,
    expanded: expanded.has(group.key),
    groupOrder,
    paperIds: [...group.paperIds],
  }));
}

export function researchDeskRectsIntersect(
  first: ResearchDeskRect,
  second: ResearchDeskRect,
  clearance = 0,
) {
  const gap = Math.max(0, finiteNumber(clearance));
  return first.x < rectRight(second) + gap
    && rectRight(first) + gap > second.x
    && first.y < rectBottom(second) + gap
    && rectBottom(first) + gap > second.y;
}

export function unionResearchDeskRects(
  rects: readonly ResearchDeskRect[],
  padding = 0,
): ResearchDeskRect {
  const normalized = rects
    .map(normalizedRect)
    .filter((rect) => rect.width > 0 || rect.height > 0);
  if (!normalized.length) return { height: 0, width: 0, x: 0, y: 0 };

  const gap = Math.max(0, finiteNumber(padding));
  const left = Math.min(...normalized.map((rect) => rect.x)) - gap;
  const top = Math.min(...normalized.map((rect) => rect.y)) - gap;
  const right = Math.max(...normalized.map(rectRight)) + gap;
  const bottom = Math.max(...normalized.map(rectBottom)) + gap;
  return { height: bottom - top, width: right - left, x: left, y: top };
}

export function researchDeskColumnCount(viewportWidth: number) {
  const availableWidth = Math.max(
    RESEARCH_PAPER_WIDTH,
    finiteNumber(viewportWidth, RESEARCH_PAPER_WIDTH + RESEARCH_DESK_PADDING * 2) - RESEARCH_DESK_PADDING * 2,
  );
  return Math.max(1, Math.floor(
    (availableWidth + RESEARCH_PAPER_COLUMN_GAP)
      / (RESEARCH_PAPER_WIDTH + RESEARCH_PAPER_COLUMN_GAP),
  ));
}

function researchPaperRect(x: number, y: number, width = RESEARCH_PAPER_WIDTH, height = RESEARCH_PAPER_HEIGHT) {
  return { height, width, x, y };
}

function isOpenResearchPaperRect(
  candidate: ResearchDeskRect,
  obstacles: readonly ResearchDeskRect[],
  clearance: number,
) {
  return obstacles.every((obstacle) => !researchDeskRectsIntersect(candidate, obstacle, clearance));
}

export function nearestOpenResearchPaperRect(
  preferred: Pick<ResearchDeskRect, "x" | "y">,
  obstacles: readonly ResearchDeskRect[],
  options: ResearchDeskOpenPositionOptions = {},
): ResearchDeskRect {
  const width = Math.max(1, finiteNumber(options.width ?? RESEARCH_PAPER_WIDTH, RESEARCH_PAPER_WIDTH));
  const height = Math.max(1, finiteNumber(options.height ?? RESEARCH_PAPER_HEIGHT, RESEARCH_PAPER_HEIGHT));
  const columnStep = Math.max(1, finiteNumber(options.columnStep ?? width + RESEARCH_PAPER_COLUMN_GAP));
  const rowStep = Math.max(1, finiteNumber(options.rowStep ?? height + RESEARCH_PAPER_ROW_GAP));
  const clearance = Math.max(0, finiteNumber(options.clearance ?? RESEARCH_PAPER_OBSTACLE_CLEARANCE));
  const maxRings = Math.max(1, Math.floor(finiteNumber(options.maxRings ?? 512, 512)));
  const origin = researchPaperRect(finiteNumber(preferred.x), finiteNumber(preferred.y), width, height);
  const normalizedObstacles = obstacles.map(normalizedRect);
  if (isOpenResearchPaperRect(origin, normalizedObstacles, clearance)) return origin;

  for (let ring = 1; ring <= maxRings; ring += 1) {
    const candidates: Array<ResearchDeskRect & { distance: number; dx: number; dy: number }> = [];
    for (let dy = -ring; dy <= ring; dy += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = origin.x + dx * columnStep;
        const y = origin.y + dy * rowStep;
        candidates.push({
          ...researchPaperRect(x, y, width, height),
          distance: (x - origin.x) ** 2 + (y - origin.y) ** 2,
          dx,
          dy,
        });
      }
    }
    candidates.sort((first, second) =>
      first.distance - second.distance
      || Number(first.dy < 0) - Number(second.dy < 0)
      || Math.abs(first.dy) - Math.abs(second.dy)
      || Number(first.dx < 0) - Number(second.dx < 0)
      || first.dy - second.dy
      || first.dx - second.dx);
    const open = candidates.find((candidate) => isOpenResearchPaperRect(candidate, normalizedObstacles, clearance));
    if (open) return researchPaperRect(open.x, open.y, width, height);
  }

  throw new RangeError(`No open research paper position was found within ${maxRings} rings.`);
}

function firstOpenGridRect({
  columnCount,
  contentX,
  contentY,
  occupied,
  startSlot,
}: {
  columnCount: number;
  contentX: number;
  contentY: number;
  occupied: readonly ResearchDeskRect[];
  startSlot: number;
}) {
  const maxSlots = startSlot + 1_000_000;
  for (let slot = startSlot; slot < maxSlots; slot += 1) {
    const column = slot % columnCount;
    const row = Math.floor(slot / columnCount);
    const rect = researchPaperRect(
      contentX + column * (RESEARCH_PAPER_WIDTH + RESEARCH_PAPER_COLUMN_GAP),
      contentY + row * (RESEARCH_PAPER_HEIGHT + RESEARCH_PAPER_ROW_GAP),
    );
    if (isOpenResearchPaperRect(rect, occupied, RESEARCH_PAPER_OBSTACLE_CLEARANCE)) {
      return { rect, slot };
    }
  }
  throw new RangeError("The research layout could not find an open grid slot.");
}

function headingBelowObstacles(
  preferred: ResearchDeskRect,
  obstacles: readonly ResearchDeskRect[],
) {
  let heading = preferred;
  for (let pass = 0; pass <= obstacles.length; pass += 1) {
    const collisions = obstacles.filter((obstacle) =>
      researchDeskRectsIntersect(heading, obstacle, RESEARCH_PAPER_OBSTACLE_CLEARANCE));
    if (!collisions.length) return heading;
    heading = {
      ...heading,
      y: Math.max(...collisions.map(rectBottom)) + RESEARCH_GROUP_HEADING_GAP,
    };
  }
  return heading;
}

function headingAboveManualStack(
  stackRect: ResearchDeskRect,
  obstacles: readonly ResearchDeskRect[],
) {
  let heading = {
    height: RESEARCH_GROUP_HEADING_HEIGHT,
    width: RESEARCH_PAPER_WIDTH,
    x: stackRect.x,
    y: stackRect.y - RESEARCH_GROUP_HEADING_HEIGHT - RESEARCH_GROUP_HEADING_GAP,
  };
  for (let pass = 0; pass <= obstacles.length; pass += 1) {
    const collisions = obstacles.filter((obstacle) =>
      researchDeskRectsIntersect(heading, obstacle, RESEARCH_PAPER_OBSTACLE_CLEARANCE));
    if (!collisions.length) return heading;
    heading = {
      ...heading,
      y: Math.min(...collisions.map((obstacle) => obstacle.y))
        - RESEARCH_GROUP_HEADING_HEIGHT
        - RESEARCH_GROUP_HEADING_GAP,
    };
  }
  return heading;
}

function firstOpenCollapsedGroup({
  columnCount,
  contentX,
  contentY,
  hasStack,
  occupied,
  startSlot,
}: {
  columnCount: number;
  contentX: number;
  contentY: number;
  hasStack: boolean;
  occupied: readonly ResearchDeskRect[];
  startSlot: number;
}) {
  const groupHeight = RESEARCH_GROUP_HEADING_HEIGHT
    + RESEARCH_GROUP_HEADING_GAP
    + RESEARCH_PAPER_HEIGHT;
  const maxSlots = startSlot + 1_000_000;
  for (let slot = startSlot; slot < maxSlots; slot += 1) {
    const column = slot % columnCount;
    const row = Math.floor(slot / columnCount);
    const x = contentX + column * (RESEARCH_PAPER_WIDTH + RESEARCH_PAPER_COLUMN_GAP);
    const headingRect = {
      height: RESEARCH_GROUP_HEADING_HEIGHT,
      width: RESEARCH_PAPER_WIDTH,
      x,
      y: contentY + row * (groupHeight + RESEARCH_GROUP_GAP),
    };
    const stackRect = hasStack
      ? researchPaperRect(x, rectBottom(headingRect) + RESEARCH_GROUP_HEADING_GAP)
      : null;
    const candidateRects = stackRect ? [headingRect, stackRect] : [headingRect];
    if (candidateRects.every((rect) =>
      isOpenResearchPaperRect(rect, occupied, RESEARCH_PAPER_OBSTACLE_CLEARANCE))) {
      return { headingRect, slot, stackRect };
    }
  }
  throw new RangeError("The research layout could not find an open collapsed-group slot.");
}

export function planResearchDeskWorldLayout({
  expandedKeys,
  groups,
  manualPaperRects = {},
  manualStackRects = {},
  obstacles = [],
  originY = RESEARCH_DESK_PADDING,
  viewportWidth,
}: ResearchDeskWorldLayoutInput): ResearchDeskWorldLayout {
  const stackPlan = planExpandedResearchStacks(groups, expandedKeys);
  const columnCount = researchDeskColumnCount(viewportWidth);
  const layoutWidth = columnCount * RESEARCH_PAPER_WIDTH
    + (columnCount - 1) * RESEARCH_PAPER_COLUMN_GAP;
  const availableWidth = Math.max(layoutWidth, finiteNumber(viewportWidth, layoutWidth + RESEARCH_DESK_PADDING * 2));
  const contentX = Math.max(
    RESEARCH_DESK_PADDING,
    (availableWidth - layoutWidth) / 2,
  );
  const normalizedManualRects = normalizedRectRecord(manualPaperRects);
  const normalizedManualStackRects = normalizedRectRecord(manualStackRects);
  const activeManualStackRects = Object.fromEntries(
    stackPlan
      .filter((group) => !group.expanded && normalizedManualStackRects[group.key])
      .map((group) => [group.key, normalizedManualStackRects[group.key]]),
  ) as Record<string, ResearchDeskRect>;
  const normalizedObstacles = obstacles.map(normalizedRect);
  const reservedManualRects: ResearchDeskRect[] = [
    ...normalizedObstacles,
    ...Object.values(normalizedManualRects),
    ...Object.values(activeManualStackRects),
  ];
  const manualHeadingRects: Record<string, ResearchDeskRect> = {};
  for (const group of stackPlan) {
    const manualStackRect = activeManualStackRects[group.key];
    if (!manualStackRect) continue;
    const headingRect = headingAboveManualStack(manualStackRect, reservedManualRects);
    manualHeadingRects[group.key] = headingRect;
    reservedManualRects.push(headingRect);
  }
  const occupied: ResearchDeskRect[] = [...reservedManualRects];
  const automaticPaperRects: Record<string, ResearchDeskRect> = {};
  const groupRects: Record<string, ResearchDeskRect> = {};
  const headingRects: Record<string, ResearchDeskRect> = {};
  const groupLayouts: ResearchDeskGroupWorldLayout[] = [];
  let cursorY = finiteNumber(originY, RESEARCH_DESK_PADDING);
  let collapsedRunY: number | null = null;
  let collapsedRunBottom = cursorY;
  let nextCollapsedSlot = 0;

  for (const group of stackPlan) {
    const manualStackRect = activeManualStackRects[group.key] || null;
    let headingRect: ResearchDeskRect;
    const groupPaperRects: Record<string, ResearchDeskRect> = {};
    let rowCount = 0;
    let stackRect: ResearchDeskRect | null = null;
    let groupRect: ResearchDeskRect;

    if (group.expanded) {
      if (collapsedRunY !== null) {
        cursorY = Math.max(cursorY, collapsedRunBottom + RESEARCH_GROUP_GAP);
        collapsedRunY = null;
        nextCollapsedSlot = 0;
      }
      headingRect = headingBelowObstacles({
          height: RESEARCH_GROUP_HEADING_HEIGHT,
          width: layoutWidth,
          x: contentX,
          y: cursorY,
        }, occupied);
      occupied.push(headingRect);
      const contentY = rectBottom(headingRect) + RESEARCH_GROUP_HEADING_GAP;
      let nextSlot = 0;
      for (const paperId of group.paperIds) {
        if (normalizedManualRects[paperId]) continue;
        const placement = firstOpenGridRect({
          columnCount,
          contentX,
          contentY,
          occupied,
          startSlot: nextSlot,
        });
        groupPaperRects[paperId] = placement.rect;
        automaticPaperRects[paperId] = placement.rect;
        occupied.push(placement.rect);
        nextSlot = placement.slot + 1;
        rowCount = Math.max(rowCount, Math.floor(placement.slot / columnCount) + 1);
      }
      const contentBottom = rowCount
        ? contentY + rowCount * RESEARCH_PAPER_HEIGHT + (rowCount - 1) * RESEARCH_PAPER_ROW_GAP
        : rectBottom(headingRect);
      groupRect = {
        height: contentBottom - headingRect.y,
        width: layoutWidth,
        x: contentX,
        y: headingRect.y,
      };
      cursorY = rectBottom(groupRect) + RESEARCH_GROUP_GAP;
    } else if (manualStackRect) {
      headingRect = manualHeadingRects[group.key];
      stackRect = manualStackRect;
      rowCount = group.paperIds.length ? 1 : 0;
      groupRect = unionResearchDeskRects([headingRect, manualStackRect]);
    } else {
      if (collapsedRunY === null) {
        collapsedRunY = cursorY;
        collapsedRunBottom = cursorY;
        nextCollapsedSlot = 0;
      }
      const placement = firstOpenCollapsedGroup({
        columnCount,
        contentX,
        contentY: collapsedRunY,
        hasStack: group.paperIds.length > 0,
        occupied,
        startSlot: nextCollapsedSlot,
      });
      headingRect = placement.headingRect;
      stackRect = placement.stackRect;
      occupied.push(headingRect);
      if (stackRect) occupied.push(stackRect);
      nextCollapsedSlot = placement.slot + 1;
      rowCount = stackRect ? 1 : 0;
      groupRect = stackRect
        ? unionResearchDeskRects([headingRect, stackRect])
        : headingRect;
      collapsedRunBottom = Math.max(collapsedRunBottom, rectBottom(groupRect));
    }

    groupRects[group.key] = groupRect;
    headingRects[group.key] = headingRect;
    groupLayouts.push({
      ...group,
      automaticPaperRects: groupPaperRects,
      groupRect,
      headingRect,
      rowCount,
      stackRect,
    });
  }

  const bounds = unionResearchDeskRects([
    ...Object.values(groupRects),
    ...Object.values(headingRects),
    ...Object.values(automaticPaperRects),
    ...Object.values(normalizedManualRects),
    ...Object.values(activeManualStackRects),
    ...normalizedObstacles,
  ]);

  return {
    automaticPaperRects,
    bounds,
    columnCount,
    groupRects,
    groups: groupLayouts,
    headingRects,
    manualPaperRects: normalizedManualRects,
    manualStackRects: normalizedManualStackRects,
  };
}

export function fitResearchDeskCamera({
  bounds,
  maxScale = 1,
  minScale = RESEARCH_DESK_MIN_FIT_SCALE,
  padding = RESEARCH_DESK_FIT_PADDING,
  viewportHeight,
  viewportWidth,
}: ResearchDeskFitCameraInput): ResearchDeskCamera {
  const rect = normalizedRect(bounds);
  const safeViewportWidth = Math.max(1, finiteNumber(viewportWidth, 1));
  const safeViewportHeight = Math.max(1, finiteNumber(viewportHeight, 1));
  const safePadding = clamp(
    Math.max(0, finiteNumber(padding, RESEARCH_DESK_FIT_PADDING)),
    0,
    Math.max(0, Math.min(safeViewportWidth, safeViewportHeight) / 2 - 0.5),
  );
  const availableWidth = Math.max(1, safeViewportWidth - safePadding * 2);
  const availableHeight = Math.max(1, safeViewportHeight - safePadding * 2);
  const lowerScale = Math.max(0.0001, finiteNumber(minScale, RESEARCH_DESK_MIN_FIT_SCALE));
  const upperScale = Math.max(lowerScale, finiteNumber(maxScale, 1));
  const rawScale = rect.width > 0 && rect.height > 0
    ? Math.min(availableWidth / rect.width, availableHeight / rect.height)
    : upperScale;
  const scale = clamp(rawScale, lowerScale, upperScale);
  return {
    scale,
    x: (safeViewportWidth - rect.width * scale) / 2 - rect.x * scale,
    y: (safeViewportHeight - rect.height * scale) / 2 - rect.y * scale,
  };
}

export function researchDeskSemanticTier(projectedPaperWidth: number): ResearchDeskSemanticTier {
  const width = Math.max(0, finiteNumber(projectedPaperWidth));
  if (width < RESEARCH_SEMANTIC_WIDTHS.browse) return "overview";
  if (width < RESEARCH_SEMANTIC_WIDTHS.summary) return "browse";
  if (width < RESEARCH_SEMANTIC_WIDTHS.read) return "summary";
  return "read";
}

export function researchDeskSemanticTierForScale(
  scale: number,
  paperWidth = RESEARCH_PAPER_WIDTH,
) {
  return researchDeskSemanticTier(Math.max(0, finiteNumber(scale)) * Math.max(0, finiteNumber(paperWidth)));
}

/**
 * Compatibility helper for the current rendered-grid workspace. New world layouts should
 * fit and pan from `ResearchDeskWorldLayout.bounds` instead of viewport-relative clamps.
 */
export function researchDeskCameraBounds({
  contentHeight,
  contentLeft = 0,
  contentTop = 0,
  contentWidth,
  overscan = 64,
  scale,
  viewportHeight,
  viewportWidth,
}: ResearchDeskCameraBoundsInput) {
  const safeScale = Math.max(0.01, scale);
  const safeOverscan = Math.max(0, overscan);
  const scaledWidth = Math.max(0, contentWidth) * safeScale;
  const scaledHeight = Math.max(0, contentHeight) * safeScale;
  return {
    maxX: contentLeft < 0 ? -contentLeft * safeScale + safeOverscan : 0,
    maxY: contentTop < 0 ? -contentTop * safeScale + safeOverscan : 0,
    minX: Math.min(0, viewportWidth - scaledWidth - safeOverscan),
    minY: Math.min(0, viewportHeight - scaledHeight - safeOverscan),
  };
}
