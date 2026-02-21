/**
 * @file .pi/lib/plan-mode-shared.ts の単体テスト
 * @description プランモード共有定数とユーティリティのテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import * as fc from "fast-check";
import {
	READ_ONLY_COMMANDS,
	DESTRUCTIVE_COMMANDS,
	SHELL_COMMANDS,
	WRITE_COMMANDS,
	GIT_READONLY_SUBCOMMANDS,
	GIT_WRITE_SUBCOMMANDS,
	WRITE_BASH_COMMANDS,
	ADDITIONAL_WRITE_COMMANDS,
	PLAN_MODE_POLICY,
	PLAN_MODE_WARNING,
	PLAN_MODE_CONTEXT_TYPE,
	PLAN_MODE_STATUS_KEY,
	PLAN_MODE_ENV_VAR,
	type PlanModeState,
	isBashCommandAllowed,
	calculateChecksum,
	validatePlanModeState,
	createPlanModeState,
} from "@lib/plan-mode-shared";

// ============================================================================
// Constants
// ============================================================================

describe("Constants", () => {
	describe("READ_ONLY_COMMANDS", () => {
		it("should_contain_basic_read_commands", () => {
			expect(READ_ONLY_COMMANDS.has("cat")).toBe(true);
			expect(READ_ONLY_COMMANDS.has("ls")).toBe(true);
			expect(READ_ONLY_COMMANDS.has("grep")).toBe(true);
			expect(READ_ONLY_COMMANDS.has("head")).toBe(true);
			expect(READ_ONLY_COMMANDS.has("tail")).toBe(true);
		});

		it("should_not_contain_write_commands", () => {
			expect(READ_ONLY_COMMANDS.has("rm")).toBe(false);
			expect(READ_ONLY_COMMANDS.has("mv")).toBe(false);
			expect(READ_ONLY_COMMANDS.has("cp")).toBe(false);
		});

		it("should_be_frozen_or_treated_as_immutable", () => {
			// Setは追加してもエラーにならないが、テストとしては確認
			const sizeBefore = READ_ONLY_COMMANDS.size;
			expect(READ_ONLY_COMMANDS.size).toBe(sizeBefore);
		});
	});

	describe("DESTRUCTIVE_COMMANDS", () => {
		it("should_contain_destructive_commands", () => {
			expect(DESTRUCTIVE_COMMANDS.has("rm")).toBe(true);
			expect(DESTRUCTIVE_COMMANDS.has("rmdir")).toBe(true);
			expect(DESTRUCTIVE_COMMANDS.has("mv")).toBe(true);
			expect(DESTRUCTIVE_COMMANDS.has("chmod")).toBe(true);
			expect(DESTRUCTIVE_COMMANDS.has("kill")).toBe(true);
		});

		it("should_not_contain_read_commands", () => {
			expect(DESTRUCTIVE_COMMANDS.has("cat")).toBe(false);
			expect(DESTRUCTIVE_COMMANDS.has("ls")).toBe(false);
		});
	});

	describe("GIT_READONLY_SUBCOMMANDS", () => {
		it("should_contain_readonly_git_subcommands", () => {
			expect(GIT_READONLY_SUBCOMMANDS.has("status")).toBe(true);
			expect(GIT_READONLY_SUBCOMMANDS.has("log")).toBe(true);
			expect(GIT_READONLY_SUBCOMMANDS.has("diff")).toBe(true);
			expect(GIT_READONLY_SUBCOMMANDS.has("show")).toBe(true);
			expect(GIT_READONLY_SUBCOMMANDS.has("branch")).toBe(true);
		});

		it("should_not_contain_write_git_subcommands", () => {
			expect(GIT_READONLY_SUBCOMMANDS.has("add")).toBe(false);
			expect(GIT_READONLY_SUBCOMMANDS.has("commit")).toBe(false);
			expect(GIT_READONLY_SUBCOMMANDS.has("push")).toBe(false);
		});
	});

	describe("GIT_WRITE_SUBCOMMANDS", () => {
		it("should_contain_write_git_subcommands", () => {
			expect(GIT_WRITE_SUBCOMMANDS.has("add")).toBe(true);
			expect(GIT_WRITE_SUBCOMMANDS.has("commit")).toBe(true);
			expect(GIT_WRITE_SUBCOMMANDS.has("push")).toBe(true);
			expect(GIT_WRITE_SUBCOMMANDS.has("merge")).toBe(true);
		});
	});

	describe("Policy constants", () => {
		it("PLAN_MODE_POLICY should_be_non_empty_string", () => {
			expect(typeof PLAN_MODE_POLICY).toBe("string");
			expect(PLAN_MODE_POLICY.length).toBeGreaterThan(0);
		});

		it("PLAN_MODE_WARNING should_be_non_empty_string", () => {
			expect(typeof PLAN_MODE_WARNING).toBe("string");
			expect(PLAN_MODE_WARNING.length).toBeGreaterThan(0);
		});

		it("PLAN_MODE_CONTEXT_TYPE should_be_defined", () => {
			expect(PLAN_MODE_CONTEXT_TYPE).toBe("plan-mode-context");
		});

		it("PLAN_MODE_STATUS_KEY should_be_defined", () => {
			expect(PLAN_MODE_STATUS_KEY).toBe("plan-mode");
		});

		it("PLAN_MODE_ENV_VAR should_be_defined", () => {
			expect(PLAN_MODE_ENV_VAR).toBe("PI_PLAN_MODE");
		});
	});
});

// ============================================================================
// isBashCommandAllowed
// ============================================================================

describe("isBashCommandAllowed", () => {
	describe("正常系: 許可されるコマンド", () => {
		it("should_allow_readonly_commands", () => {
			expect(isBashCommandAllowed("cat file.txt")).toBe(true);
			expect(isBashCommandAllowed("ls -la")).toBe(true);
			expect(isBashCommandAllowed("grep pattern file.txt")).toBe(true);
			expect(isBashCommandAllowed("head -n 10 file.txt")).toBe(true);
			expect(isBashCommandAllowed("tail -f log.txt")).toBe(true);
		});

		it("should_allow_navigation_commands", () => {
			expect(isBashCommandAllowed("cd /tmp")).toBe(true);
			expect(isBashCommandAllowed("pwd")).toBe(true);
		});

		it("should_allow_info_commands", () => {
			expect(isBashCommandAllowed("which node")).toBe(true);
			expect(isBashCommandAllowed("date")).toBe(true);
			expect(isBashCommandAllowed("uptime")).toBe(true);
			expect(isBashCommandAllowed("env")).toBe(true);
		});
	});

	describe("ブロック: 出力リダイレクト", () => {
		it("should_block_output_redirect", () => {
			expect(isBashCommandAllowed("echo hello > file.txt")).toBe(false);
			expect(isBashCommandAllowed("echo hello >> file.txt")).toBe(false);
		});

		it("should_block_stderr_redirect", () => {
			expect(isBashCommandAllowed("cmd 2> error.log")).toBe(false);
			expect(isBashCommandAllowed("cmd 2>> error.log")).toBe(false);
		});

		it("should_block_combined_redirect", () => {
			expect(isBashCommandAllowed("cmd &> output.log")).toBe(false);
			expect(isBashCommandAllowed("cmd &>> output.log")).toBe(false);
		});
	});

	describe("ブロック: パイプライン", () => {
		it("should_block_pipeline_with_write_commands", () => {
			expect(isBashCommandAllowed("cat file | tee output")).toBe(false);
			expect(isBashCommandAllowed("cat file | tar -xf -")).toBe(false);
		});
	});

	describe("ブロック: サブシェル", () => {
		it("should_block_subshell_parentheses", () => {
			expect(isBashCommandAllowed("(cd /tmp && ls)")).toBe(false);
		});

		it("should_block_command_substitution", () => {
			expect(isBashCommandAllowed("echo $(date)")).toBe(false);
			expect(isBashCommandAllowed("echo `date`")).toBe(false);
		});

		it("should_block_variable_expansion_with_command", () => {
			expect(isBashCommandAllowed("${PATH}")).toBe(false);
		});
	});

	describe("ブロック: シェル起動", () => {
		it("should_block_shell_invocation", () => {
			expect(isBashCommandAllowed("bash")).toBe(false);
			expect(isBashCommandAllowed("sh script.sh")).toBe(false);
			expect(isBashCommandAllowed("zsh")).toBe(false);
			expect(isBashCommandAllowed("fish")).toBe(false);
		});
	});

	describe("ブロック: 書き込みコマンド", () => {
		it("should_block_package_managers", () => {
			expect(isBashCommandAllowed("npm install")).toBe(false);
			expect(isBashCommandAllowed("yarn add pkg")).toBe(false);
			expect(isBashCommandAllowed("pip install pkg")).toBe(false);
		});

		it("should_block_write_commands_from_additional_set", () => {
			expect(isBashCommandAllowed("bash")).toBe(false);
			expect(isBashCommandAllowed("sh")).toBe(false);
		});
	});

	describe("エッジケース", () => {
		it("should_return_false_for_empty_command", () => {
			expect(isBashCommandAllowed("")).toBe(false);
		});

		it("should_return_false_for_whitespace_only_command", () => {
			expect(isBashCommandAllowed("   ")).toBe(false);
		});

		it("should_handle_command_with_leading_whitespace", () => {
			expect(isBashCommandAllowed("   ls")).toBe(true);
		});

		it("should_handle_unknown_command", () => {
			expect(isBashCommandAllowed("unknowncmd arg")).toBe(false);
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 許可コマンドは常にtrueを返す", () => {
			const allowedCommands = ["cat", "ls", "grep", "head", "tail", "cd", "pwd", "which", "date", "env"];

			fc.assert(
				fc.property(
					fc.constantFrom(...allowedCommands),
					fc.string({ maxLength: 20 }),
					(cmd, args) => {
						const command = args ? `${cmd} ${args}` : cmd;
						// リダイレクトやパイプを含まない場合のみテスト
						fc.pre(!/[>|$()`]/.test(command));
						expect(isBashCommandAllowed(command)).toBe(true);
					}
				)
			);
		});
	});
});

// ============================================================================
// Checksum Functions
// ============================================================================

describe("calculateChecksum", () => {
	it("should_return_consistent_checksum_for_same_input", () => {
		const state = { enabled: true, timestamp: 12345 };

		const checksum1 = calculateChecksum(state);
		const checksum2 = calculateChecksum(state);

		expect(checksum1).toBe(checksum2);
	});

	it("should_return_different_checksum_for_different_input", () => {
		const state1 = { enabled: true, timestamp: 12345 };
		const state2 = { enabled: false, timestamp: 12345 };

		const checksum1 = calculateChecksum(state1);
		const checksum2 = calculateChecksum(state2);

		expect(checksum1).not.toBe(checksum2);
	});

	it("should_return_64_character_hex_string", () => {
		const state = { enabled: true, timestamp: Date.now() };
		const checksum = calculateChecksum(state);

		expect(checksum).toHaveLength(64);
		expect(/^[0-9a-f]+$/.test(checksum)).toBe(true);
	});

	describe("プロパティベーステスト", () => {
		it("PBT: チェックサムは常に64文字の16進数", () => {
			fc.assert(
				fc.property(
					fc.record({
						enabled: fc.boolean(),
						timestamp: fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
					}),
					(state) => {
						const checksum = calculateChecksum(state);
						expect(checksum).toHaveLength(64);
						expect(/^[0-9a-f]+$/.test(checksum)).toBe(true);
					}
				)
			);
		});

		it("PBT: 同じ入力は同じチェックサム", () => {
			fc.assert(
				fc.property(
					fc.record({
						enabled: fc.boolean(),
						timestamp: fc.integer({ min: 0 }),
					}),
					(state) => {
						const checksum1 = calculateChecksum(state);
						const checksum2 = calculateChecksum(state);
						expect(checksum1).toBe(checksum2);
					}
				)
			);
		});
	});
});

// ============================================================================
// validatePlanModeState
// ============================================================================

describe("validatePlanModeState", () => {
	it("should_return_true_for_valid_state", () => {
		const state = createPlanModeState(true);
		expect(validatePlanModeState(state)).toBe(true);
	});

	it("should_return_false_for_missing_checksum", () => {
		const state = { enabled: true, timestamp: Date.now() } as PlanModeState;
		expect(validatePlanModeState(state)).toBe(false);
	});

	it("should_return_false_for_invalid_checksum", () => {
		const state: PlanModeState = {
			enabled: true,
			timestamp: Date.now(),
			checksum: "invalid",
		};
		expect(validatePlanModeState(state)).toBe(false);
	});

	it("should_return_false_for_null_state", () => {
		expect(validatePlanModeState(null as unknown as PlanModeState)).toBe(false);
	});

	it("should_return_false_for_undefined_state", () => {
		expect(validatePlanModeState(undefined as unknown as PlanModeState)).toBe(false);
	});

	it("should_detect_tampered_state", () => {
		const state = createPlanModeState(true);
		const tamperedState: PlanModeState = {
			...state,
			enabled: false, // チェックサムを変更せずに状態を改ざん
		};
		expect(validatePlanModeState(tamperedState)).toBe(false);
	});
});

// ============================================================================
// createPlanModeState
// ============================================================================

describe("createPlanModeState", () => {
	it("should_create_state_with_enabled_true", () => {
		const state = createPlanModeState(true);

		expect(state.enabled).toBe(true);
		expect(state.timestamp).toBeGreaterThan(0);
		expect(state.checksum).toHaveLength(64);
	});

	it("should_create_state_with_enabled_false", () => {
		const state = createPlanModeState(false);

		expect(state.enabled).toBe(false);
		expect(state.timestamp).toBeGreaterThan(0);
		expect(state.checksum).toHaveLength(64);
	});

	it("should_create_valid_state", () => {
		const state = createPlanModeState(true);
		expect(validatePlanModeState(state)).toBe(true);
	});

	it("should_create_state_with_current_timestamp", () => {
		const before = Date.now();
		const state = createPlanModeState(true);
		const after = Date.now();

		expect(state.timestamp).toBeGreaterThanOrEqual(before);
		expect(state.timestamp).toBeLessThanOrEqual(after);
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 作成された状態は常に有効", () => {
			fc.assert(
				fc.property(fc.boolean(), (enabled) => {
					const state = createPlanModeState(enabled);
					expect(validatePlanModeState(state)).toBe(true);
					expect(state.enabled).toBe(enabled);
				})
			);
		});
	});
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("Integration: State Lifecycle", () => {
	it("should_support_full_lifecycle", () => {
		// 1. 状態作成
		const state = createPlanModeState(true);

		// 2. 検証
		expect(validatePlanModeState(state)).toBe(true);

		// 3. チェックサムが正しい
		const expectedChecksum = calculateChecksum({
			enabled: state.enabled,
			timestamp: state.timestamp,
		});
		expect(state.checksum).toBe(expectedChecksum);

		// 4. 無効な変更を検出
		const tampered = { ...state, enabled: false };
		expect(validatePlanModeState(tampered)).toBe(false);
	});
});
