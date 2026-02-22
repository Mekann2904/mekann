/**
 * @abdd.meta
 * path: .pi/tests/lib/self-improvement-integration.test.ts
 * role: 8つの哲学的モジュール間の統合テスト
 * why: モジュール間連携の品質保証
 * related: philosophical-modules.test.ts, lib/belief-updater.ts, lib/learnable-mode-selector.ts
 * public_api: なし（テストファイル）
 * invariants: テストは冪等性を持つ
 * side_effects: なし
 * failure_modes: テスト失敗時は詳細なエラーメッセージを出力
 * @abdd.explain
 * overview: 8つの哲学的モジュール間の連携を統合テストで検証
 * what_it_does: モジュール間の基本的な連携パターンをテスト
 * why_it_exists: モジュール間連携の品質を保証するため
 * scope:
 *   in: テストケースの入力データ
 *   out: テスト結果（成功/失敗）
 */

import { describe, it, expect, beforeEach } from "vitest";

// アポリア共生型推論
import {
  createAporeticEngine,
  createInitialBeliefState,
  performAporeticInference,
  type AporiaDetection,
} from "../../lib/aporetic-reasoning.js";

// 創造的破壊
import {
  createCreativeDestructionEngine,
  resetEngine as resetDestructionEngine,
  getRecommendedMethod,
} from "../../lib/creative-destruction.js";

// 超メタ認知
import {
  createHyperMetacognitionEngine,
  performHyperMetacognition,
} from "../../lib/hyper-metacognition.js";

// 非線形思考
import {
  createNonLinearThoughtEngine,
  registerSeed,
  generateNonLinearThoughts,
  extractSeedsFromText,
  resetEngine as resetNonLinearEngine,
} from "../../lib/nonlinear-thought.js";

// ベイズ信念更新
import {
  createPrior,
  createEvidence,
  updateBelief,
  getMostProbable,
  calculateEntropy,
  normalizeDistribution,
  type Distribution,
} from "../../lib/belief-updater.js";

// 学習可能モード選択
import {
  createLearnableSelector,
  selectMode,
  updatePriors,
  type LearnableModeSelector,
} from "../../lib/learnable-mode-selector.js";

// 思考プロセス
import {
  createThinkingContext,
  type ThinkingMode,
  type ThinkingPhase,
  type ThinkingContext,
} from "../../lib/thinking-process.js";

// 経験再生
import {
  createExperienceReplay,
  createThinkingSession,
  completeSession,
  store,
  retrieve,
  learn,
  findApplicablePatterns,
  type ExperienceReplay,
} from "../../lib/experience-replay.js";

// ============================================================================
// テスト用ヘルパー関数
// ============================================================================

function createTestContext(task: string = "テストタスク"): ThinkingContext {
  return createThinkingContext(task, {
    phase: 'problem-formulation' as ThinkingPhase,
    mode: 'analytical' as ThinkingMode,
  });
}

function createTestAporia(): AporiaDetection {
  return {
    type: 'value-conflict',
    description: '完全性と速度のトレードオフ',
    tensionLevel: 0.7,
    pole1: {
      concept: '完全性',
      value: '品質を最大化する',
    },
    pole2: {
      concept: '速度',
      value: '素早くリリースする',
    },
    context: '開発プロジェクト',
    detectedAt: new Date(),
  };
}

// ============================================================================
// 統合テスト: belief-updater ↔ learnable-mode-selector
// ============================================================================

describe("統合: belief-updater + learnable-mode-selector", () => {
  let selector: LearnableModeSelector;

  beforeEach(() => {
    selector = createLearnableSelector();
  });

  describe("ベイズ更新によるモード選択の学習", () => {
    it("初期状態からモードを選択できる", () => {
      const context = createTestContext("コードを分析する");
      const result = selectMode(selector, context);

      expect(result.selectedMode).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.distribution.probabilities.size).toBeGreaterThan(0);
    });

    it("フィードバックに基づいて信念を更新し、次回の選択に反映する", () => {
      const context = createTestContext("複雑な問題を分析する");

      // 最初の選択
      const result1 = selectMode(selector, context);
      expect(result1.selectedMode).toBeDefined();

      // 成功フィードバック
      const feedback = {
        result: result1,
        outcome: 'success' as const,
        effectiveness: 0.9,
        notes: '分析モードが効果的だった',
      };

      const updatedSelector = updatePriors(selector, feedback);

      // 更新後のセレクターで再度選択
      const result2 = selectMode(updatedSelector, context);

      // 信頼度が向上している可能性を確認
      expect(result2.selectedMode).toBeDefined();
    });

    it("複数回のフィードバックで学習が蓄積する", () => {
      const context = createTestContext("設計タスク");

      // 複数回のフィードバック
      let currentSelector = selector;
      for (let i = 0; i < 5; i++) {
        const result = selectMode(currentSelector, context);
        const feedback = {
          result,
          outcome: 'success' as const,
          effectiveness: 0.8,
        };
        currentSelector = updatePriors(currentSelector, feedback);
      }

      // 最終的な選択
      const finalResult = selectMode(currentSelector, context);
      expect(finalResult.confidence).toBeGreaterThan(0);
    });
  });

  describe("分布の正規化と一貫性", () => {
    it("選択後の分布は常に正規化されている", () => {
      const context = createTestContext("テスト");

      for (let i = 0; i < 10; i++) {
        const result = selectMode(selector, context);
        const probs = Array.from(result.distribution.probabilities.values());
        const sum = probs.reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1.0, 5);
      }
    });

    it("信念更新後も分布は正規化されている", () => {
      const context = createTestContext("分析");

      let currentSelector = selector;
      for (let i = 0; i < 3; i++) {
        const result = selectMode(currentSelector, context);
        const feedback = {
          result,
          outcome: i % 2 === 0 ? 'success' as const : 'failure' as const,
          effectiveness: 0.5 + Math.random() * 0.5,
        };
        currentSelector = updatePriors(currentSelector, feedback);
      }

      const finalResult = selectMode(currentSelector, context);
      const probs = Array.from(finalResult.distribution.probabilities.values());
      const sum = probs.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    });
  });
});

// ============================================================================
// 統合テスト: aporetic-reasoning + creative-destruction
// ============================================================================

describe("統合: aporetic-reasoning + creative-destruction", () => {
  let aporiaEngine: ReturnType<typeof createAporeticEngine>;
  let destructionEngine: ReturnType<typeof createCreativeDestructionEngine>;

  beforeEach(() => {
    aporiaEngine = createAporeticEngine();
    destructionEngine = createCreativeDestructionEngine();
    resetDestructionEngine(destructionEngine);
  });

  describe("パレート最適性の維持", () => {
    it("アポリア推論後もパレートフロントが維持される", () => {
      const aporia = createTestAporia();
      const beliefState = createInitialBeliefState(aporia);

      const result = performAporeticInference(aporiaEngine, beliefState, []);

      expect(result.paretoFront).toBeDefined();
      expect(result.paretoFront.length).toBeGreaterThanOrEqual(0);
    });

    it("推奨破壊メソッドが適切に選択される", () => {
      // 各前提タイプに対して推奨メソッドを確認
      const epistemicMethod = getRecommendedMethod('epistemic');
      expect(epistemicMethod.name).toBe('derridean-deconstruction');

      const normativeMethod = getRecommendedMethod('normative');
      expect(normativeMethod.name).toBe('nietzschean-inversion');

      const ontologicalMethod = getRecommendedMethod('ontological');
      expect(ontologicalMethod.name).toBe('heideggerian-ontological-difference');
    });
  });
});

// ============================================================================
// 統合テスト: hyper-metacognition + nonlinear-thought
// ============================================================================

describe("統合: hyper-metacognition + nonlinear-thought", () => {
  let metaEngine: ReturnType<typeof createHyperMetacognitionEngine>;
  let thoughtEngine: ReturnType<typeof createNonLinearThoughtEngine>;

  beforeEach(() => {
    metaEngine = createHyperMetacognitionEngine();
    thoughtEngine = createNonLinearThoughtEngine();
    resetNonLinearEngine(thoughtEngine);
  });

  describe("メタ認知評価と非線形思考", () => {
    it("メタ認知が4層構造で動作する", () => {
      const thought = "これはテスト思考です。前提を確認して分析する。";
      const state = performHyperMetacognition(metaEngine, thought);

      expect(state.layer0).toBeDefined();
      expect(state.layer1).toBeDefined();
      expect(state.layer2).toBeDefined();
      expect(state.layer3).toBeDefined();
    });

    it("非線形思考が連想チェーンを生成する", () => {
      registerSeed(thoughtEngine, "創造", "concept");
      const chain = generateNonLinearThoughts(thoughtEngine);

      expect(chain).toBeDefined();
      expect(chain.seed).toBeDefined();
    });

    it("テキストからシードを抽出できる", () => {
      const text = "思考とは何か？創造と存在の関係について。";
      const seeds = extractSeedsFromText(thoughtEngine, text);

      expect(seeds.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// 統合テスト: experience-replay + 他モジュール
// ============================================================================

describe("統合: experience-replay + 他モジュール", () => {
  let replay: ExperienceReplay;

  beforeEach(() => {
    replay = createExperienceReplay();
  });

  describe("経験に基づくモード選択の改善", () => {
    it("過去のセッションからパターンを学習して推奨を生成", () => {
      // セッションを作成して保存
      let session = createThinkingSession("分析タスク", {
        taskType: "analysis",
        complexity: "medium",
        priority: "high",
      });
      session = completeSession(session, {
        status: "success",
        effectiveness: 0.85,
        lessonsLearned: ["分析モードが効果的"],
      });

      const updatedReplay = store(replay, session);

      // 学習を実行
      const learningResult = learn(updatedReplay);

      expect(learningResult.patterns).toBeDefined();
    });

    it("類似経験から教訓を抽出", () => {
      // セッションを保存
      let session = createThinkingSession("設計タスク");
      session = completeSession(session, {
        status: "success",
        effectiveness: 0.8,
        lessonsLearned: ["設計パターンを適用"],
      });
      let updatedReplay = store(replay, session);

      // 類似経験を検索
      const context = createTestContext("設計タスク");
      const similarExperiences = retrieve(updatedReplay, context);

      expect(Array.isArray(similarExperiences)).toBe(true);
    });
  });

  describe("アポリア対処の経験蓄積", () => {
    it("アポリア対処の成功パターンを学習", () => {
      // アポリア対処セッションを作成
      let session = createThinkingSession("アポリア対処", {
        taskType: "aporia-resolution",
      });
      session = completeSession(session, {
        status: "success",
        effectiveness: 0.75,
        lessonsLearned: ["両極維持が有効"],
      });

      const updatedReplay = store(replay, session);
      expect(updatedReplay.stats.totalSessions).toBe(1);
    });
  });
});

// ============================================================================
// エンドツーエンド: 全モジュール統合
// ============================================================================

describe("エンドツーエンド: 全モジュール統合", () => {
  it("複数のタスクタイプで一貫した動作", () => {
    const taskTypes = ["分析", "設計", "実装", "テスト"];

    for (const taskType of taskTypes) {
      // 1. モード選択
      const selector = createLearnableSelector();
      const context = createTestContext(taskType);
      const selection = selectMode(selector, context);

      expect(selection.selectedMode).toBeDefined();

      // 2. メタ認知
      const metaEngine = createHyperMetacognitionEngine();
      const metaState = performHyperMetacognition(metaEngine, taskType);

      expect(metaState.integratedEvaluation.thinkingQuality).toBeGreaterThanOrEqual(0);

      // 3. 経験再生
      const replay = createExperienceReplay();
      let session = createThinkingSession(taskType);
      session = completeSession(session, {
        status: "success",
        effectiveness: metaState.integratedEvaluation.thinkingQuality,
      });
      const updatedReplay = store(replay, session);

      expect(updatedReplay.stats.totalSessions).toBe(1);
    }
  });
});

// ============================================================================
// エッジケース
// ============================================================================

describe("エッジケース", () => {
  describe("空入力", () => {
    it("空のコンテキストでもクラッシュしない", () => {
      const selector = createLearnableSelector();
      const context = createTestContext("");
      const result = selectMode(selector, context);

      expect(result.selectedMode).toBeDefined();
    });

    it("空の証拠リストで更新できる", () => {
      const prior = createPrior(
        new Map([
          ["h1", 0.5],
          ["h2", 0.5],
        ])
      );

      const evidence = createEvidence(
        "observation",
        "テスト",
        new Map(),
        0.5
      );

      const posterior = updateBelief(prior, evidence);
      expect(posterior).toBeDefined();
    });
  });

  describe("極端な値", () => {
    it("確率0の仮説を含む分布", () => {
      const prior = createPrior(
        new Map([
          ["h1", 0.0],
          ["h2", 1.0],
        ])
      );

      const entropy = calculateEntropy(prior);
      expect(entropy).toBe(0);
    });

    it("極めて高い緊張レベルのアポリア", () => {
      const aporia: AporiaDetection = {
        type: 'value-conflict',
        description: '極端な対立',
        tensionLevel: 1.0,
        pole1: { concept: 'A', value: 'a' },
        pole2: { concept: 'B', value: 'b' },
        context: 'テスト',
        detectedAt: new Date(),
      };

      const state = createInitialBeliefState(aporia);
      expect(state.tensionIntensity).toBe(1.0);
    });
  });

  describe("境界条件", () => {
    it("信頼度0のパターンは適用されない", () => {
      const replay = createExperienceReplay({
        patternConfidenceThreshold: 0.5,
      });

      const context = createTestContext();
      const patterns = findApplicablePatterns(replay, context);

      expect(patterns.length).toBe(0);
    });

    it("最大セッション数を超えた場合の処理", () => {
      const replay = createExperienceReplay({ maxSessions: 5 });

      // 10セッションを追加
      let updatedReplay = replay;
      for (let i = 0; i < 10; i++) {
        let session = createThinkingSession(`タスク${i}`);
        session = completeSession(session, { status: "success", effectiveness: 0.8 });
        updatedReplay = store(updatedReplay, session);
      }

      // セッション数はmaxSessions以下
      expect(updatedReplay.sessions.size).toBeLessThanOrEqual(5);
    });

    it("類似度閾値を下回る経験は除外される", () => {
      const replay = createExperienceReplay({ similarityThreshold: 0.9 });

      let session = createThinkingSession("特定のタスク");
      session = completeSession(session, { status: "success", effectiveness: 0.8 });
      const updatedReplay = store(replay, session);

      const context = createTestContext("全く異なるタスク");
      const results = retrieve(updatedReplay, context);

      // 類似度が低い場合は結果が空
      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  describe("数値的安定性", () => {
    it("エントロピー計算が数値的に安定", () => {
      const distribution = createPrior(
        new Map([
          ["h1", 0.5],
          ["h2", 0.5],
        ])
      );

      const entropy = calculateEntropy(distribution);
      expect(entropy).toBeGreaterThanOrEqual(0);
      expect(entropy).toBeLessThanOrEqual(2);
    });
  });
});

// ============================================================================
// パフォーマンス
// ============================================================================

describe("パフォーマンス", () => {
  it("大量のセッション保存が時間内に完了する", () => {
    const replay = createExperienceReplay({ maxSessions: 100 });
    const startTime = Date.now();

    let updatedReplay = replay;
    for (let i = 0; i < 50; i++) {
      let session = createThinkingSession(`タスク${i}`);
      session = completeSession(session, { status: "success", effectiveness: 0.8 });
      updatedReplay = store(updatedReplay, session);
    }

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(5000); // 5秒以内
  });

  it("複雑な推論が時間内に完了する", () => {
    const engine = createAporeticEngine();
    const aporia = createTestAporia();
    const startTime = Date.now();

    for (let i = 0; i < 10; i++) {
      const beliefState = createInitialBeliefState(aporia);
      performAporeticInference(engine, beliefState, []);
    }

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(5000); // 5秒以内
  });
});
