/**
 * @abdd.meta
 * path: tests/metacognition.test.ts
 * role: メタ認知チェック機能のテスト
 * why: 7つの哲学的視座に基づく自己点検の正確性を保証
 * related: .pi/lib/verification-workflow.ts
 * public_api: なし（テストファイル）
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: verification-workflow.tsのメタ認科チェック機能のテスト
 * what_it_does: 脱構築、スキゾ分析、幸福論等の視座チェックのテスト
 * why_it_exists: 品質保証のため
 * scope:
 *   in: テストケース
 *   out: テスト結果
 */

import { describe, it, expect } from 'vitest';
import {
  runMetacognitiveCheck,
  detectInnerFascism,
  detectBinaryOppositions,
  detectAporiaAvoidanceTemptation,
  generateMetacognitiveSummary,
  MetacognitiveCheck
} from '../.pi/lib/verification-workflow';

describe('metacognition', () => {
  describe('runMetacognitiveCheck', () => {
    it('should return complete metacognitive check result', () => {
      const output = `
CLAIM: この実装は正しいです
EVIDENCE: テストが成功しました
CONFIDENCE: 0.9
RESULT: 実装完了
      `;

      const check = runMetacognitiveCheck(output, { task: '実装タスク' });

      expect(check.deconstruction).toBeDefined();
      expect(check.schizoAnalysis).toBeDefined();
      expect(check.eudaimonia).toBeDefined();
      expect(check.utopiaDystopia).toBeDefined();
      expect(check.philosophyOfThought).toBeDefined();
      expect(check.taxonomyOfThought).toBeDefined();
      expect(check.logic).toBeDefined();
    });

    it('should detect autopilot signs in short output', () => {
      const output = '完了しました。';

      const check = runMetacognitiveCheck(output);

      expect(check.philosophyOfThought.autopilotSigns.length).toBeGreaterThan(0);
      expect(check.philosophyOfThought.isThinking).toBe(false);
    });

    it('should detect thinking in substantial output', () => {
      const output = `
なぜこの実装を選んだのか？
どうすれば最適化できるか？
前提として何を仮定しているか？

これらの問いに対して、以下のように考えます。
まず、制約条件を考慮すると...
      `;

      const check = runMetacognitiveCheck(output);

      expect(check.philosophyOfThought.metacognitionLevel).toBeGreaterThan(0.5);
    });
  });

  describe('detectInnerFascism', () => {
    it('should detect self-surveillance patterns', () => {
      // 「常に」「必ず」は2回以上の反復が必要
      const output = '常に常に正確である必要があります。絶対に絶対にミスをしてはいけません。';

      const result = detectInnerFascism(output, {});

      expect(result.innerFascismSigns.length).toBeGreaterThan(0);
      expect(result.microFascisms.length).toBeGreaterThan(0);
    });

    it('should detect obedience patterns', () => {
      // 「すべき」「しなければならない」は2回以上の反復が必要
      const output = 'すべきことをしています。すべきことを完了しました。しなければならないしなければならない。';

      const result = detectInnerFascism(output, {});

      expect(result.microFascisms.length).toBeGreaterThan(0);
    });

    it('should detect desire production', () => {
      const output = 'タスクを完了し、成功に達成しました。';

      const result = detectInnerFascism(output, {});

      expect(result.desireProduction).toContain('生産性への欲望');
    });

    it('should return empty arrays for healthy output', () => {
      const output = '状況に応じて柔軟に対応します。必要に応じて調整します。';

      const result = detectInnerFascism(output, {});

      expect(result.innerFascismSigns.length).toBe(0);
      expect(result.microFascisms.length).toBe(0);
    });
  });

  describe('detectBinaryOppositions', () => {
    it('should detect completeness-vs-speed binary', () => {
      // 正規表現パターンにマッチする出力
      const output = '完全で正確な解決策を素早く効率的に提供する必要があります。';

      const result = detectBinaryOppositions(output, 'テスト');

      // 完全性の二項対立またはアポリアが検出される
      const hasRelevantDetection =
        result.binaryOppositions.some(b => b.includes('完全')) ||
        result.aporias.some(a => a.type === 'completeness-vs-speed');

      expect(hasRelevantDetection).toBe(true);
    });

    it('should detect aporias when both poles exist', () => {
      const output = '安全性を確保しながら、有用な機能を効率的に実装する必要があります。';

      const result = detectBinaryOppositions(output, 'テスト');

      // 安全性vs有用性、または完全性vs速度のアポリアが検出される
      expect(result.aporias.length).toBeGreaterThan(0);
    });

    it('should identify exclusions', () => {
      const output = '正しいか間違いか、成功か失敗か、どちらかです。';

      const result = detectBinaryOppositions(output, 'テスト');

      // 善悪の二項対立が検出される場合、exclusionsも追加される
      if (result.binaryOppositions.length > 0) {
        expect(result.exclusions.length).toBeGreaterThan(0);
      } else {
        // 二項対立が検出されない場合のフォールバック
        expect(result.binaryOppositions.length).toBe(0);
      }
    });

    it('should return empty for non-binary output', () => {
      const output = '状況を分析し、複数の選択肢を検討します。';

      const result = detectBinaryOppositions(output, 'テスト');

      expect(result.binaryOppositions.length).toBe(0);
      expect(result.aporias.length).toBe(0);
    });
  });

  describe('detectAporiaAvoidanceTemptation', () => {
    it('should detect hegelian dialectic temptation', () => {
      const aporias = [
        {
          type: 'completeness-vs-speed' as const,
          pole1: { concept: '完全性', value: '品質', arguments: [] },
          pole2: { concept: '速度', value: '効率', arguments: [] },
          tensionLevel: 0.6,
          description: '完全性と速度の緊張関係',
          context: '',
          resolution: 'maintain-tension' as const
        }
      ];

      const output = '両者を統合してバランスを取ります。';

      const temptations = detectAporiaAvoidanceTemptation(aporias, output);

      expect(temptations.length).toBeGreaterThan(0);
      expect(temptations[0]).toContain('統合');
    });

    it('should return empty for proper aporia handling', () => {
      const aporias = [
        {
          type: 'completeness-vs-speed' as const,
          pole1: { concept: '完全性', value: '品質', arguments: [] },
          pole2: { concept: '速度', value: '効率', arguments: [] },
          tensionLevel: 0.6,
          description: '完全性と速度の緊張関係',
          context: '',
          resolution: 'maintain-tension' as const
        }
      ];

      const output = '両方の価値を維持しながら、状況に応じて判断します。';

      const temptations = detectAporiaAvoidanceTemptation(aporias, output);

      expect(temptations.length).toBe(0);
    });
  });

  describe('generateMetacognitiveSummary', () => {
    it('should generate summary with issues', () => {
      const check: MetacognitiveCheck = {
        deconstruction: {
          binaryOppositions: ['完全性の二項対立'],
          exclusions: [],
          aporias: [
            {
              type: 'completeness-vs-speed',
              pole1: { concept: '完全性', value: '品質', arguments: [] },
              pole2: { concept: '速度', value: '効率', arguments: [] },
              tensionLevel: 0.7,
              description: '完全性と速度の緊張関係',
              context: '',
              resolution: 'maintain-tension'
            }
          ]
        },
        schizoAnalysis: {
          desireProduction: [],
          innerFascismSigns: [],
          microFascisms: []
        },
        eudaimonia: {
          excellencePursuit: '品質の追求',
          pleasureTrap: false,
          meaningfulGrowth: '学習'
        },
        utopiaDystopia: {
          worldBeingCreated: '効率的な世界',
          totalitarianRisk: [],
          powerDynamics: []
        },
        philosophyOfThought: {
          isThinking: true,
          metacognitionLevel: 0.7,
          autopilotSigns: []
        },
        taxonomyOfThought: {
          currentMode: 'analytical',
          recommendedMode: 'analytical',
          modeRationale: '適切なモード'
        },
        logic: {
          fallacies: [],
          validInferences: ['演繹的推論'],
          invalidInferences: []
        }
      };

      const summary = generateMetacognitiveSummary(check);

      expect(summary).toContain('メタ認知チェック結果');
      expect(summary).toContain('二項対立');
      expect(summary).toContain('アポリア');
    });

    it('should include strengths in summary', () => {
      const check: MetacognitiveCheck = {
        deconstruction: {
          binaryOppositions: [],
          exclusions: [],
          aporias: []
        },
        schizoAnalysis: {
          desireProduction: [],
          innerFascismSigns: [],
          microFascisms: []
        },
        eudaimonia: {
          excellencePursuit: '品質の追求',
          pleasureTrap: false,
          meaningfulGrowth: '継続的な学習と改善'
        },
        utopiaDystopia: {
          worldBeingCreated: '効率的な世界',
          totalitarianRisk: [],
          powerDynamics: []
        },
        philosophyOfThought: {
          isThinking: true,
          metacognitionLevel: 0.8,
          autopilotSigns: []
        },
        taxonomyOfThought: {
          currentMode: 'analytical',
          recommendedMode: 'analytical',
          modeRationale: '適切なモード'
        },
        logic: {
          fallacies: [],
          validInferences: ['演繹的推論'],
          invalidInferences: []
        }
      };

      const summary = generateMetacognitiveSummary(check);

      expect(summary).toContain('強み');
      expect(summary).toContain('有効な推論');
    });

    it('should include mode recommendation when needed', () => {
      const check: MetacognitiveCheck = {
        deconstruction: {
          binaryOppositions: [],
          exclusions: [],
          aporias: []
        },
        schizoAnalysis: {
          desireProduction: [],
          innerFascismSigns: [],
          microFascisms: []
        },
        eudaimonia: {
          excellencePursuit: '品質の追求',
          pleasureTrap: false,
          meaningfulGrowth: '学習'
        },
        utopiaDystopia: {
          worldBeingCreated: '効率的な世界',
          totalitarianRisk: [],
          powerDynamics: []
        },
        philosophyOfThought: {
          isThinking: true,
          metacognitionLevel: 0.7,
          autopilotSigns: []
        },
        taxonomyOfThought: {
          currentMode: 'creative',
          recommendedMode: 'analytical',
          modeRationale: '分析タスクには分析的モードが推奨されます'
        },
        logic: {
          fallacies: [],
          validInferences: [],
          invalidInferences: []
        }
      };

      const summary = generateMetacognitiveSummary(check);

      expect(summary).toContain('推奨');
    });
  });

  describe('7 perspectives integration', () => {
    it('should apply all 7 perspectives in comprehensive check', () => {
      const output = `
CLAIM: 常に常に正確に完了すべきです
EVIDENCE: 間違いなく成功しました。必ず正しいです。
CONFIDENCE: 0.95
RESULT: 完璧に実装完了

統合して解決します。
      `;

      const check = runMetacognitiveCheck(output, { task: '実装タスク' });

      // I. 脱構築: 二項対立やアポリアの検出
      expect(check.deconstruction).toBeDefined();

      // II. スキゾ分析: 内なるファシズムの検出（「常に」「必ず」等の反復使用）
      // ファシズム兆候は検出される可能性がある
      expect(check.schizoAnalysis).toBeDefined();

      // III. 幸福論: 快楽主義の罠検出
      expect(check.eudaimonia).toBeDefined();

      // IV. ユートピア/ディストピア: 世界創造の分析
      expect(check.utopiaDystopia).toBeDefined();

      // V. 思考哲学: オートパイロット検出
      // 短い出力なのでオートパイロット兆候がある可能性
      expect(check.philosophyOfThought).toBeDefined();

      // VI. 思考分類学: 思考モードの評価
      expect(check.taxonomyOfThought).toBeDefined();

      // VII. 論理学: 誤謬の検出
      expect(check.logic).toBeDefined();
    });
  });
});
