import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Bookmark,
  Copy,
  ExternalLink,
  Layers3,
  Lightbulb,
  Link2,
  MapPin,
  Network,
  PenLine,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import { Panel } from "../ui/Panel";
import {
  InfiniteResearchCanvas,
  type InfiniteResearchSelection,
  type InfiniteResearchStickyDraft,
} from "./InfiniteResearchCanvas";

type ReadingStatus = "to_read" | "skimming" | "read" | "annotated";
type SortMode = "author" | "date" | "subject" | "reading" | "recent";

export type ResearchPaper = {
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
  documentAvailable: boolean;
  documentUrl: string;
  duplicateCopies: number;
  id: string;
  metadataComplete: boolean;
  metadataConflicts: string[];
  missingFields: string[];
  needsCitekey: boolean;
  path: string;
  primarySubject: string;
  previewUrl: string;
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

export type ResearchIdea = {
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

export type DeskSelection = { kind: "paper" | "idea"; path: string } | null;
export type PaperStack = { key: string; label: string; papers: ResearchPaper[] };
export type PaperConnection = { a: string; b: string };
const RESEARCH_DESK_SORT_KEY = "horizon.research-desk-sort.v1";
const RESEARCH_PAPER_CONNECTIONS_KEY = "horizon.research-paper-connections.v1";
const READING_STATUS_LABELS: Record<ReadingStatus, string> = {
  to_read: "To read",
  skimming: "Skimming",
  read: "Read",
  annotated: "Annotated",
};

function readableInsights(value: string) {
  return String(value || "")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

function paperLinkRef(paper: ResearchPaper) {
  return paperConnectionRef(paper) || `id:${paper.id}`;
}

function normalizedPaperLink(a: string, b: string): PaperConnection | null {
  if (!a || !b || a === b) return null;
  const [first, second] = [a, b].sort();
  return { a: first, b: second };
}

function paperLinkId(connection: PaperConnection) {
  return `${connection.a}::${connection.b}`;
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

function storedPaperConnections(): PaperConnection[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RESEARCH_PAPER_CONNECTIONS_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    const unique = new Map<string, PaperConnection>();
    for (const item of parsed) {
      const connection = normalizedPaperLink(String(item?.a || ""), String(item?.b || ""));
      if (connection) unique.set(paperLinkId(connection), connection);
    }
    return [...unique.values()];
  } catch {
    return [];
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
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("All subjects");
  const [statusFilter, setStatusFilter] = useState("All stages");
  const [metadataFocus, setMetadataFocus] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>(() => storedSortMode());
  const [paperConnections, setPaperConnections] = useState<PaperConnection[]>(() => storedPaperConnections());
  const [selection, setSelection] = useState<DeskSelection>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [heldIdeaPath, setHeldIdeaPath] = useState("");
  const [editingIdea, setEditingIdea] = useState<{ path: string; text: string } | null>(null);
  const [savingIdea, setSavingIdea] = useState(false);
  const [connectionSavingIdeaPath, setConnectionSavingIdeaPath] = useState("");
  const [pendingDeleteIdea, setPendingDeleteIdea] = useState<ResearchIdea | null>(null);
  const [deletingIdea, setDeletingIdea] = useState(false);
  const [shelving, setShelving] = useState(false);
  const [duplicateReviewOpen, setDuplicateReviewOpen] = useState(false);
  const [subjectManagerOpen, setSubjectManagerOpen] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [subjectSaving, setSubjectSaving] = useState(false);
  const readingSheetRef = useRef<HTMLElement>(null);
  const ideasRef = useRef<ResearchIdea[]>([]);
  const connectionSavingRef = useRef(new Set<string>());

  useEffect(() => {
    ideasRef.current = ideas;
  }, [ideas]);

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
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMessage("The research library could not be loaded.");
      })
      .finally(() => setLoading(false));
    return () => {
      controller.abort();
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

  const deskStacks = useMemo(
    () => buildPaperStacks(papers, sortMode),
    [papers, sortMode],
  );
  const boardStacks = useMemo(
    () => buildPaperStacks(papers, "subject"),
    [papers],
  );

  const selectedPaper = selection?.kind === "paper" ? papers.find((paper) => paper.id === selection.path) || null : null;
  const selectedIdea = selection?.kind === "idea" ? ideas.find((idea) => idea.path === selection.path) || null : null;
  const heldIdea = ideas.find((idea) => idea.path === heldIdeaPath) || null;
  const heldIdeaConnectionSaving = Boolean(heldIdea && connectionSavingIdeaPath === heldIdea.path);
  const heldIdeaAttachedToSelectedPaper = Boolean(heldIdea && selectedPaper
    && (heldIdea.connectedPaperRefs || []).some((ref) => paperMatchesConnectionRef(selectedPaper, ref)));
  const selectedIdeaPapers = selectedIdea ? connectedPapersForIdea(selectedIdea, papers) : [];
  const missingMetadataCount = papers.filter((paper) => !paper.metadataComplete).length;
  const hasActiveFilter = Boolean(query.trim() || subject !== "All subjects" || statusFilter !== "All stages" || metadataFocus);
  const filteredStatusMessage = visiblePapers.length
    ? `Showing ${visiblePapers.length} matching ${visiblePapers.length === 1 ? "paper" : "papers"}.`
    : "No papers match the active filters. Your sticky notes are still on the desk.";
  const selectedDeskStack = selectedPaper ? deskStacks.find((stack) => stack.papers.some((paper) => paper.id === selectedPaper.id)) || null : null;
  const selectedContextPapers = selectedPaper
    ? (selectedDeskStack?.papers || papers.filter((paper) => paper.primarySubject === selectedPaper.primarySubject))
    : [];
  const selectedContextPosition = selectedPaper ? selectedContextPapers.findIndex((paper) => paper.id === selectedPaper.id) + 1 : 0;
  const selectedContextLabel = selectedDeskStack?.label || selectedPaper?.primarySubject || "";

  useLayoutEffect(() => {
    if (readingSheetRef.current) readingSheetRef.current.scrollTop = 0;
  }, [selection?.kind, selection?.path]);

  useEffect(() => {
    if (loading) return;
    setSelection((current) => {
      if (!current) return null;
      if (current.kind === "paper" && papers.some((paper) => paper.id === current.path)) return current;
      if (current.kind === "idea" && ideas.some((idea) => idea.path === current.path)) return current;
      return null;
    });
  }, [ideas, loading, papers]);

  useEffect(() => {
    if (!isActive) return;
    const closeTopSurface = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      let handled = true;
      if (pendingDeleteIdea) {
        setPendingDeleteIdea(null);
      } else if (editingIdea) {
        setEditingIdea(null);
      } else if (duplicateReviewOpen) {
        setDuplicateReviewOpen(false);
      } else if (subjectManagerOpen) {
        setSubjectManagerOpen(false);
      } else if (inspectorOpen) {
        setInspectorOpen(false);
      } else {
        handled = false;
      }
      if (!handled) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener("keydown", closeTopSurface, true);
    return () => window.removeEventListener("keydown", closeTopSurface, true);
  }, [duplicateReviewOpen, editingIdea, inspectorOpen, isActive, pendingDeleteIdea, subjectManagerOpen]);

  function persistPaperConnections(next: PaperConnection[]) {
    try { localStorage.setItem(RESEARCH_PAPER_CONNECTIONS_KEY, JSON.stringify(next)); } catch { /* local storage is optional */ }
  }

  function togglePaperConnection(sourcePaper: ResearchPaper, targetPaper: ResearchPaper): "connected" | "disconnected" | undefined {
    const connection = normalizedPaperLink(paperLinkRef(sourcePaper), paperLinkRef(targetPaper));
    if (!connection) return;
    const id = paperLinkId(connection);
    const exists = paperConnections.some((item) => paperLinkId(item) === id);
    const next = exists ? paperConnections.filter((item) => paperLinkId(item) !== id) : [...paperConnections, connection];
    persistPaperConnections(next);
    setPaperConnections(next);
    setMessage(exists
      ? `Disconnected ${sourcePaper.title} from ${targetPaper.title}.`
      : `Connected ${sourcePaper.title} to ${targetPaper.title}.`);
    return exists ? "disconnected" : "connected";
  }

  function showAllPapers(nextMessage = "Showing all papers.") {
    setQuery("");
    setSubject("All subjects");
    setStatusFilter("All stages");
    setMetadataFocus(false);
    setMessage(nextMessage);
  }

  function toggleMetadataFocus() {
    const next = !metadataFocus;
    setMetadataFocus(next);
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

  function startEditingIdea(idea: ResearchIdea) {
    setPendingDeleteIdea(null);
    setSelection({ kind: "idea", path: idea.path });
    setHeldIdeaPath(idea.path);
    setEditingIdea({ path: idea.path, text: idea.body || idea.preview || idea.topic });
  }

  async function createCanvasSticky(draft: InfiniteResearchStickyDraft) {
    const body = draft.text.trim();
    if (!body) return null;
    const response = await fetch("/api/research/ideas", {
      body: JSON.stringify({ body }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const data = await response.json();
    if (!response.ok || !data?.idea) throw new Error(data?.message || "Sticky save failed");
    const idea = data.idea as ResearchIdea;
    ideasRef.current = [idea, ...ideasRef.current.filter((item) => item.path !== idea.path)];
    setIdeas(ideasRef.current);
    setSelection({ kind: "idea", path: idea.path });
    setHeldIdeaPath(idea.path);
    setMessage(data.message || "Sticky note saved to Research Ideas.");
    return idea;
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
    const nextIdeas = ideasRef.current.map((item) => item.path === nextIdea.path ? nextIdea : item);
    ideasRef.current = nextIdeas;
    setIdeas(nextIdeas);
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
    if (connectionSavingRef.current.has(idea.path)) {
      const message = "Finish the current sticky connection before adding another paper.";
      setMessage(message);
      throw new Error(message);
    }
    const ref = paperConnectionRef(paper);
    if (!ref) {
      const message = "That paper does not have a stable library reference yet.";
      setMessage(message);
      throw new Error(message);
    }
    const currentIdea = ideasRef.current.find((item) => item.path === idea.path) || idea;
    if ((currentIdea.connectedPaperRefs || []).some((item) => paperMatchesConnectionRef(paper, item))) {
      const message = `This sticky is already attached to ${paper.title}.`;
      setMessage(message);
      throw new Error(message);
    }
    connectionSavingRef.current.add(idea.path);
    setConnectionSavingIdeaPath(idea.path);
    try {
      const result = await patchIdea(currentIdea, { connectedPaperRefs: [...(currentIdea.connectedPaperRefs || []), ref] });
      setMessage(`Sticky attached to ${paper.title}. ${result.idea.connectedPaperRefs.length} connected ${result.idea.connectedPaperRefs.length === 1 ? "paper" : "papers"}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "That paper connection could not be saved.";
      setMessage(message);
      throw error instanceof Error ? error : new Error(message);
    } finally {
      connectionSavingRef.current.delete(idea.path);
      setConnectionSavingIdeaPath((current) => current === idea.path ? "" : current);
    }
  }

  async function detachIdeaFromPaper(idea: ResearchIdea, paper: ResearchPaper) {
    if (connectionSavingRef.current.has(idea.path)) {
      setMessage("Finish the current sticky connection before removing another paper.");
      return;
    }
    const currentIdea = ideasRef.current.find((item) => item.path === idea.path) || idea;
    const nextRefs = (currentIdea.connectedPaperRefs || []).filter((ref) => !paperMatchesConnectionRef(paper, ref));
    connectionSavingRef.current.add(idea.path);
    setConnectionSavingIdeaPath(idea.path);
    try {
      await patchIdea(currentIdea, { connectedPaperRefs: nextRefs });
      setMessage(`Sticky detached from ${paper.title}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That paper connection could not be removed.");
    } finally {
      connectionSavingRef.current.delete(idea.path);
      setConnectionSavingIdeaPath((current) => current === idea.path ? "" : current);
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
      const nextIdeas = ideasRef.current.filter((item) => item.path !== idea.path);
      ideasRef.current = nextIdeas;
      setIdeas(nextIdeas);
      setSelection((current) => current?.kind === "idea" && current.path === idea.path ? null : current);
      setHeldIdeaPath((current) => current === idea.path ? "" : current);
      setEditingIdea((current) => current?.path === idea.path ? null : current);
      setPendingDeleteIdea(null);
      setMessage(data.message || "Sticky note deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That sticky note could not be deleted.");
    } finally {
      setDeletingIdea(false);
    }
  }

  function changeSort(nextMode: SortMode) {
    setSortMode(nextMode);
    try { localStorage.setItem(RESEARCH_DESK_SORT_KEY, nextMode); } catch { /* local storage is optional */ }
    setMessage(`Explore arranged by ${nextMode === "reading" ? "reading stage" : nextMode === "recent" ? "recently added" : nextMode}. Your Board stayed unchanged.`);
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

  function selectPaper(paper: ResearchPaper) {
    setSelection({ kind: "paper", path: paper.id });
  }

  function selectIdea(idea: ResearchIdea) {
    setSelection({ kind: "idea", path: idea.path });
    setHeldIdeaPath(idea.path);
  }

  function handleCanvasSelection(next: InfiniteResearchSelection) {
    setSelection(next as DeskSelection);
    if (next?.kind === "idea") setHeldIdeaPath(next.path);
  }

  function openPaperDetails(paper: ResearchPaper) {
    selectPaper(paper);
    setInspectorOpen(true);
  }

  function openIdeaDetails(idea: ResearchIdea) {
    selectIdea(idea);
    setInspectorOpen(true);
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
                  ? `${visiblePapers.length} ${visiblePapers.length === 1 ? "match" : "matches"} · Board stays in place`
                  : `${sources.mergedCount} papers · persistent Board + temporary Explore`
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

      <div className="research-desk-canvas research-desk-shell">
        <InfiniteResearchCanvas
          ariaLabel="Infinite Research. Use Board for persistent spatial work, Explore for animated sorting and filtering, and double-click a paper to read it."
          boardStacks={boardStacks}
          exploreLabel={`Arranged by ${sortMode === "reading" ? "reading stage" : sortMode === "recent" ? "recently added" : sortMode}`}
          exploreStacks={deskStacks}
          ideas={ideas}
          loading={loading}
          matchingPaperIds={hasActiveFilter ? visiblePapers.map((paper) => paper.id) : undefined}
          onActionError={(nextMessage) => setMessage(nextMessage)}
          onAttachIdeaToPaper={attachIdeaToPaper}
          onConnectPapers={togglePaperConnection}
          onCreateSticky={createCanvasSticky}
          onDetachIdeaFromPaper={detachIdeaFromPaper}
          onOpenIdeaDetails={openIdeaDetails}
          onOpenPaperDetails={openPaperDetails}
          onSelectionChange={handleCanvasSelection}
          paperConnections={paperConnections}
          selection={selection}
        />

        {inspectorOpen ? <aside className={`research-reading-sheet research-reading-sheet-overlay ${selectedIdea ? "research-reading-sheet-idea" : ""}`} ref={readingSheetRef}>
          <button aria-label="Close research details" className="research-reading-sheet-close" onClick={() => setInspectorOpen(false)} type="button"><X className="h-4 w-4" /></button>
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
                {heldIdea ? (
                  <button
                    className="research-attach-held-sticky"
                    disabled={heldIdeaAttachedToSelectedPaper || heldIdeaConnectionSaving}
                    onClick={() => void attachIdeaToPaper(heldIdea, selectedPaper).catch(() => undefined)}
                    title={heldIdeaConnectionSaving ? `Saving ${heldIdea.topic}` : heldIdeaAttachedToSelectedPaper ? `${heldIdea.topic} is already attached to this paper` : `Attach ${heldIdea.topic} to this paper`}
                    type="button"
                  >
                    <Lightbulb className="h-4 w-4" /> {heldIdeaConnectionSaving ? "Attaching..." : heldIdeaAttachedToSelectedPaper ? "Sticky attached" : "Attach held sticky"}
                  </button>
                ) : null}
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
                          disabled={connectionSavingIdeaPath === selectedIdea.path}
                          onClick={() => void detachIdeaFromPaper(selectedIdea, paper)}
                          title={connectionSavingIdeaPath === selectedIdea.path ? "Saving the current paper connection" : "Detach this paper"}
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
        </aside> : null}

        {editingIdea && selectedIdea?.path === editingIdea.path ? (
          <form
            aria-label={`Edit sticky note ${selectedIdea.topic}`}
            className="research-sticky-editor research-sticky-editor-overlay"
            onSubmit={(event) => {
              event.preventDefault();
              void saveIdeaChanges(selectedIdea);
            }}
          >
            <div className="research-sticky-editor-title"><PenLine className="h-3.5 w-3.5" /> Edit sticky</div>
            <textarea
              aria-label="Sticky note text"
              autoFocus
              disabled={savingIdea}
              onChange={(event) => setEditingIdea({ path: selectedIdea.path, text: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  void saveIdeaChanges(selectedIdea);
                }
              }}
              value={editingIdea.text}
            />
            <div className="research-sticky-editor-actions">
              <button disabled={savingIdea} onClick={() => setEditingIdea(null)} type="button">Cancel</button>
              <button disabled={savingIdea || !editingIdea.text.trim()} type="submit">{savingIdea ? "Saving..." : "Save"}</button>
            </div>
          </form>
        ) : null}

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

        <div className="research-desk-status">
          <MapPin className="h-3.5 w-3.5" />
          <span>{papers.length} {papers.length === 1 ? "paper" : "papers"} · {ideas.length} {ideas.length === 1 ? "idea" : "ideas"}</span>
          {paperConnections.length ? <span>{paperConnections.length} paper link{paperConnections.length === 1 ? "" : "s"}</span> : null}
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
          {heldIdea ? (
            <span className="research-held-sticky-status" title={`Keep ${heldIdea.topic} available while finding papers`}>
              <Lightbulb className="h-3 w-3" />
              <button onClick={() => selectIdea(heldIdea)} type="button">Linking: {heldIdea.topic}</button>
              <button aria-label={`Stop linking ${heldIdea.topic}`} onClick={() => setHeldIdeaPath("")} type="button"><X className="h-3 w-3" /></button>
            </span>
          ) : null}
          {sources?.lastSyncedAt ? <span>Zotero checked {new Date(sources.lastSyncedAt).toLocaleDateString()}</span> : null}
          {hasActiveFilter ? <span className="research-desk-message">{filteredStatusMessage}</span> : null}
          {message ? <span className="research-desk-message research-operation-message">{message}</span> : null}
        </div>
      </div>

      <div className="research-desk-toolbar">
        <div aria-label="Research view controls" className="research-toolbar-group">
          <span className="research-toolbar-group-label">View</span>
          <button onClick={() => showAllPapers()} title="Clear every filter and show the complete library" type="button">
            <Layers3 className="h-3.5 w-3.5" /> Show all
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
