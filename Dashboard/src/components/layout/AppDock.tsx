import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Copy, ExternalLink, Lightbulb, Search, Sparkles, X } from "lucide-react";
import { Dropdown } from "../ui/Dropdown";
import { dockItems } from "../../data/dockItems";
import { MOTION_TIMING } from "../../data/motionSystem";
import { CAPABILITY_BADGE_LABEL, CAPABILITY_TONE, deriveCapabilityDisplay } from "../../data/integrationCapability";
import type { IntegrationConnection } from "../../types";
import { BrandMark } from "../ui/BrandMark";
import { normalizeVaultText } from "../../utils/markdownText";

const TONE_DOT_CLASS: Record<string, string> = {
  positive: "bg-emerald-400",
  neutral: "bg-sky-400",
  attention: "bg-amber-300",
  muted: "bg-slate-500",
};

type LauncherFeedback = {
  id: number;
  message: string;
  tone: "info" | "success" | "warning" | "error";
};

type LauncherResponse = {
  ok: boolean;
  state: "launching" | "focused" | "opened" | "internal_route" | "missing_app" | "missing_path" | "offline" | "disabled_placeholder" | "error";
  message: string;
  route?: string;
};

type ResearchPaper = {
  abstract: string;
  citation: string;
  citekey: string;
  needsCitekey: boolean;
  path: string;
  status: string;
  summary: string;
  year: string;
};

type ResearchIdea = {
  created: string;
  id: string;
  path: string;
  preview: string;
  status: string;
  topic: string;
};

export function AppDock({ integrations }: { integrations?: IntegrationConnection[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<LauncherFeedback | null>(null);
  const [launchingActionId, setLaunchingActionId] = useState<string | null>(null);
  const [researchPapersOpen, setResearchPapersOpen] = useState(false);
  const [researchPapersClosing, setResearchPapersClosing] = useState(false);
  const [researchPapers, setResearchPapers] = useState<ResearchPaper[]>([]);
  const [researchPapersLoading, setResearchPapersLoading] = useState(false);
  const [expandedPaper, setExpandedPaper] = useState<string | null>(null);
  const [copiedCitekey, setCopiedCitekey] = useState<string | null>(null);
  // PHASE-12: Research Ideas panel (sibling to Saved Papers).
  const [researchIdeasOpen, setResearchIdeasOpen] = useState(false);
  const [researchIdeasClosing, setResearchIdeasClosing] = useState(false);
  const [researchIdeas, setResearchIdeas] = useState<ResearchIdea[]>([]);
  const [researchIdeasLoading, setResearchIdeasLoading] = useState(false);
  const [ideaFilter, setIdeaFilter] = useState("");
  const dockRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!researchPapersOpen) return;
    let cancelled = false;
    setResearchPapersLoading(true);
    void fetch("/api/research/papers")
      .then((response) => (response.ok ? response.json() : { papers: [] }))
      .then((data: { papers?: ResearchPaper[] }) => {
        if (!cancelled) setResearchPapers(data.papers ?? []);
      })
      .catch(() => {
        if (!cancelled) setResearchPapers([]);
      })
      .finally(() => {
        if (!cancelled) setResearchPapersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [researchPapersOpen]);

  // PHASE-14: Escape closes the Saved Papers panel (with the same animated close).
  useEffect(() => {
    if (!researchPapersOpen) return undefined;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeSavedPapers();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [researchPapersOpen, researchPapersClosing]);

  // PHASE-12: Research Ideas panel — fetch on open, Escape to close.
  useEffect(() => {
    if (!researchIdeasOpen) return;
    let cancelled = false;
    setResearchIdeasLoading(true);
    void fetch("/api/research/ideas")
      .then((response) => (response.ok ? response.json() : { ideas: [] }))
      .then((data: { ideas?: ResearchIdea[] }) => {
        if (!cancelled) setResearchIdeas(data.ideas ?? []);
      })
      .catch(() => {
        if (!cancelled) setResearchIdeas([]);
      })
      .finally(() => {
        if (!cancelled) setResearchIdeasLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [researchIdeasOpen]);

  useEffect(() => {
    if (!researchIdeasOpen) return undefined;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeResearchIdeas();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [researchIdeasOpen, researchIdeasClosing]);

  function closeResearchIdeas() {
    if (researchIdeasClosing) return;
    setResearchIdeasClosing(true);
    window.setTimeout(() => {
      setResearchIdeasOpen(false);
      setResearchIdeasClosing(false);
      setIdeaFilter("");
    }, MOTION_TIMING.overlayExitMs);
  }

  // "Start researching": open Google Scholar prefilled with the idea's topic, and open the
  // idea note in Obsidian. Deep-links via the PHASE-12 launch searchParam extension.
  async function startResearching(idea: ResearchIdea) {
    showFeedback(`Searching Scholar for "${idea.topic}"...`, "info");
    try {
      await fetch("/api/launch", {
        body: JSON.stringify({ actionId: "research.google_scholar", query: idea.topic }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      await fetch("/api/files/open", {
        body: JSON.stringify({ kind: "file", path: idea.path, rootKey: "vault", sourceId: "obsidian" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
    } catch {
      // Best-effort — same tolerance as the other launcher actions.
    }
  }

  // PHASE-14: animate the panel out before unmounting (matches Project Spotlight's close).
  function closeSavedPapers() {
    if (researchPapersClosing) return;
    setResearchPapersClosing(true);
    window.setTimeout(() => {
      setResearchPapersOpen(false);
      setResearchPapersClosing(false);
      setExpandedPaper(null);
    }, MOTION_TIMING.overlayExitMs);
  }

  async function copyApaCitation(paper: ResearchPaper) {
    const citation = normalizeVaultText(paper.citation || paper.summary || paper.citekey);
    try {
      await navigator.clipboard.writeText(citation);
    } catch {
      // Clipboard blocked (rare in the Electron shell) — still flash confirmation; the
      // citation is visible on the card for manual copy.
    }
    setCopiedCitekey(paper.citekey);
    window.setTimeout(() => setCopiedCitekey((current) => (current === paper.citekey ? null : current)), 1600);
  }

  async function openResearchPaper(paper: ResearchPaper) {
    try {
      await fetch("/api/files/open", {
        body: JSON.stringify({ kind: "file", path: paper.path, rootKey: "vault", sourceId: "obsidian" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
    } catch {
      // Best-effort - the modal stays open either way, matching other launcher actions' tolerance.
    }
  }

  function showFeedback(message: string, tone: LauncherFeedback["tone"]) {
    setFeedback({
      id: Date.now(),
      message,
      tone,
    });
  }

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      const elementTarget = target instanceof Element ? target : null;
      if (!dockRef.current?.contains(target as Node) && !elementTarget?.closest("[data-dock-menu='true']")) {
        setOpenId(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenId(null);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!feedback) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setFeedback(null), 4400);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  function moveFocus(currentIndex: number, direction: -1 | 1) {
    const nextIndex = (currentIndex + direction + dockItems.length) % dockItems.length;
    buttonRefs.current[nextIndex]?.focus();
  }

  function feedbackTone(response: LauncherResponse): LauncherFeedback["tone"] {
    if (response.ok) return response.state === "internal_route" ? "info" : "success";
    if (response.state === "disabled_placeholder" || response.state === "missing_path" || response.state === "missing_app") return "warning";
    return "error";
  }

  async function runAction(actionId: string, label: string) {
    setOpenId(null);
    setLaunchingActionId(actionId);
    showFeedback(`Opening ${label}...`, "info");

    try {
      const response = await fetch("/api/launch", {
        body: JSON.stringify({ actionId }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const result = (await response.json()) as LauncherResponse;

      if (result.state === "internal_route" && result.route === "/research/papers") {
        setResearchPapersOpen(true);
      }
      if (result.state === "internal_route" && result.route === "/research/ideas") {
        setResearchIdeasOpen(true);
      }

      showFeedback(result.message, feedbackTone(result));
    } catch {
      showFeedback(`Could not open ${label}.`, "error");
    } finally {
      setLaunchingActionId(null);
    }
  }

  function activateDockItem(item: (typeof dockItems)[number]) {
    if (item.launchMode === "menu" || item.menu?.length) {
      setOpenId((current) => (current === item.id ? null : item.id));
      return;
    }

    if (item.actionId) {
      void runAction(item.actionId, item.label);
    }
  }

  return (
    <div className="relative mt-4 rounded-[24px] border border-white/10 bg-[#0d1928]/94 p-4 shadow-panel" ref={dockRef}>
      <div className="grid grid-cols-5 gap-3">
        {dockItems.map((item, index) => {
          const Icon = item.icon;
          const isOpen = openId === item.id;
          const isLaunching = launchingActionId === item.actionId;
          const hasMenu = item.launchMode === "menu" || Boolean(item.menu?.length);
          // Live status from /api/integrations wins; static dockItems values are fallback only.
          const connection = integrations?.find((candidate) => candidate.id === item.id);
          const capabilityDisplay = connection ? deriveCapabilityDisplay(connection) : null;
          const statusDotClass = capabilityDisplay
            ? TONE_DOT_CLASS[CAPABILITY_TONE[capabilityDisplay]]
            : item.status === "needs_setup"
              ? "bg-amber-300"
              : item.status === "disabled_placeholder"
                ? "bg-slate-500"
                : "bg-emerald-400";
          const statusText = isLaunching
            ? "Launching"
            : capabilityDisplay
              ? CAPABILITY_BADGE_LABEL[capabilityDisplay]
              : item.statusLabel ?? "Ready";
          return (
            <div key={item.id} className="relative">
              <button
                aria-expanded={hasMenu ? isOpen : undefined}
                className={`flex h-16 w-full items-center justify-center gap-4 rounded-2xl border px-4 text-base transition ${
                  isOpen
                    ? "border-[rgba(var(--accent-rgb),0.45)] bg-[rgba(var(--accent-rgb),0.12)] text-white"
                    : "border-white/8 bg-white/[0.035] text-slate-200 hover:border-[rgba(var(--accent-rgb),0.25)] hover:bg-[rgba(var(--accent-rgb),0.08)]"
                }`}
                onClick={() => activateDockItem(item)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setOpenId((current) => (current === item.id ? null : item.id));
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowRight") {
                    event.preventDefault();
                    moveFocus(index, 1);
                  }
                  if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    moveFocus(index, -1);
                  }
                }}
                ref={(node) => {
                  buttonRefs.current[index] = node;
                }}
                type="button"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center">
                  <BrandMark brand={item.brand} className="h-8 w-8" iconSrc={item.iconSrc} label={item.label} />
                  {Icon ? <Icon className="h-8 w-8 text-[rgb(var(--accent-rgb))]" strokeWidth={1.7} /> : null}
                </span>
                <span className="min-w-0 translate-y-[3px]">
                  <span className="flex items-center justify-center gap-2 leading-tight">
                    <span className="truncate">{item.label}</span>
                    {hasMenu ? <ChevronDown className={`h-4 w-4 transition ${isOpen ? "rotate-180" : ""}`} /> : null}
                  </span>
                  <span className="mt-0.5 flex items-center justify-center gap-1.5 text-[11px] leading-tight text-slate-500">
                    <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass}`} />
                    {statusText}
                  </span>
                </span>
              </button>
              {isOpen ? <Dropdown anchorElement={buttonRefs.current[index]} item={item} onAction={runAction} /> : null}
            </div>
          );
        })}
      </div>

      {feedback ? (
        <div
          key={feedback.id}
          className="dock-action-toast fixed bottom-0 left-1/2 z-[45] w-[min(620px,calc(100vw-360px))] -translate-x-1/2 border border-white/12 px-5 py-3 text-sm text-slate-100"
          data-tone={feedback.tone}
        >
          <span className="dock-action-toast-glow" aria-hidden="true" />
          <span className="relative z-10 flex items-center justify-center gap-3">
            <span className="dock-action-toast-dot" aria-hidden="true" />
            <span className="truncate">{feedback.message}</span>
          </span>
          <span className="dock-action-toast-timer" aria-hidden="true" />
        </div>
      ) : null}

      {researchPapersOpen ? (
        <div className="fixed inset-0 z-[60] grid place-items-center p-6">
          <button
            aria-label="Close saved papers"
            className={`saved-papers-scrim absolute inset-0 cursor-default bg-black/55 backdrop-blur-sm ${
              researchPapersClosing ? "saved-papers-scrim-closing" : ""
            }`}
            onClick={closeSavedPapers}
            type="button"
          />
          <section
            aria-label="Saved Papers"
            aria-modal="true"
            className={`saved-papers-panel relative flex max-h-[calc(100vh-96px)] w-[720px] max-w-[calc(100vw-48px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#081421] shadow-[0_28px_90px_rgba(0,0,0,0.55)] ${
              researchPapersClosing ? "saved-papers-panel-closing" : ""
            }`}
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/8 px-6 py-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold text-white">Saved Papers</h2>
                  <span className="rounded-full border border-white/12 bg-white/[0.045] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-300">
                    {researchPapers.length} filed
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  Notes in <code className="text-slate-300">Research Papers/</code>. Expand for the abstract,
                  copy an APA citation, or open the note in Obsidian.
                </p>
              </div>
              <button
                aria-label="Close saved papers"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.035] text-slate-300 transition hover:text-white"
                onClick={closeSavedPapers}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-6 py-4">
              {researchPapersLoading ? (
                <p className="rounded-lg border border-white/8 bg-white/[0.025] px-3 py-3 text-sm text-slate-400">Loading...</p>
              ) : null}
              {!researchPapersLoading && researchPapers.length === 0 ? (
                <p className="rounded-lg border border-white/8 bg-white/[0.025] px-3 py-3 text-sm text-slate-400">
                  No papers filed yet. Use "Save as Research" from Capture, or add notes to Research Papers/.
                </p>
              ) : null}
              {researchPapers.map((paper) => {
                const expanded = expandedPaper === paper.citekey;
                const copied = copiedCitekey === paper.citekey;
                const displayCitation = normalizeVaultText(paper.citation || paper.summary || paper.citekey);
                const displayAbstract = normalizeVaultText(paper.abstract);
                return (
                  <div className="rounded-xl border border-white/8 bg-white/[0.025]" key={paper.path}>
                    <button
                      aria-expanded={expanded}
                      className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left"
                      onClick={() => setExpandedPaper((current) => (current === paper.citekey ? null : paper.citekey))}
                      type="button"
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-white">{paper.citekey}</span>
                          <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.035] px-2 py-0.5 text-[10px] uppercase tracking-[0.06em] text-slate-400">
                            {paper.needsCitekey ? "needs citekey" : paper.status}
                          </span>
                        </span>
                        <span className="mt-1 block truncate text-xs text-slate-500">{displayCitation || "No citation available"}</span>
                      </span>
                      <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${expanded ? "rotate-180" : ""}`} />
                    </button>

                    {expanded ? (
                      <div className="border-t border-white/8 px-3.5 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Citation</div>
                        <p className="mt-1 text-sm leading-relaxed text-slate-200">{displayCitation || "No citation on file."}</p>
                        {displayAbstract ? (
                          <>
                            <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Abstract / insights</div>
                            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{displayAbstract}</p>
                          </>
                        ) : (
                          <p className="mt-3 text-xs text-slate-500">No abstract or insights recorded in this note.</p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            className="flex h-9 items-center gap-2 rounded-lg border border-[rgba(var(--accent-rgb),0.3)] bg-[rgba(var(--accent-rgb),0.12)] px-3 text-xs font-medium text-white transition hover:bg-[rgba(var(--accent-rgb),0.2)]"
                            onClick={() => void copyApaCitation(paper)}
                            type="button"
                          >
                            {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
                            {copied ? "Copied" : "Copy APA citation"}
                          </button>
                          <button
                            className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 text-xs text-slate-200 transition hover:border-sky-300/30 hover:text-sky-100"
                            onClick={() => void openResearchPaper(paper)}
                            type="button"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Open in Obsidian
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3 border-t border-white/8 px-6 py-4">
              <button
                className="h-10 rounded-lg border border-[rgba(var(--accent-rgb),0.32)] bg-[rgba(var(--accent-rgb),0.12)] px-4 text-sm text-white transition hover:bg-[rgba(var(--accent-rgb),0.2)]"
                onClick={() => void runAction("research.notes", "Research Notes")}
                type="button"
              >
                Open Research Notes
              </button>
              <button
                className="h-10 rounded-lg border border-white/10 bg-white/[0.035] px-4 text-sm text-slate-300 transition hover:bg-white/[0.06]"
                onClick={closeSavedPapers}
                type="button"
              >
                Close
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {/* PHASE-12: Research Ideas dashboard — topics/questions to explore later. */}
      {researchIdeasOpen ? (
        <div className="fixed inset-0 z-[60] grid place-items-center p-6">
          <button
            aria-label="Close research ideas"
            className={`saved-papers-scrim absolute inset-0 cursor-default bg-black/55 backdrop-blur-sm ${
              researchIdeasClosing ? "saved-papers-scrim-closing" : ""
            }`}
            onClick={closeResearchIdeas}
            type="button"
          />
          <section
            aria-label="Research Ideas"
            aria-modal="true"
            className={`saved-papers-panel relative flex max-h-[calc(100vh-96px)] w-[720px] max-w-[calc(100vw-48px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#081421] shadow-[0_28px_90px_rgba(0,0,0,0.55)] ${
              researchIdeasClosing ? "saved-papers-panel-closing" : ""
            }`}
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/8 px-6 py-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-amber-300" />
                  <h2 className="text-xl font-semibold text-white">Research Ideas</h2>
                  <span className="rounded-full border border-white/12 bg-white/[0.045] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-300">
                    {researchIdeas.length} saved
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  Topics & questions filed in <code className="text-slate-300">Research Papers/Ideas/</code>.
                  Capture "I should look into…" thoughts, then start researching.
                </p>
              </div>
              <button
                aria-label="Close research ideas"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.035] text-slate-300 transition hover:text-white"
                onClick={closeResearchIdeas}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b border-white/8 px-6 py-3">
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3">
                <Search className="h-4 w-4 shrink-0 text-slate-500" />
                <input
                  className="h-9 w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-600"
                  onChange={(event) => setIdeaFilter(event.target.value)}
                  placeholder="Filter ideas by topic or text..."
                  value={ideaFilter}
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-6 py-4">
              {researchIdeasLoading ? (
                <p className="rounded-lg border border-white/8 bg-white/[0.025] px-3 py-3 text-sm text-slate-400">Loading...</p>
              ) : null}
              {!researchIdeasLoading && researchIdeas.length === 0 ? (
                <p className="rounded-lg border border-white/8 bg-white/[0.025] px-3 py-3 text-sm text-slate-400">
                  No research ideas yet. From Capture, a thought like "I should look into X" saves here.
                </p>
              ) : null}
              {researchIdeas
                .map((idea) => ({
                  idea,
                  preview: normalizeVaultText(idea.preview),
                  topic: normalizeVaultText(idea.topic),
                }))
                .filter(({ preview, topic }) => {
                  const q = ideaFilter.trim().toLowerCase();
                  return !q || `${topic} ${preview}`.toLowerCase().includes(q);
                })
                .map(({ idea, preview, topic }) => (
                  <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3.5" key={idea.path}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-white">{topic}</span>
                          <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.035] px-2 py-0.5 text-[10px] uppercase tracking-[0.06em] text-slate-400">
                            {idea.status}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500">{preview || "No detail recorded."}</p>
                        {idea.created ? <p className="mt-1 text-[11px] text-slate-600">{idea.created}</p> : null}
                      </div>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <button
                        className="flex h-9 items-center gap-2 rounded-lg border border-[rgba(var(--accent-rgb),0.3)] bg-[rgba(var(--accent-rgb),0.12)] px-3 text-xs font-medium text-white transition hover:bg-[rgba(var(--accent-rgb),0.2)]"
                        onClick={() => void startResearching(idea)}
                        type="button"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Start researching
                      </button>
                      <button
                        className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 text-xs text-slate-200 transition hover:border-sky-300/30 hover:text-sky-100"
                        onClick={() => void openResearchPaper({ path: idea.path } as ResearchPaper)}
                        type="button"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open note
                      </button>
                    </div>
                  </div>
                ))}
            </div>

            <div className="flex gap-3 border-t border-white/8 px-6 py-4">
              <button
                className="h-10 rounded-lg border border-[rgba(var(--accent-rgb),0.32)] bg-[rgba(var(--accent-rgb),0.12)] px-4 text-sm text-white transition hover:bg-[rgba(var(--accent-rgb),0.2)]"
                onClick={() => void runAction("research.google_scholar", "Google Scholar")}
                type="button"
              >
                Open Google Scholar
              </button>
              <button
                className="h-10 rounded-lg border border-white/10 bg-white/[0.035] px-4 text-sm text-slate-300 transition hover:bg-white/[0.06]"
                onClick={closeResearchIdeas}
                type="button"
              >
                Close
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
