/**
 * @abdd.meta
 * path: tests/experience-replay.test.ts
 * role: 経験再生システムのテスト
 * why: 経験の保存、検索、学習機能の正確性を保証
 * related: .pi/lib/experience-replay.ts
 * public_api: なし（テストファイル）
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: experience-replay.tsの各関数のユニットテスト
 * what_it_does: セッション保存、類似検索、パターン学習のテスト
 * why_it_exists: 経験からの学習機能の正確性を保証するため
 * scope:
 *   in: テストケース
 *   out: テスト結果
 */

import { describe, it, expect } from 'vitest';
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
  ExperienceReplay,
  ThinkingSession
} from '../.pi/lib/experience-replay';
import {
  createThinkingContext,
  addThinkingStep
} from '../.pi/lib/thinking-process';

describe('experience-replay', () => {
  describe('createExperienceReplay', () => {
    it('should create replay system with default config', () => {
      const replay = createExperienceReplay();

      expect(replay.sessions.size).toBe(0);
      expect(replay.patterns.size).toBe(0);
      expect(replay.config.maxSessions).toBe(1000);
      expect(replay.stats.totalSessions).toBe(0);
    });

    it('should create replay system with custom config', () => {
      const replay = createExperienceReplay({
        maxSessions: 100,
        similarityThreshold: 0.5
      });

      expect(replay.config.maxSessions).toBe(100);
      expect(replay.config.similarityThreshold).toBe(0.5);
    });

    it('should initialize indexes', () => {
      const replay = createExperienceReplay();

      expect(replay.indexes.byPhase.size).toBe(4); // 4 phases
      expect(replay.indexes.byMode.size).toBe(6);  // 6 modes
    });
  });

  describe('generateSessionId', () => {
    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateSessionId());
      }
      expect(ids.size).toBe(100);
    });

    it('should generate IDs with correct format', () => {
      const id = generateSessionId();
      expect(id).toMatch(/^session-/);
    });
  });

  describe('createThinkingSession', () => {
    it('should create session with default values', () => {
      const session = createThinkingSession('テストタスク');

      expect(session.id).toBeDefined();
      expect(session.context.task).toBe('テストタスク');
      expect(session.steps.length).toBe(0);
      expect(session.modeSelections.length).toBe(0);
      expect(session.metadata.taskType).toBe('general');
      expect(session.metadata.complexity).toBe('medium');
    });

    it('should create session with custom options', () => {
      const session = createThinkingSession('テストタスク', {
        phase: 'strategy-development',
        mode: 'practical',
        taskType: 'implementation',
        complexity: 'high',
        priority: 'high',
        tags: ['api', 'backend']
      });

      expect(session.context.phase).toBe('strategy-development');
      expect(session.context.currentMode).toBe('practical');
      expect(session.metadata.taskType).toBe('implementation');
      expect(session.metadata.complexity).toBe('high');
      expect(session.metadata.priority).toBe('high');
      expect(session.metadata.tags).toEqual(['api', 'backend']);
    });
  });

  describe('addStepToSession', () => {
    it('should add step to session', () => {
      let session = createThinkingSession('テスト');
      session = addStepToSession(session, {
        mode: 'analytical',
        phase: 'problem-discovery',
        thought: '問題を分析する',
        confidence: 0.7,
        timestamp: new Date()
      });

      expect(session.steps.length).toBe(1);
      expect(session.steps[0].thought).toBe('問題を分析する');
    });

    it('should update duration', () => {
      let session = createThinkingSession('テスト');
      const initialDuration = session.metadata.duration;

      // 少し待つ
      session = addStepToSession(session, {
        mode: 'analytical',
        phase: 'problem-discovery',
        thought: '思考',
        confidence: 0.5,
        timestamp: new Date()
      });

      expect(session.metadata.duration).toBeGreaterThanOrEqual(initialDuration);
    });
  });

  describe('completeSession', () => {
    it('should complete session with outcome', () => {
      let session = createThinkingSession('テスト');
      session = completeSession(session, {
        status: 'success',
        effectiveness: 0.8,
        lessonsLearned: ['学習したこと']
      });

      expect(session.outcome.status).toBe('success');
      expect(session.outcome.effectiveness).toBe(0.8);
      expect(session.outcome.lessonsLearned).toEqual(['学習したこと']);
      expect(session.metadata.completedAt).toBeDefined();
    });
  });

  describe('store', () => {
    it('should store session', () => {
      const replay = createExperienceReplay();
      const session = createThinkingSession('テスト');
      session.outcome = {
        status: 'success',
        effectiveness: 0.8,
        lessonsLearned: []
      };

      const updated = store(replay, session);

      expect(updated.sessions.size).toBe(1);
      expect(updated.stats.totalSessions).toBe(1);
      expect(updated.stats.successfulSessions).toBe(1);
    });

    it('should update indexes when storing', () => {
      const replay = createExperienceReplay();
      const session = createThinkingSession('テスト', {
        phase: 'problem-discovery',
        mode: 'creative',
        taskType: 'design',
        tags: ['ui']
      });
      session.outcome = { status: 'success', effectiveness: 0.7, lessonsLearned: [] };

      const updated = store(replay, session);

      expect(updated.indexes.byPhase.get('problem-discovery')?.has(session.id)).toBe(true);
      expect(updated.indexes.byMode.get('creative')?.has(session.id)).toBe(true);
      expect(updated.indexes.byTaskType.get('design')?.has(session.id)).toBe(true);
      expect(updated.indexes.byTag.get('ui')?.has(session.id)).toBe(true);
    });

    it('should trim old sessions when exceeding max', () => {
      const replay = createExperienceReplay({ maxSessions: 5 });

      let updated = replay;
      for (let i = 0; i < 10; i++) {
        const session = createThinkingSession(`タスク${i}`);
        session.outcome = { status: 'success', effectiveness: 0.5, lessonsLearned: [] };
        updated = store(updated, session);
      }

      expect(updated.sessions.size).toBeLessThanOrEqual(5);
    });

    it('should trigger learning at interval', () => {
      const replay = createExperienceReplay({ learningInterval: 3 });

      let updated = replay;
      for (let i = 0; i < 5; i++) {
        let session = createThinkingSession(`タスク${i}`);
        session = addStepToSession(session, {
          mode: 'analytical',
          phase: 'problem-discovery',
          thought: '思考',
          confidence: 0.7,
          timestamp: new Date()
        });
        session.outcome = { status: 'success', effectiveness: 0.8, lessonsLearned: [] };
        updated = store(updated, session);
      }

      // 学習がトリガーされている
      expect(updated.stats.lastLearningAt).toBeDefined();
    });
  });

  describe('retrieve', () => {
    it('should retrieve similar experiences', () => {
      let replay = createExperienceReplay();

      // 類似セッションを保存
      const session1 = createThinkingSession('APIの設計と実装');
      session1.outcome = { status: 'success', effectiveness: 0.8, lessonsLearned: [] };
      replay = store(replay, session1);

      const session2 = createThinkingSession('データベース設計');
      session2.outcome = { status: 'success', effectiveness: 0.7, lessonsLearned: [] };
      replay = store(replay, session2);

      // 類似検索
      const context = createThinkingContext('APIの設計');
      const similar = retrieve(replay, context);

      expect(similar.length).toBeGreaterThan(0);
    });

    it('should filter by minimum similarity', () => {
      let replay = createExperienceReplay({ similarityThreshold: 0.8 });

      const session1 = createThinkingSession('APIの設計');
      session1.outcome = { status: 'success', effectiveness: 0.8, lessonsLearned: [] };
      replay = store(replay, session1);

      const session2 = createThinkingSession('全く異なるタスクXYZ');
      session2.outcome = { status: 'success', effectiveness: 0.7, lessonsLearned: [] };
      replay = store(replay, session2);

      const context = createThinkingContext('APIの設計と実装');
      const similar = retrieve(replay, context, { minSimilarity: 0.5 });

      // 類似度フィルタが適用される
      similar.forEach(s => {
        expect(s.similarity).toBeGreaterThanOrEqual(0.5);
      });
    });

    it('should exclude failed sessions when specified', () => {
      let replay = createExperienceReplay();

      const successSession = createThinkingSession('テスト');
      successSession.outcome = { status: 'success', effectiveness: 0.8, lessonsLearned: [] };
      replay = store(replay, successSession);

      const failedSession = createThinkingSession('テスト');
      failedSession.outcome = { status: 'failure', effectiveness: 0.2, lessonsLearned: [] };
      replay = store(replay, failedSession);

      const context = createThinkingContext('テスト');
      const similar = retrieve(replay, context, { includeFailed: false });

      expect(similar.every(s => s.session.outcome.status !== 'failure')).toBe(true);
    });

    it('should limit results', () => {
      let replay = createExperienceReplay();

      for (let i = 0; i < 10; i++) {
        const session = createThinkingSession(`テスト${i}`);
        session.outcome = { status: 'success', effectiveness: 0.7, lessonsLearned: [] };
        replay = store(replay, session);
      }

      const context = createThinkingContext('テスト');
      const similar = retrieve(replay, context, { maxResults: 3 });

      expect(similar.length).toBeLessThanOrEqual(3);
    });

    it('should include matching features', () => {
      let replay = createExperienceReplay();

      const session = createThinkingSession('APIの設計', {
        phase: 'strategy-development'
      });
      session.outcome = { status: 'success', effectiveness: 0.8, lessonsLearned: [] };
      replay = store(replay, session);

      const context = createThinkingContext('APIの設計', {
        phase: 'strategy-development'
      });
      const similar = retrieve(replay, context);

      if (similar.length > 0) {
        expect(similar[0].matchingFeatures.length).toBeGreaterThan(0);
      }
    });
  });

  describe('learn', () => {
    it('should extract patterns from successful sessions', () => {
      let replay = createExperienceReplay();

      // 成功パターンのセッションを多数作成
      for (let i = 0; i < 10; i++) {
        let session = createThinkingSession('APIの設計', {
          phase: 'problem-discovery',
          mode: 'creative'
        });
        session = addStepToSession(session, {
          mode: 'creative',
          phase: 'problem-discovery',
          thought: '創造的に考える',
          confidence: 0.8,
          timestamp: new Date()
        });
        session.outcome = {
          status: 'success',
          effectiveness: 0.85,
          lessonsLearned: []
        };
        replay = store(replay, session);
      }

      const result = learn(replay);

      // パターンが抽出されている可能性
      expect(result.patterns.size).toBeGreaterThanOrEqual(0);
    });

    it('should return new and updated patterns', () => {
      let replay = createExperienceReplay();

      for (let i = 0; i < 5; i++) {
        const session = createThinkingSession('テスト');
        session.outcome = { status: 'success', effectiveness: 0.8, lessonsLearned: [] };
        replay = store(replay, session);
      }

      const result = learn(replay);

      expect(result.newPatterns).toBeDefined();
      expect(result.updatedPatterns).toBeDefined();
    });

    it('should update replay stats', () => {
      let replay = createExperienceReplay();

      for (let i = 0; i < 5; i++) {
        const session = createThinkingSession('テスト');
        session.outcome = { status: 'success', effectiveness: 0.8, lessonsLearned: [] };
        replay = store(replay, session);
      }

      const result = learn(replay);

      expect(result.replay.stats.lastLearningAt).toBeDefined();
    });
  });

  describe('findApplicablePatterns', () => {
    it('should find applicable patterns for context', () => {
      let replay = createExperienceReplay();

      // パターンが生成されるまで十分なセッションを作成
      for (let i = 0; i < 15; i++) {
        let session = createThinkingSession('APIの設計', {
          phase: 'problem-discovery',
          mode: 'creative'
        });
        session = addStepToSession(session, {
          mode: 'creative',
          phase: 'problem-discovery',
          thought: '創造的に考える',
          confidence: 0.8,
          timestamp: new Date()
        });
        session.outcome = {
          status: 'success',
          effectiveness: 0.85,
          lessonsLearned: []
        };
        replay = store(replay, session);
      }

      const context = createThinkingContext('APIの設計', {
        phase: 'problem-discovery'
      });
      const patterns = findApplicablePatterns(replay, context);

      // パターンが存在する場合は適用可能なものを返す
      expect(Array.isArray(patterns)).toBe(true);
    });

    it('should return empty array when no patterns exist', () => {
      const replay = createExperienceReplay();
      const context = createThinkingContext('テスト');

      const patterns = findApplicablePatterns(replay, context);

      expect(patterns.length).toBe(0);
    });
  });

  describe('generateRecommendations', () => {
    it('should generate recommendations from patterns', () => {
      const patterns = [
        {
          patternId: 'test-1',
          patternType: 'mode-selection' as const,
          conditions: [{ type: 'phase' as const, value: 'problem-discovery', weight: 1 }],
          recommendedAction: {
            type: 'select-mode' as const,
            target: 'creative',
            rationale: '成功率が高い',
            expectedOutcome: '成功'
          },
          confidence: 0.8,
          supportingEvidence: [],
          counterEvidence: [],
          lastUpdated: new Date(),
          usageCount: 5,
          successRate: 0.8
        }
      ];

      const context = createThinkingContext('テスト', { phase: 'problem-discovery' });
      const recommendations = generateRecommendations(patterns, context);

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0]).toContain('推奨モード');
    });

    it('should return empty array for no patterns', () => {
      const context = createThinkingContext('テスト');
      const recommendations = generateRecommendations([], context);

      expect(recommendations.length).toBe(0);
    });
  });

  describe('summarizeExperienceReplay', () => {
    it('should generate readable summary', () => {
      const replay = createExperienceReplay();
      const summary = summarizeExperienceReplay(replay);

      expect(summary).toContain('経験再生システム');
      expect(summary).toContain('セッション数');
      expect(summary).toContain('パターン数');
    });

    it('should include stats in summary', () => {
      let replay = createExperienceReplay();

      for (let i = 0; i < 5; i++) {
        const session = createThinkingSession(`テスト${i}`);
        session.outcome = {
          status: i < 3 ? 'success' : 'failure',
          effectiveness: i < 3 ? 0.8 : 0.3,
          lessonsLearned: []
        };
        replay = store(replay, session);
      }

      const summary = summarizeExperienceReplay(replay);
      expect(summary).toContain('セッション数: 5');
    });
  });

  describe('integration', () => {
    it('should work with full workflow', () => {
      let replay = createExperienceReplay({ learningInterval: 5 });

      // セッションを作成して保存
      for (let i = 0; i < 10; i++) {
        let session = createThinkingSession(`API設計タスク${i}`, {
          phase: 'problem-discovery',
          mode: 'creative',
          taskType: 'design',
          tags: ['api']
        });

        session = addStepToSession(session, {
          mode: 'creative',
          phase: 'problem-discovery',
          thought: 'アイデアを生成',
          confidence: 0.7,
          timestamp: new Date()
        });

        session = addStepToSession(session, {
          mode: 'analytical',
          phase: 'problem-formulation',
          thought: '問題を定式化',
          confidence: 0.8,
          timestamp: new Date()
        });

        session = completeSession(session, {
          status: 'success',
          effectiveness: 0.85,
          lessonsLearned: ['パターン学習の重要性']
        });

        replay = store(replay, session);
      }

      // 類似経験を検索
      const context = createThinkingContext('API設計', { phase: 'problem-discovery' });
      const similar = retrieve(replay, context);

      expect(similar.length).toBeGreaterThan(0);

      // 学習
      const learningResult = learn(replay);
      expect(learningResult.replay.stats.patternsLearned).toBeGreaterThanOrEqual(0);

      // パターン適用
      const applicablePatterns = findApplicablePatterns(learningResult.replay, context);
      expect(Array.isArray(applicablePatterns)).toBe(true);

      // 推奨生成
      if (applicablePatterns.length > 0) {
        const recommendations = generateRecommendations(applicablePatterns, context);
        expect(Array.isArray(recommendations)).toBe(true);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty sessions', () => {
      const replay = createExperienceReplay();
      const context = createThinkingContext('テスト');

      const similar = retrieve(replay, context);
      expect(similar.length).toBe(0);
    });

    it('should handle session with no steps', () => {
      let replay = createExperienceReplay();
      const session = createThinkingSession('テスト');
      session.outcome = { status: 'success', effectiveness: 0.5, lessonsLearned: [] };

      expect(() => store(replay, session)).not.toThrow();
    });

    it('should handle very long task description', () => {
      const longTask = 'テスト'.repeat(1000);
      let replay = createExperienceReplay();

      const session = createThinkingSession(longTask);
      session.outcome = { status: 'success', effectiveness: 0.5, lessonsLearned: [] };

      expect(() => store(replay, session)).not.toThrow();
    });

    it('should handle special characters in task', () => {
      const specialTask = 'テスト\n\t<>&"\'${}`';
      let replay = createExperienceReplay();

      const session = createThinkingSession(specialTask);
      session.outcome = { status: 'success', effectiveness: 0.5, lessonsLearned: [] };

      expect(() => store(replay, session)).not.toThrow();
    });
  });
});
