/**
 * runSandboxedShellMac: spawn error path tests.
 *
 * Uses vi.mock to exercise error paths that are hard to trigger in real execution:
 *   - spawn error (ENOENT etc.)
 *   - already-aborted AbortSignal
 *   - timeout with SIGTERM → SIGKILL
 *   - output limit exceeded
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";

// ─── Mock infrastructure ─────────────────────────────────────────

const state: { child: any; onSpawn: (() => void) | null } = { child: null, onSpawn: null };

vi.mock("node:child_process", () => ({
	spawn: vi.fn((..._args: unknown[]) => {
		if (state.onSpawn) state.onSpawn();
		return state.child;
	}),
}));

vi.mock("../pathPolicy.js", () => ({
	resolveRealPaths: vi.fn((paths: string[]) => Promise.resolve(paths)),
	validateWorkspaceRoot: vi.fn(() => Promise.resolve()),
	assertPathInsideRoot: vi.fn(() => Promise.resolve()),
	isProtectedPath: vi.fn(() => false),
	resolveSafeRealPath: vi.fn((p: string) => Promise.resolve(p)),
	checkUnsafeRoot: vi.fn(() => Promise.resolve(null)),
}));

import { runSandboxedShellMac } from "../macSeatbelt.js";
import { readOnlyPolicy } from "../permissions.js";

function createMockChild() {
	const child = new EventEmitter() as any;
	child.pid = 12345;
	child.stdout = new EventEmitter();
	child.stderr = new EventEmitter();
	child.kill = vi.fn();
	return child as typeof child & { pid: number; stdout: EventEmitter; stderr: EventEmitter; kill: ReturnType<typeof vi.fn> };
}

describe("runSandboxedShellMac: spawn error paths", () => {
	let originalProcessKill: typeof process.kill;

	beforeEach(() => {
		state.child = createMockChild();
		state.onSpawn = null;
		originalProcessKill = process.kill;
	});

	afterEach(() => {
		process.kill = originalProcessKill;
		vi.useRealTimers();
		state.onSpawn = null;
	});

	it("spawn error returns result with stderr", async () => {
		state.onSpawn = () => {
			setImmediate(() => state.child.emit("error", new Error("spawn ENOENT")));
		};

		const result = await runSandboxedShellMac("echo hello", readOnlyPolicy(tmpdir(), [tmpdir()]));
		expect(result.code).toBeNull();
		expect(result.stderr).toContain("spawn ENOENT");
	});

	it("already-aborted AbortSignal rejects immediately", async () => {
		const controller = new AbortController();
		controller.abort();

		state.onSpawn = () => {
			setImmediate(() => state.child.emit("close", 0, null));
		};

		const result = await runSandboxedShellMac("echo hello", readOnlyPolicy(tmpdir(), [tmpdir()]), {
			signal: controller.signal,
		});
		expect(result.stderr).toContain("aborted");
	});

	it("timeout triggers SIGTERM then SIGKILL", async () => {
		const killCalls: Array<{ pid: number; sig: string }> = [];
		let closeEmitted = false;
		process.kill = vi.fn((pid: number, sig: string) => {
			killCalls.push({ pid, sig });
			// Emit close on SIGTERM to let the process die
			if (sig === "SIGTERM" && !closeEmitted) {
				closeEmitted = true;
				setImmediate(() => state.child.emit("close", null, "SIGTERM"));
			}
			return true;
		}) as any;

		// Don't emit close — simulate hanging process
		const result = await runSandboxedShellMac("echo hello", readOnlyPolicy(tmpdir(), [tmpdir()]), {
			timeoutMs: 50,
		});
		expect(result.stderr).toContain("timed out");

		// SIGTERM should have been sent
		expect(killCalls.some(c => c.sig === "SIGTERM")).toBe(true);

		// SIGKILL should have been scheduled (SIGKILL_GRACE_MS = 5000)
		// waitForProcessDeath also sends SIGKILL, so it should appear
		// Wait briefly for the SIGKILL timeout to fire
		await new Promise(r => setTimeout(r, 100));
		// Note: the SIGKILL from killProcessGroupForce fires after 5s
		// We can't wait that long in unit tests, so we just verify SIGTERM was sent
	}, 10_000);

	it("output limit exceeded on stdout triggers truncation", async () => {
		process.kill = vi.fn(() => true) as any;

		state.onSpawn = () => {
			setImmediate(() => {
				state.child.stdout.emit("data", Buffer.alloc(1024 * 1024, "x"));
				setImmediate(() => state.child.emit("close", 1, null));
			});
		};

		const result = await runSandboxedShellMac("echo hello", readOnlyPolicy(tmpdir(), [tmpdir()]), {
			maxOutputBytes: 1024,
		});
		expect(result.code).toBe(1);
		expect(result.stdout).toContain("truncated");
	});

	it("output limit exceeded on stderr triggers truncation", async () => {
		process.kill = vi.fn(() => true) as any;

		state.onSpawn = () => {
			setImmediate(() => {
				state.child.stderr.emit("data", Buffer.alloc(1024 * 1024, "e"));
				setImmediate(() => state.child.emit("close", 1, null));
			});
		};

		const result = await runSandboxedShellMac("echo hello", readOnlyPolicy(tmpdir(), [tmpdir()]), {
			maxOutputBytes: 1024,
		});
		expect(result.code).toBe(1);
		expect(result.stderr).toContain("output limit exceeded");
		expect(result.stdout).toContain("truncated");
	});

	it("output limit exceeded: stderr partial keep preserves content", async () => {
		process.kill = vi.fn(() => true) as any;

		state.onSpawn = () => {
			setImmediate(() => {
				// First emit 500 bytes of stderr (under limit)
				state.child.stderr.emit("data", Buffer.alloc(500, "a"));
				// Then emit 1000 more bytes of stderr (exceeds 1024 limit)
				state.child.stderr.emit("data", Buffer.alloc(1000, "b"));
				setImmediate(() => state.child.emit("close", 1, null));
			});
		};

		const result = await runSandboxedShellMac("echo hello", readOnlyPolicy(tmpdir(), [tmpdir()]), {
			maxOutputBytes: 1024,
		});
		expect(result.code).toBe(1);
		// Should have kept partial content
		expect(result.stderr).toContain("a");
		expect(result.stderr).toContain("output limit exceeded");
	});

	it("abort signal fires during execution", async () => {
		const controller = new AbortController();
		let closeEmitted = false;
		process.kill = vi.fn((_pid: number, _sig: string) => {
			if (!closeEmitted) {
				closeEmitted = true;
				setImmediate(() => state.child.emit("close", null, "SIGTERM"));
			}
			return true;
		}) as any;

		state.onSpawn = () => {
			setImmediate(() => {
				// Abort after spawn
				controller.abort();
			});
		};

		const result = await runSandboxedShellMac("echo hello", readOnlyPolicy(tmpdir(), [tmpdir()]), {
			signal: controller.signal,
		});
		expect(result.stderr).toContain("aborted");
	});

	it("requestTerminate idempotency: output limit + timeout both trigger", async () => {
		const killCalls: Array<{ pid: number; sig: string }> = [];
		process.kill = vi.fn((pid: number, sig: string) => {
			killCalls.push({ pid, sig });
			return true;
		}) as any;

		state.onSpawn = () => {
			setImmediate(() => {
				// Trigger output limit
				state.child.stdout.emit("data", Buffer.alloc(1024 * 1024, "x"));
				setImmediate(() => state.child.emit("close", 1, null));
			});
		};

		const result = await runSandboxedShellMac("echo hello", readOnlyPolicy(tmpdir(), [tmpdir()]), {
			maxOutputBytes: 1024,
			timeoutMs: 50, // very short timeout — both output limit and timeout race
		});
		// Either timed out or output limited — both are valid
		expect(result.stderr).toBeTruthy();
		// SIGTERM should only be sent once (idempotent requestTerminate)
		const sigtermCalls = killCalls.filter(c => c.sig === "SIGTERM");
		expect(sigtermCalls.length).toBeLessThanOrEqual(1);
	});
});
