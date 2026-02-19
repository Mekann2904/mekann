/**
 * plan-mode-shared.ts 単体テスト
 * カバレッジ分析: isBashCommandAllowed, calculateChecksum, validatePlanModeState, createPlanModeState
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  vi,
} from "vitest";
import * as fc from "fast-check";
import * as crypto from "crypto";

import {
  READ_ONLY_COMMANDS,
  DESTRUCTIVE_COMMANDS,
  SHELL_COMMANDS,
  WRITE_COMMANDS,
  GIT_READONLY_SUBCOMMANDS,
  GIT_WRITE_SUBCOMMANDS,
  WRITE_BASH_COMMANDS,
  ADDITIONAL_WRITE_COMMANDS,
  isBashCommandAllowed,
  calculateChecksum,
  validatePlanModeState,
  createPlanModeState,
  PLAN_MODE_POLICY,
  PLAN_MODE_WARNING,
  PLAN_MODE_ENV_VAR,
} from "../../../.pi/lib/plan-mode-shared.js";
import type { PlanModeState } from "../../../.pi/lib/plan-mode-shared.js";

// ============================================================================
// 定数テスト
// ============================================================================

describe("READ_ONLY_COMMANDS", () => {
  it("READ_ONLY_COMMANDS_読み取りコマンド含む", () => {
    // Arrange & Act & Assert
    expect(READ_ONLY_COMMANDS.has("ls")).toBe(true);
    expect(READ_ONLY_COMMANDS.has("cat")).toBe(true);
    expect(READ_ONLY_COMMANDS.has("grep")).toBe(true);
  });

  it("READ_ONLY_COMMANDS_破壊的コマンド含まない", () => {
    // Arrange & Act & Assert
    expect(READ_ONLY_COMMANDS.has("rm")).toBe(false);
    expect(READ_ONLY_COMMANDS.has("mv")).toBe(false);
  });
});

describe("DESTRUCTIVE_COMMANDS", () => {
  it("DESTRUCTIVE_COMMANDS_破壊的コマンド含む", () => {
    // Arrange & Act & Assert
    expect(DESTRUCTIVE_COMMANDS.has("rm")).toBe(true);
    expect(DESTRUCTIVE_COMMANDS.has("mv")).toBe(true);
    expect(DESTRUCTIVE_COMMANDS.has("chmod")).toBe(true);
  });
});

describe("SHELL_COMMANDS", () => {
  it("SHELL_COMMANDS_シェルコマンド含む", () => {
    // Arrange & Act & Assert
    expect(SHELL_COMMANDS.has("bash")).toBe(true);
    expect(SHELL_COMMANDS.has("sh")).toBe(true);
    expect(SHELL_COMMANDS.has("zsh")).toBe(true);
  });
});

describe("GIT_READONLY_SUBCOMMANDS", () => {
  it("GIT_READONLY_SUBCOMMANDS_読み取りサブコマンド含む", () => {
    // Arrange & Act & Assert
    expect(GIT_READONLY_SUBCOMMANDS.has("status")).toBe(true);
    expect(GIT_READONLY_SUBCOMMANDS.has("log")).toBe(true);
    expect(GIT_READONLY_SUBCOMMANDS.has("diff")).toBe(true);
  });

  it("GIT_READONLY_SUBCOMMANDS_書き込みサブコマンド含まない", () => {
    // Arrange & Act & Assert
    expect(GIT_READONLY_SUBCOMMANDS.has("commit")).toBe(false);
    expect(GIT_READONLY_SUBCOMMANDS.has("push")).toBe(false);
  });
});

describe("GIT_WRITE_SUBCOMMANDS", () => {
  it("GIT_WRITE_SUBCOMMANDS_書き込みサブコマンド含む", () => {
    // Arrange & Act & Assert
    expect(GIT_WRITE_SUBCOMMANDS.has("commit")).toBe(true);
    expect(GIT_WRITE_SUBCOMMANDS.has("push")).toBe(true);
    expect(GIT_WRITE_SUBCOMMANDS.has("add")).toBe(true);
  });
});

// ============================================================================
// isBashCommandAllowed テスト
// ============================================================================

describe("isBashCommandAllowed", () => {
  it("isBashCommandAllowed_読み取りコマンド_true", () => {
    // Arrange & Act & Assert
    expect(isBashCommandAllowed("ls")).toBe(true);
    expect(isBashCommandAllowed("cat file.txt")).toBe(true);
    expect(isBashCommandAllowed("grep pattern file")).toBe(true);
  });

  it("isBashCommandAllowed_破壊的コマンド_false", () => {
    // Arrange & Act & Assert
    expect(isBashCommandAllowed("rm file")).toBe(false);
    expect(isBashCommandAllowed("mv a b")).toBe(false);
    expect(isBashCommandAllowed("chmod 755 file")).toBe(false);
  });

  it("isBashCommandAllowed_シェル起動_false", () => {
    // Arrange & Act & Assert
    expect(isBashCommandAllowed("bash -c 'rm file'")).toBe(false);
    expect(isBashCommandAllowed("sh script.sh")).toBe(false);
  });

  it("isBashCommandAllowed_パッケージマネージャ_false", () => {
    // Arrange & Act & Assert
    expect(isBashCommandAllowed("npm install")).toBe(false);
    expect(isBashCommandAllowed("pip install package")).toBe(false);
  });

  it("isBashCommandAllowed_リダイレクト_false", () => {
    // Arrange & Act & Assert
    expect(isBashCommandAllowed("echo hello > file")).toBe(false);
    expect(isBashCommandAllowed("cat file >> output")).toBe(false);
    expect(isBashCommandAllowed("cmd 2>&1")).toBe(false);
  });

  it("isBashCommandAllowed_パイプ_書き込みコマンド_false", () => {
    // Arrange & Act & Assert
    expect(isBashCommandAllowed("cat file | tee output")).toBe(false);
    expect(isBashCommandAllowed("echo test | npm install")).toBe(false);
  });

  it("isBashCommandAllowed_サブシェル_false", () => {
    // Arrange & Act & Assert
    expect(isBashCommandAllowed("$(cmd)")).toBe(false);
    expect(isBashCommandAllowed("`cmd`")).toBe(false);
    expect(isBashCommandAllowed("(rm file)")).toBe(false);
  });

  it("isBashCommandAllowed_空文字_false", () => {
    // Arrange & Act & Assert
    expect(isBashCommandAllowed("")).toBe(false);
    expect(isBashCommandAllowed("   ")).toBe(false);
  });

  it("isBashCommandAllowed_未知のコマンド_false", () => {
    // Arrange & Act & Assert
    expect(isBashCommandAllowed("unknown-command")).toBe(false);
  });

  it("isBashCommandAllowed_パイプ含む_false", () => {
    // Arrange & Act & Assert - パイプを含むコマンドは全てブロックされる
    expect(isBashCommandAllowed("cat file | grep pattern")).toBe(false);
    expect(isBashCommandAllowed("ls | head")).toBe(false);
  });
});

// ============================================================================
// calculateChecksum テスト
// ============================================================================

describe("calculateChecksum", () => {
  it("calculateChecksum_有効な状態_ハッシュ返却", () => {
    // Arrange
    const state = {
      enabled: true,
      timestamp: 1234567890,
    };

    // Act
    const result = calculateChecksum(state);

    // Assert
    expect(result).toMatch(/^[a-f0-9]{64}$/);
  });

  it("calculateChecksum_同じ値_同じハッシュ", () => {
    // Arrange
    const state = {
      enabled: true,
      timestamp: 1234567890,
    };

    // Act
    const hash1 = calculateChecksum(state);
    const hash2 = calculateChecksum(state);

    // Assert
    expect(hash1).toBe(hash2);
  });

  it("calculateChecksum_異なるenabled_異なるハッシュ", () => {
    // Arrange
    const state1 = { enabled: true, timestamp: 1234567890 };
    const state2 = { enabled: false, timestamp: 1234567890 };

    // Act
    const hash1 = calculateChecksum(state1);
    const hash2 = calculateChecksum(state2);

    // Assert
    expect(hash1).not.toBe(hash2);
  });

  it("calculateChecksum_異なるtimestamp_異なるハッシュ", () => {
    // Arrange
    const state1 = { enabled: true, timestamp: 1234567890 };
    const state2 = { enabled: true, timestamp: 1234567891 };

    // Act
    const hash1 = calculateChecksum(state1);
    const hash2 = calculateChecksum(state2);

    // Assert
    expect(hash1).not.toBe(hash2);
  });
});

// ============================================================================
// validatePlanModeState テスト
// ============================================================================

describe("validatePlanModeState", () => {
  it("validatePlanModeState_有効な状態_true", () => {
    // Arrange
    const state = createPlanModeState(true);

    // Act & Assert
    expect(validatePlanModeState(state)).toBe(true);
  });

  it("validatePlanModeState_無効なチェックサム_false", () => {
    // Arrange
    const state: PlanModeState = {
      enabled: true,
      timestamp: 1234567890,
      checksum: "invalid",
    };

    // Act & Assert
    expect(validatePlanModeState(state)).toBe(false);
  });

  it("validatePlanModeState_チェックサムなし_false", () => {
    // Arrange
    const state = {
      enabled: true,
      timestamp: 1234567890,
    } as unknown as PlanModeState;

    // Act & Assert
    expect(validatePlanModeState(state)).toBe(false);
  });

  it("validatePlanModeState_null_false", () => {
    // Arrange & Act & Assert
    expect(validatePlanModeState(null as unknown as PlanModeState)).toBe(false);
  });

  it("validatePlanModeState_undefined_false", () => {
    // Arrange & Act & Assert
    expect(validatePlanModeState(undefined as unknown as PlanModeState)).toBe(false);
  });

  it("validatePlanModeState_改ざん検出_false", () => {
    // Arrange
    const state = createPlanModeState(true);
    // 改ざん
    state.enabled = false;

    // Act & Assert
    expect(validatePlanModeState(state)).toBe(false);
  });
});

// ============================================================================
// createPlanModeState テスト
// ============================================================================

describe("createPlanModeState", () => {
  it("createPlanModeState_enabled_有効な状態作成", () => {
    // Arrange & Act
    const result = createPlanModeState(true);

    // Assert
    expect(result.enabled).toBe(true);
    expect(result.timestamp).toBeGreaterThan(0);
    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it("createPlanModeState_disabled_有効な状態作成", () => {
    // Arrange & Act
    const result = createPlanModeState(false);

    // Assert
    expect(result.enabled).toBe(false);
    expect(result.timestamp).toBeGreaterThan(0);
    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it("createPlanModeState_チェックサム整合_検証成功", () => {
    // Arrange
    const state = createPlanModeState(true);

    // Act & Assert
    expect(validatePlanModeState(state)).toBe(true);
  });

  it("createPlanModeState_タイムスタンプ_現在時刻付近", () => {
    // Arrange
    const before = Date.now();

    // Act
    const result = createPlanModeState(true);
    const after = Date.now();

    // Assert
    expect(result.timestamp).toBeGreaterThanOrEqual(before);
    expect(result.timestamp).toBeLessThanOrEqual(after);
  });
});

// ============================================================================
// 定数テキストテスト
// ============================================================================

describe("PLAN_MODE_POLICY", () => {
  it("PLAN_MODE_POLICY_非空文字列", () => {
    // Arrange & Act & Assert
    expect(PLAN_MODE_POLICY.length).toBeGreaterThan(0);
  });

  it("PLAN_MODE_POLICY_プランモード言及", () => {
    // Arrange & Act & Assert
    expect(PLAN_MODE_POLICY.toLowerCase()).toContain("plan mode");
  });
});

describe("PLAN_MODE_WARNING", () => {
  it("PLAN_MODE_WARNING_非空文字列", () => {
    // Arrange & Act & Assert
    expect(PLAN_MODE_WARNING.length).toBeGreaterThan(0);
  });

  it("PLAN_MODE_WARNING_プランモード言及", () => {
    // Arrange & Act & Assert
    expect(PLAN_MODE_WARNING.toLowerCase()).toContain("plan mode");
  });
});

describe("PLAN_MODE_ENV_VAR", () => {
  it("PLAN_MODE_ENV_VAR_正しい環境変数名", () => {
    // Arrange & Act & Assert
    expect(PLAN_MODE_ENV_VAR).toBe("PI_PLAN_MODE");
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  it("isBashCommandAllowed_任意のコマンド_ブール値", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 1000 }), (command) => {
        const result = isBashCommandAllowed(command);
        return typeof result === "boolean";
      })
    );
  });

  it("calculateChecksum_任意の状態_64文字16進数", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.integer({ min: 0 }), (enabled, timestamp) => {
        const result = calculateChecksum({ enabled, timestamp });
        return /^[a-f0-9]{64}$/.test(result);
      })
    );
  });

  it("createPlanModeState_任意のブール値_有効な状態", () => {
    fc.assert(
      fc.property(fc.boolean(), (enabled) => {
        const state = createPlanModeState(enabled);
        return (
          state.enabled === enabled &&
          typeof state.timestamp === "number" &&
          typeof state.checksum === "string" &&
          validatePlanModeState(state)
        );
      })
    );
  });
});

// ============================================================================
// 境界値テスト
// ============================================================================

describe("境界値テスト", () => {
  it("isBashCommandAllowed_非常に長いコマンド_処理可能", () => {
    // Arrange
    const longCommand = "ls " + "a".repeat(10000);

    // Act & Assert
    expect(() => isBashCommandAllowed(longCommand)).not.toThrow();
  });

  it("calculateChecksum_大きなタイムスタンプ_処理可能", () => {
    // Arrange & Act
    const result = calculateChecksum({
      enabled: true,
      timestamp: Number.MAX_SAFE_INTEGER,
    });

    // Assert
    expect(result).toMatch(/^[a-f0-9]{64}$/);
  });

  it("createPlanModeState_連続作成_異なるタイムスタンプ", async () => {
    // Arrange
    const state1 = createPlanModeState(true);
    await new Promise((r) => setTimeout(r, 1));
    const state2 = createPlanModeState(true);

    // Assert - タイムスタンプが異なるかチェックサムが異なる
    const different = state1.timestamp !== state2.timestamp || state1.checksum !== state2.checksum;
    expect(different).toBe(true);
  });
});
