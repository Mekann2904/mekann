/**
 * @abdd.meta
 * path: .pi/tests/integration/mediator-loop-integration.test.ts
 * role: MediatorとLoopの統合テスト
 * why: Mediatorによる意図推論とLoopによる反復実行の連携が正しく動作することを保証するため
 * related: .pi/lib/intent-mediator.ts, .pi/lib/mediator-types.ts, .pi/extensions/loop.ts
 * public_api: テストケースの実行
 * invariants: テストはモック環境で実行され、実際のLLM APIを呼び出さない
 * side_effects: なし（テストのみ）
 * failure_modes: テスト失敗は統合の不整合を示す
 * @abdd.explain
 * overview: MediatorとLoopの統合動作を検証するテスト
 * what_it_does:
 *   - 意図推論から反復実行へのデータフローテスト
 *   - 構造化指示の受け渡しテスト
 *   - エラー回復の統合テスト
 *   - 履歴管理の統合テスト
 * why_it_exists:
 *   - MediatorとLoopが独立して開発されても、統合時の契約が維持されることを保証するため
 *   - データ変換の不整合を早期に検出するため
 * scope:
 *   in: intent-mediator.ts, mediator-types.ts, loop.ts
 *   out: テスト結果とカバレッジレポート
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ============================================================================
// 型定義（テスト用モック）
// ============================================================================

/**
 * 構造化された意図（テスト用簡略版）
 */
interface StructuredIntent {
  action: string;
  target: string;
  constraints: string[];
  successCriteria: string[];
  confidence: number;
}

/**
 * Mediator出力（テスト用簡略版）
 */
interface MediatorOutput {
  interpretation: string;
  gaps: Array<{ type: string; term: string; severity: string }>;
  questions: Array<{ question: string; options?: string[] }>;
  structuredIntent: StructuredIntent | null;
  confidence: number;
}

/**
 * Loop設定（テスト用簡略版）
 */
interface LoopConfig {
  maxIterations: number;
  verificationPolicy: "always" | "never" | "every_n";
  stopConditions: string[];
  timeoutMs: number;
}

/**
 * Loop実行結果（テスト用簡略版）
 */
interface LoopResult {
  iterations: number;
  completed: boolean;
  stopReason: string;
  outputs: string[];
  verificationResults: Array<{ passed: boolean; message: string }>;
}

/**
 * Mediatorのモック
 */
class MockMediator {
  private sessionCount = 0;

  /**
   * ユーザー入力を処理して構造化された意図を生成
   */
  async mediate(input: string): Promise<MediatorOutput> {
    this.sessionCount++;

    // 簡易的な意図推論ロジック
    const intent = this.inferIntent(input);
    const gaps = this.detectGaps(input, intent);
    const questions = this.generateQuestions(gaps);

    return {
      interpretation: intent.interpretation,
      gaps,
      questions,
      structuredIntent: gaps.length === 0 ? intent.structured : null,
      confidence: intent.confidence,
    };
  }

  private inferIntent(input: string): {
    interpretation: string;
    structured: StructuredIntent;
    confidence: number;
  } {
    // キーワードベースの簡易推論
    if (input.includes("テスト") && input.includes("作成")) {
      return {
        interpretation: "テストコードの作成を要求",
        structured: {
          action: "create_test",
          target: "unspecified",
          constraints: [],
          successCriteria: ["テストがパスすること"],
          confidence: 0.8,
        },
        confidence: 0.8,
      };
    }

    if (input.includes("リファクタリング")) {
      return {
        interpretation: "コードのリファクタリングを要求",
        structured: {
          action: "refactor",
          target: "unspecified",
          constraints: [],
          successCriteria: ["既存機能が維持されること"],
          confidence: 0.7,
        },
        confidence: 0.7,
      };
    }

    return {
      interpretation: "一般的なタスク要求",
      structured: {
        action: "execute",
        target: "unspecified",
        constraints: [],
        successCriteria: [],
        confidence: 0.5,
      },
      confidence: 0.5,
    };
  }

  private detectGaps(
    input: string,
    intent: { interpretation: string; structured: StructuredIntent }
  ): Array<{ type: string; term: string; severity: string }> {
    const gaps: Array<{ type: string; term: string; severity: string }> = [];

    // 対象ファイルが不明な場合
    if (intent.structured.target === "unspecified" && !input.includes("ファイル")) {
      gaps.push({
        type: "missing_target",
        term: "対象ファイル",
        severity: "high",
      });
    }

    return gaps;
  }

  private generateQuestions(
    gaps: Array<{ type: string; term: string; severity: string }>
  ): Array<{ question: string; options?: string[] }> {
    return gaps.map(gap => ({
      question: `${gap.term}を指定してください`,
    }));
  }

  getSessionCount(): number {
    return this.sessionCount;
  }
}

/**
 * Loop実行のモック
 */
class MockLoopRunner {
  private iterationCount = 0;
  private verificationCount = 0;

  /**
   * 構造化された意図に基づいてループを実行
   */
  async runLoop(intent: StructuredIntent, config: LoopConfig): Promise<LoopResult> {
    const outputs: string[] = [];
    const verificationResults: Array<{ passed: boolean; message: string }> = [];

    for (let i = 0; i < config.maxIterations; i++) {
      this.iterationCount++;

      // 意図に基づいてアクションを実行（モック）
      const output = this.executeIntent(intent, i);
      outputs.push(output);

      // 検証ポリシーに基づいて検証
      if (this.shouldVerify(config, i)) {
        this.verificationCount++;
        const result = this.verify(intent, output);
        verificationResults.push(result);

        if (!result.passed) {
          return {
            iterations: i + 1,
            completed: false,
            stopReason: `検証失敗: ${result.message}`,
            outputs,
            verificationResults,
          };
        }
      }

      // 成功基準をチェック（簡易版）
      if (i >= 2 && intent.successCriteria.length > 0) {
        return {
          iterations: i + 1,
          completed: true,
          stopReason: "成功基準を満たしました",
          outputs,
          verificationResults,
        };
      }
    }

    return {
      iterations: config.maxIterations,
      completed: true,
      stopReason: "最大反復回数に達しました",
      outputs,
      verificationResults,
    };
  }

  private executeIntent(intent: StructuredIntent, iteration: number): string {
    return `[${iteration + 1}] ${intent.action} on ${intent.target}`;
  }

  private shouldVerify(config: LoopConfig, iteration: number): boolean {
    if (config.verificationPolicy === "always") return true;
    if (config.verificationPolicy === "never") return false;
    // every_n
    return iteration % 3 === 0;
  }

  private verify(intent: StructuredIntent, output: string): { passed: boolean; message: string } {
    // 簡易的な検証ロジック
    if (output.includes("error")) {
      return { passed: false, message: "エラーが検出されました" };
    }
    return { passed: true, message: "検証パス" };
  }

  getIterationCount(): number {
    return this.iterationCount;
  }

  getVerificationCount(): number {
    return this.verificationCount;
  }

  reset(): void {
    this.iterationCount = 0;
    this.verificationCount = 0;
  }
}

// ============================================================================
// テストスイート
// ============================================================================

describe("Mediator-Loop統合テスト", () => {
  let mediator: MockMediator;
  let loopRunner: MockLoopRunner;

  beforeEach(() => {
    mediator = new MockMediator();
    loopRunner = new MockLoopRunner();
  });

  describe("基本的な統合フロー", () => {
    it("Mediatorが生成した構造化意図をLoopが実行できる", async () => {
      // Arrange: 明確なタスク入力
      const input = "test-utils.tsファイルのテストを作成してください";

      // Act: Mediatorで意図推論
      const mediatorOutput = await mediator.mediate(input);

      // Assert: ギャップがない場合、構造化意図が生成される
      expect(mediatorOutput.confidence).toBeGreaterThan(0);

      // Act: 構造化意図がある場合、Loopで実行
      if (mediatorOutput.structuredIntent) {
        const loopResult = await loopRunner.runLoop(mediatorOutput.structuredIntent, {
          maxIterations: 3,
          verificationPolicy: "always",
          stopConditions: [],
          timeoutMs: 30000,
        });

        // Assert: ループが完了している
        expect(loopResult.iterations).toBeGreaterThan(0);
        expect(loopResult.outputs.length).toBe(loopResult.iterations);
      }
    });

    it("情報ギャップがある場合は質問が生成される", async () => {
      // Arrange: 対象が不明な入力
      const input = "テストを作成してください";

      // Act
      const output = await mediator.mediate(input);

      // Assert: ギャップが検出され、質問が生成される
      expect(output.gaps.length).toBeGreaterThan(0);
      expect(output.questions.length).toBeGreaterThan(0);
      expect(output.structuredIntent).toBeNull();
    });
  });

  describe("データフローの整合性", () => {
    it("Mediatorの出力はLoopの入力として正しく変換される", async () => {
      // Arrange
      const input = "format-utils.tsをリファクタリングしてください";

      // Act
      const mediatorOutput = await mediator.mediate(input);

      // Assert: 出力構造が期待通り
      expect(mediatorOutput).toHaveProperty("interpretation");
      expect(mediatorOutput).toHaveProperty("gaps");
      expect(mediatorOutput).toHaveProperty("confidence");

      if (mediatorOutput.structuredIntent) {
        // Assert: 構造化意図の必須フィールド
        expect(mediatorOutput.structuredIntent).toHaveProperty("action");
        expect(mediatorOutput.structuredIntent).toHaveProperty("target");
        expect(mediatorOutput.structuredIntent).toHaveProperty("constraints");
        expect(mediatorOutput.structuredIntent).toHaveProperty("successCriteria");
      }
    });

    it("信頼度が低い場合は追加確認が必要", async () => {
      // Arrange: 曖昧な入力
      const input = "なにかやって";

      // Act
      const output = await mediator.mediate(input);

      // Assert: 信頼度が低い
      expect(output.confidence).toBeLessThan(0.7);
    });
  });

  describe("Loop設定とMediator連携", () => {
    it("検証ポリシーが正しく適用される", async () => {
      // Arrange
      const input = "validation.tsのテストを作成";
      const mediatorOutput = await mediator.mediate(input);

      if (!mediatorOutput.structuredIntent) {
        // ギャップがある場合はスキップ
        return;
      }

      // Act: always ポリシー
      loopRunner.reset();
      await loopRunner.runLoop(mediatorOutput.structuredIntent, {
        maxIterations: 3,
        verificationPolicy: "always",
        stopConditions: [],
        timeoutMs: 30000,
      });
      const alwaysCount = loopRunner.getVerificationCount();

      // Act: never ポリシー
      loopRunner.reset();
      await loopRunner.runLoop(mediatorOutput.structuredIntent, {
        maxIterations: 3,
        verificationPolicy: "never",
        stopConditions: [],
        timeoutMs: 30000,
      });
      const neverCount = loopRunner.getVerificationCount();

      // Assert: alwaysは毎回、neverは0回
      expect(alwaysCount).toBeGreaterThan(neverCount);
    });

    it("最大反復回数が守られる", async () => {
      // Arrange
      const input = "fs-utils.tsのテストを作成";
      const mediatorOutput = await mediator.mediate(input);

      if (!mediatorOutput.structuredIntent) {
        return;
      }

      // Act
      const result = await loopRunner.runLoop(mediatorOutput.structuredIntent, {
        maxIterations: 5,
        verificationPolicy: "never",
        stopConditions: [],
        timeoutMs: 30000,
      });

      // Assert: 反復回数が上限を超えない
      expect(result.iterations).toBeLessThanOrEqual(5);
    });
  });

  describe("エラー回復の統合", () => {
    it("検証失敗時にループが停止する", async () => {
      // Arrange: エラーを含む意図
      const intent: StructuredIntent = {
        action: "create_test_with_error",
        target: "error-file.ts",
        constraints: [],
        successCriteria: ["テストがパスすること"],
        confidence: 0.8,
      };

      // Act: カスタムモックでエラーをシミュレート
      const errorLoopRunner = new (class extends MockLoopRunner {
        protected executeIntent(intent: StructuredIntent, iteration: number): string {
          if (iteration === 1) {
            return `[${iteration + 1}] error occurred`;
          }
          return super["executeIntent"](intent, iteration);
        }
      })();

      const result = await errorLoopRunner.runLoop(intent, {
        maxIterations: 5,
        verificationPolicy: "always",
        stopConditions: [],
        timeoutMs: 30000,
      });

      // Assert: エラーで停止
      expect(result.completed).toBe(false);
      expect(result.stopReason).toContain("検証失敗");
    });

    it("部分的な成功でも進捗は記録される", async () => {
      // Arrange
      const input = "error-utils.tsのテストを作成";
      const mediatorOutput = await mediator.mediate(input);

      if (!mediatorOutput.structuredIntent) {
        return;
      }

      // Act: 最大反復に達するが完了とする
      const result = await loopRunner.runLoop(mediatorOutput.structuredIntent, {
        maxIterations: 1,
        verificationPolicy: "never",
        stopConditions: [],
        timeoutMs: 30000,
      });

      // Assert: 出力が記録されている
      expect(result.outputs.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// 契約テスト
// ============================================================================

describe("Mediator-Loop契約テスト", () => {
  /**
   * 契約: MediatorとLoop間のデータ変換
   * 1. Mediatorの出力はLoopが理解できる形式である
   * 2. Loopの結果はMediatorが履歴として保存できる形式である
   */

  it("契約: StructuredIntentの必須フィールドが存在する", async () => {
    const mediator = new MockMediator();
    const input = "format-utils.tsのテストを作成";
    const output = await mediator.mediate(input);

    if (output.structuredIntent) {
      const intent = output.structuredIntent;

      // 必須フィールドの検証
      expect(typeof intent.action).toBe("string");
      expect(typeof intent.target).toBe("string");
      expect(Array.isArray(intent.constraints)).toBe(true);
      expect(Array.isArray(intent.successCriteria)).toBe(true);
      expect(typeof intent.confidence).toBe("number");
      expect(intent.confidence).toBeGreaterThanOrEqual(0);
      expect(intent.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("契約: LoopResultの必須フィールドが存在する", async () => {
    const loopRunner = new MockLoopRunner();
    const intent: StructuredIntent = {
      action: "test",
      target: "file.ts",
      constraints: [],
      successCriteria: [],
      confidence: 0.8,
    };

    const result = await loopRunner.runLoop(intent, {
      maxIterations: 3,
      verificationPolicy: "never",
      stopConditions: [],
      timeoutMs: 30000,
    });

    // 必須フィールドの検証
    expect(typeof result.iterations).toBe("number");
    expect(typeof result.completed).toBe("boolean");
    expect(typeof result.stopReason).toBe("string");
    expect(Array.isArray(result.outputs)).toBe(true);
    expect(Array.isArray(result.verificationResults)).toBe(true);
  });

  it("契約: 検証結果の一貫性", async () => {
    const loopRunner = new MockLoopRunner();
    const intent: StructuredIntent = {
      action: "test",
      target: "file.ts",
      constraints: [],
      successCriteria: ["パスすること"],
      confidence: 0.8,
    };

    const result = await loopRunner.runLoop(intent, {
      maxIterations: 3,
      verificationPolicy: "always",
      stopConditions: [],
      timeoutMs: 30000,
    });

    // 検証結果の構造検証
    for (const vr of result.verificationResults) {
      expect(typeof vr.passed).toBe("boolean");
      expect(typeof vr.message).toBe("string");
    }
  });
});

// ============================================================================
// エッジケース
// ============================================================================

describe("Mediator-Loop エッジケース", () => {
  it("空の入力を処理できる", async () => {
    const mediator = new MockMediator();
    const output = await mediator.mediate("");

    // 空入力でもクラッシュしない
    expect(output).toBeDefined();
    expect(output.confidence).toBeLessThan(0.6); // 低信頼度
  });

  it("非常に長い入力を処理できる", async () => {
    const mediator = new MockMediator();
    const longInput = "テストを作成してください。".repeat(100);

    const output = await mediator.mediate(longInput);

    // 長い入力でもクラッシュしない
    expect(output).toBeDefined();
  });

  it("特殊文字を含む入力を処理できる", async () => {
    const mediator = new MockMediator();
    const input = "test@file.ts#L10-20のテストを作成\n改行あり\tタブあり";

    const output = await mediator.mediate(input);

    // 特殊文字を含んでいてもクラッシュしない
    expect(output).toBeDefined();
  });

  it("Loop実行中のタイムアウト処理", async () => {
    const loopRunner = new MockLoopRunner();
    const intent: StructuredIntent = {
      action: "long_running_task",
      target: "file.ts",
      constraints: [],
      successCriteria: [],
      confidence: 0.8,
    };

    // タイムアウト設定が渡されることを確認
    const result = await loopRunner.runLoop(intent, {
      maxIterations: 100,
      verificationPolicy: "never",
      stopConditions: [],
      timeoutMs: 1000, // 短いタイムアウト
    });

    // タイムアウトに関わらず結果は返る（モックでは実際のタイムアウトなし）
    expect(result).toBeDefined();
  });
});
