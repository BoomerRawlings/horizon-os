import { useState, type ComponentType } from "react";
import { BookOpen, CalendarDays, FlaskConical, Folder, FolderKanban, Home, PenLine, Settings } from "lucide-react";
import { dockItems } from "../../data/dockItems";
import { isBrowsableSource, LAUNCH_ONLY_HINT } from "../../data/integrationCapability";
import type { FileBrowserSourceId, HorizonView, IntegrationConnection, ProfileSettings, SettingsOpenTarget } from "../../types";
import { playLogoPokeSound, type FocusAudioHandle } from "../../utils/focusFeedback";
import { BrandMark } from "../ui/BrandMark";
import { HorizonMark } from "../ui/HorizonMark";
import { ConstellationIcon, FocusIcon } from "../ui/HorizonIcons";

type SidebarNavItem = {
  icon?: ComponentType<{ className?: string; strokeWidth?: number }>;
  id: string;
  label: string;
  sourceId?: FileBrowserSourceId;
  view: HorizonView;
};

const primaryNavItems: SidebarNavItem[] = [
  { id: "home", label: "Home", icon: Home, view: "home" },
  { id: "calendar", label: "Calendar", icon: CalendarDays, view: "calendar" },
  { id: "project-management", label: "Projects", icon: FolderKanban, view: "projects" },
  { id: "constellation", label: "Constellation", icon: ConstellationIcon, view: "development-sandbox" },
  { id: "focus", label: "Focus", icon: FocusIcon, view: "focus" },
  { id: "research", label: "Research", icon: BookOpen, view: "research" },
  { id: "workbench", label: "Workbench", icon: PenLine, view: "workbench" },
  { id: "files", label: "Files", icon: Folder, sourceId: "local", view: "files" },
  { id: "sandbox", label: "Sandbox", icon: FlaskConical, view: "sandbox" },
];

const integrationNavItems: SidebarNavItem[] = [
  { id: "obsidian", label: "Obsidian", sourceId: "obsidian", view: "files" },
  { id: "microsoft", label: "Microsoft", sourceId: "microsoft", view: "files" },
  { id: "google-drive", label: "Google Drive", sourceId: "google-drive", view: "files" },
];

type SidebarProps = {
  activeSourceId: FileBrowserSourceId;
  activeView: HorizonView;
  audioHandle: FocusAudioHandle;
  focusNavigationCollapsed: boolean;
  integrations: IntegrationConnection[];
  onNavigate: (view: HorizonView, sourceId?: FileBrowserSourceId) => void;
  onOpenProfile: () => void;
  onOpenSettings: (target?: SettingsOpenTarget) => void;
  profile: ProfileSettings;
  profileStatus: "Synced" | "Saving..." | "Offline changes" | "Needs attention";
  soundVolume: number;
};

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "RA";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function sourceStatus(sourceId: FileBrowserSourceId, integrations: IntegrationConnection[]) {
  if (sourceId === "local") return { label: "Ready", tone: "bg-emerald-400" };
  if (!isBrowsableSource(sourceId)) return { label: LAUNCH_ONLY_HINT, tone: "bg-sky-400" };
  const integration = integrations.find((item) => item.id === (sourceId === "research" ? "research" : sourceId));
  if (integration?.status === "connected") return { label: "Connected", tone: "bg-emerald-400" };
  if (integration?.status === "connected_limited") return { label: "Limited", tone: "bg-amber-300" };
  return { label: integration?.statusLabel ?? "Not connected", tone: "bg-slate-500" };
}

function SourceMark({ sourceId }: { sourceId: FileBrowserSourceId }) {
  const dockItem = dockItems.find((item) => item.id === sourceId);
  if (dockItem) {
    return <BrandMark brand={dockItem.brand} className="h-5 w-5" iconSrc={dockItem.iconSrc} label={dockItem.label} />;
  }
  if (sourceId === "local") return <Folder className="h-5 w-5" strokeWidth={1.8} />;
  return <BookOpen className="h-5 w-5" strokeWidth={1.8} />;
}

export function Sidebar({
  activeSourceId,
  activeView,
  audioHandle,
  focusNavigationCollapsed,
  integrations,
  onNavigate,
  onOpenProfile,
  onOpenSettings,
  profile,
  profileStatus,
  soundVolume,
}: SidebarProps) {
  const [logoPokeCount, setLogoPokeCount] = useState(0);

  function pokeLogo() {
    setLogoPokeCount((count) => count + 1);
    void playLogoPokeSound(audioHandle, soundVolume);
  }

  const logoLaughClass =
    logoPokeCount === 0 ? "" : logoPokeCount % 2 === 0 ? "horizon-sidebar-logo-laugh-a" : "horizon-sidebar-logo-laugh-b";

  function renderNavItem(item: SidebarNavItem) {
    const Icon = item.icon;
    const active = item.view === activeView && (!item.sourceId || item.sourceId === activeSourceId);
    const status = item.sourceId ? sourceStatus(item.sourceId, integrations) : null;

    return (
      <button
        aria-current={active ? "page" : undefined}
        className={`horizon-sidebar-nav-item flex h-11 items-center gap-3 rounded-xl border px-4 text-left text-[15px] transition ${
          active
            ? "horizon-sidebar-nav-item-active border-[rgba(var(--accent-rgb),0.25)] bg-[rgba(var(--accent-rgb),0.14)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
            : "border-transparent text-slate-400 hover:border-white/10 hover:bg-white/[0.03] hover:text-slate-100"
        }`}
        key={item.id}
        onClick={() => onNavigate(item.view, item.sourceId)}
        type="button"
      >
        {item.sourceId ? <SourceMark sourceId={item.sourceId} /> : Icon ? <Icon className="h-5 w-5" strokeWidth={1.8} /> : null}
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {status ? <span aria-label={status.label} className={`h-2 w-2 rounded-full ${status.tone}`} title={status.label} /> : null}
      </button>
    );
  }

  return (
    <aside
      aria-hidden={focusNavigationCollapsed || undefined}
      className={`horizon-sidebar fixed inset-y-0 left-0 z-30 flex w-64 flex-col overflow-hidden border-r border-white/10 bg-[#06101b]/92 px-3 py-6 backdrop-blur ${
        focusNavigationCollapsed ? "horizon-sidebar-focus-collapsed" : ""
      }`}
    >
      <div className={`horizon-brand-lockup shrink-0 ${logoLaughClass}`}>
        <button
          aria-label="Tickle Horizon"
          className="horizon-sidebar-logo"
          key={logoPokeCount}
          onClick={pokeLogo}
          title="Poke Horizon in the belly"
          type="button"
        >
          <span className="horizon-sidebar-logo-core">
            <HorizonMark className="horizon-sidebar-logo-mark" />
          </span>
        </button>
        <button className="min-w-0 text-left" onClick={() => onNavigate("home")} type="button">
          <div className="whitespace-nowrap text-[19px] font-semibold tracking-[0.03em] text-white">HorizonOS</div>
          <div className="whitespace-nowrap text-[11px] uppercase tracking-[0.16em] text-slate-500">Everything in Orbit</div>
        </button>
      </div>

      <nav className="horizon-sidebar-nav min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="grid gap-1.5">
          {primaryNavItems.map(renderNavItem)}
          <div className="horizon-sidebar-section-label mt-3 px-4 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Integrations
          </div>
          {integrationNavItems.map(renderNavItem)}
        </div>
      </nav>

      <div className="mt-auto shrink-0 border-t border-white/10 pt-5">
        <button
          className="mb-3 flex h-10 w-full items-center gap-3 rounded-xl border border-transparent px-3 text-left text-sm text-slate-400 transition hover:border-white/10 hover:bg-white/[0.03] hover:text-slate-100"
          onClick={() => onOpenSettings()}
          type="button"
        >
          <Settings className="h-5 w-5" strokeWidth={1.8} />
          Settings
        </button>
        <button
          aria-label="Profile & Customization"
          className="flex w-full items-center gap-3 rounded-2xl border border-transparent px-3 py-2 text-left transition hover:border-white/10 hover:bg-white/[0.035]"
          onClick={onOpenProfile}
          title="Profile & Customization"
          type="button"
        >
          <div className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-base font-medium text-white">
            {initialsFor(profile.displayName)}
          </div>
          <div>
            <div className="text-sm font-medium text-white">{profile.displayName}</div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              {profileStatus} <span className={`h-2 w-2 rounded-full ${profileStatus === "Synced" ? "bg-emerald-400" : "bg-amber-300"}`} />
            </div>
          </div>
        </button>
      </div>
    </aside>
  );
}
