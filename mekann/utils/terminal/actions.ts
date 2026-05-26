import type { TerminalAction } from "./types.js";

export function terminalActionLabel(action: TerminalAction): string {
	return action.mode === "argv" ? action.argv.join(" ") : action.command;
}

export function terminalActionArgv(action: TerminalAction): string[] {
	if (action.mode === "argv") return action.argv;

	const shell = process.env.SHELL || "/bin/sh";
	return [shell, ...shellArgs(shell, action.command)];
}

export function shellArgs(shell: string, command: string): string[] {
	const base = shell.split("/").pop() ?? "";

	// Use a login, non-interactive shell for shell-mode actions.
	// Interactive shells enable job control and can leave Pi in a background
	// terminal process group after full-screen TUI commands exit.
	if (base.includes("zsh") || base.includes("bash") || base.includes("fish")) {
		return ["-lc", command];
	}
	return ["-c", command];
}
