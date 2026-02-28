/**
 * run-index.ts 単体テスト
 * カバレッジ分析: extractKeywords, classifyTaskType, extractFiles, indexSubagentRun, indexTeamRun, searchRuns
 */
import {
  describe,
  it,
  expect,
  beforeEach,
} from "vitest";
import * as fc from "fast-check";

import {
  extractKeywords,
  classifyTaskType,
  extractFiles,
  indexSubagentRun,
  indexTeamRun,
  RUN_INDEX_VERSION,
  type IndexedRun,
  type TaskType,
  type RunIndex,
} from "../../../.pi/lib/storage/run-index.js";

// ============================================================================
// extractKeywords テスト
// ============================================================================

describe("extractKeywords", () => {
  it("extractKeywords_基本_キーワード抽出", () => {
    // Arrange
    const text = "Fix bug in authentication module";

    // Act
    const result = extractKeywords(text);

    // Assert
    expect(result).toContain("fix");
    expect(result).toContain("bug");
    expect(result).toContain("authentication");
    expect(result).toContain("module");
  });

  it("extractKeywords_日本語含む_抽出", () => {
    // Arrange
    const text = "バグを修正する fix bug";

    // Act
    const result = extractKeywords(text);

    // Assert - 日本語は連続して1つのキーワードとして抽出される
    expect(result.some(k => k.includes("バグ") || k.includes("修正"))).toBe(true);
    expect(result).toContain("fix");
    expect(result).toContain("bug");
  });

  it("extractKeywords_ストップワード_除外", () => {
    // Arrange
    const text = "The code is working with the system";

    // Act
    const result = extractKeywords(text);

    // Assert
    expect(result).not.toContain("the");
    expect(result).not.toContain("is");
    expect(result).not.toContain("with");
  });

  it("extractKeywords_小文字化_正規化", () => {
    // Arrange
    const text = "Fix BUG in MODULE";

    // Act
    const result = extractKeywords(text);

    // Assert
    expect(result.every(k => k === k.toLowerCase())).toBe(true);
  });

  it("extractKeywords_短い単語_除外", () => {
    // Arrange
    const text = "a b cd efg";

    // Act
    const result = extractKeywords(text);

    // Assert - 長さ2以上の単語が抽出される（cdとefg）
    expect(result).not.toContain("a");
    expect(result).not.toContain("b");
    // cdは長さ2なので含まれる
    expect(result).toContain("cd");
    expect(result).toContain("efg");
  });

  it("extractKeywords_空文字_空配列", () => {
    // Arrange & Act
    const result = extractKeywords("");

    // Assert
    expect(result).toEqual([]);
  });

  it("extractKeywords_ストップワードのみ_空配列", () => {
    // Arrange
    const text = "the a an is are was were";

    // Act
    const result = extractKeywords(text);

    // Assert
    expect(result).toEqual([]);
  });

  it("extractKeywords_重複_一意化", () => {
    // Arrange
    const text = "fix fix fix bug bug";

    // Act
    const result = extractKeywords(text);

    // Assert
    const fixCount = result.filter(k => k === "fix").length;
    const bugCount = result.filter(k => k === "bug").length;
    expect(fixCount).toBe(1);
    expect(bugCount).toBe(1);
  });
});

// ============================================================================
// classifyTaskType テスト
// ============================================================================

describe("classifyTaskType", () => {
  it("classifyTaskType_bug-fix_分類", () => {
    // Arrange & Act
    const result = classifyTaskType("Fix the authentication bug", "");

    // Assert
    expect(result).toBe("bug-fix");
  });

  it("classifyTaskType_code-review_分類", () => {
    // Arrange & Act
    const result = classifyTaskType("Review the code changes", "");

    // Assert
    expect(result).toBe("code-review");
  });

  it("classifyTaskType_feature-implementation_分類", () => {
    // Arrange & Act
    const result = classifyTaskType("Implement new feature", "");

    // Assert
    expect(result).toBe("feature-implementation");
  });

  it("classifyTaskType_refactoring_分類", () => {
    // Arrange & Act
    const result = classifyTaskType("Refactor the module", "");

    // Assert
    expect(result).toBe("refactoring");
  });

  it("classifyTaskType_research_分類", () => {
    // Arrange & Act
    const result = classifyTaskType("Research the API", "");

    // Assert
    expect(result).toBe("research");
  });

  it("classifyTaskType_documentation_分類", () => {
    // Arrange & Act
    const result = classifyTaskType("Update the documentation", "");

    // Assert
    expect(result).toBe("documentation");
  });

  it("classifyTaskType_testing_分類", () => {
    // Arrange & Act
    const result = classifyTaskType("Write tests for the module", "");

    // Assert
    expect(result).toBe("testing");
  });

  it("classifyTaskType_architecture_分類", () => {
    // Arrange & Act
    const result = classifyTaskType("Design the architecture", "");

    // Assert
    expect(result).toBe("architecture");
  });

  it("classifyTaskType_optimization_分類", () => {
    // Arrange & Act
    const result = classifyTaskType("Optimize performance", "");

    // Assert
    expect(result).toBe("optimization");
  });

  it("classifyTaskType_security_分類", () => {
    // Arrange & Act
    const result = classifyTaskType("Fix security vulnerability", "");

    // Assert
    expect(result).toBe("security");
  });

  it("classifyTaskType_configuration_分類", () => {
    // Arrange & Act
    const result = classifyTaskType("Configure the environment", "");

    // Assert
    expect(result).toBe("configuration");
  });

  it("classifyTaskType_該当なし_unknown", () => {
    // Arrange & Act
    const result = classifyTaskType("Do something random", "");

    // Assert
    expect(result).toBe("unknown");
  });

  it("classifyTaskType_日本語_分類", () => {
    // Arrange & Act
    const result = classifyTaskType("バグを修正する", "");

    // Assert
    expect(result).toBe("bug-fix");
  });
});

// ============================================================================
// extractFiles テスト
// ============================================================================

describe("extractFiles", () => {
  it("extractFiles_パス抽出_成功", () => {
    // Arrange
    const text = "Modified src/utils.ts and lib/helper.js";

    // Act
    const result = extractFiles(text);

    // Assert
    expect(result).toContain("src/utils.ts");
    expect(result).toContain("lib/helper.js");
  });

  it("extractFiles_引用符付きパス_抽出", () => {
    // Arrange
    const text = 'Open "config.json" and `settings.yml`';

    // Act
    const result = extractFiles(text);

    // Assert
    expect(result).toContain("config.json");
    expect(result).toContain("settings.yml");
  });

  it("extractFiles_URL除外", () => {
    // Arrange
    const text = "Visit https://example.com and edit file.txt";

    // Act
    const result = extractFiles(text);

    // Assert
    expect(result).not.toContain("https://example.com");
    expect(result).toContain("file.txt");
  });

  it("extractFiles_拡張子なし_除外", () => {
    // Arrange
    const text = "Edit README and CHANGELOG";

    // Act
    const result = extractFiles(text);

    // Assert
    expect(result).toHaveLength(0);
  });

  it("extractFiles_空文字_空配列", () => {
    // Arrange & Act
    const result = extractFiles("");

    // Assert
    expect(result).toEqual([]);
  });

  it("extractFiles_重複_一意化", () => {
    // Arrange
    const text = "Edit file.ts and file.ts again";

    // Act
    const result = extractFiles(text);

    // Assert
    const fileTsCount = result.filter(f => f === "file.ts").length;
    expect(fileTsCount).toBe(1);
  });
});

// ============================================================================
// indexSubagentRun テスト
// ============================================================================

describe("indexSubagentRun", () => {
  it("indexSubagentRun_基本_インデックス化", () => {
    // Arrange
    const run = {
      runId: "run-123",
      agentId: "agent-456",
      task: "Fix bug in auth",
      summary: "Fixed authentication bug",
      status: "completed" as const,
      startedAt: "2024-01-01T00:00:00Z",
      finishedAt: "2024-01-01T00:10:00Z",
    };

    // Act
    const result = indexSubagentRun(run);

    // Assert
    expect(result.runId).toBe("run-123");
    expect(result.source).toBe("subagent");
    expect(result.agentId).toBe("agent-456");
    expect(result.task).toBe("Fix bug in auth");
    expect(result.status).toBe("completed");
    expect(result.taskType).toBe("bug-fix");
    expect(result.keywords.length).toBeGreaterThan(0);
  });

  it("indexSubagentRun_キーワード抽出_正常", () => {
    // Arrange
    const run = {
      runId: "run-123",
      agentId: "agent-456",
      task: "Implement new feature",
      summary: "Added user authentication",
      status: "completed" as const,
      startedAt: "2024-01-01T00:00:00Z",
      finishedAt: "2024-01-01T00:10:00Z",
    };

    // Act
    const result = indexSubagentRun(run);

    // Assert
    expect(result.keywords).toContain("implement");
    expect(result.keywords).toContain("feature");
    expect(result.keywords).toContain("user");
    expect(result.keywords).toContain("authentication");
  });

  it("indexSubagentRun_failed_status", () => {
    // Arrange
    const run = {
      runId: "run-123",
      agentId: "agent-456",
      task: "Fix bug",
      summary: "Failed to fix",
      status: "failed" as const,
      startedAt: "2024-01-01T00:00:00Z",
      finishedAt: "2024-01-01T00:10:00Z",
    };

    // Act
    const result = indexSubagentRun(run);

    // Assert
    expect(result.status).toBe("failed");
  });
});

// ============================================================================
// indexTeamRun テスト
// ============================================================================

describe("indexTeamRun", () => {
  it("indexTeamRun_基本_インデックス化", () => {
    // Arrange
    const run = {
      runId: "run-123",
      teamId: "team-456",
      task: "Review code changes",
      summary: "Reviewed all changes",
      status: "completed" as const,
      startedAt: "2024-01-01T00:00:00Z",
      finishedAt: "2024-01-01T00:10:00Z",
    };

    // Act
    const result = indexTeamRun(run);

    // Assert
    expect(result.runId).toBe("run-123");
    expect(result.source).toBe("agent-team");
    expect(result.teamId).toBe("team-456");
    expect(result.task).toBe("Review code changes");
    expect(result.status).toBe("completed");
    expect(result.taskType).toBe("code-review");
  });

  it("indexTeamRun_ファイル抽出_正常", () => {
    // Arrange
    const run = {
      runId: "run-123",
      teamId: "team-456",
      task: "Fix bug in src/auth.ts",
      summary: "Modified src/auth.ts and tests/auth.test.ts",
      status: "completed" as const,
      startedAt: "2024-01-01T00:00:00Z",
      finishedAt: "2024-01-01T00:10:00Z",
    };

    // Act
    const result = indexTeamRun(run);

    // Assert
    expect(result.files).toContain("src/auth.ts");
    expect(result.files).toContain("tests/auth.test.ts");
  });
});

// ============================================================================
// RUN_INDEX_VERSION テスト
// ============================================================================

describe("RUN_INDEX_VERSION", () => {
  it("RUN_INDEX_VERSION_正の整数", () => {
    // Arrange & Act & Assert
    expect(RUN_INDEX_VERSION).toBeGreaterThan(0);
    expect(Number.isInteger(RUN_INDEX_VERSION)).toBe(true);
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  it("extractKeywords_任意の文字列_配列返却", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 10000 }), (text) => {
        const result = extractKeywords(text);
        return Array.isArray(result);
      })
    );
  });

  it("extractKeywords_任意の文字列_小文字のみ", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 1000 }), (text) => {
        const result = extractKeywords(text);
        return result.every(k => k === k.toLowerCase());
      })
    );
  });

  it("classifyTaskType_任意の文字列_有効なタスクタイプ", () => {
    const validTypes: TaskType[] = [
      "code-review", "bug-fix", "feature-implementation", "refactoring",
      "research", "documentation", "testing", "architecture", "analysis",
      "optimization", "security", "configuration", "unknown"
    ];

    fc.assert(
      fc.property(fc.string({ maxLength: 500 }), fc.string({ maxLength: 500 }), (task, summary) => {
        const result = classifyTaskType(task, summary);
        return validTypes.includes(result);
      })
    );
  });

  it("extractFiles_任意の文字列_配列返却", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 5000 }), (text) => {
        const result = extractFiles(text);
        return Array.isArray(result);
      })
    );
  });
});

// ============================================================================
// 境界値テスト
// ============================================================================

describe("境界値テスト", () => {
  it("extractKeywords_非常に長いテキスト_処理可能", () => {
    // Arrange
    const text = "keyword ".repeat(10000);

    // Act & Assert
    expect(() => extractKeywords(text)).not.toThrow();
  });

  it("classifyTaskType_空文字_unknown", () => {
    // Arrange & Act
    const result = classifyTaskType("", "");

    // Assert
    expect(result).toBe("unknown");
  });

  it("extractFiles_特殊文字含むパス_抽出", () => {
    // Arrange
    const text = "Edit my-file_v2.test.ts and another.file.json";

    // Act
    const result = extractFiles(text);

    // Assert
    expect(result.length).toBeGreaterThan(0);
  });
});
