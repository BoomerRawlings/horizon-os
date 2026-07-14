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

export function screenBoundsToResearchWorld(
  bounds: ResearchDeskScreenBounds,
  camera: ResearchDeskCamera,
): ResearchDeskScreenBounds {
  return {
    bottom: (bounds.bottom - camera.y) / camera.scale,
    left: (bounds.left - camera.x) / camera.scale,
    right: (bounds.right - camera.x) / camera.scale,
    top: (bounds.top - camera.y) / camera.scale,
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
