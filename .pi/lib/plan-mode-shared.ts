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
 *
 * @property enabled - プランモードが有効かどうか
 * @property timestamp - 状態が記録された時刻（Unixタイムスタンプ）
 * @property checksum - 状態の整合性検証用チェックサム
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
 * Check if a bash command is allowed in plan mode.
 *
 * This function implements a multi-layered check to prevent write operations:
 * 1. Check for output redirections (> >> 2> &>)
 * 2. Check for pipelines with write commands
 * 3. Check for subshells and command substitution
 * 4. Check for explicit shell invocation (bash -c, sh -c)
 * 5. Check first word against write command list
 * 6. Verify first word is in read-only allowlist
 *
 * @param command - The bash command to check
 * @returns true if the command is allowed, false if it should be blocked
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
 * Check if plan mode is active.
 *
 * Requires both:
 * 1) PI_PLAN_MODE="1" environment flag
 * 2) A valid persisted state file with enabled=true
 *
 * @returns true if plan mode is active
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
 * Calculate checksum for plan mode state validation.
 */
export function calculateChecksum(state: Omit<PlanModeState, 'checksum'>): string {
	return createHash('sha256')
		.update(JSON.stringify(state))
		.digest('hex');
}

/**
 * Validate plan mode state checksum.
 *
 * @param state - The state to validate
 * @returns true if checksum is valid
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
 * Create a new plan mode state with checksum.
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
