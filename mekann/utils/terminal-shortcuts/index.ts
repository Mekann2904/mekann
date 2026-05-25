import { spawnSync } from "node:child_process";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const DEFAULT_SHORTCUTS: Record<string, string> = {
	lg: "lazygit",
};

function parseShortcutEnv(value: string | undefined): Record<string, string> {
	if (!value) return {};

	const result: Record<string, string> = {};
	for (const entry of value.split(",")) {
		const [key, ...commandParts] = entry.split("=");
		const shortcut = key?.trim();
		const command = commandParts.join("=").trim();
		if (shortcut && command) {
			result[shortcut] = command;
		}
	}
	return result;
}

function getShortcuts(): Record<string, string> {
	return {
		...DEFAULT_SHORTCUTS,
		...parseShortcutEnv(process.env.MEKANN_TERMINAL_SHORTCUTS),
	};
}

function shellArgs(shell: string, command: string): string[] {
	const base = shell.split("/").pop() ?? "";

	// Use a login, non-interactive shell for exact shortcuts.
	// Interactive shells enable job control and can leave Pi in a background
	// terminal process group after full-screen TUI commands exit, which causes
	// `suspended (tty output)` when Pi tries to repaint.
	if (base.includes("zsh") || base.includes("bash")) {
		return ["-lc", command];
	}
	if (base.includes("fish")) {
		return ["-lc", command];
	}
	return ["-c", command];
}

async function runPassThroughTerminal(ctx: ExtensionContext, command: string): Promise<number> {
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

		const shell = process.env.SHELL || "/bin/sh";
		const result = spawnSync(shell, shellArgs(shell, command), {
			cwd: ctx.cwd,
			stdio: "inherit",
			env: {
				...process.env,
				TERM: process.env.TERM || "xterm-256color",
				COLORTERM: process.env.COLORTERM || "truecolor",
				PI_TERMINAL_PASS_THROUGH: "1",
			},
		});

		const exitCode = typeof result.status === "number" ? result.status : result.signal ? 130 : 1;

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

export default function terminalShortcuts(pi: ExtensionAPI): void {
	pi.on("input", async (event, ctx) => {
		if (event.source !== "interactive") return { action: "continue" };
		if (event.images && event.images.length > 0) return { action: "continue" };

		const text = event.text.trim();
		const command = getShortcuts()[text];
		if (!command) return { action: "continue" };

		if (!ctx.hasUI) return { action: "continue" };

		const exitCode = await runPassThroughTerminal(ctx, command);
		if (exitCode === 0) {
			ctx.ui.notify(`${text} completed`, "info");
		} else {
			ctx.ui.notify(`${text} exited with code ${exitCode}`, "warning");
		}

		return { action: "handled" };
	});
}
