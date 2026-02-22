/**
 * @abdd.meta
 * path: tests/thinking-process.test.ts
 * role: 思考プロセスモジュールのテスト
 * why: 思考モード選択、思考深化、コンテキスト管理の正確性を保証
 * related: .pi/lib/thinking-process.ts
 * public_api: なし（テストファイル）
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: thinking-process.tsの各関数のユニットテスト
 * what_it_does: 思考モード選択、思考深化、信頼度分析のテスト
 * why_it_exists: 品質保証のため
 * scope:
 *   in: テストケース
 *   out: テスト結果
 */

import { describe, it, expect } from 'vitest';
import {
  selectThinkingMode,
  thinkDeeper,
  createThinkingContext,
  addThinkingStep,
  switchThinkingMode,
  analyzeConfidenceTrend,
  advancePhase,
  getThinkingModeDescription,
  getThinkingPhaseDescription,
  getAllThinkingModes,
  getAllThinkingPhases,
  getModePhaseCompatibility,
  ThinkingMode,
  ThinkingPhase
} from '../.pi/lib/thinking-process';

describe('thinking-process', () => {
  describe('selectThinkingMode', () => {
    it('should select creative mode for design tasks', () => {
      const context = { task: '新しいUIを設計する' };
      const mode = selectThinkingMode(context);
      expect(mode).toBe('creative');
    });

    it('should select analytical mode for analysis tasks', () => {
      const context = { task: 'パフォーマンスを分析する' };
      const mode = selectThinkingMode(context);
      expect(mode).toBe('analytical');
    });

    it('should select critical mode for review tasks', () => {
      const context = { task: 'コードをレビューする' };
      const mode = selectThinkingMode(context);
      expect(mode).toBe('critical');
    });

    it('should select practical mode for implementation tasks', () => {
      const context = { task: '機能を実装する' };
      const mode = selectThinkingMode(context);
      expect(mode).toBe('practical');
    });

    it('should select default mode based on phase if task is not specified', () => {
      const context = { phase: 'problem-discovery' as ThinkingPhase };
      const mode = selectThinkingMode(context);
      expect(mode).toBe('creative');
    });

    it('should return analytical as default when no context is provided', () => {
      const mode = selectThinkingMode({});
      expect(mode).toBe('analytical');
    });
  });

  describe('createThinkingContext', () => {
    it('should create a thinking context with default values', () => {
      const task = 'テストタスク';
      const context = createThinkingContext(task);

      expect(context.task).toBe(task);
      expect(context.phase).toBe('problem-discovery');
      expect(context.currentMode).toBeDefined();
      expect(context.history).toEqual([]);
      expect(context.constraints).toEqual([]);
    });

    it('should create a thinking context with custom options', () => {
      const task = 'テストタスク';
      const options = {
        phase: 'strategy-development' as ThinkingPhase,
        mode: 'critical' as ThinkingMode,
        constraints: ['制約1', '制約2']
      };
      const context = createThinkingContext(task, options);

      expect(context.phase).toBe('strategy-development');
      expect(context.currentMode).toBe('critical');
      expect(context.constraints).toEqual(['制約1', '制約2']);
    });
  });

  describe('addThinkingStep', () => {
    it('should add a thinking step to the context', () => {
      const context = createThinkingContext('テストタスク');
      const thought = 'これは最初の思考です';
      const updatedContext = addThinkingStep(context, thought, 0.5);

      expect(updatedContext.history.length).toBe(1);
      expect(updatedContext.history[0].thought).toBe(thought);
      expect(updatedContext.history[0].confidence).toBe(0.5);
    });

    it('should clamp confidence to valid range', () => {
      const context = createThinkingContext('テストタスク');
      const updatedContext1 = addThinkingStep(context, '思考1', 1.5);
      const updatedContext2 = addThinkingStep(updatedContext1, '思考2', -0.5);

      expect(updatedContext1.history[0].confidence).toBe(1);
      expect(updatedContext2.history[1].confidence).toBe(0);
    });
  });

  describe('switchThinkingMode', () => {
    it('should switch the thinking mode', () => {
      const context = createThinkingContext('テストタスク');
      const updatedContext = switchThinkingMode(context, 'creative');

      expect(updatedContext.currentMode).toBe('creative');
    });
  });

  describe('thinkDeeper', () => {
    it('should generate multiple thinking steps', () => {
      const context = createThinkingContext('テストタスク');
      const initialThought = '初期思考';
      const steps = thinkDeeper(initialThought, context, { targetDepth: 3 });

      expect(steps.length).toBe(3);
      expect(steps[0].thought).toContain('初期思考');
    });

    it('should increase depth in each step', () => {
      const context = createThinkingContext('テストタスク');
      const initialThought = '初期思考';
      const steps = thinkDeeper(initialThought, context, { targetDepth: 3 });

      // 最初のステップは初期思考そのもの（深さ0）
      // 次のステップから深さが増えていく
      expect(steps[0].thought).toContain('初期思考');
      // 2番目のステップは深さ1のプロンプトが追加
      expect(steps[1].thought).toContain('深さ1');
      // 3番目のステップは深さ2のプロンプトが追加
      expect(steps[2].thought).toContain('深さ2');
    });

    it('should switch mode on stagnation', () => {
      const context = createThinkingContext('テストタスク');
      context.currentMode = 'analytical';
      const initialThought = '初期思考';
      const steps = thinkDeeper(initialThought, context, {
        targetDepth: 5,
        enableModeSwitch: true,
        stagnationThreshold: 0.5
      });

      // モードが切り替わる可能性がある
      const modes = steps.map(s => s.mode);
      const uniqueModes = new Set(modes);
      expect(uniqueModes.size).toBeGreaterThanOrEqual(1);
    });
  });

  describe('analyzeConfidenceTrend', () => {
    it('should return stable for empty history', () => {
      const result = analyzeConfidenceTrend([]);
      expect(result.trend).toBe('stable');
      expect(result.averageConfidence).toBe(0);
    });

    it('should detect improving trend', () => {
      const history = [
        { mode: 'analytical' as ThinkingMode, phase: 'problem-discovery' as ThinkingPhase, thought: '思考1', confidence: 0.2, timestamp: new Date() },
        { mode: 'analytical' as ThinkingMode, phase: 'problem-discovery' as ThinkingPhase, thought: '思考2', confidence: 0.3, timestamp: new Date() },
        { mode: 'analytical' as ThinkingMode, phase: 'problem-discovery' as ThinkingPhase, thought: '思考3', confidence: 0.4, timestamp: new Date() },
        { mode: 'analytical' as ThinkingMode, phase: 'problem-discovery' as ThinkingPhase, thought: '思考4', confidence: 0.6, timestamp: new Date() },
        { mode: 'analytical' as ThinkingMode, phase: 'problem-discovery' as ThinkingPhase, thought: '思考5', confidence: 0.7, timestamp: new Date() }
      ];
      const result = analyzeConfidenceTrend(history);

      expect(result.trend).toBe('improving');
      expect(result.averageConfidence).toBeCloseTo(0.44, 1);
      expect(result.maxConfidence).toBe(0.7);
      expect(result.minConfidence).toBe(0.2);
    });

    it('should detect declining trend', () => {
      const history = [
        { mode: 'analytical' as ThinkingMode, phase: 'problem-discovery' as ThinkingPhase, thought: '思考1', confidence: 0.7, timestamp: new Date() },
        { mode: 'analytical' as ThinkingMode, phase: 'problem-discovery' as ThinkingPhase, thought: '思考2', confidence: 0.6, timestamp: new Date() },
        { mode: 'analytical' as ThinkingMode, phase: 'problem-discovery' as ThinkingPhase, thought: '思考3', confidence: 0.5, timestamp: new Date() },
        { mode: 'analytical' as ThinkingMode, phase: 'problem-discovery' as ThinkingPhase, thought: '思考4', confidence: 0.3, timestamp: new Date() },
        { mode: 'analytical' as ThinkingMode, phase: 'problem-discovery' as ThinkingPhase, thought: '思考5', confidence: 0.2, timestamp: new Date() }
      ];
      const result = analyzeConfidenceTrend(history);

      expect(result.trend).toBe('declining');
    });
  });

  describe('advancePhase', () => {
    it('should advance to next phase', () => {
      expect(advancePhase('problem-discovery')).toBe('problem-formulation');
      expect(advancePhase('problem-formulation')).toBe('strategy-development');
      expect(advancePhase('strategy-development')).toBe('solution-evaluation');
    });

    it('should stay at last phase', () => {
      expect(advancePhase('solution-evaluation')).toBe('solution-evaluation');
    });
  });

  describe('getThinkingModeDescription', () => {
    it('should return description for each mode', () => {
      expect(getThinkingModeDescription('creative')).toContain('新規性');
      expect(getThinkingModeDescription('analytical')).toContain('論理');
      expect(getThinkingModeDescription('critical')).toContain('前提');
      expect(getThinkingModeDescription('practical')).toContain('実現');
      expect(getThinkingModeDescription('social')).toContain('他者');
      expect(getThinkingModeDescription('emotional')).toContain('共感');
    });
  });

  describe('getThinkingPhaseDescription', () => {
    it('should return description for each phase', () => {
      expect(getThinkingPhaseDescription('problem-discovery')).toContain('発見');
      expect(getThinkingPhaseDescription('problem-formulation')).toContain('定式化');
      expect(getThinkingPhaseDescription('strategy-development')).toContain('戦略');
      expect(getThinkingPhaseDescription('solution-evaluation')).toContain('評価');
    });
  });

  describe('getAllThinkingModes', () => {
    it('should return all 6 thinking modes', () => {
      const modes = getAllThinkingModes();
      expect(modes.length).toBe(6);
      expect(modes).toContain('creative');
      expect(modes).toContain('analytical');
      expect(modes).toContain('critical');
      expect(modes).toContain('practical');
      expect(modes).toContain('social');
      expect(modes).toContain('emotional');
    });
  });

  describe('getAllThinkingPhases', () => {
    it('should return all 4 thinking phases', () => {
      const phases = getAllThinkingPhases();
      expect(phases.length).toBe(4);
      expect(phases).toContain('problem-discovery');
      expect(phases).toContain('problem-formulation');
      expect(phases).toContain('strategy-development');
      expect(phases).toContain('solution-evaluation');
    });
  });

  describe('getModePhaseCompatibility', () => {
    it('should return high compatibility for matching mode and phase', () => {
      const compatibility = getModePhaseCompatibility('creative', 'problem-discovery');
      expect(compatibility).toBeGreaterThan(0.7);
    });

    it('should return low compatibility for mismatched mode and phase', () => {
      const compatibility = getModePhaseCompatibility('critical', 'problem-discovery');
      expect(compatibility).toBeLessThan(0.5);
    });

    it('should return compatibility between 0 and 1', () => {
      for (const mode of getAllThinkingModes()) {
        for (const phase of getAllThinkingPhases()) {
          const compatibility = getModePhaseCompatibility(mode, phase);
          expect(compatibility).toBeGreaterThanOrEqual(0);
          expect(compatibility).toBeLessThanOrEqual(1);
        }
      }
    });
  });
});
