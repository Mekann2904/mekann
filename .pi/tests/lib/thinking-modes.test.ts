/**
 * @abdd.meta
 * path: .pi/tests/lib/thinking-modes.test.ts
 * role: thinking-modes.tsの統合テスト
 * why: 思考モード管理の正確性を保証するため
 * related: .pi/lib/thinking-modes.ts
 * public_api: なし（テストファイル）
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: 思考モード管理の統合テスト
 * what_it_does:
 *   - 思考モード定義の確認をテスト
 *   - モード切替を検証
 *   - 提案機能をテスト
 * why_it_exists:
 *   - 思考プロセス管理の信頼性を保証
 *   - エッジケースや境界条件の動作を確認
 * scope:
 *   in: タスク説明、モード
 *   out: テスト結果
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ThinkingModeSelector,
  THINKING_MODES,
  getThinkingModeSelector,
  buildModeSwitchPrompt,
  type ThinkingModeType,
  type ThinkingMode,
  type ThinkingModeState,
} from '../../lib/thinking-modes';

describe('thinking-modes', () => {
  describe('THINKING_MODES', () => {
    it('THINKING_MODES_全モード定義_存在する', () => {
      const modes = Object.keys(THINKING_MODES);

      expect(modes).toContain('intuitive');
      expect(modes).toContain('analytical');
      expect(modes).toContain('creative');
      expect(modes).toContain('critical');
      expect(modes).toContain('practical');
      expect(modes).toContain('metacognitive');
    });

    it('THINKING_MODES_各モード構造_正しい', () => {
      Object.values(THINKING_MODES).forEach((mode) => {
        expect(mode.type).toBeDefined();
        expect(mode.name).toBeDefined();
        expect(mode.description).toBeDefined();
        expect(mode.suitableFor).toBeInstanceOf(Array);
        expect(mode.notSuitableFor).toBeInstanceOf(Array);
        expect(mode.traps).toBeInstanceOf(Array);
        expect(mode.relatedHats).toBeInstanceOf(Array);
        expect(mode.bloomLevel).toBeDefined();
        expect([1, 2, 'both']).toContain(mode.systemType);
      });
    });

    it('THINKING_MODES_直観モード_システム1', () => {
      expect(THINKING_MODES.intuitive.systemType).toBe(1);
    });

    it('THINKING_MODES_分析モード_システム2', () => {
      expect(THINKING_MODES.analytical.systemType).toBe(2);
    });

    it('THINKING_MODES_創造モード_両方', () => {
      expect(THINKING_MODES.creative.systemType).toBe('both');
    });
  });

  describe('ThinkingModeSelector', () => {
    let selector: ThinkingModeSelector;

    beforeEach(() => {
      selector = new ThinkingModeSelector();
    });

    describe('初期化', () => {
      it('constructor_初期状態_実践モード', () => {
        const mode = selector.getCurrentMode();

        expect(mode.type).toBe('practical');
      });

      it('constructor_初期履歴_空', () => {
        const state = selector.getState();

        expect(state.previousModes).toEqual([]);
        expect(state.switchReasons).toEqual([]);
      });

      it('constructor_使用時間_ゼロ初期化', () => {
        const state = selector.getState();

        Object.values(state.modeDurations).forEach((duration) => {
          expect(duration).toBe(0);
        });
      });
    });

    describe('getCurrentMode', () => {
      it('getCurrentMode_現在モード_正しい型', () => {
        const mode = selector.getCurrentMode();

        expect(mode).toHaveProperty('type');
        expect(mode).toHaveProperty('name');
        expect(mode).toHaveProperty('description');
      });
    });

    describe('getAllModes', () => {
      it('getAllModes_全モード取得_6つ', () => {
        const modes = selector.getAllModes();

        expect(modes.length).toBe(6);
      });
    });

    describe('switchMode', () => {
      it('switchMode_モード切替_成功', () => {
        selector.switchMode('analytical');

        expect(selector.getCurrentMode().type).toBe('analytical');
      });

      it('switchMode_履歴記録_される', () => {
        selector.switchMode('analytical');
        selector.switchMode('creative');

        const state = selector.getState();
        expect(state.previousModes).toContain('practical');
        expect(state.previousModes).toContain('analytical');
      });

      it('switchMode_理由記録_される', () => {
        selector.switchMode('critical', '検証が必要');

        const state = selector.getState();
        expect(state.switchReasons[0].reason).toBe('検証が必要');
      });

      it('switchMode_履歴最大10件_制限される', () => {
        for (let i = 0; i < 15; i++) {
          selector.switchMode('analytical');
          selector.switchMode('creative');
        }

        const state = selector.getState();
        expect(state.previousModes.length).toBeLessThanOrEqual(10);
      });
    });

    describe('suggestModesForTask', () => {
      it('suggestModesForTask_分析タスク_分析モード推奨', () => {
        const suggestions = selector.suggestModesForTask('データを分析する');

        expect(suggestions.some((m) => m.type === 'analytical')).toBe(true);
      });

      it('suggestModesForTask_創造タスク_創造モード推奨', () => {
        const suggestions = selector.suggestModesForTask('新しいアイデアを出す');

        expect(suggestions.some((m) => m.type === 'creative')).toBe(true);
      });

      it('suggestModesForTask_批判タスク_批判モード推奨', () => {
        const suggestions = selector.suggestModesForTask('主張を批判的に検証する');

        expect(suggestions.some((m) => m.type === 'critical')).toBe(true);
      });

      it('suggestModesForTask_実装タスク_実践モード推奨', () => {
        const suggestions = selector.suggestModesForTask('機能を実装する');

        expect(suggestions.some((m) => m.type === 'practical')).toBe(true);
      });

      it('suggestModesForTask_不明なタスク_実践モード', () => {
        const suggestions = selector.suggestModesForTask('タスク');

        expect(suggestions[0].type).toBe('practical');
      });
    });

    describe('getCurrentModeTraps', () => {
      it('getCurrentModeTraps_現在モードの罠_取得', () => {
        const traps = selector.getCurrentModeTraps();

        expect(traps.length).toBeGreaterThan(0);
      });

      it('getCurrentModeTraps_モード切替後_新しい罠', () => {
        selector.switchMode('critical');
        const traps = selector.getCurrentModeTraps();

        expect(traps).toEqual(THINKING_MODES.critical.traps);
      });
    });

    describe('enterMetacognitiveMode', () => {
      it('enterMetacognitiveMode_メタ認知モード_切替', () => {
        selector.enterMetacognitiveMode();

        expect(selector.getCurrentMode().type).toBe('metacognitive');
      });

      it('enterMetacognitiveMode_理由記録_される', () => {
        selector.enterMetacognitiveMode('思考の観察');

        const state = selector.getState();
        expect(state.switchReasons[0].reason).toBe('思考の観察');
      });
    });

    describe('getState', () => {
      it('getState_状態取得_正しい構造', () => {
        const state = selector.getState();

        expect(state).toHaveProperty('currentMode');
        expect(state).toHaveProperty('previousModes');
        expect(state).toHaveProperty('switchReasons');
        expect(state).toHaveProperty('modeDurations');
        expect(state).toHaveProperty('lastSwitchTime');
      });
    });

    describe('getUsageStatistics', () => {
      it('getUsageStatistics_初期状態_ゼロ', () => {
        const stats = selector.getUsageStatistics();

        expect(stats.totalSwitches).toBe(0);
      });

      it('getUsageStatistics_切替後_統計更新', () => {
        selector.switchMode('analytical');
        selector.switchMode('creative');
        selector.switchMode('analytical');

        const stats = selector.getUsageStatistics();

        expect(stats.totalSwitches).toBe(3);
        expect(stats.modeDistribution.analytical).toBe(2);
        expect(stats.modeDistribution.creative).toBe(1);
      });
    });
  });

  describe('getThinkingModeSelector', () => {
    it('getThinkingModeSelector_シングルトン_同じインスタンス', () => {
      const instance1 = getThinkingModeSelector();
      const instance2 = getThinkingModeSelector();

      expect(instance1).toBe(instance2);
    });
  });

  describe('buildModeSwitchPrompt', () => {
    it('buildModeSwitchPrompt_プロンプト生成_正しい構造', () => {
      const prompt = buildModeSwitchPrompt('practical', 'analytical');

      expect(prompt).toContain('実践モード');
      expect(prompt).toContain('分析モード');
    });

    it('buildModeSwitchPrompt_適切な状況_含まれる', () => {
      const prompt = buildModeSwitchPrompt('practical', 'creative');

      expect(prompt).toContain('適している状況');
    });

    it('buildModeSwitchPrompt_罠_含まれる', () => {
      const prompt = buildModeSwitchPrompt('practical', 'critical');

      expect(prompt).toContain('罠');
    });

    it('buildModeSwitchPrompt_注意事項_含まれる', () => {
      const prompt = buildModeSwitchPrompt('practical', 'metacognitive');

      expect(prompt).toContain('注意');
    });
  });

  describe('型定義', () => {
    it('ThinkingModeType_正しい値', () => {
      const modes: ThinkingModeType[] = [
        'intuitive',
        'analytical',
        'creative',
        'critical',
        'practical',
        'metacognitive',
      ];

      modes.forEach((mode) => {
        expect(THINKING_MODES[mode]).toBeDefined();
      });
    });

    it('ThinkingModeState_正しい構造', () => {
      const state: ThinkingModeState = {
        currentMode: 'practical',
        previousModes: [],
        switchReasons: [],
        modeDurations: {
          intuitive: 0,
          analytical: 0,
          creative: 0,
          critical: 0,
          practical: 0,
          metacognitive: 0,
        },
        lastSwitchTime: new Date().toISOString(),
      };

      expect(state.currentMode).toBe('practical');
    });
  });
});
