/**
 * pattern-extraction.ts 単体テスト
 * カバレッジ分析: extractPatternFromRun, isSuccessPattern, isFailurePattern
 */
import {
  describe,
  it,
  expect,
  beforeEach,
} from "vitest";
import * as fc from "fast-check";

import {
  extractPatternFromRun,
  getPatternStoragePath,
  PATTERN_STORAGE_VERSION,
  type RunData,
  type ExtractedPattern,
} from "../../../.pi/lib/pattern-extraction.js";

// ============================================================================
// extractPatternFromRun テスト
// ============================================================================

describe("extractPatternFromRun", () => {
  it("extractPatternFromRun_成功パターン_抽出", () => {
    // Arrange
    const run: RunData = {
      runId: "run-123",
      agentId: "agent-456",
      task: "Fix bug in authentication",
      summary: "Successfully fixed the bug",
      status: "completed",
      startedAt: "2024-01-01T00:00:00Z",
      finishedAt: "2024-01-01T00:10:00Z",
    };

    // Act
    const result = extractPatternFromRun(run);

    // Assert
    expect(result).not.toBeNull();
    expect(result!.patternType).toBe("success");
    expect(result!.taskType).toBe("bug-fix");
  });

  it("extractPatternFromRun_失敗パターン_抽出", () => {
    // Arrange
    const run: RunData = {
      runId: "run-123",
      agentId: "agent-456",
      task: "Fix bug",
      summary: "Failed to fix the issue",
      status: "failed",
      startedAt: "2024-01-01T00:00:00Z",
      finishedAt: "2024-01-01T00:10:00Z",
    };

    // Act
    const result = extractPatternFromRun(run);

    // Assert
    expect(result).not.toBeNull();
    expect(result!.patternType).toBe("failure");
  });

  it("extractPatternFromRun_アプローチパターン_抽出", () => {
    // Arrange - 成功/失敗の指標がない場合、アプローチパターンになる
    const run: RunData = {
      runId: "run-123",
      agentId: "agent-456",
      task: "Analyze code structure",
      summary: "Analyzed the code structure",
      status: "completed",
      startedAt: "2024-01-01T00:00:00Z",
      finishedAt: "2024-01-01T00:10:00Z",
    };

    // Act
    const result = extractPatternFromRun(run);

    // Assert - 成功/失敗指標がないのでアプローチパターン
    expect(result).not.toBeNull();
    expect(result!.patternType).toBe("approach");
  });

  it("extractPatternFromRun_キーワード抽出_正常", () => {
    // Arrange
    const run: RunData = {
      runId: "run-123",
      agentId: "agent-456",
      task: "Implement authentication feature",
      summary: "Added user login functionality",
      status: "completed",
      startedAt: "2024-01-01T00:00:00Z",
      finishedAt: "2024-01-01T00:10:00Z",
    };

    // Act
    const result = extractPatternFromRun(run);

    // Assert
    expect(result!.keywords.length).toBeGreaterThan(0);
  });

  it("extractPatternFromRun_agentId設定", () => {
    // Arrange
    const run: RunData = {
      runId: "run-123",
      agentId: "agent-456",
      task: "Task",
      summary: "Completed",
      status: "completed",
      startedAt: "2024-01-01T00:00:00Z",
      finishedAt: "2024-01-01T00:10:00Z",
    };

    // Act
    const result = extractPatternFromRun(run);

    // Assert
    expect(result!.agentOrTeam).toBe("agent-456");
  });

  it("extractPatternFromRun_teamId設定", () => {
    // Arrange
    const run: RunData = {
      runId: "run-123",
      teamId: "team-789",
      task: "Task",
      summary: "Completed",
      status: "completed",
      startedAt: "2024-01-01T00:00:00Z",
      finishedAt: "2024-01-01T00:10:00Z",
    };

    // Act
    const result = extractPatternFromRun(run);

    // Assert
    expect(result!.agentOrTeam).toBe("team-789");
  });

  it("extractPatternFromRun_エラー情報含む_説明に反映", () => {
    // Arrange
    const run: RunData = {
      runId: "run-123",
      agentId: "agent-456",
      task: "Fix bug",
      summary: "Failed with error",
      status: "failed",
      error: "Connection timeout",
      startedAt: "2024-01-01T00:00:00Z",
      finishedAt: "2024-01-01T00:10:00Z",
    };

    // Act
    const result = extractPatternFromRun(run);

    // Assert
    expect(result!.description).toContain("timeout");
  });

  it("extractPatternFromRun_confidence_completed高い", () => {
    // Arrange
    const runCompleted: RunData = {
      runId: "run-123",
      agentId: "agent-456",
      task: "Task",
      summary: "Completed",
      status: "completed",
      startedAt: "2024-01-01T00:00:00Z",
      finishedAt: "2024-01-01T00:10:00Z",
    };

    const runFailed: RunData = {
      ...runCompleted,
      status: "failed",
      summary: "Failed",
    };

    // Act
    const resultCompleted = extractPatternFromRun(runCompleted);
    const resultFailed = extractPatternFromRun(runFailed);

    // Assert
    expect(resultCompleted!.confidence).toBeGreaterThan(resultFailed!.confidence);
  });

  it("extractPatternFromRun_例追加_正常", () => {
    // Arrange
    const run: RunData = {
      runId: "run-123",
      agentId: "agent-456",
      task: "Task",
      summary: "Completed",
      status: "completed",
      startedAt: "2024-01-01T00:00:00Z",
      finishedAt: "2024-01-01T00:10:00Z",
    };

    // Act
    const result = extractPatternFromRun(run);

    // Assert
    expect(result!.examples).toHaveLength(1);
    expect(result!.examples[0].runId).toBe("run-123");
  });
});

// ============================================================================
// 成功パターン検出 テスト
// ============================================================================

describe("成功パターン検出", () => {
  it("成功指標_completed_検出", () => {
    // Arrange
    const run: RunData = {
      runId: "run-1",
      task: "Task",
      summary: "Task completed successfully",
      status: "completed",
      startedAt: "2024-01-01T00:00:00Z",
      finishedAt: "2024-01-01T00:10:00Z",
    };

    // Act
    const result = extractPatternFromRun(run);

    // Assert
    expect(result!.patternType).toBe("success");
  });

  it("成功指標_success_検出", () => {
    // Arrange
    const run: RunData = {
      runId: "run-1",
      task: "Task",
      summary: "Operation was a success",
      status: "completed",
      startedAt: "2024-01-01T00:00:00Z",
      finishedAt: "2024-01-01T00:10:00Z",
    };

    // Act
    const result = extractPatternFromRun(run);

    // Assert
    expect(result!.patternType).toBe("success");
  });

  it("成功指標_完了_検出", () => {
    // Arrange
    const run: RunData = {
      runId: "run-1",
      task: "Task",
      summary: "処理が完了しました",
      status: "completed",
      startedAt: "2024-01-01T00:00:00Z",
      finishedAt: "2024-01-01T00:10:00Z",
    };

    // Act
    const result = extractPatternFromRun(run);

    // Assert
    expect(result!.patternType).toBe("success");
  });

  it("成功指標_成功_検出", () => {
    // Arrange
    const run: RunData = {
      runId: "run-1",
      task: "Task",
      summary: "タスクが成功しました",
      status: "completed",
      startedAt: "2024-01-01T00:00:00Z",
      finishedAt: "2024-01-01T00:10:00Z",
    };

    // Act
    const result = extractPatternFromRun(run);

    // Assert
    expect(result!.patternType).toBe("success");
  });
});

// ============================================================================
// 失敗パターン検出 テスト
// ============================================================================

describe("失敗パターン検出", () => {
  it("失敗指標_failed_検出", () => {
    // Arrange
    const run: RunData = {
      runId: "run-1",
      task: "Task",
      summary: "Task failed",
      status: "failed",
      startedAt: "2024-01-01T00:00:00Z",
      finishedAt: "2024-01-01T00:10:00Z",
    };

    // Act
    const result = extractPatternFromRun(run);

    // Assert
    expect(result!.patternType).toBe("failure");
  });

  it("失敗指標_failedステータス_検出", () => {
    // Arrange
    const run: RunData = {
      runId: "run-1",
      task: "Task",
      summary: "Some summary",
      status: "failed",
      startedAt: "2024-01-01T00:00:00Z",
      finishedAt: "2024-01-01T00:10:00Z",
    };

    // Act
    const result = extractPatternFromRun(run);

    // Assert
    expect(result!.patternType).toBe("failure");
  });

  it("失敗指標_timeout_検出", () => {
    // Arrange
    const run: RunData = {
      runId: "run-1",
      task: "Task",
      summary: "Request timeout occurred",
      status: "completed",
      startedAt: "2024-01-01T00:00:00Z",
      finishedAt: "2024-01-01T00:10:00Z",
    };

    // Act
    const result = extractPatternFromRun(run);

    // Assert
    expect(result!.patternType).toBe("failure");
  });

  it("失敗指標_失敗_検出", () => {
    // Arrange
    const run: RunData = {
      runId: "run-1",
      task: "Task",
      summary: "処理が失敗しました",
      status: "completed",
      startedAt: "2024-01-01T00:00:00Z",
      finishedAt: "2024-01-01T00:10:00Z",
    };

    // Act
    const result = extractPatternFromRun(run);

    // Assert
    expect(result!.patternType).toBe("failure");
  });

  it("解決済みエラー_成功扱い", () => {
    // Arrange
    const run: RunData = {
      runId: "run-1",
      task: "Task",
      summary: "Fixed the error in authentication",
      status: "completed",
      startedAt: "2024-01-01T00:00:00Z",
      finishedAt: "2024-01-01T00:10:00Z",
    };

    // Act
    const result = extractPatternFromRun(run);

    // Assert - "fixed error" should be success, not failure
    expect(result!.patternType).toBe("success");
  });
});

// ============================================================================
// getPatternStoragePath テスト
// ============================================================================

describe("getPatternStoragePath", () => {
  it("getPatternStoragePath_基本_パス返却", () => {
    // Arrange & Act
    const result = getPatternStoragePath("/workspace");

    // Assert
    expect(result).toContain(".pi");
    expect(result).toContain("memory");
    expect(result).toContain("patterns.json");
  });

  it("getPatternStoragePath_パス結合_正常", () => {
    // Arrange & Act
    const result = getPatternStoragePath("/home/user/project");

    // Assert
    expect(result).toBe("/home/user/project/.pi/memory/patterns.json");
  });
});

// ============================================================================
// PATTERN_STORAGE_VERSION テスト
// ============================================================================

describe("PATTERN_STORAGE_VERSION", () => {
  it("PATTERN_STORAGE_VERSION_正の整数", () => {
    // Arrange & Act & Assert
    expect(PATTERN_STORAGE_VERSION).toBeGreaterThan(0);
    expect(Number.isInteger(PATTERN_STORAGE_VERSION)).toBe(true);
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  it("extractPatternFromRun_任意のRunData_有効なパターン", () => {
    fc.assert(
      fc.property(
        fc.record({
          runId: fc.string({ minLength: 1, maxLength: 50 }),
          agentId: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
          teamId: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
          task: fc.string({ maxLength: 500 }),
          summary: fc.string({ maxLength: 1000 }),
          status: fc.constantFrom("completed", "failed"),
          startedAt: fc.string({ maxLength: 50 }),
          finishedAt: fc.string({ maxLength: 50 }),
          error: fc.option(fc.string({ maxLength: 500 }), { nil: undefined }),
        }),
        (run) => {
          const result = extractPatternFromRun(run as RunData);
          if (!result) return true; // null is valid for edge cases

          return (
            ["success", "failure", "approach"].includes(result.patternType) &&
            typeof result.id === "string" &&
            Array.isArray(result.keywords) &&
            typeof result.confidence === "number"
          );
        }
      )
    );
  });
});

// ============================================================================
// 境界値テスト
// ============================================================================

describe("境界値テスト", () => {
  it("extractPatternFromRun_空タスク_処理可能", () => {
    // Arrange
    const run: RunData = {
      runId: "run-123",
      task: "",
      summary: "Completed",
      status: "completed",
      startedAt: "2024-01-01T00:00:00Z",
      finishedAt: "2024-01-01T00:10:00Z",
    };

    // Act & Assert
    expect(() => extractPatternFromRun(run)).not.toThrow();
  });

  it("extractPatternFromRun_空サマリー_処理可能", () => {
    // Arrange
    const run: RunData = {
      runId: "run-123",
      task: "Task",
      summary: "",
      status: "completed",
      startedAt: "2024-01-01T00:00:00Z",
      finishedAt: "2024-01-01T00:10:00Z",
    };

    // Act & Assert
    expect(() => extractPatternFromRun(run)).not.toThrow();
  });

  it("extractPatternFromRun_非常に長いサマリー_切り詰め", () => {
    // Arrange
    const run: RunData = {
      runId: "run-123",
      task: "Task",
      summary: "a".repeat(10000),
      status: "completed",
      startedAt: "2024-01-01T00:00:00Z",
      finishedAt: "2024-01-01T00:10:00Z",
    };

    // Act
    const result = extractPatternFromRun(run);

    // Assert - description should be truncated
    expect(result!.description.length).toBeLessThan(10000);
  });
});
