/**
 * judge.ts テスト
 *
 * 結果集約ロジックをテスト
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';

// テスト対象のモジュール
import {
  analyzeMemberOutput,
  computeProxyUncertainty,
  computeProxyUncertaintyWithExplainability,
  buildFallbackJudge,
  runFinalJudge,
  extractDiscussionSection,
  countEvidenceSignals,
  getJudgeWeights,
  setJudgeWeights,
  resetJudgeWeights,
  DEFAULT_JUDGE_WEIGHTS,
  DEFAULT_JUDGE_WEIGHTS as weights,
  type TeamUncertaintyProxy,
  type TeamFinalJudge,
  type JudgeExplanation,
  type JudgeWeightConfig,
} from '.pi/extensions/agent-teams/judge.js';

import { createTestMemberResult } from './mocks';

describe('judge.ts - analyzeMemberOutput', () => {
  it('CONFIDENCEフィールドを抽出する', () => {
    const output = `SUMMARY: Test\nCONFIDENCE: 0.8\nEVIDENCE: evidence-1`;
    const result = analyzeMemberOutput(output);

    expect(result.confidence).toBe(0.8);
    expect(result.evidenceCount).toBe(1);
    expect(result.contradictionSignals).toBe(0);
    expect(result.conflictSignals).toBe(0);
  });

  it('CONFIDENCEがない場合はデフォルト値を使用する', () => {
    const output = `SUMMARY: Test\nEVIDENCE: evidence-1`;
    const result = analyzeMemberOutput(output);

    expect(result.confidence).toBe(0.5);
  });

  it('無効なCONFIDENCEはデフォルト値を使用する', () => {
    const output = `SUMMARY: Test\nCONFIDENCE: invalid`;
    const result = analyzeMemberOutput(output);

    expect(result.confidence).toBe(0.5);
  });

  it('複数のEVIDENCEをカウントする', () => {
    const output = `EVIDENCE: evidence-1, evidence-2, evidence-3; evidence-4`;
    const result = analyzeMemberOutput(output);

    expect(result.evidenceCount).toBe(4);
  });

  it('矛盾シグナルを検出する（英語）', () => {
    const output = `CLAIM: Test\nEVIDENCE: evidence-1\nThe analysis shows self-contradict in the reasoning.`;
    const result = analyzeMemberOutput(output);

    expect(result.contradictionSignals).toBeGreaterThan(0);
  });

  it('矛盾シグナルを検出する（日本語）', () => {
    const output = `CLAIM: Test\nEVIDENCE: evidence-1\n自己矛盾が見つかりました。`;
    const result = analyzeMemberOutput(output);

    expect(result.contradictionSignals).toBeGreaterThan(0);
  });

  it('対立シグナルを検出する', () => {
    const output = `CLAIM: Test\nEVIDENCE: evidence-1\nI disagree with the approach.`;
    const result = analyzeMemberOutput(output);

    expect(result.conflictSignals).toBeGreaterThan(0);
  });

  it('対立シグナルを検出する（日本語）', () => {
    const output = `CLAIM: Test\nEVIDENCE: evidence-1\n意見が割れています。`;
    const result = analyzeMemberOutput(output);

    expect(result.conflictSignals).toBeGreaterThan(0);
  });
});

describe('judge.ts - countEvidenceSignals', () => {
  it('EVIDENCEフィールドの項目をカウントする', () => {
    const output = `EVIDENCE: evidence-1, evidence-2, evidence-3`;
    const count = countEvidenceSignals(output);

    expect(count).toBe(3);
  });

  it('ファイル参照をカウントする', () => {
    const output = `SUMMARY: Test\nEVIDENCE: evidence-1\nsrc/file.ts:10\nlib/helper.ts:20`;
    const count = countEvidenceSignals(output);

    expect(count).toBeGreaterThan(0);
  });

  it('EVIDENCEがない場合は0を返す', () => {
    const output = `SUMMARY: Test\nCLAIM: Test claim`;
    const count = countEvidenceSignals(output);

    expect(count).toBe(0);
  });

  it('最大50個に制限する', () => {
    const manyEvidence = Array.from({ length: 100 }, (_, i) => `evidence-${i}`).join(', ');
    const output = `EVIDENCE: ${manyEvidence}`;
    const count = countEvidenceSignals(output);

    expect(count).toBe(50);
  });
});

describe('judge.ts - extractDiscussionSection', () => {
  it('DISCUSSIONセクションを抽出する', () => {
    const output = `SUMMARY: Test\nCLAIM: Test claim\nDISCUSSION:\nI agree with the approach.\nNEXT_STEP: Next`;
    const discussion = extractDiscussionSection(output);

    expect(discussion).toContain('I agree with the approach.');
    expect(discussion).not.toContain('SUMMARY');
    expect(discussion).not.toContain('NEXT_STEP');
  });

  it('DISCUSSIONセクションがない場合は空文字を返す', () => {
    const output = `SUMMARY: Test\nCLAIM: Test claim\nNEXT_STEP: Next`;
    const discussion = extractDiscussionSection(output);

    expect(discussion).toBe('');
  });

  it('次のメジャーラベルで抽出を停止する', () => {
    const output = `SUMMARY: Test\nDISCUSSION:\nDiscussion content\nRESULT: Result content`;
    const discussion = extractDiscussionSection(output);

    expect(discussion).toContain('Discussion content');
    expect(discussion).not.toContain('RESULT');
  });
});

describe('judge.ts - computeProxyUncertainty', () => {
  it('全メンバー成功時の不確実性を計算する', () => {
    const results = [
      createTestMemberResult('member-1', 'Role 1', 'completed', 0.9, 3),
      createTestMemberResult('member-2', 'Role 2', 'completed', 0.8, 2),
      createTestMemberResult('member-3', 'Role 3', 'completed', 0.85, 4),
    ];

    const proxy = computeProxyUncertainty(results);

    expect(proxy.uIntra).toBeGreaterThanOrEqual(0);
    expect(proxy.uIntra).toBeLessThanOrEqual(1);
    expect(proxy.uInter).toBeGreaterThanOrEqual(0);
    expect(proxy.uInter).toBeLessThanOrEqual(1);
    expect(proxy.uSys).toBeGreaterThanOrEqual(0);
    expect(proxy.uSys).toBeLessThanOrEqual(1);
  });

  it('失敗メンバーを含む不確実性を計算する', () => {
    const results = [
      createTestMemberResult('member-1', 'Role 1', 'completed', 0.9, 3),
      createTestMemberResult('member-2', 'Role 2', 'failed', 0.5, 0),
      createTestMemberResult('member-3', 'Role 3', 'completed', 0.8, 2),
    ];

    const proxy = computeProxyUncertainty(results);

    expect(proxy.uSys).toBeGreaterThan(0);
    expect(proxy.collapseSignals).toContain('teammate_failures');
  });

  it('証拠なしメンバーを含む不確実性を計算する', () => {
    const results = [
      createTestMemberResult('member-1', 'Role 1', 'completed', 0.9, 0),
      createTestMemberResult('member-2', 'Role 2', 'completed', 0.8, 0),
    ];

    const proxy = computeProxyUncertainty(results);

    expect(proxy.collapseSignals).toContain('insufficient_evidence');
  });

  it('矛盾を含む出力の不確実性を計算する', () => {
    const result1 = createTestMemberResult('member-1', 'Role 1', 'completed', 0.9, 3);
    result1.output += '\nThe analysis shows self-contradict.';
    result1.diagnostics = { ...result1.diagnostics!, contradictionSignals: 1 };

    const proxy = computeProxyUncertainty([result1]);

    expect(proxy.uIntra).toBeGreaterThan(0);
  });

  it('collapseThresholdを超えるとシグナルを追加する', () => {
    const results = [
      createTestMemberResult('member-1', 'Role 1', 'failed', 0.1, 0),
      createTestMemberResult('member-2', 'Role 2', 'failed', 0.1, 0),
      createTestMemberResult('member-3', 'Role 3', 'failed', 0.1, 0),
    ];

    const proxy = computeProxyUncertainty(results);

    expect(proxy.collapseSignals.length).toBeGreaterThan(0);
  });
});

describe('judge.ts - computeProxyUncertaintyWithExplainability', () => {
  it('詳細な説明を生成する', () => {
    const results = [
      createTestMemberResult('member-1', 'Role 1', 'completed', 0.9, 3),
      createTestMemberResult('member-2', 'Role 2', 'completed', 0.8, 2),
    ];

    const { proxy, explanation } = computeProxyUncertaintyWithExplainability(results);

    expect(proxy).toBeDefined();
    expect(explanation.inputs).toBeDefined();
    expect(explanation.computation).toBeDefined();
    expect(explanation.triggers).toBeDefined();
    expect(explanation.reasoningChain).toBeDefined();
  });

  it('入力値を正しく記録する', () => {
    const results = [
      createTestMemberResult('member-1', 'Role 1', 'completed', 0.9, 3),
      createTestMemberResult('member-2', 'Role 2', 'failed', 0.5, 0),
    ];

    const { explanation } = computeProxyUncertaintyWithExplainability(results);

    expect(explanation.inputs.failedRatio).toBe(0.5);
    expect(explanation.inputs.total).toBe(2);
    expect(explanation.inputs.failedCount).toBe(1);
  });

  it('contributionを正しく計算する', () => {
    const results = [
      createTestMemberResult('member-1', 'Role 1', 'completed', 0.9, 3),
    ];

    const { explanation } = computeProxyUncertaintyWithExplainability(results);

    const uIntraContribs = explanation.computation.uIntra.contributions;
    expect(uIntraContribs.length).toBeGreaterThan(0);
    for (const contrib of uIntraContribs) {
      expect(contrib).toHaveProperty('factor');
      expect(contrib).toHaveProperty('weight');
      expect(contrib).toHaveProperty('value');
      expect(contrib).toHaveProperty('contribution');
    }
  });

  it('トリガーの正しい判定', () => {
    const results = [
      createTestMemberResult('member-1', 'Role 1', 'failed', 0.1, 0),
      createTestMemberResult('member-2', 'Role 2', 'failed', 0.1, 0),
    ];

    const { explanation } = computeProxyUncertaintyWithExplainability(results);

    const failedTrigger = explanation.triggers.find((t) => t.signal === 'teammate_failures');
    expect(failedTrigger?.triggered).toBe(true);
  });
});

describe('judge.ts - buildFallbackJudge', () => {
  it('成功メンバーのみの場合はtrustedを返す', () => {
    const memberResults = [
      createTestMemberResult('member-1', 'Role 1', 'completed', 0.9, 3),
      createTestMemberResult('member-2', 'Role 2', 'completed', 0.8, 2),
    ];

    const judge = buildFallbackJudge({ memberResults });

    expect(judge.verdict).toBe('trusted');
    expect(judge.confidence).toBeGreaterThan(0.5);
  });

  it('全メンバー失敗の場合はuntrustedを返す', () => {
    const memberResults = [
      createTestMemberResult('member-1', 'Role 1', 'failed', 0.1, 0),
      createTestMemberResult('member-2', 'Role 2', 'failed', 0.1, 0),
    ];

    const judge = buildFallbackJudge({ memberResults });

    expect(judge.verdict).toBe('untrusted');
    expect(judge.confidence).toBe(0.1);
  });

  it('一部失敗の場合はpartialを返す', () => {
    const memberResults = [
      createTestMemberResult('member-1', 'Role 1', 'completed', 0.9, 3),
      createTestMemberResult('member-2', 'Role 2', 'failed', 0.1, 0),
    ];

    const judge = buildFallbackJudge({ memberResults });

    expect(judge.verdict).toBe('partial');
  });

  it('失敗メンバーを含む場合はpartialを返す', () => {
    const memberResults = [
      createTestMemberResult('member-1', 'Role 1', 'completed', 0.1, 0),
      createTestMemberResult('member-2', 'Role 2', 'failed', 0.1, 0),
    ];
    const proxy = computeProxyUncertainty(memberResults);

    const judge = buildFallbackJudge({ memberResults, proxy });

    expect(judge.verdict).toBe('partial');
  });

  it('エラーメッセージを含める', () => {
    const memberResults = [
      createTestMemberResult('member-1', 'Role 1', 'failed', 0.1, 0),
    ];

    const judge = buildFallbackJudge({ memberResults, error: 'Test error message' });

    expect(judge.reason).toContain('Test error message');
  });
});

describe('judge.ts - runFinalJudge', () => {
  it('決定論的な判定を返す', async () => {
    const memberResults = [
      createTestMemberResult('member-1', 'Role 1', 'completed', 0.9, 3),
    ];
    const proxy = computeProxyUncertainty(memberResults);

    const judge = await runFinalJudge({
      team: { id: 'team-1', name: 'Team 1', description: 'desc', enabled: 'enabled', members: [], createdAt: '', updatedAt: '' },
      task: 'Test task',
      strategy: 'parallel',
      memberResults,
      proxy,
      timeoutMs: 30000,
    });

    expect(judge).toBeDefined();
    expect(judge.verdict).toBeDefined();
  });
});

describe('judge.ts - 重み設定管理', () => {
  it('デフォルトの重みを取得する', () => {
    const retrieved = getJudgeWeights();

    expect(retrieved.version).toBe(DEFAULT_JUDGE_WEIGHTS.version);
    expect(retrieved.intraWeights).toEqual(DEFAULT_JUDGE_WEIGHTS.intraWeights);
    expect(retrieved.interWeights).toEqual(DEFAULT_JUDGE_WEIGHTS.interWeights);
    expect(retrieved.sysWeights).toEqual(DEFAULT_JUDGE_WEIGHTS.sysWeights);
  });

  it('カスタム重みを設定する', () => {
    const customWeights: JudgeWeightConfig = {
      version: 'test',
      intraWeights: {
        failedRatio: 0.5,
        lowConfidence: 0.3,
        noEvidence: 0.1,
        contradiction: 0.1,
      },
      interWeights: {
        conflictRatio: 0.4,
        confidenceSpread: 0.3,
        failedRatio: 0.2,
        noEvidence: 0.1,
      },
      sysWeights: {
        uIntra: 0.5,
        uInter: 0.3,
        failedRatio: 0.2,
      },
      collapseThresholds: {
        uIntra: 0.6,
        uInter: 0.6,
        uSys: 0.7,
        failedRatio: 0.4,
        noEvidenceRatio: 0.6,
      },
    };

    setJudgeWeights(customWeights);
    const retrieved = getJudgeWeights();

    expect(retrieved.version).toBe('test');
    expect(retrieved.intraWeights.failedRatio).toBe(0.5);
  });

  it('重みをリセットする', () => {
    const customWeights: JudgeWeightConfig = {
      ...DEFAULT_JUDGE_WEIGHTS,
      version: 'custom',
    };

    setJudgeWeights(customWeights);
    expect(getJudgeWeights().version).toBe('custom');

    resetJudgeWeights();
    expect(getJudgeWeights().version).toBe(DEFAULT_JUDGE_WEIGHTS.version);
  });

  it('部分設定はデフォルト値とマージされる', () => {
    const partialWeights = {
      intraWeights: {
        failedRatio: 0.5,
        lowConfidence: 0.3,
        noEvidence: 0.1,
        contradiction: 0.1,
      },
      interWeights: {
        conflictRatio: 0.4,
        confidenceSpread: 0.3,
        failedRatio: 0.2,
        noEvidence: 0.1,
      },
      sysWeights: {
        uIntra: 0.5,
        uInter: 0.3,
        failedRatio: 0.2,
      },
      collapseThresholds: {
        uIntra: 0.6,
        uInter: 0.6,
        uSys: 0.7,
        failedRatio: 0.4,
        noEvidenceRatio: 0.6,
      },
      version: 'custom',
    };

    setJudgeWeights(partialWeights);
    const retrieved = getJudgeWeights();

    expect(retrieved.intraWeights.failedRatio).toBe(0.5);
    expect(retrieved.intraWeights.lowConfidence).toBe(0.3);
    expect(retrieved.interWeights).toBeDefined();
    expect(retrieved.sysWeights).toBeDefined();
    expect(retrieved.collapseThresholds).toBeDefined();
  });
});

describe('judge.ts - プロパティベーステスト', () => {
  it('CONFIDENCEは常に0から1の範囲', () => {
    fc.assert(
      fc.property(fc.float({ min: 0, max: 1 }), (confidence) => {
        const output = `CONFIDENCE: ${confidence}\nEVIDENCE: e1`;
        const result = analyzeMemberOutput(output);
        return result.confidence >= 0 && result.confidence <= 1;
      }),
    );
  });

  it('不確実性の合計は1以下である', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            memberId: fc.string(),
            role: fc.string(),
            summary: fc.string(),
            output: fc.string(),
            status: fc.constantFrom('completed', 'failed'),
            latencyMs: fc.integer({ min: 0, max: 10000 }),
            diagnostics: fc.option(fc.record({
              confidence: fc.float({ min: 0, max: 1 }),
              evidenceCount: fc.integer({ min: 0, max: 50 }),
              contradictionSignals: fc.integer({ min: 0, max: 10 }),
              conflictSignals: fc.integer({ min: 0, max: 10 }),
            })),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        (memberResults) => {
          const proxy = computeProxyUncertainty(memberResults);
          return proxy.uIntra >= 0 && proxy.uIntra <= 1 &&
                 proxy.uInter >= 0 && proxy.uInter <= 1 &&
                 proxy.uSys >= 0 && proxy.uSys <= 1;
        },
      ),
    );
  });

  it('collapseSignalsは重複しない', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            memberId: fc.string(),
            role: fc.string(),
            summary: fc.string(),
            output: fc.string(),
            status: fc.constantFrom('completed', 'failed'),
            latencyMs: fc.integer({ min: 0, max: 10000 }),
            diagnostics: fc.option(fc.record({
              confidence: fc.float({ min: 0, max: 1 }),
              evidenceCount: fc.integer({ min: 0, max: 50 }),
              contradictionSignals: fc.integer({ min: 0, max: 10 }),
              conflictSignals: fc.integer({ min: 0, max: 10 }),
            })),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        (memberResults) => {
          const proxy = computeProxyUncertainty(memberResults);
          const uniqueSignals = new Set(proxy.collapseSignals);
          return uniqueSignals.size === proxy.collapseSignals.length;
        },
      ),
    );
  });

  it('判定結果は有効なverdictを持つ', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            memberId: fc.string(),
            role: fc.string(),
            summary: fc.string(),
            output: fc.string(),
            status: fc.constantFrom('completed', 'failed'),
            latencyMs: fc.integer({ min: 0, max: 10000 }),
            diagnostics: fc.option(fc.record({
              confidence: fc.float({ min: 0, max: 1 }),
              evidenceCount: fc.integer({ min: 0, max: 50 }),
              contradictionSignals: fc.integer({ min: 0, max: 10 }),
              conflictSignals: fc.integer({ min: 0, max: 10 }),
            })),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        (memberResults) => {
          const judge = buildFallbackJudge({ memberResults });
          return ['trusted', 'partial', 'untrusted'].includes(judge.verdict);
        },
      ),
    );
  });
});

describe('judge.ts - エッジケース', () => {
  it('空のメンバー結果配列', () => {
    const judge = buildFallbackJudge({ memberResults: [] });

    expect(judge.verdict).toBe('untrusted');
    expect(judge.confidence).toBe(0.1);
  });

  it('非常に高い信頼度', () => {
    const results = [
      createTestMemberResult('member-1', 'Role 1', 'completed', 1.0, 10),
      createTestMemberResult('member-2', 'Role 2', 'completed', 1.0, 10),
    ];

    const proxy = computeProxyUncertainty(results);

    expect(proxy.uIntra).toBeLessThan(0.5);
  });

  it('ゼロ信頼度', () => {
    const results = [
      createTestMemberResult('member-1', 'Role 1', 'completed', 0, 0),
      createTestMemberResult('member-2', 'Role 2', 'completed', 0, 0),
    ];

    const proxy = computeProxyUncertainty(results);

    expect(proxy.uIntra).toBeGreaterThan(0.4);
    expect(proxy.collapseSignals).toContain('insufficient_evidence');
  });
});
