import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Compass,
  Copy,
  ExternalLink,
  FileText,
  Layers3,
  Lightbulb,
  Link2,
  MapPin,
  Network,
  PenLine,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  StickyNote,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import { Panel } from "../ui/Panel";

type ReadingStatus = "to_read" | "skimming" | "read" | "annotated";
type SortMode = "author" | "date" | "subject" | "reading" | "recent";
type FocusedSortMode = "author" | "date" | "title" | "reading" | "recent";

type ResearchPaper = {
  abstract: string;
  abstractLabel: "Abstract" | "Summary";
  apaCitation: string;
  authorLabel: string;
  authors: string[];
  citation: string;
  citekey: string;
  dateAdded: string;
  datePublished: string;
  dogEared: boolean;
  doi: string;
  duplicateCopies: number;
  id: string;
  metadataComplete: boolean;
  metadataConflicts: string[];
  missingFields: string[];
  needsCitekey: boolean;
  path: string;
  primarySubject: string;
  readingStatus: ReadingStatus;
  source: "vault" | "zotero" | "vault+zotero";
  status: string;
  subjects: string[];
  summary: string;
  summaryPreview: string;
  title: string;
  year: string;
  zoteroKey: string;
  zoteroUrl: string;
};

type ResearchIdea = {
  body: string;
  connectedPaperRefs: string[];
  created: string;
  id: string;
  path: string;
  preview: string;
  status: string;
  topic: string;
};

type ResearchSources = {
  duplicateCount: number;
  duplicateGroups: ResearchDuplicateGroup[];
  lastSyncedAt: string | null;
  mergedCount: number;
  status: string;
  subjects: ResearchSubject[];
  vaultCount: number;
  zoteroCount: number;
};

type ResearchDuplicateCopy = {
  authorLabel: string;
  datePublished: string;
  id: string;
  primarySubject: string;
  title: string;
  year: string;
  zoteroKey: string;
  zoteroUrl: string;
};

type ResearchDuplicateGroup = {
  copies: ResearchDuplicateCopy[];
  doi: string;
};

type ResearchSubject = {
  custom: boolean;
  deletable: boolean;
  name: string;
  paperCount: number;
};

type ResearchWorkspaceProps = {
  isActive: boolean;
  onClose: () => void;
  onOpenWorkbench: (prefill: string) => void;
};

type DeskPosition = { x: number; y: number; rotation: number; z: number };
type DeskLayout = Record<string, DeskPosition>;
type DeskSelection = { kind: "paper" | "idea"; path: string } | null;
type PaperStack = { key: string; label: string; papers: ResearchPaper[] };
type DeskCamera = { scale: number; x: number; y: number };
type DraftSticky = { text: string; x: number; y: number };
type DeskContextMenu = {
  idea?: ResearchIdea;
  kind: "canvas" | "idea" | "paper";
  menuX: number;
  menuY: number;
  paper?: ResearchPaper;
  point: Pick<DraftSticky, "x" | "y">;
};

type DragState = {
  captureTarget: HTMLElement;
  kind: "idea" | "stack";
  key: string;
  moved: boolean;
  origin: DeskPosition;
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  lastAt: number;
  velocityX: number;
  velocityY: number;
};

type CameraDragState = {
  origin: DeskCamera;
  pointerId: number;
  startX: number;
  startY: number;
};

type ResearchConnectionLine = {
  active: boolean;
  id: string;
  x1: number;
  x2: number;
  y1: number;
  y2: number;
};

type ResearchConnectionViewport = {
  height: number;
  lines: ResearchConnectionLine[];
  width: number;
};

const RESEARCH_DESK_LAYOUT_KEY = "horizon.research-desk-layout.v2";
const RESEARCH_DESK_SORT_KEY = "horizon.research-desk-sort.v1";
const READING_STATUS_LABELS: Record<ReadingStatus, string> = {
  to_read: "To read",
  skimming: "Skimming",
  read: "Read",
  annotated: "Annotated",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readableInsights(value: string) {
  return String(value || "")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function ideaDeskKey(path: string) {
  return `idea:${path}`;
}

function stackDeskKey(mode: SortMode, key: string) {
  return `stack:${mode}:${key}`;
}

function normalizedPaperDoi(value: string) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .toLowerCase();
}

function paperConnectionRef(paper: ResearchPaper) {
  const doi = normalizedPaperDoi(paper.doi);
  if (doi && doi !== "unknown") return `doi:${doi}`;
  if (paper.zoteroKey) return `zotero:${paper.zoteroKey}`;
  return paper.path ? `vault:${paper.path.replace(/\\/g, "/")}` : "";
}

function paperMatchesConnectionRef(paper: ResearchPaper, value: string) {
  const ref = String(value || "").trim();
  if (ref.startsWith("doi:")) return normalizedPaperDoi(paper.doi) === normalizedPaperDoi(ref.slice(4));
  if (ref.startsWith("zotero:")) return paper.zoteroKey === ref.slice(7);
  if (ref.startsWith("vault:")) return paper.path.replace(/\\/g, "/") === ref.slice(6).replace(/\\/g, "/");
  return false;
}

function connectedPapersForIdea(idea: ResearchIdea, papers: ResearchPaper[]) {
  return (idea.connectedPaperRefs || [])
    .map((ref) => papers.find((paper) => paperMatchesConnectionRef(paper, ref)))
    .filter((paper): paper is ResearchPaper => Boolean(paper))
    .filter((paper, index, all) => all.findIndex((candidate) => candidate.id === paper.id) === index);
}

function sourceLabel(source: ResearchPaper["source"]) {
  if (source === "vault+zotero") return "Vault + Zotero";
  return source === "vault" ? "Vault note" : "Zotero";
}

function subjectHue(subject: string) {
  const seed = Array.from(subject || "Research").reduce((total, character) => total + character.charCodeAt(0), 0);
  return 178 + (seed % 118);
}

function authorBucket(paper: ResearchPaper) {
  const initial = (paper.authorLabel || "").trim().charAt(0).toUpperCase();
  if (!/[A-Z]/.test(initial)) return "Unknown author";
  if (initial <= "D") return "Authors A-D";
  if (initial <= "H") return "Authors E-H";
  if (initial <= "L") return "Authors I-L";
  if (initial <= "P") return "Authors M-P";
  if (initial <= "T") return "Authors Q-T";
  return "Authors U-Z";
}

function dateBucket(paper: ResearchPaper) {
  const year = Number(String(paper.datePublished || paper.year).match(/\b(19|20)\d{2}\b/)?.[0]);
  if (!year) return "Undated";
  if (year >= 2025) return "2025-present";
  if (year >= 2020) return "2020-2024";
  if (year >= 2015) return "2015-2019";
  if (year >= 2000) return "2000-2014";
  return "Before 2000";
}

function stackBucket(paper: ResearchPaper, mode: SortMode) {
  if (mode === "author") return authorBucket(paper);
  if (mode === "date") return dateBucket(paper);
  if (mode === "reading") return READING_STATUS_LABELS[paper.readingStatus];
  return paper.primarySubject || "General Research";
}

function researchTimestamp(value: string) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortedPapers(papers: ResearchPaper[], mode: SortMode) {
  const next = [...papers];
  if (mode === "author") return next.sort((a, b) => a.authorLabel.localeCompare(b.authorLabel) || b.year.localeCompare(a.year));
  if (mode === "date") return next.sort((a, b) => {
    const aKnown = a.datePublished && a.datePublished !== "unknown";
    const bKnown = b.datePublished && b.datePublished !== "unknown";
    if (aKnown !== bKnown) return aKnown ? -1 : 1;
    return b.datePublished.localeCompare(a.datePublished) || a.authorLabel.localeCompare(b.authorLabel);
  });
  if (mode === "reading") {
    const order: ReadingStatus[] = ["to_read", "skimming", "read", "annotated"];
    return next.sort((a, b) => order.indexOf(a.readingStatus) - order.indexOf(b.readingStatus) || a.authorLabel.localeCompare(b.authorLabel));
  }
  if (mode === "recent") {
    return next.sort((a, b) => researchTimestamp(b.dateAdded) - researchTimestamp(a.dateAdded) || b.datePublished.localeCompare(a.datePublished) || a.title.localeCompare(b.title));
  }
  return next.sort((a, b) => a.primarySubject.localeCompare(b.primarySubject) || a.authorLabel.localeCompare(b.authorLabel));
}

function focusedStackPapers(papers: ResearchPaper[], mode: FocusedSortMode) {
  const next = [...papers];
  if (mode === "title") return next.sort((a, b) => a.title.localeCompare(b.title));
  if (mode === "author") return next.sort((a, b) => a.authorLabel.localeCompare(b.authorLabel) || b.year.localeCompare(a.year));
  if (mode === "date") return next.sort((a, b) => b.datePublished.localeCompare(a.datePublished) || a.title.localeCompare(b.title));
  if (mode === "recent") return next.sort((a, b) => researchTimestamp(b.dateAdded) - researchTimestamp(a.dateAdded) || a.title.localeCompare(b.title));
  const order: ReadingStatus[] = ["to_read", "skimming", "read", "annotated"];
  return next.sort((a, b) => order.indexOf(a.readingStatus) - order.indexOf(b.readingStatus) || a.title.localeCompare(b.title));
}

function buildPaperStacks(papers: ResearchPaper[], mode: SortMode): PaperStack[] {
  const grouped = new Map<string, ResearchPaper[]>();
  for (const paper of sortedPapers(papers, mode)) {
    const bucket = stackBucket(paper, mode);
    grouped.set(bucket, [...(grouped.get(bucket) || []), paper]);
  }

  let entries = [...grouped.entries()];
  if (entries.length > 12) {
    entries = entries.sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    const overflow = entries.slice(11).flatMap(([, items]) => items);
    entries = [...entries.slice(0, 11), ["Other subjects", overflow]];
  }
  return entries.map(([label, stackPapers]) => ({ key: label, label, papers: stackPapers }));
}

function defaultIdeaPosition(index: number): DeskPosition {
  const slots = [
    { x: 0.52, y: 0.56 },
    { x: 0.34, y: 0.56 },
    { x: 0.16, y: 0.56 },
    { x: 0.52, y: 0.86 },
    { x: 0.34, y: 0.86 },
    { x: 0.16, y: 0.86 },
  ];
  const slot = slots[index % slots.length];
  const pass = Math.floor(index / slots.length);
  return {
    x: clamp(slot.x + (pass % 2 ? -0.025 : 0.025) * pass, 0.08, 0.58),
    y: clamp(slot.y - pass * 0.045, 0.18, 0.9),
    rotation: [-2.5, 3.5, 1.2, -3.2][index % 4],
    z: 1400 + index,
  };
}

function ideaPositionsOverlap(a: DeskPosition, b: DeskPosition) {
  return Math.abs(a.x - b.x) < 0.15 && Math.abs(a.y - b.y) < 0.24;
}

function openIdeaPosition(preferred: DeskPosition, occupied: DeskPosition[]) {
  const offsets = [
    { x: 0, y: 0 },
    { x: -0.18, y: 0 },
    { x: 0.18, y: 0 },
    { x: -0.09, y: -0.28 },
    { x: -0.09, y: 0.28 },
    { x: 0.09, y: -0.28 },
    { x: 0.09, y: 0.28 },
  ];
  for (const offset of offsets) {
    const candidate = {
      ...preferred,
      x: offset.x || offset.y ? clamp(preferred.x + offset.x, 0.08, 0.6) : preferred.x,
      y: offset.x || offset.y ? clamp(preferred.y + offset.y, 0.18, 0.9) : preferred.y,
    };
    if (!occupied.some((position) => ideaPositionsOverlap(candidate, position))) return candidate;
  }
  return {
    ...preferred,
    x: clamp(preferred.x - 0.12, 0.08, 0.6),
    y: clamp(preferred.y - 0.34, 0.18, 0.9),
  };
}

function buildIdeaLayout(ideas: ResearchIdea[], source: DeskLayout = {}) {
  const layout: DeskLayout = {};
  const occupied: DeskPosition[] = [];
  ideas.forEach((idea, index) => {
    const key = ideaDeskKey(idea.path);
    const position = openIdeaPosition(source[key] || defaultIdeaPosition(index), occupied);
    layout[key] = position;
    occupied.push(position);
  });
  return layout;
}

function storedDeskLayout() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RESEARCH_DESK_LAYOUT_KEY) || "{}");
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed as DeskLayout).filter(([key]) => key.startsWith("idea:") || key.startsWith("stack:")),
    ) as DeskLayout;
  } catch {
    return {};
  }
}

function storedSortMode(): SortMode {
  const stored = localStorage.getItem(RESEARCH_DESK_SORT_KEY) as SortMode | null;
  return ["author", "date", "subject", "reading", "recent"].includes(stored || "") ? stored! : "subject";
}

export function ResearchWorkspace({ isActive, onClose, onOpenWorkbench }: ResearchWorkspaceProps) {
  const [papers, setPapers] = useState<ResearchPaper[]>([]);
  const [ideas, setIdeas] = useState<ResearchIdea[]>([]);
  const [sources, setSources] = useState<ResearchSources | null>(null);
  const [layout, setLayout] = useState<DeskLayout>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("All subjects");
  const [statusFilter, setStatusFilter] = useState("All stages");
  const [metadataFocus, setMetadataFocus] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>(() => storedSortMode());
  const [organizing, setOrganizing] = useState<"" | "gathering" | "settling">("");
  const [selection, setSelection] = useState<DeskSelection>(null);
  const [draggingKey, setDraggingKey] = useState("");
  const [dropTargetPaperId, setDropTargetPaperId] = useState("");
  const [camera, setCamera] = useState<DeskCamera>({ scale: 1, x: 0, y: 0 });
  const [cameraDragging, setCameraDragging] = useState(false);
  const [contextMenu, setContextMenu] = useState<DeskContextMenu | null>(null);
  const [draftSticky, setDraftSticky] = useState<DraftSticky | null>(null);
  const [savingSticky, setSavingSticky] = useState(false);
  const [editingIdea, setEditingIdea] = useState<{ path: string; text: string } | null>(null);
  const [savingIdea, setSavingIdea] = useState(false);
  const [pendingDeleteIdea, setPendingDeleteIdea] = useState<ResearchIdea | null>(null);
  const [deletingIdea, setDeletingIdea] = useState(false);
  const [connectionViewport, setConnectionViewport] = useState<ResearchConnectionViewport>({ height: 0, lines: [], width: 0 });
  const [shelving, setShelving] = useState(false);
  const [duplicateReviewOpen, setDuplicateReviewOpen] = useState(false);
  const [subjectManagerOpen, setSubjectManagerOpen] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [subjectSaving, setSubjectSaving] = useState(false);
  const [stackCursors, setStackCursors] = useState<Record<string, number>>({});
  const [focusedStackKey, setFocusedStackKey] = useState<string | null>(null);
  const [focusedStackSort, setFocusedStackSort] = useState<FocusedSortMode>("author");
  const [focusedStackClosing, setFocusedStackClosing] = useState(false);
  const deskRef = useRef<HTMLDivElement>(null);
  const readingSheetRef = useRef<HTMLElement>(null);
  const draftStickyRef = useRef<HTMLTextAreaElement>(null);
  const focusedStackRef = useRef<HTMLElement>(null);
  const focusedStackTriggerRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressStackClickRef = useRef("");
  const cameraDragRef = useRef<CameraDragState | null>(null);
  const organizeTimers = useRef<number[]>([]);
  const focusedStackCloseTimer = useRef<number | null>(null);
  const stackWheelTimes = useRef<Record<string, number>>({});

  function clearOrganizeTimers() {
    organizeTimers.current.forEach((timer) => window.clearTimeout(timer));
    organizeTimers.current = [];
  }

  function placeIdeas(nextIdeas: ResearchIdea[], useStoredLayout = false) {
    const source = useStoredLayout ? storedDeskLayout() : layout;
    const stackPositions = Object.fromEntries(Object.entries(source).filter(([key]) => key.startsWith("stack:"))) as DeskLayout;
    const next = { ...stackPositions, ...buildIdeaLayout(nextIdeas, source) };
    setLayout(next);
    persistLayout(next);
  }

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetch("/api/research/papers", { cache: "no-store", signal: controller.signal }).then((response) => response.json()),
      fetch("/api/research/ideas", { cache: "no-store", signal: controller.signal }).then((response) => response.json()),
    ])
      .then(([paperData, ideaData]) => {
        const nextPapers = Array.isArray(paperData?.papers) ? paperData.papers : [];
        const nextIdeas = Array.isArray(ideaData?.ideas) ? ideaData.ideas : [];
        setPapers(nextPapers);
        setIdeas(nextIdeas);
        setSources(paperData?.sources || null);
        placeIdeas(nextIdeas, true);
        const firstDeskPaper = buildPaperStacks(nextPapers, sortMode)[0]?.papers[0];
        setSelection((current) => current || (firstDeskPaper ? { kind: "paper", path: firstDeskPaper.id } : nextIdeas[0] ? { kind: "idea", path: nextIdeas[0].path } : null));
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMessage("The research library could not be loaded.");
      })
      .finally(() => setLoading(false));
    return () => {
      controller.abort();
      clearOrganizeTimers();
    };
    // The saved sort is intentionally read once when this workspace mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subjectRecords = useMemo<ResearchSubject[]>(() => {
    if (sources?.subjects?.length) return sources.subjects;
    const counts = new Map<string, number>();
    papers.forEach((paper) => counts.set(paper.primarySubject, (counts.get(paper.primarySubject) || 0) + 1));
    return [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, paperCount]) => ({ custom: false, deletable: false, name, paperCount }));
  }, [papers, sources?.subjects]);

  const subjects = useMemo(
    () => ["All subjects", ...subjectRecords.map((item) => item.name)],
    [subjectRecords],
  );

  const visiblePapers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return papers.filter((paper) => {
      if (subject !== "All subjects" && paper.primarySubject !== subject) return false;
      if (statusFilter !== "All stages" && paper.readingStatus !== statusFilter) return false;
      if (metadataFocus && paper.metadataComplete) return false;
      if (!needle) return true;
      return [paper.title, paper.authorLabel, paper.authors.join(" "), paper.citation, paper.abstract, paper.doi, paper.datePublished, paper.primarySubject, sourceLabel(paper.source)]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [metadataFocus, papers, query, statusFilter, subject]);

  const visibleIdeas = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const paperFilterActive = subject !== "All subjects" || statusFilter !== "All stages" || metadataFocus;
    return ideas.filter((idea) => {
      const directMatch = Boolean(needle && [idea.topic, idea.body, idea.preview].join(" ").toLowerCase().includes(needle));
      const followsVisiblePaper = (idea.connectedPaperRefs || []).some((ref) => visiblePapers.some((paper) => paperMatchesConnectionRef(paper, ref)));
      if (!needle && !paperFilterActive) return true;
      return directMatch || followsVisiblePaper;
    });
  }, [ideas, metadataFocus, query, statusFilter, subject, visiblePapers]);

  const deskStacks = useMemo(
    () => buildPaperStacks(visiblePapers, sortMode),
    [sortMode, visiblePapers],
  );

  const focusedStack = useMemo(
    () => deskStacks.find((stack) => stack.key === focusedStackKey) || null,
    [deskStacks, focusedStackKey],
  );

  const focusedPapers = useMemo(
    () => focusedStackPapers(focusedStack?.papers || [], focusedStackSort),
    [focusedStack, focusedStackSort],
  );

  const selectedPaper = selection?.kind === "paper" ? papers.find((paper) => paper.id === selection.path) || null : null;
  const selectedIdea = selection?.kind === "idea" ? ideas.find((idea) => idea.path === selection.path) || null : null;
  const selectedIdeaPapers = selectedIdea ? connectedPapersForIdea(selectedIdea, papers) : [];
  const missingMetadataCount = papers.filter((paper) => !paper.metadataComplete).length;
  const hasActiveFilter = Boolean(query.trim() || subject !== "All subjects" || statusFilter !== "All stages" || metadataFocus);
  const filteredStatusMessage = visiblePapers.length
    ? `Showing ${visiblePapers.length} matching ${visiblePapers.length === 1 ? "paper" : "papers"}.`
    : visibleIdeas.length
      ? `No matching papers · showing ${visibleIdeas.length} matching ${visibleIdeas.length === 1 ? "idea" : "ideas"}.`
      : "No papers match the active filters.";
  const selectedDeskStack = selectedPaper ? deskStacks.find((stack) => stack.papers.some((paper) => paper.id === selectedPaper.id)) || null : null;
  const selectedContextPapers = selectedPaper
    ? (focusedStack?.papers.some((paper) => paper.id === selectedPaper.id)
      ? focusedPapers
      : selectedDeskStack?.papers || papers.filter((paper) => paper.primarySubject === selectedPaper.primarySubject))
    : [];
  const selectedContextPosition = selectedPaper ? selectedContextPapers.findIndex((paper) => paper.id === selectedPaper.id) + 1 : 0;
  const selectedContextLabel = focusedStack?.papers.some((paper) => paper.id === selectedPaper?.id)
    ? focusedStack.label
    : selectedDeskStack?.label || selectedPaper?.primarySubject || "";

  useLayoutEffect(() => {
    if (readingSheetRef.current) readingSheetRef.current.scrollTop = 0;
  }, [selection?.kind, selection?.path]);

  useEffect(() => {
    if (!focusedStackKey || focusedStack) return;
    if (focusedStackCloseTimer.current) window.clearTimeout(focusedStackCloseTimer.current);
    setFocusedStackClosing(false);
    setFocusedStackKey(null);
  }, [focusedStack, focusedStackKey]);

  useEffect(() => {
    if (loading) return;
    const visiblePaperIds = new Set(visiblePapers.map((paper) => paper.id));
    const visibleIdeaPaths = new Set(visibleIdeas.map((idea) => idea.path));
    const firstPaper = deskStacks[0]?.papers[0];
    const firstIdea = visibleIdeas[0];
    setSelection((current) => {
      if (current?.kind === "paper" && visiblePaperIds.has(current.path)) return current;
      if (current?.kind === "idea" && visibleIdeaPaths.has(current.path)) return current;
      return firstPaper ? { kind: "paper", path: firstPaper.id } : firstIdea ? { kind: "idea", path: firstIdea.path } : null;
    });
  }, [deskStacks, loading, visibleIdeas, visiblePapers]);

  useEffect(() => {
    if (!focusedStackKey || focusedStackClosing) return;
    const frame = window.requestAnimationFrame(() => {
      const selected = focusedStackRef.current?.querySelector<HTMLButtonElement>(".research-focused-paper.is-selected");
      const grid = focusedStackRef.current?.querySelector<HTMLElement>(".research-focused-stack-grid");
      if (selected && grid) {
        selected.focus({ preventScroll: true });
        const selectedRect = selected.getBoundingClientRect();
        const gridRect = grid.getBoundingClientRect();
        grid.scrollTop += selectedRect.top - gridRect.top - Math.max(0, (gridRect.height - selectedRect.height) / 2);
      } else {
        focusedStackRef.current?.focus({ preventScroll: true });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusedStackClosing, focusedStackKey, focusedStackSort]);

  useLayoutEffect(() => {
    const desk = deskRef.current;
    if (!desk || focusedStackKey) {
      setConnectionViewport({ height: 0, lines: [], width: 0 });
      return undefined;
    }
    let frame = 0;
    const updateLines = () => {
      const deskRect = desk.getBoundingClientRect();
      const ideaElements = new Map(
        [...desk.querySelectorAll<HTMLElement>("[data-research-idea-path]")]
          .map((element) => [element.dataset.researchIdeaPath || "", element] as const),
      );
      const paperElements = new Map(
        [...desk.querySelectorAll<HTMLElement>("[data-research-paper-id]")]
          .map((element) => [element.dataset.researchPaperId || "", element] as const),
      );
      const stackElements = new Map(
        [...desk.querySelectorAll<HTMLElement>("[data-research-stack-key]")]
          .map((element) => [element.dataset.researchStackKey || "", element] as const),
      );
      const lines: ResearchConnectionLine[] = [];
      for (const idea of visibleIdeas) {
        const ideaElement = ideaElements.get(idea.path);
        if (!ideaElement) continue;
        const ideaRect = ideaElement.getBoundingClientRect();
        const connectedPapers = connectedPapersForIdea(idea, visiblePapers);
        connectedPapers.forEach((paper, index) => {
          const stack = deskStacks.find((candidate) => candidate.papers.some((item) => item.id === paper.id));
          const target = paperElements.get(paper.id) || (stack ? stackElements.get(stack.key) : null);
          if (!target) return;
          const targetRect = target.getBoundingClientRect();
          const x1 = ideaRect.left + ideaRect.width / 2 - deskRect.left;
          const y1 = ideaRect.top + ideaRect.height / 2 - deskRect.top;
          const x2 = targetRect.left + targetRect.width / 2 - deskRect.left + ((index % 3) - 1) * 5;
          const y2 = targetRect.top + targetRect.height / 2 - deskRect.top + ((index % 2) ? 4 : -4);
          if (Math.hypot(x2 - x1, y2 - y1) < 28) return;
          lines.push({
            active: (selection?.kind === "idea" && selection.path === idea.path)
              || (selection?.kind === "paper" && selection.path === paper.id),
            id: `${idea.path}:${paperConnectionRef(paper)}`,
            x1,
            x2,
            y1,
            y2,
          });
        });
      }
      setConnectionViewport({ height: deskRect.height, lines, width: deskRect.width });
    };
    const scheduleUpdate = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateLines);
    };
    scheduleUpdate();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(scheduleUpdate) : null;
    observer?.observe(desk);
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [camera, deskStacks, focusedStackKey, layout, selection, stackCursors, visibleIdeas, visiblePapers]);

  useEffect(() => () => {
    if (focusedStackCloseTimer.current) window.clearTimeout(focusedStackCloseTimer.current);
  }, []);

  useEffect(() => {
    if (!isActive || focusedStackKey) return;
    const pressed = new Set<string>();
    let frame = 0;
    const isTypingTarget = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName));
    const nudgeCamera = () => {
      const horizontal = (pressed.has("d") ? 1 : 0) - (pressed.has("a") ? 1 : 0);
      const vertical = (pressed.has("s") ? 1 : 0) - (pressed.has("w") ? 1 : 0);
      if (horizontal || vertical) {
        setCamera((current) => {
          const rect = deskRef.current?.getBoundingClientRect();
          const xLimit = rect ? Math.max(420, rect.width * Math.max(0.65, current.scale - 0.35)) : 420;
          const yLimit = rect ? Math.max(320, rect.height * Math.max(0.65, current.scale - 0.35)) : 320;
          return {
            ...current,
            x: clamp(current.x - horizontal * 6, -xLimit, xLimit),
            y: clamp(current.y - vertical * 6, -yLimit, yLimit),
          };
        });
      }
    };
    const moveCamera = () => {
      if (!pressed.size) {
        frame = 0;
        return;
      }
      nudgeCamera();
      frame = window.requestAnimationFrame(moveCamera);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (!["w", "a", "s", "d"].includes(key) || isTypingTarget(event.target)) return;
      event.preventDefault();
      const wasPressed = pressed.has(key);
      pressed.add(key);
      setContextMenu(null);
      if (!wasPressed) nudgeCamera();
      if (!frame) frame = window.requestAnimationFrame(moveCamera);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d"].includes(key)) pressed.delete(key);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [focusedStackKey, isActive]);

  useEffect(() => {
    if (!isActive) return;
    const closeTopSurface = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      let handled = true;
      if (contextMenu) {
        setContextMenu(null);
      } else if (pendingDeleteIdea) {
        setPendingDeleteIdea(null);
      } else if (editingIdea) {
        setEditingIdea(null);
      } else if (duplicateReviewOpen) {
        setDuplicateReviewOpen(false);
      } else if (subjectManagerOpen) {
        setSubjectManagerOpen(false);
      } else if (focusedStackKey) {
        closeFocusedStack();
      } else if (draftSticky) {
        setDraftSticky(null);
      } else {
        handled = false;
      }
      if (!handled) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener("keydown", closeTopSurface, true);
    return () => window.removeEventListener("keydown", closeTopSurface, true);
  }, [contextMenu, draftSticky, duplicateReviewOpen, editingIdea, focusedStackKey, isActive, pendingDeleteIdea, subjectManagerOpen]);

  useEffect(() => {
    const closeContextMenu = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".research-desk-context-menu")) return;
      setContextMenu(null);
    };
    window.addEventListener("pointerdown", closeContextMenu);
    return () => window.removeEventListener("pointerdown", closeContextMenu);
  }, []);

  function persistLayout(next: DeskLayout) {
    try { localStorage.setItem(RESEARCH_DESK_LAYOUT_KEY, JSON.stringify(next)); } catch { /* local storage is optional */ }
  }

  function deskPoint(clientX: number, clientY: number): Pick<DraftSticky, "x" | "y"> | null {
    const rect = deskRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: clamp((clientX - rect.left - camera.x) / (rect.width * camera.scale), 0.06, 0.92),
      y: clamp((clientY - rect.top - camera.y) / (rect.height * camera.scale), 0.14, 0.9),
    };
  }

  function stackCursor(stack: PaperStack) {
    if (!stack.papers.length) return 0;
    const cursor = stackCursors[stack.key] || 0;
    return ((cursor % stack.papers.length) + stack.papers.length) % stack.papers.length;
  }

  function cycleStack(stack: PaperStack, direction: number) {
    if (stack.papers.length < 2) return;
    const nextIndex = (stackCursor(stack) + direction + stack.papers.length) % stack.papers.length;
    const nextPaper = stack.papers[nextIndex];
    setStackCursors((current) => ({ ...current, [stack.key]: nextIndex }));
    setSelection({ kind: "paper", path: nextPaper.id });
  }

  function handleStackWheel(event: ReactWheelEvent<HTMLElement>, stack: PaperStack) {
    event.preventDefault();
    event.stopPropagation();
    if (!event.deltaY && !event.deltaX) return;
    const now = performance.now();
    if (now - (stackWheelTimes.current[stack.key] || 0) < 140) return;
    stackWheelTimes.current[stack.key] = now;
    cycleStack(stack, (event.deltaY || event.deltaX) > 0 ? 1 : -1);
  }

  function handleFocusedPaperKey(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    if (!focusedStack || !focusedPapers.length) return;
    const grid = event.currentTarget.parentElement;
    const itemWidth = event.currentTarget.getBoundingClientRect().width;
    const columns = grid ? Math.max(1, Math.floor((grid.clientWidth + 11) / (itemWidth + 11))) : 1;
    let nextIndex = index;
    if (event.key === "ArrowLeft") nextIndex -= 1;
    else if (event.key === "ArrowRight") nextIndex += 1;
    else if (event.key === "ArrowUp") nextIndex -= columns;
    else if (event.key === "ArrowDown") nextIndex += columns;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = focusedPapers.length - 1;
    else return;
    event.preventDefault();
    nextIndex = clamp(nextIndex, 0, focusedPapers.length - 1);
    selectPaper(focusedPapers[nextIndex], focusedStack);
    window.requestAnimationFrame(() => {
      const buttons = focusedStackRef.current?.querySelectorAll<HTMLButtonElement>(".research-focused-paper");
      buttons?.[nextIndex]?.focus({ preventScroll: false });
    });
  }

  function openFocusedStack(stack: PaperStack, trigger?: HTMLElement | null) {
    if (focusedStackCloseTimer.current) window.clearTimeout(focusedStackCloseTimer.current);
    focusedStackCloseTimer.current = null;
    focusedStackTriggerRef.current = trigger || focusedStackTriggerRef.current;
    setFocusedStackClosing(false);
    setFocusedStackKey(stack.key);
    setSubjectManagerOpen(false);
    setDuplicateReviewOpen(false);
    const currentPaper = selection?.kind === "paper" ? stack.papers.find((paper) => paper.id === selection.path) : null;
    const paper = currentPaper || stack.papers[stackCursor(stack)];
    if (paper) setSelection({ kind: "paper", path: paper.id });
  }

  function closeFocusedStack(returnFocus = true) {
    if (!focusedStackKey || focusedStackClosing) return;
    setFocusedStackClosing(true);
    focusedStackCloseTimer.current = window.setTimeout(() => {
      setFocusedStackKey(null);
      setFocusedStackClosing(false);
      focusedStackCloseTimer.current = null;
      if (returnFocus) window.requestAnimationFrame(() => focusedStackTriggerRef.current?.focus({ preventScroll: true }));
    }, 170);
  }

  function fitDesk() {
    const rect = deskRef.current?.getBoundingClientRect();
    if (!rect) return;
    const usableWidth = rect.width * (rect.width < 1100 ? 0.54 : 0.64);
    const columns = clamp(Math.floor(usableWidth / 190), 2, 5);
    const rows = Math.max(1, Math.ceil(deskStacks.length / columns));
    const contentHeight = 76 + rows * 218;
    const scale = clamp(Math.min(1, (rect.height - 34) / contentHeight), 0.55, 1);
    setCamera({ scale, x: 0, y: 0 });
    setMessage(`Desk fitted to ${deskStacks.length} ${deskStacks.length === 1 ? "stack" : "stacks"}.`);
  }

  function showAllPapers(nextMessage = "Showing all papers.") {
    if (focusedStackKey) closeFocusedStack(false);
    setQuery("");
    setSubject("All subjects");
    setStatusFilter("All stages");
    setMetadataFocus(false);
    setMessage(nextMessage);
  }

  function beginCameraDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target instanceof Element ? event.target : null;
    if (
      event.button !== 0
      || target?.closest(
        ".research-desk-item, .research-paper-stack, .research-focused-stack, .research-stack-scrim, .research-stack-label, .research-draft-sticky, .research-location-tab, .research-reading-sheet, .research-desk-toolbar, .research-desk-status, .research-desk-context-menu, .research-sticky-delete-confirm, .research-subject-manager, .research-duplicate-review",
      )
    ) return;
    event.currentTarget.focus({ preventScroll: true });
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Drag still works if pointer capture is unavailable. */ }
    cameraDragRef.current = {
      origin: camera,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    setContextMenu(null);
    setCameraDragging(true);
  }

  function moveCameraDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = cameraDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const rect = deskRef.current?.getBoundingClientRect();
    const xLimit = rect ? Math.max(420, rect.width * Math.max(0.65, drag.origin.scale - 0.35)) : 420;
    const yLimit = rect ? Math.max(320, rect.height * Math.max(0.65, drag.origin.scale - 0.35)) : 320;
    setCamera({
      scale: drag.origin.scale,
      x: clamp(drag.origin.x + event.clientX - drag.startX, -xLimit, xLimit),
      y: clamp(drag.origin.y + event.clientY - drag.startY, -yLimit, yLimit),
    });
  }

  function endCameraDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (cameraDragRef.current?.pointerId !== event.pointerId) return;
    cameraDragRef.current = null;
    setCameraDragging(false);
  }

  function zoomDesk(event: ReactWheelEvent<HTMLDivElement>) {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(".research-reading-sheet, .research-subject-manager, .research-duplicate-review, .research-desk-context-menu, .research-sticky-delete-confirm")) return;
    const rect = deskRef.current?.getBoundingClientRect();
    if (!rect || !event.deltaY) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
    setCamera((current) => {
      const scale = clamp(current.scale * Math.exp(-delta * 0.0014), 0.55, 2.5);
      const worldX = (localX - current.x) / current.scale;
      const worldY = (localY - current.y) / current.scale;
      const xLimit = Math.max(420, rect.width * Math.max(0.65, scale - 0.35));
      const yLimit = Math.max(320, rect.height * Math.max(0.65, scale - 0.35));
      return {
        scale,
        x: clamp(localX - worldX * scale, -xLimit, xLimit),
        y: clamp(localY - worldY * scale, -yLimit, yLimit),
      };
    });
    setContextMenu(null);
  }

  function startDraftSticky(point: Pick<DraftSticky, "x" | "y">) {
    setContextMenu(null);
    setDraftSticky({ ...point, text: "" });
    window.requestAnimationFrame(() => draftStickyRef.current?.focus());
  }

  function openDeskContextMenu(
    event: ReactMouseEvent<HTMLElement>,
    kind: DeskContextMenu["kind"],
    details: Pick<DeskContextMenu, "idea" | "paper"> = {},
  ) {
    const rect = deskRef.current?.getBoundingClientRect();
    const point = deskPoint(event.clientX, event.clientY);
    if (!rect || !point) return;
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      ...details,
      kind,
      menuX: clamp(event.clientX - rect.left, 10, Math.max(10, rect.width - 208)),
      menuY: clamp(event.clientY - rect.top, 10, Math.max(10, rect.height - 238)),
      point,
    });
  }

  function handleDeskDoubleClick(event: ReactMouseEvent<HTMLElement>) {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(".research-desk-item, .research-paper-stack, .research-focused-stack, .research-stack-scrim, .research-draft-sticky, .research-location-tab, .research-reading-sheet, .research-desk-toolbar, .research-desk-status, .research-desk-context-menu, .research-sticky-delete-confirm, .research-subject-manager, .research-duplicate-review")) return;
    const point = deskPoint(event.clientX, event.clientY);
    if (point) startDraftSticky(point);
  }

  function toggleMetadataFocus() {
    const next = !metadataFocus;
    setMetadataFocus(next);
    setContextMenu(null);
    if (!next) {
      setMessage(query.trim() || subject !== "All subjects" || statusFilter !== "All stages" ? "Missing-details filter cleared." : "Showing all papers.");
      return;
    }
    const firstIncomplete = papers.find((paper) => !paper.metadataComplete);
    if (firstIncomplete) selectPaper(firstIncomplete);
    setMessage(firstIncomplete ? "Showing papers that still need source details." : "All papers have the current metadata fields.");
  }

  async function createSubject() {
    const name = newSubjectName.trim();
    if (!name || subjectSaving) return;
    setSubjectSaving(true);
    try {
      const response = await fetch("/api/research/subjects", {
        body: JSON.stringify({ name }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data?.subjects)) throw new Error(data?.message || "Subject creation failed");
      setSources((current) => current ? { ...current, subjects: data.subjects } : current);
      setNewSubjectName("");
      setMessage(data.message || `${name} added.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That subject could not be created.");
    } finally {
      setSubjectSaving(false);
    }
  }

  async function deleteSubject(item: ResearchSubject) {
    if (!item.deletable || subjectSaving) return;
    setSubjectSaving(true);
    try {
      const response = await fetch("/api/research/subjects", {
        body: JSON.stringify({ name: item.name }),
        headers: { "content-type": "application/json" },
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data?.subjects)) throw new Error(data?.message || "Subject deletion failed");
      setSources((current) => current ? { ...current, subjects: data.subjects } : current);
      if (subject === item.name) setSubject("All subjects");
      setMessage(data.message || `${item.name} deleted.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That subject could not be deleted.");
    } finally {
      setSubjectSaving(false);
    }
  }

  async function saveDraftSticky() {
    const pending = draftSticky;
    if (!pending) return;
    const body = pending.text.trim();
    if (!body) {
      setDraftSticky(null);
      return;
    }
    setSavingSticky(true);
    try {
      const response = await fetch("/api/research/ideas", {
        body: JSON.stringify({ body }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok || !data?.idea) throw new Error("Sticky save failed");
      const idea = data.idea as ResearchIdea;
      setIdeas((current) => [idea, ...current]);
      setLayout((current) => {
        const top = Math.max(1400, ...Object.values(current).map((item) => item.z || 0)) + 1;
        const position = openIdeaPosition(
          { x: pending.x, y: pending.y, rotation: -1.5, z: top },
          Object.values(current),
        );
        const next = {
          ...current,
          [ideaDeskKey(idea.path)]: position,
        };
        persistLayout(next);
        return next;
      });
      setSelection({ kind: "idea", path: idea.path });
      setDraftSticky(null);
      setMessage(data.message || "Sticky note saved to Research Ideas.");
    } catch {
      setMessage("That sticky note could not be saved. It is still open so you can try again.");
    } finally {
      setSavingSticky(false);
    }
  }

  function finishDraftSticky() {
    if (savingSticky) return;
    if (!draftSticky?.text.trim()) {
      setDraftSticky(null);
      return;
    }
    void saveDraftSticky();
  }

  function startEditingIdea(idea: ResearchIdea) {
    setContextMenu(null);
    setPendingDeleteIdea(null);
    setSelection({ kind: "idea", path: idea.path });
    setEditingIdea({ path: idea.path, text: idea.body || idea.preview || idea.topic });
  }

  async function patchIdea(idea: ResearchIdea, updates: { body?: string; connectedPaperRefs?: string[] }) {
    const response = await fetch("/api/research/ideas", {
      body: JSON.stringify({ path: idea.path, ...updates }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });
    const data = await response.json();
    if (!response.ok || !data?.idea) throw new Error(data?.message || "Sticky update failed");
    const nextIdea = data.idea as ResearchIdea;
    setIdeas((current) => current.map((item) => item.path === nextIdea.path ? nextIdea : item));
    return { idea: nextIdea, message: String(data.message || "Sticky note updated.") };
  }

  async function saveIdeaChanges(idea: ResearchIdea) {
    const body = editingIdea?.path === idea.path ? editingIdea.text.trim() : "";
    if (!body || savingIdea) return;
    setSavingIdea(true);
    try {
      const result = await patchIdea(idea, { body });
      setEditingIdea(null);
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That sticky note could not be updated.");
    } finally {
      setSavingIdea(false);
    }
  }

  async function attachIdeaToPaper(idea: ResearchIdea, paper: ResearchPaper) {
    const ref = paperConnectionRef(paper);
    if (!ref) {
      setMessage("That paper does not have a stable library reference yet.");
      return;
    }
    if ((idea.connectedPaperRefs || []).some((item) => paperMatchesConnectionRef(paper, item))) {
      setMessage(`This sticky is already attached to ${paper.title}.`);
      return;
    }
    try {
      const result = await patchIdea(idea, { connectedPaperRefs: [...(idea.connectedPaperRefs || []), ref] });
      setMessage(`Sticky attached to ${paper.title}. ${result.idea.connectedPaperRefs.length} connected ${result.idea.connectedPaperRefs.length === 1 ? "paper" : "papers"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That paper connection could not be saved.");
    }
  }

  async function detachIdeaFromPaper(idea: ResearchIdea, paper: ResearchPaper) {
    const nextRefs = (idea.connectedPaperRefs || []).filter((ref) => !paperMatchesConnectionRef(paper, ref));
    try {
      await patchIdea(idea, { connectedPaperRefs: nextRefs });
      setMessage(`Sticky detached from ${paper.title}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That paper connection could not be removed.");
    }
  }

  async function deleteIdea(idea: ResearchIdea) {
    if (deletingIdea) return;
    setDeletingIdea(true);
    try {
      const response = await fetch("/api/research/ideas", {
        body: JSON.stringify({ path: idea.path }),
        headers: { "content-type": "application/json" },
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.message || "Sticky deletion failed");
      setIdeas((current) => current.filter((item) => item.path !== idea.path));
      setLayout((current) => {
        const next = { ...current };
        delete next[ideaDeskKey(idea.path)];
        persistLayout(next);
        return next;
      });
      setSelection((current) => current?.kind === "idea" && current.path === idea.path ? null : current);
      setEditingIdea((current) => current?.path === idea.path ? null : current);
      setPendingDeleteIdea(null);
      setMessage(data.message || "Sticky note deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That sticky note could not be deleted.");
    } finally {
      setDeletingIdea(false);
    }
  }

  function organizeDesk(nextMode = sortMode) {
    clearOrganizeTimers();
    const gathered: DeskLayout = {};
    ideas.forEach((idea, index) => {
      gathered[ideaDeskKey(idea.path)] = { x: 0.5, y: 0.64, rotation: index % 2 ? 2 : -2, z: 1200 + index };
    });
    setStackCursors({});
    setOrganizing("gathering");
    setLayout(gathered);
    setMessage("Gathering the papers...");

    organizeTimers.current.push(window.setTimeout(() => {
      const organized = buildIdeaLayout(ideas);
      setOrganizing("settling");
      setLayout(organized);
      persistLayout(organized);
      setMessage(`Sorted by ${nextMode === "reading" ? "reading stage" : nextMode === "recent" ? "recently added" : nextMode}.`);
    }, 360));
    organizeTimers.current.push(window.setTimeout(() => setOrganizing(""), 1350));
  }

  function changeSort(nextMode: SortMode) {
    setSortMode(nextMode);
    localStorage.setItem(RESEARCH_DESK_SORT_KEY, nextMode);
    organizeDesk(nextMode);
  }

  function bringForward(key: string, fallback?: DeskPosition) {
    setLayout((current) => {
      const top = Math.max(0, ...Object.values(current).map((item) => item.z || 0)) + 1;
      const next = { ...current, [key]: { ...(current[key] || fallback || { x: 0.3, y: 0.3, rotation: 0, z: top }), z: top } };
      return next;
    });
  }

  function nudgeStack(key: string, fallback: DeskPosition, deltaX: number, deltaY: number) {
    const rect = deskRef.current?.getBoundingClientRect();
    const xLimit = (rect?.width || 1200) * 0.72;
    const yLimit = (rect?.height || 760) * 0.72;
    setLayout((current) => {
      const base = current[key] || fallback;
      const top = Math.max(0, ...Object.values(current).map((item) => item.z || 0)) + 1;
      const next = {
        ...current,
        [key]: {
          ...base,
          x: clamp(base.x + deltaX, -xLimit, xLimit),
          y: clamp(base.y + deltaY, -yLimit, yLimit),
          z: top,
        },
      };
      persistLayout(next);
      return next;
    });
    setMessage("Stack position saved. Use Stack desk to reset the arrangement.");
  }

  function stackClickWasDrag(key: string) {
    if (suppressStackClickRef.current !== key) return false;
    suppressStackClickRef.current = "";
    return true;
  }

  function beginDrag(event: ReactPointerEvent<HTMLElement>, key: string, kind: DragState["kind"] = "idea", fallback?: DeskPosition) {
    if (event.button !== 0 || !deskRef.current) return;
    const position = layout[key] || fallback;
    if (!position) return;
    const now = performance.now();
    dragRef.current = {
      captureTarget: event.currentTarget,
      kind,
      key,
      moved: false,
      origin: position,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      lastAt: now,
      velocityX: 0,
      velocityY: 0,
    };
    setDraggingKey(key);
    setDropTargetPaperId("");
    bringForward(key, position);
  }

  function paperAtPoint(clientX: number, clientY: number) {
    for (const element of document.elementsFromPoint(clientX, clientY)) {
      const paperElement = element.closest<HTMLElement>("[data-research-paper-id]");
      const id = paperElement?.dataset.researchPaperId;
      if (!id) continue;
      const paper = papers.find((item) => item.id === id);
      if (paper) return paper;
    }
    return null;
  }

  function moveDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    const desk = deskRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !desk) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.moved && distance < 5) return;
    if (!drag.moved) {
      drag.moved = true;
      try { drag.captureTarget.setPointerCapture(event.pointerId); } catch { /* Drag still works if pointer capture is unavailable. */ }
    }
    const targetPaper = drag.kind === "idea" ? paperAtPoint(event.clientX, event.clientY) : null;
    setDropTargetPaperId((current) => current === (targetPaper?.id || "") ? current : targetPaper?.id || "");
    const rect = desk.getBoundingClientRect();
    const now = performance.now();
    const elapsed = Math.max(8, now - drag.lastAt);
    drag.velocityX = (event.clientX - drag.lastX) / elapsed;
    drag.velocityY = (event.clientY - drag.lastY) / elapsed;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.lastAt = now;
    const x = drag.kind === "stack"
      ? clamp(drag.origin.x + (event.clientX - drag.startX) / camera.scale, -rect.width * 0.72, rect.width * 0.72)
      : clamp(drag.origin.x + (event.clientX - drag.startX) / (rect.width * camera.scale), 0.05, 0.94);
    const y = drag.kind === "stack"
      ? clamp(drag.origin.y + (event.clientY - drag.startY) / camera.scale, -rect.height * 0.72, rect.height * 0.72)
      : clamp(drag.origin.y + (event.clientY - drag.startY) / (rect.height * camera.scale), 0.09, 0.91);
    setLayout((current) => ({ ...current, [drag.key]: { ...(current[drag.key] || drag.origin), x, y } }));
  }

  function cancelDeskItemDrag() {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDraggingKey("");
    setDropTargetPaperId("");
    setLayout((current) => {
      persistLayout(current);
      return current;
    });
  }

  function endDrag(event: { clientX: number; clientY: number; pointerId: number }) {
    const drag = dragRef.current;
    const desk = deskRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !desk) return;
    if (drag.kind === "stack") {
      if (drag.moved) {
        suppressStackClickRef.current = drag.key;
        setMessage("Stack position saved. Use Stack desk to reset the arrangement.");
        window.setTimeout(() => {
          if (suppressStackClickRef.current === drag.key) suppressStackClickRef.current = "";
        }, 0);
      }
      setLayout((current) => {
        persistLayout(current);
        return current;
      });
      dragRef.current = null;
      setDraggingKey("");
      setDropTargetPaperId("");
      return;
    }
    const rect = desk.getBoundingClientRect();
    const dropPaper = drag.moved ? paperAtPoint(event.clientX, event.clientY) : null;
    const idea = ideas.find((item) => ideaDeskKey(item.path) === drag.key) || null;
    setLayout((current) => {
      const currentPosition = current[drag.key] || drag.origin;
      const settleDirection = currentPosition.x > 0.72 ? -1 : 1;
      const next = {
        ...current,
        [drag.key]: {
          ...currentPosition,
          x: dropPaper
            ? clamp(currentPosition.x + settleDirection * 0.055, 0.05, 0.94)
            : clamp(currentPosition.x + (drag.velocityX * 72) / (rect.width * camera.scale), 0.05, 0.94),
          y: dropPaper
            ? clamp(currentPosition.y + 0.035, 0.09, 0.91)
            : clamp(currentPosition.y + (drag.velocityY * 72) / (rect.height * camera.scale), 0.09, 0.91),
          rotation: dropPaper ? clamp(currentPosition.rotation * 0.6, -3, 3) : clamp(currentPosition.rotation + drag.velocityX * 0.5, -6, 6),
        },
      };
      persistLayout(next);
      return next;
    });
    dragRef.current = null;
    setDraggingKey("");
    setDropTargetPaperId("");
    if (dropPaper && idea) void attachIdeaToPaper(idea, dropPaper);
  }

  useEffect(() => {
    if (!isActive) return undefined;
    const finishDrag = (event: PointerEvent) => endDrag(event);
    const cancelDrag = () => cancelDeskItemDrag();
    window.addEventListener("pointerup", finishDrag, true);
    window.addEventListener("pointercancel", cancelDrag, true);
    return () => {
      window.removeEventListener("pointerup", finishDrag, true);
      window.removeEventListener("pointercancel", cancelDrag, true);
    };
  }, [camera.scale, ideas, isActive, papers]);

  async function openVaultPaper(paper: ResearchPaper) {
    if (!paper.path) return;
    setMessage(`Opening ${paper.title} in Obsidian...`);
    try {
      const response = await fetch("/api/files/open", {
        body: JSON.stringify({ kind: "file", path: paper.path, rootKey: "vault", sourceId: "obsidian" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error("Open failed");
    } catch {
      setMessage("That paper note could not be opened.");
    }
  }

  function openZoteroPaper(paper: ResearchPaper) {
    if (!paper.zoteroUrl) return;
    window.open(paper.zoteroUrl, "_blank", "noopener,noreferrer");
  }

  function addConnectedNote(paper?: ResearchPaper | null) {
    if (!paper) {
      onOpenWorkbench("Rough research note or question:\n\n");
      return;
    }
    const connection = paper.path ? `[[${paper.path.replace(/\.md$/i, "")}]]` : `${paper.title} (${paper.zoteroUrl || paper.doi})`;
    onOpenWorkbench(`Rough research note connected to ${connection}:\n\n`);
  }

  async function patchPaperState(paper: ResearchPaper, updates: Partial<Pick<ResearchPaper, "dogEared" | "readingStatus">>) {
    const previous = paper;
    setPapers((current) => current.map((item) => item.id === paper.id ? { ...item, ...updates } : item));
    try {
      const response = await fetch("/api/research/papers/state", {
        body: JSON.stringify({ id: paper.id, path: paper.path, zoteroKey: paper.zoteroKey, ...updates }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error("Save failed");
      setMessage(updates.dogEared !== undefined ? (updates.dogEared ? "Dog-ear saved." : "Dog-ear removed.") : `Marked ${READING_STATUS_LABELS[updates.readingStatus || paper.readingStatus].toLowerCase()}.`);
    } catch {
      setPapers((current) => current.map((item) => item.id === paper.id ? previous : item));
      setMessage("That paper update could not be saved.");
    }
  }

  async function copyApa(paper: ResearchPaper) {
    const citation = paper.apaCitation || paper.citation;
    if (!citation) {
      setMessage("This paper does not have a citation to copy yet.");
      return;
    }
    let copied = false;
    try {
      await navigator.clipboard.writeText(citation);
      copied = true;
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = citation;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      copied = document.execCommand("copy");
      textarea.remove();
    }
    if (!copied) {
      try {
        const response = await fetch("/api/research/copy", {
          body: JSON.stringify({ text: citation }),
          headers: { "content-type": "application/json" },
          method: "POST",
        });
        copied = response.ok;
      } catch {
        copied = false;
      }
    }
    setMessage(copied ? "APA citation copied." : "The citation could not be copied.");
  }

  async function syncLibrary() {
    setSyncing(true);
    setMessage("Checking Zotero and completing exact DOI metadata...");
    try {
      const response = await fetch("/api/research/papers/sync", { method: "POST" });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data?.papers)) throw new Error("Sync failed");
      setPapers(data.papers);
      setSources(data.sources || null);
      placeIdeas(ideas, true);
      const attempted = Number(data.sync?.metadataAttempted || 0);
      const resolved = Number(data.sync?.metadataResolved || 0);
      const unresolved = Number(data.sync?.metadataUnresolved || 0);
      const metadataMessage = attempted
        ? `${attempted} DOI record${attempted === 1 ? "" : "s"} checked; ${resolved} completed${unresolved ? `, ${unresolved} still need source details` : ""}.`
        : "Exact DOI metadata is current.";
      setMessage(`Library synced. ${metadataMessage} ${data.sync?.updatedNotes || 0} vault note${data.sync?.updatedNotes === 1 ? "" : "s"} completed without overwriting your notes.`);
    } catch {
      setMessage("The library could not sync. Your current desk is unchanged.");
    } finally {
      setSyncing(false);
    }
  }

  async function buildObsidianShelf() {
    setShelving(true);
    setMessage("Building a compact Obsidian shelf from your current Zotero library...");
    try {
      const response = await fetch("/api/research/obsidian-shelf", { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data?.shelfPath) throw new Error("Shelf build failed");
      const paperCount = Number(data.zoteroPaperCount || 0);
      setMessage("Obsidian Shelf is ready: " + paperCount + " Zotero record" + (paperCount === 1 ? "" : "s") + " in one browsable note.");
    } catch {
      setMessage("The Obsidian Shelf could not be built. Your research library is unchanged.");
    } finally {
      setShelving(false);
    }
  }

  function selectPaper(paper: ResearchPaper, stack?: PaperStack) {
    setSelection({ kind: "paper", path: paper.id });
    if (stack) {
      const index = stack.papers.findIndex((item) => item.id === paper.id);
      if (index >= 0) setStackCursors((current) => ({ ...current, [stack.key]: index }));
    }
  }

  function selectIdea(idea: ResearchIdea) {
    const key = ideaDeskKey(idea.path);
    setSelection({ kind: "idea", path: idea.path });
    bringForward(key);
  }

  return (
    <Panel className="research-workspace-panel flex min-h-0 flex-col overflow-hidden p-0">
      <header className="research-desk-header flex flex-none items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
        <div className="flex min-w-0 shrink-0 items-center gap-3">
          <button aria-label="Back to home" className="research-icon-button" onClick={onClose} type="button">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <BookOpen className="h-5 w-5 text-slate-300" />
          <div className="min-w-0">
            <h2 className="whitespace-nowrap text-sm font-semibold uppercase tracking-[0.16em] text-white">Research Desk</h2>
            <p className="mt-0.5 truncate text-xs text-slate-400">
              {sources
                ? hasActiveFilter
                  ? `${visiblePapers.length} matching ${visiblePapers.length === 1 ? "paper" : "papers"} in ${deskStacks.length} visible ${deskStacks.length === 1 ? "stack" : "stacks"}`
                  : `${sources.mergedCount} papers in ${deskStacks.length} visible stacks`
                : "Your papers, reading stages, and connected notes in one place"}
            </p>
          </div>
        </div>

        <div className="research-desk-controls">
          <label className="research-desk-search">
            <Search className="h-4 w-4" />
            <input aria-label="Search research desk" onChange={(event) => setQuery(event.target.value)} placeholder="Find title, author, DOI, or subject" value={query} />
          </label>
          <label className="research-compact-select">
            <span className="sr-only">Filter by subject</span>
            <select aria-label="Filter by subject" onChange={(event) => setSubject(event.target.value)} value={subject}>
              {subjects.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="research-compact-select">
            <span className="sr-only">Filter by reading stage</span>
            <select aria-label="Filter by reading stage" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
              <option>All stages</option>
              {Object.entries(READING_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="research-compact-select research-sort-select">
            <span className="sr-only">Arrange research desk</span>
            <select aria-label="Arrange research desk" onChange={(event) => changeSort(event.target.value as SortMode)} value={sortMode}>
              <option value="author">Arrange: Author</option>
              <option value="date">Arrange: Published</option>
              <option value="subject">Arrange: Subject</option>
              <option value="reading">Arrange: Reading stage</option>
              <option value="recent">Arrange: Recently added</option>
            </select>
          </label>
        </div>
      </header>

      {hasActiveFilter ? (
        <div aria-label={`${visiblePapers.length} filtered research results`} aria-live="polite" className="research-active-filters" role="region">
          <strong>{visiblePapers.length} {visiblePapers.length === 1 ? "match" : "matches"}</strong>
          {query.trim() ? (
            <button aria-label="Clear research search" onClick={() => setQuery("")} type="button">
              Search: {query.trim()} <X className="h-3 w-3" />
            </button>
          ) : null}
          {subject !== "All subjects" ? (
            <button aria-label="Clear subject filter" onClick={() => setSubject("All subjects")} type="button">
              {subject} <X className="h-3 w-3" />
            </button>
          ) : null}
          {statusFilter !== "All stages" ? (
            <button aria-label="Clear reading stage filter" onClick={() => setStatusFilter("All stages")} type="button">
              {READING_STATUS_LABELS[statusFilter as ReadingStatus]} <X className="h-3 w-3" />
            </button>
          ) : null}
          {metadataFocus ? (
            <button aria-label="Clear missing details filter" onClick={() => setMetadataFocus(false)} type="button">
              Needs details <X className="h-3 w-3" />
            </button>
          ) : null}
          <button className="research-clear-filters" onClick={() => showAllPapers()} type="button">Reset all</button>
        </div>
      ) : null}

      <div
        className={`research-desk-canvas research-desk-${organizing || "resting"} ${cameraDragging ? "research-desk-panning" : ""}`}
        aria-label="Research desk canvas. Drag paper stacks to arrange them. Drag the empty desk or use W, A, S, and D to pan. Use the scroll wheel to zoom."
        onContextMenu={(event) => openDeskContextMenu(event, "canvas")}
        onDoubleClick={handleDeskDoubleClick}
        onPointerCancel={(event) => {
          endCameraDrag(event);
          cancelDeskItemDrag();
        }}
        onPointerDown={beginCameraDrag}
        onPointerMove={moveCameraDrag}
        onPointerUp={(event) => {
          endCameraDrag(event);
          endDrag(event);
        }}
        onWheel={zoomDesk}
        ref={deskRef}
        tabIndex={0}
      >
        <div className="research-desk-grain" aria-hidden="true" />
        <div className="research-location-tab research-location-tab-papers">
          <FileText className="h-3.5 w-3.5" />
          <span><strong>Papers</strong> · {sources?.mergedCount ?? papers.length} unified · {sources?.vaultCount ?? papers.filter((paper) => paper.path).length} vault notes · {sources?.zoteroCount ?? papers.filter((paper) => paper.zoteroKey).length} Zotero records</span>
          <small>{visiblePapers.length} shown</small>
        </div>
        <div className="research-location-tab research-location-tab-ideas">
          <Lightbulb className="h-3.5 w-3.5" />
          <span><strong>Ideas</strong> · sticky notes</span>
          <small>{visibleIdeas.length}</small>
        </div>
        <div className="research-desk-hint">
          <Compass className="h-3.5 w-3.5" />
          <span>Drag stacks to arrange · drag empty desk or use WASD to pan · wheel to zoom ({Math.round(camera.scale * 100)}%) · double-click for a sticky.</span>
        </div>

        {loading ? <div className="research-desk-loading">Setting out the research desk...</div> : null}
        {organizing === "gathering" ? <div className="research-gathering-note"><Layers3 className="h-4 w-4" /> Gathering papers</div> : null}

        {connectionViewport.width && connectionViewport.height && connectionViewport.lines.length ? (
          <svg
            aria-hidden="true"
            className="research-connection-layer"
            preserveAspectRatio="none"
            viewBox={`0 0 ${connectionViewport.width} ${connectionViewport.height}`}
          >
            {connectionViewport.lines.map((line) => {
              const bend = Math.max(34, Math.abs(line.x2 - line.x1) * 0.42);
              const direction = line.x2 >= line.x1 ? 1 : -1;
              return (
                <g className={line.active ? "is-active" : ""} key={line.id}>
                  <path d={`M ${line.x1} ${line.y1} C ${line.x1 + bend * direction} ${line.y1}, ${line.x2 - bend * direction} ${line.y2}, ${line.x2} ${line.y2}`} />
                  <circle cx={line.x2} cy={line.y2} r="3" />
                </g>
              );
            })}
          </svg>
        ) : null}

        <div
          className="research-desk-world"
          style={{
            "--research-camera-x": camera.x + "px",
            "--research-camera-y": camera.y + "px",
            "--research-camera-scale": camera.scale,
          } as CSSProperties}
        >
        <div aria-label="Research paper stacks" className="research-stack-grid" role="list">
          {deskStacks.map((stack, stackIndex) => {
            const cursor = stackCursor(stack);
            const paper = stack.papers[cursor];
            const stackLayoutKey = stackDeskKey(sortMode, stack.key);
            const stackPosition = layout[stackLayoutKey] || { x: 0, y: 0, rotation: 0, z: 800 + stackIndex };
            const visibleLayers = Math.min(4, Math.max(0, stack.papers.length - 1));
            const stackKind = sortMode === "author"
              ? "Author range"
              : sortMode === "date"
                ? "Publication range"
                : sortMode === "reading"
                  ? "Reading stage"
                  : "Subject stack";
            return (
              <section
                className={`research-paper-stack ${draggingKey === stackLayoutKey ? "research-paper-stack-dragging" : ""}`}
                data-research-stack-key={stack.key}
                key={stack.key}
                onLostPointerCapture={() => {
                  if (dragRef.current?.key === stackLayoutKey) cancelDeskItemDrag();
                }}
                onPointerCancel={() => cancelDeskItemDrag()}
                onPointerDown={(event) => {
                  const target = event.target instanceof Element ? event.target : null;
                  if (target?.closest(".research-stack-cycle-controls, .research-paper-dogear")) return;
                  beginDrag(event, stackLayoutKey, "stack", stackPosition);
                }}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onWheel={(event) => handleStackWheel(event, stack)}
                role="listitem"
                style={{
                  "--stack-delay": `${Math.min(stackIndex * 24, 240)}ms`,
                  "--stack-offset-x": `${stackPosition.x}px`,
                  "--stack-offset-y": `${stackPosition.y}px`,
                  zIndex: stackPosition.z,
                } as CSSProperties}
              >
                <button
                  aria-label={`${stack.label}, ${stack.papers.length} ${stack.papers.length === 1 ? "paper" : "papers"}. Click to open. Drag to arrange, or use Shift plus arrow keys.`}
                  aria-expanded={focusedStackKey === stack.key}
                  className="research-paper-stack-heading"
                  onClick={(event) => {
                    if (stackClickWasDrag(stackLayoutKey)) return;
                    openFocusedStack(stack, event.currentTarget);
                  }}
                  onKeyDown={(event) => {
                    if (!event.shiftKey) return;
                    const step = event.altKey ? 8 : 20;
                    if (event.key === "ArrowLeft") nudgeStack(stackLayoutKey, stackPosition, -step, 0);
                    else if (event.key === "ArrowRight") nudgeStack(stackLayoutKey, stackPosition, step, 0);
                    else if (event.key === "ArrowUp") nudgeStack(stackLayoutKey, stackPosition, 0, -step);
                    else if (event.key === "ArrowDown") nudgeStack(stackLayoutKey, stackPosition, 0, step);
                    else return;
                    event.preventDefault();
                  }}
                  type="button"
                >
                  <span>{stack.label}</span>
                  <strong>{stack.papers.length} {stack.papers.length === 1 ? "paper" : "papers"}</strong>
                  <small>{stackKind} · drag to arrange · click to open · {cursor + 1} of {stack.papers.length}</small>
                </button>

                <div
                  aria-label={`${stack.label} stack. Use left and right arrow keys or the mouse wheel to browse. Press Enter to select the front paper.`}
                  className="research-paper-stack-cards"
                  onDoubleClick={() => openFocusedStack(stack)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                      event.preventDefault();
                      cycleStack(stack, -1);
                    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                      event.preventDefault();
                      cycleStack(stack, 1);
                    } else if ((event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) {
                      event.preventDefault();
                      selectPaper(paper, stack);
                    }
                  }}
                  onWheel={(event) => handleStackWheel(event, stack)}
                  tabIndex={0}
                >
                  {Array.from({ length: visibleLayers }, (_, layerIndex) => {
                    const layer = visibleLayers - layerIndex;
                    return (
                      <span
                        aria-hidden="true"
                        className="research-paper-layer"
                        key={layer}
                        style={{
                          "--paper-layer": layer,
                          "--paper-layer-lean": `${layer % 2 ? 0.45 : -0.35}deg`,
                          "--subject-hue": subjectHue(paper.primarySubject),
                        } as CSSProperties}
                      />
                    );
                  })}

                  <article
                    aria-label={`${paper.title}, ${paper.authorLabel}, ${paper.year}. ${cursor + 1} of ${stack.papers.length} in ${stack.label}.`}
                    className={`research-paper-card research-stack-front-card research-desk-item ${paper.metadataComplete ? "research-paper-card-complete" : "research-paper-card-incomplete"} ${paper.dogEared ? "research-paper-card-dog-eared" : ""} ${selection?.kind === "paper" && selection.path === paper.id ? "research-desk-item-selected" : ""} ${dropTargetPaperId === paper.id ? "research-paper-sticky-target" : ""}`}
                    data-research-paper-id={paper.id}
                    onClick={() => {
                      if (stackClickWasDrag(stackLayoutKey)) return;
                      selectPaper(paper, stack);
                    }}
                    onContextMenu={(event) => openDeskContextMenu(event, "paper", { paper })}
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                      openFocusedStack(stack, event.currentTarget);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectPaper(paper, stack);
                      }
                    }}
                    role="button"
                    style={{ "--desk-rotation": "0deg", "--subject-hue": subjectHue(paper.primarySubject) } as CSSProperties}
                    tabIndex={0}
                  >
                    <button
                      aria-label={paper.dogEared ? `Remove dog-ear from ${paper.title}` : `Dog-ear ${paper.title}`}
                      aria-pressed={paper.dogEared}
                      className="research-paper-dogear"
                      onClick={(event) => {
                        event.stopPropagation();
                        void patchPaperState(paper, { dogEared: !paper.dogEared });
                      }}
                      onDoubleClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) => event.stopPropagation()}
                      title={paper.dogEared ? "Remove dog-ear" : "Dog-ear this paper"}
                      type="button"
                    >
                      <Bookmark className="h-3.5 w-3.5" />
                    </button>
                    <span className="research-paper-kicker">{paper.authorLabel} · {paper.year || "n.d."}</span>
                    <strong>{paper.title}</strong>
                    <span className="research-paper-title">{paper.summaryPreview || "No abstract or summary has been saved yet."}</span>
                    <span className="research-paper-footer">
                      <span className="research-paper-subject">{paper.primarySubject}</span>
                      <span>{READING_STATUS_LABELS[paper.readingStatus]}</span>
                    </span>
                  </article>

                  {stack.papers.length > 1 ? (
                    <div aria-label={`${stack.label} stack controls`} className="research-stack-cycle-controls">
                      <button aria-label={`Previous paper in ${stack.label}`} onClick={() => cycleStack(stack, -1)} type="button"><ChevronLeft className="h-3.5 w-3.5" /></button>
                      <button aria-label={`Next paper in ${stack.label}`} onClick={() => cycleStack(stack, 1)} type="button"><ChevronRight className="h-3.5 w-3.5" /></button>
                    </div>
                  ) : null}
                  <span className="research-stack-position">{cursor + 1} / {stack.papers.length}</span>
                </div>
              </section>
            );
          })}
        </div>

        {visibleIdeas.map((idea, index) => {
          const key = ideaDeskKey(idea.path);
          const connectedPapers = connectedPapersForIdea(idea, papers);
          const position = layout[key] || { x: 0.55, y: 0.78, rotation: index % 2 ? 2 : -2, z: 1400 + index };
          const style = {
            "--desk-delay": `${Math.min(index * 16, 250)}ms`,
            "--desk-x": `${position.x * 100}%`,
            "--desk-y": `${position.y * 100}%`,
            "--desk-rotation": `${position.rotation}deg`,
            zIndex: position.z,
          } as CSSProperties;
          if (editingIdea?.path === idea.path) {
            return (
              <form
                aria-label={`Edit sticky note ${idea.topic}`}
                className="research-sticky-note research-sticky-editor research-desk-item research-desk-item-selected"
                data-research-idea-path={idea.path}
                key={idea.path}
                onDoubleClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveIdeaChanges(idea);
                }}
                style={style}
              >
                <div className="research-sticky-editor-title"><PenLine className="h-3.5 w-3.5" /> Edit sticky</div>
                <textarea
                  aria-label="Sticky note text"
                  autoFocus
                  disabled={savingIdea}
                  onChange={(event) => setEditingIdea({ path: idea.path, text: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                      event.preventDefault();
                      void saveIdeaChanges(idea);
                    }
                  }}
                  value={editingIdea.text}
                />
                <div className="research-sticky-editor-actions">
                  <button disabled={savingIdea} onClick={() => setEditingIdea(null)} type="button">Cancel</button>
                  <button disabled={savingIdea || !editingIdea.text.trim()} type="submit">{savingIdea ? "Saving..." : "Save"}</button>
                </div>
              </form>
            );
          }
          return (
            <button
              aria-label={`Research idea ${idea.topic}. ${connectedPapers.length ? `Attached to ${connectedPapers.length} ${connectedPapers.length === 1 ? "paper" : "papers"}.` : "Not attached to a paper."} Double-click to edit.`}
              className={`research-sticky-note research-desk-item ${connectedPapers.length ? "research-sticky-note-connected" : ""} ${selection?.kind === "idea" && selection.path === idea.path ? "research-desk-item-selected" : ""} ${draggingKey === key ? "research-desk-item-dragging research-sticky-attaching" : ""}`}
              data-research-idea-path={idea.path}
              key={idea.path}
              onClick={() => selectIdea(idea)}
              onContextMenu={(event) => openDeskContextMenu(event, "idea", { idea })}
              onDoubleClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                startEditingIdea(idea);
              }}
              onLostPointerCapture={() => {
                if (dragRef.current?.key === key) cancelDeskItemDrag();
              }}
              onPointerCancel={() => cancelDeskItemDrag()}
              onPointerDown={(event) => {
                setSelection({ kind: "idea", path: idea.path });
                beginDrag(event, key);
              }}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              style={style}
              type="button"
            >
              <Lightbulb className="h-4 w-4" />
              <strong>{idea.topic}</strong>
              <span>{idea.preview || "Loose question - no detail yet."}</span>
              <span className="research-sticky-connection-count">
                <Link2 className="h-3 w-3" /> {connectedPapers.length ? `${connectedPapers.length} ${connectedPapers.length === 1 ? "paper" : "papers"}` : draggingKey === key ? "Drop on a paper" : "Drag onto a paper"}
              </span>
            </button>
          );
        })}

        {draftSticky ? (
          <div
            className="research-draft-sticky"
            onPointerDown={(event) => event.stopPropagation()}
            style={{
              "--desk-x": draftSticky.x * 100 + "%",
              "--desk-y": draftSticky.y * 100 + "%",
            } as CSSProperties}
          >
            <div className="research-draft-sticky-title"><StickyNote className="h-3.5 w-3.5" /> New research sticky</div>
            <textarea
              aria-label="New research sticky note"
              disabled={savingSticky}
              onBlur={finishDraftSticky}
              onChange={(event) => setDraftSticky((current) => current ? { ...current, text: event.target.value } : current)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setDraftSticky(null);
                }
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  void saveDraftSticky();
                }
              }}
              placeholder="A question, observation, or loose connection..."
              ref={draftStickyRef}
              value={draftSticky.text}
            />
            <small>{savingSticky ? "Saving..." : "Click away to save · empty notes disappear"}</small>
          </div>
        ) : null}
        </div>

        {!loading && !visiblePapers.length && !visibleIdeas.length ? (
          <div className="research-desk-empty">
            <Search className="h-6 w-6" />
            <strong>No matching papers</strong>
            <span>Try a broader search or clear the active filters.</span>
            <button onClick={() => showAllPapers()} type="button">Show all papers</button>
          </div>
        ) : null}

        {focusedStack ? (
          <>
            <button
              aria-label={`Close ${focusedStack.label} stack`}
              className={`research-stack-scrim ${focusedStackClosing ? "is-closing" : ""}`}
              onClick={(event) => {
                event.stopPropagation();
                closeFocusedStack();
              }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                closeFocusedStack();
              }}
              type="button"
            />
            <section
              aria-label={`${focusedStack.label} focused stack`}
              className={`research-focused-stack ${focusedStackClosing ? "is-closing" : ""}`}
              ref={focusedStackRef}
              tabIndex={-1}
            >
              <header className="research-focused-stack-header">
                <div>
                  <span><Layers3 className="h-3.5 w-3.5" /> Focused stack</span>
                  <h3>{focusedStack.label}</h3>
                  <p>{focusedPapers.length} {focusedPapers.length === 1 ? "paper" : "papers"}{hasActiveFilter ? " matching the current filters" : ""}</p>
                </div>
                <div className="research-focused-stack-actions">
                  <label>
                    <span className="sr-only">Sort papers within this stack</span>
                    <select aria-label="Sort papers within this stack" onChange={(event) => setFocusedStackSort(event.target.value as FocusedSortMode)} value={focusedStackSort}>
                      <option value="author">Author</option>
                      <option value="title">Title</option>
                      <option value="date">Published</option>
                      <option value="reading">Reading stage</option>
                      <option value="recent">Recently added</option>
                    </select>
                  </label>
                  <button aria-label="Close focused stack" onClick={() => closeFocusedStack()} type="button"><X className="h-4 w-4" /></button>
                </div>
              </header>

              <div aria-label={`${focusedStack.label} papers`} className="research-focused-stack-grid" role="listbox">
                {focusedPapers.map((paper, index) => (
                  <button
                    aria-label={`${paper.title}, ${paper.authorLabel}, ${paper.year}`}
                    aria-selected={selection?.kind === "paper" && selection.path === paper.id}
                    className={`research-focused-paper ${selection?.kind === "paper" && selection.path === paper.id ? "is-selected" : ""} ${dropTargetPaperId === paper.id ? "research-paper-sticky-target" : ""}`}
                    data-research-paper-id={paper.id}
                    key={paper.id}
                    onClick={() => selectPaper(paper, focusedStack)}
                    onContextMenu={(event) => openDeskContextMenu(event, "paper", { paper })}
                    onKeyDown={(event) => handleFocusedPaperKey(event, index)}
                    role="option"
                    style={{ "--subject-hue": subjectHue(paper.primarySubject) } as CSSProperties}
                    type="button"
                  >
                    <span className="research-focused-paper-index">{String(index + 1).padStart(2, "0")}</span>
                    <span className="research-paper-kicker">{paper.authorLabel} · {paper.year || "n.d."}</span>
                    <strong>{paper.title}</strong>
                    <span className="research-focused-paper-summary">{paper.summaryPreview || "No abstract or summary has been saved yet."}</span>
                    <span className="research-paper-footer">
                      <span>{sourceLabel(paper.source)}{paper.dogEared ? " · Dog-eared" : ""}</span>
                      <span>{READING_STATUS_LABELS[paper.readingStatus]}</span>
                    </span>
                  </button>
                ))}
              </div>

              <footer className="research-focused-stack-footer">
                <span>Click a paper to place it on the reading stand.</span>
                <span>Esc or click outside to return to the desk.</span>
              </footer>
            </section>
          </>
        ) : null}

        <aside className={`research-reading-sheet ${selectedIdea ? "research-reading-sheet-idea" : ""}`} ref={readingSheetRef}>
          {selectedPaper ? (
            <>
              <div className="research-reading-sheet-topline">
                <span><Sparkles className="h-3.5 w-3.5" /> Reading copy</span>
                <button
                  aria-label={selectedPaper.dogEared ? "Remove dog-ear" : "Dog-ear this paper"}
                  aria-pressed={selectedPaper.dogEared}
                  className={`research-reading-dogear ${selectedPaper.dogEared ? "is-active" : ""}`}
                  onClick={() => void patchPaperState(selectedPaper, { dogEared: !selectedPaper.dogEared })}
                  type="button"
                >
                  <Bookmark className="h-3.5 w-3.5" /> {selectedPaper.dogEared ? "Dog-eared" : "Dog-ear"}
                </button>
              </div>
              <p className="research-reading-context">
                <span>{selectedContextLabel}</span>
                {selectedContextPapers.length ? <span>{Math.max(1, selectedContextPosition)} of {selectedContextPapers.length}</span> : null}
              </p>
              <h3>{selectedPaper.title}</h3>
              <p className="research-reading-byline" title={selectedPaper.authors.join("; ") || selectedPaper.authorLabel}>{selectedPaper.authorLabel} · {selectedPaper.year || "n.d."}</p>

              <div className="research-reading-workflow">
                <label>
                  <span>Reading stage</span>
                  <select
                    aria-label="Reading stage"
                    onChange={(event) => void patchPaperState(selectedPaper, { readingStatus: event.target.value as ReadingStatus })}
                    value={selectedPaper.readingStatus}
                  >
                    {Object.entries(READING_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <span className="research-source-pill">
                  {sourceLabel(selectedPaper.source)}{selectedPaper.duplicateCopies > 1 ? ` · ${selectedPaper.duplicateCopies} copies` : ""}
                </span>
              </div>

              <dl className="research-paper-metadata">
                <div><dt>Published</dt><dd>{selectedPaper.datePublished || "unknown"}</dd></div>
                <div><dt>DOI</dt><dd>{selectedPaper.doi || "unknown"}</dd></div>
                <div><dt>Subject</dt><dd>{selectedPaper.primarySubject}</dd></div>
                <div><dt>Library</dt><dd>{sourceLabel(selectedPaper.source)}</dd></div>
                <div><dt>Obsidian note</dt><dd>{selectedPaper.path || "No linked note"}</dd></div>
                <div><dt>Added</dt><dd>{selectedPaper.dateAdded ? new Date(selectedPaper.dateAdded).toLocaleDateString() : "Not recorded"}</dd></div>
              </dl>

              {selectedPaper.metadataConflicts?.length ? (
                <div className="research-metadata-warning research-metadata-conflict">
                  <AlertCircle className="h-4 w-4" />
                  <span>{"Your saved vault value was kept. " + selectedPaper.metadataConflicts.join(" ")}</span>
                </div>
              ) : !selectedPaper.metadataComplete ? (
                <div className="research-metadata-warning">
                  <AlertCircle className="h-4 w-4" />
                  <span>{"Missing: " + (selectedPaper.missingFields || []).join(", ") + ". Add the details from Zotero or the source record."}</span>
                </div>
              ) : null}

              <section className="research-reading-summary">
                <div><Sparkles className="h-3.5 w-3.5" /> {selectedPaper.abstractLabel || "Summary"}</div>
                <p>{readableInsights(selectedPaper.abstract) || "No abstract or summary has been saved yet."}</p>
              </section>

              <section className="research-reading-connections">
                <div><Network className="h-3.5 w-3.5" /> Connected subjects</div>
                <span className="research-subject-chips">
                  {selectedPaper.subjects?.length ? selectedPaper.subjects.map((item) => (
                    <button key={item} onClick={() => setSubject(item)} type="button">{item}</button>
                  )) : <em>No explicit subject links yet.</em>}
                </span>
              </section>

              <p className="research-reading-citation">{selectedPaper.apaCitation || selectedPaper.citation || "Citation has not been completed yet."}</p>

              <div className="research-reading-actions">
                {selectedPaper.zoteroUrl ? <button onClick={() => openZoteroPaper(selectedPaper)} type="button"><ExternalLink className="h-4 w-4" /> Open Zotero</button> : null}
                {selectedPaper.path ? <button onClick={() => void openVaultPaper(selectedPaper)} type="button"><ExternalLink className="h-4 w-4" /> Open note</button> : null}
                <button onClick={() => addConnectedNote(selectedPaper)} type="button"><Link2 className="h-4 w-4" /> Add note</button>
                <button onClick={() => void copyApa(selectedPaper)} type="button"><Copy className="h-4 w-4" /> Copy APA</button>
              </div>
            </>
          ) : selectedIdea ? (
            <>
              <div className="research-reading-sheet-topline"><span><Lightbulb className="h-3.5 w-3.5" /> Research sticky</span><span>{selectedIdea.status}</span></div>
              <h3>{selectedIdea.topic}</h3>
              <p className="research-reading-citation research-idea-body">{selectedIdea.body || selectedIdea.preview || "This sticky does not have detail yet."}</p>
              <dl className="research-paper-metadata">
                <div><dt>Created</dt><dd>{selectedIdea.created || "unknown"}</dd></div>
                <div><dt>Attached to</dt><dd>{selectedIdeaPapers.length} {selectedIdeaPapers.length === 1 ? "paper" : "papers"}</dd></div>
                <div><dt>Stored in</dt><dd>{selectedIdea.path}</dd></div>
              </dl>

              <section className="research-idea-paper-links">
                <div><Link2 className="h-3.5 w-3.5" /> Attached papers</div>
                {selectedIdeaPapers.length ? (
                  <div className="research-idea-paper-link-list">
                    {selectedIdeaPapers.map((paper) => (
                      <div className="research-idea-paper-link" key={paper.id}>
                        <button onClick={() => selectPaper(paper)} type="button">
                          <strong>{paper.title}</strong>
                          <span>{paper.authorLabel} · {paper.year || "n.d."}</span>
                        </button>
                        <button
                          aria-label={`Detach sticky from ${paper.title}`}
                          onClick={() => void detachIdeaFromPaper(selectedIdea, paper)}
                          title="Detach this paper"
                          type="button"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : <p>Drag this sticky onto a paper to attach it. You can attach the same sticky to more than one paper.</p>}
              </section>

              <div className="research-idea-explanation">
                Paper attachments stay with this sticky in the vault and follow matching papers through Research filters.
              </div>
              <div className="research-reading-actions">
                <button onClick={() => startEditingIdea(selectedIdea)} type="button"><PenLine className="h-4 w-4" /> Edit sticky</button>
                <button onClick={() => onOpenWorkbench(`Continue this research idea, connected to [[${selectedIdea.path.replace(/\.md$/i, "")}]]:\n\n${selectedIdea.topic}\n\n`)} type="button"><PenLine className="h-4 w-4" /> Continue in Workbench</button>
                <button className="is-danger" onClick={() => setPendingDeleteIdea(selectedIdea)} type="button"><Trash2 className="h-4 w-4" /> Delete</button>
              </div>
            </>
          ) : hasActiveFilter && !visiblePapers.length ? (
            <div className="research-reading-empty research-reading-empty-filtered">
              <Search className="h-8 w-8" />
              <strong>No matching papers</strong>
              <p>Clear the active filters to return to the complete research desk.</p>
              <button onClick={() => showAllPapers()} type="button">Show all papers</button>
            </div>
          ) : (
            <div className="research-reading-empty"><Layers3 className="h-8 w-8" /><p>Choose a paper or sticky note to place it on the reading stand.</p></div>
          )}
        </aside>

        {subjectManagerOpen ? (
          <section aria-label="Research subjects" className="research-subject-manager" onPointerDown={(event) => event.stopPropagation()}>
            <div className="research-utility-header">
              <div>
                <strong>Subjects</strong>
                <span>One broad home per paper keeps this useful.</span>
              </div>
              <button aria-label="Close subject manager" onClick={() => setSubjectManagerOpen(false)} type="button"><X className="h-3.5 w-3.5" /></button>
            </div>
            <form
              className="research-subject-create"
              onSubmit={(event) => {
                event.preventDefault();
                void createSubject();
              }}
            >
              <input
                aria-label="New research subject"
                disabled={subjectSaving}
                maxLength={72}
                onChange={(event) => setNewSubjectName(event.target.value)}
                placeholder="New broad subject..."
                value={newSubjectName}
              />
              <button disabled={!newSubjectName.trim() || subjectSaving} type="submit"><Plus className="h-3.5 w-3.5" /> Add</button>
            </form>
            <p className="research-subject-guidance">Custom subjects are stored once in your vault index. Paper-derived subjects stay protected while papers still use them.</p>
            <div className="research-subject-list">
              {subjectRecords.map((item) => (
                <div className="research-subject-row" key={item.name}>
                  <button
                    className="research-subject-filter"
                    onClick={() => {
                      setSubject(item.name);
                      setMetadataFocus(false);
                      setMessage(`Showing the ${item.name} subject.`);
                    }}
                    type="button"
                  >
                    <span>{item.name}</span>
                    <small>{item.paperCount} {item.paperCount === 1 ? "paper" : "papers"} · {item.custom ? "Custom" : "From papers"}</small>
                  </button>
                  {item.deletable ? (
                    <button aria-label={`Delete subject ${item.name}`} className="research-subject-delete" disabled={subjectSaving} onClick={() => void deleteSubject(item)} title="Delete this unused custom subject" type="button">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {duplicateReviewOpen && sources?.duplicateGroups?.length ? (
          <section aria-label="Exact duplicate records" className="research-duplicate-review" onPointerDown={(event) => event.stopPropagation()}>
            <div className="research-utility-header">
              <div>
                <strong>Exact duplicates</strong>
                <span>Grouped only when Zotero records share the same DOI.</span>
              </div>
              <button aria-label="Close duplicate review" onClick={() => setDuplicateReviewOpen(false)} type="button"><X className="h-3.5 w-3.5" /></button>
            </div>
            <div className="research-duplicate-groups">
              {sources.duplicateGroups.map((group) => (
                <article key={group.doi}>
                  <div className="research-duplicate-doi"><strong>{group.copies.length} records</strong><span>{group.doi}</span></div>
                  {group.copies.map((copy) => (
                    <div className="research-duplicate-copy" key={copy.id}>
                      <div>
                        <strong>{copy.title}</strong>
                        <span>{copy.authorLabel} · {copy.year || "unknown"} · Zotero {copy.zoteroKey}</span>
                      </div>
                      {copy.zoteroUrl ? <button onClick={() => window.open(copy.zoteroUrl, "_blank", "noopener,noreferrer")} type="button"><ExternalLink className="h-3.5 w-3.5" /> Zotero</button> : null}
                    </div>
                  ))}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {pendingDeleteIdea ? (
          <section
            aria-label={`Delete sticky ${pendingDeleteIdea.topic}`}
            aria-modal="true"
            className="research-sticky-delete-confirm"
            onPointerDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="research-sticky-delete-icon"><Trash2 className="h-4 w-4" /></div>
            <div>
              <strong>Delete this sticky?</strong>
              <p>This removes only the research sticky note. Its connected papers remain unchanged.</p>
            </div>
            <div className="research-sticky-delete-actions">
              <button disabled={deletingIdea} onClick={() => setPendingDeleteIdea(null)} type="button">Cancel</button>
              <button className="is-danger" disabled={deletingIdea} onClick={() => void deleteIdea(pendingDeleteIdea)} type="button">
                {deletingIdea ? "Deleting..." : "Delete sticky"}
              </button>
            </div>
          </section>
        ) : null}

        {contextMenu ? (
          <div
            aria-label="Research desk controls"
            className="research-desk-context-menu"
            role="menu"
            style={{ left: contextMenu.menuX, top: contextMenu.menuY }}
          >
            {contextMenu.kind === "canvas" ? (
              <>
                <button onClick={() => startDraftSticky(contextMenu.point)} role="menuitem" type="button"><Plus className="h-3.5 w-3.5" /> New sticky</button>
                <button onClick={() => { setContextMenu(null); organizeDesk(); }} role="menuitem" type="button"><Layers3 className="h-3.5 w-3.5" /> Stack desk</button>
                <button onClick={toggleMetadataFocus} role="menuitem" type="button"><AlertCircle className="h-3.5 w-3.5" /> {metadataFocus ? "Show all papers" : "Show missing details"}</button>
                <button onClick={() => { setCamera({ scale: 1, x: 0, y: 0 }); setContextMenu(null); setMessage("Desk view reset."); }} role="menuitem" type="button"><Compass className="h-3.5 w-3.5" /> Reset desk view</button>
              </>
            ) : null}
            {contextMenu.kind === "paper" && contextMenu.paper ? (
              <>
                <button onClick={() => { setContextMenu(null); void patchPaperState(contextMenu.paper!, { dogEared: !contextMenu.paper!.dogEared }); }} role="menuitem" type="button"><Bookmark className="h-3.5 w-3.5" /> {contextMenu.paper.dogEared ? "Remove dog-ear" : "Dog-ear paper"}</button>
                <button onClick={() => { setContextMenu(null); void patchPaperState(contextMenu.paper!, { readingStatus: "read" }); }} role="menuitem" type="button"><BookOpen className="h-3.5 w-3.5" /> Mark as read</button>
                <button onClick={() => { setContextMenu(null); addConnectedNote(contextMenu.paper); }} role="menuitem" type="button"><Link2 className="h-3.5 w-3.5" /> Connected note</button>
                {contextMenu.paper.path ? <button onClick={() => { setContextMenu(null); void openVaultPaper(contextMenu.paper!); }} role="menuitem" type="button"><ExternalLink className="h-3.5 w-3.5" /> Open in Obsidian</button> : null}
                {contextMenu.paper.zoteroUrl ? <button onClick={() => { setContextMenu(null); openZoteroPaper(contextMenu.paper!); }} role="menuitem" type="button"><ExternalLink className="h-3.5 w-3.5" /> Open in Zotero</button> : null}
              </>
            ) : null}
            {contextMenu.kind === "idea" && contextMenu.idea ? (
              <>
                <button onClick={() => startEditingIdea(contextMenu.idea!)} role="menuitem" type="button"><PenLine className="h-3.5 w-3.5" /> Edit sticky</button>
                <button onClick={() => startDraftSticky(contextMenu.point)} role="menuitem" type="button"><Plus className="h-3.5 w-3.5" /> New sticky here</button>
                <button onClick={() => { setContextMenu(null); onOpenWorkbench("Continue this research idea, connected to [[" + contextMenu.idea!.path.replace(/\.md$/i, "") + "]]:\n\n" + contextMenu.idea!.topic + "\n\n"); }} role="menuitem" type="button"><PenLine className="h-3.5 w-3.5" /> Continue in Workbench</button>
                <button className="is-danger" onClick={() => { setPendingDeleteIdea(contextMenu.idea!); setContextMenu(null); }} role="menuitem" type="button"><Trash2 className="h-3.5 w-3.5" /> Delete sticky...</button>
              </>
            ) : null}
          </div>
        ) : null}

        <div className="research-desk-status">
          <MapPin className="h-3.5 w-3.5" />
          <span>{papers.length} {papers.length === 1 ? "paper" : "papers"} · {ideas.length} {ideas.length === 1 ? "idea" : "ideas"}</span>
          <button
            aria-pressed={metadataFocus}
            className={metadataFocus ? "research-metadata-status is-active" : "research-metadata-status"}
            disabled={!missingMetadataCount}
            onClick={toggleMetadataFocus}
            title={missingMetadataCount ? "Show papers that need source details" : "All papers have the current metadata fields"}
            type="button"
          >
            {missingMetadataCount ? missingMetadataCount + " need details" : "Paper metadata complete"}
          </button>
          {sources?.duplicateCount ? (
            <button
              aria-expanded={duplicateReviewOpen}
              className={duplicateReviewOpen ? "research-duplicate-status is-active" : "research-duplicate-status"}
              onClick={() => {
                setDuplicateReviewOpen((current) => !current);
                setSubjectManagerOpen(false);
              }}
              title="Review the exact DOI matches that Horizon combined"
              type="button"
            >
              {sources.duplicateCount} exact duplicate{sources.duplicateCount === 1 ? "" : "s"} shown once
            </button>
          ) : null}
          {sources?.lastSyncedAt ? <span>Zotero checked {new Date(sources.lastSyncedAt).toLocaleDateString()}</span> : null}
          {hasActiveFilter ? <span className="research-desk-message">{filteredStatusMessage}</span> : message ? <span className="research-desk-message">{message}</span> : null}
        </div>
      </div>

      <div className="research-desk-toolbar">
        <div aria-label="Research view controls" className="research-toolbar-group">
          <span className="research-toolbar-group-label">View</span>
          {focusedStack ? (
            <button className="is-active" onClick={() => closeFocusedStack()} type="button">
              <ArrowLeft className="h-3.5 w-3.5" /> Desk view
            </button>
          ) : null}
          <button onClick={() => showAllPapers()} title="Clear every filter and show the complete library" type="button">
            <Layers3 className="h-3.5 w-3.5" /> Show all
          </button>
          <button onClick={() => { if (focusedStackKey) closeFocusedStack(false); fitDesk(); }} title="Fit the visible stacks inside the desk" type="button">
            <Compass className="h-3.5 w-3.5" /> Fit desk
          </button>
          <button onClick={() => { if (focusedStackKey) closeFocusedStack(false); organizeDesk(); }} title="Gather and restack the visible library" type="button">
            <RotateCcw className="h-3.5 w-3.5" /> Stack desk
          </button>
          <button
            aria-expanded={subjectManagerOpen}
            className={subjectManagerOpen ? "is-active" : ""}
            onClick={() => {
              setSubjectManagerOpen((current) => !current);
              setDuplicateReviewOpen(false);
            }}
            type="button"
          >
            <Tags className="h-3.5 w-3.5" /> Subjects
          </button>
        </div>

        <div aria-label="Research creation tools" className="research-toolbar-group">
          <span className="research-toolbar-group-label">Create</span>
          <button onClick={() => startDraftSticky({ x: 0.42, y: 0.55 })} title="Add a quick research sticky note" type="button">
            <StickyNote className="h-3.5 w-3.5" /> Sticky note
          </button>
          <button className="is-primary" onClick={() => addConnectedNote(selectedPaper)} type="button">
            <PenLine className="h-3.5 w-3.5" /> Rough note
          </button>
        </div>

        <div aria-label="Research sources" className="research-toolbar-group research-toolbar-sources">
          <span className="research-toolbar-group-label">Sources</span>
          <button disabled={syncing} onClick={() => void syncLibrary()} title="Refresh Zotero and complete exact DOI metadata" type="button">
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} /> Sync
          </button>
          <button disabled={shelving} onClick={() => void buildObsidianShelf()} title="Create one compact Obsidian view of Zotero records" type="button">
            <BookOpen className={`h-3.5 w-3.5 ${shelving ? "animate-spin" : ""}`} /> Obsidian shelf
          </button>
        </div>
      </div>
    </Panel>
  );
}
