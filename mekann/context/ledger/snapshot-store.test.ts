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
});
