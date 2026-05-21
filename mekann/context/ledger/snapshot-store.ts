import * as crypto from "node:crypto";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { contextDir } from "./store.js";

// ─── Paths ─────────────────────────────────────────────────────

export function snapshotsDir(cwd: string): string {
	return path.join(contextDir(cwd), "snapshots");
}

export function latestSnapshotPath(cwd: string): string {
	return path.join(snapshotsDir(cwd), "latest.xml");
}

export function timestampedSnapshotPath(cwd: string, now: number): string {
	const ts = new Date(now).toISOString().replace(/[:.]/g, "-");
	const suffix = crypto.randomBytes(3).toString("hex");
	return path.join(snapshotsDir(cwd), `snapshot-${ts}-${suffix}.xml`);
}

// ─── Write ─────────────────────────────────────────────────────

export interface WriteSnapshotResult {
	latestPath: string;
	snapshotPath: string;
	bytes: number;
}

export async function writeLatestSnapshot(
	cwd: string,
	xml: string,
	now?: () => number,
): Promise<WriteSnapshotResult> {
	const dir = snapshotsDir(cwd);
	await fsp.mkdir(dir, { recursive: true });

	const latest = latestSnapshotPath(cwd);
	const ts = timestampedSnapshotPath(cwd, (now ?? Date.now)());
	await fsp.writeFile(latest, xml, "utf8");
	await fsp.writeFile(ts, xml, "utf8");

	return {
		latestPath: latest,
		snapshotPath: ts,
		bytes: Buffer.byteLength(xml, "utf8"),
	};
}

// ─── Read ──────────────────────────────────────────────────────

export async function readLatestSnapshot(cwd: string): Promise<string | undefined> {
	const latest = latestSnapshotPath(cwd);
	try {
		return await fsp.readFile(latest, "utf8");
	} catch {
		return undefined;
	}
}

export async function readBoundedLatestSnapshot(cwd: string, maxBytes: number): Promise<string | undefined> {
	const xml = await readLatestSnapshot(cwd);
	if (!xml) return undefined;
	if (Buffer.byteLength(xml, "utf8") <= maxBytes) return xml;
	return undefined;
}
