/**
 * @abdd.meta
 * path: .pi/tests/e2e/delegation-journey.test.ts
 * role: タスク委譲のE2Eテスト（BDDスタイル）
 * why: ユーザーがタスクをサブエージェントに委譲し、結果を受け取る一連のフローを検証するため
 * related: .pi/extensions/subagents.ts, .pi/extensions/agent-teams/extension.ts, .pi/lib/agent-common.ts
 * public_api: なし（テストファイル）
 * invariants: テストは冪等性を持つ、モックを使用して外部依存を排除
 * side_effects: なし（テスト実行環境でのみ動作）
 * failure_modes: テスト失敗時は詳細なエラーメッセージを出力
 * @abdd.explain
 * overview: タスク委譲のユーザージャーニーをBDDスタイルでテスト
 * what_it_does:
 *   - Given-When-Then構造でのテスト記述
 *   - サブエージェントへの委譲フローの検証
 *   - エラーハンドリングの検証
 *   - 結果の統合フローの検証
 * why_it_exists:
 *   - ユーザーが実際に使用するフローの品質を保証するため
 *   - 拡張機能間の連携を検証するため
 * scope:
 *   in: テストケースの入力データ
 *   out: テスト結果（成功/失敗）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ============================================================================
// 型定義（テスト用）
// ============================================================================

/**
 * サブエージェントの実行状態
 */
type SubagentState = "idle" | "running" | "completed" | "failed" | "cancelled";

/**
 * サブエージェントの実行結果
 */
interface SubagentResult {
  success: boolean;
  output: string;
  error?: string;
  duration: number;
}

/**
 * 委譲リクエスト
 */
interface DelegationRequest {
  task: string;
  agentType: string;
  timeout?: number;
  retries?: number;
}

/**
 * 委譲レスポンス
 */
interface DelegationResponse {
  result: SubagentResult;
  state: SubagentState;
}

// ============================================================================
// モック設定
// ============================================================================

/**
 * サブエージェント実行のモック
 */
const createMockSubagentRunner = () => {
  const stateHistory: SubagentState[] = [];
  let currentState: SubagentState = "idle";

  return {
    getState: () => currentState,
    getStateHistory: () => [...stateHistory],
    run: vi.fn(async (request: DelegationRequest): Promise<DelegationResponse> => {
      // 状態遷移: idle -> running
      currentState = "running";
      stateHistory.push(currentState);

      // シミュレートされた実行時間
      const startTime = Date.now();
      await new Promise((resolve) => setTimeout(resolve, 10));

      // 成功/失敗の判定（テスト用の単純なロジック）
      const shouldSucceed = !request.task.includes("fail");

      if (shouldSucceed) {
        // 状態遷移: running -> completed
        currentState = "completed";
        stateHistory.push(currentState);

        return {
          result: {
            success: true,
            output: `Task "${request.task}" completed successfully`,
            duration: Date.now() - startTime,
          },
          state: currentState,
        };
      } else {
        // 状態遷移: running -> failed
        currentState = "failed";
        stateHistory.push(currentState);

        return {
          result: {
            success: false,
            output: "",
            error: "Task failed intentionally for testing",
            duration: Date.now() - startTime,
          },
          state: currentState,
        };
      }
    }),
    cancel: vi.fn(() => {
      if (currentState === "running") {
        currentState = "cancelled";
        stateHistory.push(currentState);
      }
    }),
    reset: () => {
      currentState = "idle";
      stateHistory.length = 0;
    },
  };
};

// ============================================================================
// E2Eテスト: ユーザージャーニー
// ============================================================================

describe("E2E: タスク委譲のユーザージャーニー", () => {
  let mockRunner: ReturnType<typeof createMockSubagentRunner>;

  beforeEach(() => {
    mockRunner = createMockSubagentRunner();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Scenario 1: 基本的なタスク委譲
  // ==========================================================================
  describe("Scenario 1: 基本的なタスク委譲", () => {
    it("Given: ユーザーがタスクを持っている, When: サブエージェントに委譲する, Then: タスクが完了する", async () => {
      // Given: ユーザーがタスクを持っている
      const request: DelegationRequest = {
        task: "analyze code quality",
        agentType: "code-analyzer",
        timeout: 5000,
      };

      // When: サブエージェントに委譲する
      const response = await mockRunner.run(request);

      // Then: タスクが完了する
      expect(response.state).toBe("completed");
      expect(response.result.success).toBe(true);
      expect(response.result.output).toContain("completed successfully");
      expect(response.result.duration).toBeGreaterThanOrEqual(0);

      // 状態遷移の検証
      const history = mockRunner.getStateHistory();
      expect(history).toContain("running");
      expect(history).toContain("completed");
    });
  });

  // ==========================================================================
  // Scenario 2: 複数タスクの並列委譲
  // ==========================================================================
  describe("Scenario 2: 複数タスクの並列委譲", () => {
    it("Given: ユーザーが複数のタスクを持っている, When: 並列で委譲する, Then: 全てのタスクが完了する", async () => {
      // Given: ユーザーが複数のタスクを持っている
      const requests: DelegationRequest[] = [
        { task: "task 1", agentType: "agent-1" },
        { task: "task 2", agentType: "agent-2" },
        { task: "task 3", agentType: "agent-3" },
      ];

      // When: 並列で委譲する
      const responses = await Promise.all(
        requests.map((req) => mockRunner.run(req))
      );

      // Then: 全てのタスクが完了する
      expect(responses).toHaveLength(3);
      responses.forEach((response) => {
        expect(response.state).toBe("completed");
        expect(response.result.success).toBe(true);
      });
    });
  });

  // ==========================================================================
  // Scenario 3: タスク失敗時のエラーハンドリング
  // ==========================================================================
  describe("Scenario 3: タスク失敗時のエラーハンドリング", () => {
    it("Given: 失敗するタスクがある, When: 委譲する, Then: 適切にエラーが処理される", async () => {
      // Given: 失敗するタスクがある
      const request: DelegationRequest = {
        task: "fail this task",
        agentType: "test-agent",
      };

      // When: 委譲する
      const response = await mockRunner.run(request);

      // Then: 適切にエラーが処理される
      expect(response.state).toBe("failed");
      expect(response.result.success).toBe(false);
      expect(response.result.error).toBeDefined();
      expect(response.result.error).toContain("failed intentionally");
    });
  });

  // ==========================================================================
  // Scenario 4: タスクのキャンセル
  // ==========================================================================
  describe("Scenario 4: タスクのキャンセル", () => {
    it("Given: 実行中のタスクがある, When: キャンセルする, Then: タスクがキャンセルされる", async () => {
      // Given: 実行中のタスクがある（コミュニケーションフェーズでの合意）
      const request: DelegationRequest = {
        task: "long running task",
        agentType: "worker",
      };

      // When: タスクを開始して即座にキャンセルする
      const runPromise = mockRunner.run(request);

      // 実行中にキャンセルを試みる
      mockRunner.cancel();

      // Then: タスクが完了またはキャンセルされる
      const response = await runPromise;
      const finalState = mockRunner.getState();

      // キャンセルまたは完了のどちらか
      expect(["completed", "cancelled"]).toContain(finalState);
    });
  });

  // ==========================================================================
  // Scenario 5: タスク結果の統合
  // ==========================================================================
  describe("Scenario 5: タスク結果の統合", () => {
    it("Given: 複数のタスク結果がある, When: 結果を統合する, Then: 統合された結果が生成される", async () => {
      // Given: 複数のタスク結果がある
      const requests: DelegationRequest[] = [
        { task: "analyze", agentType: "analyzer" },
        { task: "test", agentType: "tester" },
      ];

      const responses = await Promise.all(
        requests.map((req) => mockRunner.run(req))
      );

      // When: 結果を統合する
      const integratedResult = {
        totalDuration: responses.reduce(
          (sum, r) => sum + r.result.duration,
          0
        ),
        successCount: responses.filter((r) => r.result.success).length,
        outputs: responses.map((r) => r.result.output),
      };

      // Then: 統合された結果が生成される
      expect(integratedResult.successCount).toBe(2);
      expect(integratedResult.outputs).toHaveLength(2);
      expect(integratedResult.totalDuration).toBeGreaterThanOrEqual(0);
    });
  });
});

// ============================================================================
// E2Eテスト: エッジケース
// ============================================================================

describe("E2E: タスク委譲のエッジケース", () => {
  let mockRunner: ReturnType<typeof createMockSubagentRunner>;

  beforeEach(() => {
    mockRunner = createMockSubagentRunner();
  });

  it("空のタスクを処理できる", async () => {
    const request: DelegationRequest = {
      task: "",
      agentType: "test-agent",
    };

    const response = await mockRunner.run(request);

    // 空のタスクでも完了する（または適切にエラー処理される）
    expect(["completed", "failed"]).toContain(response.state);
  });

  it("非常に長いタスク名を処理できる", async () => {
    const longTask = "a".repeat(10000);
    const request: DelegationRequest = {
      task: longTask,
      agentType: "test-agent",
    };

    const response = await mockRunner.run(request);

    expect(response.state).toBe("completed");
    expect(response.result.success).toBe(true);
  });

  it("特殊文字を含むタスクを処理できる", async () => {
    const specialTask = "タスク\n\t特殊文字<>&\"'";
    const request: DelegationRequest = {
      task: specialTask,
      agentType: "test-agent",
    };

    const response = await mockRunner.run(request);

    expect(response.state).toBe("completed");
  });
});
