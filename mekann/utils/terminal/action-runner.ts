/**
 * action-runner.ts — Deep module for Terminal action execution.
 *
 * Owns split launch, pass-through TTY execution, window lifecycle,
 * idle/splitOnly safety, and fallback policy. No Pi framework imports.
 */

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { readSync } from "node:fs";
import { resolveShell, shellArgs, terminalActionLabel } from "./actions.js";
import { launchWithTerminalEmulator } from "./launch.js";
import type { TerminalAction, TerminalLaunchResult } from "./types.js";

// ---------------------------------------------------------------------------
// Adapter interfaces (injected, Pi-free)
// ---------------------------------------------------------------------------

/** Minimal TUI control surface passed through from the Pi adapter. */
export interface TerminalTuiControl {
	stop(): void;
	start(): void;
	requestRender(force?: boolean): void;
}

/** Adapter that wraps Pi's ctx.ui.custom(...) to provide a pass-through section. */
export type RunPassThroughSection = <T>(
	fn: (tui: TerminalTuiControl) => T,
) => Promise<T>;

/** Context provided by the caller (adapter). No Pi types. */
export interface TerminalActionRunContext {
	cwd: string;
	hasUI: boolean;
	isIdle(): boolean;
	runPassThroughSection: RunPassThroughSection;
}

/** Injected cleanup for split windows. */
export type CloseWindow = (windowId: string) => Promise<void>;

/** Injected spawn for actions (testable). */
export type SpawnAction = (
	action: TerminalAction,
	cwd: string,
) => SpawnSyncReturns<Buffer>;

// ---------------------------------------------------------------------------
// Runner config
// ---------------------------------------------------------------------------

export interface TerminalActionRunnerConfig {
	launchWithTerminalEmulator?: (
		request: import("./types.js").TerminalLaunchRequest,
	) => Promise<TerminalLaunchResult>;
	closeWindow?: CloseWindow;
	spawnAction?: SpawnAction;
	writeStdout?: (text: string) => void;
	writeStderr?: (text: string) => void;
	waitForEnter?: () => void;
}

export interface TerminalActionRunInput {
	action: TerminalAction;
	name: string;
	preference: "pass-through" | "split-longer-side";
	splitOnly: boolean;
	hold?: boolean;
}

// ---------------------------------------------------------------------------
// Default spawn implementation
// ---------------------------------------------------------------------------

function defaultSpawnAction(
	action: TerminalAction,
	cwd: string,
): SpawnSyncReturns<Buffer> {
	const env = {
		...process.env,
		TERM: process.env.TERM || "xterm-256color",
		COLORTERM: process.env.COLORTERM || "truecolor",
		PI_TERMINAL_PASS_THROUGH: "1",
	};

	if (action.mode === "argv") {
		const [command, ...args] = action.argv;
		if (!command) {
			throw new Error("argv shortcut has no command");
		}
		return spawnSync(command, args, { cwd, stdio: "inherit", env });
	}

	const shell = resolveShell(process.env.SHELL);
	return spawnSync(shell, shellArgs(shell, action.command), {
		cwd,
		stdio: "inherit",
		env,
	});
}

// ---------------------------------------------------------------------------
// TerminalActionRunner
// ---------------------------------------------------------------------------

export class TerminalActionRunner {
	private readonly launchFn: (
		request: import("./types.js").TerminalLaunchRequest,
	) => Promise<TerminalLaunchResult>;
	private readonly closeWindowFn: CloseWindow;
	private readonly spawnFn: SpawnAction;
	private readonly writeStdout: (text: string) => void;
	private readonly writeStderr: (text: string) => void;
	private readonly waitForEnterFn: () => void;
	private readonly openedWindowIds: string[] = [];

	constructor(config: TerminalActionRunnerConfig = {}) {
		this.launchFn =
			config.launchWithTerminalEmulator ?? launchWithTerminalEmulator;
		this.closeWindowFn =
			config.closeWindow ??
			(async (id: string) => {
				const { execFile } = await import("node:child_process");
				const { promisify } = await import("node:util");
				await promisify(execFile)(
					"kitten",
					["@", "close-window", "--match", `id:${id}`],
					{ timeout: 3000 },
				);
			});
		this.spawnFn = config.spawnAction ?? defaultSpawnAction;
		this.writeStdout = config.writeStdout ?? ((text) => process.stdout.write(text));
		this.writeStderr = config.writeStderr ?? ((text) => process.stderr.write(text));
		this.waitForEnterFn = config.waitForEnter ?? (() => this.defaultWaitForEnter());
	}

	// ── Split launch ───────────────────────────────────────────────

	private async runSplit(
		ctx: TerminalActionRunContext,
		input: TerminalActionRunInput,
	): Promise<{ ok: boolean; exitCode: number }> {
		const result = await this.launchFn({
			cwd: ctx.cwd,
			action: input.action,
			preference: input.preference,
			matchCurrentWindow: true,
			copyEnv: true,
			hold: input.hold,
			title: input.name,
		});

		if (result.ok && result.windowId) {
			this.openedWindowIds.push(result.windowId);
		}

		return { ok: result.ok, exitCode: result.ok ? 0 : 1 };
	}

	// ── Pass-through TTY execution ─────────────────────────────────

	private async runPassThrough(
		ctx: TerminalActionRunContext,
		action: TerminalAction,
	): Promise<number> {
		if (!ctx.hasUI) return 1;

		return ctx.runPassThroughSection((tui) => {
			const previousSigttouListeners = process.listeners("SIGTTOU");
			process.removeAllListeners("SIGTTOU");
			process.on("SIGTTOU", () => {
				// Avoid shell job-control suspending Pi while it restores the TUI.
			});

			tui.stop();

			// Reset enough terminal state before handing the real TTY to the child.
			this.writeStdout("\x1b[0m\x1b[?25h\x1b[2J\x1b[H");

			let exitCode = 1;
			try {
				const result = this.spawnFn(action, ctx.cwd);
				if (result.error) {
					this.writeStderr(
						`[pi] failed to launch ${terminalActionLabel(action)}: ${result.error.message}\n`,
					);
					exitCode = 1;
				} else {
					exitCode =
						typeof result.status === "number"
							? result.status
							: result.signal
								? 130
								: 1;
				}
			} catch (error) {
				const message =
					error instanceof Error ? error.message : String(error);
				this.writeStderr(
					`[pi] failed to launch ${terminalActionLabel(action)}: ${message}\n`,
				);
				exitCode = 1;
			}

			if (exitCode !== 0) {
				this.waitForEnterFn();
			}

			this.writeStdout("\x1b[0m");
			tui.start();
			tui.requestRender(true);

			process.removeAllListeners("SIGTTOU");
			for (const listener of previousSigttouListeners) {
				process.on("SIGTTOU", listener as (...args: unknown[]) => void);
			}

			return exitCode;
		});
	}

	private defaultWaitForEnter(): void {
		this.writeStdout(
			"\n[pi] command failed; press Enter to return to pi...",
		);
		const buf = Buffer.alloc(1);

		try {
			while (true) {
				const n = readSync(0, buf, 0, 1, null);
				if (n === 0 || buf[0] === 10 || buf[0] === 13) break;
			}
		} catch {
			// Pi will restart its TUI anyway.
		}
	}

	// ── Public Interface ───────────────────────────────────────────

	async run(
		ctx: TerminalActionRunContext,
		input: TerminalActionRunInput,
	): Promise<number> {
		if (input.preference === "split-longer-side") {
			const split = await this.runSplit(ctx, input);
			if (split.ok) return 0;

			// splitOnly shortcuts must not fall back to pass-through.
			if (input.splitOnly) return 1;

			// Split launches are allowed while the agent is streaming because
			// they don't take over Pi's TTY. If split fails during streaming,
			// do not fall back to pass-through: it would compete with the
			// active agent/TUI.
			if (!ctx.isIdle()) return 1;
		}

		if (!ctx.isIdle()) return 1;
		return await this.runPassThrough(ctx, input.action);
	}

	// ── Window lifecycle ───────────────────────────────────────────

	async closeOpenedWindows(): Promise<void> {
		const ids = [...this.openedWindowIds];
		this.openedWindowIds.length = 0;
		for (const id of ids) {
			try {
				await this.closeWindowFn(id);
			} catch {
				// Window may already be closed by the user; ignore.
			}
		}
	}
}
