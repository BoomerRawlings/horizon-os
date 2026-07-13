// Projects opens as a workspace motion-layer using the shared screen choreography.
//
// Data uses the same merged registry as Project Spotlight: Project Registry/*.md notes
// plus the hand-tuned static spotlight entries. New
// projects enter through Capture so the proposed registry write is reviewed before saving.
//
// Row actions (v1 — management, not kanban):
//   Open workspace     → POST /api/projects/open (location resolved server-side from the
//                        owner's registry note; client never sends a path)
//   Spotlight this      → sets the manual Spotlight selection (same preference mechanism +
//                        window event ProjectSpotlight already listens to)
//   Open registry note  → the existing vault-file open idiom (Obsidian)
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, FileText, FolderKanban, FolderOpen, Inbox, Plus, Star } from "lucide-react";
import { Panel } from "../ui/Panel";
import {
  loadSpotlightPreferences,
  projectRegistry,
  saveSpotlightPreferences,
} from "../../data/projectSpotlightData";
import { SPOTLIGHT_PREFERENCES_EVENT } from "./ProjectSpotlight";
import { fetchVaultProjects, mergeProjectRegistry, PROJECT_REGISTRY_UPDATED_MESSAGE, type VaultProjectRecord } from "../../data/vaultProjects";
import type { Project } from "../../types";

type ProjectsWorkspaceProps = {
  onClose: () => void;
  onCreateProject: () => void;
};

type ProjectRow = {
  project: Project;
  vault: VaultProjectRecord | null;
};

const STATUS_TONE: Record<string, string> = {
  active: "border-emerald-300/30 bg-emerald-300/10 text-emerald-200",
  paused: "border-amber-300/30 bg-amber-300/10 text-amber-200",
  dormant: "border-amber-300/30 bg-amber-300/10 text-amber-200",
  archived: "border-slate-400/25 bg-white/[0.04] text-slate-400",
};

function statusChip(row: ProjectRow) {
  // Prefer the vault note's own status word (active / dormant / "active (live tool)"...);
  // static-only projects fall back to the Project type's status.
  const label = row.vault?.status || row.project.status;
  const key = label.toLowerCase().split(/[\s(]/)[0];
  return { label, tone: STATUS_TONE[key] ?? STATUS_TONE.active };
}

export function ProjectsWorkspace({ onClose, onCreateProject }: ProjectsWorkspaceProps) {
  const [vaultRecords, setVaultRecords] = useState<VaultProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [spotlightedId, setSpotlightedId] = useState<string | null>(() => loadSpotlightPreferences().manualProjectId ?? null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void fetchVaultProjects()
        .then((records) => {
          if (!cancelled) setVaultRecords(records);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    const handleRegistryUpdate = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.data?.type === PROJECT_REGISTRY_UPDATED_MESSAGE) refresh();
    };
    refresh();
    window.addEventListener("message", handleRegistryUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener("message", handleRegistryUpdate);
    };
  }, []);

  const rows = useMemo<ProjectRow[]>(() => {
    const merged = mergeProjectRegistry(projectRegistry, vaultRecords);
    return merged.map((project) => ({
      project,
      vault: vaultRecords.find((record) => record.path === project.vaultPath) ?? null,
    }));
  }, [vaultRecords]);

  function spotlightThis(row: ProjectRow) {
    const next = { ...loadSpotlightPreferences(), manualProjectId: row.project.id, pinnedProjectId: null };
    saveSpotlightPreferences(next);
    window.dispatchEvent(new CustomEvent(SPOTLIGHT_PREFERENCES_EVENT, { detail: next }));
    setSpotlightedId(row.project.id);
    setMessage(`${row.project.name} is now in the Home spotlight.`);
  }

  async function openWorkspaceFolder(row: ProjectRow) {
    if (!row.vault) return;
    setMessage(`Opening ${row.project.name}...`);
    try {
      const response = await fetch("/api/projects/open", {
        body: JSON.stringify({ id: row.vault.id }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as { message?: string; ok?: boolean };
      setMessage(data.message || (data.ok ? `Opening ${row.project.name}...` : "That folder could not be opened."));
    } catch {
      setMessage("That folder could not be opened.");
    }
  }

  async function openRegistryNote(row: ProjectRow) {
    if (!row.vault) return;
    setMessage(`Opening the registry note for ${row.project.name}...`);
    try {
      await fetch("/api/files/open", {
        body: JSON.stringify({ kind: "file", path: row.vault.path, rootKey: "vault", sourceId: "obsidian" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
    } catch {
      // Best-effort, same tolerance as the other open idioms.
    }
  }

  return (
    <Panel className="projects-workspace-panel flex min-h-[560px] flex-col p-4">
      <header className="flex flex-none items-center gap-3 border-b border-white/8 pb-3">
        <button
          aria-label="Back to home"
          className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/[0.035] text-slate-300 transition hover:border-sky-300/30 hover:text-sky-200"
          onClick={onClose}
          type="button"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <FolderKanban className="h-5 w-5 flex-none text-sky-300" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white">Projects</h2>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            Your directory. Open a workspace, choose a Spotlight, or start a reviewed project capture.
          </p>
        </div>
        <div className="min-w-0 max-w-[240px] truncate text-xs text-slate-500" aria-live="polite">{message}</div>
        <button
          className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-[rgba(var(--accent-rgb),0.28)] bg-[rgba(var(--accent-rgb),0.1)] px-3 text-xs font-medium text-slate-100 transition hover:border-[rgba(var(--accent-rgb),0.45)] hover:bg-[rgba(var(--accent-rgb),0.16)]"
          onClick={onCreateProject}
          type="button"
        >
          <Plus className="h-3.5 w-3.5" />
          New project
        </button>
      </header>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-gutter:stable]">
        {loading ? <div className="p-6 text-center text-sm text-slate-500">Loading projects...</div> : null}

        <div className="grid gap-2">
          {rows.map((row) => {
            const chip = statusChip(row);
            const spotlighted = spotlightedId === row.project.id;
            return (
              <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3.5" key={row.project.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-white">{row.project.name}</span>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] ${chip.tone}`}>
                        {chip.label}
                      </span>
                      {spotlighted ? (
                        <span className="flex shrink-0 items-center gap-1 rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-amber-200">
                          <Star className="h-3 w-3" />
                          Spotlighted
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-400">
                      {row.vault?.description || row.project.subtitle || row.project.summary}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                      {row.vault?.location ? <span className="truncate">{row.vault.location}</span> : null}
                      {row.vault && row.vault.captures > 0 ? (
                        <span className="flex items-center gap-1 text-slate-500">
                          <Inbox className="h-3 w-3" />
                          {row.vault.captures} capture{row.vault.captures === 1 ? "" : "s"} attached
                        </span>
                      ) : null}
                      {row.vault?.updated ? <span>updated {row.vault.updated}</span> : null}
                    </div>
                  </div>
                </div>

                <div className="mt-2.5 flex flex-wrap gap-2">
                  {row.vault?.location ? (
                    <button
                      className="flex h-9 items-center gap-2 rounded-lg border border-[rgba(var(--accent-rgb),0.3)] bg-[rgba(var(--accent-rgb),0.12)] px-3 text-xs font-medium text-white transition hover:bg-[rgba(var(--accent-rgb),0.2)]"
                      onClick={() => void openWorkspaceFolder(row)}
                      type="button"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      Open workspace
                    </button>
                  ) : null}
                  <button
                    className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-xs transition ${
                      spotlighted
                        ? "border-amber-300/35 bg-amber-300/10 text-amber-200"
                        : "border-white/10 bg-white/[0.035] text-slate-200 hover:border-amber-300/30 hover:text-amber-100"
                    }`}
                    onClick={() => spotlightThis(row)}
                    type="button"
                  >
                    <Star className="h-3.5 w-3.5" />
                    {spotlighted ? "In spotlight" : "Spotlight this"}
                  </button>
                  {row.vault ? (
                    <button
                      className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 text-xs text-slate-200 transition hover:border-sky-300/30 hover:text-sky-100"
                      onClick={() => void openRegistryNote(row)}
                      type="button"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Open registry note
                    </button>
                  ) : (
                    <span className="flex h-9 items-center gap-1.5 px-1 text-[11px] text-slate-600" title="This project comes from Horizon's built-in Spotlight list, not a vault registry note.">
                      <ExternalLink className="h-3 w-3" />
                      Spotlight-only entry
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {!loading && !vaultRecords.length ? (
          <p className="mt-3 rounded-lg border border-white/8 bg-white/[0.025] px-3 py-3 text-sm text-slate-400">
            The vault Project Registry could not be reached — showing only built-in Spotlight projects.
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
