# User-Facing Flow Test

## Objective

Confirm that a nontechnical Windows user can install Horizon 0.3.0, create a ready workspace, understand first-run guidance, and understand the setup or supported fallback for every advertised integration without needing repository knowledge or obscure credentials.

## Test Environment

- Windows desktop using an isolated, generic first-run profile and starter workspace.
- Native Horizon 0.3.0 release candidate for installation and first-run validation.
- Final production UI build served through Horizon's local-only server for the integration and responsive-layout checks.
- Tall 1706 x 1433 and half-window 1050 x 850 browser viewports.

## Starting Assumptions

- The tester has no Horizon workspace selected and no saved integration credentials.
- The tester follows only the labels and instructions visible in the installer and application.
- Optional services may remain disconnected; Horizon must still work locally.

## Steps Taken

1. Ran the single `Horizon-Setup.exe` installer and launched Horizon.
2. Chose **Create my workspace** rather than locating an existing Obsidian vault.
3. Confirmed that the starter workspace and Obsidian-compatible structure were created automatically.
4. Completed and dismissed the six-step **Getting Started** walkthrough.
5. Opened **Settings > Integrations** and reviewed all seven integration cards.
6. Opened the Zotero setup and confirmed the recommended keyless Desktop flow, direct official links, and explicit optional cloud-key permissions.
7. Opened the AI Agent setup and confirmed the three numbered OpenAI API steps, billing distinction, validation disclosure, and official links.
8. Reviewed Obsidian, Codex, Microsoft, Google Drive, and Research guidance for honest login, launcher, or local-only behavior.
9. Repeated the integration layout check in tall and half-window viewports and measured for horizontal overflow.
10. Ran the public privacy scan to check for personal paths, credentials, or private-vault content.

## What Worked

- The one-file installer launched first-run setup without requiring GitHub, Git, Node.js, a terminal, or a source ZIP.
- **Create my workspace** generated a usable local workspace in one action and opened the guided first-run experience.
- All seven code-defined integrations were present: Obsidian, Codex, Microsoft, Google Drive, Research, Zotero, and AI Agent.
- Obsidian and Research required no account or API key.
- Zotero setup presents a one-button, keyless, read-only Desktop connection when Zotero is installed. The optional key path names the exact Personal Library permissions and supports automatic User ID discovery after the key is entered.
- Codex and Microsoft used the sessions in their own installed apps or official websites rather than collecting passwords.
- Google Drive clearly stated when publisher sign-in was unavailable and did not ask users to create a Google Cloud developer app.
- AI Agent setup explained that ChatGPT and API billing are separate, linked directly to the required official pages, and disclosed the small validation request.
- The integration list had no horizontal overflow at either tested size.
- The privacy scan passed with no personal paths, credentials, or private workspace data.

## What Felt Intuitive

- Each card stated whether it was connected, local, a launcher, or still needed setup.
- Primary buttons used task language such as **Manage workspace**, **Open Codex**, **Connect Zotero Desktop**, and **Connect OpenAI**.
- Optional credentials were visually secondary to the simplest supported connection.
- Honest unavailable states explained that the user had not missed a step.

## What Felt Unintuitive

- Windows SmartScreen can still interrupt an unsigned preview installation. The Windows guide now gives the exact confirmation sequence.
- Google browser sign-in cannot be offered in a public build until publisher OAuth configuration is available; the fallback is clear but is not yet a complete in-Horizon connection.

## Visual Cohesion Notes

- Integration cards use one consistent status, description, and action pattern.
- Setup dialogs preserve the same hierarchy for recommended actions, numbered instructions, optional advanced access, and official links.
- Settings remained contained in its panel with no stray horizontal scrollbar at the tested half-window size.

## Broken or Dead Interactions

- None remained in the tested onboarding and integration surfaces.
- A pre-release Settings overflow was found during the test and corrected before this report was finalized.

## Missing Feedback

- No blocking feedback was missing.
- Future publisher OAuth registration could replace the honest Google unavailable state and optional Zotero cloud-key path with browser account authorization.

## Errors Encountered

- The pre-release installer used the internal package name for its installation folder. Package identity and installer-parity checks were corrected for the final build.
- The integration settings content initially exceeded its panel width at a narrow viewport. Minimum-width and overflow containment were corrected and retested.

## Completion Result

PASS for the tested release candidate and production source onboarding. The first-run and seven-integration flow is understandable without developer assistance; optional external accounts remain optional and limitations are stated directly. The guarded final installer still requires an installed-app upgrade/fresh-install parity pass before publication.

## Severity Summary

- Blocker: 0 unresolved in the tested release candidate/source flow; final installed-app parity tracked separately
- High: 0 unresolved
- Medium: 0 unresolved
- Low: 0 unresolved in the tested flow

## Recommended Next Actions

1. Code-sign a future Windows installer to remove the SmartScreen friction.
2. Register publisher-managed Google and Zotero OAuth applications when those integrations are ready for broad distribution.
3. Repeat this flow against the final unsigned installer before publishing 0.3.0, then on a clean Windows user account for future public releases.
