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

type LauncherStrategy = "pass-through";

const BUILT_IN_SHORTCUTS: Record<string, TerminalShortcut> = {
	lg: { mode: "argv", argv: ["lazygit"] },
};

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

function getLauncherStrategy(): LauncherStrategy {
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

async function runTerminalShortcut(ctx: ExtensionContext, shortcut: TerminalShortcut): Promise<number> {
	const strategy = getLauncherStrategy();
	if (strategy === "pass-through") {
		return await runPassThroughTerminal(ctx, shortcut);
	}
	return 1;
}

export default function terminalShortcuts(pi: ExtensionAPI): void {
	pi.on("input", async (event, ctx) => {
		if (event.source !== "interactive") return { action: "continue" };

		const text = event.text.trim();
		const shortcut = getShortcuts()[text];
		if (!shortcut) return { action: "continue" };

		if (!ctx.hasUI || !ctx.isIdle()) return { action: "handled" };

		await runTerminalShortcut(ctx, shortcut);
		return { action: "handled" };
	});
}
