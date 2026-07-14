import {
  normalizeResearchInfiniteCamera,
  type ResearchInfiniteCamera,
  type ResearchWorldPoint,
  type ResearchWorldRect,
} from "./researchInfiniteCamera";

export const RESEARCH_BOARD_STATE_VERSION = 4;
export const RESEARCH_BOARD_PAPER_WIDTH = 268;
export const RESEARCH_BOARD_PAPER_HEIGHT = 360;
export const RESEARCH_BOARD_STACK_GAP_X = 92;
export const RESEARCH_BOARD_STACK_GAP_Y = 118;

export type ResearchBoardObjectKind = "paper" | "stack" | "sticky";

export type ResearchRelationshipEndpoint = {
  id: string;
  kind: ResearchBoardObjectKind;
};

export type ResearchBoardRelationship = {
  a: ResearchRelationshipEndpoint;
  b: ResearchRelationshipEndpoint;
  id: string;
  label: string;
  labelOffset: ResearchWorldPoint;
};

export type ResearchBoardState = {
  camera: ResearchInfiniteCamera;
  expandedStackKeys: string[];
  focusHistory: ResearchInfiniteCamera[];
  loosePaperIds: string[];
  paperRects: Record<string, ResearchWorldRect>;
  relationships: ResearchBoardRelationship[];
  stackRects: Record<string, ResearchWorldRect>;
  stickyRects: Record<string, ResearchWorldRect>;
  version: number;
  zOrder: Record<string, number>;
};

export type ResearchBoardHistory = {
  future: ResearchBoardState[];
  past: ResearchBoardState[];
  present: ResearchBoardState;
};

export type ResearchBoardSeedStack = {
  key: string;
  paperCount?: number;
  paperIds?: readonly string[];
};

function finite(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeResearchBoardRect(value: unknown, fallback?: ResearchWorldRect): ResearchWorldRect | null {
  if (!value || typeof value !== "object") return fallback || null;
  const candidate = value as Partial<ResearchWorldRect>;
  const width = finite(candidate.width, fallback?.width || 0);
  const height = finite(candidate.height, fallback?.height || 0);
  if (width <= 0 || height <= 0) return fallback || null;
  return {
    height,
    width,
    x: finite(candidate.x, fallback?.x || 0),
    y: finite(candidate.y, fallback?.y || 0),
  };
}

function normalizeRectRecord(value: unknown) {
  const result: Record<string, ResearchWorldRect> = {};
  if (!value || typeof value !== "object") return result;
  for (const [key, candidate] of Object.entries(value)) {
    const rect = normalizeResearchBoardRect(candidate);
    if (rect) result[key] = rect;
  }
  return result;
}

function strings(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())))]
    : [];
}

function zRecord(value: unknown) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).map(([key, z]) => [key, Math.max(0, finite(z))]));
}

export function createEmptyResearchBoardState(): ResearchBoardState {
  return {
    camera: { scale: 1, x: 0, y: 0 },
    expandedStackKeys: [],
    focusHistory: [],
    loosePaperIds: [],
    paperRects: {},
    relationships: [],
    stackRects: {},
    stickyRects: {},
    version: RESEARCH_BOARD_STATE_VERSION,
    zOrder: {},
  };
}

function normalizeEndpoint(value: unknown): ResearchRelationshipEndpoint | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<ResearchRelationshipEndpoint>;
  if (!source.id || !["paper", "stack", "sticky"].includes(String(source.kind))) return null;
  return { id: String(source.id), kind: source.kind as ResearchBoardObjectKind };
}

function normalizeRelationship(value: unknown): ResearchBoardRelationship | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<ResearchBoardRelationship>;
  const a = normalizeEndpoint(source.a);
  const b = normalizeEndpoint(source.b);
  if (!a || !b || !source.id || (a.kind === b.kind && a.id === b.id)) return null;
  return {
    a,
    b,
    id: String(source.id),
    label: String(source.label || "").slice(0, 240),
    labelOffset: {
      x: finite(source.labelOffset?.x),
      y: finite(source.labelOffset?.y),
    },
  };
}

function normalizeRelationships(value: unknown) {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, ResearchBoardRelationship>();
  for (const candidate of value) {
    const relationship = normalizeRelationship(candidate);
    if (relationship) unique.set(relationship.id, relationship);
  }
  return [...unique.values()];
}

export function normalizeResearchBoardState(value: unknown): ResearchBoardState {
  const source = value && typeof value === "object" ? value as Partial<ResearchBoardState> : {};
  return {
    camera: normalizeResearchInfiniteCamera(source.camera),
    expandedStackKeys: strings(source.expandedStackKeys),
    focusHistory: Array.isArray(source.focusHistory)
      ? source.focusHistory.slice(-12).map((camera) => normalizeResearchInfiniteCamera(camera))
      : [],
    loosePaperIds: strings(source.loosePaperIds),
    paperRects: normalizeRectRecord(source.paperRects),
    relationships: normalizeRelationships(source.relationships),
    stackRects: normalizeRectRecord(source.stackRects),
    stickyRects: normalizeRectRecord(source.stickyRects),
    version: RESEARCH_BOARD_STATE_VERSION,
    zOrder: zRecord(source.zOrder),
  };
}

/** Migrate the v0.3 world layout without allowing its generated sort geometry into Explore. */
export function migrateLegacyResearchBoardState(value: unknown): ResearchBoardState {
  if (!value || typeof value !== "object") return createEmptyResearchBoardState();
  const source = value as Record<string, unknown>;
  if (source.version === RESEARCH_BOARD_STATE_VERSION) return normalizeResearchBoardState(source);
  const paperRects = normalizeRectRecord(source.manualPaperRects || source.paperRects);
  return normalizeResearchBoardState({
    camera: source.camera,
    expandedStackKeys: source.expandedPileKeys,
    loosePaperIds: Object.keys(paperRects),
    paperRects,
    relationships: source.relationships,
    stackRects: source.manualPileRects || source.stackRects,
    stickyRects: source.stickyRects,
    zOrder: source.zOrder,
  });
}

export function seedResearchBoardStackRects(
  stacks: readonly ResearchBoardSeedStack[],
  columns = 4,
  origin = { x: 0, y: 0 },
) {
  const safeColumns = Math.max(1, Math.floor(finite(columns, 4)));
  return Object.fromEntries(stacks.map((stack, index) => {
    const column = index % safeColumns;
    const row = Math.floor(index / safeColumns);
    const depth = Math.min(5, Math.max(1, finite(stack.paperCount, 1)));
    return [stack.key, {
      height: RESEARCH_BOARD_PAPER_HEIGHT,
      width: RESEARCH_BOARD_PAPER_WIDTH,
      x: finite(origin.x) + column * (RESEARCH_BOARD_PAPER_WIDTH + RESEARCH_BOARD_STACK_GAP_X) + depth * 1.5,
      y: finite(origin.y) + row * (RESEARCH_BOARD_PAPER_HEIGHT + RESEARCH_BOARD_STACK_GAP_Y) + depth * 1.5,
    } satisfies ResearchWorldRect];
  }));
}

export function ensureResearchBoardObjects(
  state: ResearchBoardState,
  stacks: readonly ResearchBoardSeedStack[],
  stickyIds: readonly string[],
  columns = 4,
) {
  const next = normalizeResearchBoardState(state);
  const validStackKeys = new Set(stacks.map((stack) => stack.key));
  const validPaperIds = new Set(stacks.flatMap((stack) => Array.isArray(stack.paperIds) ? stack.paperIds : []));
  const validStickyIds = new Set(stickyIds);
  const seeded = seedResearchBoardStackRects(stacks, columns);
  next.stackRects = Object.fromEntries(stacks.map((stack) => [
    stack.key,
    next.stackRects[stack.key] || seeded[stack.key],
  ]));
  const retainedStickies = Object.fromEntries(Object.entries(next.stickyRects).filter(([id]) => validStickyIds.has(id)));
  const stackBounds = Object.values(next.stackRects);
  const stickyOriginX = stackBounds.length
    ? Math.max(...stackBounds.map((rect) => rect.x + rect.width)) + RESEARCH_BOARD_STACK_GAP_X
    : RESEARCH_BOARD_PAPER_WIDTH + RESEARCH_BOARD_STACK_GAP_X;
  next.stickyRects = Object.fromEntries(stickyIds.map((id, index) => [
    id,
    retainedStickies[id] || {
      height: 210,
      width: 230,
      x: stickyOriginX + (index % 3) * 258,
      y: Math.floor(index / 3) * 244,
    },
  ]));
  next.expandedStackKeys = next.expandedStackKeys.filter((key) => validStackKeys.has(key));
  if (validPaperIds.size) {
    next.loosePaperIds = next.loosePaperIds.filter((id) => validPaperIds.has(id));
    next.paperRects = Object.fromEntries(Object.entries(next.paperRects).filter(([id]) => validPaperIds.has(id)));
  }
  const endpointIsValid = (endpoint: ResearchRelationshipEndpoint) => endpoint.kind === "stack"
    ? validStackKeys.has(endpoint.id)
    : endpoint.kind === "sticky"
      ? validStickyIds.has(endpoint.id)
      : !validPaperIds.size || validPaperIds.has(endpoint.id);
  next.relationships = next.relationships.filter((relationship) => endpointIsValid(relationship.a) && endpointIsValid(relationship.b));
  next.zOrder = Object.fromEntries(Object.entries(next.zOrder).filter(([key]) => {
    if (key.startsWith("stack:")) return validStackKeys.has(key.slice("stack:".length));
    if (key.startsWith("sticky:")) return validStickyIds.has(key.slice("sticky:".length));
    if (key.startsWith("paper:")) return !validPaperIds.size || validPaperIds.has(key.slice("paper:".length));
    return false;
  }));
  return next;
}

export function createResearchBoardRelationship(
  state: ResearchBoardState,
  relationship: Omit<ResearchBoardRelationship, "id" | "labelOffset"> & {
    id?: string;
    labelOffset?: ResearchWorldPoint;
  },
) {
  const next = normalizeResearchBoardState(state);
  const a = normalizeEndpoint(relationship.a);
  const b = normalizeEndpoint(relationship.b);
  if (!a || !b || (a.kind === b.kind && a.id === b.id)) return next;
  const endpoints = [`${a.kind}:${a.id}`, `${b.kind}:${b.id}`].sort();
  const id = relationship.id || `relationship:${endpoints.join("::")}`;
  const candidate = normalizeRelationship({ ...relationship, a, b, id });
  if (!candidate) return next;
  next.relationships = [...next.relationships.filter((item) => item.id !== id), candidate];
  return next;
}

export function updateResearchBoardRelationship(
  state: ResearchBoardState,
  id: string,
  updates: Partial<Pick<ResearchBoardRelationship, "a" | "b" | "label" | "labelOffset">>,
) {
  const next = normalizeResearchBoardState(state);
  next.relationships = next.relationships.map((relationship) => {
    if (relationship.id !== id) return relationship;
    return normalizeRelationship({ ...relationship, ...updates }) || relationship;
  });
  return next;
}

export function removeResearchBoardRelationship(state: ResearchBoardState, id: string) {
  const next = normalizeResearchBoardState(state);
  next.relationships = next.relationships.filter((relationship) => relationship.id !== id);
  return next;
}

function objectKey(kind: ResearchBoardObjectKind, id: string) {
  return `${kind}:${id}`;
}

export function moveResearchBoardObject(
  state: ResearchBoardState,
  kind: ResearchBoardObjectKind,
  id: string,
  rect: ResearchWorldRect,
) {
  const next = normalizeResearchBoardState(state);
  const normalized = normalizeResearchBoardRect(rect);
  if (!normalized) return next;
  if (kind === "paper") {
    next.paperRects[id] = normalized;
    if (!next.loosePaperIds.includes(id)) next.loosePaperIds.push(id);
  } else if (kind === "stack") {
    next.stackRects[id] = normalized;
  } else {
    next.stickyRects[id] = normalized;
  }
  const key = objectKey(kind, id);
  const top = Math.max(0, ...Object.values(next.zOrder));
  next.zOrder[key] = top + 1;
  return next;
}

export function toggleResearchBoardStack(state: ResearchBoardState, key: string) {
  const next = normalizeResearchBoardState(state);
  next.expandedStackKeys = next.expandedStackKeys.includes(key)
    ? next.expandedStackKeys.filter((candidate) => candidate !== key)
    : [...next.expandedStackKeys, key];
  return next;
}

export function restackResearchBoardPaper(state: ResearchBoardState, paperId: string) {
  const next = normalizeResearchBoardState(state);
  next.loosePaperIds = next.loosePaperIds.filter((id) => id !== paperId);
  delete next.paperRects[paperId];
  delete next.zOrder[objectKey("paper", paperId)];
  return next;
}

export function pushResearchBoardFocus(state: ResearchBoardState, camera: ResearchInfiniteCamera) {
  const next = normalizeResearchBoardState(state);
  const previous = normalizeResearchInfiniteCamera(camera);
  const last = next.focusHistory.at(-1);
  if (!last || Math.abs(last.scale - previous.scale) > 0.000001 || Math.abs(last.x - previous.x) > 0.5 || Math.abs(last.y - previous.y) > 0.5) {
    next.focusHistory = [...next.focusHistory.slice(-11), previous];
  }
  return next;
}

export function popResearchBoardFocus(state: ResearchBoardState) {
  const next = normalizeResearchBoardState(state);
  const camera = next.focusHistory.at(-1) || null;
  next.focusHistory = next.focusHistory.slice(0, -1);
  return { camera, state: next };
}

export function researchBoardGeometrySnapshot(state: ResearchBoardState) {
  const next = normalizeResearchBoardState(state);
  return JSON.stringify({
    expandedStackKeys: [...next.expandedStackKeys].sort(),
    loosePaperIds: [...next.loosePaperIds].sort(),
    paperRects: Object.fromEntries(Object.entries(next.paperRects).sort(([a], [b]) => a.localeCompare(b))),
    relationships: [...next.relationships]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((relationship) => ({
        ...relationship,
        a: { ...relationship.a },
        b: { ...relationship.b },
        labelOffset: { ...relationship.labelOffset },
      })),
    stackRects: Object.fromEntries(Object.entries(next.stackRects).sort(([a], [b]) => a.localeCompare(b))),
    stickyRects: Object.fromEntries(Object.entries(next.stickyRects).sort(([a], [b]) => a.localeCompare(b))),
    zOrder: Object.fromEntries(Object.entries(next.zOrder).sort(([a], [b]) => a.localeCompare(b))),
  });
}

export function createResearchBoardHistory(initial: ResearchBoardState): ResearchBoardHistory {
  return { future: [], past: [], present: normalizeResearchBoardState(initial) };
}

export function commitResearchBoardHistory(history: ResearchBoardHistory, next: ResearchBoardState): ResearchBoardHistory {
  const normalized = normalizeResearchBoardState(next);
  if (researchBoardGeometrySnapshot(history.present) === researchBoardGeometrySnapshot(normalized)
    && JSON.stringify(history.present.camera) === JSON.stringify(normalized.camera)) return history;
  return {
    future: [],
    past: [...history.past.slice(-39), history.present],
    present: normalized,
  };
}

export function undoResearchBoardHistory(history: ResearchBoardHistory): ResearchBoardHistory {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {
    future: [history.present, ...history.future.slice(0, 39)],
    past: history.past.slice(0, -1),
    present: previous,
  };
}

export function redoResearchBoardHistory(history: ResearchBoardHistory): ResearchBoardHistory {
  const next = history.future[0];
  if (!next) return history;
  return {
    future: history.future.slice(1),
    past: [...history.past.slice(-39), history.present],
    present: next,
  };
}
