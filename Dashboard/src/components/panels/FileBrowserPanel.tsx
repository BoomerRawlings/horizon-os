import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FilePlus2,
  FileText,
  Filter,
  Folder,
  HardDrive,
  Link2,
  Loader2,
  MoreHorizontal,
  NotebookTabs,
  RefreshCw,
  Search,
  Settings,
  Timer,
} from "lucide-react";
import type { FileBrowserSourceId, IntegrationConnection, SettingsOpenTarget } from "../../types";
import { dockItems } from "../../data/dockItems";
import { isBrowsableSource, LAUNCH_ONLY_HINT } from "../../data/integrationCapability";
import { BrandMark } from "../ui/BrandMark";

type BrowserItem = {
  id: string;
  appActionLabel?: string;
  context: string[];
  description: string;
  fileType: string;
  kind: "file" | "folder";
  mimeType?: string;
  modified: string;
  name: string;
  parentPath?: string;
  path: string;
  related?: Array<{ detail: string; label: string; type: "note" | "project" | "tasks" }>;
  rootKey?: string;
  size?: string;
  sourceId: FileBrowserSourceId;
  webViewLink?: string;
};

type BrowserRoot = {
  key: string;
  label: string;
  path: string;
};

type BrowserCrumb = {
  label: string;
  path: string;
  rootKey?: string;
};

type BrowserResponse = {
  breadcrumbs: BrowserCrumb[];
  detail?: string;
  items: BrowserItem[];
  message?: string;
  ok: boolean;
  parentPath?: string;
  path?: string;
  pathLabel?: string;
  rootKey?: string;
  roots?: BrowserRoot[];
  sourceId: FileBrowserSourceId;
  state?: string;
  status?: string;
  subtitle?: string;
  title: string;
};

type SourceLocation = {
  path: string;
  rootKey: string;
};

type FileBrowserPanelProps = {
  initialSourceId: FileBrowserSourceId;
  integrations: IntegrationConnection[];
  onOpenSettings: (target?: SettingsOpenTarget) => void;
};

const sourceOrder: FileBrowserSourceId[] = ["local", "obsidian", "google-drive", "research", "microsoft"];

const sourceLabels: Record<FileBrowserSourceId, { helper: string; label: string }> = {
  local: { helper: "Browse this PC", label: "Local" },
  obsidian: { helper: "Vault structure", label: "Obsidian" },
  "google-drive": { helper: "Drive files", label: "Google Drive" },
  research: { helper: "Research folders", label: "Research Library" },
  microsoft: { helper: "Launch only — no in-app browsing", label: "Microsoft" },
};

const defaultLocations: Record<FileBrowserSourceId, SourceLocation> = {
  local: { path: "", rootKey: "home" },
  obsidian: { path: "", rootKey: "vault" },
  "google-drive": { path: "root", rootKey: "drive" },
  research: { path: "", rootKey: "research" },
  microsoft: { path: "", rootKey: "microsoft" },
};

const connectedStatuses = new Set(["connected", "connected_limited", "stale", "syncing"]);

function sourceState(sourceId: FileBrowserSourceId, integrations: IntegrationConnection[]) {
  if (sourceId === "local") {
    return { detail: "This PC", label: "Ready", tone: "bg-emerald-400", usable: true };
  }

  // Honesty guard: sources the server cannot browse in-app never present as browsable,
  // regardless of what integration settings are saved (mirrors server listFileBrowserSource).
  if (!isBrowsableSource(sourceId)) {
    return {
      detail: "Apps launch from the dock. In-app file browsing is not available yet.",
      label: LAUNCH_ONLY_HINT,
      tone: "bg-sky-400",
      usable: false,
    };
  }

  const integrationId = sourceId === "research" ? "research" : sourceId;
  const connection = integrations.find((integration) => integration.id === integrationId);
  if (!connection) {
    return { detail: "Not configured", label: "Unavailable", tone: "bg-slate-500", usable: false };
  }

  const usable = connectedStatuses.has(connection.status);
  const tone = usable ? "bg-emerald-400" : connection.status === "permission_missing" || connection.status === "api_key_required" ? "bg-amber-300" : "bg-slate-500";
  return {
    detail: connection.detailLabel || connection.permissionSummary || "Configure this source in Settings.",
    label: connection.statusLabel,
    tone,
    usable,
  };
}

function sourceSettingsTarget(sourceId: FileBrowserSourceId): SettingsOpenTarget {
  if (sourceId === "local") return { section: "data" };
  return { integrationId: sourceId === "research" ? "research" : sourceId, section: "integrations" };
}

function safeResponseSource(value: unknown): FileBrowserSourceId {
  return sourceOrder.includes(value as FileBrowserSourceId) ? (value as FileBrowserSourceId) : "local";
}

function SourceIcon({ sourceId }: { sourceId: FileBrowserSourceId }) {
  if (sourceId === "local") return <HardDrive className="h-5 w-5 text-sky-200" />;
  if (sourceId === "research") return <BookOpen className="h-5 w-5 text-amber-200" />;

  const dockItem = dockItems.find((item) => item.id === sourceId);
  if (dockItem) {
    return <BrandMark brand={dockItem.brand} className="h-5 w-5" iconSrc={dockItem.iconSrc} label={dockItem.label} />;
  }

  return <Folder className="h-5 w-5 text-slate-300" />;
}

function itemTone(item: BrowserItem) {
  if (item.kind === "folder") return "border-sky-300/16 bg-sky-400/8 text-sky-200";
  if (item.fileType.toLowerCase().includes("pdf")) return "border-rose-300/18 bg-rose-400/8 text-rose-200";
  if (item.fileType.toLowerCase().includes("markdown")) return "border-cyan-300/18 bg-cyan-400/8 text-cyan-200";
  if (item.fileType.toLowerCase().includes("google")) return "border-emerald-300/18 bg-emerald-400/8 text-emerald-200";
  return "border-white/10 bg-white/[0.035] text-slate-300";
}

function IconForItem({ item }: { item: BrowserItem }) {
  if (item.kind === "folder") return <Folder className="h-5 w-5 text-sky-200" />;
  return <FileText className="h-5 w-5 text-slate-300" />;
}

export function FileBrowserPanel({ initialSourceId, integrations, onOpenSettings }: FileBrowserPanelProps) {
  const [activeSourceId, setActiveSourceId] = useState<FileBrowserSourceId>(initialSourceId);
  const [locations, setLocations] = useState<Record<FileBrowserSourceId, SourceLocation>>(defaultLocations);
  const [browser, setBrowser] = useState<BrowserResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [selectedItem, setSelectedItem] = useState<BrowserItem | null>(null);
  const [message, setMessage] = useState("");

  const activeLocation = locations[activeSourceId] || defaultLocations[activeSourceId];
  const activeSourceState = sourceState(activeSourceId, integrations);

  useEffect(() => {
    setActiveSourceId(initialSourceId);
  }, [initialSourceId]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const params = new URLSearchParams({ source: activeSourceId });
    if (activeLocation.rootKey) params.set("root", activeLocation.rootKey);
    if (activeLocation.path) params.set("path", activeLocation.path);
    if (query.trim()) params.set("q", query.trim());

    setLoading(true);
    fetch(`/api/files/list?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as BrowserResponse | null;
        if (!data) throw new Error("The file source returned an empty response.");
        return { ...data, sourceId: safeResponseSource(data.sourceId), ok: Boolean(data.ok) };
      })
      .then((data) => {
        if (cancelled) return;
        setBrowser(data);
        setSelectedItem((current) => {
          if (!current) return null;
          return data.items.find((item) => item.id === current.id) || null;
        });
      })
      .catch((error) => {
        if (cancelled || error.name === "AbortError") return;
        setBrowser({
          breadcrumbs: [],
          items: [],
          message: error instanceof Error ? error.message : "The file source could not be loaded.",
          ok: false,
          sourceId: activeSourceId,
          title: sourceLabels[activeSourceId].label,
        });
        setSelectedItem(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeLocation.path, activeLocation.rootKey, activeSourceId, query, refreshNonce]);

  const selectedOrFirstFile = useMemo(() => {
    if (selectedItem) return selectedItem;
    return browser?.items.find((item) => item.kind === "file") || null;
  }, [browser?.items, selectedItem]);

  function updateLocation(sourceId: FileBrowserSourceId, patch: Partial<SourceLocation>) {
    setLocations((current) => ({
      ...current,
      [sourceId]: { ...(current[sourceId] || defaultLocations[sourceId]), ...patch },
    }));
    setSelectedItem(null);
  }

  function setSource(sourceId: FileBrowserSourceId) {
    setActiveSourceId(sourceId);
    setQuery("");
    setSelectedItem(null);
  }

  function navigateTo(path: string, rootKey = activeLocation.rootKey) {
    updateLocation(activeSourceId, { path, rootKey });
  }

  function navigateInto(item: BrowserItem) {
    updateLocation(activeSourceId, { path: item.path, rootKey: item.rootKey || activeLocation.rootKey });
  }

  function goUp() {
    if (!browser?.parentPath && activeLocation.path !== "root") return;
    navigateTo(browser?.parentPath || (activeSourceId === "google-drive" ? "root" : ""));
  }

  async function openItem(item: BrowserItem) {
    if (item.kind === "folder") {
      navigateInto(item);
      return;
    }

    setMessage(`Opening ${item.name}...`);
    try {
      const response = await fetch("/api/files/open", {
        body: JSON.stringify(item),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string; ok?: boolean };
      if (!response.ok || data.ok === false) throw new Error(data.message || "Could not open this item.");
      setMessage(data.message || `Opening ${item.name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not open this item.");
    }
    window.setTimeout(() => setMessage(""), 3600);
  }

  function queueAction(label: string, item = selectedOrFirstFile) {
    if (!item) return;
    if (label === "Open") {
      void openItem(item);
      return;
    }
    setMessage(`${label} is not connected to a workflow yet. ${item.name} is selected.`);
    window.setTimeout(() => setMessage(""), 3600);
  }

  return (
    <section className="file-browser-panel grid min-h-[calc(100vh-40px)] grid-cols-1 gap-4 overflow-y-auto overflow-x-hidden xl:h-[calc(100vh-40px)] xl:min-h-[760px] xl:grid-cols-[minmax(0,1fr)_340px] xl:overflow-hidden">
      <div className="file-browser-primary flex min-w-0 flex-col overflow-hidden rounded-2xl border border-white/8 bg-slate-950/44 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-xl">
        <div className="flex min-h-14 items-center justify-between gap-4 border-b border-white/8 px-5 py-3 text-sm">
          <div className="flex min-w-0 items-center gap-2 overflow-hidden text-slate-500">
            {(browser?.breadcrumbs?.length ? browser.breadcrumbs : [{ label: sourceLabels[activeSourceId].label, path: activeLocation.path }]).map((crumb, index, crumbs) => (
              <div className="flex min-w-0 items-center gap-2" key={`${crumb.path}-${index}`}>
                <button
                  className={`max-w-[190px] truncate transition ${index === crumbs.length - 1 ? "font-medium text-slate-100" : "hover:text-slate-200"}`}
                  onClick={() => navigateTo(crumb.path, crumb.rootKey || activeLocation.rootKey)}
                  type="button"
                >
                  {crumb.label}
                </button>
                {index < crumbs.length - 1 ? <ChevronRight className="h-4 w-4 shrink-0 text-slate-600" /> : null}
              </div>
            ))}
          </div>
          <button
            className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.025] px-3 text-xs text-slate-300 transition hover:border-sky-300/25 hover:bg-sky-400/8"
            onClick={() => setRefreshNonce((current) => current + 1)}
            type="button"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[250px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-b border-white/8 bg-slate-950/28 p-4 xl:border-b-0 xl:border-r">
            <div className="space-y-2">
              {sourceOrder.map((sourceId) => {
                const state = sourceState(sourceId, integrations);
                const active = sourceId === activeSourceId;
                return (
                  <button
                    className={`flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition ${
                      active
                        ? "border-sky-300/45 bg-sky-400/12 text-white"
                        : "border-transparent text-slate-300 hover:border-white/10 hover:bg-white/[0.035] hover:text-slate-100"
                    }`}
                    key={sourceId}
                    onClick={() => setSource(sourceId)}
                    type="button"
                  >
                    <SourceIcon sourceId={sourceId} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{sourceLabels[sourceId].label}</span>
                      <span className="mt-1 block truncate text-xs text-slate-500">{sourceLabels[sourceId].helper}</span>
                    </span>
                    <span className={`h-2 w-2 shrink-0 rounded-full ${state.tone}`} />
                  </button>
                );
              })}
            </div>

            {browser?.roots?.length ? (
              <div className="mt-5 rounded-xl border border-white/8 bg-white/[0.025] p-3">
                <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.16em] text-slate-500">
                  Roots
                  <span className="text-[10px] normal-case tracking-normal text-slate-600">{browser.roots.length}</span>
                </div>
                <div className="grid gap-1">
                  {browser.roots.map((root) => (
                    <button
                      className={`flex items-center justify-between rounded-lg px-2 py-2 text-left text-sm transition ${
                        root.key === activeLocation.rootKey ? "bg-sky-400/12 text-sky-100" : "text-slate-400 hover:bg-white/[0.035] hover:text-slate-100"
                      }`}
                      key={root.key}
                      onClick={() => updateLocation(activeSourceId, { path: activeSourceId === "google-drive" ? "root" : "", rootKey: root.key })}
                      type="button"
                    >
                      <span className="truncate">{root.label}</span>
                      {root.key === activeLocation.rootKey ? <CheckCircle2 className="h-4 w-4 text-sky-300" /> : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-auto hidden pt-4 text-xs leading-relaxed text-slate-500 xl:block">
              {activeSourceState.detail}
            </div>
          </aside>

          <div className="flex min-w-0 flex-col overflow-hidden">
            <div className="border-b border-white/8 px-5 py-5">
              <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-sky-300/18 bg-sky-400/8">
                    <SourceIcon sourceId={activeSourceId} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h2 className="truncate text-2xl font-semibold text-white">{browser?.title || sourceLabels[activeSourceId].label}</h2>
                      <span className="rounded-md border border-sky-300/18 bg-sky-400/10 px-2 py-1 text-xs text-sky-200">{browser?.status || activeSourceState.label}</span>
                    </div>
                    <p className="mt-2 truncate text-sm text-slate-400">{browser?.pathLabel || browser?.subtitle || activeSourceState.detail}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    className="flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.025] px-4 text-sm text-slate-200 transition hover:border-sky-300/25 hover:bg-sky-400/8 disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={!browser?.parentPath && activeLocation.path === (activeSourceId === "google-drive" ? "root" : "")}
                    onClick={goUp}
                    type="button"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Up
                  </button>
                  <button
                    className="flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.025] px-4 text-sm text-slate-200 transition hover:border-sky-300/25 hover:bg-sky-400/8"
                    onClick={() => onOpenSettings(sourceSettingsTarget(activeSourceId))}
                    type="button"
                  >
                    <Settings className="h-4 w-4" />
                    Configure
                  </button>
                </div>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-white/8 p-5 lg:flex-row lg:items-center">
                <label className="flex h-11 min-w-0 flex-1 items-center gap-3 rounded-lg border border-white/10 bg-slate-950/35 px-3 text-sm text-slate-500 transition-with-motion focus-within:border-sky-300/35 focus-within:bg-slate-950/55">
                  <Search className="h-5 w-5 shrink-0" />
                  <input
                    className="min-w-0 flex-1 bg-transparent text-slate-100 outline-none placeholder:text-slate-500"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={`Search ${sourceLabels[activeSourceId].label.toLowerCase()}...`}
                    value={query}
                  />
                </label>
                <button
                  className="flex h-11 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.025] px-4 text-sm text-slate-300 transition hover:border-sky-300/25 hover:bg-sky-400/8"
                  onClick={() => setQuery("")}
                  type="button"
                >
                  <Filter className="h-4 w-4" />
                  Clear
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-auto">
                <table className="min-w-full table-fixed text-left">
                  <thead className="sticky top-0 z-10 bg-slate-950/90 text-xs uppercase tracking-[0.12em] text-slate-500 backdrop-blur">
                    <tr className="border-b border-white/8">
                      <th className="w-[48%] px-5 py-3 font-medium">Name</th>
                      <th className="w-[20%] px-5 py-3 font-medium">Modified</th>
                      <th className="w-[18%] px-5 py-3 font-medium">Type</th>
                      <th className="w-[14%] px-5 py-3 font-medium">Size</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.055]">
                    {loading ? (
                      <tr>
                        <td className="px-5 py-12 text-center text-sm text-slate-400" colSpan={4}>
                          <span className="inline-flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin text-sky-300" />
                            Loading {sourceLabels[activeSourceId].label}...
                          </span>
                        </td>
                      </tr>
                    ) : null}

                    {!loading && browser?.items.length ? (
                      browser.items.map((item) => {
                        const selected = selectedOrFirstFile?.id === item.id;
                        return (
                          <tr
                            className={`group cursor-pointer transition ${
                              selected ? "bg-sky-400/12" : "hover:bg-white/[0.035]"
                            }`}
                            key={item.id}
                            onClick={() => (item.kind === "folder" ? navigateInto(item) : setSelectedItem(item))}
                          >
                            <td className="min-w-0 px-5 py-3">
                              <div className="flex min-w-0 items-center gap-3">
                                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${itemTone(item)}`}>
                                  <IconForItem item={item} />
                                </span>
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-medium text-slate-100">{item.name}</span>
                                  <span className="mt-1 block truncate text-xs text-slate-500">{item.description}</span>
                                </span>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-sm text-slate-400">{item.modified || "-"}</td>
                            <td className="px-5 py-3 text-sm text-slate-400">{item.fileType}</td>
                            <td className="px-5 py-3 text-sm text-slate-500">{item.size || (item.kind === "folder" ? "" : "-")}</td>
                          </tr>
                        );
                      })
                    ) : null}

                    {!loading && !browser?.items.length ? (
                      <tr>
                        <td className="px-5 py-12 text-center text-sm text-slate-500" colSpan={4}>
                          {browser?.message || (query ? "No matching files in this folder." : "This folder is empty.")}
                          {!browser?.ok ? (
                            <div className="mt-4">
                              <button
                                className="rounded-lg border border-sky-300/35 bg-sky-400/10 px-4 py-2 text-sm text-sky-100 transition hover:bg-sky-400/16"
                                onClick={() => onOpenSettings(sourceSettingsTarget(activeSourceId))}
                                type="button"
                              >
                                Open settings
                              </button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <div className="flex min-h-12 items-center justify-between gap-3 border-t border-white/8 px-5 py-3 text-sm text-slate-500">
                <span>{browser?.items.length || 0} item{browser?.items.length === 1 ? "" : "s"}</span>
                <div className="min-w-0 flex-1 truncate text-right text-xs text-slate-600">{message || browser?.message || browser?.pathLabel || ""}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Inspector item={selectedOrFirstFile} openItem={openItem} runAction={queueAction} />
    </section>
  );
}

function Inspector({ item, openItem, runAction }: { item: BrowserItem | null; openItem: (item: BrowserItem) => Promise<void>; runAction: (label: string, item?: BrowserItem | null) => void }) {
  if (!item) {
    return (
      <aside className="file-browser-inspector grid place-items-center rounded-2xl border border-white/8 bg-slate-950/44 p-6 text-center backdrop-blur-xl">
        <div>
          <FileText className="mx-auto h-8 w-8 text-slate-500" />
          <p className="mt-3 text-sm text-slate-400">Select a file to see details and actions.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="file-browser-inspector flex min-h-[520px] min-w-0 flex-col overflow-hidden rounded-2xl border border-white/8 bg-slate-950/44 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-xl xl:min-h-0">
      <div className="border-b border-white/8 p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-14 w-14 place-items-center rounded-xl border border-white/10 bg-white/[0.035]">
            <IconForItem item={item} />
          </div>
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-base font-semibold text-white">{item.name}</h3>
            <p className="mt-2 text-sm text-slate-500">
              {item.fileType}
              {item.size ? ` - ${item.size}` : ""}
            </p>
          </div>
        </div>
        <p className="mt-5 text-sm leading-relaxed text-slate-400">{item.description}</p>
      </div>

      <div className="grid grid-cols-3 gap-2 border-b border-white/8 p-4">
        <InspectorAction icon={<ExternalLink className="h-4 w-4" />} label="Open" onClick={() => void openItem(item)} />
        <InspectorAction icon={<NotebookTabs className="h-4 w-4" />} label={item.sourceId === "obsidian" ? "Vault" : item.sourceId === "google-drive" ? "Drive" : "Source"} onClick={() => void openItem(item)} />
        <InspectorAction icon={<Link2 className="h-4 w-4" />} label="Project" onClick={() => runAction("Add to Project", item)} planned />
        <InspectorAction icon={<FilePlus2 className="h-4 w-4" />} label="Add Note" onClick={() => runAction("Add Note", item)} planned />
        <InspectorAction icon={<Timer className="h-4 w-4" />} label="Focus" onClick={() => runAction("Start Focus", item)} planned />
        <InspectorAction icon={<MoreHorizontal className="h-4 w-4" />} label="More" onClick={() => runAction("More actions", item)} planned />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <InspectorSection title="Details">
          <DetailRow label="Source" value={sourceLabels[item.sourceId]?.label || item.sourceId} />
          <DetailRow label="Path" value={item.path} />
          <DetailRow label="Modified" value={item.modified || "Unknown"} />
          <DetailRow label="Context" value={item.context?.join(", ") || "None"} />
        </InspectorSection>

        <InspectorSection title="Related">
          {item.related?.length ? (
            item.related.map((related) => (
              <button
                className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-white/[0.035]"
                key={related.label}
                onClick={() => runAction(`Open ${related.label}`, item)}
                type="button"
              >
                {related.type === "tasks" ? <Timer className="mt-0.5 h-4 w-4 text-slate-400" /> : null}
                {related.type === "project" ? <Link2 className="mt-0.5 h-4 w-4 text-slate-400" /> : null}
                {related.type === "note" ? <FileText className="mt-0.5 h-4 w-4 text-slate-400" /> : null}
                <span className="min-w-0">
                  <span className="block truncate text-sm text-slate-200">{related.label}</span>
                  <span className="mt-1 block text-xs text-slate-500">{related.detail}</span>
                </span>
              </button>
            ))
          ) : (
            <div className="rounded-lg border border-white/8 bg-white/[0.025] px-3 py-3 text-sm text-slate-500">No related notes or tasks yet.</div>
          )}
        </InspectorSection>
      </div>
    </aside>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[74px_minmax(0,1fr)] gap-3 rounded-lg px-2 py-2 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="min-w-0 break-words text-slate-300">{value}</span>
    </div>
  );
}

function InspectorAction({
  icon,
  label,
  onClick,
  planned = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  planned?: boolean;
}) {
  return (
    <button
      className={`relative flex min-h-20 flex-col items-center justify-center gap-2 rounded-lg border px-2 text-center text-xs transition ${
        planned
          ? "border-white/8 bg-white/[0.015] text-slate-500 hover:border-white/15 hover:text-slate-300"
          : "border-white/10 bg-white/[0.025] text-slate-300 hover:border-sky-300/25 hover:bg-sky-400/8 hover:text-slate-100"
      }`}
      onClick={onClick}
      title={planned ? `${label} is planned — not wired to a workflow yet` : undefined}
      type="button"
    >
      {icon}
      {label}
      {planned ? <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-amber-300/60" /> : null}
    </button>
  );
}

function InspectorSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="border-b border-white/8 p-4">
      <h4 className="mb-3 text-sm font-medium text-white">{title}</h4>
      <div className="grid gap-1">{children}</div>
    </section>
  );
}
