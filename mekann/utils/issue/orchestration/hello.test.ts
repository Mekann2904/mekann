import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { consumeExpectedHello, readExpectedHello, writeExpectedHello, HELLO_STALE_MS } from "./hello.js";

let workdir: string;

beforeEach(async () => {
	workdir = await mkdtemp(join(tmpdir(), "orch-hello-"));
});

afterEach(async () => {
	await rm(workdir, { recursive: true, force: true });
});

describe("writeExpectedHello / readExpectedHello roundtrip", () => {
	it("reports an expected record after the launcher writes a manifest", async () => {
		await writeExpectedHello(workdir, { parent: 66, child: 67 }, 1000);
		const read = await readExpectedHello(workdir, 1000);
		expect(read).toEqual({ expected: true, parent: 66, child: 67, launchedAt: 1000 });
	});

	it("returns expected:false when no manifest exists (genuine manual session)", async () => {
		const read = await readExpectedHello(workdir);
		expect(read).toEqual({ expected: false });
	});

	it("ignores a stale manifest (older than HELLO_STALE_MS)", async () => {
		const written = 1000;
		await writeExpectedHello(workdir, { parent: 66, child: 67 }, written);
		// Just past the staleness window.
		const read = await readExpectedHello(workdir, written + HELLO_STALE_MS + 1);
		expect(read).toEqual({ expected: false });
	});

	it("accepts a manifest exactly at the staleness edge", async () => {
		const written = 1000;
		await writeExpectedHello(workdir, { parent: 66, child: 67 }, written);
		const read = await readExpectedHello(workdir, written + HELLO_STALE_MS);
		expect(read.expected).toBe(true);
	});

	it("returns expected:false for a malformed manifest", async () => {
		const { writeFile, mkdir } = await import("node:fs/promises");
		await mkdir(join(workdir, ".mekann", "orchestration"), { recursive: true });
		await writeFile(join(workdir, ".mekann", "orchestration", "hello.json"), "{not json", "utf8");
		const read = await readExpectedHello(workdir);
		expect(read).toEqual({ expected: false });
	});
});

describe("consumeExpectedHello", () => {
	it("removes the manifest so a later read reports expected:false", async () => {
		await writeExpectedHello(workdir, { parent: 66, child: 67 });
		await consumeExpectedHello(workdir);
		expect(await readExpectedHello(workdir)).toEqual({ expected: false });
	});

	it("is a no-op when the manifest is already absent", async () => {
		await expect(consumeExpectedHello(workdir)).resolves.toBeUndefined();
	});

	it("lets a freshly re-written manifest reappear (re-launch path)", async () => {
		await writeExpectedHello(workdir, { parent: 66, child: 67 }, 1000);
		await consumeExpectedHello(workdir);
		await writeExpectedHello(workdir, { parent: 66, child: 68 }, 2000);
		const read = await readExpectedHello(workdir, 2000);
		expect(read).toEqual({ expected: true, parent: 66, child: 68, launchedAt: 2000 });
	});
});
