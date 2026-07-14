# Connect apps and services

Horizon works immediately without any integrations. Open **Settings > Integrations** only for services you actually use.

## Obsidian

No account or API key is required. The workspace Horizon creates is already an Obsidian-compatible vault.

1. Install [Obsidian](https://obsidian.md/download) if you want to edit the same notes there.
2. In Obsidian, choose **Open folder as vault** and select the `Horizon Vault` folder from Documents.
3. If you already have an Obsidian vault, choose **Use an existing vault** when Horizon first opens. Horizon asks before adding any missing starter files and never replaces an existing note.

## Research

Research is built in and reads the workspace's `Research Papers` folder. It needs no login or key.

## Zotero

The recommended connection is keyless.

1. Install and open [Zotero Desktop](https://www.zotero.org/download/).
2. In Horizon, open **Settings > Integrations > Zotero**.
3. Choose **Connect Zotero Desktop**.
4. If Horizon says access is off, open **Zotero > Edit > Settings > Advanced**, enable **Allow other applications on this computer to communicate with Zotero**, and retry.

This connection is read-only and works while Zotero is open. To read the cloud library while Zotero is closed or use an approved **Add to Zotero** action, expand **Optional cloud and write access**, follow the direct [Create New Key](https://www.zotero.org/settings/keys/new) link, and create a dedicated key named `Horizon`. Under **Personal Library**, enable **Allow library access**. Enable **Allow write access** only if you want approved **Add to Zotero** actions. Paste the key into Horizon and choose **Connect optional cloud key**; Horizon discovers the User ID automatically.

## Google Drive

When a publisher Google connection is available, setup is a normal browser login:

1. Open **Settings > Integrations > Google Drive**.
2. Choose **Connect Google**.
3. Approve access on Google's page and return to Horizon. The connection stays on this PC until it is disconnected or revoked.

If Horizon says Google sign-in is unavailable, you did not miss a step. The public preview does not ask normal users to create a Google Cloud developer app. **Open Google Drive** still opens the signed-in browser experience. Existing access can be reviewed at [Google Account connections](https://myaccount.google.com/connections).

## Microsoft

Microsoft is currently a launcher, not an in-Horizon data sync.

1. Open **Settings > Integrations > Microsoft**.
2. Choose **Open Outlook** or **Open OneDrive**.
3. Horizon opens the installed app when it can and otherwise opens Microsoft's official web version. Sign in there normally.

Horizon never asks for a Microsoft password. Calendar and OneDrive data do not appear inside Horizon in this release.

## Codex

Codex keeps its own secure login.

1. Install the [Codex app for Windows](https://get.microsoft.com/installer/download/9PLM9XGG6VKS?cid=website_cta_psi) and sign in there.
2. In **Settings > Integrations > Codex**, choose **Open Codex**.
3. Select your Horizon workspace as the Codex workspace when you want Codex to work with it.

Horizon does not copy Codex passwords, sessions, or API keys.

## OpenAI-powered Capture help

OpenAI's public API uses an API key; a ChatGPT subscription does not include API billing.

1. Open the [OpenAI API Keys](https://platform.openai.com/api-keys) page and create a key named `Horizon`.
2. If this is your first API use, add [API billing](https://platform.openai.com/settings/organization/billing/overview).
3. In **Settings > Integrations > AI Agent**, paste the key and choose **Connect OpenAI**.
4. Horizon loads the text models available to the key, then sends only `Reply OK.` as a tiny Responses API test (up to 16 output tokens). This verifies the exact permission Capture uses instead of showing a misleading connected badge.

For the easiest setup, leave key permissions at **All**. A restricted key must allow model listing and Responses requests.

Connecting the key does not turn on cloud parsing. To opt in, open **Settings > Privacy** and enable **OpenAI-assisted capture parsing**. When enabled, Horizon sends OpenAI the complete capture text, the current date and time zone, and relative names of project, research paper, and research idea notes so it can suggest connections. It does not send note contents or the workspace's filesystem path. Leave the setting off to use deterministic local rules only.

## Saved connections

The installed Windows app encrypts saved tokens and API keys using a Horizon key protected by Windows. Secrets are not written into the workspace, source code, or installer. Redacted connection status may be stored in the workspace.

**Disconnect on this PC** removes Horizon's local copy. To revoke access everywhere, also use the provider's account-connections or API-key page.
