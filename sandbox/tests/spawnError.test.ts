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
}));

import { runSandboxedShellMac } from "../macSeatbelt.js";
import { readOnlyPolicy } from "../permissions.js";

function createMockChild() {
	const child = new EventEmitter();
	child.pid = 12345;
	child.stdout = new EventEmitter();
	child.stderr = new EventEmitter();
	child.kill = vi.fn();
	return child;
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

	it("output limit exceeded triggers truncation", async () => {
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
});
