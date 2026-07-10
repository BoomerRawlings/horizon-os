// PHASE-09 projects bridge: fetches the vault's Project Registry/*.md notes (the
// human-maintained source of truth - see Project Registry/index.md) and adapts them into
// Spotlight-shaped Project records. The static entries in projectSpotlightData.ts keep
// their hand-tuned matching; this only ADDS vault-only projects and links vaultPath onto
// static entries that share a name.
import type { Project, ProjectStatus } from "../types";
import { normalizeVaultText } from "../utils/markdownText";

export type VaultProjectRecord = {
  id: string;
  name: string;
  location: string;
  status: string;
  updated: string;
  description: string;
  path: string;
  // PHASE-13: bullets under the note's "## Captures" section (attach_to_project appends
  // them) — shown as attached-capture activity in the Projects workspace.
  captures: number;
};

export async function fetchVaultProjects(): Promise<VaultProjectRecord[]> {
  try {
    const response = await fetch("/api/projects");
    if (!response.ok) return [];
    const data = (await response.json()) as { projects?: VaultProjectRecord[] };
    return (data.projects ?? []).map((record) => ({
      ...record,
      description: normalizeVaultText(record.description),
    }));
  } catch {
    // Dev preview / offline: Spotlight keeps working on the static registry alone.
    return [];
  }
}

function statusFromVault(status: string): ProjectStatus {
  const normalized = status.toLowerCase();
  if (normalized.startsWith("dormant")) return "paused";
  if (normalized.startsWith("retired") || normalized.startsWith("frozen-archive")) return "archived";
  return "active";
}

function keywordsFromName(name: string): string[] {
  const words = name
    .replace(/[()]/g, " ")
    .split(/[\s/-]+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2);
  return [name, ...words];
}

export function vaultProjectToProject(record: VaultProjectRecord): Project {
  const now = new Date().toISOString();
  return {
    accentColor: "slate",
    category: "custom",
    contextLine: record.location ? `Vault-registered project - ${record.location}` : "Vault-registered project",
    createdAt: record.updated ? `${record.updated}T00:00:00.000Z` : now,
    defaultAction: "open_workspace",
    defaultActionLabel: "Open Project Folder",
    fallbackNextAction: `Review ${record.name}`,
    id: `vault:${record.id}`,
    linkedSources: {
      calendarKeywords: keywordsFromName(record.name),
      localFolderPaths: record.location ? [record.location] : [],
    },
    name: record.name,
    priority: "medium",
    progress: { type: "status", text: record.status || "active" },
    status: statusFromVault(record.status),
    subtitle: record.description || "From the vault Project Registry",
    summary: record.description || "This project is registered in the vault's Project Registry and has no Spotlight-specific data yet.",
    updatedAt: record.updated ? `${record.updated}T00:00:00.000Z` : now,
    vaultPath: record.path,
  };
}

// Static entries (hand-tuned matching/milestones) win on a name collision; they just gain
// vaultPath so the UI can link back to the registry note. Everything else from the vault
// is appended as an additional Spotlight candidate.
export function mergeProjectRegistry(staticProjects: Project[], vaultRecords: VaultProjectRecord[]): Project[] {
  const staticByName = new Map(staticProjects.map((project) => [project.name.toLowerCase(), project]));
  const merged = staticProjects.map((project) => {
    const match = vaultRecords.find((record) => record.name.toLowerCase() === project.name.toLowerCase());
    return match ? { ...project, vaultPath: match.path } : project;
  });

  for (const record of vaultRecords) {
    if (staticByName.has(record.name.toLowerCase())) continue;
    merged.push(vaultProjectToProject(record));
  }

  return merged;
}
