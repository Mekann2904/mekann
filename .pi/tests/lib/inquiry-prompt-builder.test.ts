/**
 * @abdd.meta
 * path: .pi/tests/lib/inquiry-prompt-builder.test.ts
 * role: inquiry-prompt-builder.tsの統合テスト
 * why: 問い駆動型プロンプト生成の正確性を保証するため
 * related: .pi/lib/inquiry-prompt-builder.ts
 * public_api: なし（テストファイル）
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: 問いプロンプトビルダーの統合テスト
 * what_it_does:
 *   - プロンプト生成をテスト
 *   - アポリアプロンプトを検証
 *   - 完了前チェックを確認
 *   - 深化プロンプトをテスト
 * why_it_exists:
 *   - LLM向けプロンプト生成の信頼性を保証
 *   - エッジケースや境界条件の動作を確認
 * scope:
 *   in: オプション、深度
 *   out: テスト結果
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildInquiryPrompt,
  buildAporiaPrompt,
  buildPreCompletionCheckPrompt,
  buildDeepeningPrompt,
  type InquiryPromptOptions,
} from '../../lib/inquiry-prompt-builder';

describe('inquiry-prompt-builder', () => {
  describe('buildInquiryPrompt', () => {
    it('buildInquiryPrompt_基本プロンプト_正しい構造', () => {
      const options: InquiryPromptOptions = {
        taskDescription: 'テストタスク',
      };

      const prompt = buildInquiryPrompt(options);

      expect(prompt).toContain('問い駆動型探求モード');
    });

    it('buildInquiryPrompt_探求セクション_含まれる', () => {
      const options: InquiryPromptOptions = {
        taskDescription: 'テストタスク',
      };

      const prompt = buildInquiryPrompt(options);

      expect(prompt).toContain('探求の5段階');
      expect(prompt).toContain('問いを立てる');
      expect(prompt).toContain('複数のアプローチ');
    });

    it('buildInquiryPrompt_完了基準_含まれる', () => {
      const options: InquiryPromptOptions = {
        taskDescription: 'テストタスク',
        minCycles: 5,
      };

      const prompt = buildInquiryPrompt(options);

      expect(prompt).toContain('5');
    });

    it('buildInquiryPrompt_深度要件_含まれる', () => {
      const options: InquiryPromptOptions = {
        taskDescription: 'テストタスク',
        requiredDepth: 'foundational',
      };

      const prompt = buildInquiryPrompt(options);

      expect(prompt).toContain('foundational');
    });

    it('buildInquiryPrompt_追加指示_含まれる', () => {
      const options: InquiryPromptOptions = {
        taskDescription: 'テストタスク',
        additionalInstructions: '特別な指示内容',
      };

      const prompt = buildInquiryPrompt(options);

      expect(prompt).toContain('特別な指示内容');
    });

    it('buildInquiryPrompt_推奨カテゴリ_使用される', () => {
      const options: InquiryPromptOptions = {
        taskDescription: 'テストタスク',
        recommendedCategories: ['deconstruction', 'aporic'],
      };

      const prompt = buildInquiryPrompt(options);

      expect(prompt).toContain('推奨される問い');
    });

    it('buildInquiryPrompt_出力フォーマット_含まれる', () => {
      const options: InquiryPromptOptions = {
        taskDescription: 'テストタスク',
      };

      const prompt = buildInquiryPrompt(options);

      expect(prompt).toContain('出力フォーマット');
      expect(prompt).toContain('問い');
      expect(prompt).toContain('探求');
      expect(prompt).toContain('実行');
    });

    it('buildInquiryPrompt_停止条件_含まれる', () => {
      const options: InquiryPromptOptions = {
        taskDescription: 'テストタスク',
      };

      const prompt = buildInquiryPrompt(options);

      expect(prompt).toContain('停止条件');
    });

    it('buildInquiryPrompt_規範性への言及_含まれる', () => {
      const options: InquiryPromptOptions = {
        taskDescription: 'テストタスク',
      };

      const prompt = buildInquiryPrompt(options);

      expect(prompt).toContain('このモード自体の規範性');
    });
  });

  describe('buildAporiaPrompt', () => {
    it('buildAporiaPrompt_アポリアプロンプト_正しい構造', () => {
      const poles: [string, string] = ['品質', '速度'];

      const prompt = buildAporiaPrompt(poles);

      expect(prompt).toContain('アポリアの認識');
      expect(prompt).toContain('品質');
      expect(prompt).toContain('速度');
    });

    it('buildAporiaPrompt_各極の正当性セクション_含まれる', () => {
      const poles: [string, string] = ['完全性', '効率性'];

      const prompt = buildAporiaPrompt(poles);

      expect(prompt).toContain('正当性');
      expect(prompt).toContain('完全性');
      expect(prompt).toContain('効率性');
    });

    it('buildAporiaPrompt_対処原則_含まれる', () => {
      const poles: [string, string] = ['A', 'B'];

      const prompt = buildAporiaPrompt(poles);

      expect(prompt).toContain('アポリア対処の原則');
      expect(prompt).toContain('認識');
      expect(prompt).toContain('非解決');
    });

    it('buildAporiaPrompt_注意事項_含まれる', () => {
      const poles: [string, string] = ['安全性', '利便性'];

      const prompt = buildAporiaPrompt(poles);

      expect(prompt).toContain('注意');
    });
  });

  describe('buildPreCompletionCheckPrompt', () => {
    it('buildPreCompletionCheckPrompt_チェックプロンプト_正しい構造', () => {
      const prompt = buildPreCompletionCheckPrompt();

      expect(prompt).toContain('完了前の自己点検');
    });

    it('buildPreCompletionCheckPrompt_除外されたもの_含まれる', () => {
      const prompt = buildPreCompletionCheckPrompt();

      expect(prompt).toContain('除外されたもの');
    });

    it('buildPreCompletionCheckPrompt_完了条件_含まれる', () => {
      const prompt = buildPreCompletionCheckPrompt();

      expect(prompt).toContain('完了の条件');
      expect(prompt).toContain('アポリア');
      expect(prompt).toContain('否定する証拠');
    });

    it('buildPreCompletionCheckPrompt_延期推奨_含まれる', () => {
      const prompt = buildPreCompletionCheckPrompt();

      expect(prompt).toContain('延期');
    });
  });

  describe('buildDeepeningPrompt', () => {
    it('buildDeepeningPrompt_表面的深度_次は構造的', () => {
      const prompt = buildDeepeningPrompt('surface');

      expect(prompt).toContain('表面的な問い');
      expect(prompt).toContain('次の深度: structural');
    });

    it('buildDeepeningPrompt_構造的深度_次は基礎的', () => {
      const prompt = buildDeepeningPrompt('structural');

      expect(prompt).toContain('構造的な問い');
      expect(prompt).toContain('次の深度: foundational');
    });

    it('buildDeepeningPrompt_基礎的深度_次はアポリア的', () => {
      const prompt = buildDeepeningPrompt('foundational');

      expect(prompt).toContain('基礎的な問い');
      expect(prompt).toContain('次の深度: aporic');
    });

    it('buildDeepeningPrompt_アポリア的深度_次もアポリア的', () => {
      const prompt = buildDeepeningPrompt('aporic');

      expect(prompt).toContain('アポリア的問い');
      expect(prompt).toContain('次の深度: aporic');
    });

    it('buildDeepeningPrompt_深化ガイド_含まれる', () => {
      const prompt = buildDeepeningPrompt('surface');

      expect(prompt).toContain('より深い問いへと進んでください');
    });
  });

  describe('統合テスト', () => {
    it('フルプロンプト生成_一貫性_確認', () => {
      const options: InquiryPromptOptions = {
        taskDescription: '複雑な設計問題',
        recommendedCategories: ['deconstruction'],
        minCycles: 5,
        requiredDepth: 'foundational',
        additionalInstructions: 'セキュリティを考慮すること',
      };

      const prompt = buildInquiryPrompt(options);

      // 全ての要素が含まれているか確認
      expect(prompt).toContain('問い駆動型探求モード');
      expect(prompt).toContain('5');
      expect(prompt).toContain('foundational');
      expect(prompt).toContain('セキュリティを考慮すること');
    });

    it('アポリア対処フロー_一貫性_確認', () => {
      const poles: [string, string] = ['完全性', 'パフォーマンス'];

      const aporiaPrompt = buildAporiaPrompt(poles);
      const checkPrompt = buildPreCompletionCheckPrompt();

      expect(aporiaPrompt).toContain('完全性');
      expect(aporiaPrompt).toContain('パフォーマンス');
      expect(checkPrompt).toContain('完了');
    });
  });
});
