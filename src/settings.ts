import { App, PluginSettingTab, Setting, Notice } from "obsidian";
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

const POLL_INTERVAL_MS = 2500;

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

	display(): void {
		this.renderSettings();
	}

	private renderSettings(): void {
		const { containerEl } = this;
		this.stopPairing(); // never leave a poll loop running across a re-render
		containerEl.empty();

		this.renderConnection(containerEl);

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
			.setDesc("How often to pull automatically. 'manual only' pulls when you run the sync command.")
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
						this.renderSettings();
					}),
			);

		// Advanced ----------------------------------------------------------------
		new Setting(containerEl).setName("Advanced").setHeading();

		new Setting(containerEl)
			.setName("Personal access token")
			.setDesc("Manual fallback. Generate a token in the Linkwise app (Settings → Integrations → Linkwise for Obsidian) and paste it here instead of scanning.")
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
					.setDestructive()
					.onClick(async () => {
						this.plugin.settings.cursor = "";
						await this.plugin.saveSettings();
						new Notice("Linkwise: sync cursor reset. Run 'sync now' to re-pull everything.");
						this.renderSettings();
					}),
			);
	}

	hide(): void {
		this.stopPairing();
	}

	// MARK: - Connection section

	private renderConnection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Connection").setHeading();

		if (this.plugin.settings.token) {
			new Setting(containerEl)
				.setName("Connected to Linkwise")
				.setDesc("The plugin is linked and will sync using your saved token.")
				.addButton((btn) =>
					btn
						.setButtonText("Disconnect")
						.setDestructive()
						.onClick(async () => {
							this.plugin.settings.token = "";
							this.plugin.settings.cursor = "";
							await this.plugin.saveSettings();
							new Notice("Linkwise: disconnected.");
							this.renderSettings();
						}),
				);
			return;
		}

		const scanSetting = new Setting(containerEl)
			.setName("Connect with QR")
			.setDesc("Generate a QR code, then scan it in the Linkwise app: Settings → Integrations → Linkwise for Obsidian → scan to connect. Requires Linkwise Pro.");

		const panel = containerEl.createDiv({ cls: "linkwise-qr-panel" });

		scanSetting.addButton((btn) =>
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
				void this.plugin.syncNow().then(() => this.renderSettings());
				this.renderSettings();
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
