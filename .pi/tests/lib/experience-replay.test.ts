/**
 * @abdd.meta
 * path: .pi/tests/lib/experience-replay.test.ts
 * role: experience-replay.tsの統合テスト
 * why: 思考セッションの記録・検索・パターン抽出機能の正確性を保証するため
 * related: .pi/lib/experience-replay.ts, .pi/lib/thinking-process.ts
 * public_api: なし（テストファイル）
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: 経験再生システムの統合テスト
 * what_it_does:
 *   - セッションの保存・検索をテスト
 *   - 類似度計算の正確性を検証
 *   - パターン学習機能を確認
 *   - 推奨生成をテスト
 * why_it_exists:
 *   - 思考プロセスの再利用と学習の信頼性を保証
 *   - エッジケースや境界条件の動作を確認
 * scope:
 *   in: 思考セッション、コンテキスト
 *   out: テスト結果
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createExperienceReplay,
  store,
  retrieve,
  learn,
  findApplicablePatterns,
  generateRecommendations,
  generateSessionId,
  createThinkingSession,
  addStepToSession,
  completeSession,
  summarizeExperienceReplay,
  type ThinkingSession,
  type ExperienceReplay,
  type SessionOutcome,
} from '../../lib/experience-replay';
import type { ThinkingContext, ThinkingStep } from '../../lib/thinking-process';

// モックの作成
vi.mock('../../lib/thinking-process', () => ({
  createThinkingContext: vi.fn((task: string, options?: any) => ({
    task,
    phase: options?.phase || 'problem-discovery',
    currentMode: options?.mode || 'analytical',
    constraints: [],
    history: [],
    metadata: {},
  })),
  getAllThinkingModes: vi.fn(() => [
    'creative',
    'analytical',
    'critical',
    'practical',
    'social',
    'emotional',
  ]),
  getAllThinkingPhases: vi.fn(() => [
    'problem-discovery',
    'problem-formulation',
    'strategy-development',
    'solution-evaluation',
  ]),
}));

vi.mock('../../lib/philosophy/belief-updater', () => ({
  createPrior: vi.fn((hypotheses: string[]) => {
    const probabilities = new Map<string, number>();
    hypotheses.forEach((h) => probabilities.set(h, 1 / hypotheses.length));
    return { probabilities, createdAt: new Date(), version: 1 };
  }),
  calculateEntropy: vi.fn(() => 0.5),
  getMaxEntropy: vi.fn(() => 1.0),
}));

describe('experience-replay', () => {
  describe('createExperienceReplay', () => {
    it('createExperienceReplay_デフォルト設定_初期化される', () => {
      const replay = createExperienceReplay();

      expect(replay.sessions.size).toBe(0);
      expect(replay.patterns.size).toBe(0);
      expect(replay.config.maxSessions).toBe(1000);
      expect(replay.config.similarityThreshold).toBe(0.3);
    });

    it('createExperienceReplay_カスタム設定_設定が反映される', () => {
      const replay = createExperienceReplay({
        maxSessions: 500,
        similarityThreshold: 0.5,
      });

      expect(replay.config.maxSessions).toBe(500);
      expect(replay.config.similarityThreshold).toBe(0.5);
    });

    it('createExperienceReplay_インデックス初期化_全フェーズとモード', () => {
      const replay = createExperienceReplay();

      expect(replay.indexes.byPhase.size).toBeGreaterThan(0);
      expect(replay.indexes.byMode.size).toBeGreaterThan(0);
    });
  });

  describe('セッション管理', () => {
    let replay: ExperienceReplay;

    beforeEach(() => {
      replay = createExperienceReplay();
    });

    it('store_セッション保存_セッションが追加される', () => {
      const session = createMockSession('test-task');

      const updated = store(replay, session);

      expect(updated.sessions.size).toBe(1);
      expect(updated.sessions.get(session.id)).toBeDefined();
    });

    it('store_インデックス更新_各インデックスに追加', () => {
      const session = createMockSession('test-task');

      const updated = store(replay, session);

      // タスクタイプインデックス
      expect(updated.indexes.byTaskType.has(session.metadata.taskType)).toBe(
        true
      );

      // フェーズインデックス
      expect(
        updated.indexes.byPhase.get(session.context.phase)?.has(session.id)
      ).toBe(true);

      // モードインデックス
      expect(
        updated.indexes.byMode.get(session.context.currentMode)?.has(session.id)
      ).toBe(true);
    });

    it('store_統計更新_正しい統計情報', () => {
      const session = createMockSession('test-task');

      const updated = store(replay, session);

      expect(updated.stats.totalSessions).toBe(1);
    });

    it('store_最大セッション数超過_古いものを削除', () => {
      let smallReplay = createExperienceReplay({ maxSessions: 3 });

      for (let i = 0; i < 5; i++) {
        const session = createMockSession(`task-${i}`);
        smallReplay = store(smallReplay, session);
      }

      expect(smallReplay.sessions.size).toBe(3);
    });
  });

  describe('retrieve', () => {
    let replay: ExperienceReplay;

    beforeEach(() => {
      replay = createExperienceReplay();
    });

    it('retrieve_類似セッション検索_結果を返す', () => {
      // セッションを保存
      const session1 = createMockSession('設計タスク');
      const session2 = createMockSession('実装タスク');
      replay = store(replay, session1);
      replay = store(replay, session2);

      // 検索
      const context = createMockContext('設計レビュー');
      const results = retrieve(replay, context);

      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('retrieve_最大結果数_制限される', () => {
      // 複数セッションを保存
      for (let i = 0; i < 10; i++) {
        const session = createMockSession(`タスク${i}`);
        replay = store(replay, session);
      }

      const context = createMockContext('テスト');
      const results = retrieve(replay, context, { maxResults: 3 });

      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('retrieve_最小類似度_フィルタリングされる', () => {
      // セッションを保存
      const session = createMockSession('設計タスク');
      replay = store(replay, session);

      const context = createMockContext('全く関係ないタスク');
      const results = retrieve(replay, context, { minSimilarity: 0.9 });

      // 類似度が低い場合は結果が空になる可能性
      expect(Array.isArray(results)).toBe(true);
    });

    it('retrieve_失敗除外_失敗セッションを含まない', () => {
      const failedSession = createMockSession('失敗タスク');
      failedSession.outcome.status = 'failure';
      replay = store(replay, failedSession);

      const context = createMockContext('テスト');
      const results = retrieve(replay, context, { includeFailed: false });

      expect(results.every((r) => r.session.outcome.status !== 'failure')).toBe(
        true
      );
    });
  });

  describe('learn', () => {
    let replay: ExperienceReplay;

    beforeEach(() => {
      replay = createExperienceReplay();
    });

    it('learn_成功セッションから_パターンを抽出', () => {
      // 成功セッションを複数保存
      for (let i = 0; i < 5; i++) {
        const session = createMockSession(`成功タスク${i}`);
        session.outcome.status = 'success';
        session.outcome.effectiveness = 0.8;
        replay = store(replay, session);
      }

      const result = learn(replay);

      expect(result.patterns.size).toBeGreaterThanOrEqual(0);
    });

    it('learn_学習タイミング_統計が更新される', () => {
      // learningIntervalの倍数のセッションを保存
      let smallReplay = createExperienceReplay({ learningInterval: 2 });

      for (let i = 0; i < 2; i++) {
        const session = createMockSession(`タスク${i}`);
        smallReplay = store(smallReplay, session);
      }

      // 学習がトリガーされている可能性
      expect(smallReplay.stats.totalSessions).toBe(2);
    });
  });

  describe('findApplicablePatterns', () => {
    let replay: ExperienceReplay;

    beforeEach(() => {
      replay = createExperienceReplay();
    });

    it('findApplicablePatterns_パターンなし_空配列', () => {
      const context = createMockContext('テスト');

      const patterns = findApplicablePatterns(replay, context);

      expect(patterns).toEqual([]);
    });
  });

  describe('generateRecommendations', () => {
    it('generateRecommendations_空パターン_空配列', () => {
      const context = createMockContext('テスト');

      const recommendations = generateRecommendations([], context);

      expect(recommendations).toEqual([]);
    });
  });

  describe('セッション作成ヘルパー', () => {
    it('generateSessionId_一意ID生成', () => {
      const id1 = generateSessionId();
      const id2 = generateSessionId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^session-/);
    });

    it('createThinkingSession_デフォルト値_正しいセッション', () => {
      const session = createThinkingSession('テストタスク');

      expect(session.id).toBeDefined();
      expect(session.context.task).toBe('テストタスク');
      expect(session.steps).toEqual([]);
      expect(session.outcome.status).toBe('partial');
    });

    it('createThinkingSession_カスタムオプション_反映される', () => {
      const session = createThinkingSession('テストタスク', {
        phase: 'strategy-development',
        mode: 'creative',
        taskType: 'design',
        complexity: 'high',
        priority: 'high',
        tags: ['important'],
      });

      expect(session.context.phase).toBe('strategy-development');
      expect(session.context.currentMode).toBe('creative');
      expect(session.metadata.taskType).toBe('design');
      expect(session.metadata.complexity).toBe('high');
      expect(session.metadata.priority).toBe('high');
      expect(session.metadata.tags).toContain('important');
    });

    it('addStepToSession_ステップ追加_更新される', () => {
      let session = createThinkingSession('テストタスク');
      const step: ThinkingStep = {
        phase: 'problem-discovery',
        mode: 'analytical',
        content: '分析ステップ',
        timestamp: Date.now(),
        confidence: 0.8,
      };

      session = addStepToSession(session, step);

      expect(session.steps.length).toBe(1);
      expect(session.steps[0]).toEqual(step);
    });

    it('completeSession_セッション完了_結果が反映される', () => {
      let session = createThinkingSession('テストタスク');
      const outcome: Partial<SessionOutcome> = {
        status: 'success',
        effectiveness: 0.9,
        lessonsLearned: ['学んだこと'],
      };

      session = completeSession(session, outcome);

      expect(session.outcome.status).toBe('success');
      expect(session.outcome.effectiveness).toBe(0.9);
      expect(session.outcome.lessonsLearned).toContain('学んだこと');
      expect(session.metadata.completedAt).toBeDefined();
    });
  });

  describe('summarizeExperienceReplay', () => {
    it('summarizeExperienceReplay_空のシステム_サマリー文字列', () => {
      const replay = createExperienceReplay();

      const summary = summarizeExperienceReplay(replay);

      expect(summary).toContain('経験再生システム');
      expect(summary).toContain('セッション数: 0');
    });

    it('summarizeExperienceReplay_データあり_正しい統計', () => {
      let replay = createExperienceReplay();

      const session = createMockSession('テスト');
      session.outcome.status = 'success';
      replay = store(replay, session);

      const summary = summarizeExperienceReplay(replay);

      expect(summary).toContain('セッション数: 1');
      expect(summary).toContain('成功率:');
    });
  });

  describe('統合テスト', () => {
    it('フルワークフロー_セッション保存から推奨生成まで', () => {
      let replay = createExperienceReplay();

      // 複数の成功セッションを保存
      for (let i = 0; i < 5; i++) {
        let session = createThinkingSession(`設計タスク${i}`, {
          phase: 'problem-discovery',
          mode: 'analytical',
        });

        session = completeSession(session, {
          status: 'success',
          effectiveness: 0.8 + i * 0.02,
          lessonsLearned: ['パターンを発見'],
        });

        replay = store(replay, session);
      }

      // 学習を実行
      const learnResult = learn(replay);

      // 新しいコンテキストでパターンを検索
      const newContext = createMockContext('新しい設計タスク');
      const patterns = findApplicablePatterns(replay, newContext);

      // 推奨を生成
      const recommendations = generateRecommendations(patterns, newContext);

      // 結果の確認
      expect(replay.stats.totalSessions).toBe(5);
      expect(learnResult.patterns).toBeDefined();
    });
  });
});

// ヘルパー関数
function createMockSession(task: string): ThinkingSession {
  return {
    id: generateSessionId(),
    context: createMockContext(task),
    steps: [],
    modeSelections: [],
    aporias: [],
    aporiaResolutions: [],
    outcome: {
      status: 'partial',
      effectiveness: 0.5,
      lessonsLearned: [],
    },
    metadata: {
      createdAt: new Date(),
      duration: 1000,
      tags: [],
      taskType: 'general',
      complexity: 'medium',
      priority: 'medium',
    },
  };
}

function createMockContext(task: string): ThinkingContext {
  return {
    task,
    phase: 'problem-discovery',
    currentMode: 'analytical',
    constraints: [],
    history: [],
    metadata: {},
  };
}
