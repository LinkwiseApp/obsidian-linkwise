import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type LinkwisePlugin from "./main";

export type DeletePolicy = "trash" | "mark" | "ignore";

export interface LinkwiseSettings {
	/** Personal access token minted in the Linkwise app (kept in data.json). */
	token: string;
	/** Edge-function base URL. Default points at Linkwise production. */
	apiBaseUrl: string;
	/** Vault-relative root folder for synced notes. */
	vaultRoot: string;
	/** Auto-sync cadence in minutes; 0 = manual only. */
	syncIntervalMinutes: number;
	/** What to do when a link is deleted in Linkwise. */
	deletePolicy: DeletePolicy;
	/** Incremental cursor (ISO timestamp). Empty = full sync from scratch. */
	cursor: string;
	/** Last successful sync (ISO), for the status bar. */
	lastSyncAt: string;
}

export const DEFAULT_SETTINGS: LinkwiseSettings = {
	token: "",
	apiBaseUrl: "https://jcbgrqawrvztwsvxawda.supabase.co/functions/v1",
	vaultRoot: "Linkwise",
	syncIntervalMinutes: 0,
	deletePolicy: "mark",
	cursor: "",
	lastSyncAt: "",
};

export class LinkwiseSettingTab extends PluginSettingTab {
	private plugin: LinkwisePlugin;

	constructor(app: App, plugin: LinkwisePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Personal access token")
			.setDesc("Generate this in the Linkwise app under Settings → Integrations → Linkwise for Obsidian, then paste it here.")
			.addText((text) => {
				text.inputEl.type = "password";
				text.inputEl.style.width = "100%";
				text
					.setPlaceholder("lw_pat_…")
					.setValue(this.plugin.settings.token)
					.onChange(async (value) => {
						this.plugin.settings.token = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Vault folder")
			.setDesc("Root folder synced notes are written into.")
			.addText((text) =>
				text
					.setPlaceholder("Linkwise")
					.setValue(this.plugin.settings.vaultRoot)
					.onChange(async (value) => {
						this.plugin.settings.vaultRoot = value.trim() || "Linkwise";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Auto-sync interval")
			.setDesc("How often to pull automatically. 'Manual only' pulls when you run the Sync command.")
			.addDropdown((dd) =>
				dd
					.addOptions({
						"0": "Manual only",
						"15": "Every 15 minutes",
						"30": "Every 30 minutes",
						"60": "Every hour",
						"180": "Every 3 hours",
					})
					.setValue(String(this.plugin.settings.syncIntervalMinutes))
					.onChange(async (value) => {
						this.plugin.settings.syncIntervalMinutes = Number(value);
						await this.plugin.saveSettings();
						this.plugin.reconfigureAutoSync();
					}),
			);

		new Setting(containerEl)
			.setName("When a link is deleted in Linkwise")
			.setDesc("How to treat notes whose source was removed. Your text is never hard-deleted by default.")
			.addDropdown((dd) =>
				dd
					.addOptions({
						mark: "Mark note as deleted (keep it)",
						trash: "Move note to a _trash folder",
						ignore: "Leave the note untouched",
					})
					.setValue(this.plugin.settings.deletePolicy)
					.onChange(async (value) => {
						this.plugin.settings.deletePolicy = value as DeletePolicy;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Sync")
			.setDesc(
				this.plugin.settings.lastSyncAt
					? `Last synced: ${new Date(this.plugin.settings.lastSyncAt).toLocaleString()}`
					: "Not synced yet.",
			)
			.addButton((btn) =>
				btn
					.setButtonText("Sync now")
					.setCta()
					.onClick(async () => {
						await this.plugin.syncNow();
						this.display();
					}),
			);

		// Advanced ----------------------------------------------------------------
		new Setting(containerEl).setName("Advanced").setHeading();

		new Setting(containerEl)
			.setName("API base URL")
			.setDesc("Only change this if you're self-hosting or testing against a different backend.")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.apiBaseUrl)
					.setValue(this.plugin.settings.apiBaseUrl)
					.onChange(async (value) => {
						this.plugin.settings.apiBaseUrl = value.trim() || DEFAULT_SETTINGS.apiBaseUrl;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Reset sync state")
			.setDesc("Forget the sync cursor so the next sync re-pulls everything. Existing notes are merged by ID, not duplicated.")
			.addButton((btn) =>
				btn
					.setButtonText("Reset cursor")
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.cursor = "";
						await this.plugin.saveSettings();
						new Notice("Linkwise: sync cursor reset. Run 'Sync now' to re-pull everything.");
						this.display();
					}),
			);
	}
}
