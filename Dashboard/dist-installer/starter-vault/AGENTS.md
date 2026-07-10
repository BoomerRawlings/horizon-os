# Horizon Vault

This folder is a Horizon vault: a plain, human-readable folder of Markdown notes that is the
durable source of truth behind the Horizon app. Keep it boring, searchable, and small.

## Layout

- `Calendar/Items/` — dated items (events, deadlines, reminders), one per file.
- `Calendar/Now.md` — a rolling "what's happening now" note.
- `Inbox/To Triage/` — raw captures waiting to be sorted.
- `Inbox/Captures/` — the original captured text, kept for safety.
- `Runs/` — compact logs the app writes as it works.
- `Project Registry/` — one note per project; drop a note here and it appears in Horizon.
- `Dashboard/` — the Horizon app itself. You normally don't edit this by hand.

## Rules

- Never delete raw captures while they're being processed.
- Keep secrets out of Markdown notes.
- Prefer editing an existing index over inventing a new organizing system.
- This is your data — open it in Obsidian, a text editor, or Horizon. It's just files.
