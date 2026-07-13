// The complete in-app operating manual under Settings -> Advanced. It is deliberately
// workflow-first: teach the daily loop, then provide truthful reference material.
import { type ReactNode } from "react";
import {
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  Compass,
  FileText,
  FolderKanban,
  Home,
  Inbox,
  Keyboard,
  Layers,
  Play,
  Plug,
  Rocket,
  Settings2,
  Sparkles,
  Timer,
  TriangleAlert,
} from "lucide-react";

type AdvancedGuideProps = {
  onReplayTutorial: () => void;
};

function Chip({ children, tone = "live" }: { children: ReactNode; tone?: "live" | "manual" | "planned" | "launcher" }) {
  const toneClass =
    tone === "planned"
      ? "border-amber-300/22 bg-amber-300/10 text-amber-100"
      : tone === "manual"
        ? "border-violet-300/20 bg-violet-300/[0.08] text-violet-100"
        : tone === "launcher"
          ? "border-white/10 bg-white/[0.04] text-slate-300"
          : "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100";
  return (
    <span className={"rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] " + toneClass}>
      {children}
    </span>
  );
}

function Term({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-slate-100">{children}</span>;
}

function Step({ children, n }: { children: ReactNode; n: number }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[rgba(var(--accent-rgb),0.3)] bg-[rgba(var(--accent-rgb),0.1)] text-[10px] font-bold text-sky-100">
        {n}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </li>
  );
}

function Callout({
  children,
  icon: Icon = Sparkles,
  title,
  tone = "accent",
}: {
  children: ReactNode;
  icon?: typeof Sparkles;
  title: string;
  tone?: "accent" | "amber" | "muted";
}) {
  const toneClass =
    tone === "amber"
      ? "border-amber-300/18 bg-amber-300/[0.055]"
      : tone === "muted"
        ? "border-white/9 bg-white/[0.025]"
        : "border-[rgba(var(--accent-rgb),0.2)] bg-[rgba(var(--accent-rgb),0.055)]";
  const iconClass = tone === "amber" ? "text-amber-200" : tone === "muted" ? "text-slate-400" : "text-[rgb(var(--accent-rgb))]";

  return (
    <div className={"rounded-xl border p-3.5 " + toneClass}>
      <div className="flex items-center gap-2">
        <Icon className={"h-4 w-4 " + iconClass} />
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-100">{title}</div>
      </div>
      <div className="mt-2 text-[13px] leading-relaxed text-slate-300">{children}</div>
    </div>
  );
}

function GuideSection({
  children,
  defaultOpen = false,
  icon: Icon,
  id,
  label,
  subtitle,
  title,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  icon: typeof Home;
  id: string;
  label: string;
  subtitle: string;
  title: string;
}) {
  return (
    <details
      className="horizon-guide-section scroll-mt-4 rounded-2xl border border-white/9 bg-white/[0.025]"
      id={id}
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer items-center gap-3 px-4 py-3.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/8 bg-white/[0.035] text-[rgb(var(--accent-rgb))]">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-[rgb(var(--accent-rgb))]">
            {label}
          </span>
          <span className="mt-0.5 block text-sm font-semibold text-white">{title}</span>
          <span className="mt-0.5 block text-xs leading-snug text-slate-500">{subtitle}</span>
        </span>
        <ChevronDown className="horizon-guide-chevron h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
      </summary>
      <div className="horizon-guide-body space-y-4 border-t border-white/8 px-4 pb-4 pt-4 text-[13px] leading-relaxed text-slate-300">
        {children}
      </div>
    </details>
  );
}

const operatingLoop = [
  { label: "Capture", detail: "Save it" },
  { label: "Clarify", detail: "Name it" },
  { label: "Choose", detail: "Spotlight it" },
  { label: "Focus", detail: "Work it" },
  { label: "Review", detail: "Update it" },
];

function OperatingLoop() {
  return (
    <div className="horizon-guide-loop grid grid-cols-5 gap-2" aria-label="Horizon operating loop">
      {operatingLoop.map((item, itemIndex) => (
        <div className="rounded-xl border border-white/9 bg-black/10 px-2 py-3 text-center" key={item.label}>
          <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-[rgb(var(--accent-rgb))]">
            0{itemIndex + 1}
          </div>
          <div className="mt-1 text-xs font-semibold text-white">{item.label}</div>
          <div className="mt-1 text-[10px] text-slate-500">{item.detail}</div>
        </div>
      ))}
    </div>
  );
}

function jumpToGuideSection(id: string) {
  const section = document.getElementById(id);
  if (!(section instanceof HTMLDetailsElement)) return;
  section.open = true;
  section.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "start",
  });
}

const jumpItems = [
  { id: "horizon-guide-start", label: "Run my day", detail: "The shortest useful routine", icon: Rocket },
  { id: "horizon-guide-project-focus", label: "Work a project", detail: "Spotlight + Focus, step by step", icon: FolderKanban },
  { id: "horizon-guide-capture", label: "Clear captures", detail: "Triage without losing context", icon: Inbox },
  { id: "horizon-guide-map", label: "Learn the map", detail: "Home, Calendar, Files, and apps", icon: Compass },
];

export function AdvancedGuide({ onReplayTutorial }: AdvancedGuideProps) {
  return (
    <div className="horizon-guide grid gap-4">
      <section className="rounded-2xl border border-[rgba(var(--accent-rgb),0.24)] bg-[linear-gradient(145deg,rgba(var(--accent-rgb),0.1),rgba(8,20,33,0.78))] p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[rgba(var(--accent-rgb),0.2)] bg-[rgba(var(--accent-rgb),0.08)] text-[rgb(var(--accent-rgb))]">
            <Compass className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-white">How to use Horizon</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-300">
              Horizon is your <Term>home base for deciding what happens next</Term>. It keeps work visible, writes the
              durable record to your vault, and launches outside tools when they are the right place to edit.
            </p>
          </div>
        </div>

        <div className="mt-4">
          <OperatingLoop />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {jumpItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className="group flex items-center gap-3 rounded-xl border border-white/9 bg-black/10 p-3 text-left transition hover:border-[rgba(var(--accent-rgb),0.28)] hover:bg-[rgba(var(--accent-rgb),0.055)]"
                key={item.id}
                onClick={() => jumpToGuideSection(item.id)}
                type="button"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/8 bg-white/[0.03] text-slate-400 transition group-hover:text-[rgb(var(--accent-rgb))]">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-white">{item.label}</span>
                  <span className="mt-0.5 block text-[10px] leading-snug text-slate-500">{item.detail}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/8 pt-3">
          <p className="text-[10px] leading-relaxed text-slate-500">
            This manual describes live behavior. Manual and planned steps are labeled.
          </p>
          <button
            className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-[rgba(var(--accent-rgb),0.3)] bg-[rgba(var(--accent-rgb),0.11)] px-3 text-xs font-medium text-white transition hover:bg-[rgba(var(--accent-rgb),0.18)]"
            onClick={onReplayTutorial}
            type="button"
          >
            <Play className="h-3.5 w-3.5" />
            Replay tutorial
          </button>
        </div>
      </section>

      <GuideSection
        defaultOpen
        icon={Rocket}
        id="horizon-guide-start"
        label="Start here"
        subtitle="The five decisions that make Horizon useful immediately"
        title="Your first ten minutes"
      >
        <ol className="grid gap-3">
          <Step n={1}>
            On <Term>Home</Term>, scan <Term>Today</Term> for anything truly time-sensitive.
          </Step>
          <Step n={2}>
            Open <Term>Projects</Term>, find the effort you want to advance, and choose <Term>Spotlight this</Term>.
          </Step>
          <Step n={3}>
            Return Home and read Spotlight&apos;s <Term>Next</Term> action. Rewrite it if it is too large to finish in one
            sitting.
          </Step>
          <Step n={4}>
            Choose <Term>25 / 5</Term> or <Term>45 / 15</Term> in Focus, then start the project&apos;s session button or
            press Play.
          </Step>
          <Step n={5}>
            At the bell, take the break and record the result: mark the dated item done, or capture “finished / blocked /
            next” and attach it to the project during triage.
          </Step>
        </ol>
        <Callout icon={CheckCircle2} title="Success looks small">
          You do not need a perfectly organized vault. A successful cycle means one project was visible, one action was
          worked, and the next action is clearer than before.
        </Callout>
      </GuideSection>

      <GuideSection
        icon={FolderKanban}
        id="horizon-guide-project-focus"
        label="Core playbook"
        subtitle="How Projects, Spotlight, and the timer work as one system"
        title="Manage projects with Focus"
      >
        <p>
          The three surfaces have separate jobs: <Term>Projects stores context</Term>, <Term>Spotlight chooses the active
          context</Term>, and <Term>Focus protects time</Term>. Use them in that order.
        </p>

        <div className="grid grid-cols-3 gap-2">
          <Callout icon={FolderKanban} title="Projects">
            Your directory. Open a workspace, open the registry note, or choose which project to Spotlight.
          </Callout>
          <Callout icon={Sparkles} title="Spotlight">
            Your current context. It shows why the project matters, its next action, and the best available primary
            action.
          </Callout>
          <Callout icon={Timer} title="Focus">
            Your attention block. It counts time and handles breaks; it does not store project state.
          </Callout>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-100">The full project cycle</h4>
          <ol className="mt-3 grid gap-3">
            <Step n={1}>
              <Term>Create.</Term> Capture “Create a project for…” and approve the proposal during triage. Horizon stages
              it locally without inventing a folder; add its real location to a Project Registry note when it is ready to become active.
            </Step>
            <Step n={2}>
              <Term>Clarify.</Term> Keep a short purpose, current status, and one concrete next action in the project
              record. “Draft intro” is usable; “work on paper” is not.
            </Step>
            <Step n={3}>
              <Term>Choose.</Term> In Projects, select <Term>Spotlight this</Term>. Automatic Spotlight favors urgent
              work; manual Spotlight keeps your choice visible. Pin it when you do not want automatic rotation.
            </Step>
            <Step n={4}>
              <Term>Prepare.</Term> Open the workspace or registry note if you need source material. Close distractions
              and keep the next action visible.
            </Step>
            <Step n={5}>
              <Term>Focus.</Term> Use 25 / 5 for a small, ambiguous, or administrative action; use 45 / 15 for sustained
              production. The timer gear sets a custom pair.
            </Step>
            <Step n={6}>
              <Term>Review.</Term> Mark dated work done, update the registry note in its editor, or capture a progress
              note and attach it to the project. Decide the next action before starting another round.
            </Step>
          </ol>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Callout icon={Settings2} title="Where timer settings live" tone="muted">
            <Term>Home → Focus gear</Term> sets custom minutes. <Term>Settings → Focus</Term> controls auto-start and
            sounds. <Term>Profile → Workspace defaults</Term> chooses the default preset.
          </Callout>
          <Callout icon={TriangleAlert} title="What is still manual" tone="amber">
            Horizon does not yet attach focus history to a project, auto-complete the task, or ask for a post-session
            update. Spotlight is visible context, not time tracking.
          </Callout>
        </div>
      </GuideSection>

      <GuideSection
        icon={Inbox}
        id="horizon-guide-capture"
        label="Inbox workflow"
        subtitle="Save first, then approve where each item belongs"
        title="Capture and triage"
      >
        <ol className="grid gap-3">
          <Step n={1}>
            <Term>Capture anything.</Term> Use rough language. Include dates, people, project names, or desired outcomes
            when you know them; Horizon will ask when an important detail is missing.
          </Step>
          <Step n={2}>
            <Term>Review the queue.</Term> Each item remains in <em>Inbox/To Triage</em> until handled. No assistant action
            silently files it.
          </Step>
          <Step n={3}>
            <Term>Choose the suggestion.</Term> Calendar items, notes, projects, research, file actions, drafts, and
            clarifying questions are shown with their intended result before you apply them.
          </Step>
          <Step n={4}>
            <Term>Apply or undo.</Term> Applying writes the real vault file. Each applied action keeps its own undo.
            Empty placeholders can be deleted directly.
          </Step>
        </ol>
        <Callout icon={Layers} title="Use Sweep all for a pile">
          Sweep all prepares one compact decision per capture. It is faster than opening items individually, but you
          still approve every result. Turn assisted parsing on or off under <Term>Settings → Privacy &amp; AI</Term>;
          when it is off, Horizon uses deterministic local rules only.
        </Callout>
      </GuideSection>

      <GuideSection
        icon={Home}
        id="horizon-guide-map"
        label="Navigation"
        subtitle="What each Home panel and sidebar destination is for"
        title="Home, Calendar, and the map"
      >
        <div className="grid grid-cols-2 gap-3">
          <Callout icon={CalendarCheck} title="Today">
            Upcoming dated work and high-priority reminders. Complete, snooze, or open an item. Use Calendar for the
            full week/month view.
          </Callout>
          <Callout icon={Timer} title="Focus">
            Start, pause, reset, or change the work/break pair. The timer keeps running while you navigate inside
            Horizon.
          </Callout>
          <Callout icon={FolderKanban} title="Project Spotlight">
            The project currently in front of you. Auto chooses based on urgency; manual selection and Pin keep your
            choice stable.
          </Callout>
          <Callout icon={Inbox} title="Capture Queue">
            The safe holding area for unsorted input. Clear it daily or whenever the count begins to pull attention.
          </Callout>
        </div>
        <p>
          The sidebar order is <Term>Home, Calendar, Projects, Constellation, Focus, Research, Workbench, Files, Sandbox</Term>, followed by integrations.
          Sandbox is a placeholder today; Constellation maps projects, their notes, and deliberate relationships. Press <Term>Esc</Term> from a full workspace to return Home; Esc closes open
          panels first.
        </p>
        <p className="text-slate-500">
          Calendar stores dated obligations. Intentionally undated reminders can remain open reminders instead of
          receiving a fake deadline.
        </p>
      </GuideSection>

      <GuideSection
        icon={Plug}
        id="horizon-guide-files"
        label="Tools and sources"
        subtitle="Know whether a click browses here, launches an app, or opens the web"
        title="Files, research, and integrations"
      >
        <div className="grid gap-2">
          <div className="rounded-xl border border-white/9 bg-white/[0.02] p-3">
            <Chip>Connected</Chip>
            <p className="mt-2">
              Browses inside Horizon. Local files, Obsidian, connected Google Drive, and the Research Library use the
              shared file workspace.
            </p>
          </div>
          <div className="rounded-xl border border-white/9 bg-white/[0.02] p-3">
            <Chip tone="launcher">Launcher</Chip>
            <p className="mt-2">
              Opens the real application. Microsoft Office and Codex are launchers by design; they are not in-app
              editors and do not need to show as Connected.
            </p>
          </div>
          <div className="rounded-xl border border-white/9 bg-white/[0.02] p-3">
            <Chip tone="manual">Web</Chip>
            <p className="mt-2">
              Opens the service in a browser. Google Docs, Sheets, Slides, Gmail, Calendar, Scholar, and library portals
              behave this way.
            </p>
          </div>
          <div className="rounded-xl border border-white/9 bg-white/[0.02] p-3">
            <Chip tone="planned">Planned</Chip>
            <p className="mt-2">
              Visible so the roadmap is honest, but not yet interactive. Do not treat a Planned surface as stored or
              synchronized data.
            </p>
          </div>
        </div>
        <p className="text-slate-500">
          Configure connections under <Term>Settings → Integrations</Term>. Credentials stay in this machine's Horizon
          app data; only redacted connection summaries are mirrored into the vault.
        </p>
      </GuideSection>

      <GuideSection
        icon={Settings2}
        id="horizon-guide-setup"
        label="Preferences"
        subtitle="Setup locations that are easy to confuse"
        title="Settings, profile, and your attached vault"
      >
        <ul className="grid gap-2">
          <li>
            <Term>Settings → General:</Term> launch at startup, quiet launch, and Test launch. Last-view restore is
            clearly marked as planned.
          </li>
          <li>
            <Term>Settings → Focus:</Term> auto-start breaks, auto-start the next focus round, sound level, and Test
            sound.
          </li>
          <li>
            <Term>Settings → Appearance:</Term> accent, background theme, ambient effects, and contrast.
          </li>
          <li>
            <Term>Profile → Workspace defaults:</Term> default Focus preset and preferred starting workspace.
          </li>
          <li>
            <Term>Settings → Data & Storage:</Term> shows the active local copy of your synced Obsidian vault. Change it
            only when the vault moved or you are attaching this computer for the first time; Horizon validates and
            restarts against the new root.
          </li>
        </ul>
        <p>
          Use <Term>Tab</Term> to move through controls, <Term>Enter</Term> for the focused primary action, and{" "}
          <Term>Esc</Term> to back out. Settings autosave unless a control explicitly provides an Apply button.
        </p>
      </GuideSection>

      <GuideSection
        icon={TriangleAlert}
        id="horizon-guide-limits"
        label="Honest boundaries"
        subtitle="What Horizon deliberately leaves manual today"
        title="Know what is not automated"
      >
        <ul className="grid gap-2">
          <li>
            <Chip tone="manual">Manual</Chip>{" "}
            <span className="ml-1">New project opens a prefilled Capture → Triage flow and stages an Inbox proposal; it does not invent the project folder or registry location.</span>
          </li>
          <li>
            <Chip tone="manual">Manual</Chip>{" "}
            <span className="ml-1">Registry details and status are edited in the project note, not in an in-app form or Kanban board.</span>
          </li>
          <li>
            <Chip tone="manual">Manual</Chip>{" "}
            <span className="ml-1">Focus sessions are not logged per project and do not automatically update progress or complete a task.</span>
          </li>
          <li>
            <Chip tone="manual">Manual</Chip>{" "}
            <span className="ml-1">Closing or reloading Horizon resets the active timer. Finish or pause intentionally before restarting.</span>
          </li>
          <li>
            <Chip tone="launcher">Launcher</Chip>{" "}
            <span className="ml-1">Office, Codex, and several web tools open outside Horizon; Horizon remains the place you return to.</span>
          </li>
        </ul>
        <Callout icon={FileText} title="A reliable workaround is still a real workflow" tone="muted">
          When Horizon cannot update something inline, capture the progress and next action. Triage can attach that
          durable note to the project without asking you to remember it later.
        </Callout>
      </GuideSection>

      <div className="flex items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.02] p-4 text-[12px] leading-relaxed text-slate-500">
        <Keyboard className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          The shortest version: check Today, Spotlight one project, work one next action with Focus, record the result,
          and sweep captures. Everything else is reference.
        </p>
      </div>
    </div>
  );
}
