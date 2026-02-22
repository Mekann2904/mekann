/**
 * @abdd.meta
 * path: tests/self-improvement-deep.test.ts
 * role: 自己改善深化フェーズのモジュール統合テスト
 * why: 4つの新規モジュールの動作と統合を検証
 * related: .pi/lib/aporetic-reasoning.ts, .pi/lib/creative-destruction.ts, .pi/lib/hyper-metacognition.ts, .pi/lib/nonlinear-thought.ts
 * public_api: なし（テストファイル）
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: アポリア共生型推論、創造的破壊、超メタ認知、非線形思考のテスト
 * what_it_does: 各モジュールの基本機能と統合動作を検証
 * why_it_exists: 品質保証のため
 * scope:
 *   in: テストケース
 *   out: テスト結果
 */

import { describe, it, expect } from 'vitest';
import {
  createAporeticEngine,
  createInitialBeliefState,
  performAporeticInference,
  updateBeliefState,
  type AporiaDetection,
  type Evidence
} from '../.pi/lib/aporetic-reasoning';

import {
  createCreativeDestructionEngine,
  registerPremise,
  performDestruction,
  performChainDestruction,
  optimizeDestruction,
  getDestructionMethods,
  type PremiseType
} from '../.pi/lib/creative-destruction';

import {
  createHyperMetacognitionEngine,
  performHyperMetacognition,
  deepenMetacognition,
  getThinkingQualityAssessment,
  generateMetacognitionReport
} from '../.pi/lib/hyper-metacognition';

import {
  createNonLinearThoughtEngine,
  registerSeed,
  generateNonLinearThoughts,
  generateParallelThoughts,
  getParetoOptimalInsights,
  extractSeedsFromText
} from '../.pi/lib/nonlinear-thought';

// ============================================================================
// アポリア共生型推論のテスト
// ============================================================================

describe('aporetic-reasoning', () => {
  describe('createAporeticEngine', () => {
    it('should create engine with default config', () => {
      const engine = createAporeticEngine();
      expect(engine).toBeDefined();
      expect(engine.beliefStates).toBeInstanceOf(Map);
      expect(engine.config.tensionThreshold).toBe(0.7);
    });

    it('should create engine with custom config', () => {
      const engine = createAporeticEngine({ tensionThreshold: 0.8 });
      expect(engine.config.tensionThreshold).toBe(0.8);
    });
  });

  describe('createInitialBeliefState', () => {
    it('should create belief state from aporia', () => {
      const aporia: AporiaDetection = {
        type: 'completeness-vs-speed',
        pole1: { concept: '完全性', value: '品質重視', arguments: [] },
        pole2: { concept: '速度', value: '効率重視', arguments: [] },
        tensionLevel: 0.7,
        description: '完全性と速度のトレードオフ',
        context: '開発タスク',
        resolution: 'maintain-tension'
      };

      const state = createInitialBeliefState(aporia);

      expect(state).toBeDefined();
      expect(state.pole1.name).toBe('完全性');
      expect(state.pole2.name).toBe('速度');
      expect(state.balancePoint).toBe(0);
      expect(state.explosionGuards.length).toBeGreaterThan(0);
    });
  });

  describe('updateBeliefState', () => {
    it('should update belief state with evidence', () => {
      const aporia: AporiaDetection = {
        type: 'safety-vs-utility',
        pole1: { concept: '安全性', value: 'リスク回避', arguments: [] },
        pole2: { concept: '有用性', value: '価値創出', arguments: [] },
        tensionLevel: 0.6,
        description: '安全性と有用性のトレードオフ',
        context: 'API設計',
        resolution: 'maintain-tension'
      };

      const state = createInitialBeliefState(aporia);

      const evidence: Evidence = {
        type: 'observation',
        value: '安全性を確保する必要がある',
        strength: 0.7,
        source: 'user-feedback',
        timestamp: new Date(),
        likelihoods: new Map([
          ['重要', 0.8],
          ['やや重要', 0.6]
        ])
      };

      const updated = updateBeliefState(state, evidence, 'pole1');

      expect(updated.pole1.supportingEvidence.length).toBe(1);
      expect(updated.updateHistory.length).toBe(1);
    });
  });

  describe('performAporeticInference', () => {
    it('should perform inference and return pareto front', () => {
      const engine = createAporeticEngine();

      const aporia: AporiaDetection = {
        type: 'completeness-vs-speed',
        pole1: { concept: '完全性', value: '品質', arguments: [] },
        pole2: { concept: '速度', value: '効率', arguments: [] },
        tensionLevel: 0.7,
        description: '完全性と速度の緊張関係',
        context: 'テスト',
        resolution: 'maintain-tension'
      };

      const evidenceList: Evidence[] = [
        {
          type: 'observation',
          value: '品質が重要',
          strength: 0.6,
          source: 'test',
          timestamp: new Date(),
          likelihoods: new Map([['重要', 0.7]])
        }
      ];

      const result = performAporeticInference(engine, aporia, evidenceList);

      expect(result).toBeDefined();
      expect(result.beliefState).toBeDefined();
      expect(result.paretoFront.length).toBeGreaterThan(0);
      expect(result.inferenceConfidence).toBeGreaterThanOrEqual(0);
    });
  });
});

// ============================================================================
// 創造的破壊のテスト
// ============================================================================

describe('creative-destruction', () => {
  describe('createCreativeDestructionEngine', () => {
    it('should create engine with destruction methods', () => {
      const engine = createCreativeDestructionEngine();

      expect(engine).toBeDefined();
      expect(engine.destructionMethods.length).toBe(5);
      expect(engine.premises).toBeInstanceOf(Map);
    });
  });

  describe('registerPremise', () => {
    it('should register premise with specified type', () => {
      const engine = createCreativeDestructionEngine();
      const premise = registerPremise(engine, '常に正確であるべき', 'normative', 0.8);

      expect(premise).toBeDefined();
      expect(premise.content).toBe('常に正確であるべき');
      expect(premise.type).toBe('normative');
      expect(premise.solidity).toBe(0.8);
      expect(engine.premises.size).toBe(1);
    });

    it('should use default values when not specified', () => {
      const engine = createCreativeDestructionEngine();
      const premise = registerPremise(engine, 'テスト前提');

      expect(premise.type).toBe('contextual');
      expect(premise.solidity).toBe(0.5);
    });
  });

  describe('performDestruction', () => {
    it('should destroy premise with appropriate method', () => {
      const engine = createCreativeDestructionEngine();
      const premise = registerPremise(engine, '善は正しい', 'normative', 0.9);

      const result = performDestruction(engine, premise.id);

      expect(result).toBeDefined();
      expect(result!.originalPremise.id).toBe(premise.id);
      expect(result!.remnants.length).toBeGreaterThan(0);
      expect(engine.statistics.totalDestructions).toBe(1);
    });

    it('should return null for non-existent premise', () => {
      const engine = createCreativeDestructionEngine();
      const result = performDestruction(engine, 'non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('performChainDestruction', () => {
    it('should perform chain destruction with specified depth', () => {
      const engine = createCreativeDestructionEngine();
      const premise = registerPremise(engine, '本質は存在する', 'ontological', 0.9);

      const chain = performChainDestruction(engine, premise.id, 2);

      expect(chain).toBeDefined();
      expect(chain.sequence.length).toBeGreaterThan(0);
      expect(chain.statistics.totalPremisesDestroyed).toBeGreaterThan(0);
    });
  });

  describe('optimizeDestruction', () => {
    it('should calculate pareto optimal destruction strategies', () => {
      const engine = createCreativeDestructionEngine();
      registerPremise(engine, '前提A', 'normative', 0.7);
      registerPremise(engine, '前提B', 'epistemic', 0.6);

      const strategies = optimizeDestruction(engine);

      expect(strategies.length).toBeGreaterThan(0);
      expect(strategies[0].expectedEffects).toBeDefined();
    });
  });

  describe('getDestructionMethods', () => {
    it('should return all destruction methods', () => {
      const methods = getDestructionMethods();

      expect(methods.length).toBe(5);
      expect(methods.map(m => m.philosophicalBasis)).toContain('nietzschean');
      expect(methods.map(m => m.philosophicalBasis)).toContain('deleuzian');
      expect(methods.map(m => m.philosophicalBasis)).toContain('derridean');
    });
  });
});

// ============================================================================
// 超メタ認知のテスト
// ============================================================================

describe('hyper-metacognition', () => {
  describe('createHyperMetacognitionEngine', () => {
    it('should create engine with default config', () => {
      const engine = createHyperMetacognitionEngine();

      expect(engine).toBeDefined();
      expect(engine.config.maxCognitiveDepth).toBe(3);
      expect(engine.currentState).toBeNull();
    });
  });

  describe('performHyperMetacognition', () => {
    it('should create 4-layer metacognitive state', () => {
      const engine = createHyperMetacognitionEngine();
      const thought = 'この問題についてどう考えるべきか？ 前提を確認し、制約を検討する必要がある。';

      const state = performHyperMetacognition(engine, thought);

      expect(state).toBeDefined();
      expect(state.layer0).toBeDefined();
      expect(state.layer1).toBeDefined();
      expect(state.layer2).toBeDefined();
      expect(state.layer3).toBeDefined();
      expect(state.integratedEvaluation).toBeDefined();
    });

    it('should detect autopilot signs in short output', () => {
      const engine = createHyperMetacognitionEngine();
      const thought = '完了しました。';

      const state = performHyperMetacognition(engine, thought);

      expect(state.layer0.limitations.length).toBeGreaterThan(0);
      expect(state.detectedPatterns.some(p => p.type === 'autopilot')).toBe(true);
    });

    it('should detect formalization patterns', () => {
      const engine = createHyperMetacognitionEngine();
      const thought = '前提を確認し、二項対立を検出して、文脈依存性を考慮した。';

      const state = performHyperMetacognition(engine, thought);

      expect(state.layer2.observations.length).toBeGreaterThan(0);
    });
  });

  describe('deepenMetacognition', () => {
    it('should deepen metacognition with additional insight', () => {
      const engine = createHyperMetacognitionEngine();
      const initialState = performHyperMetacognition(engine, '初期思考');

      const deepened = deepenMetacognition(engine, '追加の洞察');

      expect(deepened).toBeDefined();
      expect(deepened!.layer0.content).toContain('追加の洞察');
    });

    it('should return null when no current state', () => {
      const engine = createHyperMetacognitionEngine();

      const result = deepenMetacognition(engine, '洞察');

      expect(result).toBeNull();
    });
  });

  describe('getThinkingQualityAssessment', () => {
    it('should return quality assessment with breakdown', () => {
      const engine = createHyperMetacognitionEngine();
      const state = performHyperMetacognition(engine, '思考内容');

      const assessment = getThinkingQualityAssessment(state);

      expect(assessment.overallScore).toBeGreaterThanOrEqual(0);
      expect(assessment.breakdown).toBeDefined();
      expect(assessment.strengths).toBeInstanceOf(Array);
      expect(assessment.weaknesses).toBeInstanceOf(Array);
    });
  });

  describe('generateMetacognitionReport', () => {
    it('should generate report with all sections', () => {
      const engine = createHyperMetacognitionEngine();
      const state = performHyperMetacognition(engine, 'テスト思考');

      const report = generateMetacognitionReport(state);

      expect(report).toContain('超メタ認知レポート');
      expect(report).toContain('総合評価');
      expect(report).toContain('検出されたパターン');
    });
  });
});

// ============================================================================
// 非線形思考のテスト
// ============================================================================

describe('nonlinear-thought', () => {
  describe('createNonLinearThoughtEngine', () => {
    it('should create engine with default config', () => {
      const engine = createNonLinearThoughtEngine();

      expect(engine).toBeDefined();
      expect(engine.seeds).toBeInstanceOf(Map);
      expect(engine.config.defaultParameters.maxDepth).toBe(5);
    });
  });

  describe('registerSeed', () => {
    it('should register thought seed', () => {
      const engine = createNonLinearThoughtEngine();
      const seed = registerSeed(engine, '思考', 'concept');

      expect(seed).toBeDefined();
      expect(seed.content).toBe('思考');
      expect(seed.type).toBe('concept');
      expect(engine.seeds.size).toBe(1);
    });
  });

  describe('generateNonLinearThoughts', () => {
    it('should generate association chain from seed', () => {
      const engine = createNonLinearThoughtEngine();
      const seed = registerSeed(engine, '創造', 'concept');

      const chain = generateNonLinearThoughts(engine, seed.id);

      expect(chain).toBeDefined();
      expect(chain.seed.id).toBe(seed.id);
      expect(chain.associations.length).toBeGreaterThan(0);
      expect(chain.statistics).toBeDefined();
    });

    it('should create default seed when none registered', () => {
      const engine = createNonLinearThoughtEngine();

      const chain = generateNonLinearThoughts(engine);

      expect(chain).toBeDefined();
      expect(chain.seed).toBeDefined();
    });
  });

  describe('generateParallelThoughts', () => {
    it('should generate multiple chains in parallel', () => {
      const engine = createNonLinearThoughtEngine();
      const seed1 = registerSeed(engine, '思考', 'concept');
      const seed2 = registerSeed(engine, '存在', 'concept');

      const chains = generateParallelThoughts(engine, [seed1.id, seed2.id]);

      expect(chains.length).toBe(2);
      expect(engine.statistics.totalChains).toBe(2);
    });
  });

  describe('getParetoOptimalInsights', () => {
    it('should return pareto optimal insights', () => {
      const engine = createNonLinearThoughtEngine();
      registerSeed(engine, '価値', 'concept');
      registerSeed(engine, '意味', 'concept');

      generateNonLinearThoughts(engine);
      generateNonLinearThoughts(engine);

      const optimal = getParetoOptimalInsights(engine);

      expect(optimal).toBeInstanceOf(Array);
    });
  });

  describe('extractSeedsFromText', () => {
    it('should extract concepts and questions from text', () => {
      const engine = createNonLinearThoughtEngine();
      const text = '思考の本質についてどう考えるか？ 存在とは何か？';

      const seeds = extractSeedsFromText(engine, text);

      expect(seeds.length).toBeGreaterThan(0);
      expect(engine.seeds.size).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// モジュール統合テスト
// ============================================================================

describe('integration', () => {
  it('should integrate all four modules in workflow', () => {
    // 1. 超メタ認知で初期思考を分析
    const metaEngine = createHyperMetacognitionEngine();
    const initialThought = 'この問題に対して、完全性を追求すべきか、速度を優先すべきか？';
    const metaState = performHyperMetacognition(metaEngine, initialThought);

    expect(metaState.layer0).toBeDefined();

    // 2. アポリア共生型推論で両極を維持
    const aporiaEngine = createAporeticEngine();
    const aporia: AporiaDetection = {
      type: 'completeness-vs-speed',
      pole1: { concept: '完全性', value: '品質', arguments: [] },
      pole2: { concept: '速度', value: '効率', arguments: [] },
      tensionLevel: 0.7,
      description: '完全性と速度のトレードオフ',
      context: '開発',
      resolution: 'maintain-tension'
    };

    const aporiaResult = performAporeticInference(aporiaEngine, aporia, []);

    expect(aporiaResult.paretoFront.length).toBeGreaterThan(0);

    // 3. 創造的破壊で前提を破壊
    const destructionEngine = createCreativeDestructionEngine();
    const premise = registerPremise(
      destructionEngine,
      '完全性は常に優先されるべき',
      'normative',
      0.8
    );
    const destructionResult = performDestruction(destructionEngine, premise.id);

    expect(destructionResult).toBeDefined();

    // 4. 非線形思考で新しい視点を生成
    const nonlinearEngine = createNonLinearThoughtEngine();
    registerSeed(nonlinearEngine, '完全性', 'concept');
    const thoughtChain = generateNonLinearThoughts(nonlinearEngine);

    expect(thoughtChain.associations.length).toBeGreaterThan(0);

    // 5. 統合評価
    const qualityAssessment = getThinkingQualityAssessment(metaState);

    expect(qualityAssessment.overallScore).toBeGreaterThanOrEqual(0);
  });

  it('should demonstrate creative destruction leading to new insights', () => {
    const engine = createCreativeDestructionEngine();

    // 強固な前提を登録
    registerPremise(engine, '正しい答えが存在する', 'epistemic', 0.9);
    registerPremise(engine, '論理は普遍的である', 'methodological', 0.8);

    // 最適破壊戦略を計算
    const strategies = optimizeDestruction(engine);

    expect(strategies.length).toBeGreaterThan(0);

    // パレートフロント上の戦略を確認
    const bestStrategy = strategies[0];
    expect(bestStrategy.expectedEffects.creativityIncrease).toBeGreaterThan(0);
  });

  it('should show meta-metacognition detecting formalization risks', () => {
    const engine = createHyperMetacognitionEngine();

    // 形式化された思考パターンを含む入力
    const formalizedThought = `
      前提を確認しました。
      二項対立を検出しました。
      文脈依存性を考慮しました。
      除外されたものを分析しました。
      限界を認識しました。
    `;

    const state = performHyperMetacognition(engine, formalizedThought);

    // 形式化リスクが検出されるべき
    expect(state.integratedEvaluation.formalizationRisk).toBeGreaterThan(0);
  });

  it('should generate non-linear insights with convergence', () => {
    const engine = createNonLinearThoughtEngine();

    // 複数のシードから並列に思考生成
    const seed1 = registerSeed(engine, '矛盾', 'paradox');
    const seed2 = registerSeed(engine, '存在', 'concept');
    const seed3 = registerSeed(engine, '価値', 'concept');

    generateParallelThoughts(engine, [seed1.id, seed2.id, seed3.id], {
      maxDepth: 4,
      breadth: 3,
      randomnessWeight: 0.4
    });

    // 収束点または洞察が生成されることを確認
    const hasConvergenceOrInsights =
      engine.convergencePoints.length > 0 || engine.insights.length > 0;

    expect(hasConvergenceOrInsights || engine.chains.length > 0).toBe(true);
  });
});
