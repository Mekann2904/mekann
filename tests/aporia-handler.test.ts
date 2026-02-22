/**
 * @abdd.meta
 * path: tests/aporia-handler.test.ts
 * role: アポリアハンドラーモジュールのテスト
 * why: アポリア検出、対処戦略選択の正確性を保証
 * related: .pi/lib/aporia-handler.ts
 * public_api: なし（テストファイル）
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: aporia-handler.tsの各関数のユニットテスト
 * what_it_does: アポリア検出、対処戦略、回避誘惑検出のテスト
 * why_it_exists: 品質保証のため
 * scope:
 *   in: テストケース
 *   out: テスト結果
 */

import { describe, it, expect } from 'vitest';
import {
  detectAporia,
  handleAporia,
  handleMultipleAporias,
  detectAvoidanceTemptation,
  generateAporiaGuidance,
  generateAporiaReport,
  getAllAporiaTypes,
  getAllResolutionStrategies,
  evaluateAporiaState,
  AporiaDetection,
  ResolutionContext
} from '../.pi/lib/aporia-handler';

describe('aporia-handler', () => {
  describe('detectAporia', () => {
    it('should detect completeness-vs-speed aporia', () => {
      const text = '完全な解決策を素早く提供する必要があります。';
      const aporias = detectAporia(text);

      expect(aporias.length).toBeGreaterThan(0);
      expect(aporias.some(a => a.type === 'completeness-vs-speed')).toBe(true);
    });

    it('should detect safety-vs-utility aporia', () => {
      const text = '安全性を確保しながら、有用な機能を提供する必要があります。';
      const aporias = detectAporia(text);

      expect(aporias.some(a => a.type === 'safety-vs-utility')).toBe(true);
    });

    it('should detect autonomy-vs-obedience aporia', () => {
      const text = '自律的に判断しながら、規則に従順である必要があります。';
      const aporias = detectAporia(text);

      expect(aporias.some(a => a.type === 'autonomy-vs-obedience')).toBe(true);
    });

    it('should detect consistency-vs-context aporia', () => {
      const text = '一貫した原則を保ちながら、文脈に応じて柔軟に対応する必要があります。';
      const aporias = detectAporia(text);

      expect(aporias.some(a => a.type === 'consistency-vs-context')).toBe(true);
    });

    it('should return empty array when no aporia is present', () => {
      const text = 'これは普通の文章です。';
      const aporias = detectAporia(text);

      expect(aporias.length).toBe(0);
    });

    it('should calculate tension level correctly', () => {
      const text = '完全で正確な結果を効率的に素早く達成する';
      const aporias = detectAporia(text);

      aporias.forEach(aporia => {
        expect(aporia.tensionLevel).toBeGreaterThanOrEqual(0);
        expect(aporia.tensionLevel).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('handleAporia', () => {
    it('should maintain tension for low tension aporia', () => {
      const aporia: AporiaDetection = {
        type: 'completeness-vs-speed',
        pole1: { concept: '完全性', value: '品質', arguments: [] },
        pole2: { concept: '速度', value: '効率', arguments: [] },
        tensionLevel: 0.3,
        description: 'テストアポリア',
        context: '',
        resolution: 'maintain-tension'
      };

      const resolution = handleAporia(aporia, { urgencyLevel: 0.3 });
      expect(resolution.strategy).toBe('maintain-tension');
      expect(resolution.maintainedPoles).toContain('完全性');
      expect(resolution.maintainedPoles).toContain('速度');
    });

    it('should make responsible decision for high urgency', () => {
      const aporia: AporiaDetection = {
        type: 'safety-vs-utility',
        pole1: { concept: '安全性', value: 'リスク回避', arguments: [] },
        pole2: { concept: '有用性', value: '効果追求', arguments: [] },
        tensionLevel: 0.7,
        description: 'テストアポリア',
        context: '',
        resolution: 'maintain-tension'
      };

      const resolution = handleAporia(aporia, { urgencyLevel: 0.9, timePressure: true });
      expect(resolution.strategy).toBe('responsible-decision');
      expect(resolution.decision).toBeDefined();
    });

    it('should acknowledge undecidable for reversible high-tension aporia', () => {
      const aporia: AporiaDetection = {
        type: 'autonomy-vs-obedience',
        pole1: { concept: '自律性', value: '自己決定', arguments: [] },
        pole2: { concept: '従順さ', value: '指示従順', arguments: [] },
        tensionLevel: 0.9,
        description: 'テストアポリア',
        context: '',
        resolution: 'acknowledge'
      };

      const resolution = handleAporia(aporia, { reversibility: true, timePressure: false });
      expect(resolution.strategy).toBe('acknowledge-undecidable');
    });

    it('should use contextual negotiation for high stakeholder importance', () => {
      const aporia: AporiaDetection = {
        type: 'consistency-vs-context',
        pole1: { concept: '一貫性', value: '原則堅持', arguments: [] },
        pole2: { concept: '文脈適応性', value: '柔軟対応', arguments: [] },
        tensionLevel: 0.6,
        description: 'テストアポリア',
        context: '',
        resolution: 'maintain-tension'
      };

      const resolution = handleAporia(aporia, { stakeholderImportance: 0.8 });
      expect(resolution.strategy).toBe('contextual-negotiation');
    });

    it('should always maintain both poles', () => {
      const aporia: AporiaDetection = {
        type: 'completeness-vs-speed',
        pole1: { concept: '完全性', value: '品質', arguments: [] },
        pole2: { concept: '速度', value: '効率', arguments: [] },
        tensionLevel: 0.5,
        description: 'テストアポリア',
        context: '',
        resolution: 'maintain-tension'
      };

      const contexts: ResolutionContext[] = [
        { urgencyLevel: 0.2 },
        { urgencyLevel: 0.9, timePressure: true },
        { reversibility: true },
        { stakeholderImportance: 0.8 }
      ];

      contexts.forEach(context => {
        const resolution = handleAporia(aporia, context);
        expect(resolution.maintainedPoles).toContain('完全性');
        expect(resolution.maintainedPoles).toContain('速度');
      });
    });
  });

  describe('handleMultipleAporias', () => {
    it('should handle multiple aporias', () => {
      const aporias: AporiaDetection[] = [
        {
          type: 'completeness-vs-speed',
          pole1: { concept: '完全性', value: '品質', arguments: [] },
          pole2: { concept: '速度', value: '効率', arguments: [] },
          tensionLevel: 0.5,
          description: 'アポリア1',
          context: '',
          resolution: 'maintain-tension'
        },
        {
          type: 'safety-vs-utility',
          pole1: { concept: '安全性', value: 'リスク回避', arguments: [] },
          pole2: { concept: '有用性', value: '効果追求', arguments: [] },
          tensionLevel: 0.6,
          description: 'アポリア2',
          context: '',
          resolution: 'maintain-tension'
        }
      ];

      const resolutions = handleMultipleAporias(aporias);
      expect(resolutions.length).toBe(2);
    });
  });

  describe('detectAvoidanceTemptation', () => {
    it('should detect hegelian dialectic temptation', () => {
      const aporia: AporiaDetection = {
        type: 'completeness-vs-speed',
        pole1: { concept: '完全性', value: '品質', arguments: [] },
        pole2: { concept: '速度', value: '効率', arguments: [] },
        tensionLevel: 0.5,
        description: '完全性と速度の緊張関係',
        context: '',
        resolution: 'maintain-tension'
      };

      const resolution = handleAporia(aporia, {});
      const output = '両者を統合してバランスを取る必要があります。';
      const temptations = detectAvoidanceTemptation(resolution, output);

      expect(temptations.some(t => t.includes('統合'))).toBe(true);
    });

    it('should return empty array for proper handling', () => {
      const aporia: AporiaDetection = {
        type: 'completeness-vs-speed',
        pole1: { concept: '完全性', value: '品質', arguments: [] },
        pole2: { concept: '速度', value: '効率', arguments: [] },
        tensionLevel: 0.5,
        description: '完全性と速度の緊張関係',
        context: '',
        resolution: 'maintain-tension'
      };

      const resolution = handleAporia(aporia, {});
      const output = '両方の価値を維持しながら状況に応じて判断します。';
      const temptations = detectAvoidanceTemptation(resolution, output);

      // 適切な出力であれば誘惑は検出されない
      expect(temptations.length).toBe(0);
    });
  });

  describe('generateAporiaGuidance', () => {
    it('should generate guidance with strategy recommendation', () => {
      const aporia: AporiaDetection = {
        type: 'completeness-vs-speed',
        pole1: { concept: '完全性', value: '品質', arguments: [] },
        pole2: { concept: '速度', value: '効率', arguments: [] },
        tensionLevel: 0.5,
        description: '完全性と速度の緊張関係',
        context: '',
        resolution: 'maintain-tension'
      };

      const guidance = generateAporiaGuidance(aporia, {});
      expect(guidance).toContain('完全性と速度の緊張関係');
      expect(guidance).toContain('推奨対処戦略');
      expect(guidance).toContain('注意事項');
    });
  });

  describe('generateAporiaReport', () => {
    it('should generate report for aporias', () => {
      const aporias: AporiaDetection[] = [
        {
          type: 'completeness-vs-speed',
          pole1: { concept: '完全性', value: '品質', arguments: [] },
          pole2: { concept: '速度', value: '効率', arguments: [] },
          tensionLevel: 0.5,
          description: '完全性と速度の緊張関係',
          context: '',
          resolution: 'maintain-tension'
        }
      ];

      const resolutions = handleMultipleAporias(aporias);
      const report = generateAporiaReport(aporias, resolutions);

      expect(report).toContain('アポリア分析レポート');
      expect(report).toContain('検出されたアポリア数: 1');
    });

    it('should return empty message when no aporias', () => {
      const report = generateAporiaReport([], []);
      expect(report).toContain('アポリアは検出されませんでした');
    });
  });

  describe('getAllAporiaTypes', () => {
    it('should return all 4 aporia types', () => {
      const types = getAllAporiaTypes();
      expect(types.length).toBe(4);
      expect(types.map(t => t.type)).toContain('completeness-vs-speed');
      expect(types.map(t => t.type)).toContain('safety-vs-utility');
      expect(types.map(t => t.type)).toContain('autonomy-vs-obedience');
      expect(types.map(t => t.type)).toContain('consistency-vs-context');
    });

    it('should include display names and descriptions', () => {
      const types = getAllAporiaTypes();
      types.forEach(type => {
        expect(type.displayName).toBeDefined();
        expect(type.description).toBeDefined();
      });
    });
  });

  describe('getAllResolutionStrategies', () => {
    it('should return all 4 strategies', () => {
      const strategies = getAllResolutionStrategies();
      expect(strategies.length).toBe(4);
      expect(strategies.map(s => s.name)).toContain('maintain-tension');
      expect(strategies.map(s => s.name)).toContain('acknowledge-undecidable');
      expect(strategies.map(s => s.name)).toContain('responsible-decision');
      expect(strategies.map(s => s.name)).toContain('contextual-negotiation');
    });
  });

  describe('evaluateAporiaState', () => {
    it('should identify healthy state for moderate tension', () => {
      const aporia: AporiaDetection = {
        type: 'completeness-vs-speed',
        pole1: { concept: '完全性', value: '品質', arguments: [] },
        pole2: { concept: '速度', value: '効率', arguments: [] },
        tensionLevel: 0.5,
        description: 'テストアポリア',
        context: '',
        resolution: 'maintain-tension'
      };

      const resolution = handleAporia(aporia, {});
      const evaluation = evaluateAporiaState(resolution);

      expect(evaluation.isHealthy).toBe(true);
      expect(evaluation.issues.length).toBe(0);
    });

    it('should identify issue for very low tension', () => {
      const aporia: AporiaDetection = {
        type: 'completeness-vs-speed',
        pole1: { concept: '完全性', value: '品質', arguments: [] },
        pole2: { concept: '速度', value: '効率', arguments: [] },
        tensionLevel: 0.1,
        description: 'テストアポリア',
        context: '',
        resolution: 'maintain-tension'
      };

      const resolution = handleAporia(aporia, {});
      const evaluation = evaluateAporiaState(resolution);

      expect(evaluation.issues.some(i => i.includes('低すぎる'))).toBe(true);
      expect(evaluation.recommendations.length).toBeGreaterThan(0);
    });

    it('should identify issue for very high tension', () => {
      const aporia: AporiaDetection = {
        type: 'completeness-vs-speed',
        pole1: { concept: '完全性', value: '品質', arguments: [] },
        pole2: { concept: '速度', value: '効率', arguments: [] },
        tensionLevel: 0.95,
        description: 'テストアポリア',
        context: '',
        resolution: 'acknowledge'
      };

      const resolution = handleAporia(aporia, { reversibility: true });
      const evaluation = evaluateAporiaState(resolution);

      expect(evaluation.issues.some(i => i.includes('非常に高い'))).toBe(true);
    });
  });
});
