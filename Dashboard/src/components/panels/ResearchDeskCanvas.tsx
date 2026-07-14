import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Focus,
  Layers3,
  Link2,
  Minus,
  Move,
  Plus,
  StickyNote,
} from "lucide-react";
import {
  RESEARCH_PAPER_HEIGHT,
  RESEARCH_PAPER_WIDTH,
  nearestOpenResearchPaperRect,
  planResearchDeskWorldLayout,
  researchDeskSemanticTierForScale,
  unionResearchDeskRects,
  type ResearchDeskGroupWorldLayout,
  type ResearchDeskRect,
} from "./researchDeskLayout";
import {
  RESEARCH_DESK_MAX_INTERACTION_SCALE,
  RESEARCH_DESK_MIN_INTERACTION_SCALE,
  fitResearchDeskWorld,
  panResearchDeskCamera,
  panResearchDeskCameraFromWheel,
  researchDeskCameraAt100Percent,
  researchDeskScreenToWorld,
  zoomResearchDeskCameraAtPoint,
  zoomResearchDeskCameraBy,
  zoomResearchDeskCameraToRect,
  type ResearchDeskCamera,
  type ResearchDeskViewport,
} from "./researchDeskCamera";

const DEFAULT_LAYOUT_STORAGE_KEY = "horizon.research-desk-world.v2";
const DEFAULT_CAMERA_STORAGE_KEY = "horizon.research-desk-camera-world.v2";
const STICKY_WIDTH = 220;
const STICKY_HEIGHT = 180;
const ITEM_CLEARANCE = 16;

export type ResearchDeskCanvasPaper = {
  abstract?: string;
  abstractLabel?: string;
  authorLabel?: string;
  authors?: readonly string[];
  citation?: string;
  datePublished?: string;
  dogEared?: boolean;
  doi?: string;
  id: string;
  metadataComplete?: boolean;
  path?: string;
  primarySubject?: string;
  readingStatus?: string;
  source?: string;
  subjects?: readonly string[];
  summary?: string;
  summaryPreview?: string;
  title: string;
  year?: string;
  zoteroKey?: string;
};

export type ResearchDeskCanvasIdea = {
  body?: string;
  connectedPaperRefs?: readonly string[];
  id: string;
  path?: string;
  preview?: string;
  topic: string;
};

export type ResearchDeskCanvasStack<TPaper extends ResearchDeskCanvasPaper = ResearchDeskCanvasPaper> = {
  key: string;
  label: string;
  papers: readonly TPaper[];
};

export type ResearchDeskCanvasSelection =
  | { kind: "idea" | "paper"; path: string }
  | null;

export type ResearchDeskCanvasPaperConnection = {
  a: string;
  b: string;
};

export type ResearchDeskCanvasStickyDraft = {
  text: string;
  x: number;
  y: number;
};

export type ResearchDeskCanvasLayoutSnapshot = {
  expandedPileKeys: readonly string[];
  manualPaperRects: Readonly<Record<string, ResearchDeskRect>>;
  manualPileRects: Readonly<Record<string, ResearchDeskRect>>;
  stickyRects: Readonly<Record<string, ResearchDeskRect>>;
};

export type ResearchDeskCanvasProps<
  TPaper extends ResearchDeskCanvasPaper = ResearchDeskCanvasPaper,
  TIdea extends ResearchDeskCanvasIdea = ResearchDeskCanvasIdea,
> = {
  ariaLabel?: string;
  className?: string;
  ideas: readonly TIdea[];
  initialExpandedPileKeys?: readonly string[];
  loading?: boolean;
  matchingPaperIds?: ReadonlySet<string> | readonly string[];
  onActionError?: (message: string, error: unknown) => void;
  onAttachIdeaToPaper?: (idea: TIdea, paper: TPaper) => Promise<void> | void;
  onCameraChange?: (camera: ResearchDeskCamera) => void;
  onConnectPapers?: (
    source: TPaper,
    target: TPaper,
  ) => Promise<"connected" | "disconnected" | void> | "connected" | "disconnected" | void;
  onCreateSticky?: (draft: ResearchDeskCanvasStickyDraft) => Promise<TIdea | null | void>;
  onExpandedPileKeysChange?: (keys: readonly string[]) => void;
  onLayoutChange?: (layout: ResearchDeskCanvasLayoutSnapshot) => void;
  onOpenIdeaDetails?: (idea: TIdea) => void;
  onOpenPaperDetails?: (paper: TPaper) => void;
  onSelectionChange?: (selection: ResearchDeskCanvasSelection) => void;
  paperConnections?: readonly ResearchDeskCanvasPaperConnection[];
  persistenceScope?: string;
  selection?: ResearchDeskCanvasSelection;
  stacks: readonly ResearchDeskCanvasStack<TPaper>[];
};

type PersistedLayout = {
  expandedPileKeys: string[];
  manualPaperRects: Record<string, ResearchDeskRect>;
  manualPileRects: Record<string, ResearchDeskRect>;
  stickyRects: Record<string, ResearchDeskRect>;
};

type ItemDrag = {
  captureTarget: HTMLElement;
  id: string;
  kind: "paper" | "pile" | "sticky";
  moved: boolean;
  origin: ResearchDeskRect;
  pointerId: number;
  scale: number;
  startClientX: number;
  startClientY: number;
};

type PanDrag = {
  captureTarget: HTMLElement;
  origin: ResearchDeskCamera;
  pointerId: number;
  startClientX: number;
  startClientY: number;
};

type ConnectionSource = {
  id: string;
  kind: "paper" | "sticky";
};

type ConnectionDrag = ConnectionSource & {
  captureTarget: HTMLElement;
  current: { x: number; y: number };
  pointerId: number;
  start: { x: number; y: number };
};

type TransientRect = {
  id: string;
  kind: ItemDrag["kind"];
  rect: ResearchDeskRect;
};

type RelationshipLine = {
  active: boolean;
  id: string;
  kind: "paper" | "sticky";
  source: { x: number; y: number };
  target: { x: number; y: number };
};

type PendingPileFocus = {
  expanded: boolean;
  key: string;
};

const EMPTY_LAYOUT: PersistedLayout = {
  expandedPileKeys: [],
  manualPaperRects: {},
  manualPileRects: {},
  stickyRects: {},
};

function finiteNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function validRect(value: unknown): ResearchDeskRect | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ResearchDeskRect>;
  const width = finiteNumber(candidate.width);
  const height = finiteNumber(candidate.height);
  if (width <= 0 || height <= 0) return null;
  return {
    height,
    width,
    x: finiteNumber(candidate.x),
    y: finiteNumber(candidate.y),
  };
}

function validRectRecord(value: unknown) {
  const result: Record<string, ResearchDeskRect> = {};
  if (!value || typeof value !== "object") return result;
  for (const [key, candidate] of Object.entries(value)) {
    const rect = validRect(candidate);
    if (rect) result[key] = rect;
  }
  return result;
}

function knownRectRecord(
  value: Readonly<Record<string, ResearchDeskRect>>,
  knownKeys: ReadonlySet<string>,
) {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => knownKeys.has(key)),
  ) as Record<string, ResearchDeskRect>;
}

function scopedStorageKey(base: string, scope?: string) {
  const suffix = String(scope || "").trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
  return suffix ? `${base}.${suffix}` : base;
}

function readLayout(storageKey: string, initialExpandedPileKeys: readonly string[]) {
  if (typeof window === "undefined") {
    return { ...EMPTY_LAYOUT, expandedPileKeys: [...initialExpandedPileKeys] };
  }
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return { ...EMPTY_LAYOUT, expandedPileKeys: [...initialExpandedPileKeys] };
    const value = JSON.parse(raw) as Partial<PersistedLayout>;
    return {
      expandedPileKeys: Array.isArray(value.expandedPileKeys)
        ? value.expandedPileKeys.filter((key): key is string => typeof key === "string")
        : [...initialExpandedPileKeys],
      manualPaperRects: validRectRecord(value.manualPaperRects),
      manualPileRects: validRectRecord(value.manualPileRects),
      stickyRects: validRectRecord(value.stickyRects),
    };
  } catch {
    return { ...EMPTY_LAYOUT, expandedPileKeys: [...initialExpandedPileKeys] };
  }
}

function readCamera(storageKey: string): ResearchDeskCamera | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ResearchDeskCamera>;
    const scale = finiteNumber(value.scale, 1);
    if (scale <= 0 || scale > RESEARCH_DESK_MAX_INTERACTION_SCALE) return null;
    return { scale, x: finiteNumber(value.x), y: finiteNumber(value.y) };
  } catch {
    return null;
  }
}

function ideaKey(idea: ResearchDeskCanvasIdea) {
  return idea.path || idea.id;
}

function normalizedDoi(value: string | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//, "")
    .replace(/^doi:\s*/, "");
}

function paperMatchesReference(paper: ResearchDeskCanvasPaper, rawReference: string) {
  const reference = String(rawReference || "").trim();
  if (!reference) return false;
  if (reference === paper.id || reference === `id:${paper.id}`) return true;
  if (paper.path) {
    const normalizedPath = paper.path.replace(/\\/g, "/");
    if (reference.replace(/\\/g, "/") === normalizedPath
      || reference.replace(/\\/g, "/") === `vault:${normalizedPath}`) return true;
  }
  if (paper.zoteroKey && (reference === paper.zoteroKey || reference === `zotero:${paper.zoteroKey}`)) return true;
  const doi = normalizedDoi(paper.doi);
  return Boolean(doi && doi !== "unknown" && normalizedDoi(reference) === doi);
}

function centerOf(rect: ResearchDeskRect) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function pileFocusRect(group: ResearchDeskGroupWorldLayout) {
  if (!group.expanded) {
    return unionResearchDeskRects([
      group.headingRect,
      ...(group.stackRect ? [group.stackRect] : []),
    ]);
  }

  const orderedPaperRects = Object.values(group.automaticPaperRects)
    .sort((first, second) => first.y - second.y || first.x - second.x);
  const firstPaperRect = orderedPaperRects[0];
  if (!firstPaperRect) return group.headingRect;

  const firstRow = orderedPaperRects.filter((rect) =>
    Math.abs(rect.y - firstPaperRect.y) < 0.5);
  return unionResearchDeskRects([group.headingRect, ...firstRow]);
}

function rightAnchor(rect: ResearchDeskRect) {
  return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
}

function readableText(value: string | undefined) {
  return String(value || "")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function excerpt(value: string, maximum: number) {
  if (value.length <= maximum) return value;
  const clipped = value.slice(0, Math.max(0, maximum - 1));
  const lastBreak = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, lastBreak > maximum * 0.7 ? lastBreak : clipped.length)}…`;
}

function connectionKey(first: string, second: string) {
  return [first, second].sort().join("::");
}

function linePath(source: { x: number; y: number }, target: { x: number; y: number }) {
  const bend = Math.max(48, Math.abs(target.x - source.x) * 0.42);
  const direction = target.x >= source.x ? 1 : -1;
  return `M ${source.x} ${source.y} C ${source.x + bend * direction} ${source.y}, ${target.x - bend * direction} ${target.y}, ${target.x} ${target.y}`;
}

function wheelPixels(value: number, mode: number, pageSize: number) {
  if (mode === 1) return value * 16;
  if (mode === 2) return value * Math.max(1, pageSize);
  return value;
}

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export function ResearchDeskCanvas<
  TPaper extends ResearchDeskCanvasPaper,
  TIdea extends ResearchDeskCanvasIdea,
>({
  ariaLabel = "Research desk canvas",
  className = "",
  ideas,
  initialExpandedPileKeys = [],
  loading = false,
  matchingPaperIds,
  onActionError,
  onAttachIdeaToPaper,
  onCameraChange,
  onConnectPapers,
  onCreateSticky,
  onExpandedPileKeysChange,
  onLayoutChange,
  onOpenIdeaDetails,
  onOpenPaperDetails,
  onSelectionChange,
  paperConnections = [],
  persistenceScope,
  selection,
  stacks,
}: ResearchDeskCanvasProps<TPaper, TIdea>) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const draftInputRef = useRef<HTMLTextAreaElement | null>(null);
  const panDragRef = useRef<PanDrag | null>(null);
  const itemDragRef = useRef<ItemDrag | null>(null);
  const connectionDragRef = useRef<ConnectionDrag | null>(null);
  const spaceHeldRef = useRef(false);
  const pointerInsideRef = useRef(false);
  const suppressClickRef = useRef<{ id: string; until: number } | null>(null);
  const suppressConnectionClickUntilRef = useRef(0);
  const previousViewportRef = useRef<{ columnCount: number; height: number; width: number } | null>(null);
  const initialFitPendingRef = useRef(false);
  const pendingPileFocusRef = useRef<PendingPileFocus | null>(null);
  const arrangementSignatureRef = useRef("");
  const arrangementFrameRef = useRef<number | null>(null);
  const arrangementTimerRef = useRef<number | null>(null);
  const hintId = useId();

  const layoutStorageKey = scopedStorageKey(DEFAULT_LAYOUT_STORAGE_KEY, persistenceScope);
  const cameraStorageKey = scopedStorageKey(DEFAULT_CAMERA_STORAGE_KEY, persistenceScope);
  const mountedLayoutStorageKeyRef = useRef(layoutStorageKey);
  const mountedCameraStorageKeyRef = useRef(cameraStorageKey);
  const initialCameraRef = useRef<ResearchDeskCamera | null | undefined>(undefined);
  if (initialCameraRef.current === undefined) initialCameraRef.current = readCamera(cameraStorageKey);

  const [layoutState, setLayoutState] = useState<PersistedLayout>(() =>
    readLayout(layoutStorageKey, initialExpandedPileKeys));
  const [camera, setCamera] = useState<ResearchDeskCamera>(() => {
    const restored = initialCameraRef.current;
    initialFitPendingRef.current = !restored;
    return restored || { scale: 1, x: 64, y: 64 };
  });
  const [cameraReady, setCameraReady] = useState(() => Boolean(initialCameraRef.current));
  const [viewport, setViewport] = useState<ResearchDeskViewport>({ height: 1, width: 1 });
  const [internalSelection, setInternalSelection] = useState<ResearchDeskCanvasSelection>(null);
  const [heldStickyId, setHeldStickyId] = useState<string | null>(null);
  const [optimisticIdeas, setOptimisticIdeas] = useState<TIdea[]>([]);
  const [transientRect, setTransientRect] = useState<TransientRect | null>(null);
  const [connectionPreview, setConnectionPreview] = useState<ConnectionDrag | null>(null);
  const [dropTargetPaperId, setDropTargetPaperId] = useState<string | null>(null);
  const [keyboardConnectionSource, setKeyboardConnectionSource] = useState<ConnectionSource | null>(null);
  const [pendingPaperConnections, setPendingPaperConnections] = useState<ResearchDeskCanvasPaperConnection[]>([]);
  const [pendingIdeaConnections, setPendingIdeaConnections] = useState<Record<string, string[]>>({});
  const [draftSticky, setDraftSticky] = useState<ResearchDeskCanvasStickyDraft | null>(null);
  const [savingSticky, setSavingSticky] = useState(false);
  const [busyConnection, setBusyConnection] = useState<string | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [matchCursor, setMatchCursor] = useState(0);
  const [arranging, setArranging] = useState(false);

  const activeSelection = selection === undefined ? internalSelection : selection;
  const matchingIds = useMemo(() => {
    if (matchingPaperIds === undefined) return null;
    return matchingPaperIds instanceof Set
      ? new Set(matchingPaperIds)
      : new Set(matchingPaperIds);
  }, [matchingPaperIds]);

  const allIdeas = useMemo(() => {
    const supplied = new Set(ideas.map(ideaKey));
    return [...ideas, ...optimisticIdeas.filter((idea) => !supplied.has(ideaKey(idea)))];
  }, [ideas, optimisticIdeas]);

  const paperById = useMemo(() => {
    const result = new Map<string, TPaper>();
    for (const stack of stacks) {
      for (const paper of stack.papers) result.set(paper.id, paper);
    }
    return result;
  }, [stacks]);

  const matchingPapers = useMemo(() => {
    if (matchingIds === null) return [];
    return stacks.flatMap((stack) => stack.papers).filter((paper) => matchingIds.has(paper.id));
  }, [matchingIds, stacks]);

  const arrangementSignature = useMemo(() => stacks
    .map((stack) => `${stack.key}:${stack.papers.map((paper) => paper.id).join(",")}`)
    .join("|"), [stacks]);

  const ideaById = useMemo(() => {
    const result = new Map<string, TIdea>();
    for (const idea of allIdeas) result.set(ideaKey(idea), idea);
    return result;
  }, [allIdeas]);

  const paperForReference = (reference: string) => {
    const exact = paperById.get(reference) || paperById.get(reference.startsWith("id:") ? reference.slice(3) : "");
    if (exact) return exact;
    for (const paper of paperById.values()) {
      if (paperMatchesReference(paper, reference)) return paper;
    }
    return undefined;
  };

  const stackByKey = useMemo(() => new Map(stacks.map((stack) => [stack.key, stack])), [stacks]);
  const activeManualPaperRects = useMemo(
    () => knownRectRecord(layoutState.manualPaperRects, new Set(paperById.keys())),
    [layoutState.manualPaperRects, paperById],
  );
  const activeManualPileRects = useMemo(
    () => knownRectRecord(layoutState.manualPileRects, new Set(stackByKey.keys())),
    [layoutState.manualPileRects, stackByKey],
  );
  const expandedPileKeys = useMemo(
    () => layoutState.expandedPileKeys.filter((key) => stackByKey.has(key)),
    [layoutState.expandedPileKeys, stackByKey],
  );
  const expandedSet = useMemo(() => new Set(expandedPileKeys), [expandedPileKeys]);

  const plannerGroups = useMemo(() => stacks.map((stack) => ({
    key: stack.key,
    paperIds: stack.papers
      .map((paper) => paper.id)
      .filter((paperId) => !activeManualPaperRects[paperId]),
  })), [activeManualPaperRects, stacks]);

  const basePlan = useMemo(() => planResearchDeskWorldLayout({
    expandedKeys: expandedPileKeys,
    groups: plannerGroups,
    manualPaperRects: activeManualPaperRects,
    manualStackRects: activeManualPileRects,
    viewportWidth: Math.max(880, viewport.width),
  }), [activeManualPaperRects, activeManualPileRects, expandedPileKeys, plannerGroups, viewport.width]);

  const effectiveStickyRects = useMemo(() => {
    const result = knownRectRecord(layoutState.stickyRects, new Set(allIdeas.map(ideaKey)));
    const occupied = [
      ...Object.values(basePlan.automaticPaperRects),
      ...Object.values(basePlan.manualPaperRects),
      ...basePlan.groups.flatMap((group) => group.stackRect ? [group.stackRect] : []),
      ...Object.values(basePlan.headingRects),
      ...Object.values(result),
    ];
    const right = basePlan.bounds.x + Math.max(basePlan.bounds.width, RESEARCH_PAPER_WIDTH);
    const top = basePlan.bounds.y;
    let missingIndex = 0;
    for (const idea of allIdeas) {
      const key = ideaKey(idea);
      if (result[key]) continue;
      const row = missingIndex % 5;
      const column = Math.floor(missingIndex / 5);
      const rect = nearestOpenResearchPaperRect({
        x: right + 72 + column * (STICKY_WIDTH + 40),
        y: top + row * (STICKY_HEIGHT + 32),
      }, occupied, {
        clearance: ITEM_CLEARANCE,
        columnStep: STICKY_WIDTH + 40,
        height: STICKY_HEIGHT,
        rowStep: STICKY_HEIGHT + 32,
        width: STICKY_WIDTH,
      });
      result[key] = rect;
      occupied.push(rect);
      missingIndex += 1;
    }
    return result;
  }, [allIdeas, basePlan, layoutState.stickyRects]);

  const worldPlan = useMemo(() => planResearchDeskWorldLayout({
    expandedKeys: expandedPileKeys,
    groups: plannerGroups,
    manualPaperRects: activeManualPaperRects,
    manualStackRects: activeManualPileRects,
    obstacles: Object.values(effectiveStickyRects),
    viewportWidth: Math.max(880, viewport.width),
  }), [activeManualPaperRects, activeManualPileRects, effectiveStickyRects, expandedPileKeys, plannerGroups, viewport.width]);

  const renderedAutomaticPaperRects = useMemo(() => {
    const result: Record<string, ResearchDeskRect> = { ...worldPlan.automaticPaperRects };
    if (transientRect?.kind === "paper") result[transientRect.id] = transientRect.rect;
    return result;
  }, [transientRect, worldPlan.automaticPaperRects]);

  const renderedManualPaperRects = useMemo(() => {
    const result: Record<string, ResearchDeskRect> = { ...activeManualPaperRects };
    if (transientRect?.kind === "paper") result[transientRect.id] = transientRect.rect;
    return result;
  }, [activeManualPaperRects, transientRect]);

  const renderedPileRects = useMemo(() => {
    const result: Record<string, ResearchDeskRect> = {};
    for (const group of worldPlan.groups) {
      if (group.stackRect) result[group.key] = group.stackRect;
    }
    if (transientRect?.kind === "pile") result[transientRect.id] = transientRect.rect;
    return result;
  }, [transientRect, worldPlan.groups]);

  const renderedStickyRects = useMemo(() => {
    const result = { ...effectiveStickyRects };
    if (transientRect?.kind === "sticky") result[transientRect.id] = transientRect.rect;
    return result;
  }, [effectiveStickyRects, transientRect]);

  const paperAnchorRects = useMemo(() => {
    const result: Record<string, ResearchDeskRect> = {
      ...renderedAutomaticPaperRects,
      ...renderedManualPaperRects,
    };
    for (const group of worldPlan.groups) {
      const stackRect = renderedPileRects[group.key];
      if (!stackRect || group.expanded) continue;
      const stack = stackByKey.get(group.key);
      for (const paper of stack?.papers || []) {
        if (!result[paper.id]) result[paper.id] = stackRect;
      }
    }
    return result;
  }, [renderedAutomaticPaperRects, renderedManualPaperRects, renderedPileRects, stackByKey, worldPlan.groups]);

  const worldBounds = useMemo(() => unionResearchDeskRects([
    worldPlan.bounds,
    ...Object.values(renderedStickyRects),
    ...(draftSticky ? [{ x: draftSticky.x, y: draftSticky.y, width: STICKY_WIDTH, height: STICKY_HEIGHT }] : []),
  ]), [draftSticky, renderedStickyRects, worldPlan.bounds]);

  const semanticTier = researchDeskSemanticTierForScale(camera.scale);

  useLayoutEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const update = () => {
      const rect = node.getBoundingClientRect();
      setViewport((current) => {
        const width = Math.max(1, rect.width);
        const height = Math.max(1, rect.height);
        return current.width === width && current.height === height ? current : { width, height };
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (loading || !initialFitPendingRef.current || viewport.width <= 1 || viewport.height <= 1) return;
    initialFitPendingRef.current = false;
    const fitted = fitResearchDeskWorld({ bounds: worldBounds, viewport });
    if (fitted.scale >= 0.22) {
      setCamera(fitted);
    } else {
      const scale = 0.22;
      setCamera({
        scale,
        x: (viewport.width - worldBounds.width * scale) / 2 - worldBounds.x * scale,
        y: 58 - worldBounds.y * scale,
      });
    }
    setCameraReady(true);
  }, [loading, viewport, worldBounds]);

  useLayoutEffect(() => {
    if (viewport.width <= 1 || viewport.height <= 1) return;
    const previous = previousViewportRef.current;
    previousViewportRef.current = {
      columnCount: worldPlan.columnCount,
      height: viewport.height,
      width: viewport.width,
    };
    if (!previous || !cameraReady || initialFitPendingRef.current) return;

    const widthChanged = Math.abs(previous.width - viewport.width) >= 1;
    const heightChanged = Math.abs(previous.height - viewport.height) >= 1;
    if (!widthChanged && !heightChanged) return;

    const selectedRect = activeSelection?.kind === "paper"
      ? paperAnchorRects[activeSelection.path]
      : activeSelection?.kind === "idea"
        ? renderedStickyRects[activeSelection.path]
        : undefined;
    if (selectedRect) {
      setCamera((current) => zoomResearchDeskCameraToRect({
        maxScale: current.scale,
        minScale: current.scale,
        padding: 0,
        rect: selectedRect,
        viewport,
      }));
      return;
    }

    if (previous.columnCount !== worldPlan.columnCount) {
      setCamera(fitResearchDeskWorld({ bounds: worldBounds, viewport }));
      return;
    }

    setCamera((current) => ({
      ...current,
      x: current.x + (viewport.width - previous.width) / 2,
      y: current.y + (viewport.height - previous.height) / 2,
    }));
  }, [activeSelection, cameraReady, paperAnchorRects, renderedStickyRects, viewport, worldBounds, worldPlan.columnCount]);

  useLayoutEffect(() => {
    const pending = pendingPileFocusRef.current;
    if (!pending || loading || !cameraReady || viewport.width <= 1 || viewport.height <= 1) return;

    const group = worldPlan.groups.find((candidate) => candidate.key === pending.key);
    if (!group) {
      pendingPileFocusRef.current = null;
      return;
    }
    if (group.expanded !== pending.expanded) return;

    pendingPileFocusRef.current = null;
    setCamera(zoomResearchDeskCameraToRect({
      maxScale: 1,
      minScale: 0.22,
      padding: 48,
      rect: pileFocusRect(group),
      viewport,
    }));
    setActionMessage(`${stackByKey.get(group.key)?.label || "Paper pile"} ${group.expanded ? "spread" : "restacked"}.`);
  }, [cameraReady, loading, stackByKey, viewport, worldPlan]);

  useEffect(() => {
    const missing = Object.entries(effectiveStickyRects).filter(([key]) => !layoutState.stickyRects[key]);
    if (!missing.length) return;
    setLayoutState((current) => ({
      ...current,
      stickyRects: { ...current.stickyRects, ...Object.fromEntries(missing) },
    }));
  }, [effectiveStickyRects, layoutState.stickyRects]);

  useEffect(() => {
    const supplied = new Set(ideas.map(ideaKey));
    setOptimisticIdeas((current) => current.filter((idea) => !supplied.has(ideaKey(idea))));
  }, [ideas]);

  useEffect(() => {
    setMatchCursor(0);
  }, [matchingPapers.map((paper) => paper.id).join("|")]);

  useLayoutEffect(() => {
    if (!arrangementSignatureRef.current) {
      arrangementSignatureRef.current = arrangementSignature;
      return undefined;
    }
    if (arrangementSignatureRef.current === arrangementSignature) return undefined;
    arrangementSignatureRef.current = arrangementSignature;

    if (viewport.width > 1 && viewport.height > 1) {
      const selectedRect = activeSelection?.kind === "paper"
        ? paperAnchorRects[activeSelection.path]
        : activeSelection?.kind === "idea"
          ? renderedStickyRects[activeSelection.path]
          : undefined;
      if (selectedRect) {
        setCamera((current) => zoomResearchDeskCameraToRect({
          maxScale: current.scale,
          minScale: current.scale,
          padding: 0,
          rect: selectedRect,
          viewport,
        }));
      } else {
        setCamera(fitResearchDeskWorld({ bounds: worldBounds, viewport }));
      }
    }

    if (arrangementFrameRef.current !== null) window.cancelAnimationFrame(arrangementFrameRef.current);
    if (arrangementTimerRef.current !== null) window.clearTimeout(arrangementTimerRef.current);
    setArranging(false);
    arrangementFrameRef.current = window.requestAnimationFrame(() => {
      arrangementFrameRef.current = null;
      setArranging(true);
      arrangementTimerRef.current = window.setTimeout(() => {
        arrangementTimerRef.current = null;
        setArranging(false);
      }, 820);
    });

    return () => {
      if (arrangementFrameRef.current !== null) window.cancelAnimationFrame(arrangementFrameRef.current);
      if (arrangementTimerRef.current !== null) window.clearTimeout(arrangementTimerRef.current);
    };
  }, [activeSelection, arrangementSignature, paperAnchorRects, renderedStickyRects, viewport, worldBounds]);

  useEffect(() => {
    if (!cameraReady || mountedLayoutStorageKeyRef.current !== layoutStorageKey) return;
    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(layoutStorageKey, JSON.stringify(layoutState));
      } catch {
        // A full or unavailable localStorage must not make the desk unusable.
      }
      onLayoutChange?.({
        expandedPileKeys: layoutState.expandedPileKeys,
        manualPaperRects: layoutState.manualPaperRects,
        manualPileRects: layoutState.manualPileRects,
        stickyRects: layoutState.stickyRects,
      });
    }, 100);
    return () => window.clearTimeout(timeout);
  }, [cameraReady, layoutState, layoutStorageKey, onLayoutChange]);

  useEffect(() => {
    if (!cameraReady || mountedCameraStorageKeyRef.current !== cameraStorageKey) return;
    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(cameraStorageKey, JSON.stringify(camera));
      } catch {
        // Camera persistence is a convenience; interaction stays available without it.
      }
      onCameraChange?.(camera);
    }, 100);
    return () => window.clearTimeout(timeout);
  }, [camera, cameraReady, cameraStorageKey, onCameraChange]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== "Space" || isTypingTarget(event.target) || !pointerInsideRef.current) return;
      event.preventDefault();
      spaceHeldRef.current = true;
      setSpaceHeld(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      spaceHeldRef.current = false;
      setSpaceHeld(false);
    };
    const blur = () => {
      spaceHeldRef.current = false;
      setSpaceHeld(false);
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", blur);
    };
  }, []);

  function updateSelection(next: ResearchDeskCanvasSelection) {
    if (selection === undefined) setInternalSelection(next);
    onSelectionChange?.(next);
  }

  function updateExpandedPileKeys(next: readonly string[]) {
    const unique = [...new Set(next)];
    setLayoutState((current) => ({ ...current, expandedPileKeys: unique }));
    onExpandedPileKeysChange?.(unique);
  }

  function togglePile(stack: ResearchDeskCanvasStack<TPaper>) {
    const nextExpanded = !expandedSet.has(stack.key);
    pendingPileFocusRef.current = { expanded: nextExpanded, key: stack.key };
    if (!nextExpanded) {
      setLayoutState((current) => ({
        ...current,
        expandedPileKeys: current.expandedPileKeys.filter((key) => key !== stack.key),
      }));
      onExpandedPileKeysChange?.(expandedPileKeys.filter((key) => key !== stack.key));
      return;
    }
    updateExpandedPileKeys([...expandedPileKeys, stack.key]);
  }

  function spreadAll() {
    updateExpandedPileKeys(stacks.map((stack) => stack.key));
  }

  function restackAll() {
    setLayoutState((current) => ({
      ...current,
      expandedPileKeys: [],
    }));
    onExpandedPileKeysChange?.([]);
  }

  function gatherLoosePapers() {
    setLayoutState((current) => ({ ...current, manualPaperRects: {} }));
    setActionMessage("Gathered loose papers back into their ordered piles.");
  }

  function viewportPoint(clientX: number, clientY: number) {
    const rect = viewportRef.current?.getBoundingClientRect();
    return { x: clientX - (rect?.left || 0), y: clientY - (rect?.top || 0) };
  }

  function worldPoint(clientX: number, clientY: number) {
    return researchDeskScreenToWorld(viewportPoint(clientX, clientY), camera);
  }

  function fitAll() {
    setCamera(fitResearchDeskWorld({ bounds: worldBounds, viewport }));
  }

  function zoomCentered(factor: number) {
    setCamera((current) => zoomResearchDeskCameraBy(current, factor, {
      x: viewport.width / 2,
      y: viewport.height / 2,
    }));
  }

  function resetTo100Percent() {
    setCamera((current) => researchDeskCameraAt100Percent(current, viewport));
  }

  function focusMatch(offset = 0) {
    if (!matchingPapers.length) return;
    const nextCursor = ((matchCursor + offset) % matchingPapers.length + matchingPapers.length) % matchingPapers.length;
    const paper = matchingPapers[nextCursor];
    const rect = paperAnchorRects[paper.id];
    if (!rect) return;
    setMatchCursor(nextCursor);
    updateSelection({ kind: "paper", path: paper.id });
    setCamera(zoomResearchDeskCameraToRect({
      maxScale: 1,
      minScale: 0.32,
      padding: 56,
      rect,
      viewport,
    }));
    setActionMessage(`Centered “${paper.title}”. Its saved desk position did not change.`);
  }

  function openStickyDraft() {
    const center = researchDeskScreenToWorld({ x: viewport.width / 2, y: viewport.height / 2 }, camera);
    setDraftSticky({ text: "", x: center.x - STICKY_WIDTH / 2, y: center.y - STICKY_HEIGHT / 2 });
    window.setTimeout(() => draftInputRef.current?.focus(), 0);
  }

  async function saveSticky(event: FormEvent) {
    event.preventDefault();
    const draft = draftSticky;
    if (!draft || !draft.text.trim() || !onCreateSticky || savingSticky) return;
    setSavingSticky(true);
    try {
      const created = await onCreateSticky({ ...draft, text: draft.text.trim() });
      if (created) {
        const key = ideaKey(created);
        setOptimisticIdeas((current) => [...current.filter((idea) => ideaKey(idea) !== key), created]);
        setLayoutState((current) => ({
          ...current,
          stickyRects: {
            ...current.stickyRects,
            [key]: { x: draft.x, y: draft.y, width: STICKY_WIDTH, height: STICKY_HEIGHT },
          },
        }));
        updateSelection({ kind: "idea", path: key });
        setHeldStickyId(key);
      }
      setDraftSticky(null);
      setActionMessage("Sticky added to the desk.");
    } catch (error) {
      const message = "The sticky could not be added. Nothing on the desk was changed.";
      setActionMessage(message);
      onActionError?.(message, error);
    } finally {
      setSavingSticky(false);
    }
  }

  function beginPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.button !== 1) return;
    const target = event.target instanceof Element ? event.target : null;
    const overItem = Boolean(target?.closest("[data-research-world-item], .research-world-controls, .research-world-pile-heading"));
    const shouldPan = event.button === 1 || spaceHeldRef.current || !overItem;
    if (!shouldPan) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    panDragRef.current = {
      captureTarget: event.currentTarget,
      origin: camera,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
    };
  }

  function beginItemDrag(
    event: ReactPointerEvent<HTMLElement>,
    kind: ItemDrag["kind"],
    id: string,
    origin: ResearchDeskRect,
  ) {
    if (event.button !== 0 || spaceHeldRef.current) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("button, a, input, textarea, select")) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    itemDragRef.current = {
      captureTarget: event.currentTarget,
      id,
      kind,
      moved: false,
      origin,
      pointerId: event.pointerId,
      scale: camera.scale,
      startClientX: event.clientX,
      startClientY: event.clientY,
    };
  }

  function beginConnection(
    event: ReactPointerEvent<HTMLButtonElement>,
    source: ConnectionSource,
    sourceRect: ResearchDeskRect,
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const next: ConnectionDrag = {
      ...source,
      captureTarget: event.currentTarget,
      current: rightAnchor(sourceRect),
      pointerId: event.pointerId,
      start: rightAnchor(sourceRect),
    };
    connectionDragRef.current = next;
    setConnectionPreview(next);
    setKeyboardConnectionSource(null);
  }

  function itemObstacles(kind: ItemDrag["kind"], id: string) {
    const obstacles: ResearchDeskRect[] = [];
    for (const [paperId, rect] of Object.entries({ ...worldPlan.automaticPaperRects, ...activeManualPaperRects })) {
      if (kind !== "paper" || paperId !== id) obstacles.push(rect);
    }
    for (const [pileId, rect] of Object.entries(renderedPileRects)) {
      if (kind !== "pile" || pileId !== id) obstacles.push(rect);
    }
    for (const [stickyId, rect] of Object.entries(effectiveStickyRects)) {
      if (kind !== "sticky" || stickyId !== id) obstacles.push(rect);
    }
    for (const rect of Object.values(worldPlan.headingRects)) obstacles.push(rect);
    return obstacles;
  }

  function movePointer(event: ReactPointerEvent<HTMLDivElement>) {
    const connection = connectionDragRef.current;
    if (connection && connection.pointerId === event.pointerId) {
      const current = worldPoint(event.clientX, event.clientY);
      const next = { ...connection, current };
      connectionDragRef.current = next;
      setConnectionPreview(next);
      const target = document.elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-research-world-paper-id]");
      const targetId = target?.dataset.researchWorldPaperId || null;
      setDropTargetPaperId(targetId && !(connection.kind === "paper" && targetId === connection.id) ? targetId : null);
      return;
    }

    const item = itemDragRef.current;
    if (item && item.pointerId === event.pointerId) {
      const dx = (event.clientX - item.startClientX) / Math.max(0.0001, item.scale);
      const dy = (event.clientY - item.startClientY) / Math.max(0.0001, item.scale);
      if (Math.hypot(dx, dy) >= 3 / Math.max(0.02, item.scale)) item.moved = true;
      setTransientRect({
        id: item.id,
        kind: item.kind,
        rect: { ...item.origin, x: item.origin.x + dx, y: item.origin.y + dy },
      });
      return;
    }

    const pan = panDragRef.current;
    if (pan && pan.pointerId === event.pointerId) {
      setCamera(panResearchDeskCamera(pan.origin, {
        x: event.clientX - pan.startClientX,
        y: event.clientY - pan.startClientY,
      }));
    }
  }

  async function attachIdea(idea: TIdea, paper: TPaper) {
    const key = `${ideaKey(idea)}::${paper.id}`;
    if (!onAttachIdeaToPaper || busyConnection === key) return;
    setBusyConnection(key);
    try {
      await onAttachIdeaToPaper(idea, paper);
      setPendingIdeaConnections((current) => ({
        ...current,
        [ideaKey(idea)]: [...new Set([...(current[ideaKey(idea)] || []), paper.id])],
      }));
      setActionMessage(`Attached “${idea.topic}” to “${paper.title}”.`);
    } catch (error) {
      const message = "The sticky could not be attached. Existing connections are unchanged.";
      setActionMessage(message);
      onActionError?.(message, error);
    } finally {
      setBusyConnection(null);
    }
  }

  async function connectSourceToPaper(source: ConnectionSource, targetPaperId: string) {
    const target = paperById.get(targetPaperId);
    if (!target) return;
    setKeyboardConnectionSource(null);
    if (source.kind === "sticky") {
      const idea = ideaById.get(source.id);
      if (idea) await attachIdea(idea, target);
      return;
    }
    const sourcePaper = paperById.get(source.id);
    if (!sourcePaper || sourcePaper.id === target.id || !onConnectPapers) return;
    const key = connectionKey(sourcePaper.id, target.id);
    if (busyConnection === key) return;
    setBusyConnection(key);
    try {
      const result = await onConnectPapers(sourcePaper, target);
      if (result === "connected") {
        setPendingPaperConnections((current) => current.some((item) => connectionKey(item.a, item.b) === key)
          ? current
          : [...current, { a: sourcePaper.id, b: target.id }]);
      } else if (result === "disconnected") {
        setPendingPaperConnections((current) => current.filter((item) => connectionKey(item.a, item.b) !== key));
      }
      setActionMessage(result === "connected"
        ? `Connected “${sourcePaper.title}” and “${target.title}”.`
        : result === "disconnected"
          ? `Disconnected “${sourcePaper.title}” and “${target.title}”.`
          : `Updated the connection between “${sourcePaper.title}” and “${target.title}”.`);
    } catch (error) {
      const message = "The papers could not be connected. Existing connections are unchanged.";
      setActionMessage(message);
      onActionError?.(message, error);
    } finally {
      setBusyConnection(null);
    }
  }

  function finishConnection(event: ReactPointerEvent<HTMLDivElement>) {
    const connection = connectionDragRef.current;
    if (!connection || connection.pointerId !== event.pointerId) return false;
    const moved = Math.hypot(
      connection.current.x - connection.start.x,
      connection.current.y - connection.start.y,
    ) * camera.scale >= 4;
    const target = document.elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-research-world-paper-id]");
    const targetId = target?.dataset.researchWorldPaperId;
    connectionDragRef.current = null;
    setConnectionPreview(null);
    setDropTargetPaperId(null);
    if (connection.captureTarget.hasPointerCapture(event.pointerId)) {
      connection.captureTarget.releasePointerCapture(event.pointerId);
    }
    if (moved) suppressConnectionClickUntilRef.current = Date.now() + 250;
    if (targetId && !(connection.kind === "paper" && targetId === connection.id)) {
      void connectSourceToPaper(connection, targetId);
    }
    return true;
  }

  function finishItemDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const item = itemDragRef.current;
    if (!item || item.pointerId !== event.pointerId) return false;
    const candidate = {
      ...item.origin,
      x: item.origin.x + (event.clientX - item.startClientX) / Math.max(0.0001, item.scale),
      y: item.origin.y + (event.clientY - item.startClientY) / Math.max(0.0001, item.scale),
    };
    itemDragRef.current = null;
    setTransientRect(null);
    if (item.captureTarget.hasPointerCapture(event.pointerId)) {
      item.captureTarget.releasePointerCapture(event.pointerId);
    }
    if (!item.moved) return true;
    const settled = nearestOpenResearchPaperRect(candidate, itemObstacles(item.kind, item.id), {
      clearance: ITEM_CLEARANCE,
      height: candidate.height,
      width: candidate.width,
      columnStep: candidate.width + 32,
      rowStep: candidate.height + 36,
    });
    setLayoutState((current) => {
      if (item.kind === "paper") {
        return { ...current, manualPaperRects: { ...current.manualPaperRects, [item.id]: settled } };
      }
      if (item.kind === "pile") {
        return { ...current, manualPileRects: { ...current.manualPileRects, [item.id]: settled } };
      }
      return { ...current, stickyRects: { ...current.stickyRects, [item.id]: settled } };
    });
    suppressClickRef.current = { id: item.id, until: Date.now() + 250 };
    return true;
  }

  function finishPan(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = panDragRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    panDragRef.current = null;
    if (pan.captureTarget.hasPointerCapture(event.pointerId)) {
      pan.captureTarget.releasePointerCapture(event.pointerId);
    }
  }

  function finishPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (finishConnection(event)) return;
    if (finishItemDrag(event)) return;
    finishPan(event);
  }

  function cancelPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const connection = connectionDragRef.current;
    if (connection?.pointerId === event.pointerId) connectionDragRef.current = null;
    const item = itemDragRef.current;
    if (item?.pointerId === event.pointerId) itemDragRef.current = null;
    const pan = panDragRef.current;
    if (pan?.pointerId === event.pointerId) panDragRef.current = null;
    setConnectionPreview(null);
    setDropTargetPaperId(null);
    setTransientRect(null);
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const deltaX = wheelPixels(event.deltaX, event.deltaMode, viewport.width);
    const deltaY = wheelPixels(event.deltaY, event.deltaMode, viewport.height);
    if (event.ctrlKey || event.metaKey) {
      const point = viewportPoint(event.clientX, event.clientY);
      const factor = Math.exp(-deltaY * 0.0015);
      setCamera((current) => zoomResearchDeskCameraBy(current, factor, point));
      return;
    }
    const horizontal = event.shiftKey && Math.abs(deltaX) < 0.01 ? deltaY : deltaX;
    const vertical = event.shiftKey && Math.abs(deltaX) < 0.01 ? 0 : deltaY;
    setCamera((current) => panResearchDeskCameraFromWheel(current, { x: horizontal, y: vertical }));
  }

  function handleCanvasKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (isTypingTarget(event.target)) return;
    if (event.key === "Escape") {
      setKeyboardConnectionSource(null);
      setDraftSticky(null);
      setHeldStickyId(null);
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomCentered(1.2);
    } else if (event.key === "-") {
      event.preventDefault();
      zoomCentered(1 / 1.2);
    } else if (event.key === "0") {
      event.preventDefault();
      resetTo100Percent();
    } else if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      fitAll();
    }
  }

  function clickWasDrag(id: string) {
    const suppressed = suppressClickRef.current;
    return Boolean(suppressed && suppressed.id === id && suppressed.until >= Date.now());
  }

  function activateConnectionSource(source: ConnectionSource) {
    if (suppressConnectionClickUntilRef.current >= Date.now()) return;
    setKeyboardConnectionSource((current) =>
      current?.kind === source.kind && current.id === source.id ? null : source);
    setActionMessage(source.kind === "sticky"
      ? "Choose a paper and select Connect here, or drag the link handle directly onto it."
      : "Choose another paper and select Connect here, or drag the link handle directly onto it.");
  }

  function ideaAttachedToPaper(idea: TIdea, paper: TPaper) {
    const references = new Set([
      ...(idea.connectedPaperRefs || []),
      ...(pendingIdeaConnections[ideaKey(idea)] || []),
    ]);
    return [...references].some((reference) => paperMatchesReference(paper, reference));
  }

  const relationshipLines = useMemo(() => {
    const lines: RelationshipLine[] = [];
    const seenPapers = new Set<string>();
    for (const connection of [...paperConnections, ...pendingPaperConnections]) {
      const firstPaper = paperForReference(connection.a);
      const secondPaper = paperForReference(connection.b);
      if (!firstPaper || !secondPaper || firstPaper.id === secondPaper.id) continue;
      const key = connectionKey(firstPaper.id, secondPaper.id);
      if (seenPapers.has(key)) continue;
      seenPapers.add(key);
      const first = paperAnchorRects[firstPaper.id];
      const second = paperAnchorRects[secondPaper.id];
      if (!first || !second) continue;
      lines.push({
        active: activeSelection?.kind === "paper"
          && (activeSelection.path === firstPaper.id || activeSelection.path === secondPaper.id),
        id: `paper:${key}`,
        kind: "paper",
        source: centerOf(first),
        target: centerOf(second),
      });
    }
    for (const idea of allIdeas) {
      const stickyId = ideaKey(idea);
      const stickyRect = renderedStickyRects[stickyId];
      if (!stickyRect) continue;
      const references = new Set([...(idea.connectedPaperRefs || []), ...(pendingIdeaConnections[stickyId] || [])]);
      for (const paper of paperById.values()) {
        if (![...references].some((reference) => paperMatchesReference(paper, reference))) continue;
        const paperRect = paperAnchorRects[paper.id];
        if (!paperRect) continue;
        lines.push({
          active: heldStickyId === stickyId || (activeSelection?.kind === "paper" && activeSelection.path === paper.id),
          id: `sticky:${stickyId}:${paper.id}`,
          kind: "sticky",
          source: centerOf(stickyRect),
          target: centerOf(paperRect),
        });
      }
    }
    return lines;
  }, [activeSelection, allIdeas, heldStickyId, paperAnchorRects, paperById, paperConnections, pendingIdeaConnections, pendingPaperConnections, renderedStickyRects]);

  const heldIdea = heldStickyId ? ideaById.get(heldStickyId) || null : null;
  const keyboardConnectionLabel = keyboardConnectionSource
    ? keyboardConnectionSource.kind === "paper"
      ? paperById.get(keyboardConnectionSource.id)?.title || "this paper"
      : ideaById.get(keyboardConnectionSource.id)?.topic || "this sticky"
    : "";
  const allExpanded = stacks.length > 0 && stacks.every((stack) => expandedSet.has(stack.key));
  const worldStyle = {
    "--research-world-camera-scale": camera.scale,
    "--research-world-screen-pixel": `${1 / Math.max(camera.scale, 0.0001)}px`,
    height: 1,
    left: 0,
    overflow: "visible",
    position: "absolute",
    top: 0,
    transform: `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.scale})`,
    transformOrigin: "0 0",
    width: 1,
    zIndex: 1,
  } as CSSProperties;

  function paperCard(paper: TPaper, rect: ResearchDeskRect, loose: boolean) {
    const isMatch = matchingIds === null || matchingIds.has(paper.id);
    const selected = activeSelection?.kind === "paper" && activeSelection.path === paper.id;
    const summary = readableText(paper.summaryPreview || paper.summary || paper.abstract);
    const abstract = readableText(paper.abstract || paper.summary || paper.citation);
    const source = paper.authorLabel || paper.authors?.join(", ") || "Unknown author";
    const heldAttached = heldIdea ? ideaAttachedToPaper(heldIdea, paper) : false;
    const attachKey = heldIdea ? `${ideaKey(heldIdea)}::${paper.id}` : "";
    const keyboardTarget = keyboardConnectionSource
      && !(keyboardConnectionSource.kind === "paper" && keyboardConnectionSource.id === paper.id);
    const connectionSourceActive = keyboardConnectionSource?.kind === "paper"
      && keyboardConnectionSource.id === paper.id;
    return (
      <article
        aria-label={`${paper.title}. ${source}. ${loose ? "Loose paper. " : ""}${isMatch ? "Matches the current search." : "Outside the current search; dimmed but still in place."}`}
        aria-selected={selected}
        className={`research-world-paper research-paper-card research-desk-item tier-${semanticTier} ${loose ? "is-loose" : ""} ${selected ? "is-selected research-desk-item-selected" : ""} ${isMatch ? "is-filter-match" : "is-filter-dimmed"} ${dropTargetPaperId === paper.id ? "is-connection-target" : ""}`}
        data-research-world-item="paper"
        data-research-world-paper-id={paper.id}
        data-semantic-tier={semanticTier}
        key={`${loose ? "loose" : "paper"}:${paper.id}`}
        onClick={() => {
          if (!clickWasDrag(paper.id)) updateSelection({ kind: "paper", path: paper.id });
        }}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!clickWasDrag(paper.id)) onOpenPaperDetails?.(paper);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onOpenPaperDetails?.(paper);
          } else if (event.key === " ") {
            event.preventDefault();
            updateSelection({ kind: "paper", path: paper.id });
          }
        }}
        onPointerDown={(event) => beginItemDrag(event, "paper", paper.id, rect)}
        role="option"
        style={{
          height: rect.height,
          left: rect.x,
          opacity: isMatch ? 1 : 0.2,
          overflow: "hidden",
          overflowWrap: "normal",
          position: "absolute",
          top: rect.y,
          width: rect.width,
          wordBreak: "normal",
        }}
        tabIndex={0}
      >
        <span className="research-world-paper-grab" aria-hidden="true"><Move /></span>
        {loose ? <span className="research-world-loose-label">Loose</span> : null}
        {semanticTier === "overview" ? (
          <span aria-hidden="true" className="research-world-paper-silhouette">
            <span />
            <span />
            <span />
          </span>
        ) : (
          <>
            <span className="research-world-paper-kicker">{source} · {paper.year || "n.d."}</span>
            <h3
              className="research-world-paper-title"
              style={{ hyphens: "auto", overflowWrap: "normal", wordBreak: "normal" }}
              title={paper.title}
            >
              {paper.title}
            </h3>
            {semanticTier === "summary" ? (
              <p className="research-world-paper-summary">{excerpt(summary || "No summary is available yet.", 420)}</p>
            ) : null}
            {semanticTier === "read" ? (
              <section aria-label={paper.abstractLabel || "Abstract or summary"} className="research-world-paper-reading-copy">
                <strong>{paper.abstractLabel || "Abstract or summary"}</strong>
                <p>{excerpt(abstract || "No abstract or summary is available yet.", 1_000)}</p>
              </section>
            ) : null}
            <footer className="research-world-paper-footer">
              <span>{paper.primarySubject || "Unsorted"}</span>
              <span>{paper.readingStatus?.replaceAll("_", " ") || "To read"}</span>
            </footer>
          </>
        )}
        <button
          aria-label={`Start a connection from ${paper.title}. Drag to another paper, or press Enter then choose Connect here.`}
          aria-pressed={connectionSourceActive}
          className={`research-world-connection-handle ${connectionSourceActive ? "is-active" : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            activateConnectionSource({ kind: "paper", id: paper.id });
          }}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => beginConnection(event, { kind: "paper", id: paper.id }, rect)}
          title="Connect this paper"
          type="button"
        >
          <Link2 />
        </button>
        {keyboardTarget ? (
          <button
            className="research-world-connect-here"
            disabled={Boolean(busyConnection)}
            onClick={(event) => {
              event.stopPropagation();
              void connectSourceToPaper(keyboardConnectionSource, paper.id);
            }}
            onKeyDown={(event) => event.stopPropagation()}
            type="button"
          >
            Connect here
          </button>
        ) : null}
        {heldIdea && isMatch ? (
          <button
            className="research-world-attach-held-sticky"
            disabled={heldAttached || busyConnection === attachKey || !onAttachIdeaToPaper}
            onClick={(event) => {
              event.stopPropagation();
              void attachIdea(heldIdea, paper);
            }}
            onKeyDown={(event) => event.stopPropagation()}
            type="button"
          >
            <StickyNote /> {heldAttached ? "Attached" : busyConnection === attachKey ? "Attaching…" : "Attach sticky"}
          </button>
        ) : null}
      </article>
    );
  }

  return (
    <div
      aria-describedby={hintId}
      aria-label={ariaLabel}
      className={`research-world-canvas ${spaceHeld || panDragRef.current ? "is-pan-ready" : ""} ${transientRect ? "is-item-moving" : ""} ${arranging ? "is-arranging" : ""} ${className}`.trim()}
      data-research-semantic-tier={semanticTier}
      onKeyDown={handleCanvasKeyDown}
      onPointerCancel={cancelPointer}
      onPointerDown={beginPan}
      onPointerEnter={() => { pointerInsideRef.current = true; }}
      onPointerLeave={() => { pointerInsideRef.current = false; }}
      onPointerMove={movePointer}
      onPointerUp={finishPointer}
      onWheel={handleWheel}
      ref={viewportRef}
      role="application"
      style={{
        flex: "1 1 auto",
        height: "100%",
        minHeight: 0,
        overflow: "clip",
        position: "relative",
        touchAction: "none",
        width: "100%",
      }}
      tabIndex={0}
    >
      <div
        aria-hidden="true"
        className="research-world-grid"
        data-research-world-blank="true"
        style={{ inset: 0, position: "absolute" }}
      />

      <div
        aria-label="Desk view controls"
        className="research-world-controls"
        role="toolbar"
        style={{ position: "absolute", right: 12, top: 12, zIndex: 50 }}
      >
        <button aria-label="Zoom out" onClick={() => zoomCentered(1 / 1.2)} title="Zoom out" type="button"><Minus /></button>
        <button aria-label="Return to 100 percent zoom" onClick={resetTo100Percent} title="100%" type="button">{Math.round(camera.scale * 100)}%</button>
        <button aria-label="Zoom in" onClick={() => zoomCentered(1.2)} title="Zoom in" type="button"><Plus /></button>
        <button aria-label="Fit every paper and sticky in view" onClick={fitAll} title="Fit all" type="button"><Focus /> Fit</button>
        {matchingIds !== null ? (
          <span className="research-world-match-controls">
            <button aria-label="Previous search match" disabled={matchingPapers.length < 2} onClick={() => focusMatch(-1)} title="Previous match" type="button"><ChevronLeft /></button>
            <button aria-label="Focus search match" disabled={!matchingPapers.length} onClick={() => focusMatch(0)} title="Center the current match" type="button">
              {matchingPapers.length ? `${matchCursor + 1} / ${matchingPapers.length} ${matchingPapers.length === 1 ? "match" : "matches"}` : "No matches"}
            </button>
            <button aria-label="Next search match" disabled={matchingPapers.length < 2} onClick={() => focusMatch(1)} title="Next match" type="button"><ChevronRight /></button>
          </span>
        ) : null}
        <button
          aria-label={allExpanded ? "Restack all paper piles" : "Spread all paper piles"}
          onClick={allExpanded ? restackAll : spreadAll}
          title={allExpanded ? "Restack all" : "Spread all"}
          type="button"
        >
          <Layers3 /> {allExpanded ? "Restack all" : "Spread all"}
        </button>
        {Object.keys(activeManualPaperRects).length ? (
          <button
            aria-label={`Gather ${Object.keys(activeManualPaperRects).length} loose ${Object.keys(activeManualPaperRects).length === 1 ? "paper" : "papers"} back into their ordered piles`}
            onClick={gatherLoosePapers}
            title="Gather loose papers"
            type="button"
          >
            <Layers3 /> Gather loose
          </button>
        ) : null}
        <button aria-label="Add a sticky note at the center of the current view" disabled={!onCreateSticky} onClick={openStickyDraft} type="button">
          <StickyNote /> Add sticky
        </button>
      </div>

      {keyboardConnectionSource ? (
        <div aria-live="polite" className="research-world-linking-banner" role="status">
          <Link2 aria-hidden="true" />
          <span>Connecting from <strong title={keyboardConnectionLabel}>{keyboardConnectionLabel}</strong>. Choose <b>Connect here</b> on a paper.</span>
          <button onClick={() => setKeyboardConnectionSource(null)} type="button">Cancel</button>
        </div>
      ) : null}

      <p className="research-world-hint" id={hintId} style={{ bottom: 12, left: 12, position: "absolute", zIndex: 50 }}>
        Drag the blank desk, hold Space and drag, or use the middle mouse button to pan. Two-finger scrolling pans in both directions. Ctrl or Command plus scroll zooms at the pointer. Double-click a pile to spread it; double-click its heading to restack it. Paper bodies move; link handles connect.
      </p>
      <div aria-live="polite" className="sr-only">{actionMessage}</div>

      {loading ? <div className="research-world-loading">Setting out the research desk…</div> : null}

      <div className="research-world-surface" data-research-world-blank="true" style={worldStyle}>
        <svg aria-hidden="true" className="research-world-relationship-lines" style={{ height: 1, left: 0, overflow: "visible", pointerEvents: "none", position: "absolute", top: 0, width: 1 }}>
          {relationshipLines.map((line) => (
            <path
              className={`${line.kind === "paper" ? "is-paper-connection" : "is-sticky-connection"} ${line.active ? "is-active" : ""}`}
              d={linePath(line.source, line.target)}
              fill="none"
              key={line.id}
              stroke="currentColor"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {connectionPreview ? (
            <path
              className="is-connection-preview"
              d={linePath(connectionPreview.start, connectionPreview.current)}
              fill="none"
              stroke="currentColor"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>

        {worldPlan.groups.map((group) => {
          const stack = stackByKey.get(group.key);
          if (!stack) return null;
          const looseCount = stack.papers.filter((paper) => activeManualPaperRects[paper.id]).length;
          const stackedPapers = stack.papers.filter((paper) => !activeManualPaperRects[paper.id]);
          const matches = stack.papers.filter((paper) => matchingIds === null || matchingIds.has(paper.id)).length;
          const frontPaper = matchingIds === null
            ? stackedPapers[0]
            : stackedPapers.find((paper) => matchingIds.has(paper.id)) || stackedPapers[0];
          const pileRect = renderedPileRects[group.key];
          return (
            <section
              aria-label={`${stack.label} paper pile`}
              className={`research-world-pile-group ${group.expanded ? "is-expanded" : "is-collapsed"}`}
              key={stack.key}
              style={{ "--research-world-arrange-order": Math.min(group.groupOrder, 10) } as CSSProperties}
            >
              <button
                aria-expanded={group.expanded}
                aria-label={`${stack.label}, ${stack.papers.length} papers. ${group.expanded ? "Double-click or press Enter to restack." : "Double-click or press Enter to spread without leaving the desk."}`}
                className="research-world-pile-heading"
                onClick={(event) => {
                  if (event.detail === 0) togglePile(stack);
                }}
                onDoubleClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  togglePile(stack);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    togglePile(stack);
                  }
                }}
                onPointerDown={(event) => {
                  if (event.button !== 1) event.stopPropagation();
                }}
                style={{
                  height: group.headingRect.height,
                  left: group.headingRect.x,
                  position: "absolute",
                  top: group.headingRect.y,
                  width: group.headingRect.width,
                }}
                type="button"
              >
                <span>{stack.label}</span>
                <strong>{stack.papers.length} {stack.papers.length === 1 ? "paper" : "papers"}</strong>
                <small>
                  {group.expanded ? "Spread in ordered, collision-free rows" : "Double-click to spread"}
                  {looseCount ? ` · ${looseCount} loose` : ""}
                  {matchingIds !== null ? ` · ${matches} matching` : ""}
                </small>
              </button>

              {!group.expanded && pileRect && frontPaper ? (
                <article
                  aria-label={`${stack.label} pile. ${stackedPapers.length} stacked papers. Double-click to spread the pile.`}
                  className={`research-world-pile research-paper-card ${matches ? "is-filter-match" : "is-filter-dimmed"}`}
                  data-paper-count={stackedPapers.length}
                  data-research-world-item="pile"
                  data-research-world-paper-id={frontPaper.id}
                  onClick={() => {
                    if (!clickWasDrag(stack.key)) updateSelection({ kind: "paper", path: frontPaper.id });
                  }}
                  onDoubleClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (!clickWasDrag(stack.key)) togglePile(stack);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onOpenPaperDetails?.(frontPaper);
                    } else if (event.key === " ") {
                      event.preventDefault();
                      updateSelection({ kind: "paper", path: frontPaper.id });
                    }
                  }}
                  onPointerDown={(event) => beginItemDrag(event, "pile", stack.key, pileRect)}
                  role="option"
                  style={{
                    height: pileRect.height,
                    left: pileRect.x,
                    opacity: matches ? 1 : 0.2,
                    position: "absolute",
                    top: pileRect.y,
                    width: pileRect.width,
                  }}
                  tabIndex={0}
                >
                  {Array.from({ length: Math.min(4, Math.max(0, stackedPapers.length - 1)) }, (_, index) => (
                    <span aria-hidden="true" className="research-world-pile-layer" key={index} style={{ "--research-world-pile-layer": index + 1 } as CSSProperties} />
                  ))}
                  <span className="research-world-paper-kicker">{frontPaper.authorLabel || "Unknown author"} · {frontPaper.year || "n.d."}</span>
                  <h3 style={{ overflowWrap: "normal", wordBreak: "normal" }}>{frontPaper.title}</h3>
                  <p>{stackedPapers.length} in this pile</p>
                  <button
                    aria-label={`Start a connection from ${frontPaper.title}`}
                    aria-pressed={keyboardConnectionSource?.kind === "paper" && keyboardConnectionSource.id === frontPaper.id}
                    className={`research-world-connection-handle ${keyboardConnectionSource?.kind === "paper" && keyboardConnectionSource.id === frontPaper.id ? "is-active" : ""}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      activateConnectionSource({ kind: "paper", id: frontPaper.id });
                    }}
                    onKeyDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => beginConnection(event, { kind: "paper", id: frontPaper.id }, pileRect)}
                    type="button"
                  >
                    <Link2 />
                  </button>
                  {heldIdea && (matchingIds === null || matchingIds.has(frontPaper.id)) ? (
                    <button
                      className="research-world-attach-held-sticky"
                      disabled={ideaAttachedToPaper(heldIdea, frontPaper) || !onAttachIdeaToPaper}
                      onClick={(event) => {
                        event.stopPropagation();
                        void attachIdea(heldIdea, frontPaper);
                      }}
                      onKeyDown={(event) => event.stopPropagation()}
                      type="button"
                    >
                      <StickyNote /> {ideaAttachedToPaper(heldIdea, frontPaper) ? "Attached" : "Attach sticky"}
                    </button>
                  ) : null}
                </article>
              ) : null}

              {group.expanded ? group.paperIds.map((paperId) => {
                const paper = paperById.get(paperId);
                const rect = renderedAutomaticPaperRects[paperId];
                return paper && rect ? paperCard(paper, rect, false) : null;
              }) : null}
            </section>
          );
        })}

        {Object.entries(renderedManualPaperRects).map(([paperId, rect]) => {
          const paper = paperById.get(paperId);
          return paper ? paperCard(paper, rect, true) : null;
        })}

        {allIdeas.map((idea) => {
          const key = ideaKey(idea);
          const rect = renderedStickyRects[key];
          if (!rect) return null;
          const selected = activeSelection?.kind === "idea" && activeSelection.path === key;
          const attachedCount = new Set([...(idea.connectedPaperRefs || []), ...(pendingIdeaConnections[key] || [])]).size;
          return (
            <article
              aria-label={`Sticky note: ${idea.topic}. ${attachedCount ? `Connected to ${attachedCount} papers.` : "Not connected yet."} Click to hold it, then use Attach sticky on matching papers.`}
              aria-selected={selected}
              className={`research-world-sticky research-sticky-note research-desk-item ${selected ? "is-selected research-desk-item-selected" : ""} ${heldStickyId === key ? "is-held" : ""}`}
              data-research-world-item="sticky"
              key={key}
              onClick={() => {
                if (clickWasDrag(key)) return;
                updateSelection({ kind: "idea", path: key });
                setHeldStickyId((current) => current === key ? null : key);
              }}
              onDoubleClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpenIdeaDetails?.(idea);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onOpenIdeaDetails?.(idea);
                } else if (event.key === " ") {
                  event.preventDefault();
                  updateSelection({ kind: "idea", path: key });
                  setHeldStickyId((current) => current === key ? null : key);
                }
              }}
              onPointerDown={(event) => beginItemDrag(event, "sticky", key, rect)}
              role="option"
              style={{
                height: rect.height,
                left: rect.x,
                position: "absolute",
                top: rect.y,
                width: rect.width,
              }}
              tabIndex={0}
            >
              <StickyNote aria-hidden="true" />
              <strong style={{ overflowWrap: "normal", wordBreak: "normal" }}>{idea.topic}</strong>
              <p>{excerpt(readableText(idea.preview || idea.body) || "A loose research note.", 300)}</p>
              <span><Link2 /> {attachedCount ? `${attachedCount} connected` : "Use the link handle"}</span>
              <button
                aria-label={`Start a connection from sticky ${idea.topic}. Drag to a paper, or press Enter then choose Connect here.`}
                aria-pressed={keyboardConnectionSource?.kind === "sticky" && keyboardConnectionSource.id === key}
                className={`research-world-connection-handle ${keyboardConnectionSource?.kind === "sticky" && keyboardConnectionSource.id === key ? "is-active" : ""}`}
                onClick={(event) => {
                  event.stopPropagation();
                  activateConnectionSource({ kind: "sticky", id: key });
                }}
                onKeyDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => beginConnection(event, { kind: "sticky", id: key }, rect)}
                type="button"
              >
                <Link2 />
              </button>
            </article>
          );
        })}

        {draftSticky ? (
          <form
            aria-label="New research sticky"
            className="research-world-sticky-draft"
            data-research-world-item="sticky-draft"
            onPointerDown={(event) => event.stopPropagation()}
            onSubmit={saveSticky}
            style={{
              height: STICKY_HEIGHT,
              left: draftSticky.x,
              position: "absolute",
              top: draftSticky.y,
              width: STICKY_WIDTH,
            }}
          >
            <label htmlFor={`${hintId}-sticky`}>New sticky</label>
            <textarea
              disabled={savingSticky}
              id={`${hintId}-sticky`}
              onChange={(event) => setDraftSticky((current) => current ? { ...current, text: event.target.value } : null)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setDraftSticky(null);
                } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="A question, observation, or connection…"
              ref={draftInputRef}
              value={draftSticky.text}
            />
            <div>
              <button disabled={savingSticky} onClick={() => setDraftSticky(null)} type="button">Cancel</button>
              <button disabled={savingSticky || !draftSticky.text.trim() || !onCreateSticky} type="submit">
                {savingSticky ? "Adding…" : "Add sticky"}
              </button>
            </div>
          </form>
        ) : null}
      </div>

      {!loading && paperById.size === 0 && allIdeas.length === 0 ? (
        <div className="research-world-empty">
          <strong>No papers are on the desk yet.</strong>
          <span>Sync or add research papers, then they will appear here without changing this view.</span>
        </div>
      ) : null}
    </div>
  );
}

export default ResearchDeskCanvas;
