import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MEKANN_DASHBOARD_DEFAULTS } from "../../config.js";
import { renderTerminalImage } from "../terminal/launch.js";
import { registerCleanupPath } from "./cleanup.js";
import { isLikelyKitty } from "./kitty-env.js";

export { isLikelyKitty };

export type DashboardAvatarResult = { ok: true; path: string; columns: number; rows: number } | { ok: false; error: string };

/** PNG signature bytes (IC-232: validate downloaded avatar is actually a PNG). */
export const AVATAR_PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Upper bound for an avatar download (IC-232: bound tmpdir write size). */
export const AVATAR_MAX_BYTES = 4 * 1024 * 1024;

/** Trusted avatar hosts. GitHub avatars are always served from here. */
export const AVATAR_TRUSTED_HOSTS = new Set(["avatars.githubusercontent.com"]);

export type AvatarUrlClassification = { ok: true; parsed: URL } | { ok: false; error: string };

/**
 * Classify an avatar URL for SSRF safety (IC-232).
 *
 * Only HTTPS URLs on a trusted host are accepted. This prevents route
 * tampering or a future user-configurable URL from reaching internal
 * network endpoints (cloud metadata, localhost, link-local ranges).
 */
export function classifyAvatarUrl(url: string): AvatarUrlClassification {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return { ok: false, error: "Avatar URL is invalid" };
	}
	if (parsed.protocol !== "https:") {
		return { ok: false, error: "Avatar URL must use HTTPS" };
	}
	if (!AVATAR_TRUSTED_HOSTS.has(parsed.hostname)) {
		return { ok: false, error: "Avatar host is not trusted" };
	}
	return { ok: true, parsed };
}

export async function fetchKittyAvatar(url: string | undefined, options: { enabled: boolean; columns?: number; rows?: number } = { enabled: true }): Promise<DashboardAvatarResult | undefined> {
	if (!options.enabled || !url) return undefined;
	if (!isLikelyKitty()) return { ok: false, error: "Kitty graphics unavailable" };
	const classified = classifyAvatarUrl(url);
	if (!classified.ok) return { ok: false, error: classified.error };
	try {
		const response = await fetch(classified.parsed);
		if (!response.ok) return { ok: false, error: `Avatar download failed: ${response.status}` };
		const bytes = Buffer.from(await response.arrayBuffer());
		// IC-232: reject oversized or non-PNG payloads before touching tmpdir so a
		// tampered route cannot drop arbitrary bytes on disk.
		if (bytes.length > AVATAR_MAX_BYTES) return { ok: false, error: "Avatar exceeds size limit" };
		if (bytes.length < AVATAR_PNG_MAGIC.length || !bytes.subarray(0, AVATAR_PNG_MAGIC.length).equals(AVATAR_PNG_MAGIC)) {
			return { ok: false, error: "Avatar is not a valid PNG" };
		}
		const dir = await mkdtemp(join(tmpdir(), "mekann-dashboard-avatar-"));
		registerCleanupPath(dir);
		const path = join(dir, "avatar.png");
		await writeFile(path, bytes);
		return { ok: true, path, columns: options.columns ?? 18, rows: options.rows ?? 8 };
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
}

export async function renderKittyAvatar(avatar: DashboardAvatarResult | undefined, options: { x: number; y: number }): Promise<void> {
	await renderKittyImage(avatar, options);
}

export async function renderKittyImage(image: { ok: true; path: string; columns: number; rows: number } | { ok: false; error: string } | undefined, options: { x: number; y: number }): Promise<void> {
	if (!image?.ok) return;
	await renderTerminalImage({ path: image.path, columns: image.columns, rows: image.rows, x: options.x, y: options.y });
}

export function kittyGraphicsEscape(bytes: Buffer, options: { columns: number; rows: number; chunkChars?: number }): string {
	const payload = bytes.toString("base64");
	// Kitty graphics protocol transmits an image as a sequence of APC
	// (`ESC _ G ... ESC \`) commands; each command carries a slice of the
	// base64 payload with `m=1` to signal more chunks follow. The slice must
	// stay small enough for the terminal to buffer and reassemble without
	// truncation — Kitty's own `kitten icat` uses ~4 KiB chunks, so 4096 base64
	// chars is the default here. `chunkChars` lets a caller pass a
	// terminal-capability-aware value (e.g. larger chunks on capable terminals
	// to reduce the escape-sequence flood on huge images). Issue #166 / IC-233.
	const chunkSize = options.chunkChars ?? MEKANN_DASHBOARD_DEFAULTS.kittyChunkChars;
	const chunks = payload.match(new RegExp(`.{1,${Math.max(1, Math.floor(chunkSize))}}`, "g")) ?? [""];
	return chunks.map((chunk, index) => {
		const more = index < chunks.length - 1 ? 1 : 0;
		const header = index === 0
			? `a=T,f=100,t=d,c=${options.columns},r=${options.rows},m=${more}`
			: `m=${more}`;
		return `\x1b_G${header};${chunk}\x1b\\`;
	}).join("");
}
