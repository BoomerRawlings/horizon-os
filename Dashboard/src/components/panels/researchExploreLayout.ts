import {
  researchWorldRectUnion,
  type ResearchWorldRect,
} from "./researchInfiniteCamera";

export const RESEARCH_EXPLORE_PAPER_WIDTH = 268;
export const RESEARCH_EXPLORE_PAPER_HEIGHT = 360;
export const RESEARCH_EXPLORE_GAP = 34;
export const RESEARCH_EXPLORE_HEADER_HEIGHT = 52;
export const RESEARCH_EXPLORE_GROUP_GAP = 86;

export type ResearchExplorePaperLike = { id: string };

export type ResearchExploreStackLike<TPaper extends ResearchExplorePaperLike = ResearchExplorePaperLike> = {
  key: string;
  label: string;
  papers: readonly TPaper[];
};

export type ResearchExploreGroupLayout = {
  bodyRect: ResearchWorldRect;
  expanded: boolean;
  headerRect: ResearchWorldRect;
  key: string;
  label: string;
  paperIds: string[];
  rect: ResearchWorldRect;
};

export type ResearchExploreLayout = {
  bounds: ResearchWorldRect;
  groups: ResearchExploreGroupLayout[];
  paperRects: Record<string, ResearchWorldRect>;
};

export function planResearchExploreLayout<TPaper extends ResearchExplorePaperLike>(
  stacks: readonly ResearchExploreStackLike<TPaper>[],
  expandedStackKeys: readonly string[],
  options: { maxColumns?: number; maxWorldWidth?: number; originX?: number; originY?: number } = {},
): ResearchExploreLayout {
  const expanded = new Set(expandedStackKeys);
  const maxColumns = Math.max(1, Math.floor(options.maxColumns || 5));
  const maxWorldWidth = Math.max(RESEARCH_EXPLORE_PAPER_WIDTH, options.maxWorldWidth || 1_760);
  const originX = Number.isFinite(options.originX) ? Number(options.originX) : 0;
  const originY = Number.isFinite(options.originY) ? Number(options.originY) : 0;
  const groups: ResearchExploreGroupLayout[] = [];
  const paperRects: Record<string, ResearchWorldRect> = {};
  let cursorX = originX;
  let cursorY = originY;
  let rowHeight = 0;

  for (const stack of stacks) {
    const isExpanded = expanded.has(stack.key);
    const columns = isExpanded
      ? Math.min(maxColumns, Math.max(1, Math.ceil(Math.sqrt(stack.papers.length))))
      : 1;
    const rows = isExpanded ? Math.max(1, Math.ceil(stack.papers.length / columns)) : 1;
    const bodyWidth = columns * RESEARCH_EXPLORE_PAPER_WIDTH + (columns - 1) * RESEARCH_EXPLORE_GAP;
    const bodyHeight = rows * RESEARCH_EXPLORE_PAPER_HEIGHT + (rows - 1) * RESEARCH_EXPLORE_GAP;
    const width = bodyWidth;
    const height = RESEARCH_EXPLORE_HEADER_HEIGHT + 18 + bodyHeight;

    if (cursorX > originX && cursorX + width > originX + maxWorldWidth) {
      cursorX = originX;
      cursorY += rowHeight + RESEARCH_EXPLORE_GROUP_GAP;
      rowHeight = 0;
    }

    const headerRect = {
      height: RESEARCH_EXPLORE_HEADER_HEIGHT,
      width,
      x: cursorX,
      y: cursorY,
    };
    const bodyRect = {
      height: bodyHeight,
      width: bodyWidth,
      x: cursorX,
      y: cursorY + RESEARCH_EXPLORE_HEADER_HEIGHT + 18,
    };
    const rect = { height, width, x: cursorX, y: cursorY };
    const paperIds = stack.papers.map((paper) => paper.id);
    if (isExpanded) {
      stack.papers.forEach((paper, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        paperRects[paper.id] = {
          height: RESEARCH_EXPLORE_PAPER_HEIGHT,
          width: RESEARCH_EXPLORE_PAPER_WIDTH,
          x: bodyRect.x + column * (RESEARCH_EXPLORE_PAPER_WIDTH + RESEARCH_EXPLORE_GAP),
          y: bodyRect.y + row * (RESEARCH_EXPLORE_PAPER_HEIGHT + RESEARCH_EXPLORE_GAP),
        };
      });
    }
    groups.push({ bodyRect, expanded: isExpanded, headerRect, key: stack.key, label: stack.label, paperIds, rect });
    cursorX += width + RESEARCH_EXPLORE_GROUP_GAP;
    rowHeight = Math.max(rowHeight, height);
  }

  return {
    bounds: researchWorldRectUnion(groups.map((group) => group.rect), 80),
    groups,
    paperRects,
  };
}

export function researchStackPeekRects(
  stackRect: ResearchWorldRect,
  paperIds: readonly string[],
  options: { count?: number; hoveredIndex?: number } = {},
) {
  const count = Math.min(Math.max(0, Math.floor(options.count || 7)), paperIds.length);
  const hoveredIndex = Math.min(Math.max(0, Math.floor(options.hoveredIndex || 0)), Math.max(0, count - 1));
  const visibleIds = paperIds.slice(0, count);
  return Object.fromEntries(visibleIds.map((id, index) => {
    const distance = index - hoveredIndex;
    return [id, {
      height: stackRect.height,
      width: stackRect.width,
      x: stackRect.x + distance * 20,
      y: stackRect.y - index * 58,
    } satisfies ResearchWorldRect];
  }));
}
