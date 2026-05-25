import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { readSync } from "node:fs";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type TerminalShortcut =
	| {
		mode: "argv";
		argv: string[];
	}
	| {
		mode: "shell";
		command: string;
	};

type LauncherStrategy = "pass-through" | "kitty-split-longer-side";

type KittyWindowLike = {
	id?: number;
	is_focused?: boolean;
	columns?: number;
	lines?: number;
	[key: string]: unknown;
};

const BUILT_IN_SHORTCUTS: Record<string, TerminalShortcut> = {
	lg: { mode: "argv", argv: ["lazygit"] },
	zed: { mode: "argv", argv: ["zed", "."] },
	"zed .": { mode: "argv", argv: ["zed", "."] },
};

const BUILT_IN_SPLIT_SHORTCUTS = new Set(["lg"]);

function parseShortcutEnv(value: string | undefined): Record<string, TerminalShortcut> {
	if (!value) return {};

	const result: Record<string, TerminalShortcut> = {};
	for (const entry of value.split(",")) {
		const [key, ...commandParts] = entry.split("=");
		const shortcut = key?.trim();
		const command = commandParts.join("=").trim();
		if (shortcut && command) {
			result[shortcut] = { mode: "shell", command };
		}
	}
	return result;
}

function getShortcuts(): Record<string, TerminalShortcut> {
	return {
		...BUILT_IN_SHORTCUTS,
		...parseShortcutEnv(process.env.MEKANN_TERMINAL_SHORTCUTS),
	};
}

function parseShortcutList(value: string | undefined): Set<string> {
	return new Set(
		(value ?? "")
			.split(",")
			.map((entry) => entry.trim())
			.filter(Boolean),
	);
}

function getLauncherStrategy(shortcutName: string): LauncherStrategy {
	const configured = process.env.MEKANN_TERMINAL_STRATEGY?.trim();
	if (configured === "pass-through" || configured === "kitty-split-longer-side") {
		return configured;
	}

	const splitShortcuts = new Set([
		...BUILT_IN_SPLIT_SHORTCUTS,
		...parseShortcutList(process.env.MEKANN_TERMINAL_SPLIT_SHORTCUTS),
	]);
	if (splitShortcuts.has(shortcutName)) {
		return "kitty-split-longer-side";
	}

	return "pass-through";
}

function shellArgs(shell: string, command: string): string[] {
	const base = shell.split("/").pop() ?? "";

	// Use a login, non-interactive shell for shell-mode shortcuts.
	// Interactive shells enable job control and can leave Pi in a background
	// terminal process group after full-screen TUI commands exit, which causes
	// `suspended (tty output)` when Pi tries to repaint.
	if (base.includes("zsh") || base.includes("bash") || base.includes("fish")) {
		return ["-lc", command];
	}
	return ["-c", command];
}

function waitForEnter(): void {
	process.stdout.write("\n[pi] command failed; press Enter to return to pi...");
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

function shortcutLabel(shortcut: TerminalShortcut): string {
	return shortcut.mode === "argv" ? shortcut.argv.join(" ") : shortcut.command;
}

function shortcutCommandArgv(shortcut: TerminalShortcut): string[] {
	if (shortcut.mode === "argv") return shortcut.argv;

	const shell = process.env.SHELL || "/bin/sh";
	return [shell, ...shellArgs(shell, shortcut.command)];
}

function spawnShortcut(shortcut: TerminalShortcut, cwd: string): SpawnSyncReturns<Buffer> {
	const env = {
		...process.env,
		TERM: process.env.TERM || "xterm-256color",
		COLORTERM: process.env.COLORTERM || "truecolor",
		PI_TERMINAL_PASS_THROUGH: "1",
	};

	if (shortcut.mode === "argv") {
		const [command, ...args] = shortcut.argv;
		if (!command) {
			throw new Error("argv shortcut has no command");
		}
		return spawnSync(command, args, { cwd, stdio: "inherit", env });
	}

	const shell = process.env.SHELL || "/bin/sh";
	return spawnSync(shell, shellArgs(shell, shortcut.command), { cwd, stdio: "inherit", env });
}

function collectKittyWindows(value: unknown, windows: KittyWindowLike[] = []): KittyWindowLike[] {
	if (!value || typeof value !== "object") return windows;
	if (Array.isArray(value)) {
		for (const item of value) collectKittyWindows(item, windows);
		return windows;
	}

	const object = value as KittyWindowLike;
	if (typeof object.id === "number" && (typeof object.columns === "number" || typeof object.lines === "number")) {
		windows.push(object);
	}
	for (const child of Object.values(object)) {
		collectKittyWindows(child, windows);
	}
	return windows;
}

function currentKittyWindowSize(): { columns: number; lines: number } | undefined {
	const result = spawnSync("kitten", ["@", "ls"], { encoding: "utf8", timeout: 2000 });
	if (result.status !== 0 || !result.stdout) return undefined;

	try {
		const windows = collectKittyWindows(JSON.parse(result.stdout));
		const currentWindowId = Number(process.env.KITTY_WINDOW_ID);
		const current = Number.isFinite(currentWindowId) ? windows.find((window) => window.id === currentWindowId) : undefined;
		const focused = windows.find((window) => window.is_focused);
		const window = current ?? focused;
		if (typeof window?.columns === "number" && typeof window.lines === "number") {
			return { columns: window.columns, lines: window.lines };
		}
	} catch {
		return undefined;
	}
	return undefined;
}

function kittySplitLocation(): "vsplit" | "hsplit" {
	const size = currentKittyWindowSize();
	if (!size) return "vsplit";

	// Terminal cells are usually taller than they are wide, so compare columns
	// against roughly two times the line count to approximate the visually longer side.
	return size.columns >= size.lines * 2 ? "vsplit" : "hsplit";
}

function runKittySplitLongerSide(ctx: ExtensionContext, shortcut: TerminalShortcut): number {
	const argv = shortcutCommandArgv(shortcut);
	if (argv.length === 0) return 1;

	const args = ["@", "launch", "--type=window", `--location=${kittySplitLocation()}`, "--cwd", ctx.cwd];
	if (process.env.KITTY_WINDOW_ID) {
		args.push("--match", `id:${process.env.KITTY_WINDOW_ID}`);
	}
	args.push(...argv);

	const result = spawnSync("kitten", args, { encoding: "utf8", timeout: 5000 });
	return result.status === 0 ? 0 : 1;
}

async function runPassThroughTerminal(ctx: ExtensionContext, shortcut: TerminalShortcut): Promise<number> {
	if (!ctx.hasUI) return 1;

	return await ctx.ui.custom<number>((tui, _theme, _keybindings, done) => {
		const previousSigttouListeners = process.listeners("SIGTTOU");
		process.removeAllListeners("SIGTTOU");
		process.on("SIGTTOU", () => {
			// Avoid shell job-control suspending Pi while it restores the TUI.
		});

		tui.stop();

		// Reset enough terminal state before handing the real TTY to the child.
		process.stdout.write("\x1b[0m\x1b[?25h\x1b[2J\x1b[H");

		let exitCode = 1;
		try {
			const result = spawnShortcut(shortcut, ctx.cwd);
			if (result.error) {
				process.stderr.write(`[pi] failed to launch ${shortcutLabel(shortcut)}: ${result.error.message}\n`);
				exitCode = 1;
			} else {
				exitCode = typeof result.status === "number" ? result.status : result.signal ? 130 : 1;
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			process.stderr.write(`[pi] failed to launch ${shortcutLabel(shortcut)}: ${message}\n`);
			exitCode = 1;
		}

		if (exitCode !== 0) {
			waitForEnter();
		}

		process.stdout.write("\x1b[0m");
		tui.start();
		tui.requestRender(true);

		process.removeAllListeners("SIGTTOU");
		for (const listener of previousSigttouListeners) {
			process.on("SIGTTOU", listener);
		}

		done(exitCode);

		return { render: () => [], invalidate: () => {} };
	});
}

async function runTerminalShortcut(ctx: ExtensionContext, shortcutName: string, shortcut: TerminalShortcut): Promise<number> {
	const strategy = getLauncherStrategy(shortcutName);
	if (strategy === "kitty-split-longer-side") {
		const exitCode = runKittySplitLongerSide(ctx, shortcut);
		if (exitCode === 0) return 0;
	}
	return await runPassThroughTerminal(ctx, shortcut);
}

export default function terminalShortcuts(pi: ExtensionAPI): void {
	pi.on("input", async (event, ctx) => {
		if (event.source !== "interactive") return { action: "continue" };

		const text = event.text.trim();
		const shortcut = getShortcuts()[text];
		if (!shortcut) return { action: "continue" };

		if (!ctx.hasUI || !ctx.isIdle()) return { action: "handled" };

		await runTerminalShortcut(ctx, text, shortcut);
		return { action: "handled" };
	});
}
