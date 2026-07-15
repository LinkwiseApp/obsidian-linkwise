// QR pairing client (Matter-style). The plugin isn't logged in, so it can't mint a
// token itself. Instead it asks the backend to open a short-lived pairing request
// (obsidian-pair-init), shows the returned code as a QR, and polls
// (obsidian-pair-poll) with a private `secret` until the signed-in Linkwise app
// scans the QR and approves it — at which point the poll returns the token once.
//
// Uses Obsidian's `requestUrl` (mobile-safe, no CORS), like api.ts. These endpoints
// are unauthenticated (verify_jwt=false); the `secret` is what protects delivery.

import { requestUrl } from "obsidian";

export interface PairingSession {
	request_id: string;
	code: string;
	secret: string;
	/** Encoded into the QR; the app recognizes it as an Obsidian pairing. */
	deep_link: string;
	expires_at: string;
	expires_in: number;
}

export type PollResult =
	| { status: "pending" }
	| { status: "approved"; token: string }
	| { status: "consumed" }
	| { status: "expired" };

export class PairingError extends Error {}

function endpoint(baseUrl: string, fn: string): string {
	return `${baseUrl.replace(/\/+$/, "")}/${fn}`;
}

/** Open a pairing request. The caller renders `deep_link` as a QR and polls. */
export async function startPairing(baseUrl: string): Promise<PairingSession> {
	const res = await requestUrl({
		url: endpoint(baseUrl, "obsidian-pair-init"),
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: "{}",
		throw: false,
	});
	if (res.status >= 400) {
		const msg = (res.json as { error?: string } | undefined)?.error ?? `Could not start pairing (HTTP ${res.status}).`;
		throw new PairingError(msg);
	}
	return res.json as PairingSession;
}

/** Poll once for the pairing result. Safe to call on a timer until non-pending. */
export async function pollPairing(
	baseUrl: string,
	requestId: string,
	secret: string,
): Promise<PollResult> {
	const res = await requestUrl({
		url: endpoint(baseUrl, "obsidian-pair-poll"),
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ request_id: requestId, secret }),
		throw: false,
	});
	if (res.status >= 400) {
		const msg = (res.json as { error?: string } | undefined)?.error ?? `Pairing check failed (HTTP ${res.status}).`;
		throw new PairingError(msg);
	}
	return res.json as PollResult;
}
