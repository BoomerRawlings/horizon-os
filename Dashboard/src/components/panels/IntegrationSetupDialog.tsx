import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Check, Database, ExternalLink, FolderOpen, KeyRound, LogOut, Plug, RefreshCw, ShieldCheck, Sparkles, X } from "lucide-react";
import { dockItems } from "../../data/dockItems";
import { integrationIconSrcFor } from "../../data/integrationIcons";
import type { IntegrationConnection } from "../../types";
import { BrandMark } from "../ui/BrandMark";
import { CapabilityBadge } from "../ui/CapabilityBadge";

type SetupDraft = {
  accountEmail: string;
  bridgePath: string;
  clientId: string;
  model: string;
  provider: string;
  scopes: string;
  sourcePath: string;
  tenantId: string;
  tokenOrKey: string;
  vaultPath: string;
  zoteroApiKey: string;
  zoteroUserId: string;
  zoteroUsername: string;
};

type SaveResult = {
  connection: IntegrationConnection;
  message: string;
};

type IntegrationSetupDialogProps = {
  accountEmail: string;
  connection: IntegrationConnection;
  onClose: () => void;
  onSave: (result: SaveResult) => void;
};

type BackendSettings = Partial<SetupDraft> & {
  credentialPath?: string;
  googleOAuthAvailable?: boolean;
  oauthTokens?: {
    accessTokenSaved?: boolean;
    expiryDate?: number;
    refreshTokenSaved?: boolean;
  };
  redirectUri?: string;
  tokenOrKeySaved?: boolean;
  tokenOrKeyTail?: string;
  workspacePath?: string;
  zoteroApiKeySaved?: boolean;
  zoteroApiKeyTail?: string;
  zoteroLocal?: {
    enabled?: boolean;
    lastCheckedAt?: string;
    lastMessage?: string;
    state?: string;
    verifiedAt?: string | null;
  };
};

type AiModelOption = {
  created?: number;
  id: string;
  label?: string;
  owned_by?: string;
  source?: string;
};

const fallbackVaultPath = "your Horizon vault";
const defaultAiModel = "gpt-5.4-mini";
const officialSetupLinks = {
  codexAppGuide: "https://learn.chatgpt.com/docs/windows/windows-app",
  codexWindowsDownload: "https://get.microsoft.com/installer/download/9PLM9XGG6VKS?cid=website_cta_psi",
  googleConnections: "https://myaccount.google.com/connections",
  googleDrive: "https://drive.google.com",
  microsoft365: "https://www.microsoft365.com/",
  microsoftOneDrive: "https://onedrive.live.com/",
  microsoftOutlook: "https://outlook.office.com/",
  obsidianDownload: "https://obsidian.md/download",
  obsidianSyncSetup: "https://help.obsidian.md/sync/setup",
  openAiBilling: "https://platform.openai.com/settings/organization/billing/overview",
  openAiKeys: "https://platform.openai.com/api-keys",
  openAiKeyPermissions: "https://help.openai.com/en/articles/8867743-assign-api-key-permissions",
  openAiKeySafety: "https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety",
  zoteroKeys: "https://www.zotero.org/settings/keys",
  zoteroNewKey: "https://www.zotero.org/settings/keys/new",
  zoteroDownload: "https://www.zotero.org/download/",
};
const defaultAiModelOptions: AiModelOption[] = [
  { id: "gpt-5.4-mini", label: "GPT-5.4 mini", source: "recommended" },
  { id: "gpt-5.4", label: "GPT-5.4", source: "default" },
  { id: "gpt-5.5", label: "GPT-5.5", source: "default" },
  { id: "gpt-5-mini", label: "GPT-5 mini", source: "default" },
  { id: "gpt-5", label: "GPT-5", source: "default" },
];

function aiModelFallbackLabel(id: string) {
  return id.replace(/^gpt-([^-]+)-?/i, "GPT_$1 ").trim().replace(/-/g, " ").replace(/^GPT_/, "GPT-");
}

function mergeCurrentAiModel(options: AiModelOption[], currentModel: string) {
  const byId = new Map<string, AiModelOption>();
  for (const option of options.length ? options : defaultAiModelOptions) {
    if (option.id) byId.set(option.id, option);
  }
  const current = currentModel.trim() || defaultAiModel;
  if (!byId.has(current)) byId.set(current, { id: current, label: aiModelFallbackLabel(current), source: "selected" });
  return [...byId.values()];
}

function aiModelOptionLabel(option: AiModelOption) {
  const sourceLabel =
    option.source === "recommended"
      ? "recommended"
      : option.source === "api"
        ? "available"
        : option.source === "selected"
          ? "selected"
          : "";
  return `${option.label || aiModelFallbackLabel(option.id)}${sourceLabel ? ` - ${sourceLabel}` : ""}`;
}

function savedSecretHelper(tail?: string) {
  return tail ? `Saved key ending ${tail}` : "Saved key is stored";
}

function savedSecretPlaceholder(tail?: string) {
  return tail ? `********${tail}` : "********";
}

function initialDraft(connection: IntegrationConnection, accountEmail: string): SetupDraft {
  return {
    accountEmail: connection.accountLabel ?? accountEmail,
    bridgePath: fallbackVaultPath,
    clientId: "",
    model: connection.id === "ai-agent" ? defaultAiModel : "",
    provider: connection.id === "ai-agent" ? "OpenAI" : "",
    scopes:
      connection.id === "google-drive"
        ? "drive.metadata.readonly"
        : connection.id === "microsoft"
          ? "Calendars.ReadWrite, Files.ReadWrite"
          : "",
    sourcePath: connection.id === "research" ? `${fallbackVaultPath}\\Research Papers` : "",
    tenantId: connection.id === "microsoft" ? "common" : "",
    tokenOrKey: "",
    vaultPath: connection.id === "obsidian" ? connection.detailLabel?.replace(/^Ready: |^Needs initialization: /, "") ?? fallbackVaultPath : "",
    zoteroApiKey: "",
    zoteroUserId: "",
    zoteroUsername: "",
  };
}

function settingsFromDraft(connectionId: string, draft: SetupDraft) {
  if (connectionId === "obsidian") {
    return { vaultPath: draft.vaultPath.trim() };
  }
  if (connectionId === "codex") {
    return { workspacePath: draft.bridgePath.trim() };
  }
  if (connectionId === "microsoft") {
    return {
      accountEmail: draft.accountEmail.trim(),
      clientId: draft.clientId.trim(),
      scopes: draft.scopes.trim(),
      tenantId: draft.tenantId.trim() || "common",
    };
  }
  if (connectionId === "google-drive") {
    return {
      accountEmail: draft.accountEmail.trim(),
      clientId: draft.clientId.trim(),
      scopes: draft.scopes.trim(),
    };
  }
  if (connectionId === "research") {
    return { sourcePath: draft.sourcePath.trim() };
  }
  if (connectionId === "zotero") {
    return {
      zoteroApiKey: draft.zoteroApiKey.trim(),
      zoteroUserId: draft.zoteroUserId.trim(),
      zoteroUsername: draft.zoteroUsername.trim(),
    };
  }
  return {
    model: draft.model.trim() || defaultAiModel,
    provider: draft.provider.trim() || "OpenAI",
    tokenOrKey: draft.tokenOrKey.trim(),
  };
}

function Field({
  autoFocus = false,
  disabled = false,
  helper,
  label,
  onChange,
  placeholder,
  type = "text",
  value,
}: {
  autoFocus?: boolean;
  disabled?: boolean;
  helper?: string;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "password" | "text";
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <input
        autoFocus={autoFocus}
        className="h-10 w-full rounded-lg border border-white/10 bg-slate-950/45 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-[rgba(var(--accent-rgb),0.55)] focus:bg-slate-950/60 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
      {helper ? <span className="mt-1.5 block text-xs leading-relaxed text-slate-500">{helper}</span> : null}
    </label>
  );
}

function SelectField({
  disabled = false,
  helper,
  label,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
  helper?: string;
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <select
        className="h-10 w-full rounded-lg border border-white/10 bg-slate-950/65 px-3 text-sm text-slate-100 outline-none transition focus:border-[rgba(var(--accent-rgb),0.55)] focus:bg-slate-950/75 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option className="bg-slate-950 text-slate-100" key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {helper ? <span className="mt-1.5 block text-xs leading-relaxed text-slate-500">{helper}</span> : null}
    </label>
  );
}

function OfficialLink({ children, href }: { children: ReactNode; href: string }) {
  return (
    <a
      className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-[rgba(var(--accent-rgb),0.3)] bg-[rgba(var(--accent-rgb),0.1)] px-3 py-2 text-xs font-medium text-sky-100 transition hover:border-[rgba(var(--accent-rgb),0.5)] hover:bg-[rgba(var(--accent-rgb),0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--accent-rgb),0.6)]"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {children}
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

function SetupStep({ children, number }: { children: ReactNode; number: number }) {
  return (
    <li className="flex gap-2.5">
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-white/12 bg-white/[0.05] text-[10px] font-semibold text-slate-200">
        {number}
      </span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}

function Instructions({ connectionId, googleLoginAvailable }: { connectionId: string; googleLoginAvailable: boolean }) {
  if (connectionId === "obsidian") {
    return (
      <>
        <div className="font-medium text-slate-200">Use a different workspace or Obsidian vault</div>
        <ol className="mt-3 grid gap-2.5">
          <SetupStep number={1}>If the folder uses Obsidian Sync, let Sync finish first. Obsidian is otherwise optional.</SetupStep>
          <SetupStep number={2}>Choose <strong className="text-slate-200">Choose different workspace</strong>, then select the top-level folder containing your notes.</SetupStep>
          <SetupStep number={3}>Horizon checks the folder, offers to add only missing starter files when needed, and restarts with it. Existing notes are never replaced.</SetupStep>
        </ol>
        <div className="mt-3 flex flex-wrap gap-2">
          <OfficialLink href={officialSetupLinks.obsidianDownload}>Download Obsidian</OfficialLink>
          <OfficialLink href={officialSetupLinks.obsidianSyncSetup}>Obsidian Sync instructions</OfficialLink>
        </div>
      </>
    );
  }

  if (connectionId === "zotero") {
    return (
      <>
        <div className="flex items-center gap-2 font-medium text-slate-200"><Sparkles className="h-4 w-4 text-amber-200" /> No key needed for Zotero Desktop</div>
        <ol className="mt-3 grid gap-2.5">
          <SetupStep number={1}>Install and open Zotero Desktop. Wait until the library window is visible.</SetupStep>
          <SetupStep number={2}>Choose <strong className="text-slate-200">Connect Zotero Desktop</strong>. Horizon reads the official local, read-only library API without an API key.</SetupStep>
          <SetupStep number={3}>If Zotero blocks it, open <strong className="text-slate-200">Edit &gt; Settings &gt; Advanced</strong>, enable <strong className="text-slate-200">Allow other applications on this computer to communicate with Zotero</strong>, then retry.</SetupStep>
        </ol>
        <p className="mt-3 text-slate-500">This fills Research Desk while Zotero is running. A cloud key is optional and is needed only for cloud reads while Zotero is closed or explicitly approved Add to Zotero writes.</p>
        <p className="mt-2 text-slate-500">For the optional key, name it <strong className="text-slate-300">Horizon</strong>. Under <strong className="text-slate-300">Personal Library</strong>, enable <strong className="text-slate-300">Allow library access</strong>. Enable <strong className="text-slate-300">Allow write access</strong> only if you want approved Add to Zotero actions.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <OfficialLink href={officialSetupLinks.zoteroDownload}>Download Zotero</OfficialLink>
          <OfficialLink href={officialSetupLinks.zoteroNewKey}>Optional cloud key</OfficialLink>
          <OfficialLink href={officialSetupLinks.zoteroKeys}>Manage or revoke keys</OfficialLink>
        </div>
        <p className="mt-3 border-t border-white/8 pt-3 text-slate-500">A true browser-only “Connect Zotero” flow is possible after Horizon's publisher OAuth registration. Individual users will not be asked to register an app.</p>
      </>
    );
  }

  if (connectionId === "google-drive") {
    return (
      <>
        <div className="font-medium text-slate-200">Connect Google Drive</div>
        {googleLoginAvailable ? (
          <ol className="mt-3 grid gap-2.5">
            <SetupStep number={1}>Choose <strong className="text-slate-200">Connect Google</strong>. Horizon opens Google's real sign-in page in your browser.</SetupStep>
            <SetupStep number={2}>Choose the Google account and approve Drive access. Never type your Google password into Horizon.</SetupStep>
            <SetupStep number={3}>Return to Horizon. It detects approval automatically and keeps this PC connected until you disconnect or Google revokes access.</SetupStep>
          </ol>
        ) : (
          <p className="mt-2 text-amber-100/85">This copy is missing Horizon's publisher Google sign-in configuration. You did not miss a step, and you should not create a Google Cloud developer app. Google Drive still opens normally in your browser.</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <OfficialLink href={officialSetupLinks.googleDrive}>Open Google Drive</OfficialLink>
          <OfficialLink href={officialSetupLinks.googleConnections}>Review Google connections</OfficialLink>
        </div>
      </>
    );
  }

  if (connectionId === "microsoft") {
    return (
      <>
        <div className="font-medium text-slate-200">Use Microsoft apps</div>
        <ol className="mt-3 grid gap-2.5">
          <SetupStep number={1}>Choose Outlook or OneDrive above. Horizon opens the installed app when available and otherwise opens Microsoft's official web version.</SetupStep>
          <SetupStep number={2}>Sign in on Microsoft's page. Your app or browser keeps that session; Horizon never sees your password.</SetupStep>
          <SetupStep number={3}>Use the Microsoft dock menu to reopen Word, Excel, PowerPoint, Outlook, OneNote, or OneDrive.</SetupStep>
        </ol>
        <p className="mt-3 text-amber-100/85">This is a launcher, not Microsoft account syncing. Calendar and file data do not appear inside Horizon yet.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <OfficialLink href={officialSetupLinks.microsoft365}>Open Microsoft 365</OfficialLink>
          <OfficialLink href={officialSetupLinks.microsoftOutlook}>Outlook on the web</OfficialLink>
          <OfficialLink href={officialSetupLinks.microsoftOneDrive}>OneDrive on the web</OfficialLink>
        </div>
      </>
    );
  }

  if (connectionId === "research") {
    return (
      <>
        <div className="font-medium text-slate-200">Research is already local</div>
        <ol className="mt-3 grid gap-2.5">
          <SetupStep number={1}>Horizon reads paper notes from this workspace's <strong className="text-slate-200">Research Papers</strong> folder. No account or API key is required.</SetupStep>
          <SetupStep number={2}>Use <strong className="text-slate-200">Research</strong> in the sidebar to browse papers and ideas.</SetupStep>
          <SetupStep number={3}>Connect Zotero separately only if you want Zotero library metadata or approved Add to Zotero actions.</SetupStep>
        </ol>
      </>
    );
  }

  if (connectionId === "codex") {
    return (
      <>
        <div className="font-medium text-slate-200">Open Codex from Horizon</div>
        <ol className="mt-3 grid gap-2.5">
          <SetupStep number={1}>Install the Codex desktop app and sign in there with your OpenAI account.</SetupStep>
          <SetupStep number={2}>Choose <strong className="text-slate-200">Open Codex</strong>. Horizon focuses it if it is already running.</SetupStep>
          <SetupStep number={3}>Open this Horizon vault as the workspace inside Codex. Horizon does not share passwords, sessions, or API keys with Codex.</SetupStep>
        </ol>
        <div className="mt-3 flex flex-wrap gap-2">
          <OfficialLink href={officialSetupLinks.codexWindowsDownload}>Install Codex for Windows</OfficialLink>
          <OfficialLink href={officialSetupLinks.codexAppGuide}>Codex app instructions</OfficialLink>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 font-medium text-slate-200"><Sparkles className="h-4 w-4 text-sky-200" /> Connect OpenAI in three steps</div>
      <ol className="mt-3 grid gap-2.5">
        <SetupStep number={1}>Open the API Keys page. If this is your first API use, also add API billing.</SetupStep>
        <SetupStep number={2}>Name it <strong className="text-slate-200">Horizon</strong> and leave Permissions set to <strong className="text-slate-200">All</strong> for the simplest setup. A Restricted key must allow model listing and Responses requests.</SetupStep>
        <SetupStep number={3}>Copy the key, paste it above, and choose <strong className="text-slate-200">Connect OpenAI</strong>. Horizon loads visible text models and sends only <strong className="text-slate-200">Reply OK.</strong> as a tiny Responses test (up to 16 output tokens) so it cannot falsely claim Capture access works.</SetupStep>
      </ol>
      <p className="mt-3 text-amber-100/85">ChatGPT subscriptions and OpenAI API billing are separate. OpenAI's public API currently uses API credentials rather than a third-party “Sign in with ChatGPT” button.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <OfficialLink href={officialSetupLinks.openAiKeys}>Create OpenAI key</OfficialLink>
        <OfficialLink href={officialSetupLinks.openAiBilling}>Set up API billing</OfficialLink>
        <OfficialLink href={officialSetupLinks.openAiKeyPermissions}>Key permissions</OfficialLink>
        <OfficialLink href={officialSetupLinks.openAiKeySafety}>Key safety</OfficialLink>
      </div>
    </>
  );
}

function mergeBackendSettings(draft: SetupDraft, settings: BackendSettings): SetupDraft {
  return {
    ...draft,
    accountEmail: settings.accountEmail ?? draft.accountEmail,
    bridgePath: settings.workspacePath ?? settings.bridgePath ?? draft.bridgePath,
    clientId: settings.clientId ?? draft.clientId,
    model: settings.model || draft.model,
    provider: settings.provider || draft.provider,
    scopes: settings.scopes ?? draft.scopes,
    sourcePath: settings.sourcePath ?? draft.sourcePath,
    tenantId: settings.tenantId ?? draft.tenantId,
    tokenOrKey: "",
    vaultPath: settings.vaultPath ?? draft.vaultPath,
    zoteroApiKey: "",
    zoteroUserId: settings.zoteroUserId ?? draft.zoteroUserId,
    zoteroUsername: settings.zoteroUsername ?? draft.zoteroUsername,
  };
}

export function IntegrationSetupDialog({ accountEmail, connection, onClose, onSave }: IntegrationSetupDialogProps) {
  const [draft, setDraftState] = useState(() => initialDraft(connection, accountEmail));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [connectingZoteroDesktop, setConnectingZoteroDesktop] = useState(false);
  const [googleLoginAvailable, setGoogleLoginAvailable] = useState(false);
  const [googleTokensSaved, setGoogleTokensSaved] = useState(false);
  const [zoteroDesktopConnected, setZoteroDesktopConnected] = useState(false);
  const [launchingActionId, setLaunchingActionId] = useState<string | null>(null);
  const [refreshingModels, setRefreshingModels] = useState(false);
  const [message, setMessage] = useState("Loading saved settings...");
  const [secretHint, setSecretHint] = useState("");
  const [secretPlaceholder, setSecretPlaceholder] = useState("");
  const [aiModelOptions, setAiModelOptions] = useState(() => defaultAiModelOptions);
  const oauthPollRef = useRef<number | null>(null);
  const dockItem = dockItems.find((item) => item.id === connection.id);
  const iconSrc = integrationIconSrcFor(connection.id) ?? dockItem?.iconSrc;

  useEffect(() => {
    let cancelled = false;
    const nextDraft = initialDraft(connection, accountEmail);
    setDraftState(nextDraft);
    setAiModelOptions(defaultAiModelOptions);
    setLoading(true);
    setMessage("Loading saved settings...");
    setSecretHint("");
    setSecretPlaceholder("");
    setGoogleLoginAvailable(false);
    setGoogleTokensSaved(false);
    setZoteroDesktopConnected(false);

    async function loadSettings() {
      try {
        const response = await fetch(`/api/integrations/${encodeURIComponent(connection.id)}/settings`);
        const data = (await response.json()) as { connection?: IntegrationConnection; settings?: BackendSettings };
        if (!response.ok) throw new Error("Settings could not be loaded.");
        if (cancelled) return;
        if (data.settings) {
          const merged = mergeBackendSettings(nextDraft, data.settings);
          setDraftState(merged);
          if (connection.id === "ai-agent") setAiModelOptions(mergeCurrentAiModel(defaultAiModelOptions, merged.model));
          if (data.settings.zoteroApiKeySaved) {
            setSecretHint(savedSecretHelper(data.settings.zoteroApiKeyTail));
            setSecretPlaceholder(savedSecretPlaceholder(data.settings.zoteroApiKeyTail));
          }
          if (data.settings.tokenOrKeySaved) {
            setSecretHint(savedSecretHelper(data.settings.tokenOrKeyTail));
            setSecretPlaceholder(savedSecretPlaceholder(data.settings.tokenOrKeyTail));
          }
          setGoogleLoginAvailable(Boolean(data.settings.googleOAuthAvailable || data.settings.clientId));
          setGoogleTokensSaved(Boolean(data.settings.oauthTokens?.accessTokenSaved || data.settings.oauthTokens?.refreshTokenSaved));
          setZoteroDesktopConnected(Boolean(data.settings.zoteroLocal?.enabled && data.settings.zoteroLocal?.verifiedAt));
        }
        if (data.connection) onSave({ connection: data.connection, message: `${data.connection.label} settings loaded.` });
        setMessage("Saved settings loaded.");
      } catch {
        if (!cancelled) setMessage("Using local setup. The desktop bridge did not return saved settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, [accountEmail, connection.id]);

  useEffect(() => {
    return () => {
      if (oauthPollRef.current !== null) {
        window.clearTimeout(oauthPollRef.current);
      }
    };
  }, []);

  function setDraft(patch: Partial<SetupDraft>) {
    setDraftState((current) => ({ ...current, ...patch }));
  }

  async function persistSettings(quiet = false) {
    setSaving(true);
    if (!quiet) setMessage("Saving settings...");
    try {
      const response = await fetch(`/api/integrations/${encodeURIComponent(connection.id)}/settings`, {
        body: JSON.stringify({ settings: settingsFromDraft(connection.id, draft) }),
        headers: { "content-type": "application/json" },
        method: "PUT",
      });
      const data = (await response.json()) as { connection?: IntegrationConnection; message?: string; settings?: BackendSettings };
      if (!response.ok || !data.connection) throw new Error(data.message || "Save failed.");
      if (data.settings?.zoteroApiKeySaved) {
        setSecretHint(savedSecretHelper(data.settings.zoteroApiKeyTail));
        setSecretPlaceholder(savedSecretPlaceholder(data.settings.zoteroApiKeyTail));
      }
      if (data.settings?.tokenOrKeySaved) {
        setSecretHint(savedSecretHelper(data.settings.tokenOrKeyTail));
        setSecretPlaceholder(savedSecretPlaceholder(data.settings.tokenOrKeyTail));
      }
      if (data.settings) {
        setGoogleLoginAvailable(Boolean(data.settings.googleOAuthAvailable || data.settings.clientId));
        setGoogleTokensSaved(Boolean(data.settings.oauthTokens?.accessTokenSaved || data.settings.oauthTokens?.refreshTokenSaved));
        setZoteroDesktopConnected(Boolean(data.settings.zoteroLocal?.enabled && data.settings.zoteroLocal?.verifiedAt));
      }
      onSave({ connection: data.connection, message: data.message ?? `${data.connection.label} settings saved.` });
      if (!quiet) setMessage(data.message ?? "Settings saved.");
      return true;
    } catch (error) {
      if (!quiet) setMessage(error instanceof Error ? error.message : "Settings could not be saved.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    const saved = await persistSettings(true);
    if (!saved) return;
    setTesting(true);
    setMessage("Testing connection...");
    try {
      const response = await fetch(`/api/integrations/${encodeURIComponent(connection.id)}/test`, {
        body: JSON.stringify({ settings: settingsFromDraft(connection.id, draft) }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as { connection?: IntegrationConnection; message?: string; ok?: boolean; settings?: BackendSettings };
      if (data.settings) {
        setDraftState((current) => mergeBackendSettings(current, data.settings ?? {}));
        if (data.settings.zoteroApiKeySaved) {
          setSecretHint(savedSecretHelper(data.settings.zoteroApiKeyTail));
          setSecretPlaceholder(savedSecretPlaceholder(data.settings.zoteroApiKeyTail));
        }
        if (data.settings.tokenOrKeySaved) {
          setSecretHint(savedSecretHelper(data.settings.tokenOrKeyTail));
          setSecretPlaceholder(savedSecretPlaceholder(data.settings.tokenOrKeyTail));
        }
        setGoogleLoginAvailable(Boolean(data.settings.googleOAuthAvailable || data.settings.clientId));
        setGoogleTokensSaved(Boolean(data.settings.oauthTokens?.accessTokenSaved || data.settings.oauthTokens?.refreshTokenSaved));
        setZoteroDesktopConnected(Boolean(data.settings.zoteroLocal?.enabled && data.settings.zoteroLocal?.verifiedAt));
      }
      if (data.connection) onSave({ connection: data.connection, message: data.message ?? "Connection test finished." });
      setMessage(data.message ?? (response.ok ? "Connection test passed." : "Connection test failed."));
    } catch {
      setMessage("Connection test could not run from this session.");
    } finally {
      setTesting(false);
    }
  }

  async function disconnectCurrentIntegration() {
    setDisconnecting(true);
    setMessage(`Disconnecting ${connection.label} on this PC...`);
    try {
      const response = await fetch(`/api/integrations/${encodeURIComponent(connection.id)}/disconnect`, {
        body: "{}",
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as { connection?: IntegrationConnection; message?: string; settings?: BackendSettings };
      if (!response.ok || !data.connection) throw new Error(data.message || "Disconnect failed.");
      setSecretHint("");
      setSecretPlaceholder("");
      setGoogleTokensSaved(false);
      setZoteroDesktopConnected(false);
      setDraftState((current) => mergeBackendSettings({
        ...current,
        tokenOrKey: "",
        zoteroApiKey: "",
        zoteroUserId: "",
        zoteroUsername: "",
      }, data.settings ?? {}));
      onSave({ connection: data.connection, message: data.message ?? `${connection.label} disconnected.` });
      setMessage(data.message ?? `${connection.label} disconnected on this PC.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${connection.label} could not be disconnected.`);
    } finally {
      setDisconnecting(false);
    }
  }

  async function connectZoteroDesktop() {
    setConnectingZoteroDesktop(true);
    setMessage("Looking for the open Zotero Desktop app...");
    try {
      const response = await fetch("/api/integrations/zotero/local/connect", {
        body: "{}",
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as { connection?: IntegrationConnection; message?: string; settings?: BackendSettings };
      if (data.settings) setZoteroDesktopConnected(Boolean(data.settings.zoteroLocal?.enabled && data.settings.zoteroLocal?.verifiedAt));
      if (data.connection) onSave({ connection: data.connection, message: data.message ?? "Zotero Desktop check finished." });
      setMessage(data.message ?? (response.ok ? "Zotero Desktop connected." : "Zotero Desktop could not be connected."));
    } catch {
      setMessage("Horizon could not check Zotero Desktop. Make sure Zotero is open, then try again.");
    } finally {
      setConnectingZoteroDesktop(false);
    }
  }

  async function runLaunchAction(actionId: string, label: string) {
    setLaunchingActionId(actionId);
    setMessage(`Opening ${label}...`);
    try {
      const response = await fetch("/api/launch", {
        body: JSON.stringify({ actionId }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as { message?: string };
      setMessage(data.message ?? (response.ok ? `Opening ${label}...` : `${label} could not be opened.`));
    } catch {
      setMessage(`${label} could not be opened from this session.`);
    } finally {
      setLaunchingActionId(null);
    }
  }

  async function refreshAiModels() {
    const saved = await persistSettings(true);
    if (!saved) {
      setMessage("Settings could not be saved before refreshing models.");
      return;
    }
    setRefreshingModels(true);
    setMessage("Checking OpenAI models and Capture access...");
    try {
      const response = await fetch("/api/integrations/ai-agent/models", {
        body: JSON.stringify({ settings: settingsFromDraft("ai-agent", draft) }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as {
        connection?: IntegrationConnection;
        message?: string;
        models?: AiModelOption[];
        selectedModel?: string;
      };
      const nextModel = data.selectedModel ?? draft.model;
      if (data.models?.length) setAiModelOptions(mergeCurrentAiModel(data.models, nextModel));
      if (data.selectedModel) setDraft({ model: data.selectedModel });
      if (data.connection) onSave({ connection: data.connection, message: data.message ?? "Model list refreshed." });
      setMessage(data.message ?? (response.ok ? "Model list refreshed." : "Model refresh failed."));
    } catch {
      setMessage("Model refresh could not run from this session.");
    } finally {
      setRefreshingModels(false);
    }
  }

  async function refreshBackendSettings(statusMessage?: string) {
    try {
      const response = await fetch(`/api/integrations/${encodeURIComponent(connection.id)}/settings`, { cache: "no-store" });
      const data = (await response.json()) as { connection?: IntegrationConnection; settings?: BackendSettings };
      if (!response.ok) throw new Error("Settings could not be refreshed.");
      if (data.settings) {
        setDraftState((current) => mergeBackendSettings(current, data.settings ?? {}));
        setGoogleLoginAvailable(Boolean(data.settings.googleOAuthAvailable || data.settings.clientId));
        setGoogleTokensSaved(Boolean(data.settings.oauthTokens?.accessTokenSaved || data.settings.oauthTokens?.refreshTokenSaved));
        setZoteroDesktopConnected(Boolean(data.settings.zoteroLocal?.enabled && data.settings.zoteroLocal?.verifiedAt));
      }
      if (data.connection) onSave({ connection: data.connection, message: statusMessage ?? `${data.connection.label} settings refreshed.` });
      return data.connection ?? null;
    } catch {
      return null;
    }
  }

  function pollGoogleAuthorization(startedAt = Date.now()) {
    if (oauthPollRef.current !== null) window.clearTimeout(oauthPollRef.current);
    oauthPollRef.current = window.setTimeout(async () => {
      const updatedConnection = await refreshBackendSettings("Google Drive connection updated.");
      if (updatedConnection?.status === "connected") {
        setAuthorizing(false);
        setMessage("Google Drive connected. You can close this setup window.");
        oauthPollRef.current = null;
        return;
      }
      if (Date.now() - startedAt > 2 * 60_000) {
        setAuthorizing(false);
        setMessage("Still waiting for Google authorization. If the browser flow finished, close and reopen this setup window.");
        oauthPollRef.current = null;
        return;
      }
      pollGoogleAuthorization(startedAt);
    }, 2000);
  }

  async function runGoogleOAuth() {
    const saved = await persistSettings(true);
    if (!saved) return;
    setAuthorizing(true);
    setMessage("Opening Google sign-in in your browser...");
    try {
      const response = await fetch("/api/integrations/google-drive/oauth/start", {
        body: JSON.stringify({ settings: settingsFromDraft("google-drive", draft) }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as { authUrl?: string; connection?: IntegrationConnection; message?: string };
      if (!response.ok) throw new Error(data.message || "Google sign-in could not start.");
      if (data.connection) onSave({ connection: data.connection, message: data.message ?? "Google sign-in opened." });
      setMessage(data.message ?? "Google sign-in opened. Approve access in your browser.");
      pollGoogleAuthorization();
    } catch (error) {
      setAuthorizing(false);
      setMessage(error instanceof Error ? error.message : "Google sign-in could not start.");
    }
  }

  async function runObsidianAction(action: "validate" | "initialize" | "rebuild-indexes" | "open") {
    const saved = await persistSettings(true);
    if (!saved) return;
    setTesting(true);
    const label =
      action === "validate"
        ? "Validating vault..."
        : action === "initialize"
          ? "Initializing Horizon structure..."
          : action === "rebuild-indexes"
            ? "Rebuilding indexes..."
            : "Opening workspace folder...";
    setMessage(label);
    try {
      const response = await fetch(`/api/integrations/obsidian/${action}`, {
        body: action === "open" ? undefined : JSON.stringify({ settings: settingsFromDraft("obsidian", draft) }),
        headers: action === "open" ? undefined : { "content-type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as { connection?: IntegrationConnection; message?: string };
      if (data.connection) onSave({ connection: data.connection, message: data.message ?? "Obsidian action finished." });
      setMessage(data.message ?? (response.ok ? "Obsidian action finished." : "Obsidian action failed."));
    } catch {
      setMessage("Obsidian action could not run from this session.");
    } finally {
      setTesting(false);
    }
  }

  async function chooseObsidianVault() {
    if (!window.horizonDesktop) {
      setMessage("Vault selection is available from the installed Horizon desktop app.");
      return;
    }
    setTesting(true);
    setMessage("Choose the top-level Horizon workspace or Obsidian vault folder...");
    try {
      const result = await window.horizonDesktop.chooseVault();
      if (result.canceled) {
        setMessage("Workspace selection canceled. The current workspace is unchanged.");
      } else if (result.restarting) {
        setMessage(`Connected ${result.vaultPath}. Horizon is restarting...`);
      } else {
        setDraft({ vaultPath: result.vaultPath });
        setMessage("This workspace is already active on this machine.");
      }
    } catch {
      setMessage("Horizon could not open the workspace picker.");
    } finally {
      setTesting(false);
    }
  }

  const fields = useMemo(() => {
    if (connection.id === "obsidian") {
      return (
        <div className="grid gap-3">
          <Field
            disabled
            helper="Stored only on this machine. Changing it restarts Horizon so every workspace moves together."
            label="Active workspace"
            onChange={() => undefined}
            placeholder={fallbackVaultPath}
            value={draft.vaultPath}
          />
          <ActionButton disabled={loading || saving || testing} icon={<FolderOpen className="h-4 w-4" />} label="Choose different workspace" onClick={() => void chooseObsidianVault()} />
          <details className="rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2 text-xs text-slate-400">
            <summary className="cursor-pointer py-1 font-medium text-slate-300">Maintenance and troubleshooting</summary>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <ActionButton disabled={loading || saving || testing} icon={<ShieldCheck className="h-4 w-4" />} label="Validate Vault" onClick={() => void runObsidianAction("validate")} />
              <ActionButton disabled={loading || saving || testing} icon={<Database className="h-4 w-4" />} label="Initialize Structure" onClick={() => void runObsidianAction("initialize")} />
              <ActionButton disabled={loading || saving || testing} icon={<RefreshCw className="h-4 w-4" />} label="Rebuild Indexes" onClick={() => void runObsidianAction("rebuild-indexes")} />
              <ActionButton disabled={loading || saving || testing} icon={<FolderOpen className="h-4 w-4" />} label="Open Folder" onClick={() => void runObsidianAction("open")} />
            </div>
          </details>
        </div>
      );
    }

    if (connection.id === "codex") {
      return (
        <div className="grid gap-3">
          <ActionButton
            disabled={loading || launchingActionId === "codex.open"}
            icon={<ExternalLink className="h-4 w-4" />}
            label={launchingActionId === "codex.open" ? "Opening Codex..." : "Open Codex"}
            onClick={() => void runLaunchAction("codex.open", "Codex")}
          />
          <details className="rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2 text-xs text-slate-400">
            <summary className="cursor-pointer py-1 font-medium text-slate-300">Advanced workspace label</summary>
            <div className="mt-3">
              <Field disabled={loading || saving} label="Workspace path" onChange={(bridgePath) => setDraft({ bridgePath })} placeholder={fallbackVaultPath} value={draft.bridgePath} />
            </div>
          </details>
        </div>
      );
    }

    if (connection.id === "microsoft") {
      return (
        <div className="grid gap-3">
          <div className="rounded-xl border border-amber-300/18 bg-amber-300/[0.055] px-3 py-3 text-xs leading-relaxed text-amber-100/90">
            Microsoft is a launcher in this build. Horizon can open the installed apps or their official web versions, but it does not sync Microsoft account data yet.
          </div>
          <div className="grid grid-cols-2 gap-2">
            <ActionButton disabled={loading || launchingActionId === "microsoft.outlook"} icon={<ExternalLink className="h-4 w-4" />} label="Open Outlook" onClick={() => void runLaunchAction("microsoft.outlook", "Outlook")} />
            <ActionButton disabled={loading || launchingActionId === "microsoft.onedrive"} icon={<FolderOpen className="h-4 w-4" />} label="Open OneDrive" onClick={() => void runLaunchAction("microsoft.onedrive", "OneDrive")} />
          </div>
        </div>
      );
    }

    if (connection.id === "google-drive") {
      return (
        <div className="grid gap-3">
          <div className={`rounded-xl border px-3 py-3 text-xs leading-relaxed ${connection.status === "connected" ? "border-emerald-300/18 bg-emerald-300/[0.05] text-emerald-100/90" : "border-amber-300/18 bg-amber-300/[0.055] text-amber-100/90"}`}>
            {connection.status === "connected"
              ? `Connected${connection.accountLabel ? ` as ${connection.accountLabel}` : ""}. Horizon keeps a refreshable Google sign-in on this PC.`
              : googleLoginAvailable
                ? "Google browser sign-in is ready. Horizon never asks for or stores your Google password."
                : "Google sign-in is not included in this copy. You did not miss a setup step, and regular users should not create a Google Cloud app."}
          </div>
          <ActionButton
            disabled={loading || saving || testing || authorizing || !googleLoginAvailable}
            icon={<ExternalLink className="h-4 w-4" />}
            label={authorizing ? "Waiting for Google..." : connection.status === "connected" || connection.status === "needs_reauth" ? "Reconnect Google" : googleLoginAvailable ? "Connect Google" : "Google sign-in unavailable"}
            onClick={() => void runGoogleOAuth()}
          />
          <ActionButton disabled={loading || launchingActionId === "google.drive"} icon={<ExternalLink className="h-4 w-4" />} label="Open Google Drive" onClick={() => void runLaunchAction("google.drive", "Google Drive")} />
        </div>
      );
    }

    if (connection.id === "research") {
      return (
        <div className="grid gap-3">
          <div className="rounded-xl border border-emerald-300/18 bg-emerald-300/[0.05] px-3 py-3 text-xs leading-relaxed text-emerald-100/90">
            Ready. Research uses this workspace's Research Papers folder; no separate account or setup is required.
          </div>
          <ActionButton disabled={loading || launchingActionId === "research.notes"} icon={<FolderOpen className="h-4 w-4" />} label="Open Research Folder" onClick={() => void runLaunchAction("research.notes", "Research folder")} />
        </div>
      );
    }

    if (connection.id === "zotero") {
      return (
        <div className="grid gap-3">
          <div className={`rounded-xl border px-3 py-3 text-xs leading-relaxed ${zoteroDesktopConnected ? "border-emerald-300/18 bg-emerald-300/[0.05] text-emerald-100/90" : "border-white/8 bg-white/[0.025] text-slate-300"}`}>
            {zoteroDesktopConnected
              ? "Zotero Desktop is connected for local, read-only library access. Keep Zotero open when refreshing Research Desk."
              : "Fastest setup: open Zotero Desktop, then connect it here. No User ID or API key is required."}
          </div>
          <ActionButton
            disabled={loading || saving || testing || connectingZoteroDesktop}
            icon={<ShieldCheck className="h-4 w-4" />}
            label={connectingZoteroDesktop ? "Looking for Zotero..." : zoteroDesktopConnected ? "Check Zotero Desktop Again" : "Connect Zotero Desktop"}
            onClick={() => void connectZoteroDesktop()}
          />
          {draft.zoteroUsername || draft.zoteroUserId ? (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-300/18 bg-emerald-300/[0.05] px-3 py-3">
              <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-200" />
              <span>
                <span className="block text-xs font-medium text-emerald-100">Detected Zotero account</span>
                <span className="mt-0.5 block text-xs text-slate-400">{draft.zoteroUsername || `User ${draft.zoteroUserId}`}</span>
              </span>
            </div>
          ) : null}
          <details className="rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2 text-xs text-slate-400" open={Boolean(secretHint)}>
            <summary className="cursor-pointer py-1 font-medium text-slate-300">Optional cloud and write access</summary>
            <div className="mt-3">
              <Field
                disabled={loading || saving || testing}
                helper={secretHint || "Optional: paste a dedicated Horizon key with Personal Library access. Write access is needed only for approved Add to Zotero actions. Horizon detects the User ID for you."}
                label="Optional Zotero cloud key"
                onChange={(zoteroApiKey) => setDraft({ zoteroApiKey })}
                placeholder={secretPlaceholder || undefined}
                type="password"
                value={draft.zoteroApiKey}
              />
            </div>
          </details>
        </div>
      );
    }

    return (
      <div className="grid gap-3">
        <Field
          autoFocus
          disabled={loading || saving || refreshingModels}
          helper={secretHint || "Create a separate key for Horizon. It is masked after save, stored in Horizon app data on this PC, and can be revoked from OpenAI anytime."}
          label="OpenAI API key"
          onChange={(tokenOrKey) => setDraft({ tokenOrKey })}
          placeholder={secretPlaceholder || undefined}
          type="password"
          value={draft.tokenOrKey}
        />
        <details className="rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2 text-xs text-slate-400">
          <summary className="cursor-pointer py-1 font-medium text-slate-300">Advanced model choice</summary>
          <div className="mt-3 grid gap-3">
            <SelectField
              disabled={loading || saving || refreshingModels}
              helper="Connect OpenAI refreshes this list and keeps your selected supported model."
              label="Model"
              onChange={(model) => setDraft({ model })}
              options={mergeCurrentAiModel(aiModelOptions, draft.model).map((option) => ({
                label: aiModelOptionLabel(option),
                value: option.id,
              }))}
              value={draft.model || defaultAiModel}
            />
          </div>
        </details>
      </div>
    );
  }, [aiModelOptions, authorizing, connectingZoteroDesktop, connection.accountLabel, connection.id, connection.status, draft, googleLoginAvailable, launchingActionId, loading, refreshingModels, saving, secretHint, secretPlaceholder, testing, zoteroDesktopConnected]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (connection.id === "zotero") {
      void handleTest();
      return;
    }
    if (connection.id === "ai-agent") {
      void refreshAiModels();
      return;
    }
    void persistSettings(false);
  }

  const isSecretConnection = connection.id === "zotero" || connection.id === "ai-agent";
  const isBusy = loading || saving || testing || authorizing || refreshingModels || disconnecting || connectingZoteroDesktop || Boolean(launchingActionId);
  const canDisconnect = (connection.id === "zotero" && (Boolean(secretHint) || zoteroDesktopConnected))
    || (connection.id === "ai-agent" && Boolean(secretHint))
    || (connection.id === "google-drive" && googleTokensSaved);
  const showTest = connection.id === "codex" || connection.id === "google-drive";
  const showSubmit = connection.id === "ai-agent" || connection.id === "codex" || (connection.id === "zotero" && Boolean(draft.zoteroApiKey.trim() || secretHint));
  const connectLabel = connection.id === "zotero"
    ? testing ? "Checking cloud key..." : "Connect optional cloud key"
    : connection.id === "ai-agent"
      ? refreshingModels ? "Connecting OpenAI..." : "Connect OpenAI"
      : saving ? "Saving..." : "Save workspace";

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/35 px-4 py-5 sm:px-6">
      <form
        aria-labelledby="integration-setup-title"
        aria-modal="true"
        className="max-h-[calc(100dvh-2.5rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-[rgba(var(--accent-rgb),0.28)] bg-slate-950/92 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl [scrollbar-gutter:stable]"
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          if (!isBusy) onClose();
        }}
        onSubmit={handleSubmit}
        role="dialog"
      >
        <div className="mb-5 flex items-start gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl border border-white/10 bg-white/[0.04]">
            {iconSrc ? <BrandMark brand={dockItem?.brand} className="h-7 w-7" iconSrc={iconSrc} label={connection.label} /> : null}
            {!iconSrc ? <KeyRound className="h-6 w-6 text-sky-300" strokeWidth={1.8} /> : null}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Plug className="h-4 w-4 text-[rgb(var(--accent-rgb))]" />
              <h3 className="text-base font-semibold text-white" id="integration-setup-title">{connection.label} Setup</h3>
              <CapabilityBadge connection={connection} />
            </div>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">{connection.permissionSummary}</p>
            {connection.capability === "launcher" ? (
              <p className="mt-1 text-xs leading-relaxed text-sky-300/80">
                This is a launcher: Horizon opens the local app or website. In-app data browsing is not available.
              </p>
            ) : null}
          </div>
          <button
            aria-label="Close integration setup"
            className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.035] text-slate-300 transition hover:border-white/20 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-45"
            disabled={isBusy}
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-3">{fields}</div>

        <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.025] px-3 py-3 text-xs leading-relaxed text-slate-400">
          <Instructions connectionId={connection.id} googleLoginAvailable={googleLoginAvailable} />
        </div>

        <div className="sticky bottom-0 z-10 -mx-5 -mb-5 mt-5 grid gap-3 border-t border-white/8 bg-slate-950/95 px-5 pb-5 pt-4 shadow-[0_-14px_30px_rgba(2,6,23,0.72)] backdrop-blur-xl">
          <div className="rounded-xl border border-[rgba(var(--accent-rgb),0.18)] bg-[rgba(var(--accent-rgb),0.06)] px-3 py-2 text-xs leading-relaxed text-slate-200">
            {message}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
            <button
              className="h-9 rounded-lg border border-white/10 bg-white/[0.035] px-4 text-sm text-slate-300 transition hover:border-white/20 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-45"
              disabled={isBusy}
              onClick={onClose}
              type="button"
            >
              Close
            </button>
            {canDisconnect ? (
              <button
                className="flex h-9 items-center gap-2 rounded-lg border border-rose-300/15 bg-rose-300/[0.045] px-3 text-xs text-rose-100/85 transition hover:border-rose-300/28 hover:bg-rose-300/[0.08] disabled:cursor-not-allowed disabled:opacity-45"
                disabled={isBusy}
                onClick={() => void disconnectCurrentIntegration()}
                type="button"
              >
                <LogOut className="h-3.5 w-3.5" />
                {disconnecting ? "Disconnecting..." : "Disconnect on this PC"}
              </button>
            ) : null}
            </div>
            <div className="flex items-center gap-2">
            {showTest ? (
              <button
                className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm text-slate-200 transition enabled:hover:border-[rgba(var(--accent-rgb),0.32)] enabled:hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-45"
                disabled={isBusy}
                onClick={handleTest}
                type="button"
              >
                <ShieldCheck className="h-4 w-4" />
                {testing ? "Checking..." : connection.id === "google-drive" ? "Check connection" : "Check folder"}
              </button>
            ) : null}
            {showSubmit ? (
            <button
              className="flex h-9 items-center gap-2 rounded-lg border border-[rgba(var(--accent-rgb),0.45)] bg-[rgba(var(--accent-rgb),0.18)] px-4 text-sm font-medium text-white transition enabled:hover:bg-[rgba(var(--accent-rgb),0.26)] disabled:cursor-not-allowed disabled:opacity-45"
              disabled={isBusy}
              type="submit"
            >
              {isSecretConnection ? <ShieldCheck className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              {connectLabel}
            </button>
            ) : null}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

function ActionButton({
  disabled,
  icon,
  label,
  onClick,
}: {
  disabled: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 text-xs text-slate-200 transition enabled:hover:border-[rgba(var(--accent-rgb),0.32)] enabled:hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-45"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}
