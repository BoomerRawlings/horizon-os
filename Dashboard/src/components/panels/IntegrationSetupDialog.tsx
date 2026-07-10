import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Check, Database, ExternalLink, FolderOpen, KeyRound, Plug, RefreshCw, ShieldCheck, X } from "lucide-react";
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
const defaultAiModelOptions: AiModelOption[] = [
  { id: "gpt-5.4-mini", label: "GPT-5.4 mini", source: "recommended" },
  { id: "gpt-5.4", label: "GPT-5.4", source: "default" },
  { id: "gpt-5.5-mini", label: "GPT-5.5 mini", source: "default" },
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
        ? "calendar, drive.metadata.readonly"
        : connection.id === "microsoft"
          ? "Calendars.ReadWrite, Files.ReadWrite"
          : "",
    sourcePath: connection.id === "research" ? `${fallbackVaultPath}\\Research Papers` : "",
    tenantId: connection.id === "microsoft" ? "common" : "",
    tokenOrKey: "",
    vaultPath: connection.id === "obsidian" ? connection.detailLabel?.replace(/^Ready: |^Needs initialization: /, "") ?? fallbackVaultPath : "",
    zoteroApiKey: "",
    zoteroUserId: "",
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

function Instructions({ connectionId }: { connectionId: string }) {
  if (connectionId === "obsidian") {
    return (
      <>
        <div className="font-medium text-slate-200">How to connect Obsidian</div>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>Enter the folder path for the vault Horizon should use.</li>
          <li>Validate the vault path before writing anything.</li>
          <li>Initialize Horizon structure only when you want indexes and manifests created.</li>
          <li>Rebuild indexes after larger note moves or imports.</li>
        </ol>
      </>
    );
  }

  if (connectionId === "zotero") {
    return (
      <>
        <div className="font-medium text-slate-200">How to connect Zotero</div>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>Use Zotero's API settings page to find your numeric User ID.</li>
          <li>Create or copy a Zotero API key with library read access.</li>
          <li>Paste the User ID and key here, save, then test the connection.</li>
          <li>Horizon stores the key locally for the desktop bridge and never shows it after save.</li>
        </ol>
        <div className="mt-2 text-amber-100/85">TODO: verify these setup steps against Zotero's current official docs before enabling automatic sync.</div>
      </>
    );
  }

  if (connectionId === "microsoft" || connectionId === "google-drive") {
    const service = connectionId === "microsoft" ? "Microsoft" : "Google";
    return (
      <>
        <div className="font-medium text-slate-200">How to connect {service}</div>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>Enter the account email you want Horizon to label this connector with.</li>
          <li>Add the OAuth client details created for Horizon OS.</li>
          <li>{connectionId === "google-drive" ? "Use Connect Google to approve access in your browser." : "Save the configuration, then use Test to confirm the local config exists."}</li>
          <li>{connectionId === "google-drive" ? "Horizon stores tokens locally and mirrors only redacted status into Obsidian." : "Live sign-in and token refresh still need the next desktop bridge pass."}</li>
        </ol>
      </>
    );
  }

  if (connectionId === "research") {
    return (
      <>
        <div className="font-medium text-slate-200">How to connect Research</div>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>Choose a local folder that stores PDFs, notes, or research exports.</li>
          <li>Use the separate Zotero card for Zotero credentials.</li>
          <li>Future research indexing will write compact metadata into Obsidian manifests.</li>
        </ol>
      </>
    );
  }

  if (connectionId === "codex") {
    return (
      <>
        <div className="font-medium text-slate-200">How to connect Codex</div>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>Point Horizon at the workspace folder Codex should understand.</li>
          <li>Save and test that the folder is reachable.</li>
          <li>Capture-to-Codex routing will use this workspace in a later workflow pass.</li>
        </ol>
      </>
    );
  }

  return (
    <>
      <div className="font-medium text-slate-200">How to connect AI Agent</div>
      <ol className="mt-2 list-decimal space-y-1 pl-4">
        <li>Choose OpenAI and the model Horizon should use for Capture triage.</li>
        <li>Paste an API key only if you want the local desktop bridge to remember it.</li>
        <li>Use Refresh models to ask OpenAI which model IDs this saved key can access.</li>
      </ol>
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
  };
}

export function IntegrationSetupDialog({ accountEmail, connection, onClose, onSave }: IntegrationSetupDialogProps) {
  const [draft, setDraftState] = useState(() => initialDraft(connection, accountEmail));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
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
      const data = (await response.json()) as { connection?: IntegrationConnection; message?: string };
      if (data.connection) onSave({ connection: data.connection, message: data.message ?? "Connection test finished." });
      setMessage(data.message ?? (response.ok ? "Connection test passed." : "Connection test failed."));
    } catch {
      setMessage("Connection test could not run from this session.");
    } finally {
      setTesting(false);
    }
  }

  async function refreshAiModels() {
    const saved = await persistSettings(true);
    if (!saved) {
      setMessage("Settings could not be saved before refreshing models.");
      return;
    }
    setRefreshingModels(true);
    setMessage("Refreshing available OpenAI models...");
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
      if (data.settings) setDraftState((current) => mergeBackendSettings(current, data.settings ?? {}));
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
            : "Opening vault folder...";
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

  const fields = useMemo(() => {
    if (connection.id === "obsidian") {
      return (
        <div className="grid gap-3">
          <Field
            autoFocus
            disabled={loading || saving}
            label="Vault path"
            onChange={(vaultPath) => setDraft({ vaultPath })}
            placeholder={fallbackVaultPath}
            value={draft.vaultPath}
          />
          <div className="grid grid-cols-2 gap-2">
            <ActionButton disabled={loading || saving || testing} icon={<ShieldCheck className="h-4 w-4" />} label="Validate Vault" onClick={() => void runObsidianAction("validate")} />
            <ActionButton disabled={loading || saving || testing} icon={<Database className="h-4 w-4" />} label="Initialize Structure" onClick={() => void runObsidianAction("initialize")} />
            <ActionButton disabled={loading || saving || testing} icon={<RefreshCw className="h-4 w-4" />} label="Rebuild Indexes" onClick={() => void runObsidianAction("rebuild-indexes")} />
            <ActionButton disabled={loading || saving || testing} icon={<FolderOpen className="h-4 w-4" />} label="Open Folder" onClick={() => void runObsidianAction("open")} />
          </div>
        </div>
      );
    }

    if (connection.id === "codex") {
      return (
        <Field
          autoFocus
          disabled={loading || saving}
          label="Workspace path"
          onChange={(bridgePath) => setDraft({ bridgePath })}
          placeholder={fallbackVaultPath}
          value={draft.bridgePath}
        />
      );
    }

    if (connection.id === "microsoft") {
      return (
        <div className="grid gap-3">
          <Field autoFocus disabled={loading || saving} label="Account email" onChange={(accountEmail) => setDraft({ accountEmail })} value={draft.accountEmail} />
          <Field disabled={loading || saving} label="Tenant ID" onChange={(tenantId) => setDraft({ tenantId })} placeholder="common or tenant GUID" value={draft.tenantId} />
          <Field disabled={loading || saving} label="OAuth client ID" onChange={(clientId) => setDraft({ clientId })} value={draft.clientId} />
          <Field disabled={loading || saving} label="Scopes" onChange={(scopes) => setDraft({ scopes })} value={draft.scopes} />
        </div>
      );
    }

    if (connection.id === "google-drive") {
      return (
        <div className="grid gap-3">
          <Field autoFocus disabled={loading || saving} label="Google account" onChange={(accountEmail) => setDraft({ accountEmail })} value={draft.accountEmail} />
          <Field disabled={loading || saving} label="OAuth client ID" onChange={(clientId) => setDraft({ clientId })} value={draft.clientId} />
          <Field disabled={loading || saving} label="Scopes" onChange={(scopes) => setDraft({ scopes })} value={draft.scopes} />
          <ActionButton
            disabled={loading || saving || testing || authorizing}
            icon={<ExternalLink className="h-4 w-4" />}
            label={authorizing ? "Waiting for Google..." : "Connect Google"}
            onClick={() => void runGoogleOAuth()}
          />
        </div>
      );
    }

    if (connection.id === "research") {
      return <Field autoFocus disabled={loading || saving} label="Research folder" onChange={(sourcePath) => setDraft({ sourcePath })} value={draft.sourcePath} />;
    }

    if (connection.id === "zotero") {
      return (
        <div className="grid gap-3">
          <Field autoFocus disabled={loading || saving} label="Zotero User ID" onChange={(zoteroUserId) => setDraft({ zoteroUserId })} value={draft.zoteroUserId} />
          <Field
            disabled={loading || saving}
            helper={secretHint || "The key is hidden after save. Leave blank to keep a saved key."}
            label="Zotero API key"
            onChange={(zoteroApiKey) => setDraft({ zoteroApiKey })}
            placeholder={secretPlaceholder || undefined}
            type="password"
            value={draft.zoteroApiKey}
          />
        </div>
      );
    }

    return (
      <div className="grid gap-3">
        <SelectField
          disabled={loading || saving || refreshingModels}
          label="Provider"
          onChange={(provider) => setDraft({ provider })}
          options={[{ label: "OpenAI", value: "OpenAI" }]}
          value={draft.provider || "OpenAI"}
        />
        <SelectField
          disabled={loading || saving || refreshingModels}
          helper="Refresh uses the saved API key and only returns model IDs, never the key."
          label="Model"
          onChange={(model) => setDraft({ model })}
          options={mergeCurrentAiModel(aiModelOptions, draft.model).map((option) => ({
            label: aiModelOptionLabel(option),
            value: option.id,
          }))}
          value={draft.model || defaultAiModel}
        />
        <ActionButton
          disabled={loading || saving || testing || refreshingModels}
          icon={<RefreshCw className={`h-4 w-4 ${refreshingModels ? "animate-spin" : ""}`} />}
          label={refreshingModels ? "Refreshing models..." : "Refresh models"}
          onClick={() => void refreshAiModels()}
        />
        <Field
          disabled={loading || saving}
          helper={secretHint || "The key is hidden after save. Leave blank to keep a saved key."}
          label="API key"
          onChange={(tokenOrKey) => setDraft({ tokenOrKey })}
          placeholder={secretPlaceholder || undefined}
          type="password"
          value={draft.tokenOrKey}
        />
      </div>
    );
  }, [aiModelOptions, authorizing, connection.id, draft, loading, refreshingModels, saving, secretHint, secretPlaceholder, testing]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void persistSettings(false);
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/35 px-6">
      <form
        className="w-full max-w-xl rounded-2xl border border-[rgba(var(--accent-rgb),0.28)] bg-slate-950/92 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl"
        onSubmit={handleSubmit}
      >
        <div className="mb-5 flex items-start gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl border border-white/10 bg-white/[0.04]">
            {iconSrc ? <BrandMark brand={dockItem?.brand} className="h-7 w-7" iconSrc={iconSrc} label={connection.label} /> : null}
            {!iconSrc ? <KeyRound className="h-6 w-6 text-sky-300" strokeWidth={1.8} /> : null}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Plug className="h-4 w-4 text-[rgb(var(--accent-rgb))]" />
              <h3 className="text-base font-semibold text-white">{connection.label} Setup</h3>
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
            className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.035] text-slate-300 transition hover:border-white/20 hover:bg-white/[0.06]"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-3">{fields}</div>

        <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.025] px-3 py-3 text-xs leading-relaxed text-slate-400">
          <Instructions connectionId={connection.id} />
        </div>

        <div className="mt-4 rounded-xl border border-[rgba(var(--accent-rgb),0.18)] bg-[rgba(var(--accent-rgb),0.06)] px-3 py-2 text-xs leading-relaxed text-slate-200">
          {message}
        </div>

        <div className="mt-5 flex items-center justify-between gap-2 border-t border-white/8 pt-4">
          <button
            className="h-9 rounded-lg border border-white/10 bg-white/[0.035] px-4 text-sm text-slate-300 transition hover:border-white/20 hover:bg-white/[0.06]"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
          <div className="flex items-center gap-2">
            <button
              className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm text-slate-200 transition enabled:hover:border-[rgba(var(--accent-rgb),0.32)] enabled:hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-45"
              disabled={loading || saving || testing || authorizing}
              onClick={handleTest}
              type="button"
            >
              <ShieldCheck className="h-4 w-4" />
              {testing ? "Testing..." : "Test"}
            </button>
            <button
              className="flex h-9 items-center gap-2 rounded-lg border border-[rgba(var(--accent-rgb),0.45)] bg-[rgba(var(--accent-rgb),0.18)] px-4 text-sm font-medium text-white transition enabled:hover:bg-[rgba(var(--accent-rgb),0.26)] disabled:cursor-not-allowed disabled:opacity-45"
              disabled={loading || saving || testing || authorizing}
              type="submit"
            >
              <Check className="h-4 w-4" />
              {saving ? "Saving..." : "Save setup"}
            </button>
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
