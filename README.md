# Linkwise for Obsidian

![Version](https://img.shields.io/badge/version-beta-orange)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

The official Obsidian integration for [Linkwise](https://linkwise.app). Effortlessly sync your saved links, AI-generated summaries, key questions, live highlights, and curated collections directly into your vault as clean, native Markdown notes.

## Key Features

*   **One-Way Incremental Sync:** Seamlessly pulls updates from Linkwise into Obsidian without slowing down your vault.
*   **Local-First & Non-Destructive:** Linkwise keeps your summaries and highlights perfectly up to date, but anything *you* write in a note is completely safe and never overwritten.
*   **Color-Coded Highlights:** Preserves your Linkwise highlight colors using clean CSS styling, mapped directly to frontmatter for easy filtering.
*   **Smart Updates:** Notes are tracked via a unique identifier, allowing you to safely rename or reorganize files without creating accidental duplicates.
*   **Distinct Collection Maps:** Each collection gets a **Map of Content** hub note (`🗺️ <Collection>`) that stands apart from the links it indexes — a 🗺️ map marker in its name, a summary callout with a live link count, and a `#linkwise/moc` tag.
*   **One-Click Graph Colors:** A **Set up graph colors** command paints your collection maps a distinct color in Obsidian's graph, so hubs pop out from the notes around them — without disturbing any graph settings you've already made.
*   **Clean Notes by Default:** The source "Saved from …" banner is hidden out of the box for a tidier note; flip it back on any time with a single toggle.

> 📝 **Note:** This plugin requires an active [Linkwise Pro](https://linkwise.app/docs/linkwise-pro-subscription) subscription.

## Installation

### Method 1: Via Community Plugins (Recommended)

1. Open Obsidian and navigate to **Settings** → **Community plugins**.
2. If you haven't enabled third-party plugins yet, click **Turn on community plugins**.
3. Click **Browse**, search for **Linkwise**, and click **Install**.
4. Once installed, click **Enable** to activate the plugin.

### Method 2: Manual Installation

1. Download the latest `main.js`, `manifest.json`, and `styles.css` from the [GitHub Releases page](https://github.com/LinkwiseApp/obsidian-linkwise/releases).
2. Inside your Obsidian vault, navigate to `.obsidian/plugins/` and create a new folder named `linkwise`.
3. Move the three downloaded files into that folder.
4. Reload Obsidian, go to **Settings** → **Community plugins**, click the **Refresh** icon, and toggle **Linkwise** on.
5. Click the gear icon to begin configuration.

## Connecting to Linkwise

Setting up the sync connection is quick and secure. Choose one of the two options below to pair your vault.

### Option A: Scan QR Code (Recommended)

1. In Obsidian, go to **Settings** → **Linkwise**. Under the **Connection** section, click **Show QR Code**.
2. Open the **Linkwise** app on your phone.
3. Navigate to **Settings** → **Integrations** → **Linkwise for Obsidian** and tap **Scan to connect**.
4. Point your camera at the QR code on your screen. The plugin will auto-configure and trigger its initial sync.
*Note: QR codes expire after 5 minutes for security. Click **New QR Code** if it times out.*

### Option B: Manual Token Entry

1. Open the **Linkwise** mobile app.
2. Go to **Settings** → **Integrations** → **Linkwise for Obsidian** and select **Generate Token**.
3. Tap **Copy** to save the token (it begins with `lw_pat_…`).
   > ⚠️ **Important:** This token is only displayed once. Store it securely or regenerate a new one if lost.
4. In Obsidian, go to **Settings** → **Linkwise** → **Advanced**, and paste it into the **Personal Access Token** field.

## How Sync Works

You can trigger a manual synchronization at any time using three different methods:
*   Clicking the **circular-arrows** icon in the ribbon menu on the left.
*   Opening the Command Palette (`Cmd/Ctrl + P`) and running **"Linkwise: Sync now"**.
*   Clicking the **Sync Now** button inside the plugin settings panel.

Upon completion, a native notification will display your sync summary (e.g., *"Linkwise: sync complete — 24 new, 3 updated"*). If you prefer a hands-off approach, you can configure an **Auto-sync interval** in the settings to pull updates in the background.

## Vault Structure & Note Anatomy

### Directory Layout
The plugin preserves your Linkwise organization by mapping your collections directly to vault folders. Unfiled links are neatly placed into an `Unsorted` directory.

```text
Linkwise/
 ├── Research/
 │    ├── 🗺️ Research.md               # Map of Content — hub linking every link in the collection
 │    ├── Agent Harness Engineering.md
 │    └── Attention Is All You Need.md
 └── Unsorted/                         # For links not yet assigned to a collection
      ├── 🗺️ Unsorted.md               # Map of Content for unfiled links
      └── ...
```

> ℹ️ Upgrading from an earlier version? Legacy index notes (a plain `MOC`, `<Collection> (MOC)`, the collection name itself, or the old `_MOC`) are renamed to `🗺️ <Collection>` automatically on the next sync — no duplicates, nothing lost.

### Maps of Content
Each collection folder contains a **Map of Content** — a fully managed `🗺️ <Collection>` note that wikilinks every link in the collection. The 🗺️ marker in its name makes it pop in the graph and file explorer, and its title comes straight from the filename (no redundant heading):

```markdown
---
linkwise_moc: true
collection: "Research"
tags: [linkwise/moc]
---

> [!info] Map of Content
> Index of the **Research** collection — 12 links.

- [[Agent Harness Engineering]]
- [[Attention Is All You Need]]
```

Run **Linkwise: Set up graph colors** (Command Palette, or the button in settings) to color these hubs distinctly in the graph view. See [Graph Colors](#graph-colors) below.

### Note Blueprint
Every synced note features rich properties (frontmatter) and a clean sections layout. The source "Saved from …" callout is **hidden by default**; enable **Show 'Saved from' banner** in settings to include it (shown commented below):

```markdown
---
linkwise_id: "cf2cf531-..."
title: "Agent Harness Engineering"
url: "https://addyosmani.com/blog/agent-harness-engineering/"
source: "addyosmani.com"
collection: "Research"
tags: [ai, agents]
highlight_colors: [yellow, purple]
saved: 2026-06-16
cover: "https://..."
---

<!-- Shown only when "Show 'Saved from' banner" is enabled: -->
<!-- > [!info] Saved from [addyosmani.com](https://addyosmani.com/blog/agent-harness-engineering/) -->

## Summary
The AI-generated summary text appears here...

## Key Questions
**A core question the article answers**
The AI-generated answer detailing the concepts...

## Highlights
<blockquote class="linkwise-highlight" data-color="yellow" style="border-left: 4px solid #FEF08A;">
A sample passage you highlighted while reading inside Linkwise.
</blockquote>

*Your personal annotation or thought attached to this specific highlight.*

## My Notes
Write anything you want here! Your thoughts, permanent links, and deeply structural outlines belong down here. This section completely survives all future syncs.
```

### 🛑 The Golden Rule of Editing
To keep your data intact while allowing for seamless updates, the plugin uses a strict boundary rule:
*   **Everything ABOVE `## My Notes`** is managed by Linkwise and will be refreshed during synchronization.
*   **Everything BELOW `## My Notes`** belongs entirely to you. The sync engine will never overwrite or alter anything in this section. Do not modify or delete the `## My Notes` header itself.


## Graph Colors

Collections form little hub-and-spoke clusters in Obsidian's graph: the `🗺️ <Collection>` Map of Content hub in the center, its links around it. By default every node is the same color, so the hub blends in. The **Set up graph colors** command fixes that.

Run it from the Command Palette (**Linkwise: Set up graph colors**) or the **Graph colors** button in settings. It adds two color groups to your graph configuration:

*   **Collection maps** (`tag:#linkwise/moc`) — violet, so hubs pop out.
*   **Linkwise notes** (`path:"<your vault folder>"`) — muted slate.

The command is **non-destructive**: it only adds groups whose query you don't already have, and never edits or removes color groups you set up yourself. After running it, close and reopen the graph view to see the new colors. Prefer different colors? Adjust them any time under **Settings → Graph view → Groups**.

## Settings Reference

| Setting | Description | Default |
| :--- | :--- | :--- |
| **Personal Access Token** | The unique `lw_pat_…` authentication token generated from your mobile app. | *None* |
| **Vault Folder** | The target directory path where all Linkwise notes will be written. | `Linkwise` |
| **Auto-Sync Interval** | The frequency at which the plugin checks for updates in the background. | `Manual only` |
| **On Deletion Strategy** | How to handle notes when their corresponding link is removed from Linkwise. Options: `Mark` (appends `linkwise_deleted: true`), `Trash` (moves to `_trash` folder), or `Ignore`. | `Mark` |
| **Show 'Saved from' banner** | Keep the source callout at the top of each note. Off gives a cleaner note. Applies to newly synced notes; reset the sync state to re-apply to every note. | `Off` |
| **Graph colors** | One-click button that adds graph color groups so collection maps stand out from notes. Non-destructive. | *N/A* |
| **API Base URL** *(Advanced)* | Custom endpoint configuration. Only modify if self-hosting or testing locally. | *Production API* |
| **Reset Sync State** *(Advanced)* | Clears the local sync cursor. The next sync will re-evaluate all items, gracefully merging changes without creating duplicates. | *N/A* |


## Troubleshooting

| Issue | Root Cause & Resolution |
| :--- | :--- |
| **"Invalid or revoked token"** | Your access token has expired or been revoked. Generate a new token in the Linkwise app and update it in your plugin settings. |
| **"Obsidian sync is a Pro feature"** | The account paired with the token does not have an active Linkwise Pro subscription tier. |
| **"Already up to date"** / No notes sync | No new items have been saved, or existing notes haven't changed since the previous sync session. |
| **Notes are missing** | Double-check that the plugin is fully enabled and verify the absolute path configured in the **Vault Folder** setting. |
| **Need a full fresh sync** | Go to Settings → **Reset sync state**, and then run **Sync now** to forces a comprehensive rebuild. |
| **Deleted highlights persist** | *Known limitation:* A highlight removed in isolation will update in Obsidian the next time its parent article undergoes an edit or re-sync. |


## Privacy & Security

*   **Zero Telemetry:** The plugin does not bundle trackers, analytics engines, or external data catchers. It communicates strictly with the core Linkwise Sync API.
*   **Secure Storage:** Your access token is stored safely within your vault's internal `.obsidian/plugins/linkwise/data.json` file. If your vault is hosted on a shared sync network, treat it with the same caution as a password. You can revoke it instantly inside the mobile app.
*   **Multi-Device Vault Layouts:** If you use Obsidian Sync or an external provider across multiple devices, we recommend triggering the Linkwise synchronization loop from **one primary device** to eliminate file-write race conditions.


## Development Workflow

Get the local developer environment up and running with standard npm operations:

```bash
# Install package dependencies
npm install

# Run the project in development/watch mode
npm run dev

# Run type-checking and generate production-ready bundle
npm run build

# Run code linter
npm run lint
```

### Project Architecture
The codebase is structured modularly within the `src/` directory:
*   `main.ts`: Handles the main lifecycle events and initialization hooks of the Obsidian plugin.
*   `settings.ts`: Implements the UI configurations panel and settings parsing logic.
*   `api.ts`: Manages network requests and data framing with the Linkwise data endpoints.
*   `sync.ts`: Core processing engine responsible for handling differential pulls and local document writes.
*   `markdown.ts`: Parser tasked with parsing boundaries to merge upstream changes into your custom files cleanly.

## License

This project is licensed under the terms of the MIT License. See [LICENSE](LICENSE) for details.
