import { describe, expect, it } from "vitest";
import * as fsp from "node:fs/promises";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	snapshotsDir,
	latestSnapshotPath,
	timestampedSnapshotPath,
	writeLatestSnapshot,
	readLatestSnapshot,
	retainSnapshots,
} from "./snapshot-store.js";
import { appendContextEvent } from "./store.js";

async function tmp(): Promise<string> {
	return fsp.mkdtemp(path.join(os.tmpdir(), "og-snap-store-"));
}

describe("snapshot-store", () => {
	it("writeLatestSnapshot creates latest.xml and timestamped file", async () => {
		const cwd = await tmp();
		const xml = "<mekann_session_context><test /></mekann_session_context>\n";
		const now = () => 1700000000000;
		const result = await writeLatestSnapshot(cwd, xml, now);

		expect(result.bytes).toBe(Buffer.byteLength(xml, "utf8"));
		expect(result.latestPath).toBe(latestSnapshotPath(cwd));
		expect(fs.existsSync(result.latestPath)).toBe(true);
		expect(fs.existsSync(result.snapshotPath)).toBe(true);
		expect(await fsp.readFile(result.latestPath, "utf8")).toBe(xml);
		expect(await fsp.readFile(result.snapshotPath, "utf8")).toBe(xml);
	});

	it("readLatestSnapshot returns undefined when no snapshot", async () => {
		const cwd = await tmp();
		const content = await readLatestSnapshot(cwd);
		expect(content).toBeUndefined();
	});

	it("readLatestSnapshot returns saved content", async () => {
		const cwd = await tmp();
		const xml = "<mekann_session_context />\n";
		await writeLatestSnapshot(cwd, xml, () => 1700000000000);
		const content = await readLatestSnapshot(cwd);
		expect(content).toBe(xml);
	});

	it("writeLatestSnapshot overwrites previous latest", async () => {
		const cwd = await tmp();
		await writeLatestSnapshot(cwd, "old\n", () => 1700000000000);
		await writeLatestSnapshot(cwd, "new\n", () => 1700000001000);
		const content = await readLatestSnapshot(cwd);
		expect(content).toBe("new\n");
	});

	it("timestampedSnapshotPath generates valid filename with random suffix", () => {
		const cwd = "/tmp/project";
		const ts = timestampedSnapshotPath(cwd, 1700000000000);
		expect(ts).toMatch(/snapshot-.*-[0-9a-f]{6}\.xml$/);
		expect(ts).toContain("snapshots");
	});

	it("snapshotsDir is under contextDir", () => {
		const cwd = "/tmp/project";
		expect(snapshotsDir(cwd)).toBe(path.join(cwd, ".pi/mekann-context/snapshots"));
	});

	it("readBoundedLatestSnapshot returns undefined when content exceeds maxBytes", async () => {
		const cwd = await tmp();
		const xml = "<mekann_session_context>" + "x".repeat(500) + "</mekann_session_context>\n";
		await writeLatestSnapshot(cwd, xml, () => 1700000000000);
		const result = await (await import("./snapshot-store.js")).readBoundedLatestSnapshot(cwd, 100);
		expect(result).toBeUndefined();
	});

	it("readBoundedLatestSnapshot returns content when within maxBytes", async () => {
		const cwd = await tmp();
		const xml = "<mekann_session_context />\n";
		await writeLatestSnapshot(cwd, xml, () => 1700000000000);
		const result = await (await import("./snapshot-store.js")).readBoundedLatestSnapshot(cwd, 1024);
		expect(result).toBe(xml);
	});

	// ─── Retention (issue #76 / C-018) ────────────────────────────

	describe("snapshot retention", () => {
		it("retainSnapshots is a no-op when under the limit", async () => {
			const cwd = await tmp();
			for (let i = 0; i < 3; i++) {
				await writeLatestSnapshot(cwd, `xml${i}\n`, () => 1700000000000 + i * 1000);
			}
			const result = await retainSnapshots(cwd, 10);
			expect(result.removed).toBe(0);
			expect(result.kept).toHaveLength(3);
			const files = (await fsp.readdir(snapshotsDir(cwd))).filter((n) => n.startsWith("snapshot-"));
			expect(files).toHaveLength(3);
		});

		it("retainSnapshots prunes oldest timestamped snapshots, keeps newest N", async () => {
			const cwd = await tmp();
			for (let i = 0; i < 5; i++) {
				await writeLatestSnapshot(cwd, `xml${i}\n`, () => 1700000000000 + i * 1000);
			}
			// Keep newest 2
			const result = await retainSnapshots(cwd, 2);
			expect(result.removed).toBe(3);
			expect(result.kept).toHaveLength(2);
			// Newest kept = the two last-written (highest timestamps)
			expect(result.kept[0] > result.kept[1]).toBe(true);
			const files = (await fsp.readdir(snapshotsDir(cwd))).filter((n) => n.startsWith("snapshot-"));
			expect(files).toHaveLength(2);
			expect(files).toEqual(expect.arrayContaining(result.kept));
		});

		it("retainSnapshots never prunes latest.xml or non-snapshot files", async () => {
			const cwd = await tmp();
			for (let i = 0; i < 4; i++) {
				await writeLatestSnapshot(cwd, `xml${i}\n`, () => 1700000000000 + i * 1000);
			}
			await fsp.writeFile(path.join(snapshotsDir(cwd), "snapshot-manual-note.xml"), "keep\n", "utf8");
			await retainSnapshots(cwd, 1);
			expect(fs.existsSync(latestSnapshotPath(cwd))).toBe(true);
			expect(fs.existsSync(path.join(snapshotsDir(cwd), "snapshot-manual-note.xml"))).toBe(true);
			expect(await readLatestSnapshot(cwd)).toBe("xml3\n");
		});

		it("retainSnapshots returns empty when dir does not exist", async () => {
			const cwd = await tmp();
			const result = await retainSnapshots(cwd, 5);
			expect(result).toEqual({ kept: [], removed: 0 });
		});

		it("writeLatestSnapshot applies retentionMaxFiles after writing", async () => {
			const cwd = await tmp();
			for (let i = 0; i < 4; i++) {
				await writeLatestSnapshot(cwd, `xml${i}\n`, () => 1700000000000 + i * 1000, { retentionMaxFiles: 2 });
			}
			const files = (await fsp.readdir(snapshotsDir(cwd))).filter((n) => n.startsWith("snapshot-"));
			expect(files).toHaveLength(2);
			// The just-written snapshot (xml3) is always kept because retention runs after.
			const contents = await Promise.all(files.map((f) => fsp.readFile(path.join(snapshotsDir(cwd), f), "utf8")));
			expect(contents).toContain("xml3\n");
		});

		it("writeLatestSnapshot skips retention when retentionMaxFiles is unset", async () => {
			const cwd = await tmp();
			for (let i = 0; i < 4; i++) {
				await writeLatestSnapshot(cwd, `xml${i}\n`, () => 1700000000000 + i * 1000);
			}
			const files = (await fsp.readdir(snapshotsDir(cwd))).filter((n) => n.startsWith("snapshot-"));
			expect(files).toHaveLength(4);
		});
	});
});
