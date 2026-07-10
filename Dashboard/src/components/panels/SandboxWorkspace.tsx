import { FlaskConical, Orbit } from "lucide-react";
import { Panel } from "../ui/Panel";

type SandboxWorkspaceProps = {
  onClose: () => void;
};

export function SandboxWorkspace({ onClose }: SandboxWorkspaceProps) {
  return (
    <Panel className="sandbox-placeholder-panel relative grid min-h-[520px] place-items-center overflow-hidden p-8">
      <div aria-hidden="true" className="sandbox-placeholder-orbit">
        <Orbit className="h-full w-full" strokeWidth={0.8} />
      </div>
      <div className="relative z-10 max-w-md text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-[rgba(var(--accent-rgb),0.24)] bg-[rgba(var(--accent-rgb),0.1)] text-[rgb(var(--accent-rgb))] shadow-[0_0_38px_rgba(var(--accent-rgb),0.12)]">
          <FlaskConical className="h-8 w-8" strokeWidth={1.55} />
        </div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-[rgba(var(--accent-rgb),0.8)]">Future workspace</p>
        <h2 className="mt-2 text-3xl font-semibold text-white">Sandbox</h2>
        <p className="mt-3 text-base leading-relaxed text-slate-400">Sandbox is a placeholder for now.</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">Nothing is connected here, and it will not create or change any data.</p>
        <button
          className="mt-7 h-10 rounded-xl border border-white/10 bg-white/[0.035] px-5 text-sm text-slate-200 transition hover:border-[rgba(var(--accent-rgb),0.28)] hover:bg-white/[0.06] hover:text-white"
          onClick={onClose}
          type="button"
        >
          Back to Home
        </button>
      </div>
    </Panel>
  );
}
