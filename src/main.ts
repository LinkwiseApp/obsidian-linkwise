import { Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, LinkwiseSettingTab, type LinkwiseSettings } from "./settings";
import { SyncEngine } from "./sync";
import { LinkwiseApiError } from "./api";

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
