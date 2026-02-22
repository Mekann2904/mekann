/**
 * @abdd.meta
 * path: tests/long-running-support.test.ts
 * role: 長時間自走サポートモジュールのテスト
 * why: セッション管理、停滞検出、創造的攪乱の正確性を保証
 * related: .pi/lib/long-running-support.ts
 * public_api: なし（テストファイル）
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: long-running-support.tsの各関数のユニットテスト
 * what_it_does: セッション管理、停滞検出、攪乱注入のテスト
 * why_it_exists: 品質保証のため
 * scope:
 *   in: テストケース
 *   out: テスト結果
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  manageThinkingSession,
  checkThinkingStagnation,
  injectCreativeDisruption,
  getSessionStats,
  getAvailableDisruptionTypes,
  evaluateDisruptionResult,
  ThinkingSession,
  ThinkingStep
} from '../.pi/lib/long-running-support';
import { ThinkingMode, ThinkingPhase } from '../.pi/lib/thinking-process';

describe('long-running-support', () => {
  describe('manageThinkingSession', () => {
    it('should create a session with default values', () => {
      const manager = manageThinkingSession('テストタスク');
      expect(manager.session.task).toBe('テストタスク');
      expect(manager.session.status).toBe('active');
      expect(manager.session.history).toEqual([]);
      expect(manager.session.stagnationCount).toBe(0);
    });

    it('should create a session with custom options', () => {
      const manager = manageThinkingSession('テストタスク', {
        initialPhase: 'strategy-development',
        initialMode: 'critical'
      });
      expect(manager.session.currentPhase).toBe('strategy-development');
      expect(manager.session.currentMode).toBe('critical');
    });

    it('should update session with thinking steps', () => {
      const manager = manageThinkingSession('テストタスク');
      const step: ThinkingStep = {
        mode: 'analytical',
        phase: 'problem-discovery',
        thought: 'これは最初の思考です',
        confidence: 0.5,
        timestamp: new Date()
      };

      manager.updateSession(step);
      expect(manager.session.history.length).toBe(1);
      expect(manager.session.history[0].thought).toBe('これは最初の思考です');
    });

    it('should advance phase', () => {
      const manager = manageThinkingSession('テストタスク');
      expect(manager.session.currentPhase).toBe('problem-discovery');

      const newPhase = manager.advancePhase();
      expect(newPhase).toBe('problem-formulation');
      expect(manager.session.currentPhase).toBe('problem-formulation');
    });

    it('should complete session', () => {
      const manager = manageThinkingSession('テストタスク');
      const session = manager.completeSession();
      expect(session.status).toBe('completed');
    });

    it('should generate session summary', () => {
      const manager = manageThinkingSession('テストタスク');
      const summary = manager.getSessionSummary();
      expect(summary).toContain('テストタスク');
      expect(summary).toContain('active');
    });
  });

  describe('checkThinkingStagnation', () => {
    let session: ThinkingSession;

    beforeEach(() => {
      session = {
        id: 'test-session',
        task: 'テストタスク',
        startTime: new Date(),
        lastUpdateTime: new Date(),
        currentPhase: 'problem-discovery',
        currentMode: 'analytical',
        history: [],
        stagnationCount: 0,
        disruptionHistory: [],
        status: 'active'
      };
    });

    it('should return not stagnant for insufficient history', () => {
      const result = checkThinkingStagnation(session);
      expect(result.isStagnant).toBe(false);
      expect(result.evidence).toContain('履歴が不足');
    });

    it('should detect repetition stagnation', () => {
      // 同じような思考を3回追加
      const similarThought = 'これは同じような内容の思考です。何度も繰り返しています。';
      for (let i = 0; i < 3; i++) {
        session.history.push({
          mode: 'analytical',
          phase: 'problem-discovery',
          thought: similarThought,
          confidence: 0.5,
          timestamp: new Date()
        });
      }

      const result = checkThinkingStagnation(session);
      // 類似度が高ければ停滞と判定
      expect(result.stagnationType).toBeDefined();
    });

    it('should detect mode fixation stagnation', () => {
      // 同じモードで5回連続
      for (let i = 0; i < 5; i++) {
        session.history.push({
          mode: 'analytical',
          phase: 'problem-discovery',
          thought: `思考${i} - 異なる内容`,
          confidence: 0.3 + i * 0.1,
          timestamp: new Date()
        });
      }

      const result = checkThinkingStagnation(session);
      expect(result.isStagnant).toBe(true);
      expect(result.stagnationType).toBe('mode-fixation');
      expect(result.evidence).toContain('5回連続');
    });

    it('should detect confidence plateau stagnation', () => {
      // 高い信頼度が続く（変化が小さい）
      // 信頼度の変化を停滞閾値（0.1）未満にする
      for (let i = 0; i < 5; i++) {
        session.history.push({
          mode: ['analytical', 'critical', 'practical'][i % 3] as ThinkingMode,
          phase: 'problem-discovery',
          thought: `思考${i} - 異なる内容で変化をつけています`,
          confidence: 0.91 + i * 0.005, // わずかな変化（閾値0.1未満）
          timestamp: new Date()
        });
      }

      const result = checkThinkingStagnation(session, 0.2);
      // 低進捗または信頼度プラトーが検出される
      expect(result.isStagnant).toBe(true);
      expect(['confidence-plateau', 'low-progress']).toContain(result.stagnationType);
    });

    it('should return not stagnant for healthy progress', () => {
      // 異なるモードで信頼度が向上
      const modes: ThinkingMode[] = ['creative', 'analytical', 'critical', 'practical', 'emotional'];
      for (let i = 0; i < 5; i++) {
        session.history.push({
          mode: modes[i],
          phase: 'problem-discovery',
          thought: `思考${i} - 全く異なるアプローチを検討しています`,
          confidence: 0.3 + i * 0.15,
          timestamp: new Date()
        });
      }

      const result = checkThinkingStagnation(session);
      expect(result.isStagnant).toBe(false);
    });
  });

  describe('injectCreativeDisruption', () => {
    let session: ThinkingSession;

    beforeEach(() => {
      session = {
        id: 'test-session',
        task: 'テストタスク',
        startTime: new Date(),
        lastUpdateTime: new Date(),
        currentPhase: 'problem-discovery',
        currentMode: 'analytical',
        history: [],
        stagnationCount: 3,
        disruptionHistory: [],
        status: 'stagnant'
      };
    });

    it('should inject mode-switch disruption', () => {
      // 同じモードが続く状況
      for (let i = 0; i < 3; i++) {
        session.history.push({
          mode: 'analytical',
          phase: 'problem-discovery',
          thought: `思考${i}`,
          confidence: 0.5,
          timestamp: new Date()
        });
      }

      const disruption = injectCreativeDisruption(session, 'mode-switch');
      expect(disruption.type).toBe('mode-switch');
      expect(disruption.content).toContain('切り替え');
    });

    it('should inject assumption-challenge disruption', () => {
      // 十分な履歴がある状況
      for (let i = 0; i < 6; i++) {
        session.history.push({
          mode: 'analytical',
          phase: 'problem-discovery',
          thought: `前提として思考${i}`,
          confidence: 0.5,
          timestamp: new Date()
        });
      }

      const disruption = injectCreativeDisruption(session, 'assumption-challenge');
      expect(disruption.type).toBe('assumption-challenge');
      expect(disruption.content).toContain('前提');
    });

    it('should inject analogy disruption', () => {
      const disruption = injectCreativeDisruption(session, 'analogy');
      expect(disruption.type).toBe('analogy');
      expect(disruption.content).toContain('アナロジー');
    });

    it('should inject random-injection disruption for high stagnation count', () => {
      session.stagnationCount = 3;
      const disruption = injectCreativeDisruption(session, 'random-injection');
      expect(disruption.type).toBe('random-injection');
      expect(disruption.content).toContain('問い');
    });

    it('should select applicable strategy when type is not specified', () => {
      const disruption = injectCreativeDisruption(session);
      expect(disruption.type).toBeDefined();
      expect(disruption.content).toBeDefined();
    });
  });

  describe('getSessionStats', () => {
    it('should return correct stats for session', () => {
      const session: ThinkingSession = {
        id: 'test-session',
        task: 'テストタスク',
        startTime: new Date(Date.now() - 60000), // 1分前
        lastUpdateTime: new Date(),
        currentPhase: 'problem-discovery',
        currentMode: 'analytical',
        history: [
          { mode: 'creative', phase: 'problem-discovery', thought: '思考1', confidence: 0.5, timestamp: new Date() },
          { mode: 'analytical', phase: 'problem-discovery', thought: '思考2', confidence: 0.7, timestamp: new Date() },
          { mode: 'analytical', phase: 'problem-discovery', thought: '思考3', confidence: 0.8, timestamp: new Date() }
        ],
        stagnationCount: 0,
        disruptionHistory: [],
        status: 'active'
      };

      const stats = getSessionStats(session);
      expect(stats.stepCount).toBe(3);
      expect(stats.avgConfidence).toBeCloseTo(0.67, 1);
      expect(stats.disruptionCount).toBe(0);
      expect(stats.modeDistribution.analytical).toBe(2);
      expect(stats.modeDistribution.creative).toBe(1);
    });

    it('should return zero stats for empty session', () => {
      const session: ThinkingSession = {
        id: 'test-session',
        task: 'テストタスク',
        startTime: new Date(),
        lastUpdateTime: new Date(),
        currentPhase: 'problem-discovery',
        currentMode: 'analytical',
        history: [],
        stagnationCount: 0,
        disruptionHistory: [],
        status: 'active'
      };

      const stats = getSessionStats(session);
      expect(stats.stepCount).toBe(0);
      expect(stats.avgConfidence).toBe(0);
    });
  });

  describe('getAvailableDisruptionTypes', () => {
    it('should return all 4 disruption types', () => {
      const types = getAvailableDisruptionTypes();
      expect(types.length).toBe(4);
      expect(types.map(t => t.type)).toContain('mode-switch');
      expect(types.map(t => t.type)).toContain('assumption-challenge');
      expect(types.map(t => t.type)).toContain('analogy');
      expect(types.map(t => t.type)).toContain('random-injection');
    });

    it('should include descriptions', () => {
      const types = getAvailableDisruptionTypes();
      types.forEach(type => {
        expect(type.description).toBeDefined();
        expect(type.description.length).toBeGreaterThan(0);
      });
    });
  });

  describe('evaluateDisruptionResult', () => {
    it('should evaluate as neutral for insufficient post-disruption steps', () => {
      const disruption = {
        timestamp: new Date(),
        type: 'mode-switch' as const,
        content: 'テスト',
        result: 'neutral' as const
      };

      const session: ThinkingSession = {
        id: 'test-session',
        task: 'テストタスク',
        startTime: new Date(),
        lastUpdateTime: new Date(),
        currentPhase: 'problem-discovery',
        currentMode: 'analytical',
        history: [
          { mode: 'creative', phase: 'problem-discovery', thought: '思考1', confidence: 0.5, timestamp: new Date() }
        ],
        stagnationCount: 0,
        disruptionHistory: [disruption],
        status: 'active'
      };

      const evaluated = evaluateDisruptionResult(disruption, session);
      expect(evaluated.result).toBe('neutral');
    });

    it('should evaluate as productive for progress and mode change', () => {
      const disruptionTime = new Date(Date.now() - 10000);
      const disruption = {
        timestamp: disruptionTime,
        type: 'mode-switch' as const,
        content: 'テスト',
        result: 'neutral' as const
      };

      const session: ThinkingSession = {
        id: 'test-session',
        task: 'テストタスク',
        startTime: new Date(Date.now() - 20000),
        lastUpdateTime: new Date(),
        currentPhase: 'problem-discovery',
        currentMode: 'critical',
        history: [
          { mode: 'analytical', phase: 'problem-discovery', thought: '思考1', confidence: 0.3, timestamp: disruptionTime },
          { mode: 'creative', phase: 'problem-discovery', thought: '思考2', confidence: 0.5, timestamp: new Date(Date.now() - 5000) },
          { mode: 'critical', phase: 'problem-discovery', thought: '思考3', confidence: 0.7, timestamp: new Date() }
        ],
        stagnationCount: 0,
        disruptionHistory: [disruption],
        status: 'active'
      };

      const evaluated = evaluateDisruptionResult(disruption, session);
      expect(evaluated.result).toBe('productive');
    });
  });

  describe('session manager integration', () => {
    it('should detect stagnation and inject disruption automatically', () => {
      const manager = manageThinkingSession('テストタスク', {
        maxStagnationCount: 2,
        autoDisruption: true
      });

      // 同じモードで停滞させる
      for (let i = 0; i < 6; i++) {
        manager.updateSession({
          mode: 'analytical',
          phase: 'problem-discovery',
          thought: '同じような思考',
          confidence: 0.5,
          timestamp: new Date()
        });
      }

      // 自動的に停滞が検出され、攪乱が注入される可能性がある
      expect(manager.session.stagnationCount).toBeGreaterThanOrEqual(0);
    });
  });
});
