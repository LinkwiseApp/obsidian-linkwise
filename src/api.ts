// The Linkwise pull API. Uses Obsidian's `requestUrl` (not fetch) so it works on
// mobile and sidesteps CORS. Authenticates with the user's personal access token
// as a Bearer header — the same token minted in the Linkwise iOS app.

import { requestUrl } from "obsidian";

/** One note, already rendered to Markdown pieces by the server. */
export interface PulledNote {
	linkwise_id: string;
	/** Canonical vault-relative path, e.g. "Linkwise/Research/title.md". */
	path: string;
	/** YAML frontmatter incl. the `---` fences. */
	frontmatter: string;
	/** Managed body (source callout, summary, highlights) — rendered above the user's `## My notes`. */
	managed: string;
	/** Sanitized collection folder name (for MOC grouping). */
	collection: string;
}

export interface Tombstone {
	linkwise_id: string;
	deleted_at: string;
}

export interface PullResponse {
	notes: PulledNote[];
	tombstones: Tombstone[];
	next_cursor: string;
	has_more: boolean;
}

export interface PullParams {
	baseUrl: string;
	token: string;
	cursor: string;
	root: string;
	limit?: number;
}

export class LinkwiseApiError extends Error {}

/** Fetch one page of changes since `cursor`. Throws LinkwiseApiError on failure. */
export async function pull(params: PullParams): Promise<PullResponse> {
	const url = `${params.baseUrl.replace(/\/+$/, "")}/obsidian-sync-pull`;

	const res = await requestUrl({
		url,
		method: "POST",
		headers: {
			Authorization: `Bearer ${params.token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			cursor: params.cursor || "epoch",
			root: params.root,
			limit: params.limit ?? 100,
		}),
		throw: false,
	});

	if (res.status === 401) {
		throw new LinkwiseApiError(
			"Invalid or revoked token. Generate a new one in the Linkwise app and paste it below.",
		);
	}
	if (res.status === 403) {
		throw new LinkwiseApiError("Obsidian sync is a Linkwise Pro feature.");
	}
	if (res.status >= 400) {
		const body = res.json as { error?: string } | undefined;
		const msg = body?.error ?? `Sync failed (HTTP ${res.status}).`;
		throw new LinkwiseApiError(msg);
	}

	return res.json as PullResponse;
}
