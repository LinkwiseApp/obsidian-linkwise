# Linkwise Official

![beta](https://img.shields.io/badge/version-beta-orange)

The official plugin created by [Linkwise](https://linkwise.app) team allow you to syncs your saved links,
AI summaries, key questions, highlights, and collections from Linkwise into your
Obsidian vault as clean Markdown notes.

Sync is **one-way** (Linkwise → Obsidian), **incremental** (only what changed),
and **local-first** - Linkwise keeps your summaries and highlights up to date, and
anything *you* write in a note is never overwritten.

Note: Requires Linkwise Pro subscription.

## Download and installation

### Install via Community Plugins (recommended)

1. Open Obsidian → **Settings → Community plugins**.
2. If it's your first community plugin, click **Turn on community plugins** (this
   turns off Restricted/Safe mode).
3. Click **Browse**, search for **Linkwise**, open it, and click **Install**.
4. Click **Enable** to activate the plugin.

### Alternative installation (manual)

1. Download `main.js`, `manifest.json`, and `styles.css` from the
   [latest GitHub release](https://github.com/LinkwiseApp/obsidian-linkwise/releases).
2. In your vault, create a folder named `linkwise` inside `.obsidian/plugins/`
   (open it from **Settings → Community plugins →** the folder icon next to
   "Installed plugins").
3. Move the three files into that folder.
4. Back in Obsidian, click the **refresh** button on the Community plugins page,
   then **enable Linkwise**. Click the gear icon to configure it.

## Connecting Obsidian with Linkwise

Obsidian has no website login, so you connect by pasting a **personal access token**
that you generate once in the Linkwise app.

### 1. Generate your token (in the Linkwise app)

1. Open **Linkwise** → **Settings → Integrations**.
2. On the **Linkwise for Obsidian** card, tap **Generate token**.
   (On the free plan you'll see the upgrade screen — this is a Pro feature.)
3. A token starting with `lw_pat_…` appears. Tap **Copy**.

> ⚠️ **You'll only see this token once.** If you lose it, just generate a new one
> (the old one stops working).

### 2. Paste it into the plugin

1. In Obsidian → **Settings → Linkwise**, paste the token into the
   **Personal access token** field.
2. (Optional) set your **Vault folder** and **Auto-sync interval** (see below).

## Syncing

Trigger a sync any of these ways:

- Click the **circular-arrows** icon in the left ribbon, **or**
- Command palette (`Cmd/Ctrl+P`) → **"Linkwise: Sync now"**, **or**
- The **Sync now** button in the plugin settings.

You'll get a notice like *"Linkwise: sync complete — 24 new, 3 updated."* Each item
is matched by a hidden `linkwise_id`, so re-syncing **updates notes in place** — it
never creates duplicates, even if you renamed or moved the note. If you set an
auto-sync interval, the plugin pulls new changes on that schedule automatically.

## What your vault looks like

```
Linkwise/
  Research/
    Research.md                 ← index note (named after the collection), links everything in it
    Agent Harness Engineering.md
    Attention Is All You Need.md
  Unsorted/                     ← links you haven't filed into a collection yet
    Unsorted.md
    …
```

The index note is named after its collection, so its hub node in the **graph view**
reads as the collection name.

Each note:

```markdown
---
linkwise_id: "cf2cf531-…"      ← don't edit this; it's how sync tracks the note
title: "Agent Harness Engineering"
url: "https://addyosmani.com/blog/agent-harness-engineering/"
source: "addyosmani.com"
collection: "Research"
tags: [ai, agents]
highlight_colors: [yellow, purple]   ← highlight colors used, so you can filter by them
saved: 2026-06-16
cover: "https://…"
---

> [!info] Saved from [addyosmani.com](https://…)

## Summary

…the AI-generated summary…

## Key questions

**A question the article answers**

…the AI-generated answer…

## Highlights

<blockquote class="linkwise-highlight" data-color="yellow" style="border-left: 4px solid #FEF08A; …">
a passage you highlighted in Linkwise
</blockquote>

*your annotation on that highlight*

## My notes
Write anything you want here — it's yours and survives every re-sync.
```

Each highlight keeps its **Linkwise color** — the left bar matches the color you used
(yellow, purple, pink, blue, or green), and the `highlight_colors` property lets you
filter notes by color (search `["highlight_colors":yellow]`, or Dataview
`WHERE contains(highlight_colors, "yellow")`).

**The golden rule:** everything **above** `## My notes` is managed by Linkwise (kept
up to date each sync). Everything **from `## My notes` down is yours** and is never
overwritten. Just keep that heading as your divider, and write your own thoughts,
links, and sections below it.

---

## Settings reference

| Setting | What it does |
|---|---|
| **Personal access token** | The `lw_pat_…` token from the Linkwise app. |
| **Vault folder** | Root folder synced notes are written into (default `Linkwise`). |
| **Auto-sync interval** | How often to pull automatically. `Manual only` (the default) syncs only when you run the command. |
| **When a link is deleted in Linkwise** | `Mark` (default — adds `linkwise_deleted: true`, keeps the note), `Trash` (move to a `_trash` folder), or `Ignore` (leave untouched). Linkwise never hard-deletes your notes. |
| **API base URL** *(advanced)* | Only change if self-hosting/testing. |
| **Reset sync state** *(advanced)* | Forgets the cursor so the next sync re-pulls **everything**. Notes are merged by ID, not duplicated. |

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Invalid or revoked token" | Generate a fresh token in the app and paste it again. |
| "Obsidian sync is a Pro feature" | Your Linkwise Pro subscription isn't active. |
| Nothing synced / "already up to date" | No new changes since the last sync, or no saved links yet. |
| Notes didn't appear | Check the **Vault folder** setting and that the plugin is enabled. |
| I want to re-pull everything | Settings → **Reset sync state** → **Sync now**. |
| A highlight I deleted is still there | Known limit: a highlight removed on its own updates only when its article next changes. |

---

## Privacy & security

- **No telemetry or analytics.** The plugin only talks to the Linkwise sync API.
- Your token is stored in the plugin's `data.json` **inside your vault**. If your
  vault is synced/shared, the token travels with it — it's read-only and revocable
  anytime from the Linkwise app. Treat it like a password.
- If the same vault syncs across devices, run Linkwise sync on **one** primary
  device to keep writes tidy (the `linkwise_id` upsert keeps it safe either way).

---

## Development

```bash
npm install
npm run dev     # watch build
npm run build   # type-check + production bundle → main.js
npm run lint    # eslint
```

Sources live in `src/`: `main.ts` (plugin lifecycle), `settings.ts`, `api.ts`
(the pull endpoint), `sync.ts` (pull-and-upsert engine), `markdown.ts` (the
heading-boundary merge).

## License

MIT — see [LICENSE](LICENSE).
