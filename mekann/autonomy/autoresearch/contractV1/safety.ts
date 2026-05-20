/**
 * autoresearch/contractV1/safety.ts — Path matching, write validation, internal path filtering, command safety.
 */

import * as path from "node:path";

// ---------------------------------------------------------------------------
// Path matching
// ---------------------------------------------------------------------------

/**
 * Match a relative posix path against patterns.
 * Patterns can be:
 *
 * For P0, we use a simple matching strategy:
 * - Exact match
 * - Prefix match (if pattern ends with /)
 * - Simple glob with star support via RegExp conversion
 */
export function matchesPath(pattern: string, filePath: string): boolean {
	// Normalize both to posix
	const normPattern = pattern.replace(/\\/g, "/");
	const normFile = filePath.replace(/\\/g, "/");

	// Exact match
	if (normPattern === normFile) return true;

	// Directory prefix match
	if (normPattern.endsWith("/")) {
		return normFile.startsWith(normPattern) || normFile === normPattern.slice(0, -1);
	}

	// Glob pattern: convert to regex
	if (normPattern.includes("*") || normPattern.includes("?") || normPattern.includes("[")) {
		let regexStr = normPattern
			.replace(/[.\+\^\$\{\}\(\)\|\[\]\\\\]/g, "\\$&") // Escape regex special chars (except * and ?)
			.replace(/\*\*/g, "<<DOUBLESTAR>>")
			.replace(/\*/g, "[^/]*")
			.replace(/<<DOUBLESTAR>>/g, ".*")
			.replace(/\?/g, "[^/]");
		regexStr = "^" + regexStr + "$";
		try {
			const re = new RegExp(regexStr);
			return re.test(normFile);
		} catch {
			return false;
		}
	}

	// File prefix match (without trailing /)
	if (normFile.startsWith(normPattern + "/")) return true;

	return false;
}

/**
 * Check if a file path matches any of the patterns.
 */
export function matchesAnyPattern(filePath: string, patterns: string[]): boolean {
	return patterns.some((p) => matchesPath(p, filePath));
}

/**
 * Validate that changed files don't violate forbidden/allowed write paths.
 */
export function validateWritePaths(
	changedFiles: string[],
	allowedWritePaths: string[],
	forbiddenWritePaths: string[],
): { violations: string[] } {
	const violations: string[] = [];

	for (const file of changedFiles) {
		// Check forbidden first
		if (matchesAnyPattern(file, forbiddenWritePaths)) {
			violations.push('changed file "' + file + '" matches forbiddenWritePaths');
			continue;
		}

		// Check allowed (if non-empty, file must match at least one)
		if (allowedWritePaths.length > 0 && !matchesAnyPattern(file, allowedWritePaths)) {
			violations.push('changed file "' + file + '" does not match allowedWritePaths');
		}
	}

	return { violations };
}

// ---------------------------------------------------------------------------
// Internal path filtering
// ---------------------------------------------------------------------------

/**
 * Check if a path is an internal autoresearch or .pi artifact path.
 * These should be excluded from candidate changedFiles.
 */
export function isInternalArtifactPath(p: string): boolean {
	const n = p.replace(/\\/g, "/");
	return (
		n === ".autoresearch" ||
		n.startsWith(".autoresearch/") ||
		n === ".pi" ||
		n.startsWith(".pi/") ||
		n === "autoresearch.plan.md"
	);
}

/**
 * Filter internal artifact paths from a list of changed files.
 */
export function filterInternalPaths(files: string[]): string[] {
	return files.filter((f) => !isInternalArtifactPath(f));
}

// ---------------------------------------------------------------------------
// Command safety validation
// ---------------------------------------------------------------------------

/**
 * Validate command safety: reject shell invocations, path escapes, etc.
 */
export function validateCommandSafety(
	commands: Array<{ argv: string[]; cwd: string }>,
	repoRoot: string,
): string[] {
	const errors: string[] = [];

	for (let ci = 0; ci < commands.length; ci++) {
		const cmd = commands[ci];
		const label = ci === 0 ? "benchmark" : "check[" + (ci - 1) + "]";

		// Reject shell -c invocations, including variants such as bash -lc,
		// sh -ec, and /usr/bin/env bash -c.
		const shellNames = ["bash", "sh", "zsh", "fish", "dash", "ksh", "csh", "tcsh"];
		let shellIndex = -1;
		let exe = cmd.argv[0] ?? "";
		const base = path.basename(exe);
		if (shellNames.includes(base)) {
			shellIndex = 0;
		} else if (base === "env") {
			const envShellIndex = cmd.argv.findIndex((arg, idx) => idx > 0 && shellNames.includes(path.basename(arg)));
			if (envShellIndex >= 0) {
				shellIndex = envShellIndex;
				exe = cmd.argv[envShellIndex];
			}
		}
		if (shellIndex >= 0) {
			const hasShellStringFlag = cmd.argv.slice(shellIndex + 1).some((arg) => /^-[A-Za-z]*c[A-Za-z]*$/.test(arg));
			if (hasShellStringFlag) {
				errors.push(
					label + ": command uses " + exe + " -c/-lc style shell string invocation. " +
					"Use a script file instead: [" + exe + ", \"./script.sh\"]. " +
					"Shell -c defeats the purpose of argv-based command safety.",
				);
			}
		}

		// Reject sudo / su
		if (cmd.argv[0] === "sudo" || cmd.argv[0] === "su") {
			errors.push(
				label + ": command uses " + cmd.argv[0] + " (privilege escalation rejected).",
			);
		}

		// Reject curl|sh patterns (argv containing pipe to shell)
		const argStr = cmd.argv.join(" ");
		if (/curl.*\|.*sh|wget.*\|.*sh/.test(argStr)) {
			errors.push(
				label + ": command contains curl|sh or wget|sh pattern (remote execution rejected).",
			);
		}

		// Reject rm -rf /
		if (cmd.argv[0] === "rm" && cmd.argv.includes("-rf") && (cmd.argv.includes("/") || cmd.argv.includes("/*"))) {
			errors.push(
				label + ": command contains \"rm -rf /\" (destructive operation rejected).",
			);
		}

		// Validate cwd resolves inside repo
		if (path.isAbsolute(cmd.cwd)) {
			errors.push(
				label + ": cwd is absolute (\"" + cmd.cwd + "\"). Must be relative to repo root.",
			);
		} else if (cmd.cwd.includes("..")) {
			errors.push(
				label + ": cwd contains \"..\" (path traversal rejected): \"" + cmd.cwd + "\".",
			);
		} else {
			const resolved = path.resolve(repoRoot, cmd.cwd);
			const root = path.resolve(repoRoot);
			if (resolved !== root && !resolved.startsWith(root + path.sep)) {
				errors.push(
					label + ": cwd escapes repo root: \"" + cmd.cwd + "\" resolves to \"" + resolved + "\".",
				);
			}
		}
	}

	return errors;
}

/**
 * Resolve a cwd inside the repo, throwing on escape.
 */
export function resolveCwdInsideRepo(repoRoot: string, cwd: string): string {
	if (path.isAbsolute(cwd)) throw new Error("cwd is absolute: " + cwd);
	if (cwd.includes("..")) throw new Error("cwd contains ..: " + cwd);
	const resolved = path.resolve(repoRoot, cwd);
	const root = path.resolve(repoRoot);
	if (resolved !== root && !resolved.startsWith(root + path.sep)) {
		throw new Error("cwd escapes repo: " + cwd + " -> " + resolved);
	}
	return resolved;
}
