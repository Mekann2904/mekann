import { describe, expect, it, vi } from "vitest";
import {
	TerminalActionRunner,
	type CloseWindow,
	type RunPassThroughSection,
	type SpawnAction,
	type TerminalActionRunContext,
	type TerminalActionRunInput,
	type TerminalTuiControl,
} from "./action-runner.js";
import type { TerminalLaunchResult } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function newSilentRunner(config: ConstructorParameters<typeof TerminalActionRunner>[0] = {}) {
	return new TerminalActionRunner({
		writeStdout: () => undefined,
		writeStderr: () => undefined,
		waitForEnter: () => undefined,
		...config,
	});
}

function mockSpawn(exitCode = 0): SpawnAction & { calls: Array<{ action: any; cwd: string }> } {
	const calls: Array<{ action: any; cwd: string }> = [];
	const fn: SpawnAction = (action, cwd) => {
		calls.push({ action, cwd });
		return {
			pid: 1,
			output: [],
			stdout: Buffer.alloc(0),
			stderr: Buffer.alloc(0),
			status: exitCode,
			signal: null,
			error: undefined,
		};
	};
	return Object.assign(fn, { calls });
}

function mockLaunch(results: TerminalLaunchResult[] = [{ ok: true, windowId: "w1" }]) {
	let i = 0;
	return vi.fn(async () => {
		return results[i++] ?? { ok: false, reason: "unsupported" as const };
	});
}

function mockCloseWindow(): CloseWindow & { calls: string[] } {
	const calls: string[] = [];
	const fn: CloseWindow = async (id: string) => { calls.push(id); };
	return Object.assign(fn, { calls });
}

function mockPassThroughSection(): {
	runSection: RunPassThroughSection;
	tuiCalls: { stop: number; start: number; requestRender: number };
} {
	let tuiCalls = { stop: 0, start: 0, requestRender: 0 };
	const runSection: RunPassThroughSection = async (fn) => {
		const control: TerminalTuiControl = {
			stop: () => { tuiCalls.stop++; },
			start: () => { tuiCalls.start++; },
			requestRender: (force?: boolean) => { tuiCalls.requestRender++; },
		};
		return fn(control);
	};
	return { runSection, tuiCalls };
}

function mkCtx(overrides: Partial<TerminalActionRunContext> = {}): TerminalActionRunContext {
	const { runSection } = mockPassThroughSection();
	return {
		cwd: "/tmp/project",
		hasUI: true,
		isIdle: () => true,
		runPassThroughSection: runSection,
		...overrides,
	};
}

const argvAction: TerminalActionRunInput["action"] = {
	mode: "argv",
	argv: ["echo", "hello"],
};

const splitInput: TerminalActionRunInput = {
	action: argvAction,
	name: "test",
	preference: "split-longer-side",
	splitOnly: false,
};

const passThroughInput: TerminalActionRunInput = {
	action: argvAction,
	name: "test",
	preference: "pass-through",
	splitOnly: false,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TerminalActionRunner", () => {
	// ── Split launch ──────────────────────────────────────────────

	describe("split launch", () => {
		it("returns 0 on successful split and tracks window id", async () => {
			const launch = mockLaunch([{ ok: true, windowId: "w1" }]);
			const close = mockCloseWindow();
			const runner = newSilentRunner({
				launchWithTerminalEmulator: launch,
				closeWindow: close,
			});

			const exitCode = await runner.run(mkCtx(), splitInput);
			expect(exitCode).toBe(0);
			expect(launch).toHaveBeenCalledTimes(1);

			await runner.closeOpenedWindows();
			expect(close.calls).toEqual(["w1"]);
		});

		it("falls back to pass-through when split fails and idle and not splitOnly", async () => {
			const launch = mockLaunch([{ ok: false, reason: "unsupported" }]);
			const spawn = mockSpawn(0);
			const runner = newSilentRunner({
				launchWithTerminalEmulator: launch,
				spawnAction: spawn,
			});

			const exitCode = await runner.run(mkCtx(), splitInput);
			expect(exitCode).toBe(0);
			expect(spawn.calls).toHaveLength(1);
		});

		it("does not fall back to pass-through when splitOnly", async () => {
			const launch = mockLaunch([{ ok: false, reason: "unsupported" }]);
			const spawn = mockSpawn(0);
			const runner = newSilentRunner({
				launchWithTerminalEmulator: launch,
				spawnAction: spawn,
			});

			const exitCode = await runner.run(mkCtx(), {
				...splitInput,
				splitOnly: true,
			});
			expect(exitCode).toBe(1);
			expect(spawn.calls).toHaveLength(0);
		});

		it("does not fall back to pass-through when not idle", async () => {
			const launch = mockLaunch([{ ok: false, reason: "unsupported" }]);
			const spawn = mockSpawn(0);
			const runner = newSilentRunner({
				launchWithTerminalEmulator: launch,
				spawnAction: spawn,
			});

			const exitCode = await runner.run(mkCtx({ isIdle: () => false }), splitInput);
			expect(exitCode).toBe(1);
			expect(spawn.calls).toHaveLength(0);
		});
	});

	// ── Pass-through ──────────────────────────────────────────────

	describe("pass-through", () => {
		it("returns exit code from spawned process", async () => {
			const spawn = mockSpawn(42);
			const runner = newSilentRunner({ spawnAction: spawn });

			const exitCode = await runner.run(mkCtx(), passThroughInput);
			expect(exitCode).toBe(42);
		});

		it("returns 1 when hasUI is false", async () => {
			const spawn = mockSpawn(0);
			const runner = newSilentRunner({ spawnAction: spawn });

			const exitCode = await runner.run(
				mkCtx({ hasUI: false }),
				passThroughInput,
			);
			expect(exitCode).toBe(1);
			expect(spawn.calls).toHaveLength(0);
		});

		it("returns 1 when not idle", async () => {
			const spawn = mockSpawn(0);
			const runner = newSilentRunner({ spawnAction: spawn });

			const exitCode = await runner.run(
				mkCtx({ isIdle: () => false }),
				passThroughInput,
			);
			expect(exitCode).toBe(1);
			expect(spawn.calls).toHaveLength(0);
		});

		it("stops and starts TUI control around spawn", async () => {
			const { runSection, tuiCalls } = mockPassThroughSection();
			const spawn = mockSpawn(0);
			const runner = newSilentRunner({ spawnAction: spawn });

			await runner.run(mkCtx({ runPassThroughSection: runSection }), passThroughInput);
			expect(tuiCalls.stop).toBe(1);
			expect(tuiCalls.start).toBe(1);
			expect(tuiCalls.requestRender).toBe(1);
		});

		it("handles spawn error gracefully", async () => {
			const spawn: SpawnAction = () => ({
				pid: undefined,
				output: [],
				stdout: Buffer.alloc(0),
				stderr: Buffer.alloc(0),
				status: null,
				signal: null,
				error: new Error("spawn failed"),
			});
			const runner = newSilentRunner({ spawnAction: spawn });

			const exitCode = await runner.run(mkCtx(), passThroughInput);
			expect(exitCode).toBe(1);
		});

		it("handles thrown exception from spawn", async () => {
			const spawn: SpawnAction = () => {
				throw new Error("unexpected");
			};
			const runner = newSilentRunner({ spawnAction: spawn });

			const exitCode = await runner.run(mkCtx(), passThroughInput);
			expect(exitCode).toBe(1);
		});
	});

	// ── Window lifecycle ──────────────────────────────────────────

	describe("closeOpenedWindows", () => {
		it("closes all tracked windows and clears state", async () => {
			const launch = mockLaunch([
				{ ok: true, windowId: "w1" },
				{ ok: true, windowId: "w2" },
			]);
			const close = mockCloseWindow();
			const runner = newSilentRunner({
				launchWithTerminalEmulator: launch,
				closeWindow: close,
			});

			await runner.run(mkCtx(), { ...splitInput, name: "a" });
			await runner.run(mkCtx(), { ...splitInput, name: "b" });

			await runner.closeOpenedWindows();
			expect(close.calls).toEqual(["w1", "w2"]);

			// Second close is a no-op
			await runner.closeOpenedWindows();
			expect(close.calls).toHaveLength(2);
		});

		it("swallows close errors (window already closed)", async () => {
			const launch = mockLaunch([{ ok: true, windowId: "w1" }]);
			const close: CloseWindow = async () => {
				throw new Error("window not found");
			};
			const runner = newSilentRunner({
				launchWithTerminalEmulator: launch,
				closeWindow: close,
			});

			await runner.run(mkCtx(), splitInput);

			// Should not throw
			await runner.closeOpenedWindows();
		});
	});
});
