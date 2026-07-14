// First-run onboarding. The short tutorial teaches Horizon's operating loop before
// optional setup, then remains replayable from Settings -> Advanced.
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Compass,
  FolderKanban,
  FolderOpen,
  Home,
  Inbox,
  LayoutDashboard,
  Play,
  Rocket,
  Settings2,
  Sparkles,
  Timer,
  X,
} from "lucide-react";
import { MOTION_TIMING } from "../../data/motionSystem";

export const FIRST_RUN_STORAGE_KEY = "horizon-os.first-run-complete.v1";
export const FIRST_RUN_REPLAY_EVENT = "horizon-os.first-run-replay";

export function hasCompletedFirstRun() {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(FIRST_RUN_STORAGE_KEY) === "done";
  } catch {
    return true;
  }
}

function markFirstRunComplete() {
  try {
    window.localStorage.setItem(FIRST_RUN_STORAGE_KEY, "done");
  } catch {
    // If local storage is unavailable, the tutorial may appear again next launch.
  }
}

type FirstRunWizardProps = {
  onClose: () => void;
};

type WizardStep = {
  body: (ctx: { vaultPath: string }) => ReactNode;
  icon: typeof Compass;
  id: string;
  navLabel: string;
  subtitle: string;
  title: string;
};

const workLoop = [
  { label: "Capture", detail: "Save the thought" },
  { label: "Clarify", detail: "Decide what it is" },
  { label: "Choose", detail: "Pick the project" },
  { label: "Focus", detail: "Work one action" },
  { label: "Review", detail: "Record what is next" },
];

function Term({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-slate-100">{children}</span>;
}

function PathChip({ value }: { value: string }) {
  return (
    <code
      className="mt-1 block max-w-full truncate rounded-lg border border-[rgba(var(--accent-rgb),0.26)] bg-[rgba(var(--accent-rgb),0.09)] px-2.5 py-1.5 text-[12px] text-sky-100"
      title={value}
    >
      {value}
    </code>
  );
}

function NumberedStep({ children, n }: { children: ReactNode; n: number }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[rgba(var(--accent-rgb),0.34)] bg-[rgba(var(--accent-rgb),0.12)] text-[10px] font-bold text-sky-100">
        {n}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </li>
  );
}

function InfoCard({
  children,
  icon: Icon,
  title,
  tone = "accent",
}: {
  children: ReactNode;
  icon: typeof Home;
  title: string;
  tone?: "accent" | "amber" | "muted";
}) {
  const toneClass =
    tone === "amber"
      ? "border-amber-300/20 bg-amber-300/[0.055]"
      : tone === "muted"
        ? "border-white/9 bg-white/[0.025]"
        : "border-[rgba(var(--accent-rgb),0.2)] bg-[rgba(var(--accent-rgb),0.055)]";
  const iconClass = tone === "amber" ? "text-amber-200" : tone === "muted" ? "text-slate-400" : "text-[rgb(var(--accent-rgb))]";

  return (
    <div className={"rounded-xl border p-3.5 " + toneClass}>
      <div className="flex items-center gap-2">
        <Icon className={"h-4 w-4 " + iconClass} />
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      <div className="mt-2 text-[13px] leading-relaxed text-slate-300">{children}</div>
    </div>
  );
}

function WorkflowStrip() {
  return (
    <div className="first-run-workflow grid grid-cols-5 gap-2" aria-label="Horizon workflow">
      {workLoop.map((item, itemIndex) => (
        <div
          className="relative rounded-xl border border-white/9 bg-white/[0.025] px-2.5 py-3 text-center"
          key={item.label}
        >
          <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[rgb(var(--accent-rgb))]">
            0{itemIndex + 1}
          </div>
          <div className="mt-1 text-xs font-semibold text-white">{item.label}</div>
          <div className="mt-1 text-[10px] leading-snug text-slate-400">{item.detail}</div>
        </div>
      ))}
    </div>
  );
}

const steps: WizardStep[] = [
  {
    id: "loop",
    navLabel: "The loop",
    icon: Compass,
    title: "Horizon in 30 seconds",
    subtitle: "One home base. One repeatable way to work.",
    body: () => (
      <div className="space-y-4">
        <p className="text-[15px] leading-relaxed text-slate-200">
          Horizon has one job: keep the <Term>next useful action</Term> visible while everything else stays safely
          organized behind it.
        </p>
        <WorkflowStrip />
        <div className="grid grid-cols-3 gap-3">
          <InfoCard icon={Home} title="Home">
            See what is due, the project that matters now, and the Focus timer.
          </InfoCard>
          <InfoCard icon={LayoutDashboard} title="Workspaces">
            Use the left sidebar for Calendar, Projects, Constellation, Focus, Research, Workbench, Files, and Sandbox.
          </InfoCard>
          <InfoCard icon={FolderOpen} title="Your vault">
            Horizon writes durable local files. The app is the cockpit; the vault keeps the record.
          </InfoCard>
        </div>
        <p className="text-xs leading-relaxed text-slate-400">
          You do not need to organize perfectly before you begin. Capture first, make one decision at a time, and
          return to Home.
        </p>
      </div>
    ),
  },
  {
    id: "home",
    navLabel: "Home",
    icon: Home,
    title: "Know where to look",
    subtitle: "Home answers four different questions.",
    body: () => (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <InfoCard icon={LayoutDashboard} title="Today — What is time-sensitive?">
            Dated tasks, events, deadlines, and high-priority reminders appear here. Complete, snooze, or open the
            source file from the item.
          </InfoCard>
          <InfoCard icon={FolderKanban} title="Spotlight — What am I advancing?">
            Spotlight keeps one project and its next action visible. Use Projects → Spotlight this when you want to
            choose it manually.
          </InfoCard>
          <InfoCard icon={Timer} title="Focus — What am I doing now?">
            The timer protects one block of attention. Choose 25 / 5, 45 / 15, or set a custom duration with the gear.
          </InfoCard>
          <InfoCard icon={Inbox} title="Capture — What must I not forget?">
            Put interruptions, ideas, links, and loose tasks here. They stay safe in the queue until you triage them.
          </InfoCard>
        </div>
        <InfoCard icon={Settings2} title="The rest of the map" tone="muted">
          The <Term>sidebar</Term> opens full workspaces. The <Term>dock</Term> opens connected tools and external apps.
          <Term> Settings</Term> controls behavior; your profile controls personal defaults.
        </InfoCard>
      </div>
    ),
  },
  {
    id: "capture",
    navLabel: "Capture",
    icon: Inbox,
    title: "Get it out of your head",
    subtitle: "Capture now. Decide where it belongs later.",
    body: () => (
      <div className="space-y-4">
        <ol className="grid gap-3">
          <NumberedStep n={1}>
            Type any rough thought into <Term>Capture</Term>: “email Mom,” a deadline, a project idea, a link, or a
            progress note. Rough wording is fine.
          </NumberedStep>
          <NumberedStep n={2}>
            It lands in the <Term>Capture Queue</Term> immediately. Nothing is silently filed or lost.
          </NumberedStep>
          <NumberedStep n={3}>
            Open the item or use <Term>Sweep all</Term>. Horizon suggests a calendar item, note, project, research
            record, file action, or clarification.
          </NumberedStep>
          <NumberedStep n={4}>
            Approve the useful action. The real vault file is created only after you approve it, and applied actions
            keep an undo.
          </NumberedStep>
        </ol>
        <InfoCard icon={Sparkles} title="A good capture says what happened and what should happen next">
          Example: <span className="italic text-slate-200">“Horizon onboarding: project flow is drafted; next, test it
          with a first-time user.”</span> That gives triage enough context to attach the note to the right project.
        </InfoCard>
      </div>
    ),
  },
  {
    id: "projects",
    navLabel: "Projects",
    icon: FolderKanban,
    title: "Turn a goal into visible work",
    subtitle: "Projects hold context. Spotlight chooses the one in front of you.",
    body: () => (
      <div className="space-y-4">
        <ol className="grid gap-3">
          <NumberedStep n={1}>
            <Term>Create or collect the project.</Term> Capture “Create a project for…” and approve the proposal during
            triage. Horizon saves it locally; once the project has a real folder/location, its registry note makes it active here.
          </NumberedStep>
          <NumberedStep n={2}>
            Open <Term>Projects</Term> from the sidebar. Each row shows status, description, its registry note, and any
            known workspace location.
          </NumberedStep>
          <NumberedStep n={3}>
            Choose <Term>Spotlight this</Term>. The project moves to Home so its reason, next action, and primary button
            stay visible while you work.
          </NumberedStep>
          <NumberedStep n={4}>
            Make the next action concrete enough to finish in one session: “draft the outline,” not “work on report.”
          </NumberedStep>
        </ol>
        <InfoCard icon={FolderKanban} title="Project, Spotlight, and Focus are different" tone="amber">
          <Term>Projects</Term> stores the directory. <Term>Spotlight</Term> supplies context. <Term>Focus</Term> supplies
          protected time. Spotlighting a project does not automatically finish tasks or log time.
        </InfoCard>
      </div>
    ),
  },
  {
    id: "focus",
    navLabel: "Focus",
    icon: Timer,
    title: "Work one project in one focus cycle",
    subtitle: "Choose the action first. Start the timer second.",
    body: () => (
      <div className="space-y-4">
        <ol className="grid gap-3">
          <NumberedStep n={1}>
            Read the project&apos;s <Term>Next</Term> action in Spotlight and remove anything you will not need.
          </NumberedStep>
          <NumberedStep n={2}>
            Pick <Term>25 / 5</Term> for a small, uncertain, or administrative task. Pick <Term>45 / 15</Term> for a
            deeper deliverable. Use the gear for a custom pair.
          </NumberedStep>
          <NumberedStep n={3}>
            Press the project&apos;s session button when it offers one, or press Play in <Term>Focus</Term>. The timer
            keeps running while you move around Horizon.
          </NumberedStep>
          <NumberedStep n={4}>
            Work only the named next action. Pause for a real interruption; Reset starts the current preset over.
          </NumberedStep>
          <NumberedStep n={5}>
            At the bell, take the break. Then mark a dated item done or capture a short update: what finished, what is
            blocked, and the next action.
          </NumberedStep>
        </ol>
        <InfoCard icon={Play} title="The timer protects attention; it does not manage the project for you" tone="amber">
          Focus sessions are not yet logged against projects and they do not auto-complete tasks. Your 30-second review
          after each session is what keeps the project trustworthy.
        </InfoCard>
      </div>
    ),
  },
  {
    id: "first-day",
    navLabel: "First day",
    icon: Rocket,
    title: "Your first day with Horizon",
    subtitle: "Use this simple rhythm until it becomes automatic.",
    body: ({ vaultPath }) => (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <InfoCard icon={Home} title="Start">
            Check Today. Choose or confirm one Spotlight project. Name one next action.
          </InfoCard>
          <InfoCard icon={Timer} title="Work">
            Run a Focus session. Capture interruptions instead of switching tasks.
          </InfoCard>
          <InfoCard icon={Check} title="Close">
            Review the result, record the next action, and sweep the Capture Queue.
          </InfoCard>
        </div>
        <InfoCard icon={FolderOpen} title="Your Horizon workspace is ready" tone="muted">
          <p>
            Horizon is reading your workspace in place at:
          </p>
          <PathChip value={vaultPath || "your Horizon workspace folder"} />
          <p className="mt-2">
            There is nothing else to install or import. Open this folder as an Obsidian vault whenever you want direct
            access to the Markdown files. Obsidian and Obsidian Sync are optional. Set up any connections you want under
            <Term>Settings → Integrations</Term>.
          </p>
          <p className="mt-2">
            If you ever move the folder, use <Term>Settings → Data & Storage → Change workspace</Term>. Horizon
            validates the replacement and restarts every screen against the same root.
          </p>
        </InfoCard>
        <div className="flex items-start gap-3 rounded-xl border border-[rgba(var(--accent-rgb),0.22)] bg-[rgba(var(--accent-rgb),0.07)] p-3.5">
          <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--accent-rgb))]" />
          <p className="text-[13px] leading-relaxed text-slate-300">
            The complete manual lives in <Term>Settings → Advanced → How to use Horizon</Term>. It includes the full
            project-and-focus playbook and an honest list of what Horizon does not automate yet.
          </p>
        </div>
      </div>
    ),
  },
];

export function FirstRunWizard({ onClose }: FirstRunWizardProps) {
  const [index, setIndex] = useState(0);
  const [vaultPath, setVaultPath] = useState("");
  const [isClosing, setIsClosing] = useState(false);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const step = steps[index];
  const StepIcon = step.icon;
  const isLast = index === steps.length - 1;

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/health")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data?.vaultPath) setVaultPath(String(data.vaultPath));
      })
      .catch(() => {
        // Browser preview without the local server still has a readable fallback.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function closeAndRemember() {
    markFirstRunComplete();
    setIsClosing(true);
    window.setTimeout(onClose, MOTION_TIMING.overlayExitMs);
  }

  function requestSkip() {
    setConfirmSkip(true);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (confirmSkip) {
        setConfirmSkip(false);
        return;
      }
      requestSkip();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmSkip]);

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center">
      <button
        aria-label="Close getting started"
        className={"absolute inset-0 cursor-default bg-black/55 backdrop-blur-md transition-opacity " + (isClosing ? "opacity-0" : "opacity-100")}
        onClick={requestSkip}
        type="button"
      />

      <section
        aria-label="Getting started"
        aria-modal="true"
        className={
          "first-run-wizard relative flex h-[680px] max-h-[calc(100vh-48px)] w-[820px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-[22px] border border-[rgba(var(--accent-rgb),0.26)] bg-[#071321]/98 shadow-[0_30px_110px_rgba(0,0,0,0.58)] backdrop-blur-xl " +
          (isClosing ? "first-run-wizard-closing" : "")
        }
        role="dialog"
      >
        <header className="flex flex-none items-center gap-3 border-b border-white/8 px-6 py-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-[rgba(var(--accent-rgb),0.2)] bg-[rgba(var(--accent-rgb),0.08)] text-[rgb(var(--accent-rgb))]">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-white">Getting Started</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-400">How Horizon works</div>
          </div>
          <button
            className="rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2 text-xs text-slate-400 transition hover:border-white/15 hover:text-slate-100"
            onClick={requestSkip}
            type="button"
          >
            Skip tutorial
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[200px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-r border-white/8 bg-black/10 p-3">
            <div className="px-2 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              {index + 1} of {steps.length}
            </div>
            <nav className="grid gap-1.5" aria-label="Tutorial steps">
              {steps.map((item, stepIndex) => {
                const Icon = item.icon;
                const active = stepIndex === index;
                const visited = stepIndex < index;
                return (
                  <button
                    aria-current={active ? "step" : undefined}
                    aria-label={"Go to step " + (stepIndex + 1) + ": " + item.navLabel}
                    className={
                      "flex min-h-11 items-center gap-3 rounded-xl border px-3 text-left text-xs transition " +
                      (active
                        ? "border-[rgba(var(--accent-rgb),0.3)] bg-[rgba(var(--accent-rgb),0.11)] text-white"
                        : "border-transparent text-slate-400 hover:border-white/8 hover:bg-white/[0.025] hover:text-slate-100")
                    }
                    key={item.id}
                    onClick={() => {
                      setIndex(stepIndex);
                      setConfirmSkip(false);
                    }}
                    type="button"
                  >
                    <span
                      className={
                        "grid h-7 w-7 shrink-0 place-items-center rounded-lg border " +
                        (active
                          ? "border-[rgba(var(--accent-rgb),0.28)] bg-[rgba(var(--accent-rgb),0.1)] text-[rgb(var(--accent-rgb))]"
                          : visited
                            ? "border-emerald-300/18 bg-emerald-300/[0.06] text-emerald-300"
                            : "border-white/8 bg-white/[0.02] text-slate-500")
                      }
                    >
                      {visited ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                    </span>
                    <span>{item.navLabel}</span>
                  </button>
                );
              })}
            </nav>
            <p className="mt-auto px-2 pb-1 text-[10px] leading-relaxed text-slate-500">
              Replay this any time from Settings → Advanced.
            </p>
          </aside>

          <main className="min-h-0 overflow-y-auto [scrollbar-gutter:stable]">
            <div className="first-run-wizard-body px-7 py-6" key={step.id}>
              <div className="mb-5 flex items-start gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/9 bg-white/[0.035] text-[rgb(var(--accent-rgb))]">
                  <StepIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold text-white">{step.title}</h2>
                  <p className="mt-1 text-sm text-slate-400">{step.subtitle}</p>
                </div>
              </div>
              <div className="text-[14px] leading-relaxed text-slate-300">{step.body({ vaultPath })}</div>
            </div>
          </main>
        </div>

        <footer className="flex flex-none items-center justify-between gap-4 border-t border-white/8 px-5 py-4">
          <div className="text-xs text-slate-400">
            {isLast ? "Ready when you are." : "Use the step list to jump around at any time."}
          </div>
          <div className="flex items-center gap-2">
            {index > 0 ? (
              <button
                className="flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.035] px-3 text-sm text-slate-200 transition hover:border-white/20 hover:bg-white/[0.06]"
                onClick={() => setIndex((current) => Math.max(0, current - 1))}
                type="button"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            ) : null}
            <button
              className="flex h-9 items-center gap-1.5 rounded-lg border border-[rgba(var(--accent-rgb),0.4)] bg-[rgba(var(--accent-rgb),0.16)] px-4 text-sm font-medium text-white transition hover:bg-[rgba(var(--accent-rgb),0.24)]"
              onClick={() => (isLast ? closeAndRemember() : setIndex((current) => Math.min(steps.length - 1, current + 1)))}
              type="button"
            >
              {isLast ? (
                <>
                  <Check className="h-4 w-4" />
                  Finish tutorial
                </>
              ) : (
                <>
                  Next
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </footer>

        {confirmSkip ? (
          <div className="absolute inset-0 z-30 grid place-items-center bg-[#050c15]/86 p-6 backdrop-blur-md">
            <div className="w-[420px] max-w-full rounded-2xl border border-white/12 bg-[#0a1726] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-amber-300/20 bg-amber-300/[0.07] text-amber-200">
                  <X className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-white">Skip the tutorial?</h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
                    Horizon will remember that you skipped it. You can replay the full walkthrough later from
                    Settings → Advanced.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  className="h-9 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm text-slate-200 transition hover:bg-white/[0.06]"
                  onClick={() => setConfirmSkip(false)}
                  type="button"
                >
                  Keep learning
                </button>
                <button
                  className="h-9 rounded-lg border border-amber-300/24 bg-amber-300/[0.08] px-3 text-sm text-amber-100 transition hover:bg-amber-300/[0.13]"
                  onClick={closeAndRemember}
                  type="button"
                >
                  Skip for now
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
