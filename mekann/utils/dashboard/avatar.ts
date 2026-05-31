import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderTerminalImage } from "../terminal/launch.js";
import { registerCleanupPath } from "./cleanup.js";

export type DashboardAvatarResult = { ok: true; path: string; columns: number; rows: number } | { ok: false; error: string };

export async function fetchKittyAvatar(url: string | undefined, options: { enabled: boolean; columns?: number; rows?: number } = { enabled: true }): Promise<DashboardAvatarResult | undefined> {
	if (!options.enabled || !url) return undefined;
	if (!isLikelyKitty()) return { ok: false, error: "Kitty graphics unavailable" };
	try {
		const response = await fetch(url);
		if (!response.ok) return { ok: false, error: `Avatar download failed: ${response.status}` };
		const bytes = Buffer.from(await response.arrayBuffer());
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

export function isLikelyKitty(env: NodeJS.ProcessEnv = process.env): boolean {
	return Boolean(env.KITTY_WINDOW_ID || env.TERM?.toLowerCase().includes("kitty"));
}

export function kittyGraphicsEscape(bytes: Buffer, options: { columns: number; rows: number }): string {
	const payload = bytes.toString("base64");
	const chunks = payload.match(/.{1,4096}/g) ?? [""];
	return chunks.map((chunk, index) => {
		const more = index < chunks.length - 1 ? 1 : 0;
		const header = index === 0
			? `a=T,f=100,t=d,c=${options.columns},r=${options.rows},m=${more}`
			: `m=${more}`;
		return `\x1b_G${header};${chunk}\x1b\\`;
	}).join("");
}
