import { ArrowLeft, FlaskConical, Maximize2, Minimize2, ShieldCheck } from "lucide-react";
import { Panel } from "../ui/Panel";

type DevelopmentSandboxWorkspaceProps = {
  canvasMode: boolean;
  onClose: () => void;
  onToggleCanvasMode: () => void;
};

export function DevelopmentSandboxWorkspace({
  canvasMode,
  onClose,
  onToggleCanvasMode,
}: DevelopmentSandboxWorkspaceProps) {
  const CanvasIcon = canvasMode ? Minimize2 : Maximize2;

  return (
    <Panel
      className={`development-sandbox-panel flex min-h-0 flex-col overflow-hidden ${
        canvasMode ? "development-sandbox-panel-expanded" : ""
      }`}
    >
      <header className="development-sandbox-shell-header flex h-14 flex-none items-center gap-3 border-b border-white/8 px-4">
        <button
          aria-label="Back to Home"
          className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.035] text-slate-300 transition hover:border-sky-300/30 hover:text-white"
          onClick={onClose}
          type="button"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="grid h-9 w-9 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/8 text-cyan-200">
          <FlaskConical className="h-4.5 w-4.5" strokeWidth={1.7} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">Constellation</div>
          <div className="truncate text-[11px] text-slate-500">A local experimental map of projects, notes, and relationships</div>
        </div>
        <div
          className="hidden items-center gap-1.5 rounded-full border border-emerald-300/18 bg-emerald-300/8 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.1em] text-emerald-200 lg:flex"
          title="The experiment is loaded from 00_System/local/Horizon, which Git ignores."
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Local only · Git ignored
        </div>
        <button
          className="flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 text-xs text-slate-200 transition hover:border-cyan-300/30 hover:bg-cyan-300/8 hover:text-white"
          onClick={onToggleCanvasMode}
          title={canvasMode ? "Restore Horizon navigation" : "Use the entire Horizon window for the canvas"}
          type="button"
        >
          <CanvasIcon className="h-4 w-4" />
          {canvasMode ? "Restore navigation" : "Expand canvas"}
        </button>
      </header>
      <iframe
        className="development-sandbox-frame min-h-0 flex-1 border-0"
        src="/api/development-sandbox"
        title="Constellation local experiment"
      />
    </Panel>
  );
}
