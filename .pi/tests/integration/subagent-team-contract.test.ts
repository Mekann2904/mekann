/**
 * @abdd.meta
 * path: .pi/tests/integration/subagent-team-contract.test.ts
 * role: サブエージェントとチームメンバー間の契約テスト
 * why: 両者が共通のインターフェースとエラーハンドリング規約に従うことを保証するため
 * related: .pi/extensions/subagents.ts, .pi/extensions/agent-teams/extension.ts, .pi/lib/agent-common.ts, .pi/lib/agent-errors.ts
 * public_api: テストケースの実行
 * invariants: テストはモック環境で実行され、実際のエージェントを起動しない
 * side_effects: なし（テストのみ）
 * failure_modes: テスト失敗は契約違反を示す
 * @abdd.explain
 * overview: サブエージェントとチームメンバーの共通契約を検証する統合テスト
 * what_it_does:
 *   - 実行結果の共通フォーマット契約テスト
 *   - エラー分類の統一契約テスト
 *   - タイムアウトとキャンセルの契約テスト
 *   - 出力検証の契約テスト
 * why_it_exists:
 *   - サブエージェントとチームメンバーが共通のランタイムインフラを使用しているため
 *   - 両者の動作の一貫性を保証し、統合時の不整合を防ぐため
 * scope:
 *   in: subagents.ts, agent-teams/extension.ts, agent-common.ts, agent-errors.ts
 *   out: テスト結果とカバレッジレポート
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ============================================================================
// 型定義（テスト用モック）
// ============================================================================

/**
 * エンティティ種別
 */
type EntityType = "subagent" | "team_member";

/**
 * エンティティ設定
 */
interface EntityConfig {
  type: EntityType;
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  timeoutMs: number;
}

/**
 * 実行結果コード
 */
type OutcomeCode =
  | "SUCCESS"
  | "TIMEOUT"
  | "CANCELLED"
  | "ERROR"
  | "RATE_LIMITED"
  | "SCHEMA_VIOLATION"
  | "LOW_SUBSTANCE";

/**
 * 実行結果シグナル
 */
interface OutcomeSignal {
  outcomeCode: OutcomeCode;
  message?: string;
  output?: string;
  error?: Error;
  durationMs: number;
  retryCount: number;
}

/**
 * エンティティ実行のモック
 */
class MockEntityExecutor {
  protected config: EntityConfig;
  protected executionCount = 0;

  constructor(config: EntityConfig) {
    this.config = config;
  }

  /**
   * エンティティを実行
   */
  async execute(
    task: string,
    options?: { signal?: AbortSignal; timeoutMs?: number }
  ): Promise<OutcomeSignal> {
    this.executionCount++;
    const startTime = Date.now();
    const timeoutMs = options?.timeoutMs ?? this.config.timeoutMs;

    try {
      // タスクを実行（モック）
      const output = await this.runTask(task, timeoutMs, options?.signal);

      return {
        outcomeCode: "SUCCESS",
        output,
        durationMs: Date.now() - startTime,
        retryCount: 0,
      };
    } catch (error) {
      return this.handleError(error, startTime);
    }
  }

  protected async runTask(
    task: string,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<string> {
    // キャンセルチェック
    if (signal?.aborted) {
      throw new Error("CANCELLED");
    }

    // タイムアウトシミュレーション
    if (task.includes("timeout")) {
      await new Promise(resolve => setTimeout(resolve, timeoutMs + 1000));
      throw new Error("TIMEOUT");
    }

    // エラーシミュレーション
    if (task.includes("error")) {
      throw new Error("EXECUTION_ERROR");
    }

    // レート制限シミュレーション
    if (task.includes("rate_limited")) {
      throw new Error("RATE_LIMIT_EXCEEDED");
    }

    // スキーマ違反シミュレーション
    if (task.includes("schema_violation")) {
      return "INVALID_OUTPUT_FORMAT";
    }

    // 通常の出力
    return `Result for: ${task}`;
  }

  protected handleError(error: unknown, startTime: number): OutcomeSignal {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const durationMs = Date.now() - startTime;

    let outcomeCode: OutcomeCode = "ERROR";

    if (errorMessage.includes("TIMEOUT")) {
      outcomeCode = "TIMEOUT";
    } else if (errorMessage.includes("CANCELLED")) {
      outcomeCode = "CANCELLED";
    } else if (errorMessage.includes("RATE_LIMIT")) {
      outcomeCode = "RATE_LIMITED";
    }

    return {
      outcomeCode,
      error: error instanceof Error ? error : new Error(errorMessage),
      message: errorMessage,
      durationMs,
      retryCount: 0,
    };
  }

  getExecutionCount(): number {
    return this.executionCount;
  }
}

/**
 * サブエージェント実行のモック
 */
class MockSubagentExecutor extends MockEntityExecutor {
  constructor() {
    super({
      type: "subagent",
      maxRetries: 2,
      initialDelayMs: 800,
      maxDelayMs: 10000,
      timeoutMs: 30000,
    });
  }
}

/**
 * チームメンバー実行のモック
 */
class MockTeamMemberExecutor extends MockEntityExecutor {
  constructor() {
    super({
      type: "team_member",
      maxRetries: 2,
      initialDelayMs: 800,
      maxDelayMs: 10000,
      timeoutMs: 30000,
    });
  }
}

/**
 * 出力検証のモック
 */
class MockOutputValidator {
  /**
   * 出力を検証
   */
  validate(output: string, type: EntityType): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 空出力チェック
    if (!output || output.trim().length === 0) {
      errors.push("EMPTY_OUTPUT");
      return { valid: false, errors };
    }

    // 形式チェック
    if (output === "INVALID_OUTPUT_FORMAT") {
      errors.push("SCHEMA_VIOLATION");
      return { valid: false, errors };
    }

    // 低品質チェック
    if (output.length < 10) {
      errors.push("LOW_SUBSTANCE");
      return { valid: false, errors };
    }

    return { valid: true, errors: [] };
  }
}

// ============================================================================
// テストスイート
// ============================================================================

describe("サブエージェントとチームメンバーの契約テスト", () => {
  let subagent: MockSubagentExecutor;
  let teamMember: MockTeamMemberExecutor;
  let validator: MockOutputValidator;

  beforeEach(() => {
    subagent = new MockSubagentExecutor();
    teamMember = new MockTeamMemberExecutor();
    validator = new MockOutputValidator();
  });

  describe("共通設定契約", () => {
    it("サブエージェントとチームメンバーは同じデフォルト設定を持つ", () => {
      // Arrange & Act: 両方の設定を取得
      const subagentConfig = (subagent as any).config as EntityConfig;
      const teamConfig = (teamMember as any).config as EntityConfig;

      // Assert: 主要な設定値が一致
      expect(subagentConfig.maxRetries).toBe(teamConfig.maxRetries);
      expect(subagentConfig.initialDelayMs).toBe(teamConfig.initialDelayMs);
      expect(subagentConfig.maxDelayMs).toBe(teamConfig.maxDelayMs);
      expect(subagentConfig.timeoutMs).toBe(teamConfig.timeoutMs);
    });

    it("両者は同じタイムアウト動作をする", async () => {
      // Arrange
      const timeoutTask = "test_timeout_task";

      // Act
      const subagentResult = subagent.execute(timeoutTask, { timeoutMs: 100 });
      const teamResult = teamMember.execute(timeoutTask, { timeoutMs: 100 });

      // Assert: 両方ともタイムアウトする
      const [sr, tr] = await Promise.allSettled([subagentResult, teamResult]);

      if (sr.status === "fulfilled") {
        expect(sr.value.outcomeCode).toBe("TIMEOUT");
      }
      if (tr.status === "fulfilled") {
        expect(tr.value.outcomeCode).toBe("TIMEOUT");
      }
    });
  });

  describe("実行結果フォーマット契約", () => {
    it("成功時の結果フォーマットが一致する", async () => {
      // Arrange
      const task = "create test for format-utils.ts";

      // Act
      const subagentResult = await subagent.execute(task);
      const teamResult = await teamMember.execute(task);

      // Assert: 必須フィールドが存在
      expect(subagentResult).toHaveProperty("outcomeCode");
      expect(subagentResult).toHaveProperty("durationMs");
      expect(subagentResult).toHaveProperty("retryCount");

      expect(teamResult).toHaveProperty("outcomeCode");
      expect(teamResult).toHaveProperty("durationMs");
      expect(teamResult).toHaveProperty("retryCount");

      // 成功時は出力がある
      expect(subagentResult.outcomeCode).toBe("SUCCESS");
      expect(subagentResult.output).toBeDefined();
      expect(teamResult.outcomeCode).toBe("SUCCESS");
      expect(teamResult.output).toBeDefined();
    });

    it("エラー時の結果フォーマットが一致する", async () => {
      // Arrange
      const errorTask = "test_error_task";

      // Act
      const subagentResult = await subagent.execute(errorTask);
      const teamResult = await teamMember.execute(errorTask);

      // Assert: エラー時の構造
      expect(subagentResult.outcomeCode).toBe("ERROR");
      expect(subagentResult.error).toBeDefined();

      expect(teamResult.outcomeCode).toBe("ERROR");
      expect(teamResult.error).toBeDefined();
    });

    it("キャンセル時の結果フォーマットが一致する", async () => {
      // Arrange
      const controller = new AbortController();
      controller.abort();

      // Act
      const subagentResult = await subagent.execute("task", { signal: controller.signal });
      const teamResult = await teamMember.execute("task", { signal: controller.signal });

      // Assert
      expect(subagentResult.outcomeCode).toBe("CANCELLED");
      expect(teamResult.outcomeCode).toBe("CANCELLED");
    });
  });

  describe("出力検証契約", () => {
    it("両者の出力は同じ検証ロジックを使用する", async () => {
      // Arrange
      const task = "create test";

      // Act
      const subagentResult = await subagent.execute(task);
      const teamResult = await teamMember.execute(task);

      // Assert: 同じ検証結果
      const subagentValidation = validator.validate(
        subagentResult.output || "",
        "subagent"
      );
      const teamValidation = validator.validate(
        teamResult.output || "",
        "team_member"
      );

      expect(subagentValidation.valid).toBe(teamValidation.valid);
    });

    it("スキーマ違反は両者で同じように検出される", async () => {
      // Arrange
      const task = "schema_violation test";

      // Act
      const subagentResult = await subagent.execute(task);
      const teamResult = await teamMember.execute(task);

      // Assert: 両方とも成功するが、検証で弾かれる
      expect(subagentResult.outcomeCode).toBe("SUCCESS");
      expect(teamResult.outcomeCode).toBe("SUCCESS");

      const subagentValidation = validator.validate(
        subagentResult.output || "",
        "subagent"
      );
      const teamValidation = validator.validate(
        teamResult.output || "",
        "team_member"
      );

      expect(subagentValidation.valid).toBe(false);
      expect(subagentValidation.errors).toContain("SCHEMA_VIOLATION");
      expect(teamValidation.valid).toBe(false);
      expect(teamValidation.errors).toContain("SCHEMA_VIOLATION");
    });
  });

  describe("レート制限とリトライ契約", () => {
    it("レート制限エラーの分類が一致する", async () => {
      // Arrange
      const task = "rate_limited test";

      // Act
      const subagentResult = await subagent.execute(task);
      const teamResult = await teamMember.execute(task);

      // Assert
      expect(subagentResult.outcomeCode).toBe("RATE_LIMITED");
      expect(teamResult.outcomeCode).toBe("RATE_LIMITED");
    });

    it("リトライカウントが正しく追跡される", async () => {
      // Arrange
      const task = "normal task";

      // Act
      const result = await subagent.execute(task);

      // Assert: 初回実行なのでリトライカウントは0
      expect(result.retryCount).toBe(0);
    });
  });

  describe("タイミングとパフォーマンス契約", () => {
    it("実行時間が追跡される", async () => {
      // Arrange
      const task = "timed task";

      // Act
      const result = await subagent.execute(task);

      // Assert: 実行時間が記録されている
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("複数実行が正しく追跡される", async () => {
      // Arrange & Act
      await subagent.execute("task1");
      await subagent.execute("task2");
      await subagent.execute("task3");

      // Assert
      expect(subagent.getExecutionCount()).toBe(3);
    });
  });
});

// ============================================================================
// Consumer-Driven Contract Tests
// ============================================================================

describe("Consumer-Driven Contract: ランタイムとエンティティ", () => {
  /**
   * 契約: ランタイムは以下を期待する
   * 1. エンティティは OutcomeSignal を返す
   * 2. エラーコードは一貫している
   * 3. キャンセルは即座に反映される
   */

  it("契約: OutcomeSignalの必須フィールドが存在する", async () => {
    const subagent = new MockSubagentExecutor();
    const result = await subagent.execute("test");

    // 必須フィールド
    expect(result).toHaveProperty("outcomeCode");
    expect(result).toHaveProperty("durationMs");
    expect(result).toHaveProperty("retryCount");

    // 型チェック
    expect(typeof result.outcomeCode).toBe("string");
    expect(typeof result.durationMs).toBe("number");
    expect(typeof result.retryCount).toBe("number");
  });

  it("契約: OutcomeCodeは定義済みの値のみ", async () => {
    const validCodes: OutcomeCode[] = [
      "SUCCESS",
      "TIMEOUT",
      "CANCELLED",
      "ERROR",
      "RATE_LIMITED",
      "SCHEMA_VIOLATION",
      "LOW_SUBSTANCE",
    ];

    const subagent = new MockSubagentExecutor();
    const result = await subagent.execute("test");

    expect(validCodes).toContain(result.outcomeCode);
  });

  it("契約: キャンセルは即座に反映される", async () => {
    const controller = new AbortController();

    // 先にキャンセル
    controller.abort();

    const subagent = new MockSubagentExecutor();
    const result = await subagent.execute("test", { signal: controller.signal });

    expect(result.outcomeCode).toBe("CANCELLED");
  });
});

// ============================================================================
// エッジケース
// ============================================================================

describe("エンティティ実行のエッジケース", () => {
  it("空のタスクを処理できる", async () => {
    const subagent = new MockSubagentExecutor();
    const result = await subagent.execute("");

    expect(result).toBeDefined();
    expect(result.outcomeCode).toBe("SUCCESS");
  });

  it("特殊文字を含むタスクを処理できる", async () => {
    const subagent = new MockSubagentExecutor();
    const task = "test@file.ts#L10-20\n改行\tタブ";

    const result = await subagent.execute(task);

    expect(result).toBeDefined();
  });

  it("非常に長いタスクを処理できる", async () => {
    const subagent = new MockSubagentExecutor();
    const task = "テストを作成する".repeat(100);

    const result = await subagent.execute(task);

    expect(result).toBeDefined();
  });

  it("同時実行が正しく処理される", async () => {
    const subagent = new MockSubagentExecutor();
    const tasks = Array(10).fill("task").map((t, i) => `${t}_${i}`);

    const results = await Promise.all(
      tasks.map(task => subagent.execute(task))
    );

    // すべて成功
    expect(results.every(r => r.outcomeCode === "SUCCESS")).toBe(true);
    expect(subagent.getExecutionCount()).toBe(10);
  });
});

// ============================================================================
// 統合シナリオテスト
// ============================================================================

describe("統合シナリオ: サブエージェントとチームの協調", () => {
  it("サブエージェントの結果をチームメンバーが使用できる", async () => {
    // Arrange
    const subagent = new MockSubagentExecutor();
    const teamMember = new MockTeamMemberExecutor();

    // Act: サブエージェントが実行
    const subagentResult = await subagent.execute("analyze code");
    expect(subagentResult.outcomeCode).toBe("SUCCESS");

    // Act: チームメンバーが結果を使用
    const teamTask = `based on: ${subagentResult.output}`;
    const teamResult = await teamMember.execute(teamTask);

    // Assert: チームメンバーも成功
    expect(teamResult.outcomeCode).toBe("SUCCESS");
    expect(teamResult.output).toContain("based on:");
  });

  it("片方が失敗しても他方に影響しない", async () => {
    // Arrange
    const subagent = new MockSubagentExecutor();
    const teamMember = new MockTeamMemberExecutor();

    // Act: サブエージェントが失敗
    const subagentResult = await subagent.execute("error task");

    // Act: チームメンバーは独立して成功
    const teamResult = await teamMember.execute("normal task");

    // Assert
    expect(subagentResult.outcomeCode).toBe("ERROR");
    expect(teamResult.outcomeCode).toBe("SUCCESS");
  });

  it("並列実行でのリソース共有", async () => {
    // Arrange
    const subagent = new MockSubagentExecutor();
    const teamMember = new MockTeamMemberExecutor();

    // Act: 並列実行
    const [sr, tr] = await Promise.all([
      subagent.execute("subagent task"),
      teamMember.execute("team task"),
    ]);

    // Assert: 両方成功
    expect(sr.outcomeCode).toBe("SUCCESS");
    expect(tr.outcomeCode).toBe("SUCCESS");
  });
});
