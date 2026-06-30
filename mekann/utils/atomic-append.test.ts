import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as childProcess from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
	appendJsonlLine,
	appendJsonlLineSync,
	atomicReplaceFile,
	atomicReplaceFileSync,
	configureAtomicAppendLogging,
	lockPathFor,
	withAppendLock,
	withAppendLockSync,
	type AtomicAppendLogEvent,
} from "./atomic-append.js";

const HELPER_PATH = path.resolve(__dirname, "atomic-append.ts");

async function tmpdir(prefix = "atomic-append-"): Promise<string> {
	return fsp.mkdtemp(path.join(os.tmpdir(), prefix));
}

function readLines(file: string): string[] {
	try {
		return fs.readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.length > 0);
	} catch (error: any) {
		if (error?.code === "ENOENT") return [];
		throw error;
	}
}

// ---------------------------------------------------------------------------
// Single-process behavior
// ---------------------------------------------------------------------------

describe("appendJsonlLine (async)", () => {
	let dir: string;
	beforeEach(async () => { dir = await tmpdir(); });
	afterEach(async () => { await fsp.rm(dir, { recursive: true, force: true }); });

	it("appends a line verbatim (no implicit newline) and creates the file", async () => {
		const target = path.join(dir, "events.jsonl");
		await appendJsonlLine(target, '{"a":1}\n');
		await appendJsonlLine(target, '{"a":2}\n');
		expect(readLines(target)).toEqual(['{"a":1}', '{"a":2}']);
	});

	it("removes its lockfile after a successful append", async () => {
		const target = path.join(dir, "events.jsonl");
		await appendJsonlLine(target, '{"a":1}\n');
		expect(fs.existsSync(lockPathFor(target))).toBe(false);
	});

	it("creates the parent directory when missing", async () => {
		const target = path.join(dir, "nested", "deep", "events.jsonl");
		await appendJsonlLine(target, '{"a":1}\n');
		expect(readLines(target)).toEqual(['{"a":1}']);
	});

	it("concurrent within-process appends never interleave", async () => {
		const target = path.join(dir, "events.jsonl");
		const n = 200;
		// Each line is large enough that bare O_APPEND would not be atomic on
		// every platform, so any interleaving would corrupt a line.
		const pad = "x".repeat(2048);
		await Promise.all(
			Array.from({ length: n }, (_, i) =>
				appendJsonlLine(target, JSON.stringify({ i, pad }) + "\n"),
			),
		);
		const lines = readLines(target);
		expect(lines).toHaveLength(n);
		const seen = new Set<number>();
		for (const line of lines) {
			const parsed = JSON.parse(line) as { i: number; pad: string };
			expect(parsed.pad).toBe(pad);
			expect(seen.has(parsed.i)).toBe(false);
			seen.add(parsed.i);
		}
		expect(seen.size).toBe(n);
	});
});

describe("withAppendLock (async)", () => {
	let dir: string;
	beforeEach(async () => { dir = await tmpdir(); });
	afterEach(async () => { await fsp.rm(dir, { recursive: true, force: true }); });

	it("runs the critical section and releases the lock", async () => {
		const target = path.join(dir, "events.jsonl");
		const result = await withAppendLock(target, async () => {
			await fsp.appendFile(target, '{"a":1}\n', "utf8");
			return 42;
		});
		expect(result).toBe(42);
		expect(readLines(target)).toEqual(['{"a":1}']);
		expect(fs.existsSync(lockPathFor(target))).toBe(false);
	});

	it("releases the lock even when fn throws", async () => {
		const target = path.join(dir, "events.jsonl");
		await expect(withAppendLock(target, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
		expect(fs.existsSync(lockPathFor(target))).toBe(false);
	});

	it("serialises a multi-step transaction (append + rewrite)", async () => {
		const target = path.join(dir, "events.jsonl");
		await appendJsonlLine(target, '{"keep":true}\n');
		// Simulate a ledger compact: read all, append, rewrite whole file — all
		// under one lock so a concurrent appender cannot be clobbered.
		await withAppendLock(target, async () => {
			const existing = readLines(target);
			await fsp.writeFile(target, "", "utf8");
			for (const line of existing) await fsp.appendFile(target, line + "\n", "utf8");
			await fsp.appendFile(target, '{"new":true}\n', "utf8");
		});
		expect(readLines(target)).toEqual(['{"keep":true}', '{"new":true}']);
	});
});

// ---------------------------------------------------------------------------
// Sync variant
// ---------------------------------------------------------------------------

describe("appendJsonlLineSync", () => {
	let dir: string;
	beforeEach(async () => { dir = await tmpdir(); });
	afterEach(async () => { await fsp.rm(dir, { recursive: true, force: true }); });

	it("appends synchronously and cleans up the lock", () => {
		const target = path.join(dir, "ledger.jsonl");
		appendJsonlLineSync(target, '{"a":1}\n');
		appendJsonlLineSync(target, '{"a":2}\n');
		expect(readLines(target)).toEqual(['{"a":1}', '{"a":2}']);
		expect(fs.existsSync(lockPathFor(target))).toBe(false);
	});

	it("withAppendLockSync returns fn's value and releases on throw", () => {
		const target = path.join(dir, "ledger.jsonl");
		expect(withAppendLockSync(target, () => "ok")).toBe("ok");
		expect(() => withAppendLockSync(target, () => { throw new Error("sync boom"); })).toThrow("sync boom");
		expect(fs.existsSync(lockPathFor(target))).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Stale-lock recovery and token-safe release
// ---------------------------------------------------------------------------

describe("stale / foreign lock handling", () => {
	let dir: string;
	beforeEach(async () => { dir = await tmpdir(); });
	afterEach(async () => { await fsp.rm(dir, { recursive: true, force: true }); });

	it("breaks a stale lock and appends anyway", async () => {
		const target = path.join(dir, "events.jsonl");
		const lock = lockPathFor(target);
		// Plant a stale lock (startedAt well in the past) owned by another token.
		await fsp.writeFile(lock, JSON.stringify({ pid: 99999, token: "foreign", startedAt: Date.now() - 60_000 }), "utf8");
		await appendJsonlLine(target, '{"a":1}\n', { staleMs: 1_000, lockPollMs: 1 });
		expect(readLines(target)).toEqual(['{"a":1}']);
		expect(fs.existsSync(lock)).toBe(false);
	});

	it("does not break a live (non-stale) lock and times out instead", async () => {
		const target = path.join(dir, "events.jsonl");
		const lock = lockPathFor(target);
		// Plant a fresh, non-stale lock owned by another token.
		await fsp.writeFile(lock, JSON.stringify({ pid: process.pid, token: "owner", startedAt: Date.now() }), "utf8");
		// staleMs is large so we time out instead of forcibly breaking it.
		await expect(appendJsonlLine(target, '{"a":1}\n', { staleMs: 60_000, lockTimeoutMs: 150, lockPollMs: 10 })).rejects.toThrow(/lock timeout/);
		// The live lock must be left intact for its real owner.
		const content = JSON.parse(await fsp.readFile(lock, "utf8")) as { token: string };
		expect(content.token).toBe("owner");
	});
});

// ---------------------------------------------------------------------------
// Structured failure logging
// ---------------------------------------------------------------------------

describe("structured failure logging", () => {
	let dir: string;
	let events: AtomicAppendLogEvent[];
	beforeEach(async () => {
		dir = await tmpdir();
		events = [];
		configureAtomicAppendLogging((e) => events.push(e));
	});
	afterEach(async () => {
		// Restore the stderr default sink so module state does not leak.
		configureAtomicAppendLogging(null);
		await fsp.rm(dir, { recursive: true, force: true });
	});

	it("emits a structured failure event when the lock times out", async () => {
		const target = path.join(dir, "events.jsonl");
		const lock = lockPathFor(target);
		await fsp.writeFile(lock, JSON.stringify({ pid: process.pid, token: "owner", startedAt: Date.now() }), "utf8");
		await expect(appendJsonlLine(target, '{"a":1}\n', { staleMs: 60_000, lockTimeoutMs: 120, lockPollMs: 10 })).rejects.toThrow(/lock timeout/);
		const failure = events.find((e) => e.stage === "lock");
		expect(failure).toBeTruthy();
		expect(failure!.event).toBe("atomic-append-failure");
		expect(failure!.target).toBe(target);
		expect(failure!.pid).toBe(process.pid);
		expect(typeof failure!.timestamp).toBe("number");
	});
});

// ---------------------------------------------------------------------------
// Cross-process concurrency (real child processes)
// ---------------------------------------------------------------------------

/**
 * Spawn N real `node` child processes (Node's native TS type-stripping runs the
 * `.ts` helper directly) that each append M lines to the same target. This is
 * the acceptance test from the issue: "並列 N プロセスから同一
 * events.jsonl/manifest に M 行ずつ追記し、全行が正しくパースできる".
 */
function spawnAppenders(
	helperPath: string,
	target: string,
	procs: number,
	linesPerProc: number,
	variant: "async" | "sync",
	linePad: string,
): childProcess.ChildProcess[] {
	const runner = path.join(path.dirname(target), `_runner_${variant}_${crypto.randomBytes(3).toString("hex")}.ts`);
	// The runner imports the real helper via an absolute .ts specifier (Node
	// type-stripping resolves .ts directly) and appends lines for this process.
	const script = [
		`import { ${variant === "async" ? "appendJsonlLine" : "appendJsonlLineSync"} as append } from ${JSON.stringify(helperPath)};`,
		`const target = process.argv[2];`,
		`const procIndex = Number(process.argv[3]);`,
		`const count = Number(process.argv[4]);`,
		`const pad = process.argv[5];`,
		variant === "async"
			? `for (let i = 0; i < count; i++) await append(target, JSON.stringify({ p: procIndex, i, pad }) + "\\n");`
			: `for (let i = 0; i < count; i++) append(target, JSON.stringify({ p: procIndex, i, pad }) + "\\n");`,
	].join("\n");
	fs.writeFileSync(runner, script, "utf8");
	const children: childProcess.ChildProcess[] = [];
	for (let p = 0; p < procs; p++) {
		children.push(
			childProcess.spawn(process.execPath, [runner, target, String(p), String(linesPerProc), linePad], {
				stdio: ["ignore", "pipe", "pipe"],
			}),
		);
	}
	return children;
}

async function waitFor(children: childProcess.ChildProcess[]): Promise<void> {
	await Promise.all(
		children.map(
			(child) =>
				new Promise<void>((resolve, reject) => {
					let stderr = "";
					child.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
					child.on("error", reject);
					child.on("exit", (code) => {
						if (code !== 0) reject(new Error(`child exited ${code}: ${stderr.slice(0, 500)}`));
						else resolve();
					});
				}),
		),
	);
}

describe("cross-process concurrency (real child node processes)", () => {
	let dir: string;
	beforeEach(async () => { dir = await tmpdir("atomic-append-xproc-"); });
	afterEach(async () => { await fsp.rm(dir, { recursive: true, force: true }); });

	it("async: N processes x M lines all land intact and parseable", async () => {
		const target = path.join(dir, "events.jsonl");
		const procs = 8;
		const linesPerProc = 50;
		const pad = "y".repeat(1024); // > PIPE_BUF on stricter kernels
		const children = spawnAppenders(HELPER_PATH, target, procs, linesPerProc, "async", pad);
		await waitFor(children);

		const lines = readLines(target);
		expect(lines).toHaveLength(procs * linesPerProc);
		const seen = new Set<string>();
		for (const line of lines) {
			const parsed = JSON.parse(line) as { p: number; i: number; pad: string };
			expect(parsed.pad).toBe(pad);
			const key = `${parsed.p}:${parsed.i}`;
			expect(seen.has(key)).toBe(false);
			seen.add(key);
		}
		expect(seen.size).toBe(procs * linesPerProc);
		expect(fs.existsSync(lockPathFor(target))).toBe(false);
	}, 30_000);

	it("sync: N processes x M lines all land intact and parseable", async () => {
		const target = path.join(dir, "runs.jsonl");
		const procs = 6;
		const linesPerProc = 30;
		const pad = "z".repeat(768);
		const children = spawnAppenders(HELPER_PATH, target, procs, linesPerProc, "sync", pad);
		await waitFor(children);

		const lines = readLines(target);
		expect(lines).toHaveLength(procs * linesPerProc);
		for (const line of lines) {
			const parsed = JSON.parse(line) as { p: number; i: number; pad: string };
			expect(parsed.pad).toBe(pad);
		}
		expect(fs.existsSync(lockPathFor(target))).toBe(false);
	}, 30_000);
});

// ---------------------------------------------------------------------------
// Bare-append corruption baseline (negative control)
// ---------------------------------------------------------------------------

describe("baseline: bare appendFile CAN interleave (negative control)", () => {
	let dir: string;
	beforeEach(async () => { dir = await tmpdir("atomic-append-baseline-"); });
	afterEach(async () => { await fsp.rm(dir, { recursive: true, force: true }); });

	/**
	 * This test documents the bug the helper fixes. It spawns child processes
	 * that use PLAIN fs.appendFile (no lock) with large lines; under contention
	 * some lines tear. We only assert the HELPER's correctness above, but keep
	 * this baseline tolerant: it must not error (plain append can't fail), and
	 * we do not assert integrity since tearing is platform-dependent.
	 */
	it("plain appendFile does not throw under contention", async () => {
		const target = path.join(dir, "plain.jsonl");
		const runner = path.join(dir, `_plain_${crypto.randomBytes(3).toString("hex")}.ts`);
		const script = [
			`import * as fs from "node:fs";`,
			`const target = process.argv[2];`,
			`const p = Number(process.argv[3]);`,
			`const pad = "w".repeat(2048);`,
			`for (let i = 0; i < 40; i++) fs.appendFileSync(target, JSON.stringify({ p, i, pad }) + "\\n", "utf8");`,
		].join("\n");
		fs.writeFileSync(runner, script, "utf8");
		const children = Array.from({ length: 6 }, () =>
			childProcess.spawn(process.execPath, [runner, target, "0"], { stdio: ["ignore", "pipe", "pipe"] }),
		);
		await waitFor(children);
		// Every line still ends with a newline boundary; we only assert no throw.
		expect(readLines(target).length).toBeGreaterThan(0);
	}, 30_000);
});

// ---------------------------------------------------------------------------
// Atomic full-file replace (write-temp-then-rename)
// ---------------------------------------------------------------------------

describe("atomicReplaceFile (async)", () => {
	let dir: string;
	beforeEach(async () => { dir = await tmpdir("atomic-replace-"); });
	afterEach(async () => { await fsp.rm(dir, { recursive: true, force: true }); });

	it("replaces the target content and leaves no temp file behind", async () => {
		const target = path.join(dir, "out", "manifest.jsonl");
		await fsp.mkdir(path.dirname(target), { recursive: true });
		await fsp.writeFile(target, "OLD\n");
		await atomicReplaceFile(target, "NEW\n");
		expect(fs.readFileSync(target, "utf8")).toBe("NEW\n");
		expect(fs.readdirSync(path.dirname(target)).filter((f) => f.endsWith(".tmp"))).toEqual([]);
	});

	it("creates the parent directory when missing", async () => {
		const target = path.join(dir, "nested", "deep", "f.json");
		await atomicReplaceFile(target, "{\"a\":1}\n");
		expect(fs.readFileSync(target, "utf8")).toBe("{\"a\":1}\n");
	});

	it("accepts a Buffer payload", async () => {
		const target = path.join(dir, "bin.dat");
		const buf = Buffer.from([0x00, 0x01, 0x02, 0xff]);
		await atomicReplaceFile(target, buf);
		expect(fs.readFileSync(target)).toEqual(buf);
	});

	it("preserves the original target and cleans up the temp when the write fails", async () => {
		const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
		const sub = path.join(dir, "ledger");
		await fsp.mkdir(sub);
		const target = path.join(sub, "f.json");
		await fsp.writeFile(target, "ORIGINAL\n");
		// A read-only directory makes temp-file creation fail mid-replace.
		await fsp.chmod(sub, 0o500);
		try {
			if (isRoot) { expect(true).toBe(true); return; }
			await expect(atomicReplaceFile(target, "NEW\n")).rejects.toThrow();
			expect(fs.readFileSync(target, "utf8")).toBe("ORIGINAL\n");
			expect(fs.readdirSync(sub).filter((f) => f.endsWith(".tmp"))).toEqual([]);
		} finally {
			await fsp.chmod(sub, 0o700);
		}
	});

	it("concurrent replaces never expose a torn file (final content is one complete version)", async () => {
		const target = path.join(dir, "c.json");
		const payloads = Array.from({ length: 20 }, (_, i) => JSON.stringify({ i, pad: "x".repeat(4000) }) + "\n");
		await Promise.all(payloads.map((p) => atomicReplaceFile(target, p)));
		const final = fs.readFileSync(target, "utf8");
		// The final bytes are exactly one of the written payloads (no interleave).
		expect(payloads.indexOf(final)).toBeGreaterThanOrEqual(0);
		expect((JSON.parse(final) as { pad: string }).pad).toBe("x".repeat(4000));
	});
});

describe("atomicReplaceFileSync", () => {
	let dir: string;
	beforeEach(async () => { dir = await tmpdir("atomic-replace-sync-"); });
	afterEach(async () => { await fsp.rm(dir, { recursive: true, force: true }); });

	it("replaces the target content atomically (sync) and leaves no temp", () => {
		const target = path.join(dir, "snap.json");
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(target, "OLD\n");
		atomicReplaceFileSync(target, "NEW\n");
		expect(fs.readFileSync(target, "utf8")).toBe("NEW\n");
		expect(fs.readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
	});
});
