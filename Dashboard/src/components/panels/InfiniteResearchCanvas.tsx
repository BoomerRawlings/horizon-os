import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  Focus,
  Layers3,
  Link2,
  Maximize2,
  Minus,
  MoreHorizontal,
  Plus,
  Redo2,
  RotateCcw,
  StickyNote,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import {
  fitResearchInfiniteCamera,
  researchScreenToWorld,
  researchSemanticTier,
  researchSemanticZoomLabel,
  researchWorldRectUnion,
  researchWorldRectsIntersect,
  visibleResearchWorldRect,
  zoomResearchInfiniteCameraAtPoint,
  zoomResearchInfiniteCameraFromWheel,
  type ResearchInfiniteCamera,
  type ResearchWorldPoint,
  type ResearchWorldRect,
} from "./researchInfiniteCamera";
import {
  commitResearchBoardHistory,
  createResearchBoardHistory,
  createResearchBoardRelationship,
  ensureResearchBoardObjects,
  migrateLegacyResearchBoardState,
  moveResearchBoardObject,
  normalizeResearchBoardState,
  popResearchBoardFocus,
  pushResearchBoardFocus,
  redoResearchBoardHistory,
  removeResearchBoardRelationship,
  restackResearchBoardPaper,
  toggleResearchBoardStack,
  undoResearchBoardHistory,
  updateResearchBoardRelationship,
  type ResearchBoardHistory,
  type ResearchBoardObjectKind,
  type ResearchBoardRelationship,
  type ResearchRelationshipEndpoint,
} from "./researchBoardState";
import { ResearchPdfPreview } from "./ResearchPdfPreview";
import { planResearchBoardLayout } from "./researchBoardLayout";
import {
  planResearchExploreLayout,
  researchStackPeekRects,
} from "./researchExploreLayout";

const BOARD_STORAGE_KEY = "horizon.infinite-research-board.v4";
const EXPLORE_CAMERA_STORAGE_KEY = "horizon.infinite-research-explore-camera.v1";
const LEGACY_LAYOUT_KEY = "horizon.research-desk-world.v2";
const LEGACY_CAMERA_KEY = "horizon.research-desk-camera-world.v2";
const PAPER_WIDTH = 268;
const PAPER_HEIGHT = 360;
const STICKY_WIDTH = 230;
const STICKY_HEIGHT = 210;

export type InfiniteResearchPaper = {
  abstract?: string;
  abstractLabel?: string;
  authorLabel?: string;
  authors?: readonly string[];
  citation?: string;
  datePublished?: string;
  documentUrl?: string;
  doi?: string;
  id: string;
  path?: string;
  previewUrl?: string;
  primarySubject?: string;
  readingStatus?: string;
  source?: string;
  subjects?: readonly string[];
  summary?: string;
  summaryPreview?: string;
  title: string;
  year?: string;
  zoteroKey?: string;
  zoteroUrl?: string;
};

export type InfiniteResearchIdea = {
  body?: string;
  connectedPaperRefs?: readonly string[];
  id: string;
  path?: string;
  preview?: string;
  topic: string;
};

export type InfiniteResearchStack<TPaper extends InfiniteResearchPaper = InfiniteResearchPaper> = {
  key: string;
  label: string;
  papers: readonly TPaper[];
};

export type InfiniteResearchSelection =
  | { kind: "idea" | "paper"; path: string }
  | null;

export type InfiniteResearchPaperConnection = { a: string; b: string };
export type InfiniteResearchStickyDraft = { text: string; x: number; y: number };
export type InfiniteResearchMode = "board" | "explore";

export type InfiniteResearchCanvasProps<
  TPaper extends InfiniteResearchPaper = InfiniteResearchPaper,
  TIdea extends InfiniteResearchIdea = InfiniteResearchIdea,
> = {
  ariaLabel?: string;
  boardStacks: readonly InfiniteResearchStack<TPaper>[];
  exploreLabel?: string;
  exploreStacks: readonly InfiniteResearchStack<TPaper>[];
  ideas: readonly TIdea[];
  loading?: boolean;
  matchingPaperIds?: ReadonlySet<string> | readonly string[];
  onActionError?: (message: string, error?: unknown) => void;
  onAttachIdeaToPaper?: (idea: TIdea, paper: TPaper) => Promise<void> | void;
  onConnectPapers?: (source: TPaper, target: TPaper) => Promise<"connected" | "disconnected" | void> | "connected" | "disconnected" | void;
  onCreateSticky?: (draft: InfiniteResearchStickyDraft) => Promise<TIdea | null | void>;
  onDetachIdeaFromPaper?: (idea: TIdea, paper: TPaper) => Promise<void> | void;
  onOpenIdeaDetails?: (idea: TIdea) => void;
  onOpenPaperDetails?: (paper: TPaper) => void;
  onSelectionChange?: (selection: InfiniteResearchSelection) => void;
  paperConnections?: readonly InfiniteResearchPaperConnection[];
  persistenceScope?: string;
  selection?: InfiniteResearchSelection;
};

type PanGesture = {
  origin: ResearchInfiniteCamera;
  pointerId: number;
  startX: number;
  startY: number;
};

type ObjectGesture = {
  id: string;
  kind: ResearchBoardObjectKind;
  mode: InfiniteResearchMode;
  moved: boolean;
  origin: ResearchWorldRect;
  pointerId: number;
  startX: number;
  startY: number;
};

type ConnectionGesture = {
  current: ResearchWorldPoint;
  pointerId: number;
  source: ResearchRelationshipEndpoint;
  start: ResearchWorldPoint;
};

type RelationshipLabelGesture = {
  id: string;
  origin: ResearchWorldPoint;
  pointerId: number;
  relationship: DisplayRelationship;
  startX: number;
  startY: number;
};

type ContextMenuState = {
  endpoint?: ResearchRelationshipEndpoint;
  relationshipId?: string;
  x: number;
  y: number;
};

type DisplayRelationship = ResearchBoardRelationship & { external?: "paper" | "sticky" };

function finite(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function excerpt(value: string | undefined, length: number) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, Math.max(1, length - 1)).trimEnd()}…` : text;
}

function ideaId(idea: InfiniteResearchIdea) {
  return idea.path || idea.id;
}

function normalizedDoi(value: string | undefined) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .toLowerCase();
}

function paperRefMatches(paper: InfiniteResearchPaper, value: string) {
  const ref = String(value || "").trim();
  if (ref === paper.id || ref === `id:${paper.id}`) return true;
  if (ref.startsWith("doi:")) return normalizedDoi(paper.doi) === normalizedDoi(ref.slice(4));
  if (ref.startsWith("zotero:")) return paper.zoteroKey === ref.slice(7);
  if (ref.startsWith("vault:")) return String(paper.path || "").replace(/\\/g, "/") === ref.slice(6).replace(/\\/g, "/");
  return false;
}

function normalizedPaperReference(value: string) {
  const ref = String(value || "").trim();
  if (ref.startsWith("doi:")) return `doi:${normalizedDoi(ref.slice(4))}`;
  if (ref.startsWith("vault:")) return `vault:${ref.slice(6).replace(/\\/g, "/")}`;
  return ref;
}

function rectCenter(rect: ResearchWorldRect): ResearchWorldPoint {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function linePath(a: ResearchWorldPoint, b: ResearchWorldPoint) {
  const curve = Math.max(50, Math.min(260, Math.abs(b.x - a.x) * 0.32));
  return `M ${a.x} ${a.y} C ${a.x + curve} ${a.y}, ${b.x - curve} ${b.y}, ${b.x} ${b.y}`;
}

function sameEndpoint(a: ResearchRelationshipEndpoint, b: ResearchRelationshipEndpoint) {
  return a.kind === b.kind && a.id === b.id;
}

function relationshipEndpointsId(a: ResearchRelationshipEndpoint, b: ResearchRelationshipEndpoint) {
  return [`${a.kind}:${a.id}`, `${b.kind}:${b.id}`].sort().join("::");
}

function loadJson(key: string) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}

function loadInitialBoard(scope: string) {
  const scopedKey = `${BOARD_STORAGE_KEY}:${scope}`;
  const stored = loadJson(scopedKey);
  if (stored) return { saved: true, state: normalizeResearchBoardState(stored) };
  const legacy = loadJson(LEGACY_LAYOUT_KEY);
  const legacyCamera = loadJson(LEGACY_CAMERA_KEY);
  const migrated = migrateLegacyResearchBoardState(legacy);
  if (legacyCamera) migrated.camera = legacyCamera;
  return { saved: Boolean(legacy || legacyCamera), state: migrated };
}

function loadExploreCamera(scope: string): ResearchInfiniteCamera {
  const value = loadJson(`${EXPLORE_CAMERA_STORAGE_KEY}:${scope}`);
  return value && typeof value === "object"
    ? { scale: finite(value.scale, 0.8), x: finite(value.x, 72), y: finite(value.y, 98) }
    : { scale: 0.8, x: 72, y: 98 };
}

export function InfiniteResearchCanvas<
  TPaper extends InfiniteResearchPaper,
  TIdea extends InfiniteResearchIdea,
>({
  ariaLabel = "Infinite Research board",
  boardStacks,
  exploreLabel = "Current arrangement",
  exploreStacks,
  ideas,
  loading = false,
  matchingPaperIds,
  onActionError,
  onAttachIdeaToPaper,
  onConnectPapers,
  onCreateSticky,
  onDetachIdeaFromPaper,
  onOpenIdeaDetails,
  onOpenPaperDetails,
  onSelectionChange,
  paperConnections = [],
  persistenceScope = "main",
  selection,
}: InfiniteResearchCanvasProps<TPaper, TIdea>) {
  const instanceId = useId().replace(/:/g, "");
  const initialRef = useRef<ReturnType<typeof loadInitialBoard> | null>(null);
  if (!initialRef.current) initialRef.current = loadInitialBoard(persistenceScope);
  const [history, setHistory] = useState<ResearchBoardHistory>(() => createResearchBoardHistory(initialRef.current!.state));
  const [mode, setMode] = useState<InfiniteResearchMode>("board");
  const [exploreCamera, setExploreCamera] = useState<ResearchInfiniteCamera>(() => loadExploreCamera(persistenceScope));
  const [viewport, setViewport] = useState({ height: 1, width: 1 });
  const [expandedExploreKeys, setExpandedExploreKeys] = useState<string[]>([]);
  const [hoveredStackKey, setHoveredStackKey] = useState<string | null>(null);
  const [hoveredPeekIndex, setHoveredPeekIndex] = useState(0);
  const [readerPaper, setReaderPaper] = useState<TPaper | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [connectionSource, setConnectionSource] = useState<ResearchRelationshipEndpoint | null>(null);
  const [connectionGesture, setConnectionGesture] = useState<ConnectionGesture | null>(null);
  const [transientRect, setTransientRect] = useState<{ id: string; kind: ResearchBoardObjectKind; rect: ResearchWorldRect } | null>(null);
  const [selectedRelationshipId, setSelectedRelationshipId] = useState<string | null>(null);
  const [relationshipLabelDraft, setRelationshipLabelDraft] = useState("");
  const [transientRelationshipOffset, setTransientRelationshipOffset] = useState<{ id: string; offset: ResearchWorldPoint } | null>(null);
  const [stickyDraft, setStickyDraft] = useState<{ text: string; x: number; y: number } | null>(null);
  const [savingSticky, setSavingSticky] = useState(false);
  const [actionMessage, setActionMessage] = useState("Board ready.");
  const [spaceHeld, setSpaceHeld] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<PanGesture | null>(null);
  const objectRef = useRef<ObjectGesture | null>(null);
  const relationshipLabelRef = useRef<RelationshipLabelGesture | null>(null);
  const suppressClickRef = useRef("");
  const hoverTimerRef = useRef<number | null>(null);
  const exploreFocusHistoryRef = useRef<ResearchInfiniteCamera[]>([]);
  const exploreInitializedRef = useRef(false);

  const board = history.present;
  const camera = mode === "board" ? board.camera : exploreCamera;
  const matchingIds = useMemo(() => matchingPaperIds === undefined
    ? null
    : matchingPaperIds instanceof Set
      ? matchingPaperIds
      : new Set(matchingPaperIds), [matchingPaperIds]);
  const allPapers = useMemo(() => {
    const map = new Map<string, TPaper>();
    [...boardStacks, ...exploreStacks].forEach((stack) => stack.papers.forEach((paper) => map.set(paper.id, paper)));
    return [...map.values()];
  }, [boardStacks, exploreStacks]);
  const paperById = useMemo(() => new Map(allPapers.map((paper) => [paper.id, paper])), [allPapers]);
  const paperByReference = useMemo(() => {
    const map = new Map<string, TPaper>();
    for (const paper of allPapers) {
      map.set(paper.id, paper);
      map.set(`id:${paper.id}`, paper);
      const doi = normalizedDoi(paper.doi);
      if (doi) map.set(`doi:${doi}`, paper);
      if (paper.zoteroKey) map.set(`zotero:${paper.zoteroKey}`, paper);
      if (paper.path) map.set(`vault:${paper.path.replace(/\\/g, "/")}`, paper);
    }
    return map;
  }, [allPapers]);
  const ideaById = useMemo(() => new Map(ideas.map((idea) => [ideaId(idea), idea])), [ideas]);
  const stackByKey = useMemo(() => new Map((mode === "board" ? boardStacks : exploreStacks).map((stack) => [stack.key, stack])), [boardStacks, exploreStacks, mode]);

  useLayoutEffect(() => {
    const node = viewportRef.current;
    if (!node) return undefined;
    const measure = () => setViewport({ height: Math.max(1, node.clientHeight), width: Math.max(1, node.clientWidth) });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const stickyIds = ideas.map(ideaId);
    setHistory((current) => {
      const present = ensureResearchBoardObjects(
        current.present,
        boardStacks.map((stack) => ({ key: stack.key, paperCount: stack.papers.length, paperIds: stack.papers.map((paper) => paper.id) })),
        stickyIds,
        viewport.width > 1_700 ? 5 : viewport.width > 1_050 ? 4 : 3,
      );
      return { ...current, present };
    });
  }, [boardStacks, ideas, viewport.width]);

  useEffect(() => {
    try { localStorage.setItem(`${BOARD_STORAGE_KEY}:${persistenceScope}`, JSON.stringify(board)); } catch { /* persistence is optional */ }
  }, [board, persistenceScope]);

  useEffect(() => {
    try { localStorage.setItem(`${EXPLORE_CAMERA_STORAGE_KEY}:${persistenceScope}`, JSON.stringify(exploreCamera)); } catch { /* persistence is optional */ }
  }, [exploreCamera, persistenceScope]);

  const boardObstacles = useMemo(() => [
    ...board.loosePaperIds.map((id) => board.paperRects[id]).filter(Boolean),
    ...Object.values(board.stickyRects),
  ], [board.loosePaperIds, board.paperRects, board.stickyRects]);
  const boardPlan = useMemo(() => planResearchBoardLayout(boardStacks, board, boardObstacles), [board, boardObstacles, boardStacks]);
  const explorePlan = useMemo(() => planResearchExploreLayout(exploreStacks, expandedExploreKeys, {
    maxColumns: viewport.width > 1_800 ? 6 : 5,
    maxWorldWidth: viewport.width > 1_700 ? 2_250 : 1_760,
  }), [expandedExploreKeys, exploreStacks, viewport.width]);
  const activeBounds = mode === "board" ? boardPlan.bounds : explorePlan.bounds;
  const semanticTier = researchSemanticTier(camera.scale, PAPER_WIDTH);
  const visibleWorld = useMemo(() => visibleResearchWorldRect(camera, viewport, 420), [camera, viewport]);

  useEffect(() => {
    if (mode !== "board" || initialRef.current?.saved || boardStacks.length === 0 || viewport.width <= 1 || viewport.height <= 1) return;
    const fitted = fitInCanvas(boardPlan.bounds, 0.92, 36);
    initialRef.current!.saved = true;
    setHistory((current) => ({ ...current, present: { ...current.present, camera: fitted } }));
  }, [boardPlan.bounds, boardStacks.length, mode, viewport]);

  const renderedRects = useMemo(() => {
    const paper = new Map<string, ResearchWorldRect>();
    const stack = new Map<string, ResearchWorldRect>();
    const sticky = new Map<string, ResearchWorldRect>();
    if (mode === "board") {
      boardPlan.groups.forEach((group) => {
        stack.set(group.key, group.bodyRect);
        if (group.expanded) group.paperIds.forEach((id) => {
          const rect = boardPlan.paperRects[id];
          if (rect) paper.set(id, rect);
        });
        else if (group.paperIds[0]) paper.set(group.paperIds[0], group.bodyRect);
      });
      board.loosePaperIds.forEach((id) => {
        const rect = board.paperRects[id];
        if (rect) paper.set(id, rect);
      });
      Object.entries(board.stickyRects).forEach(([id, rect]) => sticky.set(id, rect));
    } else {
      explorePlan.groups.forEach((group) => {
        stack.set(group.key, group.bodyRect);
        if (group.expanded) group.paperIds.forEach((id) => {
          const rect = explorePlan.paperRects[id];
          if (rect) paper.set(id, rect);
        });
        else if (group.paperIds[0]) paper.set(group.paperIds[0], group.bodyRect);
      });
    }
    return { paper, stack, sticky };
  }, [board.loosePaperIds, board.paperRects, board.stickyRects, boardPlan, explorePlan, mode]);

  const externalRelationships = useMemo<DisplayRelationship[]>(() => {
    const result: DisplayRelationship[] = [];
    for (const connection of paperConnections) {
      const a = paperByReference.get(normalizedPaperReference(connection.a)) || allPapers.find((paper) => paperRefMatches(paper, connection.a));
      const b = paperByReference.get(normalizedPaperReference(connection.b)) || allPapers.find((paper) => paperRefMatches(paper, connection.b));
      if (!a || !b) continue;
      result.push({
        a: { id: a.id, kind: "paper" },
        b: { id: b.id, kind: "paper" },
        external: "paper",
        id: `paper:${relationshipEndpointsId({ id: a.id, kind: "paper" }, { id: b.id, kind: "paper" })}`,
        label: "",
        labelOffset: { x: 0, y: 0 },
      });
    }
    for (const idea of ideas) {
      for (const ref of idea.connectedPaperRefs || []) {
        const paper = paperByReference.get(normalizedPaperReference(ref)) || allPapers.find((candidate) => paperRefMatches(candidate, ref));
        if (!paper) continue;
        const a = { id: ideaId(idea), kind: "sticky" } as const;
        const b = { id: paper.id, kind: "paper" } as const;
        result.push({
          a,
          b,
          external: "sticky",
          id: `sticky:${relationshipEndpointsId(a, b)}`,
          label: "",
          labelOffset: { x: 0, y: 0 },
        });
      }
    }
    return result;
  }, [allPapers, ideas, paperByReference, paperConnections]);
  const relationships = useMemo<DisplayRelationship[]>(() => {
    const localByEndpoints = new Set(board.relationships.map((relationship) => relationshipEndpointsId(relationship.a, relationship.b)));
    return [
      ...board.relationships,
      ...externalRelationships.filter((relationship) => !localByEndpoints.has(relationshipEndpointsId(relationship.a, relationship.b))),
    ];
  }, [board.relationships, externalRelationships]);
  const selectedRelationship = relationships.find((relationship) => relationship.id === selectedRelationshipId) || null;

  useEffect(() => {
    setRelationshipLabelDraft(selectedRelationship?.label || "");
  }, [selectedRelationship?.id, selectedRelationship?.label]);

  function setCamera(next: ResearchInfiniteCamera | ((camera: ResearchInfiniteCamera) => ResearchInfiniteCamera)) {
    if (mode === "board") {
      setHistory((current) => {
        const cameraValue = typeof next === "function" ? next(current.present.camera) : next;
        return { ...current, present: { ...current.present, camera: cameraValue } };
      });
    } else {
      setExploreCamera((current) => typeof next === "function" ? next(current) : next);
    }
  }

  function commitBoard(next: ReturnType<typeof normalizeResearchBoardState>) {
    setHistory((current) => commitResearchBoardHistory(current, next));
  }

  function viewportPoint(clientX: number, clientY: number) {
    const bounds = viewportRef.current?.getBoundingClientRect();
    return { x: clientX - (bounds?.left || 0), y: clientY - (bounds?.top || 0) };
  }

  function updateSelection(next: InfiniteResearchSelection) {
    setSelectedRelationshipId(null);
    onSelectionChange?.(next);
  }

  function fitInCanvas(rect: ResearchWorldRect, maxScale: number, padding = 42) {
    const safe = {
      bottom: viewport.width <= 760 ? 72 : 58,
      left: 26,
      right: 26,
      top: viewport.width <= 760 ? 106 : 72,
    };
    const inner = {
      height: Math.max(1, viewport.height - safe.top - safe.bottom),
      width: Math.max(1, viewport.width - safe.left - safe.right),
    };
    const fitted = fitResearchInfiniteCamera(rect, inner, { maxScale, padding });
    return { ...fitted, x: fitted.x + safe.left, y: fitted.y + safe.top };
  }

  function focusRect(rect: ResearchWorldRect) {
    const target = fitInCanvas(rect, 1.65, 70);
    if (mode === "board") {
      setHistory((current) => ({
        ...current,
        present: { ...pushResearchBoardFocus(current.present, current.present.camera), camera: target },
      }));
    } else {
      exploreFocusHistoryRef.current = [...exploreFocusHistoryRef.current.slice(-11), exploreCamera];
      setExploreCamera(target);
    }
  }

  function fitAll() {
    if (activeBounds.width <= 0 || activeBounds.height <= 0) return;
    const target = fitInCanvas(activeBounds, 1, 36);
    if (mode === "board") {
      setHistory((current) => ({
        ...current,
        present: { ...pushResearchBoardFocus(current.present, current.present.camera), camera: target },
      }));
    } else {
      exploreFocusHistoryRef.current = [...exploreFocusHistoryRef.current.slice(-11), exploreCamera];
      setExploreCamera(target);
    }
    setActionMessage(`Fit ${mode === "board" ? "the board" : "the current arrangement"}.`);
  }

  function fitSelection() {
    if (selectedRelationship) {
      const a = endpointRect(selectedRelationship.a);
      const b = endpointRect(selectedRelationship.b);
      if (a && b) focusRect(researchWorldRectUnion([a, b], 100));
      return;
    }
    if (!selection) return;
    const endpoint = { id: selection.path, kind: selection.kind === "idea" ? "sticky" : "paper" } as ResearchRelationshipEndpoint;
    const rect = endpointRect(endpoint);
    if (rect) focusRect(rect);
  }

  function backFocus() {
    if (mode === "board") {
      setHistory((current) => {
        const popped = popResearchBoardFocus(current.present);
        return popped.camera ? { ...current, present: { ...popped.state, camera: popped.camera } } : current;
      });
    } else {
      const previous = exploreFocusHistoryRef.current.at(-1);
      if (previous) {
        exploreFocusHistoryRef.current = exploreFocusHistoryRef.current.slice(0, -1);
        setExploreCamera(previous);
      }
    }
  }

  function switchMode(nextMode: InfiniteResearchMode) {
    if (nextMode === mode) return;
    setContextMenu(null);
    setConnectionSource(null);
    setMode(nextMode);
    if (nextMode === "explore" && !exploreInitializedRef.current && explorePlan.bounds.width > 0) {
      exploreInitializedRef.current = true;
      setExploreCamera(fitInCanvas(explorePlan.bounds, 0.88, 36));
    }
    setActionMessage(nextMode === "board"
      ? "Returned to your unchanged Board."
      : `${exploreLabel}. Board positions are untouched.`);
  }

  function beginPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.button !== 1) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-research-v4-object], button, input, textarea, select, [data-research-v4-relationship]")) return;
    event.preventDefault();
    viewportRef.current?.setPointerCapture(event.pointerId);
    panRef.current = { origin: camera, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
    setContextMenu(null);
    updateSelection(null);
  }

  function beginObjectDrag(
    event: ReactPointerEvent<HTMLElement>,
    kind: ResearchBoardObjectKind,
    id: string,
    rect: ResearchWorldRect,
  ) {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    event.stopPropagation();
    viewportRef.current?.setPointerCapture(event.pointerId);
    objectRef.current = { id, kind, mode, moved: false, origin: rect, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
    setTransientRect({ id, kind, rect });
    setContextMenu(null);
  }

  function beginConnection(event: ReactPointerEvent<HTMLButtonElement>, source: ResearchRelationshipEndpoint, rect: ResearchWorldRect) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    viewportRef.current?.setPointerCapture(event.pointerId);
    const start = rectCenter(rect);
    setConnectionSource(source);
    setConnectionGesture({ current: start, pointerId: event.pointerId, source, start });
  }

  function beginRelationshipLabelDrag(event: ReactPointerEvent<SVGTextElement>, relationship: DisplayRelationship) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    viewportRef.current?.setPointerCapture(event.pointerId);
    relationshipLabelRef.current = {
      id: relationship.id,
      origin: relationship.labelOffset,
      pointerId: event.pointerId,
      relationship,
      startX: event.clientX,
      startY: event.clientY,
    };
    setSelectedRelationshipId(relationship.id);
    onSelectionChange?.(null);
  }

  function movePointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (relationshipLabelRef.current?.pointerId === event.pointerId) {
      const gesture = relationshipLabelRef.current;
      setTransientRelationshipOffset({
        id: gesture.id,
        offset: {
          x: gesture.origin.x + (event.clientX - gesture.startX) / camera.scale,
          y: gesture.origin.y + (event.clientY - gesture.startY) / camera.scale,
        },
      });
      return;
    }
    if (panRef.current?.pointerId === event.pointerId) {
      const gesture = panRef.current;
      setCamera({
        ...gesture.origin,
        x: gesture.origin.x + event.clientX - gesture.startX,
        y: gesture.origin.y + event.clientY - gesture.startY,
      });
      return;
    }
    if (objectRef.current?.pointerId === event.pointerId) {
      const gesture = objectRef.current;
      const dx = (event.clientX - gesture.startX) / camera.scale;
      const dy = (event.clientY - gesture.startY) / camera.scale;
      if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 4) gesture.moved = true;
      setTransientRect({
        id: gesture.id,
        kind: gesture.kind,
        rect: { ...gesture.origin, x: gesture.origin.x + dx, y: gesture.origin.y + dy },
      });
      return;
    }
    if (connectionGesture?.pointerId === event.pointerId) {
      setConnectionGesture((current) => current ? {
        ...current,
        current: researchScreenToWorld(viewportPoint(event.clientX, event.clientY), camera),
      } : null);
    }
  }

  async function connectEndpoints(source: ResearchRelationshipEndpoint, target: ResearchRelationshipEndpoint) {
    if (sameEndpoint(source, target)) return;
    try {
      if (source.kind === "paper" && target.kind === "paper") {
        const sourcePaper = paperById.get(source.id);
        const targetPaper = paperById.get(target.id);
        if (!sourcePaper || !targetPaper) return;
        const result = await onConnectPapers?.(sourcePaper, targetPaper);
        if (result === "disconnected") {
          const id = relationshipEndpointsId(source, target);
          setHistory((current) => ({
            ...current,
            present: {
              ...current.present,
              relationships: current.present.relationships.filter((relationship) => relationshipEndpointsId(relationship.a, relationship.b) !== id),
            },
          }));
          setActionMessage("Paper relationship removed.");
          return;
        }
      } else if ((source.kind === "sticky" && target.kind === "paper") || (source.kind === "paper" && target.kind === "sticky")) {
        const sticky = source.kind === "sticky" ? source : target;
        const paper = source.kind === "paper" ? source : target;
        const idea = ideaById.get(sticky.id);
        const targetPaper = paperById.get(paper.id);
        if (!idea || !targetPaper) return;
        await onAttachIdeaToPaper?.(idea, targetPaper);
      }
      const next = createResearchBoardRelationship(board, { a: source, b: target, label: "" });
      const created = next.relationships.find((relationship) => relationshipEndpointsId(relationship.a, relationship.b) === relationshipEndpointsId(source, target));
      commitBoard(next);
      setSelectedRelationshipId(created?.id || null);
      onSelectionChange?.(null);
      setActionMessage("Relationship created. Add a label whenever it helps.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "That relationship could not be created.";
      setActionMessage(message);
      onActionError?.(message, error);
    }
  }

  async function finishPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (relationshipLabelRef.current?.pointerId === event.pointerId) {
      const gesture = relationshipLabelRef.current;
      const offset = transientRelationshipOffset?.id === gesture.id
        ? transientRelationshipOffset.offset
        : gesture.origin;
      relationshipLabelRef.current = null;
      setTransientRelationshipOffset(null);
      adoptAndUpdateRelationship(gesture.relationship, { labelOffset: offset });
      setActionMessage("Relationship label moved.");
    }
    if (panRef.current?.pointerId === event.pointerId) panRef.current = null;
    if (objectRef.current?.pointerId === event.pointerId) {
      const gesture = objectRef.current;
      const nextRect = transientRect?.id === gesture.id ? transientRect.rect : gesture.origin;
      objectRef.current = null;
      setTransientRect(null);
      if (gesture.moved) {
        suppressClickRef.current = `${gesture.kind}:${gesture.id}`;
        window.setTimeout(() => { suppressClickRef.current = ""; }, 0);
        if (gesture.mode === "explore" && gesture.kind === "paper") {
          const screen = viewportPoint(event.clientX, event.clientY);
          const boardPoint = researchScreenToWorld(screen, board.camera);
          const boardRect = { ...nextRect, x: boardPoint.x - PAPER_WIDTH / 2, y: boardPoint.y - PAPER_HEIGHT / 2 };
          commitBoard(moveResearchBoardObject(board, "paper", gesture.id, boardRect));
          switchMode("board");
          updateSelection({ kind: "paper", path: gesture.id });
          setActionMessage("Paper placed on your Board as a loose paper.");
        } else if (gesture.mode === "board") {
          commitBoard(moveResearchBoardObject(board, gesture.kind, gesture.id, nextRect));
          if (gesture.kind === "paper") updateSelection({ kind: "paper", path: gesture.id });
          if (gesture.kind === "sticky") updateSelection({ kind: "idea", path: gesture.id });
        }
      }
    }
    if (connectionGesture?.pointerId === event.pointerId) {
      const gesture = connectionGesture;
      const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-research-endpoint-kind][data-research-endpoint-id]");
      const kind = hit?.dataset.researchEndpointKind as ResearchBoardObjectKind | undefined;
      const id = hit?.dataset.researchEndpointId;
      setConnectionGesture(null);
      if (kind && id) await connectEndpoints(gesture.source, { id, kind });
    }
    try { viewportRef.current?.releasePointerCapture(event.pointerId); } catch { /* capture may already be released */ }
  }

  function cancelPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (relationshipLabelRef.current?.pointerId === event.pointerId) relationshipLabelRef.current = null;
    if (panRef.current?.pointerId === event.pointerId) panRef.current = null;
    if (objectRef.current?.pointerId === event.pointerId) objectRef.current = null;
    setTransientRect(null);
    setConnectionGesture(null);
    setTransientRelationshipOffset(null);
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const anchor = viewportPoint(event.clientX, event.clientY);
    setCamera((current) => zoomResearchInfiniteCameraFromWheel(current, event.deltaY, anchor));
  }

  function toggleStack(key: string) {
    if (mode === "board") commitBoard(toggleResearchBoardStack(board, key));
    else setExpandedExploreKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
    setActionMessage(`${mode === "board" ? "Board" : "Explore"} stack ${mode === "board" ? (board.expandedStackKeys.includes(key) ? "restacked" : "spread") : (expandedExploreKeys.includes(key) ? "restacked" : "spread")}.`);
  }

  function endpointRect(endpoint: ResearchRelationshipEndpoint) {
    const rendered = renderedRects[endpoint.kind].get(endpoint.id);
    if (rendered || endpoint.kind !== "paper") return rendered || null;
    const plan = mode === "board" ? boardPlan : explorePlan;
    return plan.groups.find((group) => group.paperIds.includes(endpoint.id))?.bodyRect || null;
  }

  function clickEndpoint(endpoint: ResearchRelationshipEndpoint) {
    if (suppressClickRef.current === `${endpoint.kind}:${endpoint.id}`) return;
    if (connectionSource && !sameEndpoint(connectionSource, endpoint)) {
      void connectEndpoints(connectionSource, endpoint);
      setConnectionSource(null);
      return;
    }
    if (endpoint.kind === "paper") updateSelection({ kind: "paper", path: endpoint.id });
    if (endpoint.kind === "sticky") updateSelection({ kind: "idea", path: endpoint.id });
  }

  function openPaper(paper: TPaper) {
    updateSelection({ kind: "paper", path: paper.id });
    setReaderPaper(paper);
    setContextMenu(null);
  }

  function openSticky(idea: TIdea) {
    updateSelection({ kind: "idea", path: ideaId(idea) });
    onOpenIdeaDetails?.(idea);
    setContextMenu(null);
  }

  function showContextMenu(event: ReactPointerEvent<Element> | ReactMouseEvent<Element>, endpoint?: ResearchRelationshipEndpoint, relationshipId?: string) {
    event.preventDefault();
    event.stopPropagation();
    const point = viewportPoint(event.clientX, event.clientY);
    setContextMenu({ endpoint, relationshipId, x: point.x, y: point.y });
  }

  function startConnectionFrom(endpoint: ResearchRelationshipEndpoint) {
    setConnectionSource(endpoint);
    setContextMenu(null);
    setActionMessage("Choose another paper, stack, or sticky to connect.");
  }

  function openStickyDraftAt(point?: ResearchWorldPoint) {
    if (!onCreateSticky) return;
    if (mode !== "board") switchMode("board");
    const center = point || researchScreenToWorld({ x: viewport.width / 2, y: viewport.height / 2 }, board.camera);
    setStickyDraft({ text: "", x: center.x - STICKY_WIDTH / 2, y: center.y - STICKY_HEIGHT / 2 });
    setContextMenu(null);
  }

  async function saveSticky(event: FormEvent) {
    event.preventDefault();
    if (!stickyDraft?.text.trim() || !onCreateSticky || savingSticky) return;
    setSavingSticky(true);
    try {
      const created = await onCreateSticky(stickyDraft);
      if (created) {
        const id = ideaId(created);
        const seeded = ensureResearchBoardObjects(board, boardStacks.map((stack) => ({ key: stack.key, paperCount: stack.papers.length })), [...ideas.map(ideaId), id]);
        commitBoard(moveResearchBoardObject(seeded, "sticky", id, {
          height: STICKY_HEIGHT,
          width: STICKY_WIDTH,
          x: stickyDraft.x,
          y: stickyDraft.y,
        }));
      }
      setStickyDraft(null);
      setActionMessage("Sticky note placed on the Board.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "That sticky note could not be saved.";
      setActionMessage(message);
      onActionError?.(message, error);
    } finally {
      setSavingSticky(false);
    }
  }

  function relationshipForId(id: string) {
    return relationships.find((relationship) => relationship.id === id) || null;
  }

  function adoptAndUpdateRelationship(relationship: DisplayRelationship, updates: Partial<ResearchBoardRelationship>) {
    let next = board.relationships.some((item) => item.id === relationship.id)
      ? board
      : createResearchBoardRelationship(board, relationship);
    next = updateResearchBoardRelationship(next, relationship.id, updates);
    commitBoard(next);
  }

  function saveRelationshipLabel() {
    if (!selectedRelationship) return;
    adoptAndUpdateRelationship(selectedRelationship, { label: relationshipLabelDraft.trim() });
    setActionMessage(relationshipLabelDraft.trim() ? "Relationship label saved." : "Relationship label cleared.");
  }

  async function removeRelationship(relationship: DisplayRelationship) {
    try {
      if (relationship.external === "paper" || (relationship.a.kind === "paper" && relationship.b.kind === "paper")) {
        const a = paperById.get(relationship.a.id);
        const b = paperById.get(relationship.b.id);
        if (a && b && externalRelationships.some((item) => relationshipEndpointsId(item.a, item.b) === relationshipEndpointsId(relationship.a, relationship.b))) {
          await onConnectPapers?.(a, b);
        }
      } else if (relationship.external === "sticky" || [relationship.a.kind, relationship.b.kind].includes("sticky")) {
        const sticky = relationship.a.kind === "sticky" ? relationship.a : relationship.b.kind === "sticky" ? relationship.b : null;
        const paper = relationship.a.kind === "paper" ? relationship.a : relationship.b.kind === "paper" ? relationship.b : null;
        const idea = sticky ? ideaById.get(sticky.id) : null;
        const targetPaper = paper ? paperById.get(paper.id) : null;
        if (idea && targetPaper) await onDetachIdeaFromPaper?.(idea, targetPaper);
      }
      commitBoard(removeResearchBoardRelationship(board, relationship.id));
      setSelectedRelationshipId(null);
      setContextMenu(null);
      setActionMessage("Relationship removed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "That relationship could not be removed.";
      onActionError?.(message, error);
      setActionMessage(message);
    }
  }

  function showStackHover(key: string) {
    if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    setHoveredStackKey(key);
  }

  function hideStackHover() {
    if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => setHoveredStackKey(null), 150);
  }

  useEffect(() => () => {
    if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches("input, textarea, select, [contenteditable='true']");
      if (event.code === "Space" && !typing) setSpaceHeld(event.type === "keydown");
      if (event.type !== "keydown") return;
      if (event.key === "Escape") {
        if (readerPaper) setReaderPaper(null);
        else if (stickyDraft) setStickyDraft(null);
        else if (contextMenu) setContextMenu(null);
        else if (connectionSource) setConnectionSource(null);
      }
      if (!typing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        setHistory((current) => event.shiftKey ? redoResearchBoardHistory(current) : undoResearchBoardHistory(current));
      }
    };
    window.addEventListener("keydown", handleKey);
    window.addEventListener("keyup", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("keyup", handleKey);
    };
  }, [connectionSource, contextMenu, readerPaper, stickyDraft]);

  const relationshipLines = useMemo(() => relationships.flatMap((relationship) => {
    const aRect = endpointRect(relationship.a);
    const bRect = endpointRect(relationship.b);
    if (!aRect || !bRect) return [];
    if (semanticTier === "library" && relationship.id !== selectedRelationshipId) return [];
    return [{ ...relationship, aPoint: rectCenter(aRect), bPoint: rectCenter(bRect) }];
  }), [relationships, renderedRects, selectedRelationshipId, semanticTier]);

  const worldStyle = {
    "--research-v4-screen-pixel": `${1 / Math.max(camera.scale, 0.00001)}px`,
    height: 1,
    left: 0,
    position: "absolute",
    top: 0,
    transform: `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.scale})`,
    transformOrigin: "0 0",
    width: 1,
  } as CSSProperties;

  function visible(rect: ResearchWorldRect) {
    return researchWorldRectsIntersect(rect, visibleWorld);
  }

  function paperCard(
    paper: TPaper,
    sourceRect: ResearchWorldRect,
    options: { loose?: boolean; peek?: boolean; peekIndex?: number; peekStackKey?: string } = {},
  ) {
    const rect = transientRect?.kind === "paper" && transientRect.id === paper.id ? transientRect.rect : sourceRect;
    if (!visible(rect)) return null;
    const endpoint = { id: paper.id, kind: "paper" } as const;
    const selected = selection?.kind === "paper" && selection.path === paper.id;
    const matches = matchingIds === null || matchingIds.has(paper.id);
    const detail = excerpt(paper.summaryPreview || paper.summary || paper.abstract || paper.citation, semanticTier === "reading" ? 1_100 : 440);
    return (
      <article
        aria-label={`${paper.title}. ${paper.authorLabel || "Unknown author"}.`}
        aria-selected={selected}
        className={`research-v4-paper ${selected ? "is-selected" : ""} ${matches ? "is-match" : "is-dimmed"} ${options.loose ? "is-loose" : ""} ${options.peek ? "is-peek" : ""}`}
        data-research-endpoint-id={paper.id}
        data-research-endpoint-kind="paper"
        data-research-v4-object="paper"
        key={`paper:${paper.id}`}
        onClick={() => clickEndpoint(endpoint)}
        onContextMenu={(event) => showContextMenu(event, endpoint)}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (suppressClickRef.current !== `paper:${paper.id}`) openPaper(paper);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") openPaper(paper);
          if (event.key === " ") clickEndpoint(endpoint);
        }}
        onMouseEnter={options.peekStackKey ? () => {
          showStackHover(options.peekStackKey!);
          setHoveredPeekIndex(options.peekIndex || 0);
        } : undefined}
        onMouseLeave={options.peekStackKey ? hideStackHover : undefined}
        onPointerDown={(event) => connectionSource ? event.stopPropagation() : beginObjectDrag(event, "paper", paper.id, rect)}
        role="option"
        style={{ height: rect.height, left: rect.x, top: rect.y, width: rect.width, zIndex: board.zOrder[`paper:${paper.id}`] || undefined }}
        tabIndex={0}
      >
        <div aria-hidden="true" className="research-v4-citation-page" />
        {paper.previewUrl || paper.documentUrl ? (
          <ResearchPdfPreview title={paper.title} url={paper.previewUrl || paper.documentUrl || ""} />
        ) : null}
        <div className="research-v4-paper-content">
          <span className="research-v4-paper-kicker">{paper.authorLabel || "Unknown author"} · {paper.year || "n.d."}</span>
          <h3 title={paper.title}>{paper.title}</h3>
          {semanticTier === "paper" || semanticTier === "reading" ? <p>{detail || "No abstract or summary is available yet."}</p> : null}
          <footer><span>{paper.primarySubject || "Unsorted"}</span><span>{paper.readingStatus?.replaceAll("_", " ") || "To read"}</span></footer>
        </div>
        {options.loose ? <span className="research-v4-loose-badge">Loose</span> : null}
        <button
          aria-label={`Connect ${paper.title}`}
          aria-pressed={connectionSource ? sameEndpoint(connectionSource, endpoint) : false}
          className="research-v4-link-handle"
          onClick={(event) => { event.stopPropagation(); startConnectionFrom(endpoint); }}
          onPointerDown={(event) => beginConnection(event, endpoint, rect)}
          type="button"
        ><Link2 /></button>
        {connectionSource && !sameEndpoint(connectionSource, endpoint) ? (
          <button className="research-v4-connect-here" onClick={(event) => { event.stopPropagation(); void connectEndpoints(connectionSource, endpoint); setConnectionSource(null); }} onPointerDown={(event) => event.stopPropagation()} type="button">Connect here</button>
        ) : null}
      </article>
    );
  }

  const activeGroups = mode === "board" ? boardPlan.groups : explorePlan.groups;
  const activePaperRects = mode === "board" ? boardPlan.paperRects : explorePlan.paperRects;
  const renderedPapers: ReactNode[] = [];
  const renderedGroupCards: ReactNode[] = [];
  const renderedHeaders: ReactNode[] = [];

  for (const group of activeGroups) {
    const stack = stackByKey.get(group.key);
    if (!stack) continue;
    const stackEndpoint = { id: group.key, kind: "stack" } as const;
    const stackRect = transientRect?.kind === "stack" && transientRect.id === group.key ? transientRect.rect : group.bodyRect;
    if (visible(group.headerRect)) {
      renderedHeaders.push(
        <button
          aria-expanded={group.expanded}
          className="research-v4-stack-heading"
          data-research-endpoint-id={group.key}
          data-research-endpoint-kind="stack"
          data-research-v4-object="stack-heading"
          key={`heading:${group.key}`}
          onContextMenu={(event) => showContextMenu(event, stackEndpoint)}
          onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); toggleStack(group.key); }}
          onPointerDown={(event) => {
            if (mode === "board") beginObjectDrag(event, "stack", group.key, stackRect);
            else event.stopPropagation();
          }}
          style={{ height: group.headerRect.height, left: group.headerRect.x, top: group.headerRect.y, width: group.headerRect.width }}
          type="button"
        >
          <span>{stack.label}</span>
          <strong>{stack.papers.length.toLocaleString()} {stack.papers.length === 1 ? "paper" : "papers"}</strong>
          <small>{group.expanded ? "Double-click to restack" : "Double-click to spread"}</small>
        </button>,
      );
    }
    if (group.expanded && semanticTier !== "library" && semanticTier !== "collection") {
      for (const paperId of group.paperIds) {
        const paper = paperById.get(paperId);
        const rect = activePaperRects[paperId];
        if (paper && rect) {
          const card = paperCard(paper, rect);
          if (card) renderedPapers.push(card);
        }
      }
    } else if (visible(stackRect)) {
      const stackedPapers = stack.papers.filter((paper) => mode !== "board" || !board.loosePaperIds.includes(paper.id));
      const front = matchingIds === null ? stackedPapers[0] : stackedPapers.find((paper) => matchingIds.has(paper.id)) || stackedPapers[0];
      if (!front) continue;
      const hovering = hoveredStackKey === group.key && semanticTier !== "library" && semanticTier !== "collection";
      if (hovering) {
        const peekRects = researchStackPeekRects(stackRect, stackedPapers.map((paper) => paper.id), { hoveredIndex: hoveredPeekIndex });
        for (const [index, paper] of stackedPapers.slice(0, 7).entries()) {
          const rect = peekRects[paper.id];
          if (!rect) continue;
          const card = paperCard(paper, rect, {
            peek: true,
            peekIndex: index,
            peekStackKey: group.key,
          });
          if (card) renderedPapers.push(card);
        }
      } else {
        renderedGroupCards.push(
          <article
            aria-label={`${stack.label}, ${stackedPapers.length} papers. Double-click to spread.`}
            className={`research-v4-stack ${matchingIds === null || stackedPapers.some((paper) => matchingIds.has(paper.id)) ? "is-match" : "is-dimmed"}`}
            data-research-endpoint-id={group.key}
            data-research-endpoint-kind="stack"
            data-research-v4-object="stack"
            key={`stack:${group.key}`}
            onClick={() => clickEndpoint(connectionSource ? stackEndpoint : { id: front.id, kind: "paper" })}
            onContextMenu={(event) => showContextMenu(event, stackEndpoint)}
            onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); toggleStack(group.key); }}
            onMouseEnter={() => showStackHover(group.key)}
            onMouseLeave={hideStackHover}
            onPointerDown={(event) => mode === "board" && !connectionSource ? beginObjectDrag(event, "stack", group.key, stackRect) : event.stopPropagation()}
            style={{ height: stackRect.height, left: stackRect.x, top: stackRect.y, width: stackRect.width, zIndex: board.zOrder[`stack:${group.key}`] || undefined }}
          >
            {Array.from({ length: Math.min(5, Math.max(1, stackedPapers.length - 1)) }, (_, index) => <i aria-hidden="true" key={index} style={{ "--stack-depth": index + 1 } as CSSProperties} />)}
            <div className="research-v4-paper-content">
              <span className="research-v4-paper-kicker">{front.authorLabel || "Unknown author"} · {front.year || "n.d."}</span>
              <h3>{front.title}</h3>
              <p>{semanticTier === "library" ? stack.label : `${stackedPapers.length.toLocaleString()} papers · Hover to peek`}</p>
              <footer><span>{stack.label}</span><span>{stackedPapers.length.toLocaleString()}</span></footer>
            </div>
            <button aria-label={`Connect ${stack.label} stack`} className="research-v4-link-handle" onClick={(event) => { event.stopPropagation(); startConnectionFrom(stackEndpoint); }} onPointerDown={(event) => beginConnection(event, stackEndpoint, stackRect)} type="button"><Link2 /></button>
            {connectionSource && !sameEndpoint(connectionSource, stackEndpoint) ? (
              <button className="research-v4-connect-here" onClick={(event) => { event.stopPropagation(); void connectEndpoints(connectionSource, stackEndpoint); setConnectionSource(null); }} onPointerDown={(event) => event.stopPropagation()} type="button">Connect here</button>
            ) : null}
          </article>,
        );
      }
    }
  }

  if (mode === "board" && semanticTier !== "library") {
    for (const paperId of board.loosePaperIds) {
      const paper = paperById.get(paperId);
      const rect = board.paperRects[paperId];
      if (paper && rect) {
        const card = paperCard(paper, rect, { loose: true });
        if (card) renderedPapers.push(card);
      }
    }
  }

  const renderedStickies = mode === "board" ? ideas.flatMap((idea) => {
    const id = ideaId(idea);
    const sourceRect = board.stickyRects[id];
    if (!sourceRect) return [];
    const rect = transientRect?.kind === "sticky" && transientRect.id === id ? transientRect.rect : sourceRect;
    if (!visible(rect)) return [];
    const endpoint = { id, kind: "sticky" } as const;
    const selected = selection?.kind === "idea" && selection.path === id;
    return [(
      <article
        aria-label={`Sticky note: ${idea.topic}`}
        aria-selected={selected}
        className={`research-v4-sticky ${selected ? "is-selected" : ""}`}
        data-research-endpoint-id={id}
        data-research-endpoint-kind="sticky"
        data-research-v4-object="sticky"
        key={`sticky:${id}`}
        onClick={() => clickEndpoint(endpoint)}
        onContextMenu={(event) => showContextMenu(event, endpoint)}
        onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); openSticky(idea); }}
        onPointerDown={(event) => connectionSource ? event.stopPropagation() : beginObjectDrag(event, "sticky", id, rect)}
        style={{ height: rect.height, left: rect.x, top: rect.y, width: rect.width, zIndex: board.zOrder[`sticky:${id}`] || undefined }}
      >
        <StickyNote aria-hidden="true" />
        <strong>{idea.topic}</strong>
        <p>{excerpt(idea.preview || idea.body, 300) || "A loose research note."}</p>
        <span><Link2 /> {(idea.connectedPaperRefs || []).length} connected</span>
        <button aria-label={`Connect sticky ${idea.topic}`} className="research-v4-link-handle" onClick={(event) => { event.stopPropagation(); startConnectionFrom(endpoint); }} onPointerDown={(event) => beginConnection(event, endpoint, rect)} type="button"><Link2 /></button>
        {connectionSource && !sameEndpoint(connectionSource, endpoint) ? (
          <button className="research-v4-connect-here" onClick={(event) => { event.stopPropagation(); void connectEndpoints(connectionSource, endpoint); setConnectionSource(null); }} onPointerDown={(event) => event.stopPropagation()} type="button">Connect here</button>
        ) : null}
      </article>
    )];
  }) : [];

  const renderedCount = renderedHeaders.length + renderedGroupCards.length + renderedPapers.length + renderedStickies.length;

  return (
    <div
      aria-label={ariaLabel}
      className={`research-v4-canvas ${panRef.current || spaceHeld ? "is-panning" : ""}`}
      data-research-mode={mode}
      data-research-semantic-tier={semanticTier}
      onContextMenu={(event) => showContextMenu(event)}
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest("[data-research-v4-object]")) return;
        fitAll();
      }}
      onPointerCancel={cancelPointer}
      onPointerDown={beginPan}
      onPointerMove={movePointer}
      onPointerUp={(event) => { void finishPointer(event); }}
      onWheel={handleWheel}
      ref={viewportRef}
      role="application"
      tabIndex={0}
    >
      <div aria-hidden="true" className="research-v4-grid" style={{ backgroundPosition: `${camera.x}px ${camera.y}px`, backgroundSize: `${Math.max(16, 80 * camera.scale)}px ${Math.max(16, 80 * camera.scale)}px` }} />

      <div aria-label="Research view" className="research-v4-mode-switch" role="tablist">
        <button aria-selected={mode === "board"} className={mode === "board" ? "is-active" : ""} onClick={() => switchMode("board")} role="tab" type="button">Board</button>
        <button aria-selected={mode === "explore"} className={mode === "explore" ? "is-active" : ""} onClick={() => switchMode("explore")} role="tab" type="button">Explore</button>
        <span>{mode === "board" ? "Persistent space" : exploreLabel}</span>
      </div>

      <div aria-label="Infinite Research controls" className="research-v4-controls" role="toolbar">
        <button aria-label="Zoom out" onClick={() => setCamera((current) => zoomResearchInfiniteCameraAtPoint(current, current.scale / 1.45, { x: viewport.width / 2, y: viewport.height / 2 }))} type="button"><Minus /></button>
        <button aria-label={`Current view: ${researchSemanticZoomLabel(semanticTier)}`} className="research-v4-semantic-label" onClick={fitAll} type="button">{researchSemanticZoomLabel(semanticTier)}</button>
        <button aria-label="Zoom in" onClick={() => setCamera((current) => zoomResearchInfiniteCameraAtPoint(current, current.scale * 1.45, { x: viewport.width / 2, y: viewport.height / 2 }))} type="button"><Plus /></button>
        <button onClick={fitAll} title="Fit everything" type="button"><Focus /> Fit</button>
        <button disabled={!selection && !selectedRelationship} onClick={fitSelection} title="Fit selection" type="button"><Maximize2 /> Selection</button>
        <button disabled={mode === "board" ? !board.focusHistory.length : !exploreFocusHistoryRef.current.length} onClick={backFocus} title="Back to last focus" type="button"><ChevronLeft /> Back</button>
        {mode === "board" ? <>
          <button disabled={!history.past.length} onClick={() => setHistory((current) => undoResearchBoardHistory(current))} title="Undo" type="button"><Undo2 /></button>
          <button disabled={!history.future.length} onClick={() => setHistory((current) => redoResearchBoardHistory(current))} title="Redo" type="button"><Redo2 /></button>
          <button disabled={!onCreateSticky} onClick={() => openStickyDraftAt()} type="button"><StickyNote /> Sticky</button>
        </> : null}
      </div>

      {connectionSource ? (
        <div className="research-v4-connection-banner" role="status"><Link2 /><span>Connecting from {connectionSource.kind}. Choose another object.</span><button onClick={() => setConnectionSource(null)} type="button"><X /></button></div>
      ) : null}

      <div className="research-v4-world" style={worldStyle}>
        <svg aria-label="Research relationships" className="research-v4-relationships">
          {relationshipLines.map((relationship) => {
            const labelOffset = transientRelationshipOffset?.id === relationship.id
              ? transientRelationshipOffset.offset
              : relationship.labelOffset;
            const midpoint = {
              x: (relationship.aPoint.x + relationship.bPoint.x) / 2 + labelOffset.x,
              y: (relationship.aPoint.y + relationship.bPoint.y) / 2 + labelOffset.y,
            };
            const selected = relationship.id === selectedRelationshipId;
            return (
              <g className={selected ? "is-selected" : ""} data-research-v4-relationship={relationship.id} key={relationship.id} onClick={(event) => { event.stopPropagation(); setSelectedRelationshipId(relationship.id); onSelectionChange?.(null); }} onContextMenu={(event) => showContextMenu(event, undefined, relationship.id)}>
                <path className="research-v4-relationship-visible" d={linePath(relationship.aPoint, relationship.bPoint)} vectorEffect="non-scaling-stroke" />
                <path className="research-v4-relationship-hit" d={linePath(relationship.aPoint, relationship.bPoint)} vectorEffect="non-scaling-stroke" />
                {relationship.label ? <text className="research-v4-relationship-label" onPointerDown={(event) => beginRelationshipLabelDrag(event, relationship)} textAnchor="middle" x={midpoint.x} y={midpoint.y}>{relationship.label}</text> : null}
              </g>
            );
          })}
          {connectionGesture ? <path className="research-v4-relationship-preview" d={linePath(connectionGesture.start, connectionGesture.current)} vectorEffect="non-scaling-stroke" /> : null}
        </svg>
        {renderedHeaders}
        {renderedGroupCards}
        {renderedPapers}
        {renderedStickies}
      </div>

      {mode === "explore" && ideas.length ? (
        <aside aria-label="Sticky shelf" className="research-v4-sticky-shelf">
          <span>Sticky shelf</span>
          {ideas.slice(0, 8).map((idea) => {
            const endpoint = { id: ideaId(idea), kind: "sticky" } as const;
            return <button data-research-endpoint-id={endpoint.id} data-research-endpoint-kind="sticky" key={endpoint.id} onClick={() => startConnectionFrom(endpoint)} title={`${idea.topic}: click to connect`} type="button"><StickyNote /> {idea.topic}</button>;
          })}
          {ideas.length > 8 ? <small>+{ideas.length - 8} more on Board</small> : null}
        </aside>
      ) : null}

      {selectedRelationship ? (
        <form className="research-v4-relationship-editor" onSubmit={(event) => { event.preventDefault(); saveRelationshipLabel(); }}>
          <Link2 />
          <input
            aria-label="Relationship label"
            onBlur={saveRelationshipLabel}
            onChange={(event) => setRelationshipLabelDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                saveRelationshipLabel();
              }
            }}
            placeholder="Label this connection…"
            value={relationshipLabelDraft}
          />
          <button aria-label="Reverse endpoints" onClick={() => adoptAndUpdateRelationship(selectedRelationship, { a: selectedRelationship.b, b: selectedRelationship.a })} title="Reverse endpoints" type="button"><RotateCcw /></button>
          <button aria-label="Remove relationship" onClick={() => { void removeRelationship(selectedRelationship); }} title="Remove" type="button"><Trash2 /></button>
          <button aria-label="Close relationship editor" onClick={() => setSelectedRelationshipId(null)} type="button"><X /></button>
        </form>
      ) : null}

      {contextMenu ? (
        <div className="research-v4-context-menu" onPointerDown={(event) => event.stopPropagation()} role="menu" style={{ left: Math.min(contextMenu.x, viewport.width - 220), top: Math.min(contextMenu.y, viewport.height - 260) }}>
          {contextMenu.relationshipId ? (() => {
            const relationship = relationshipForId(contextMenu.relationshipId!);
            return relationship ? <>
              <button onClick={() => { setSelectedRelationshipId(relationship.id); setContextMenu(null); }} role="menuitem" type="button"><Link2 /> Edit label</button>
              <button className="is-danger" onClick={() => { void removeRelationship(relationship); }} role="menuitem" type="button"><Trash2 /> Remove relationship</button>
            </> : null;
          })() : contextMenu.endpoint ? <>
            {contextMenu.endpoint.kind === "paper" ? <button onClick={() => { const paper = paperById.get(contextMenu.endpoint!.id); if (paper) openPaper(paper); }} role="menuitem" type="button"><BookOpen /> Open Reader</button> : null}
            {contextMenu.endpoint.kind === "sticky" ? <button onClick={() => { const idea = ideaById.get(contextMenu.endpoint!.id); if (idea) openSticky(idea); }} role="menuitem" type="button"><StickyNote /> Edit sticky</button> : null}
            {contextMenu.endpoint.kind === "stack" ? <button onClick={() => { toggleStack(contextMenu.endpoint!.id); setContextMenu(null); }} role="menuitem" type="button"><Layers3 /> Spread / restack</button> : null}
            <button onClick={() => startConnectionFrom(contextMenu.endpoint!)} role="menuitem" type="button"><Link2 /> Start connection</button>
            <button onClick={() => { const rect = endpointRect(contextMenu.endpoint!); if (rect) focusRect(rect); setContextMenu(null); }} role="menuitem" type="button"><Focus /> Focus here</button>
            {mode === "board" && contextMenu.endpoint.kind === "paper" && board.loosePaperIds.includes(contextMenu.endpoint.id) ? <button onClick={() => { commitBoard(restackResearchBoardPaper(board, contextMenu.endpoint!.id)); setContextMenu(null); }} role="menuitem" type="button"><Layers3 /> Return to stack</button> : null}
          </> : <>
            <button disabled={!onCreateSticky} onClick={() => openStickyDraftAt(researchScreenToWorld({ x: contextMenu.x, y: contextMenu.y }, mode === "board" ? board.camera : exploreCamera))} role="menuitem" type="button"><StickyNote /> New sticky here</button>
            <button onClick={() => { fitAll(); setContextMenu(null); }} role="menuitem" type="button"><Focus /> Fit everything</button>
            {mode === "board" ? <button disabled={!history.past.length} onClick={() => { setHistory((current) => undoResearchBoardHistory(current)); setContextMenu(null); }} role="menuitem" type="button"><Undo2 /> Undo</button> : null}
          </>}
        </div>
      ) : null}

      {stickyDraft ? (
        <form className="research-v4-sticky-draft" onSubmit={saveSticky}>
          <label htmlFor={`${instanceId}-sticky-draft`}>New Board sticky</label>
          <textarea autoFocus disabled={savingSticky} id={`${instanceId}-sticky-draft`} onChange={(event) => setStickyDraft((current) => current ? { ...current, text: event.target.value } : null)} placeholder="Question, observation, or connection…" value={stickyDraft.text} />
          <div><button onClick={() => setStickyDraft(null)} type="button">Cancel</button><button disabled={savingSticky || !stickyDraft.text.trim()} type="submit">{savingSticky ? "Saving…" : "Place sticky"}</button></div>
        </form>
      ) : null}

      {readerPaper ? (
        <section aria-label={`Reader: ${readerPaper.title}`} className="research-v4-reader" role="dialog">
          <header>
            <button aria-label="Close Reader" onClick={() => setReaderPaper(null)} type="button"><ArrowLeft /> Back to {mode === "board" ? "Board" : "Explore"}</button>
            <div><span>{readerPaper.authorLabel || "Unknown author"} · {readerPaper.year || "n.d."}</span><h2>{readerPaper.title}</h2></div>
            <button aria-label="More paper details" onClick={() => onOpenPaperDetails?.(readerPaper)} type="button"><MoreHorizontal /></button>
          </header>
          <div className="research-v4-reader-body">
            {readerPaper.documentUrl ? <iframe src={readerPaper.documentUrl} title={`${readerPaper.title} PDF`} /> : (
              <article className="research-v4-reader-fallback">
                <span>{readerPaper.abstractLabel || "Abstract or summary"}</span>
                <p>{readerPaper.abstract || readerPaper.summary || "No abstract or summary has been saved yet."}</p>
                <hr />
                <cite>{readerPaper.citation || "Citation has not been completed yet."}</cite>
                <div>
                  {readerPaper.zoteroUrl ? <a href={readerPaper.zoteroUrl} rel="noreferrer" target="_blank">Open in Zotero</a> : null}
                  <button onClick={() => onOpenPaperDetails?.(readerPaper)} type="button">Paper details</button>
                </div>
              </article>
            )}
          </div>
        </section>
      ) : null}

      {loading ? <div className="research-v4-loading">Setting out the library…</div> : null}
      {!loading && allPapers.length === 0 && ideas.length === 0 ? <div className="research-v4-empty"><strong>Your research space is ready.</strong><span>Sync or add papers, then arrange them here.</span></div> : null}
      <div aria-live="polite" className="research-v4-status"><span>{actionMessage}</span><small>{renderedCount.toLocaleString()} visible objects · {allPapers.length.toLocaleString()} papers</small></div>
    </div>
  );
}

export default InfiniteResearchCanvas;
