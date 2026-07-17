// The pull-and-upsert engine.
//
// Each sync pulls pages of changes since a saved cursor and merges them into the
// vault. Notes are indexed by their frontmatter `linkwise_id`, so a user can
// freely rename or move a note and it still updates in place. Only the
// frontmatter and the fenced managed region are rewritten (see markdown.ts);
// everything else the user wrote is preserved. Deletes are handled per the user's
// delete policy — never a destructive default.

import { normalizePath, TFile, TFolder } from "obsidian";
import { pull, type PulledNote, type Tombstone } from "./api";
import { composeNote, buildMOC, mocBaseName, stripSavedFromBanner } from "./markdown";
import type LinkwisePlugin from "./main";

export interface SyncResult {
	created: number;
	updated: number;
	deleted: number;
}

const MAX_PAGES = 1000; // safety valve against a misbehaving cursor

export class SyncEngine {
	constructor(private plugin: LinkwisePlugin) {}

	private get app() {
		return this.plugin.app;
	}
	private get settings() {
		return this.plugin.settings;
	}

	async run(): Promise<SyncResult> {
		const s = this.settings;
		if (!s.token) {
			throw new Error("Add your Linkwise personal access token in settings first.");
		}

		const result: SyncResult = { created: 0, updated: 0, deleted: 0 };
		const index = this.buildIndex();
		const touchedCollections = new Set<string>();

		let cursor = s.cursor;
		let pages = 0;

		while (pages < MAX_PAGES) {
			const page = await pull({
				baseUrl: s.apiBaseUrl,
				token: s.token,
				cursor,
				root: s.vaultRoot,
			});

			for (const note of page.notes) {
				const outcome = await this.upsertNote(note, index);
				if (outcome === "created") result.created++;
				else result.updated++;
				if (note.collection) touchedCollections.add(note.collection);
			}

			for (const tomb of page.tombstones) {
				if (await this.applyTombstone(tomb, index)) result.deleted++;
			}

			// Persist the cursor after every page so an interrupted sync resumes.
			cursor = page.next_cursor;
			s.cursor = cursor;
			await this.plugin.saveSettings();

			pages++;
			if (!page.has_more) break;
		}

		await this.regenerateMOCs(touchedCollections);

		s.lastSyncAt = new Date().toISOString();
		await this.plugin.saveSettings();
		return result;
	}

	// MARK: - Indexing

	/** Map of frontmatter `linkwise_id` → file, across the whole vault. */
	private buildIndex(): Map<string, TFile> {
		const map = new Map<string, TFile>();
		for (const file of this.app.vault.getMarkdownFiles()) {
			const id: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter?.linkwise_id;
			if (typeof id === "string" && id.length > 0) map.set(id, file);
		}
		return map;
	}

	// MARK: - Upsert

	private async upsertNote(note: PulledNote, index: Map<string, TFile>): Promise<"created" | "updated"> {
		const managed = this.managedBody(note);
		const existing = index.get(note.linkwise_id);
		if (existing) {
			const current = await this.app.vault.read(existing);
			const merged = composeNote(note.frontmatter, managed, current);
			if (merged !== current) await this.app.vault.modify(existing, merged);
			return "updated";
		}

		const path = await this.resolveFreePath(normalizePath(note.path), note.linkwise_id);
		await this.ensureFolder(path);
		const created = await this.app.vault.create(path, composeNote(note.frontmatter, managed, null));
		index.set(note.linkwise_id, created);
		return "created";
	}

	/** The managed body to write — banner stripped unless the user opted to keep it. */
	private managedBody(note: PulledNote): string {
		return this.settings.showSavedFrom ? note.managed : stripSavedFromBanner(note.managed);
	}

	/**
	 * The canonical path is a title inside a collection folder; two different
	 * links can collide there. If something already occupies the path, append a
	 * short id so we never overwrite an unrelated note.
	 */
	private async resolveFreePath(path: string, id: string): Promise<string> {
		if (!this.app.vault.getAbstractFileByPath(path)) return path;
		const suffix = id.replace(/-/g, "").slice(0, 8);
		const withId = path.replace(/\.md$/i, ` (${suffix}).md`);
		if (!this.app.vault.getAbstractFileByPath(withId)) return withId;
		// Extremely unlikely; fall back to a timestamped variant.
		return path.replace(/\.md$/i, ` (${suffix}-${Date.now()}).md`);
	}

	/** Create any missing parent folders for a file path. */
	private async ensureFolder(filePath: string): Promise<void> {
		const dir = filePath.split("/").slice(0, -1).join("/");
		if (!dir) return;
		const segments = dir.split("/");
		let current = "";
		for (const seg of segments) {
			current = current ? `${current}/${seg}` : seg;
			const existing = this.app.vault.getAbstractFileByPath(current);
			if (!existing) {
				try {
					await this.app.vault.createFolder(current);
				} catch {
					// Raced/exists — safe to ignore.
				}
			}
		}
	}

	// MARK: - Deletes

	private async applyTombstone(tomb: Tombstone, index: Map<string, TFile>): Promise<boolean> {
		const file = index.get(tomb.linkwise_id);
		if (!file) return false;

		switch (this.settings.deletePolicy) {
			case "ignore":
				return false;
			case "mark":
				await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
					fm.linkwise_deleted = true;
				});
				return true;
			case "trash": {
				const trashDir = normalizePath(`${this.settings.vaultRoot}/_trash`);
				await this.ensureFolder(`${trashDir}/x`);
				let target = normalizePath(`${trashDir}/${file.name}`);
				if (this.app.vault.getAbstractFileByPath(target)) {
					target = normalizePath(`${trashDir}/${file.basename} (${Date.now()}).md`);
				}
				await this.app.fileManager.renameFile(file, target);
				index.delete(tomb.linkwise_id);
				return true;
			}
			default:
				return false;
		}
	}

	// MARK: - Maps of Content

	/**
	 * Rebuild the Map of Content for each collection whose notes changed this sync.
	 *
	 * The MOC file is named `🗺️ <collection>.md` so its graph node and explorer
	 * entry read as a distinct map. The MOC is identified by its `linkwise_moc: true`
	 * frontmatter, so legacy MOCs (a plain `MOC.md`, an older `<collection> (MOC).md`,
	 * `<collection>.md`, or `_MOC.md`) are transparently renamed in place.
	 */
	private async regenerateMOCs(collections: Set<string>): Promise<void> {
		for (const collection of collections) {
			const folderPath = normalizePath(`${this.settings.vaultRoot}/${collection}`);
			const folder = this.app.vault.getAbstractFileByPath(folderPath);
			if (!(folder instanceof TFolder)) continue;

			const baseNames: string[] = [];
			let existingMoc: TFile | null = null;
			for (const child of folder.children) {
				if (!(child instanceof TFile) || child.extension !== "md") continue;
				const flags = await this.readNoteFlags(child);
				// The MOC carries `linkwise_moc: true` and no `linkwise_id`; a legacy MOC
				// may still be named `_MOC`. Everything else with an id is a real note.
				if (flags.isMoc || child.basename === "_MOC") {
					existingMoc = child;
					continue;
				}
				if (flags.hasLinkwiseId) baseNames.push(child.basename);
			}

			const content = buildMOC(collection, baseNames);
			const desiredPath = normalizePath(`${folderPath}/${mocBaseName(collection)}.md`);

			if (existingMoc) {
				// Rename to `🗺️ <collection>.md` when it's free (a note could already
				// occupy it if one is titled exactly that — leave it in place then).
				if (
					existingMoc.path !== desiredPath &&
					!this.app.vault.getAbstractFileByPath(desiredPath)
				) {
					await this.app.fileManager.renameFile(existingMoc, desiredPath);
				}
				await this.app.vault.modify(existingMoc, content);
			} else {
				// A real note may already sit at that path; fall back so we never overwrite it.
				const mocPath = this.app.vault.getAbstractFileByPath(desiredPath)
					? normalizePath(`${folderPath}/${mocBaseName(collection)} (index).md`)
					: desiredPath;
				await this.app.vault.create(mocPath, content);
			}
		}
	}

	/**
	 * Whether a note is the collection's MOC and whether it carries a `linkwise_id`.
	 *
	 * Prefers Obsidian's metadata cache, but that cache lags files written earlier in
	 * this same sync — a freshly created note reports no frontmatter yet, which would
	 * make a brand-new collection's MOC index zero links. So when the cache is cold we
	 * read the frontmatter block straight from disk.
	 */
	private async readNoteFlags(file: TFile): Promise<{ isMoc: boolean; hasLinkwiseId: boolean }> {
		const cached = this.app.metadataCache.getFileCache(file)?.frontmatter;
		if (cached) {
			const id: unknown = cached.linkwise_id;
			return {
				isMoc: cached.linkwise_moc === true,
				hasLinkwiseId: typeof id === "string" && id.length > 0,
			};
		}
		let content: string;
		try {
			content = await this.app.vault.cachedRead(file);
		} catch {
			return { isMoc: false, hasLinkwiseId: false };
		}
		const match = /^---\n([\s\S]*?)\n---/.exec(content);
		const yaml = match?.[1] ?? "";
		return {
			isMoc: /^linkwise_moc:\s*true\s*$/im.test(yaml),
			hasLinkwiseId: /^linkwise_id:\s*["']?\S/im.test(yaml),
		};
	}
}
