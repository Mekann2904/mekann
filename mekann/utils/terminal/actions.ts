import path from "node:path";
import type { TerminalAction } from "./types.js";

export function terminalActionLabel(action: TerminalAction): string {
	return action.mode === "argv" ? action.argv.join(" ") : action.command;
}

/** Path prefixes under which a SHELL value is accepted. Anything else (e.g.
 * `/tmp/malware`, a relative name, a malicious launcher-injected path) is
 * rejected in favour of the safe default so no shell-mode action ever execs an
 * attacker-controlled binary. */
const SAFE_SHELL_PREFIXES = ["/bin/", "/usr/bin/"];

/** Resolve the shell binary for shell-mode actions, validating it against a
 * path whitelist. An attacker who controls env (e.g. a compromised launcher or
 * a hijacked `SHELL`) could point SHELL at an arbitrary executable; every
 * shell-mode terminal action would then exec it. Only shells under `/bin` or
 * `/usr/bin` are accepted; anything else falls back to `/bin/sh`. The value is
 * resolved first so a `..` traversal like `/bin/../tmp/malware` (which starts
 * with "/bin/" as a raw string but escapes the directory) is also rejected. */
export function resolveShell(envShell: string | undefined): string {
	const raw = (envShell ?? "").trim();
	if (!raw) return "/bin/sh";
	const shell = path.resolve(raw);
	return SAFE_SHELL_PREFIXES.some((prefix) => shell.startsWith(prefix)) ? shell : "/bin/sh";
}

export function terminalActionArgv(action: TerminalAction): string[] {
	if (action.mode === "argv") return action.argv;

	const shell = resolveShell(process.env.SHELL);
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
