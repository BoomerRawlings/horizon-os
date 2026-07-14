import {
  researchWorldRectUnion,
  type ResearchWorldRect,
} from "./researchInfiniteCamera";
import {
  RESEARCH_BOARD_PAPER_HEIGHT,
  RESEARCH_BOARD_PAPER_WIDTH,
  type ResearchBoardState,
} from "./researchBoardState";

export const RESEARCH_BOARD_HEADER_HEIGHT = 50;
export const RESEARCH_BOARD_PAPER_GAP = 32;
export const RESEARCH_BOARD_GROUP_CLEARANCE = 54;

export type ResearchBoardLayoutPaper = { id: string };
export type ResearchBoardLayoutStack<TPaper extends ResearchBoardLayoutPaper = ResearchBoardLayoutPaper> = {
  key: string;
  label: string;
  papers: readonly TPaper[];
};

export type ResearchBoardGroupLayout = {
  bodyRect: ResearchWorldRect;
  expanded: boolean;
  headerRect: ResearchWorldRect;
  key: string;
  paperIds: string[];
  rect: ResearchWorldRect;
};

function intersectsWithClearance(a: ResearchWorldRect, b: ResearchWorldRect, gap: number) {
  return a.x < b.x + b.width + gap
    && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap
    && a.y + a.height + gap > b.y;
}

export function planResearchBoardLayout<TPaper extends ResearchBoardLayoutPaper>(
  stacks: readonly ResearchBoardLayoutStack<TPaper>[],
  state: ResearchBoardState,
  obstacles: readonly ResearchWorldRect[] = [],
) {
  const expandedKeys = new Set(state.expandedStackKeys);
  const looseIds = new Set(state.loosePaperIds);
  const groups: ResearchBoardGroupLayout[] = [];
  const paperRects: Record<string, ResearchWorldRect> = {};
  const placed: ResearchWorldRect[] = [];

  for (const stack of stacks) {
    const anchor = state.stackRects[stack.key];
    if (!anchor) continue;
    const papers = stack.papers.filter((paper) => !looseIds.has(paper.id));
    const isExpanded = expandedKeys.has(stack.key);
    const columns = isExpanded ? Math.min(4, Math.max(1, Math.ceil(Math.sqrt(papers.length)))) : 1;
    const rows = isExpanded ? Math.max(1, Math.ceil(papers.length / columns)) : 1;
    const bodyWidth = columns * RESEARCH_BOARD_PAPER_WIDTH + (columns - 1) * RESEARCH_BOARD_PAPER_GAP;
    const bodyHeight = rows * RESEARCH_BOARD_PAPER_HEIGHT + (rows - 1) * RESEARCH_BOARD_PAPER_GAP;
    const groupHeight = RESEARCH_BOARD_HEADER_HEIGHT + 16 + bodyHeight;
    let rect: ResearchWorldRect = {
      height: groupHeight,
      width: bodyWidth,
      x: anchor.x,
      y: anchor.y - RESEARCH_BOARD_HEADER_HEIGHT - 16,
    };

    // Expansion is a reversible visual reflow: later piles move only as far as needed,
    // then return to their saved anchors when the expanded footprint disappears.
    let guard = 0;
    while ([...placed, ...obstacles].some((candidate) => intersectsWithClearance(rect, candidate, RESEARCH_BOARD_GROUP_CLEARANCE)) && guard < 500) {
      const collisions = [...placed, ...obstacles].filter((candidate) => intersectsWithClearance(rect, candidate, RESEARCH_BOARD_GROUP_CLEARANCE));
      rect = {
        ...rect,
        y: Math.max(...collisions.map((candidate) => candidate.y + candidate.height + RESEARCH_BOARD_GROUP_CLEARANCE)),
      };
      guard += 1;
    }

    const headerRect = {
      height: RESEARCH_BOARD_HEADER_HEIGHT,
      width: bodyWidth,
      x: rect.x,
      y: rect.y,
    };
    const bodyRect = {
      height: bodyHeight,
      width: bodyWidth,
      x: rect.x,
      y: rect.y + RESEARCH_BOARD_HEADER_HEIGHT + 16,
    };
    if (isExpanded) {
      papers.forEach((paper, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        paperRects[paper.id] = {
          height: RESEARCH_BOARD_PAPER_HEIGHT,
          width: RESEARCH_BOARD_PAPER_WIDTH,
          x: bodyRect.x + column * (RESEARCH_BOARD_PAPER_WIDTH + RESEARCH_BOARD_PAPER_GAP),
          y: bodyRect.y + row * (RESEARCH_BOARD_PAPER_HEIGHT + RESEARCH_BOARD_PAPER_GAP),
        };
      });
    }
    groups.push({
      bodyRect,
      expanded: isExpanded,
      headerRect,
      key: stack.key,
      paperIds: papers.map((paper) => paper.id),
      rect,
    });
    placed.push(rect);
  }

  const looseRects = state.loosePaperIds.map((id) => state.paperRects[id]).filter(Boolean);
  return {
    bounds: researchWorldRectUnion([
      ...groups.map((group) => group.rect),
      ...looseRects,
      ...Object.values(state.stickyRects),
    ], 90),
    groups,
    paperRects,
  };
}
