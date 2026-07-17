import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type { SettingDefinitionItem } from "obsidian";
import qrcode from "qrcode-generator";
import type LinkwisePlugin from "./main";
import { startPairing, pollPairing, PairingError, type PairingSession } from "./pairing";

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
	/** Show the article's cover image at the top of each note. */
	showCover: boolean;
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
	showCover: true,
	cursor: "",
	lastSyncAt: "",
};

const POLL_INTERVAL_MS = 2500;

// Descriptions shared by the declarative definitions (for search) and the
// imperative builders (for rendering), so the two never drift apart.
const DESC = {
	connected: "The plugin is linked and will sync using your saved token.",
	connect:
		"Generate a QR code, then scan it in the Linkwise app: Settings → Integrations → Linkwise for Obsidian → scan to connect. Requires Linkwise Pro.",
	vaultFolder: "Root folder synced notes are written into.",
	autoSync: "How often to pull automatically. 'manual only' pulls when you run the sync command.",
	deletePolicy: "How to treat notes whose source was removed. Your text is never hard-deleted by default.",
	showCover:
		"Show the article's cover image at the top of each note. Applies to newly synced notes; reset the sync state below to re-apply to every note.",
	graphColors:
		"Color-code the graph so collection maps stand out from the notes they link. Adds color groups to your graph settings without touching anything you've already set.",
	token: "Manual fallback. Generate a token in the Linkwise app (Settings → Integrations → Linkwise for Obsidian) and paste it here instead of scanning.",
	apiBaseUrl: "Only change this if you're self-hosting or testing against a different backend.",
	reset: "Forget the sync cursor so the next sync re-pulls everything. Existing notes are merged by ID, not duplicated.",
} as const;

export class LinkwiseSettingTab extends PluginSettingTab {
	private plugin: LinkwisePlugin;

	// QR-pairing state (only alive while the panel is open).
	private pairing: PairingSession | null = null;
	private pollTimer: number | null = null;
	private expiryTimer: number | null = null;

	constructor(app: App, plugin: LinkwisePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * Declarative settings (Obsidian 1.13+): the framework renders these and
	 * indexes each row's name/desc for the settings search. Every row delegates
	 * to the same builder the imperative `display()` fallback uses, so there is a
	 * single source of truth for the UI. On Obsidian < 1.13 this method is unknown
	 * and `display()` runs instead.
	 */
	getSettingDefinitions(): SettingDefinitionItem[] {
		this.stopPairing(); // re-run on every (re)render; never leave a poll loop live
		const s = this.plugin.settings;
		return [
			{
				type: "group",
				heading: "Connection",
				items: [
					{
						name: s.token ? "Connected to Linkwise" : "Connect with QR",
						desc: s.token ? DESC.connected : DESC.connect,
						aliases: ["pair", "qr code", "token", "disconnect", "connect"],
						render: (setting) => this.buildConnection(setting),
					},
				],
			},
			{
				name: "Vault folder",
				desc: DESC.vaultFolder,
				render: (setting) => this.buildVaultFolder(setting),
			},
			{
				name: "Auto-sync interval",
				desc: DESC.autoSync,
				render: (setting) => this.buildAutoSync(setting),
			},
			{
				name: "When a link is deleted in Linkwise",
				desc: DESC.deletePolicy,
				render: (setting) => this.buildDeletePolicy(setting),
			},
			{
				name: "Show cover image",
				desc: DESC.showCover,
				aliases: ["cover", "image", "thumbnail"],
				render: (setting) => this.buildShowCover(setting),
			},
			{
				name: "Graph colors",
				desc: DESC.graphColors,
				aliases: ["graph", "colors", "map of content", "moc"],
				render: (setting) => this.buildGraphColors(setting),
			},
			{
				name: "Sync",
				desc: this.syncDesc(),
				aliases: ["sync now", "pull"],
				render: (setting) => this.buildSync(setting),
			},
			{
				type: "group",
				heading: "Advanced",
				items: [
					{
						name: "Personal access token",
						desc: DESC.token,
						aliases: ["pat", "lw_pat"],
						render: (setting) => this.buildToken(setting),
					},
					{
						name: "API base URL",
						desc: DESC.apiBaseUrl,
						render: (setting) => this.buildApiBaseUrl(setting),
					},
					{
						name: "Reset sync state",
						desc: DESC.reset,
						aliases: ["cursor", "re-pull", "full sync"],
						render: (setting) => this.buildReset(setting),
					},
				],
			},
		];
	}

	/** Imperative fallback for Obsidian < 1.13 (no declarative settings API). */
	display(): void {
		this.renderSettings();
	}

	private renderSettings(): void {
		const { containerEl } = this;
		this.stopPairing(); // never leave a poll loop running across a re-render
		containerEl.empty();

		new Setting(containerEl).setName("Connection").setHeading();
		this.buildConnection(new Setting(containerEl), containerEl);

		this.buildVaultFolder(new Setting(containerEl));
		this.buildAutoSync(new Setting(containerEl));
		this.buildDeletePolicy(new Setting(containerEl));
		this.buildShowCover(new Setting(containerEl));
		this.buildGraphColors(new Setting(containerEl));
		this.buildSync(new Setting(containerEl));

		new Setting(containerEl).setName("Advanced").setHeading();
		this.buildToken(new Setting(containerEl));
		this.buildApiBaseUrl(new Setting(containerEl));
		this.buildReset(new Setting(containerEl));
	}

	/**
	 * Re-render after a state change, on either path: `update()` re-runs the
	 * declarative definitions (1.13+); older Obsidian falls back to a full
	 * imperative re-render.
	 */
	private rerender(): void {
		const tab = this as unknown as { update?: () => void };
		if (typeof tab.update === "function") tab.update();
		else this.renderSettings();
	}

	hide(): void {
		this.stopPairing();
	}

	// MARK: - Setting builders (shared by the declarative & fallback paths)

	private buildVaultFolder(setting: Setting): void {
		setting
			.setName("Vault folder")
			.setDesc(DESC.vaultFolder)
			.addText((text) =>
				text
					.setPlaceholder("Linkwise")
					.setValue(this.plugin.settings.vaultRoot)
					.onChange(async (value) => {
						this.plugin.settings.vaultRoot = value.trim() || "Linkwise";
						await this.plugin.saveSettings();
					}),
			);
	}

	private buildAutoSync(setting: Setting): void {
		setting
			.setName("Auto-sync interval")
			.setDesc(DESC.autoSync)
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
	}

	private buildDeletePolicy(setting: Setting): void {
		setting
			.setName("When a link is deleted in Linkwise")
			.setDesc(DESC.deletePolicy)
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
	}

	private buildShowCover(setting: Setting): void {
		setting
			.setName("Show cover image")
			.setDesc(DESC.showCover)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showCover)
					.onChange(async (value) => {
						this.plugin.settings.showCover = value;
						await this.plugin.saveSettings();
					}),
			);
	}

	private buildGraphColors(setting: Setting): void {
		setting
			.setName("Graph colors")
			.setDesc(DESC.graphColors)
			.addButton((btn) =>
				btn
					.setButtonText("Set up graph colors")
					.onClick(() => void this.plugin.setupGraphColors()),
			);
	}

	private syncDesc(): string {
		return this.plugin.settings.lastSyncAt
			? `Last synced: ${new Date(this.plugin.settings.lastSyncAt).toLocaleString()}`
			: "Not synced yet.";
	}

	private buildSync(setting: Setting): void {
		setting
			.setName("Sync")
			.setDesc(this.syncDesc())
			.addButton((btn) =>
				btn
					.setButtonText("Sync now")
					.setCta()
					.onClick(async () => {
						await this.plugin.syncNow();
						this.rerender();
					}),
			);
	}

	private buildToken(setting: Setting): void {
		setting
			.setName("Personal access token")
			.setDesc(DESC.token)
			.addText((text) => {
				text.inputEl.type = "password";
				text.inputEl.addClass("linkwise-token-input");
				text
					.setPlaceholder("lw_pat_…")
					.setValue(this.plugin.settings.token)
					.onChange(async (value) => {
						this.plugin.settings.token = value.trim();
						await this.plugin.saveSettings();
					});
			});
	}

	private buildApiBaseUrl(setting: Setting): void {
		setting
			.setName("API base URL")
			.setDesc(DESC.apiBaseUrl)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.apiBaseUrl)
					.setValue(this.plugin.settings.apiBaseUrl)
					.onChange(async (value) => {
						this.plugin.settings.apiBaseUrl = value.trim() || DEFAULT_SETTINGS.apiBaseUrl;
						await this.plugin.saveSettings();
					}),
			);
	}

	private buildReset(setting: Setting): void {
		setting
			.setName("Reset sync state")
			.setDesc(DESC.reset)
			.addButton((btn) => {
				btn.buttonEl.addClass("mod-warning");
				btn.setButtonText("Reset cursor").onClick(async () => {
					this.plugin.settings.cursor = "";
					await this.plugin.saveSettings();
					new Notice("Linkwise: sync cursor reset. Run 'sync now' to re-pull everything.");
					this.rerender();
				});
			});
	}

	// MARK: - Connection section

	/**
	 * The connection row: either a "Connected / Disconnect" row, or a "Connect
	 * with QR" row with an inline pairing panel. The QR panel is appended to
	 * `container` when given (the fallback path), otherwise next to the row itself
	 * (the declarative path renders the row into its own list).
	 */
	private buildConnection(setting: Setting, container?: HTMLElement): void {
		const host = container ?? setting.settingEl.parentElement ?? this.containerEl;
		if (this.plugin.settings.token) {
			setting
				.setName("Connected to Linkwise")
				.setDesc(DESC.connected)
				.addButton((btn) => {
					btn.buttonEl.addClass("mod-warning");
					btn.setButtonText("Disconnect").onClick(async () => {
						this.plugin.settings.token = "";
						this.plugin.settings.cursor = "";
						await this.plugin.saveSettings();
						new Notice("Linkwise: disconnected.");
						this.rerender();
					});
				});
			return;
		}

		setting.setName("Connect with QR").setDesc(DESC.connect);

		const panel = host.createDiv({ cls: "linkwise-qr-panel" });
		setting.addButton((btn) =>
			btn
				.setButtonText("Show QR code")
				.setCta()
				.onClick(() => void this.beginPairing(panel)),
		);
	}

	// MARK: - Pairing flow

	private async beginPairing(panel: HTMLElement): Promise<void> {
		this.stopPairing();
		panel.empty();
		panel.createEl("p", { text: "Starting…", cls: "linkwise-qr-status" });

		let session: PairingSession;
		try {
			session = await startPairing(this.plugin.settings.apiBaseUrl);
		} catch (e) {
			const msg = e instanceof PairingError || e instanceof Error ? e.message : String(e);
			this.renderPairingError(panel, msg);
			return;
		}
		this.pairing = session;

		panel.empty();

		// QR image (encodes the deep link the app recognizes).
		const qr = qrcode(0, "M");
		qr.addData(session.deep_link);
		qr.make();
		const img = panel.createEl("img", { cls: "linkwise-qr-image" });
		img.src = qr.createDataURL(6, 4);
		img.alt = "Linkwise pairing QR code";

		panel.createEl("p", {
			cls: "linkwise-qr-status",
			text: "Scan this in the Linkwise app to connect. Waiting…",
		});
		panel.createEl("p", {
			cls: "linkwise-qr-code",
			text: `Or enter this code manually: ${session.code}`,
		});

		// Poll until approved/expired.
		this.pollTimer = window.setInterval(() => void this.pollOnce(panel), POLL_INTERVAL_MS);
		this.plugin.registerInterval(this.pollTimer);

		// Hard stop at expiry (in case the request lapses server-side).
		const ms = Math.max(1000, session.expires_in * 1000);
		this.expiryTimer = window.setTimeout(() => this.renderExpired(panel), ms);
	}

	private async pollOnce(panel: HTMLElement): Promise<void> {
		if (!this.pairing) return;
		try {
			const result = await pollPairing(this.plugin.settings.apiBaseUrl, this.pairing.request_id, this.pairing.secret);
			if (result.status === "approved") {
				this.stopPairing();
				this.plugin.settings.token = result.token;
				this.plugin.settings.cursor = "";
				await this.plugin.saveSettings();
				new Notice("Linkwise: connected! Starting first sync…");
				void this.plugin.syncNow().then(() => this.rerender());
				this.rerender();
			} else if (result.status === "expired") {
				this.renderExpired(panel);
			}
			// "pending" / "consumed" → keep waiting (consumed shouldn't happen for us).
		} catch (e) {
			// Transient network hiccups shouldn't kill the loop; log and keep polling.
			console.error("Linkwise pairing poll failed", e);
		}
	}

	private renderExpired(panel: HTMLElement): void {
		this.stopPairing();
		panel.empty();
		panel.createEl("p", { cls: "linkwise-qr-status", text: "This code expired. Generate a new one." });
		const btn = panel.createEl("button", { text: "New QR code", cls: "mod-cta" });
		btn.addEventListener("click", () => void this.beginPairing(panel));
	}

	private renderPairingError(panel: HTMLElement, message: string): void {
		this.stopPairing();
		panel.empty();
		panel.createEl("p", { cls: "linkwise-qr-status", text: message });
		const btn = panel.createEl("button", { text: "Try again", cls: "mod-cta" });
		btn.addEventListener("click", () => void this.beginPairing(panel));
	}

	private stopPairing(): void {
		if (this.pollTimer !== null) {
			window.clearInterval(this.pollTimer);
			this.pollTimer = null;
		}
		if (this.expiryTimer !== null) {
			window.clearTimeout(this.expiryTimer);
			this.expiryTimer = null;
		}
		this.pairing = null;
	}
}
