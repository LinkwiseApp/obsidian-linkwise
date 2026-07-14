# Linkwise for Obsidian

Sync your [Linkwise](https://linkwise.app) saved links, highlights, and collections
into your Obsidian vault as clean Markdown notes. One-way, incremental, and
local-first — Linkwise is the source of truth, and anything you write in your notes
is preserved across syncs.

## What it does

- Pulls each saved link into `Linkwise/<Collection>/<Title>.md` with YAML
  frontmatter (`linkwise_id`, url, source, tags, saved date, cover).
- Writes the article's AI summary and your highlights (with your annotations)
  into a **managed region** fenced by `%% linkwise:start %%` / `%% linkwise:end %%`.
- Generates a `_MOC.md` (Map of Content) per collection linking every note.
- Syncs **incrementally** — only what changed since the last pull.
- Works on desktop **and** mobile (uses Obsidian's `requestUrl`, no Node APIs).

## Local-first: your writing is safe

The plugin only ever rewrites the frontmatter and the text **between** the fence
markers. Everything outside the fence — including the `## My notes` section it
scaffolds for you — is never touched. You can freely rename or move notes; they're
matched by the `linkwise_id` in their frontmatter, not by filename.

When a link is deleted in Linkwise, the default is to **mark** the note
(`linkwise_deleted: true`) rather than delete it. You can change this to "move to a
`_trash` folder" or "leave untouched" in settings. The plugin never hard-deletes
your notes.

## Setup

1. Install and enable this plugin.
2. In the **Linkwise app** → Settings → Integrations → **Linkwise for Obsidian**,
   tap **Generate token** (requires Linkwise Pro) and copy the `lw_pat_…` token.
3. In Obsidian → **Settings → Linkwise**, paste the token.
4. Run **Sync now** (ribbon icon, or the "Linkwise: Sync now" command). Optionally
   set an auto-sync interval.

## Token security

Your token is stored in this plugin's `data.json`, which lives **inside your vault**.
If your vault is synced or shared, the token travels with it. The token is
read-only and sync-only, and you can **revoke it anytime** from the Linkwise app.
Treat it like a password.

If you run Linkwise sync on multiple devices that also share one vault (e.g. via
Obsidian Sync), prefer running it on a single primary device to avoid write churn —
the `linkwise_id` upsert keeps writes idempotent, but one syncer is tidiest.

## Development

```bash
npm install
npm run dev     # watch build
npm run build   # type-check + production bundle → main.js
```

Sources live in `src/`: `main.ts` (plugin lifecycle), `settings.ts`, `api.ts`
(the pull endpoint), `sync.ts` (pull-and-upsert engine), `markdown.ts` (the
fenced-region merge).

## Privacy

This plugin contains **no telemetry or analytics** (per Obsidian's plugin
guidelines). It only talks to the Linkwise sync API you authenticate against.

## License

MIT — see [LICENSE](LICENSE).
