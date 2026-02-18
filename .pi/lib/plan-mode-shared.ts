/**
 * @abdd.meta
 * path: .pi/lib/plan-mode-shared.ts
 * role: プランモードの共通定数、型定義、ポリシーテキストを提供するライブラリ
 * why: 全ての拡張機能において一貫したプランモードの挙動を保証し、定義の重複や矛盾を防ぐため
 * related: .pi/extensions/plan.ts, .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts
 * public_api: PlanModeState, READ_ONLY_COMMANDS, DESTRUCTIVE_COMMANDS, PLAN_MODE_POLICY
 * invariants: 各定数セット（Set）はイミュータブルとして扱われ、実行中に変更されない
 * side_effects: なし（純粋な定数と型の定義のみ）
 * failure_modes: 定義の不整合により許可されていないコマンドが実行される、または許可すべきコマンドがブロックされる
 * @abdd.explain
 * overview: プランモードにおけるコマンド実行の許可/ブロック判定や状態管理に必要な静的なリソースを定義する
 * what_it_does:
 *   - Bashコマンドの分類（読み取り専用、破壊的、書き込み可能など）を行うSet定数をエクスポートする
 *   - プランモードの状態（有効/無効、タイムスタンプ、チェックサム）を持つインターフェースを定義する
 *   - プランモード有効時のポリシー説明文を定数として提供する
 * why_it_exists:
 *   - 複数の拡張機能間でコマンドフィルタリングロジックを共有し、セキュリティポリシーの一貫性を維持するため
 *   - 個別のファイルに重複して定義を記述することによるメンテナンス性の低下やバグの混入を防ぐため
 * scope:
 *   in: なし（外部依存なし）
 *   out: プランモードの挙動制御に必要な定数、型、テキスト
 */

// File: .pi/extensions/plan-mode-shared.ts
// Description: Shared constants and utilities for plan mode across all extensions
// Why: Ensures consistent plan mode behavior and prevents duplicate/contradictory definitions
// Related: .pi/extensions/plan.ts, .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ============================================
// Constants
// ============================================

/**
 * Bash commands that are READ-ONLY and safe to use in plan mode.
 *
 * NOTE: These commands must NOT be able to modify files or system state.
 * Commands like `git`, `sed`, `echo` require subcommand/flag analysis.
 */
export const READ_ONLY_COMMANDS = new Set([
	"grep", "cat", "head", "tail", "less", "more", "ls",
	"find", "du", "df", "wc", "file", "stat", "tree",
	"cd", "pwd", "env", "which", "date", "uptime",
	"awk", "jq",
]);

/**
 * Destructive commands that should be blocked immediately (first-word check).
 */
export const DESTRUCTIVE_COMMANDS = new Set([
	"rm", "rmdir", "mv", "cp", "touch", "mkdir", "chmod", "chown",
	"ln", "truncate", "dd", "shred", "sudo", "su", "kill", "pkill", "killall",
]);

/**
 * Shell invocation commands (block all to prevent bypass).
 */
export const SHELL_COMMANDS = new Set([
	"bash", "sh", "zsh", "fish", "ksh", "dash",
]);

/**
 * Write-capable commands used in pipeline detection.
 */
export const WRITE_COMMANDS = new Set([
	"tee", "dd", "nc", "nmap", "tar", "zip", "unzip",
]);

/**
 * Git read-only subcommands (explicit allowlist).
 */
export const GIT_READONLY_SUBCOMMANDS = new Set([
	"status", "log", "diff", "show", "branch", "remote",
	"ls-files", "ls-tree", "rev-parse", "grep",
	"blame", "reflog", "tag", "head", "describe",
	"config",
]);

/**
 * Git write subcommands (explicit blocklist).
 */
export const GIT_WRITE_SUBCOMMANDS = new Set([
	"add", "commit", "push", "pull", "fetch", "merge",
	"rebase", "reset", "checkout", "cherry-pick", "revert",
	"init", "clone", "stash", "apply", "am", "rm", "mv",
]);

/**
 * Package manager commands (block all - too complex to analyze).
 */
export const WRITE_BASH_COMMANDS = new Set([
	"npm", "yarn", "pnpm", "pip", "pip3", "poetry", "cargo", "composer",
	"apt", "apt-get", "yum", "dnf", "brew", "pacman",
]);

/**
 * Additional write-capable commands to block (not in WRITE_BASH_COMMANDS).
 */
export const ADDITIONAL_WRITE_COMMANDS = new Set([
	"bash", "sh", "zsh", "fish", "ksh", "dash",
]);

// ============================================
// Type Definitions
// ============================================

/**
 * プランモードの状態を表すインターフェース
 * @summary プランモード状態定義
 */
export interface PlanModeState {
	enabled: boolean;
	timestamp: number;
	checksum: string;
}

// ============================================
// Plan Mode Policy Text
// ============================================

export const PLAN_MODE_POLICY = `
---
## PLAN MODE: PLANNING MODE (RESTRICTIONS DISABLED)

Plan mode is currently ENABLED. Plan mode restrictions have been disabled.

### ALL TOOLS AVAILABLE:
- Read files: \`read\` tool
- Write files: \`edit\`, \`write\` tools
- Bash commands: All bash commands available
- Create/modify plans: \`plan_*\` tools
- Research and analysis

### YOUR ROLE IN PLAN MODE:
1. Analyze requirements thoroughly
2. Explore codebase using all available tools
3. Create detailed implementation plans using \`plan_*\` tools
4. Identify risks and dependencies
5. Execute implementation as needed

### TO EXIT PLAN MODE:
- Press \`Ctrl+Shift+P\` or use \`/planmode\` command
- User can exit plan mode at any time
---`.trim();

/**
 * Brief plan mode warning for subagent/team prompts.
 * NOTE: Restrictions are now disabled - this is for informational purposes only.
 */
export const PLAN_MODE_WARNING = `PLAN MODE is ACTIVE. Restrictions have been disabled - all tools and commands are available.`;

// ============================================
// Utility Functions
// ============================================

/**
 * Bashコマンドが許可されているか判定する
 * @summary コマンド許可判定
 * @param {string} command - チェック対象のコマンド文字列
 * @returns {boolean} 許可されている場合はtrue
 */
export function isBashCommandAllowed(command: string): boolean {
	const trimmed = command.trim();
	if (!trimmed) return false;

	// 1. Block any form of output redirection
	// >, >>, 2>, 2>>, &>, &>>
	if (/[>|2>][>\s]|&>[>\s]|&>>/.test(trimmed)) {
		return false;
	}

	// 2. Check for pipelines with write commands
	if (/\|/.test(trimmed)) {
		const pipeCommands = trimmed.split(/\|/);
		for (const cmd of pipeCommands) {
			const firstWord = cmd.trim().split(/\s+/)[0];
			if (WRITE_BASH_COMMANDS.has(firstWord) ||
				ADDITIONAL_WRITE_COMMANDS.has(firstWord) ||
				['tee', 'dd', 'nc', 'nmap', 'tar', 'zip'].includes(firstWord)) {
				return false;
			}
		}
	}

	// 3. Block subshells and command substitution
	// (...), $(...), \`...\`, ${...}
	if (/[`$()]/.test(trimmed)) {
		return false;
	}

	// 4. Block explicit shell invocation
	const firstWord = trimmed.split(/\s+/)[0];
	if (ADDITIONAL_WRITE_COMMANDS.has(firstWord)) {
		return false;
	}

	// 5. Block write commands
	if (WRITE_BASH_COMMANDS.has(firstWord)) {
		return false;
	}

	// 6. Allow only if in read-only allowlist
	return READ_ONLY_COMMANDS.has(firstWord);
}

/**
 * プランモードが有効か判定する
 * @summary プランモード判定
 * @returns {boolean} プランモードが有効な場合はtrue
 */
export function isPlanModeActive(): boolean {
	// Fast path: no env flag means plan mode is definitely off.
	if (process.env.PI_PLAN_MODE !== "1") {
		return false;
	}

	// Defensive check: require persisted enabled state as well.
	// This prevents stale PI_PLAN_MODE values from incorrectly enabling plan mode.
	const stateFile = join(process.cwd(), ".pi", "plans", "plan-mode-state.json");
	if (!existsSync(stateFile)) {
		return false;
	}

	try {
		const content = readFileSync(stateFile, "utf-8");
		const state = JSON.parse(content) as PlanModeState;
		return validatePlanModeState(state) && state.enabled === true;
	} catch {
		return false;
	}
}

 /**
  * プランモード状態のチェックサムを計算する
  * @param state - チェックサムを除くプランモードの状態
  * @returns SHA256ハッシュの16進数文字列
  */
export function calculateChecksum(state: Omit<PlanModeState, 'checksum'>): string {
	return createHash('sha256')
		.update(JSON.stringify(state))
		.digest('hex');
}

/**
 * 状態チェックサム検証
 * @summary チェックサム検証
 * @param state - 検証対象の状態
 * @returns チェックサムが有効な場合はtrue
 */
export function validatePlanModeState(state: PlanModeState): boolean {
	if (!state || typeof state.checksum !== 'string') {
		return false;
	}
	const expectedChecksum = calculateChecksum({
		enabled: state.enabled,
		timestamp: state.timestamp,
	});
	return state.checksum === expectedChecksum;
}

/**
 * プランモードの状態を検証
 * @summary 状態整合性を検証
 * @param state 検証対象の状態
 * @returns 検証結果
 */
export function createPlanModeState(enabled: boolean): PlanModeState {
	const state: Omit<PlanModeState, 'checksum'> = {
		enabled,
		timestamp: Date.now(),
	};
	return {
		...state,
		checksum: calculateChecksum(state),
	};
}

/**
 * Custom type for plan mode context messages.
 */
export const PLAN_MODE_CONTEXT_TYPE = "plan-mode-context";

/**
 * Status key for plan mode UI indicator.
 */
export const PLAN_MODE_STATUS_KEY = "plan-mode";

/**
 * Environment variable name for plan mode.
 */
export const PLAN_MODE_ENV_VAR = "PI_PLAN_MODE";
