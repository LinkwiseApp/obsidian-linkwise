import { Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, LinkwiseSettingTab, type LinkwiseSettings } from "./settings";
import { SyncEngine } from "./sync";
import { LinkwiseApiError } from "./api";
import { MOC_TAG } from "./markdown";

/** One Obsidian graph "color group": a search query painted a fixed color. */
interface GraphColorGroup {
	query: string;
	color: { a: number; rgb: number };
}

export default class LinkwisePlugin extends Plugin {
	settings!: LinkwiseSettings;

	private syncing = false;
	private statusBarEl: HTMLElement | null = null;
	private autoSyncIntervalId: number | null = null;

	async onload() {
		await this.loadSettings();

		this.addRibbonIcon("refresh-cw", "Linkwise: Sync now", () => {
			void this.syncNow();
		});

		this.addCommand({
			id: "sync-now",
			name: "Sync now",
			callback: () => {
				void this.syncNow();
			},
		});

		this.addCommand({
			id: "setup-graph-colors",
			name: "Set up graph colors",
			callback: () => {
				void this.setupGraphColors();
			},
		});

		this.statusBarEl = this.addStatusBarItem();
		this.updateStatusBar();

		this.addSettingTab(new LinkwiseSettingTab(this.app, this));
		this.reconfigureAutoSync();
	}

	onunload() {
		// registerInterval clears the auto-sync timer automatically; nothing else
		// holds resources.
	}

	// MARK: - Sync

	async syncNow(): Promise<void> {
		if (this.syncing) {
			new Notice("Linkwise: a sync is already running.");
			return;
		}
		if (!this.settings.token) {
			new Notice("Linkwise: add your personal access token in settings first.");
			return;
		}

		this.syncing = true;
		this.setStatus("Linkwise · syncing…");
		try {
			const result = await new SyncEngine(this).run();
			const parts: string[] = [];
			if (result.created) parts.push(`${result.created} new`);
			if (result.updated) parts.push(`${result.updated} updated`);
			if (result.deleted) parts.push(`${result.deleted} removed`);
			const summary = parts.length > 0 ? parts.join(", ") : "already up to date";
			new Notice(`Linkwise: sync complete — ${summary}.`);
		} catch (e) {
			const msg = e instanceof LinkwiseApiError || e instanceof Error ? e.message : String(e);
			new Notice(`Linkwise: sync failed — ${msg}`, 8000);
			console.error("Linkwise sync failed", e);
		} finally {
			this.syncing = false;
			this.updateStatusBar();
		}
	}

	/** (Re)arm the auto-sync interval from the current setting. */
	reconfigureAutoSync(): void {
		if (this.autoSyncIntervalId !== null) {
			window.clearInterval(this.autoSyncIntervalId);
			this.autoSyncIntervalId = null;
		}
		const minutes = this.settings.syncIntervalMinutes;
		if (!minutes || minutes <= 0) return;

		this.autoSyncIntervalId = window.setInterval(() => {
			void this.syncNow();
		}, minutes * 60 * 1000);
		// Ensures the timer is cleared automatically when the plugin unloads.
		this.registerInterval(this.autoSyncIntervalId);
	}

	// MARK: - Graph colors

	/**
	 * Add graph color groups so collection maps stand out from the notes they link.
	 *
	 * Obsidian stores graph color groups in `.obsidian/graph.json` as `{query, color}`
	 * entries. We add two — MOC hubs (accent) and Linkwise notes (muted) — but only
	 * if a group with that exact query isn't already present, so we never clobber the
	 * user's own graph configuration. MOC hubs are inserted ahead of the notes group
	 * so the more specific color wins for them.
	 */
	async setupGraphColors(): Promise<void> {
		const adapter = this.app.vault.adapter;
		const path = `${this.app.vault.configDir}/graph.json`;

		let config: Record<string, unknown> = {};
		try {
			if (await adapter.exists(path)) {
				config = JSON.parse(await adapter.read(path)) as Record<string, unknown>;
			}
		} catch (e) {
			console.error("Linkwise: could not read graph.json", e);
			new Notice("Linkwise: couldn't read your graph settings. See the console for details.", 8000);
			return;
		}

		const groups: GraphColorGroup[] = Array.isArray(config.colorGroups)
			? (config.colorGroups as GraphColorGroup[])
			: [];

		const root = this.settings.vaultRoot;
		// Most specific first: MOC hubs must precede the broad "notes in root" group.
		const desired: GraphColorGroup[] = [
			{ query: `tag:#${MOC_TAG}`, color: { a: 1, rgb: 0x8b5cf6 } }, // maps — violet
			{ query: `path:"${root}"`, color: { a: 1, rgb: 0x64748b } }, // notes — slate
		];

		let added = 0;
		// Insert each new group at the front so maps outrank the notes group.
		for (const group of [...desired].reverse()) {
			if (!groups.some((g) => g.query === group.query)) {
				groups.unshift(group);
				added++;
			}
		}
		config.colorGroups = groups;

		try {
			await adapter.write(path, JSON.stringify(config, null, 2));
		} catch (e) {
			console.error("Linkwise: could not write graph.json", e);
			new Notice("Linkwise: couldn't update your graph settings. See the console for details.", 8000);
			return;
		}

		new Notice(
			added > 0
				? `Linkwise: added ${added} graph color group${added > 1 ? "s" : ""}. Close and reopen the graph to see them.`
				: "Linkwise: graph colors are already set up.",
		);
	}

	// MARK: - Status bar

	private setStatus(text: string): void {
		this.statusBarEl?.setText(text);
	}

	private updateStatusBar(): void {
		if (!this.statusBarEl) return;
		if (this.settings.lastSyncAt) {
			const when = new Date(this.settings.lastSyncAt).toLocaleTimeString([], {
				hour: "2-digit",
				minute: "2-digit",
			});
			this.statusBarEl.setText(`Linkwise · synced ${when}`);
		} else {
			this.statusBarEl.setText("Linkwise · not synced");
		}
	}

	// MARK: - Settings

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<LinkwiseSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
