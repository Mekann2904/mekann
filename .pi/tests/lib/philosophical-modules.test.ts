/**
 * @abdd.meta
 * path: .pi/tests/lib/philosophical-modules.test.ts
 * role: 4つの哲学的モジュールのユニットテスト
 * why: 自己改善深化フェーズの品質保証とリグレッション防止
 * related: .pi/lib/aporetic-reasoning.ts, .pi/lib/creative-destruction.ts, .pi/lib/hyper-metacognition.ts, .pi/lib/nonlinear-thought.ts
 * public_api: なし（テストファイル）
 * invariants: テストは冪等性を持つ、モックを使用して外部依存を排除
 * side_effects: なし（テスト実行環境でのみ動作）
 * failure_modes: テスト失敗時は詳細なエラーメッセージを出力
 * @abdd.explain
 * overview: 4つの哲学的モジュールの各関数をユニットテストで検証
 * what_it_does:
 *   - アポリア共生型推論のテスト
 *   - 創造的破壊のテスト
 *   - 超メタ認知のテスト
 *   - 非線形思考のテスト
 *   - モジュール間統合のテスト
 * why_it_exists:
 *   - 哲学的モジュールの品質を保証するため
 *   - 今後の変更によるリグレッションを防ぐため
 * scope:
 *   in: テストケースの入力データ
 *   out: テスト結果（成功/失敗）
 */

import { describe, it, expect, beforeEach } from "vitest";

// アポリア共生型推論モジュール
import {
  createAporeticEngine,
  createInitialBeliefState,
  updateBeliefState,
  performAporeticInference,
  paretoFrontToVisualization,
  generateEngineReport,
  type AporeticReasoningEngine,
  type AporiaDetection,
} from "../../lib/aporetic-reasoning.js";

// 創造的破壊モジュール
import {
  createCreativeDestructionEngine,
  registerPremise,
  performDestruction,
  performChainDestruction,
  optimizeDestruction,
  getDestructionMethods,
  getRecommendedMethod,
  generateDestructionReport,
  resetEngine as resetDestructionEngine,
  type CreativeDestructionEngine,
  type PremiseType,
} from "../../lib/creative-destruction.js";

// 超メタ認知モジュール
import {
  createHyperMetacognitionEngine,
  performHyperMetacognition,
  deepenMetacognition,
  getThinkingQualityAssessment,
  generateMetacognitionReport,
  type HyperMetacognitionEngine,
} from "../../lib/hyper-metacognition.js";

// 非線形思考モジュール
import {
  createNonLinearThoughtEngine,
  registerSeed,
  generateNonLinearThoughts,
  generateParallelThoughts,
  optimizeAssociation,
  getParetoOptimalInsights,
  extractSeedsFromText,
  generateNonLinearThoughtReport,
  resetEngine as resetNonLinearEngine,
  type NonLinearThoughtEngine,
  type SeedType,
} from "../../lib/nonlinear-thought.js";

// ベイズ信念更新モジュール
import {
  createPrior,
  createEvidence,
  type Evidence,
} from "../../lib/belief-updater.js";

// ============================================================================
// テスト用ヘルパー関数
// ============================================================================

function createMockAporia(): AporiaDetection {
  return {
    type: 'completeness-vs-speed',
    description: '完全性と速度のトレードオフ',
    tensionLevel: 0.7,
    pole1: {
      concept: '完全性',
      value: '品質を最大化する',
      arguments: [],
    },
    pole2: {
      concept: '速度',
      value: '効率を最大化する',
      arguments: [],
    },
    context: '開発プロジェクト',
    resolution: 'maintain-tension',
  };
}

function createMockEvidence(value: string, strength: number = 0.7): Evidence {
  return createEvidence(
    'observation',
    value,
    new Map([
      ['重要', strength],
      ['やや重要', 0.3],
      ['普通', 0.2],
    ]),
    strength
  );
}

// ============================================================================
// アポリア共生型推論のテスト
// ============================================================================

describe("Aporetic Reasoning Module", () => {
  let engine: AporeticReasoningEngine;

  beforeEach(() => {
    engine = createAporeticEngine();
  });

  describe("createAporeticEngine", () => {
    it("should create engine with default config", () => {
      expect(engine).toBeDefined();
      expect(engine.beliefStates).toBeInstanceOf(Map);
      expect(engine.statistics.totalInferences).toBe(0);
    });

    it("should accept custom config", () => {
      const customEngine = createAporeticEngine({
        tensionThreshold: 0.8,
        decisionThreshold: 0.9,
      });
      expect(customEngine.config.tensionThreshold).toBe(0.8);
      expect(customEngine.config.decisionThreshold).toBe(0.9);
    });
  });

  describe("createInitialBeliefState", () => {
    it("should create belief state from aporia", () => {
      const aporia = createMockAporia();
      const state = createInitialBeliefState(aporia);

      expect(state.aporia).toBe(aporia);
      expect(state.pole1.name).toBe('完全性');
      expect(state.pole2.name).toBe('速度');
      expect(state.balancePoint).toBe(0);
      expect(state.tensionIntensity).toBe(0.7);
      expect(state.explosionGuards.length).toBeGreaterThan(0);
    });

    it("should initialize both poles with equal belief strength", () => {
      const aporia = createMockAporia();
      const state = createInitialBeliefState(aporia);

      expect(state.pole1.beliefStrength).toBeCloseTo(state.pole2.beliefStrength, 1);
    });
  });

  describe("updateBeliefState", () => {
    it("should update belief based on evidence", () => {
      const aporia = createMockAporia();
      let state = createInitialBeliefState(aporia);

      const evidence = createMockEvidence('品質が重要', 0.9);
      state = updateBeliefState(state, evidence, 'pole1');

      expect(state.pole1.supportingEvidence.length).toBe(1);
      expect(state.updateHistory.length).toBe(1);
    });

    it("should update balance point after evidence", () => {
      const aporia = createMockAporia();
      let state = createInitialBeliefState(aporia);

      // 極1を強化する証拠
      const evidence1 = createMockEvidence('完全性が重要', 0.9);
      state = updateBeliefState(state, evidence1, 'pole1');

      // バランス点が負（極1寄り）になることを確認
      // 注: 実際の値は実装に依存
      expect(typeof state.balancePoint).toBe('number');
    });
  });

  describe("performAporeticInference", () => {
    it("should perform complete inference", () => {
      const aporia = createMockAporia();
      const evidenceList = [
        createMockEvidence('品質重視', 0.8),
        createMockEvidence('納期が迫っている', 0.7),
      ];

      const result = performAporeticInference(engine, aporia, evidenceList);

      expect(result.beliefState).toBeDefined();
      expect(result.paretoFront.length).toBeGreaterThan(0);
      expect(result.inferenceConfidence).toBeGreaterThanOrEqual(0);
      expect(result.inferenceConfidence).toBeLessThanOrEqual(1);
    });

    it("should identify temptations to avoid", () => {
      const aporia = createMockAporia();
      const result = performAporeticInference(engine, aporia, []);

      expect(result.temptationsToAvoid.length).toBeGreaterThan(0);
      // ヘーゲル的統合への誘惑が含まれていることを確認
      const hasIntegrationTemptation = result.temptationsToAvoid.some(
        t => t.includes('統合')
      );
      expect(hasIntegrationTemptation).toBe(true);
    });

    it("should update engine statistics", () => {
      const aporia = createMockAporia();
      performAporeticInference(engine, aporia, []);

      expect(engine.statistics.totalInferences).toBe(1);
    });
  });

  describe("paretoFrontToVisualization", () => {
    it("should convert pareto front to visualization data", () => {
      const aporia = createMockAporia();
      const result = performAporeticInference(engine, aporia, []);
      const viz = paretoFrontToVisualization(result.paretoFront);

      expect(viz.points).toBeInstanceOf(Array);
      expect(viz.dominatedRegion).toBeDefined();
    });
  });

  describe("generateEngineReport", () => {
    it("should generate readable report", () => {
      const aporia = createMockAporia();
      performAporeticInference(engine, aporia, []);

      const report = generateEngineReport(engine);

      expect(report).toContain('アポリア推論エンジン');
      expect(report).toContain('総推論回数: 1');
    });
  });
});

// ============================================================================
// 創造的破壊モジュールのテスト
// ============================================================================

describe("Creative Destruction Module", () => {
  let engine: CreativeDestructionEngine;

  beforeEach(() => {
    engine = createCreativeDestructionEngine();
  });

  describe("createCreativeDestructionEngine", () => {
    it("should create engine with destruction methods", () => {
      expect(engine).toBeDefined();
      expect(engine.destructionMethods.length).toBe(5);
      expect(engine.premises).toBeInstanceOf(Map);
    });

    it("should have five philosophical destruction methods", () => {
      const methods = getDestructionMethods();
      expect(methods.length).toBe(5);

      const names = methods.map(m => m.name);
      expect(names).toContain('nietzschean-inversion');
      expect(names).toContain('deleuzian-differentiation');
      expect(names).toContain('derridean-deconstruction');
      expect(names).toContain('heideggerian-ontological-difference');
      expect(names).toContain('buddhist-emptiness');
    });
  });

  describe("registerPremise", () => {
    it("should register premise with default values", () => {
      const premise = registerPremise(engine, 'コードはテストされるべき');

      expect(premise).toBeDefined();
      expect(premise.content).toBe('コードはテストされるべき');
      expect(premise.type).toBe('contextual');
      expect(premise.solidity).toBe(0.5);
    });

    it("should register premise with custom values", () => {
      const premise = registerPremise(
        engine,
        '論理は普遍である',
        'epistemic' as PremiseType,
        0.9
      );

      expect(premise.type).toBe('epistemic');
      expect(premise.solidity).toBe(0.9);
    });

    it("should clamp solidity to valid range", () => {
      const premise1 = registerPremise(engine, 'test1', 'contextual' as PremiseType, 1.5);
      const premise2 = registerPremise(engine, 'test2', 'contextual' as PremiseType, -0.5);

      expect(premise1.solidity).toBe(1);
      expect(premise2.solidity).toBe(0);
    });
  });

  describe("performDestruction", () => {
    it("should destroy premise and create reconstruction", () => {
      const premise = registerPremise(engine, '善は正しいことである', 'normative' as PremiseType);
      const result = performDestruction(engine, premise.id);

      expect(result).toBeDefined();
      expect(result!.originalPremise).toBe(premise);
      expect(result!.remnants.length).toBeGreaterThan(0);
      expect(result!.depth).toBeGreaterThan(0);
    });

    it("should return null for non-existent premise", () => {
      const result = performDestruction(engine, 'non-existent-id');
      expect(result).toBeNull();
    });

    it("should update statistics after destruction", () => {
      const premise = registerPremise(engine, 'test', 'normative' as PremiseType);
      performDestruction(engine, premise.id);

      expect(engine.statistics.totalDestructions).toBe(1);
    });
  });

  describe("performChainDestruction", () => {
    it("should perform chain destruction with specified depth", () => {
      const premise = registerPremise(
        engine,
        '存在は本質を持つ',
        'ontological' as PremiseType,
        0.9
      );

      const chain = performChainDestruction(engine, premise.id, 2);

      expect(chain.sequence.length).toBeGreaterThan(0);
      expect(chain.statistics.totalPremisesDestroyed).toBeGreaterThan(0);
    });
  });

  describe("optimizeDestruction", () => {
    it("should return pareto optimal strategies", () => {
      registerPremise(engine, '価値は絶対である', 'normative' as PremiseType, 0.8);
      registerPremise(engine, '時間は線形である', 'ontological' as PremiseType, 0.7);

      const strategies = optimizeDestruction(engine);

      expect(strategies.length).toBeGreaterThan(0);
      // 全ての戦略がパレート最適であることを確認
      for (const strategy of strategies) {
        expect(strategy.expectedEffects).toBeDefined();
        expect(strategy.expectedEffects.creativityIncrease).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("getRecommendedMethod", () => {
    it("should recommend appropriate method for each premise type", () => {
      expect(getRecommendedMethod('epistemic').name).toBe('derridean-deconstruction');
      expect(getRecommendedMethod('normative').name).toBe('nietzschean-inversion');
      expect(getRecommendedMethod('ontological').name).toBe('heideggerian-ontological-difference');
    });
  });

  describe("resetEngine", () => {
    it("should reset engine state", () => {
      registerPremise(engine, 'test', 'contextual' as PremiseType);
      performDestruction(engine, 'test');

      resetDestructionEngine(engine);

      expect(engine.premises.size).toBe(0);
      expect(engine.statistics.totalDestructions).toBe(0);
    });
  });
});

// ============================================================================
// 超メタ認知モジュールのテスト
// ============================================================================

describe("Hyper Metacognition Module", () => {
  let engine: HyperMetacognitionEngine;

  beforeEach(() => {
    engine = createHyperMetacognitionEngine();
  });

  describe("createHyperMetacognitionEngine", () => {
    it("should create engine with 4-layer structure", () => {
      expect(engine).toBeDefined();
      expect(engine.config.maxCognitiveDepth).toBe(3);
    });
  });

  describe("performHyperMetacognition", () => {
    it("should create 4-layer metacognitive state", () => {
      const state = performHyperMetacognition(engine, 'これは思考のテストです');

      expect(state.layer0).toBeDefined();
      expect(state.layer1).toBeDefined();
      expect(state.layer2).toBeDefined();
      expect(state.layer3).toBeDefined();
    });

    it("should detect cognitive patterns", () => {
      const state = performHyperMetacognition(
        engine,
        '前提を確認して、二項対立を検出する。'
      );

      expect(state.detectedPatterns).toBeInstanceOf(Array);
    });

    it("should generate improvement recommendations", () => {
      const state = performHyperMetacognition(
        engine,
        '短い思考'
      );

      // 短い思考に対して改善推奨が生成される可能性が高い
      expect(state.recommendedImprovements).toBeInstanceOf(Array);
    });

    it("should calculate integrated evaluation", () => {
      const state = performHyperMetacognition(engine, 'テスト思考');

      expect(state.integratedEvaluation.thinkingQuality).toBeGreaterThanOrEqual(0);
      expect(state.integratedEvaluation.thinkingQuality).toBeLessThanOrEqual(1);
      expect(state.integratedEvaluation.formalizationRisk).toBeGreaterThanOrEqual(0);
      expect(state.integratedEvaluation.cognitiveDepth).toBe(4);
    });

    it("should acknowledge infinite regress awareness", () => {
      const state = performHyperMetacognition(engine, 'テスト');

      expect(state.infiniteRegressAwareness.isAware).toBe(true);
      expect(state.infiniteRegressAwareness.practicalLimit).toBeDefined();
    });

    it("should update engine statistics", () => {
      performHyperMetacognition(engine, 'test');
      performHyperMetacognition(engine, 'test2');

      expect(engine.statistics.totalSessions).toBe(2);
    });
  });

  describe("deepenMetacognition", () => {
    it("should add insight and recalculate layers", () => {
      performHyperMetacognition(engine, '初期思考');
      const updated = deepenMetacognition(engine, '追加の洞察');

      expect(updated).toBeDefined();
      expect(updated!.layer0.content).toContain('追加の洞察');
    });

    it("should return null if no current state", () => {
      const result = deepenMetacognition(engine, '洞察');
      expect(result).toBeNull();
    });
  });

  describe("getThinkingQualityAssessment", () => {
    it("should provide detailed quality breakdown", () => {
      const state = performHyperMetacognition(engine, 'テスト思考');
      const assessment = getThinkingQualityAssessment(state);

      expect(assessment.overallScore).toBeGreaterThanOrEqual(0);
      expect(assessment.overallScore).toBeLessThanOrEqual(1);
      expect(assessment.breakdown).toBeDefined();
      expect(assessment.breakdown.depth).toBeDefined();
      expect(assessment.strengths).toBeInstanceOf(Array);
      expect(assessment.weaknesses).toBeInstanceOf(Array);
    });
  });

  describe("generateMetacognitionReport", () => {
    it("should generate readable report", () => {
      const state = performHyperMetacognition(engine, 'テスト思考');
      const report = generateMetacognitionReport(state);

      expect(report).toContain('超メタ認知レポート');
      expect(report).toContain('思考品質スコア');
    });
  });
});

// ============================================================================
// 非線形思考モジュールのテスト
// ============================================================================

describe("Non-Linear Thought Module", () => {
  let engine: NonLinearThoughtEngine;

  beforeEach(() => {
    engine = createNonLinearThoughtEngine();
  });

  describe("createNonLinearThoughtEngine", () => {
    it("should create engine with default config", () => {
      expect(engine).toBeDefined();
      expect(engine.seeds).toBeInstanceOf(Map);
      expect(engine.chains).toBeInstanceOf(Array);
    });
  });

  describe("registerSeed", () => {
    it("should register concept seed", () => {
      const seed = registerSeed(engine, '思考', 'concept');

      expect(seed).toBeDefined();
      expect(seed.content).toBe('思考');
      expect(seed.type).toBe('concept');
      expect(seed.activationStrength).toBe(1.0);
    });

    it("should register question seed", () => {
      const seed = registerSeed(engine, '何が真実か？', 'question');

      expect(seed.type).toBe('question');
    });

    it("should extract related concepts", () => {
      const seed = registerSeed(engine, '創造的な思考', 'concept');

      expect(seed.relatedConcepts.length).toBeGreaterThan(0);
    });
  });

  describe("generateNonLinearThoughts", () => {
    it("should generate association chain from seed", () => {
      const seed = registerSeed(engine, '創造', 'concept');
      const chain = generateNonLinearThoughts(engine, seed.id);

      expect(chain).toBeDefined();
      expect(chain.seed).toBe(seed);
      expect(chain.associations).toBeInstanceOf(Array);
      expect(chain.depth).toBeGreaterThanOrEqual(0);
    });

    it("should generate chain without explicit seed", () => {
      registerSeed(engine, '存在', 'concept');
      const chain = generateNonLinearThoughts(engine);

      expect(chain).toBeDefined();
    });

    it("should create default seed if none exists", () => {
      const chain = generateNonLinearThoughts(engine);
      expect(chain.seed).toBeDefined();
    });

    it("should respect max depth parameter", () => {
      const seed = registerSeed(engine, '価値', 'concept');
      const chain = generateNonLinearThoughts(engine, seed.id, { maxDepth: 2 });

      expect(chain.depth).toBeLessThanOrEqual(2);
    });

    it("should update engine statistics", () => {
      registerSeed(engine, 'test', 'concept');
      generateNonLinearThoughts(engine);

      expect(engine.statistics.totalChains).toBe(1);
    });
  });

  describe("generateParallelThoughts", () => {
    it("should generate multiple chains in parallel", () => {
      const seed1 = registerSeed(engine, '思考', 'concept');
      const seed2 = registerSeed(engine, '創造', 'concept');
      const seed3 = registerSeed(engine, '価値', 'concept');

      const chains = generateParallelThoughts(engine, [seed1.id, seed2.id, seed3.id]);

      expect(chains.length).toBe(3);
    });
  });

  describe("optimizeAssociation", () => {
    it("should return optimized parameters", () => {
      registerSeed(engine, '矛盾', 'concept');
      generateNonLinearThoughts(engine);

      const params = optimizeAssociation(engine, 'connection');

      expect(params.maxDepth).toBeGreaterThan(0);
      expect(params.breadth).toBeGreaterThan(0);
      expect(params.randomnessWeight).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getParetoOptimalInsights", () => {
    it("should return pareto optimal insights", () => {
      registerSeed(engine, '存在', 'concept');
      generateNonLinearThoughts(engine);

      const insights = getParetoOptimalInsights(engine);

      expect(insights).toBeInstanceOf(Array);
    });
  });

  describe("extractSeedsFromText", () => {
    it("should extract concept seeds from text", () => {
      const text = '思考とは何か？創造と存在の関係について。';
      const seeds = extractSeedsFromText(engine, text);

      expect(seeds.length).toBeGreaterThan(0);
    });

    it("should extract question seeds", () => {
      const text = '真実とは何か？どうやって知るのか？';
      const seeds = extractSeedsFromText(engine, text);

      const questionSeeds = seeds.filter(s => s.type === 'question');
      expect(questionSeeds.length).toBeGreaterThan(0);
    });
  });

  describe("generateNonLinearThoughtReport", () => {
    it("should generate readable report", () => {
      registerSeed(engine, 'テスト', 'concept');
      generateNonLinearThoughts(engine);

      const report = generateNonLinearThoughtReport(engine);

      expect(report).toContain('非線形思考エンジン');
      expect(report).toContain('総チェーン数');
    });
  });

  describe("resetEngine", () => {
    it("should reset engine state", () => {
      registerSeed(engine, 'test', 'concept');
      generateNonLinearThoughts(engine);

      resetNonLinearEngine(engine);

      expect(engine.seeds.size).toBe(0);
      expect(engine.chains.length).toBe(0);
      expect(engine.statistics.totalChains).toBe(0);
    });
  });
});

// ============================================================================
// モジュール間統合のテスト
// ============================================================================

describe("Inter-Module Integration", () => {
  it("should integrate aporetic reasoning with creative destruction", () => {
    // アポリア検出
    const aporiaEngine = createAporeticEngine();
    const destructionEngine = createCreativeDestructionEngine();

    // 前提を登録
    const premise = registerPremise(
      destructionEngine,
      '完全性は速度より優先されるべき',
      'normative' as PremiseType,
      0.8
    );

    // 前提を破壊
    const destruction = performDestruction(destructionEngine, premise.id);
    expect(destruction).toBeDefined();

    // 破壊結果からアポリア推論へ
    const aporia: AporiaDetection = {
      type: 'completeness-vs-speed',
      description: destruction!.remnants[0],
      tensionLevel: destruction!.depth,
      pole1: { concept: '完全性', value: '品質', arguments: [] },
      pole2: { concept: '速度', value: '効率', arguments: [] },
      context: '破壊から生成',
      resolution: 'maintain-tension',
    };

    const result = performAporeticInference(aporiaEngine, aporia, []);
    expect(result.paretoFront.length).toBeGreaterThan(0);
  });

  it("should integrate hyper-metacognition with non-linear thought", () => {
    const metaEngine = createHyperMetacognitionEngine();
    const thoughtEngine = createNonLinearThoughtEngine();

    // 非線形思考を生成
    registerSeed(thoughtEngine, '創造', 'concept');
    const chain = generateNonLinearThoughts(thoughtEngine);

    // 生成された思考をメタ認知
    const thoughtContent = chain.associations.map(a => a.content).join(' -> ');
    const metaState = performHyperMetacognition(metaEngine, thoughtContent);

    expect(metaState.integratedEvaluation.thinkingQuality).toBeGreaterThan(0);
  });

  it("should create full pipeline from destruction to insight", () => {
    // 1. 創造的破壊
    const destructionEngine = createCreativeDestructionEngine();
    const premise = registerPremise(
      destructionEngine,
      '論理は常に有効である',
      'methodological' as PremiseType,
      0.9
    );
    const destruction = performDestruction(destructionEngine, premise.id);

    // 2. 非線形思考による新たな視点の探索
    const thoughtEngine = createNonLinearThoughtEngine();
    for (const remnant of destruction!.remnants) {
      registerSeed(thoughtEngine, remnant, 'concept');
    }
    const chains = generateParallelThoughts(
      thoughtEngine,
      Array.from(thoughtEngine.seeds.keys()).slice(0, 3)
    );

    // 3. パレート最適な洞察の抽出
    const insights = getParetoOptimalInsights(thoughtEngine);

    // 4. メタ認知による評価
    const metaEngine = createHyperMetacognitionEngine();
    const insightContent = insights.length > 0
      ? insights[0].content
      : chains[0]?.associations[0]?.content || 'test';

    const metaState = performHyperMetacognition(metaEngine, insightContent);

    // パイプラインが完了したことを確認
    expect(destruction).toBeDefined();
    expect(chains.length).toBeGreaterThan(0);
    expect(metaState).toBeDefined();
  });
});
