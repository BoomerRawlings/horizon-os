import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Bookmark,
  Copy,
  ExternalLink,
  FileText,
  Layers3,
  Lightbulb,
  Link2,
  MapPin,
  Network,
  PenLine,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
} from "lucide-react";
import { Panel } from "../ui/Panel";

type ReadingStatus = "to_read" | "skimming" | "read" | "annotated";
type SortMode = "manual" | "author" | "date" | "subject" | "reading";

type ResearchPaper = {
  abstract: string;
  abstractLabel: "Abstract" | "Summary";
  apaCitation: string;
  authorLabel: string;
  authors: string[];
  citation: string;
  citekey: string;
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
  created: string;
  id: string;
  path: string;
  preview: string;
  status: string;
  topic: string;
};

type ResearchSources = {
  duplicateCount: number;
  lastSyncedAt: string | null;
  mergedCount: number;
  status: string;
  vaultCount: number;
  zoteroCount: number;
};

type ResearchWorkspaceProps = {
  onClose: () => void;
  onOpenWorkbench: (prefill: string) => void;
};

type DeskPosition = { x: number; y: number; rotation: number; z: number };
type DeskLayout = Record<string, DeskPosition>;
type DeskSelection = { kind: "paper" | "idea"; path: string } | null;
type StackLabel = { count: number; key: string; label: string; x: number; y: number };

type DragState = {
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

function paperDeskKey(paper: Pick<ResearchPaper, "id">) {
  return `paper:${paper.id}`;
}

function ideaDeskKey(path: string) {
  return `idea:${path}`;
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
  return next.sort((a, b) => a.primarySubject.localeCompare(b.primarySubject) || a.authorLabel.localeCompare(b.authorLabel));
}

function buildStackedLayout(papers: ResearchPaper[], ideas: ResearchIdea[], mode: SortMode) {
  const grouped = new Map<string, ResearchPaper[]>();
  for (const paper of sortedPapers(papers, mode === "manual" ? "subject" : mode)) {
    const bucket = stackBucket(paper, mode === "manual" ? "subject" : mode);
    grouped.set(bucket, [...(grouped.get(bucket) || []), paper]);
  }

  let entries = [...grouped.entries()];
  if (entries.length > 12) {
    entries = entries.sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    const overflow = entries.slice(11).flatMap(([, items]) => items);
    entries = [...entries.slice(0, 11), ["Other subjects", overflow]];
  }

  const layout: DeskLayout = {};
  const labels: StackLabel[] = [];
  entries.forEach(([label, items], groupIndex) => {
    const column = groupIndex % 4;
    const row = Math.floor(groupIndex / 4);
    const baseX = 0.1 + column * 0.155;
    const baseY = 0.22 + row * 0.285;
    labels.push({ count: items.length, key: label, label, x: baseX, y: baseY - 0.115 });
    items.forEach((paper, layer) => {
      const visibleLayer = Math.min(layer, 13);
      layout[paperDeskKey(paper)] = {
        x: clamp(baseX + visibleLayer * 0.0045, 0.07, 0.61),
        y: clamp(baseY + visibleLayer * 0.005, 0.15, 0.85),
        rotation: ((layer % 5) - 2) * 0.65,
        z: groupIndex * 100 + layer + 1,
      };
    });
  });

  ideas.forEach((idea, index) => {
    layout[ideaDeskKey(idea.path)] = {
      x: 0.56 + (index % 2) * 0.035,
      y: clamp(0.74 + Math.floor(index / 2) * 0.04, 0.7, 0.88),
      rotation: [-2.5, 3.5, 1.2, -3.2][index % 4],
      z: 1400 + index,
    };
  });
  return { labels, layout };
}

function storedDeskLayout() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RESEARCH_DESK_LAYOUT_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed as DeskLayout : {};
  } catch {
    return {};
  }
}

function storedSortMode(): SortMode {
  const stored = localStorage.getItem(RESEARCH_DESK_SORT_KEY) as SortMode | null;
  return ["manual", "author", "date", "subject", "reading"].includes(stored || "") ? stored! : "subject";
}

export function ResearchWorkspace({ onClose, onOpenWorkbench }: ResearchWorkspaceProps) {
  const [papers, setPapers] = useState<ResearchPaper[]>([]);
  const [ideas, setIdeas] = useState<ResearchIdea[]>([]);
  const [sources, setSources] = useState<ResearchSources | null>(null);
  const [layout, setLayout] = useState<DeskLayout>({});
  const [stackLabels, setStackLabels] = useState<StackLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("All subjects");
  const [statusFilter, setStatusFilter] = useState("All stages");
  const [sortMode, setSortMode] = useState<SortMode>(() => storedSortMode());
  const [organizing, setOrganizing] = useState<"" | "gathering" | "settling">("");
  const [selection, setSelection] = useState<DeskSelection>(null);
  const [draggingKey, setDraggingKey] = useState("");
  const deskRef = useRef<HTMLDivElement>(null);
  const readingSheetRef = useRef<HTMLElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const organizeTimers = useRef<number[]>([]);

  function clearOrganizeTimers() {
    organizeTimers.current.forEach((timer) => window.clearTimeout(timer));
    organizeTimers.current = [];
  }

  function placeLibrary(nextPapers: ResearchPaper[], nextIdeas: ResearchIdea[], mode: SortMode, useStoredManual = false) {
    const organized = buildStackedLayout(nextPapers, nextIdeas, mode);
    setLayout(useStoredManual && mode === "manual" ? { ...organized.layout, ...storedDeskLayout() } : organized.layout);
    setStackLabels(mode === "manual" ? [] : organized.labels);
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
        placeLibrary(nextPapers, nextIdeas, sortMode, true);
        setSelection((current) => current || (nextPapers[0] ? { kind: "paper", path: nextPapers[0].id } : nextIdeas[0] ? { kind: "idea", path: nextIdeas[0].path } : null));
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

  const subjects = useMemo(
    () => ["All subjects", ...Array.from(new Set(papers.map((paper) => paper.primarySubject).filter(Boolean))).sort((a, b) => a.localeCompare(b))],
    [papers],
  );

  const visiblePapers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return papers.filter((paper) => {
      if (subject !== "All subjects" && paper.primarySubject !== subject) return false;
      if (statusFilter !== "All stages" && paper.readingStatus !== statusFilter) return false;
      if (!needle) return true;
      return [paper.title, paper.authorLabel, paper.authors.join(" "), paper.citation, paper.abstract, paper.doi, paper.datePublished, paper.primarySubject, sourceLabel(paper.source)]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [papers, query, statusFilter, subject]);

  const visibleIdeas = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return ideas.filter((idea) => !needle || [idea.topic, idea.preview].join(" ").toLowerCase().includes(needle));
  }, [ideas, query]);

  const visibleFallbackLayout = useMemo(
    () => buildStackedLayout(visiblePapers, [], sortMode).layout,
    [sortMode, visiblePapers],
  );

  const selectedPaper = selection?.kind === "paper" ? papers.find((paper) => paper.id === selection.path) || null : null;
  const selectedIdea = selection?.kind === "idea" ? ideas.find((idea) => idea.path === selection.path) || null : null;
  const missingMetadataCount = papers.filter((paper) => !paper.metadataComplete).length;
  const hasActiveFilter = Boolean(query.trim() || subject !== "All subjects" || statusFilter !== "All stages");

  useLayoutEffect(() => {
    if (readingSheetRef.current) readingSheetRef.current.scrollTop = 0;
  }, [selection?.kind, selection?.path]);

  function persistLayout(next: DeskLayout) {
    try { localStorage.setItem(RESEARCH_DESK_LAYOUT_KEY, JSON.stringify(next)); } catch { /* local storage is optional */ }
  }

  function organizeDesk(nextMode = sortMode) {
    clearOrganizeTimers();
    const gathered: DeskLayout = {};
    papers.forEach((paper, index) => {
      gathered[paperDeskKey(paper)] = { x: 0.34 + (index % 4) * 0.002, y: 0.48 + (index % 5) * 0.002, rotation: (index % 5) - 2, z: index + 1 };
    });
    ideas.forEach((idea, index) => {
      gathered[ideaDeskKey(idea.path)] = { x: 0.5, y: 0.64, rotation: index % 2 ? 2 : -2, z: 1200 + index };
    });
    setOrganizing("gathering");
    setStackLabels([]);
    setLayout(gathered);
    setMessage("Gathering the papers...");

    organizeTimers.current.push(window.setTimeout(() => {
      const organized = buildStackedLayout(papers, ideas, nextMode);
      setOrganizing("settling");
      setLayout(organized.layout);
      setStackLabels(nextMode === "manual" ? [] : organized.labels);
      if (nextMode === "manual") persistLayout(organized.layout);
      setMessage(nextMode === "manual" ? "The desk is ready for you to arrange." : `Sorted by ${nextMode === "reading" ? "reading stage" : nextMode}.`);
    }, 360));
    organizeTimers.current.push(window.setTimeout(() => setOrganizing(""), 1350));
  }

  function changeSort(nextMode: SortMode) {
    setSortMode(nextMode);
    localStorage.setItem(RESEARCH_DESK_SORT_KEY, nextMode);
    organizeDesk(nextMode);
  }

  function bringForward(key: string) {
    setLayout((current) => {
      const top = Math.max(0, ...Object.values(current).map((item) => item.z || 0)) + 1;
      const next = { ...current, [key]: { ...(current[key] || { x: 0.3, y: 0.3, rotation: 0, z: top }), z: top } };
      if (sortMode === "manual") persistLayout(next);
      return next;
    });
  }

  function beginDrag(event: ReactPointerEvent<HTMLElement>, key: string) {
    if (event.button !== 0 || !deskRef.current) return;
    const position = layout[key];
    if (!position) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const now = performance.now();
    dragRef.current = {
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
    bringForward(key);
  }

  function moveDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    const desk = deskRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !desk) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.moved && distance < 5) return;
    if (!drag.moved) {
      drag.moved = true;
      if (sortMode !== "manual") {
        setSortMode("manual");
        localStorage.setItem(RESEARCH_DESK_SORT_KEY, "manual");
        setStackLabels([]);
        setMessage("Manual arrangement is on. Use a sort option whenever you want the desk restacked.");
      }
    }
    const rect = desk.getBoundingClientRect();
    const now = performance.now();
    const elapsed = Math.max(8, now - drag.lastAt);
    drag.velocityX = (event.clientX - drag.lastX) / elapsed;
    drag.velocityY = (event.clientY - drag.lastY) / elapsed;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.lastAt = now;
    const x = clamp(drag.origin.x + (event.clientX - drag.startX) / rect.width, 0.05, 0.94);
    const y = clamp(drag.origin.y + (event.clientY - drag.startY) / rect.height, 0.09, 0.91);
    setLayout((current) => ({ ...current, [drag.key]: { ...current[drag.key], x, y } }));
  }

  function endDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    const desk = deskRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !desk) return;
    const rect = desk.getBoundingClientRect();
    setLayout((current) => {
      const currentPosition = current[drag.key] || drag.origin;
      const next = {
        ...current,
        [drag.key]: {
          ...currentPosition,
          x: clamp(currentPosition.x + (drag.velocityX * 72) / rect.width, 0.05, 0.94),
          y: clamp(currentPosition.y + (drag.velocityY * 72) / rect.height, 0.09, 0.91),
          rotation: clamp(currentPosition.rotation + drag.velocityX * 0.5, -6, 6),
        },
      };
      persistLayout(next);
      return next;
    });
    dragRef.current = null;
    setDraggingKey("");
  }

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
      placeLibrary(data.papers, ideas, sortMode, sortMode === "manual");
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

  function selectPaper(paper: ResearchPaper) {
    const key = paperDeskKey(paper);
    setSelection({ kind: "paper", path: paper.id });
    bringForward(key);
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
              {sources ? `${sources.mergedCount} papers across your vault and Zotero` : "Your papers, reading stages, and connected notes in one place"}
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
            <span className="sr-only">Sort papers</span>
            <select aria-label="Sort papers" onChange={(event) => changeSort(event.target.value as SortMode)} value={sortMode}>
              <option value="manual">Manual desk</option>
              <option value="author">Sort: Author</option>
              <option value="date">Sort: Date</option>
              <option value="subject">Sort: Subject</option>
              <option value="reading">Sort: Reading stage</option>
            </select>
          </label>
          <button className="research-desk-tool" onClick={() => organizeDesk()} title="Gather and restack the visible library" type="button">
            <RotateCcw className="h-4 w-4" />
            Stack desk
          </button>
          <button className="research-desk-tool" disabled={syncing} onClick={() => void syncLibrary()} title="Refresh Zotero and complete exact DOI metadata" type="button">
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            Sync
          </button>
          <button className="research-desk-tool research-desk-tool-primary" onClick={() => addConnectedNote(selectedPaper)} type="button">
            <PenLine className="h-4 w-4" />
            Rough note
          </button>
        </div>
      </header>

      <div className={`research-desk-canvas research-desk-${organizing || "resting"}`} ref={deskRef}>
        <div className="research-desk-grain" aria-hidden="true" />
        <div className="research-location-tab research-location-tab-papers">
          <FileText className="h-3.5 w-3.5" />
          <span><strong>Papers</strong> · Vault {sources?.vaultCount ?? papers.filter((paper) => paper.path).length} · Zotero {sources?.zoteroCount ?? papers.filter((paper) => paper.zoteroKey).length}</span>
          <small>{visiblePapers.length} shown</small>
        </div>
        <div className="research-location-tab research-location-tab-ideas">
          <Lightbulb className="h-3.5 w-3.5" />
          <span><strong>Ideas</strong> · Research Papers/Ideas/</span>
          <small>{visibleIdeas.length} on desk</small>
        </div>

        {loading ? <div className="research-desk-loading">Setting out the research desk...</div> : null}
        {organizing === "gathering" ? <div className="research-gathering-note"><Layers3 className="h-4 w-4" /> Gathering papers</div> : null}

        {!hasActiveFilter && organizing !== "gathering" ? stackLabels.map((stack) => (
          <div
            className="research-stack-label"
            key={stack.key}
            style={{ "--desk-x": `${stack.x * 100}%`, "--desk-y": `${stack.y * 100}%` } as CSSProperties}
          >
            <span>{stack.label}</span>
            <small>{stack.count}</small>
          </div>
        )) : null}

        {visiblePapers.map((paper, index) => {
          const key = paperDeskKey(paper);
          const fallback = visibleFallbackLayout[key] || { x: 0.2, y: 0.3, rotation: 0, z: index + 1 };
          const position = layout[key] || fallback;
          const style = {
            "--desk-delay": `${Math.min(index * 11, 330)}ms`,
            "--desk-x": `${position.x * 100}%`,
            "--desk-y": `${position.y * 100}%`,
            "--desk-rotation": `${position.rotation}deg`,
            "--subject-hue": subjectHue(paper.primarySubject),
            zIndex: position.z,
          } as CSSProperties;
          return (
            <article
              aria-label={`${paper.title}, ${paper.authorLabel}, ${paper.year}`}
              className={`research-paper-card ${paper.metadataComplete ? "research-paper-card-complete" : "research-paper-card-incomplete"} ${paper.dogEared ? "research-paper-card-dog-eared" : ""} ${selection?.kind === "paper" && selection.path === paper.id ? "research-desk-item-selected" : ""} ${draggingKey === key ? "research-desk-item-dragging" : ""}`}
              key={paper.id}
              onClick={() => selectPaper(paper)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  selectPaper(paper);
                }
              }}
              onPointerCancel={endDrag}
              onPointerDown={(event) => {
                setSelection({ kind: "paper", path: paper.id });
                beginDrag(event, key);
              }}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              role="button"
              style={style}
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
          );
        })}

        {visibleIdeas.map((idea, index) => {
          const key = ideaDeskKey(idea.path);
          const position = layout[key] || { x: 0.55, y: 0.78, rotation: index % 2 ? 2 : -2, z: 1400 + index };
          const style = {
            "--desk-delay": `${Math.min(index * 16, 250)}ms`,
            "--desk-x": `${position.x * 100}%`,
            "--desk-y": `${position.y * 100}%`,
            "--desk-rotation": `${position.rotation}deg`,
            zIndex: position.z,
          } as CSSProperties;
          return (
            <button
              aria-label={`Research idea ${idea.topic}`}
              className={`research-sticky-note ${selection?.kind === "idea" && selection.path === idea.path ? "research-desk-item-selected" : ""} ${draggingKey === key ? "research-desk-item-dragging" : ""}`}
              key={idea.path}
              onClick={() => selectIdea(idea)}
              onPointerCancel={endDrag}
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
            </button>
          );
        })}

        {!loading && !visiblePapers.length && !visibleIdeas.length ? (
          <div className="research-desk-empty">Nothing on the desk matches these filters.</div>
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
              <h3>{selectedPaper.title}</h3>
              <p className="research-reading-byline">{selectedPaper.authors.join("; ") || selectedPaper.authorLabel} · {selectedPaper.year || "n.d."}</p>

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
                <div><dt>Stored in</dt><dd>{selectedPaper.path || "Zotero library"}</dd></div>
              </dl>

              {selectedPaper.metadataConflicts?.length ? (
                <div className="research-metadata-warning research-metadata-conflict">
                  <AlertCircle className="h-4 w-4" />
                  <span>{selectedPaper.metadataConflicts.join(" ")} Horizon left your vault value unchanged.</span>
                </div>
              ) : !selectedPaper.metadataComplete ? (
                <div className="research-metadata-warning">
                  <AlertCircle className="h-4 w-4" />
                  <span>Needs {(selectedPaper.missingFields || []).join(", ")}. Horizon shows the gap instead of inventing it.</span>
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
                <button onClick={() => void copyApa(selectedPaper)} type="button"><Copy className="h-4 w-4" /> Copy APA</button>
                <button onClick={() => addConnectedNote(selectedPaper)} type="button"><Link2 className="h-4 w-4" /> Connected note</button>
                {selectedPaper.path ? <button onClick={() => void openVaultPaper(selectedPaper)} type="button"><ExternalLink className="h-4 w-4" /> Obsidian</button> : null}
                {selectedPaper.zoteroUrl ? <button onClick={() => openZoteroPaper(selectedPaper)} type="button"><ExternalLink className="h-4 w-4" /> Zotero</button> : null}
              </div>
            </>
          ) : selectedIdea ? (
            <>
              <div className="research-reading-sheet-topline"><span><Lightbulb className="h-3.5 w-3.5" /> Loose research idea</span><span>{selectedIdea.status}</span></div>
              <h3>{selectedIdea.topic}</h3>
              <p className="research-reading-citation">{selectedIdea.preview || "This idea does not have detail yet."}</p>
              <dl className="research-paper-metadata">
                <div><dt>Created</dt><dd>{selectedIdea.created || "unknown"}</dd></div>
                <div><dt>Stored in</dt><dd>{selectedIdea.path}</dd></div>
              </dl>
              <div className="research-idea-explanation">
                Ideas stay separate from citable papers until there is an actual source. That keeps the graph useful and prevents arbitrary paper-like records.
              </div>
              <div className="research-reading-actions">
                <button onClick={() => onOpenWorkbench(`Continue this research idea, connected to [[${selectedIdea.path.replace(/\.md$/i, "")}]]:\n\n${selectedIdea.topic}\n\n`)} type="button"><PenLine className="h-4 w-4" /> Continue in Workbench</button>
              </div>
            </>
          ) : (
            <div className="research-reading-empty"><Layers3 className="h-8 w-8" /><p>Choose a paper or sticky note to place it on the reading stand.</p></div>
          )}
        </aside>

        <div className="research-desk-status">
          <MapPin className="h-3.5 w-3.5" />
          <span>{papers.length} {papers.length === 1 ? "paper" : "papers"} · {ideas.length} {ideas.length === 1 ? "idea" : "ideas"}</span>
          <span>{missingMetadataCount ? `${missingMetadataCount} need details` : "Paper metadata complete"}</span>
          {sources?.duplicateCount ? <span>{sources.duplicateCount} exact duplicate{sources.duplicateCount === 1 ? "" : "s"} shown once</span> : null}
          {sources?.lastSyncedAt ? <span>Zotero checked {new Date(sources.lastSyncedAt).toLocaleDateString()}</span> : null}
          {message ? <span className="research-desk-message">{message}</span> : null}
        </div>
      </div>
    </Panel>
  );
}
