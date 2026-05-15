/**
 * isPlanReadOnlyCommandIntent (was isSafeCommand) — Property-based テスト。
 *
 * fast-check を使い、以下の不変条件 (invariants) を検証する:
 *
 * 1. **対称性**: safe なコマンドは destructive pattern にマッチしない
 * 2. **メタ文字拒否**: シェルメタ文字を含むコマンドは常に not plan-read-only
 * 3. **リダイレクトストリッピング**: 2>/dev/null 付きで safe → 元も safe (または unsafe → 依然 unsafe)
 * 4. **決定性**: 同じ入力 → 同じ結果
 * 5. **エッジケース**: 空文字列、空白のみ、非常に長い文字列
 *
 * これらのテストは LLM によるコード変更時に command intent classification の
 * セマンティクスが意図せず変化することを防ぎ、メンテナンスコストを削減する。
 *
 * Note: isSafeCommand is a UX guard, not a security boundary.
 * The actual enforcement is the sandbox extension's OS-level policy.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { isSafeCommand, isPlanReadOnlyCommandIntent } from "./utils.js";

// ─── Invariant 1: Safe commands never match destructive patterns ──

describe("isPlanReadOnlyCommandIntent: property-based invariants", () => {
	// All known safe command prefixes (from SAFE_PATTERNS)
	const SAFE_PREFIXES = [
		"cat", "head", "tail", "less", "more", "grep", "ls", "pwd", "echo",
		"printf", "wc", "sort", "uniq", "diff", "file", "stat", "du", "df",
		"tree", "which", "whereis", "type", "env", "printenv", "uname",
		"whoami", "id", "date", "cal", "uptime", "ps", "top", "htop", "free",
	];

	it("known safe prefixes with benign args are always safe", () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...SAFE_PREFIXES),
				fc.string({ maxLength: 50 }).filter(s => {
					// Exclude all shell meta chars, redirects, and destructive keywords
					if (s.length === 0) return false;
					if (/[;&|`$\\\n><]/.test(s)) return false;
				if (/\b(rm|mv|cp|mkdir|touch|chmod|chown|chgrp|ln|tee|truncate|dd|shred|sudo|su|kill|pkill|killall|reboot|shutdown|mkfs|vim?|nano|emacs|code|subl|find|sed|npm|yarn|pnpm|pip|brew|apt|git|systemctl|service|wget|curl|tar|zip|unzip|ssh|scp|rsync|docker)\b/i.test(s)) return false;
					return true;
				}),
				(cmd, arg) => {
					const command = `${cmd} ${arg}`.trim();
					const result = isSafeCommand(command);
					return result === true;
				},
			),
			{ numRuns: 200 },
		);
	});

	// ─── Invariant 2: Shell meta-characters make commands unsafe ─────

	it("commands with shell meta-characters are always unsafe", () => {
		const metaChars = ["&&", "||", ";", "|", "`", "$(", "&"];
		fc.assert(
			fc.property(
				fc.constantFrom(...metaChars),
				fc.string({ maxLength: 30 }),
				fc.string({ maxLength: 30 }),
				(meta, prefix, suffix) => {
					const command = `${prefix}${meta}${suffix}`;
					// Empty prefix+suffix with just meta might not match safe patterns
					// but should be unsafe due to meta chars
					if (command.trim().length === 0) return true; // skip empty
					const result = isSafeCommand(command);
					return result === false;
				},
			),
		);
	});

	// ─── Invariant 3: Redirect stripping preserves or reduces safety ─

	it("stripping 2>/dev/null never makes an unsafe command safe", () => {
		fc.assert(
			fc.property(
				fc.string({ maxLength: 100 }).filter(s => s.length > 0),
				(command) => {
					const resultWithout = isSafeCommand(command);
					const withRedirect = `${command} 2>/dev/null`;
					const resultWith = isSafeCommand(withRedirect);

					// If the base command is unsafe, adding 2>/dev/null should NOT make it safe
					// (The stripping only removes the redirect; destructive patterns still match)
					if (resultWithout === false) {
						return resultWith === false;
					}
					return true;
				},
			),
		);
	});

	// ─── Invariant 4: Determinism ────────────────────────────────────

	it("same input always produces the same output", () => {
		fc.assert(
			fc.property(
				fc.string({ maxLength: 200 }),
				(command) => {
					const r1 = isSafeCommand(command);
					const r2 = isSafeCommand(command);
					return r1 === r2;
				},
			),
		);
	});

	// ─── Invariant 5: Destructive keywords make commands unsafe ──────

	it("commands containing destructive keywords are unsafe", () => {
		const destructiveKeywords = [
			"rm", "mv", "cp", "mkdir", "touch", "chmod", "chown",
			"sudo", "kill", "reboot", "shutdown", "mkfs", "dd",
		];
		fc.assert(
			fc.property(
				fc.constantFrom(...destructiveKeywords),
				fc.string({ maxLength: 30 }).filter(s => !/[;&|`$\\\n]/.test(s)),
				(keyword, arg) => {
					// If keyword appears as a standalone command (not in a safe prefix context)
					const command = `${keyword} ${arg}`.trim();
					const result = isSafeCommand(command);
					// Destructive keywords should make the command unsafe
					// UNLESS a safe pattern matches first (e.g., grep is safe even though it contains...)
					// Actually, none of the destructive keywords overlap with safe prefixes
					return result === false;
				},
			),
		);
	});

	// ─── Invariant 6: Package manager install commands are unsafe ────

	it("package manager install commands are always unsafe", () => {
		const pkgCommands = [
			"npm install", "npm uninstall", "npm update", "npm ci",
			"yarn add", "pnpm add", "pip install", "brew install",
		];
		fc.assert(
			fc.property(
				fc.constantFrom(...pkgCommands),
				fc.string({ maxLength: 30 }),
				(base, pkg) => {
					const command = `${base} ${pkg}`;
					return isSafeCommand(command) === false;
				},
			),
		);
	});

	// ─── Invariant 7: Git mutating commands are unsafe ───────────────

	it("git mutating commands are always unsafe", () => {
		const gitUnsafe = [
			"git add", "git commit", "git push", "git pull",
			"git merge", "git rebase", "git reset", "git stash",
			"git checkout", "git branch -d", "git branch -D",
		];
		fc.assert(
			fc.property(
				fc.constantFrom(...gitUnsafe),
				(base) => {
					return isSafeCommand(base) === false;
				},
			),
		);
	});

	// ─── Invariant 8: Safe read-only git commands are safe ───────────

	it("read-only git commands are always safe", () => {
		const gitSafe = [
			"git status", "git log", "git diff", "git show",
			"git branch", "git remote -v",
		];
		fc.assert(
			fc.property(
				fc.constantFrom(...gitSafe),
				(base) => {
					return isSafeCommand(base) === true;
				},
			),
		);
	});

	// ─── Invariant 9: Editors are unsafe ─────────────────────────────

	it("editor commands are always unsafe", () => {
		const editors = ["vim", "vi", "nano", "emacs", "code", "subl"];
		fc.assert(
			fc.property(
				fc.constantFrom(...editors),
				fc.string({ maxLength: 30 }),
				(editor, file) => {
					const command = `${editor} ${file}`;
					return isSafeCommand(command) === false;
				},
			),
		);
	});

	// ─── Invariant 10: find with destructive flags is unsafe ────────

	it("find with -delete or -exec is unsafe, without is safe", () => {
		fc.assert(
			fc.property(
				fc.boolean(),
				fc.constantFrom("-delete", "-exec rm {} \\;", "-execdir"),
				(hasDestructiveFlag, flag) => {
					const safe = isSafeCommand(`find . -name '*.ts'`);
					const unsafe = isSafeCommand(`find . -name '*.ts' ${flag}`);
					return safe === true && unsafe === false;
				},
			),
		);
	});

	// ─── Invariant 11: Redirect to file is unsafe ────────────────────

	it("output redirect > is unsafe", () => {
		fc.assert(
			fc.property(
				fc.string({ maxLength: 30 }).filter(s => s.length > 0 && !/[;&|`$\\\n>]/.test(s)),
				(prefix) => {
					const command = `${prefix} > output.txt`;
					return isSafeCommand(command) === false;
				},
			),
		);
	});

	// ─── Invariant 12: Newline-separated commands are unsafe ─────────

	it("newline in command always makes it unsafe", () => {
		fc.assert(
			fc.property(
				fc.string({ maxLength: 30 }).filter(s => !/[;\n|`$&]/.test(s)),
				fc.string({ maxLength: 30 }).filter(s => !/[;\n|`$&]/.test(s)),
				(before, after) => {
					if (before.length === 0 && after.length === 0) return true;
					const command = `${before}\n${after}`;
					return isSafeCommand(command) === false;
				},
			),
		);
	});
});
