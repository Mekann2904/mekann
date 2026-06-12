/**
 * terminal-shortcuts/index.ts — Pi input Adapter for Terminal shortcuts.
 *
 * Owns shortcut definitions, env parsing, launch strategy resolution,
 * and Pi hook wiring. Delegates execution to TerminalActionRunner.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	launchWithTerminalEmulator,
	shellArgs,
	type LaunchPreference,
	type TerminalAction,
} from "../terminal/index.js";
import {
	TerminalActionRunner,
	type TerminalActionRunContext,
	type TerminalTuiControl,
} from "../terminal/action-runner.js";

// ---------------------------------------------------------------------------
// Shortcut definitions
// ---------------------------------------------------------------------------

type TerminalShortcut = TerminalAction;
type LauncherStrategy = Extract<LaunchPreference, "pass-through" | "split-longer-side">;

const BUILT_IN_SHORTCUTS: Record<string, TerminalShortcut> = {
	lg: { mode: "argv", argv: ["lazygit"] },
	zed: { mode: "argv", argv: ["zed", "."] },
	"zed .": { mode: "argv", argv: ["zed", "."] },
};

const BUILT_IN_SPLIT_SHORTCUTS = new Set(["lg"]);
const SPLIT_ONLY_SHORTCUTS = new Set<string>();

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
	if (configured === "pass-through" || configured === "split-longer-side") {
		return configured;
	}

	const splitShortcuts = new Set([
		...BUILT_IN_SPLIT_SHORTCUTS,
		...parseShortcutList(process.env.MEKANN_TERMINAL_SPLIT_SHORTCUTS),
	]);
	if (splitShortcuts.has(shortcutName)) {
		return "split-longer-side";
	}

	return "pass-through";
}

// ---------------------------------------------------------------------------
// Pi context adapter
// ---------------------------------------------------------------------------

function adaptRunContext(ctx: ExtensionContext): TerminalActionRunContext {
	return {
		cwd: ctx.cwd,
		hasUI: ctx.hasUI,
		isIdle: () => ctx.isIdle(),
		runPassThroughSection: <T,>(fn: (tui: TerminalTuiControl) => T): Promise<T> =>
			ctx.ui.custom<T>((tui, _theme, _keybindings, done) => {
				const control: TerminalTuiControl = {
					stop: () => tui.stop(),
					start: () => tui.start(),
					requestRender: (force?: boolean) => tui.requestRender(force),
				};
				const result = fn(control);
				done(result);
				return { render: () => [], invalidate: () => {} };
			}) as unknown as Promise<T>,
	};
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function terminalShortcuts(pi: ExtensionAPI): void {
	const runner = new TerminalActionRunner({
		launchWithTerminalEmulator,
	});

	pi.on("session_shutdown", async (event) => {
		if (event.reason !== "quit") return;
		await runner.closeOpenedWindows();
	});

	pi.on("input", async (event, ctx) => {
		if (event.source !== "interactive") return { action: "continue" };

		const text = event.text.trim();
		const shortcut = getShortcuts()[text];
		if (!shortcut) return { action: "continue" };

		if (!ctx.hasUI) return { action: "handled" };

		await runner.run(adaptRunContext(ctx), {
			action: shortcut,
			name: text,
			preference: getLauncherStrategy(text),
			splitOnly: SPLIT_ONLY_SHORTCUTS.has(text),
			hold: SPLIT_ONLY_SHORTCUTS.has(text),
		});
		return { action: "handled" };
	});
}
