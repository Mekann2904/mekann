import * as fsp from "node:fs/promises";
import type { Dirent } from "node:fs";
import * as path from "node:path";
import { contextDir } from "./store.js";
import { randomIdSuffix } from "../../utils/id.js";

// ─── Paths ─────────────────────────────────────────────────────

export function snapshotsDir(cwd: string): string {
	return path.join(contextDir(cwd), "snapshots");
}

export function latestSnapshotPath(cwd: string): string {
	return path.join(snapshotsDir(cwd), "latest.xml");
}

export function timestampedSnapshotPath(cwd: string, now: number): string {
	const ts = new Date(now).toISOString().replace(/[:.]/g, "-");
	const suffix = randomIdSuffix();
	return path.join(snapshotsDir(cwd), `snapshot-${ts}-${suffix}.xml`);
}

// ─── Write ─────────────────────────────────────────────────────

export interface WriteSnapshotResult {
	latestPath: string;
	snapshotPath: string;
	bytes: number;
}

export interface WriteSnapshotOptions {
	/**
	 * When set to a positive integer, retain only the `retentionMaxFiles`
	 * newest timestamped snapshots after writing (issue #76 / C-018). Symmetric
	 * with output-gate `retainArtifacts`. `latest.xml` is never pruned.
	 * Best-effort: retention failures never break snapshotting.
	 */
	retentionMaxFiles?: number;
}

export async function writeLatestSnapshot(
	cwd: string,
	xml: string,
	now?: () => number,
	options?: WriteSnapshotOptions,
): Promise<WriteSnapshotResult> {
	const dir = snapshotsDir(cwd);
	await fsp.mkdir(dir, { recursive: true });

	const latest = latestSnapshotPath(cwd);
	const ts = timestampedSnapshotPath(cwd, (now ?? Date.now)());
	await fsp.writeFile(latest, xml, "utf8");
	await fsp.writeFile(ts, xml, "utf8");

	// Prune AFTER writing so the just-written snapshot is always kept.
	const retentionMaxFiles = options?.retentionMaxFiles;
	if (retentionMaxFiles && retentionMaxFiles > 0) {
		try {
			await retainSnapshots(cwd, retentionMaxFiles);
		} catch {
			// Retention must never break snapshotting
		}
	}

	return {
		latestPath: latest,
		snapshotPath: ts,
		bytes: Buffer.byteLength(xml, "utf8"),
	};
}

// ─── Retention ─────────────────────────────────────────────────

export interface RetainSnapshotsResult {
	kept: string[];
	removed: number;
	trashed?: string[];
}

const TIMESTAMPED_SNAPSHOT_RE = /^snapshot-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9]{6}\.xml$/;

/**
 * Keep the `keepCount` newest timestamped snapshots in the snapshots dir,
 * moving older ones into `.trash/` rather than unlinking them. `latest.xml` is never pruned (it does not match the
 * `snapshot-*` pattern). Filenames carry an ISO-8601 timestamp (colon/dot
 * replaced with `-`), so lexicographic order matches creation order; ties
 * within the same millisecond fall back to the random hex suffix.
 *
 * No-op when the snapshots dir does not exist or the count is within the
 * limit. Best-effort: per-file unlink failures are swallowed. Symmetric with
 * output-gate `retainArtifacts` (issue #76 / C-018).
 */
export async function retainSnapshots(cwd: string, keepCount: number): Promise<RetainSnapshotsResult> {
	const limit = Math.max(0, Math.floor(keepCount));
	const dir = snapshotsDir(cwd);
	let entries: Dirent[];
	try {
		entries = await fsp.readdir(dir, { withFileTypes: true });
	} catch (error: any) {
		if (error?.code === "ENOENT") return { kept: [], removed: 0 };
		throw error;
	}
	const names = entries
		.filter((e) => e.isFile() && TIMESTAMPED_SNAPSHOT_RE.test(e.name))
		.map((e) => e.name)
		.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)); // newest first
	if (names.length <= limit) return { kept: names, removed: 0 };
	const toRemove = names.slice(limit);
	let removed = 0;
	const trashed: string[] = [];
	const trashDir = path.join(dir, ".trash");
	await fsp.mkdir(trashDir, { recursive: true });
	for (const name of toRemove) {
		try {
			const dest = path.join(trashDir, `${Date.now()}-${name}`);
			await fsp.rename(path.join(dir, name), dest);
			trashed.push(path.basename(dest));
			removed++;
		} catch {
			/* ignore missing/unmovable file */
		}
	}
	if (removed > 0) {
		try {
			await fsp.appendFile(path.join(dir, "retention.audit.jsonl"), `${JSON.stringify({ createdAt: Date.now(), event: "snapshots_retained", keepCount: limit, kept: names.slice(0, limit), trashed })}\n`, "utf8");
		} catch {
			/* audit is best-effort */
		}
	}
	return { kept: names.slice(0, limit), removed, trashed };
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
