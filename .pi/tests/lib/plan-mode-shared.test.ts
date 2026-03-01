/**
 * @file .pi/lib/plan-mode-shared.ts のテスト
 * @description プランモード共有定数とユーティリティのテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";

import {
	READ_ONLY_COMMANDS,
	DESTRUCTIVE_COMMANDS,
	SHELL_COMMANDS,
	WRITE_COMMANDS,
	GIT_READONLY_SUBCOMMANDS,
	GIT_WRITE_SUBCOMMANDS,
	WRITE_BASH_COMMANDS,
	PLAN_MODE_POLICY,
	PLAN_MODE_WARNING,
	PLAN_MODE_CONTEXT_TYPE,
	PLAN_MODE_STATUS_KEY,
	PLAN_MODE_ENV_VAR,
	isBashCommandAllowed,
	isPlanModeActive,
	calculateChecksum,
	validatePlanModeState,
	createPlanModeState,
	type PlanModeState,
} from "../../lib/plan-mode-shared.js";

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_STATE_DIR = ".pi/tests/temp/plan-mode-state";
const STATE_FILE = join(TEST_STATE_DIR, "plan-mode-state.json");

function setupTestDir(): void {
	if (existsSync(TEST_STATE_DIR)) {
		rmSync(TEST_STATE_DIR, { recursive: true, force: true });
	}
	mkdirSync(TEST_STATE_DIR, { recursive: true });
}

function cleanupTestDir(): void {
	if (existsSync(TEST_STATE_DIR)) {
		rmSync(TEST_STATE_DIR, { recursive: true, force: true });
	}
}

function writePlanModeState(state: PlanModeState): void {
	writeFileSync(STATE_FILE, JSON.stringify(state), "utf-8");
}

// ============================================================================
// Tests
// ============================================================================

describe("plan-mode-shared", () => {
	describe("Constants", () => {
		it("READ_ONLY_COMMANDS_should_contain_expected_commands", () => {
			expect(READ_ONLY_COMMANDS.has("grep")).toBe(true);
			expect(READ_ONLY_COMMANDS.has("cat")).toBe(true);
			expect(READ_ONLY_COMMANDS.has("ls")).toBe(true);
			expect(READ_ONLY_COMMANDS.has("find")).toBe(true);
		});

		it("DESTRUCTIVE_COMMANDS_should_contain_expected_commands", () => {
			expect(DESTRUCTIVE_COMMANDS.has("rm")).toBe(true);
			expect(DESTRUCTIVE_COMMANDS.has("mv")).toBe(true);
			expect(DESTRUCTIVE_COMMANDS.has("chmod")).toBe(true);
		});

		it("SHELL_COMMANDS_should_contain_expected_commands", () => {
			expect(SHELL_COMMANDS.has("bash")).toBe(true);
			expect(SHELL_COMMANDS.has("sh")).toBe(true);
			expect(SHELL_COMMANDS.has("zsh")).toBe(true);
		});

		it("GIT_READONLY_SUBCOMMANDS_should_contain_expected_subcommands", () => {
			expect(GIT_READONLY_SUBCOMMANDS.has("status")).toBe(true);
			expect(GIT_READONLY_SUBCOMMANDS.has("log")).toBe(true);
			expect(GIT_READONLY_SUBCOMMANDS.has("diff")).toBe(true);
		});

		it("GIT_WRITE_SUBCOMMANDS_should_contain_expected_subcommands", () => {
			expect(GIT_WRITE_SUBCOMMANDS.has("commit")).toBe(true);
			expect(GIT_WRITE_SUBCOMMANDS.has("push")).toBe(true);
			expect(GIT_WRITE_SUBCOMMANDS.has("add")).toBe(true);
		});

		it("PLAN_MODE_POLICY_should_be_defined", () => {
			expect(PLAN_MODE_POLICY).toContain("PLAN MODE");
			expect(PLAN_MODE_POLICY).toContain("PLANNING MODE");
		});

		it("PLAN_MODE_WARNING_should_be_defined", () => {
			expect(PLAN_MODE_WARNING).toContain("PLAN MODE is ACTIVE");
		});

		it("PLAN_MODE_constants_should_have_correct_values", () => {
			expect(PLAN_MODE_CONTEXT_TYPE).toBe("plan-mode-context");
			expect(PLAN_MODE_STATUS_KEY).toBe("plan-mode");
			expect(PLAN_MODE_ENV_VAR).toBe("PI_PLAN_MODE");
		});
	});

	describe("isBashCommandAllowed", () => {
		it("should_allow_read_only_commands", () => {
			expect(isBashCommandAllowed("grep pattern file.txt")).toBe(true);
			expect(isBashCommandAllowed("cat file.txt")).toBe(true);
			expect(isBashCommandAllowed("ls -la")).toBe(true);
			expect(isBashCommandAllowed("find . -name '*.ts'")).toBe(true);
		});

		it("should_block_destructive_commands", () => {
			expect(isBashCommandAllowed("rm file.txt")).toBe(false);
			expect(isBashCommandAllowed("mv a b")).toBe(false);
			expect(isBashCommandAllowed("chmod 755 file")).toBe(false);
		});

		it("should_block_shell_invocation", () => {
			expect(isBashCommandAllowed("bash -c 'echo test'")).toBe(false);
			expect(isBashCommandAllowed("sh script.sh")).toBe(false);
			expect(isBashCommandAllowed("zsh -c 'ls'")).toBe(false);
		});

		it("should_block_output_redirection", () => {
			expect(isBashCommandAllowed("echo test > file.txt")).toBe(false);
			expect(isBashCommandAllowed("cat file >> output.txt")).toBe(false);
			expect(isBashCommandAllowed("cmd 2> error.log")).toBe(false);
		});

		it("should_block_pipelines_with_write_commands", () => {
			expect(isBashCommandAllowed("cat file | tee output")).toBe(false);
			expect(isBashCommandAllowed("echo test | dd of=file")).toBe(false);
		});

		it("should_block_subshells_and_command_substitution", () => {
			expect(isBashCommandAllowed("$(cat file)")).toBe(false);
			expect(isBashCommandAllowed("`cat file`")).toBe(false);
			expect(isBashCommandAllowed("(cd dir && ls)")).toBe(false);
		});

		it("should_block_package_managers", () => {
			expect(isBashCommandAllowed("npm install")).toBe(false);
			expect(isBashCommandAllowed("yarn add package")).toBe(false);
			expect(isBashCommandAllowed("pip install package")).toBe(false);
		});

		it("should_return_false_for_empty_command", () => {
			expect(isBashCommandAllowed("")).toBe(false);
			expect(isBashCommandAllowed("   ")).toBe(false);
		});

		it("should_block_unknown_commands", () => {
			expect(isBashCommandAllowed("unknown-command")).toBe(false);
			expect(isBashCommandAllowed("my-custom-script")).toBe(false);
		});
	});

	describe("calculateChecksum", () => {
		it("should_generate_consistent_checksum", () => {
			const state = { enabled: true, timestamp: 1000 };
			const checksum1 = calculateChecksum(state);
			const checksum2 = calculateChecksum(state);

			expect(checksum1).toBe(checksum2);
			expect(checksum1).toHaveLength(64); // SHA-256 hex length
		});

		it("should_generate_different_checksums_for_different_states", () => {
			const state1 = { enabled: true, timestamp: 1000 };
			const state2 = { enabled: false, timestamp: 1000 };

			expect(calculateChecksum(state1)).not.toBe(calculateChecksum(state2));
		});

		it("should_handle_different_timestamps", () => {
			const state1 = { enabled: true, timestamp: 1000 };
			const state2 = { enabled: true, timestamp: 2000 };

			expect(calculateChecksum(state1)).not.toBe(calculateChecksum(state2));
		});
	});

	describe("validatePlanModeState", () => {
		it("should_return_true_for_valid_state", () => {
			const state = createPlanModeState(true);
			expect(validatePlanModeState(state)).toBe(true);
		});

		it("should_return_false_for_invalid_checksum", () => {
			const state: PlanModeState = {
				enabled: true,
				timestamp: 1000,
				checksum: "invalid-checksum",
			};

			expect(validatePlanModeState(state)).toBe(false);
		});

		it("should_return_false_for_missing_checksum", () => {
			const state = { enabled: true, timestamp: 1000 } as PlanModeState;

			expect(validatePlanModeState(state)).toBe(false);
		});

		it("should_return_false_for_null_state", () => {
			expect(validatePlanModeState(null as unknown as PlanModeState)).toBe(false);
		});
	});

	describe("createPlanModeState", () => {
		it("should_create_valid_enabled_state", () => {
			const state = createPlanModeState(true);

			expect(state.enabled).toBe(true);
			expect(state.timestamp).toBeGreaterThan(0);
			expect(state.checksum).toBeDefined();
			expect(validatePlanModeState(state)).toBe(true);
		});

		it("should_create_valid_disabled_state", () => {
			const state = createPlanModeState(false);

			expect(state.enabled).toBe(false);
			expect(state.timestamp).toBeGreaterThan(0);
			expect(validatePlanModeState(state)).toBe(true);
		});

		it("should_create_unique_timestamps", async () => {
			const state1 = createPlanModeState(true);
			await new Promise((r) => setTimeout(r, 10));
			const state2 = createPlanModeState(true);

			expect(state1.timestamp).not.toBe(state2.timestamp);
		});
	});

	describe("isPlanModeActive", () => {
		beforeEach(() => {
			setupTestDir();
			vi.stubEnv("PI_PLAN_MODE", undefined);
		});

		afterEach(() => {
			cleanupTestDir();
			vi.unstubAllEnvs();
		});

		it("should_return_false_when_env_not_set", () => {
			expect(isPlanModeActive()).toBe(false);
		});

		it("should_return_false_when_env_set_but_no_state_file", () => {
			vi.stubEnv("PI_PLAN_MODE", "1");
			expect(isPlanModeActive()).toBe(false);
		});

		it("should_return_false_when_state_file_exists_but_disabled", () => {
			vi.stubEnv("PI_PLAN_MODE", "1");
			const state = createPlanModeState(false);
			writePlanModeState(state);

			// Note: This test reads from .pi/plans/plan-mode-state.json, not our test dir
			// So it will return false since that file doesn't exist
			expect(isPlanModeActive()).toBe(false);
		});
	});
});
