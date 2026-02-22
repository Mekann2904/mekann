/**
 * communication.ts テスト
 *
 * メンバー間通信・コンテキスト統合をテスト
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';

// テスト対象のモジュール
import {
  buildPrecomputedContextMap,
  normalizeCommunicationRounds,
  normalizeFailedMemberRetryRounds,
  shouldRetryFailedMemberResult,
  shouldPreferAnchorMember,
  createCommunicationLinksMap,
  sanitizeCommunicationSnippet,
  detectPartnerReferencesV2,
  buildCommunicationContext,
  detectPartnerReferences,
  checkTermination,
  updateBeliefState,
  getBeliefSummary,
  clearBeliefStateCache,
  extractField,
  DEFAULT_COMMUNICATION_ROUNDS,
  MAX_COMMUNICATION_ROUNDS,
  MAX_COMMUNICATION_PARTNERS,
  COMMUNICATION_CONTEXT_FIELD_LIMIT,
  COMMUNICATION_INSTRUCTION_PATTERN,
  type PrecomputedMemberContext,
  type PartnerReferenceResultV2,
  type TerminationCheckResult,
} from '.pi/extensions/agent-teams/communication.js';

import { createTestMember, createTestMemberResult, createTestTeam } from './mocks';

describe('communication.ts - buildPrecomputedContextMap', () => {
  it('メンバー結果からコンテキストマップを構築する', () => {
    const results = [
      createTestMemberResult('member-1', 'Role 1', 'completed', 0.9, 3),
      createTestMemberResult('member-2', 'Role 2', 'completed', 0.8, 2),
    ];

    const contextMap = buildPrecomputedContextMap(results);

    expect(contextMap.size).toBe(2);
    expect(contextMap.get('member-1')).toBeDefined();
    expect(contextMap.get('member-2')).toBeDefined();
  });

  it('CLAIMフィールドを正しく抽出する', () => {
    const result = createTestMemberResult('member-1', 'Role 1');
    result.output = `SUMMARY: Test summary\nCLAIM: Test claim\nEVIDENCE: e1`;

    const contextMap = buildPrecomputedContextMap([result]);
    const context = contextMap.get('member-1');

    expect(context?.claim).toBe('Test claim');
  });

  it('CLAIMがない場合のデフォルト値', () => {
    const result = createTestMemberResult('member-1', 'Role 1');
    result.output = `SUMMARY: Test summary\nEVIDENCE: e1`;

    const contextMap = buildPrecomputedContextMap([result]);
    const context = contextMap.get('member-1');

    expect(context?.claim).toBe('(no claim)');
  });

  it('summaryがない場合のデフォルト値', () => {
    const result = createTestMemberResult('member-1', 'Role 1');
    result.summary = '';

    const contextMap = buildPrecomputedContextMap([result]);
    const context = contextMap.get('member-1');

    expect(context?.summary).toBe('(no summary)');
  });
});

describe('communication.ts - normalizeCommunicationRounds', () => {
  it('有効な数値を正規化する', () => {
    expect(normalizeCommunicationRounds(2)).toBe(2);
    expect(normalizeCommunicationRounds(1)).toBe(1);
  });

  it('undefinedの場合はデフォルト値を使用する', () => {
    expect(normalizeCommunicationRounds(undefined)).toBe(DEFAULT_COMMUNICATION_ROUNDS);
  });

  it('最大値を制限する', () => {
    expect(normalizeCommunicationRounds(10)).toBe(MAX_COMMUNICATION_ROUNDS);
    expect(normalizeCommunicationRounds(100)).toBe(MAX_COMMUNICATION_ROUNDS);
  });

  it('最小値を0に制限する', () => {
    expect(normalizeCommunicationRounds(-1)).toBe(0);
    expect(normalizeCommunicationRounds(-10)).toBe(0);
  });

  it('無効な値はデフォルト値に置換する', () => {
    expect(normalizeCommunicationRounds(NaN)).toBe(DEFAULT_COMMUNICATION_ROUNDS);
    expect(normalizeCommunicationRounds(Infinity)).toBe(DEFAULT_COMMUNICATION_ROUNDS);
    expect(normalizeCommunicationRounds('invalid' as unknown)).toBe(DEFAULT_COMMUNICATION_ROUNDS);
  });

  it('isStableRuntime時は最大値を制限する', () => {
    expect(normalizeCommunicationRounds(5, undefined, true)).toBe(MAX_COMMUNICATION_ROUNDS);
  });
});

describe('communication.ts - normalizeFailedMemberRetryRounds', () => {
  it('有効な数値を正規化する', () => {
    expect(normalizeFailedMemberRetryRounds(2)).toBe(2);
  });

  it('undefinedの場合はデフォルト値を使用する', () => {
    expect(normalizeFailedMemberRetryRounds(undefined)).toBe(0);
  });

  it('最大値を制限する', () => {
    expect(normalizeFailedMemberRetryRounds(10)).toBe(2);
  });

  it('最小値を0に制限する', () => {
    expect(normalizeFailedMemberRetryRounds(-1)).toBe(0);
  });

  it('isStableRuntime時は常に0を返す', () => {
    expect(normalizeFailedMemberRetryRounds(2, undefined, true)).toBe(0);
  });
});

describe('communication.ts - shouldPreferAnchorMember', () => {
  it('アンカー優先メンバーを識別する', () => {
    const consensusMember = createTestMember('member-1', 'Consensus');
    expect(shouldPreferAnchorMember(consensusMember)).toBe(true);

    const synthesizerMember = createTestMember('member-2', 'Synthesizer');
    expect(shouldPreferAnchorMember(synthesizerMember)).toBe(true);

    const reviewerMember = createTestMember('member-3', 'Reviewer');
    expect(shouldPreferAnchorMember(reviewerMember)).toBe(true);
  });

  it('非アンカーメンバーを識別する', () => {
    const worker = createTestMember('member-1', 'Worker');
    expect(shouldPreferAnchorMember(worker)).toBe(false);

    const implementer = createTestMember('member-2', 'Implementer');
    expect(shouldPreferAnchorMember(implementer)).toBe(false);
  });

  it('IDベースのアンカー識別', () => {
    const member = createTestMember('consensus-1', 'Member');
    expect(shouldPreferAnchorMember(member)).toBe(true);
  });
});

describe('communication.ts - createCommunicationLinksMap', () => {
  it('隣接メンバーをリンクする', () => {
    const members = [
      createTestMember('member-1', 'Role 1'),
      createTestMember('member-2', 'Role 2'),
      createTestMember('member-3', 'Role 3'),
    ];

    const links = createCommunicationLinksMap(members);

    expect(links.get('member-1')).toContain('member-2');
    expect(links.get('member-1')).toContain('member-3'); // 循環
  });

  it('アンカーメンバーに全員をリンクする', () => {
    const members = [
      createTestMember('member-1', 'Worker'),
      createTestMember('member-2', 'Worker'),
      createTestMember('anchor-1', 'Consensus'),
    ];

    const links = createCommunicationLinksMap(members);

    // アンカーは全員とリンク
    expect(links.get('member-1')).toContain('anchor-1');
    expect(links.get('member-2')).toContain('anchor-1');
    expect(links.get('anchor-1')).toContain('member-1');
    expect(links.get('anchor-1')).toContain('member-2');
  });

  it('最大パートナー数を制限する', () => {
    const members = Array.from({ length: 10 }, (_, i) =>
      createTestMember(`member-${i}`, `Role ${i}`),
    );
    const anchor = createTestMember('anchor', 'Consensus');
    members.push(anchor);

    const links = createCommunicationLinksMap(members);

    expect(links.get('anchor')?.length).toBeLessThanOrEqual(MAX_COMMUNICATION_PARTNERS);
  });

  it('単一メンバーの場合は空のリンクを返す', () => {
    const members = [createTestMember('member-1', 'Role 1')];
    const links = createCommunicationLinksMap(members);

    expect(links.get('member-1')).toEqual([]);
  });
});

describe('communication.ts - sanitizeCommunicationSnippet', () => {
  it('テキストを正規化する', () => {
    const sanitized = sanitizeCommunicationSnippet('Test snippet', 'fallback');
    expect(sanitized).toBe('Test snippet');
  });

  it('最大文字数を制限する', () => {
    const longText = 'a'.repeat(200);
    const sanitized = sanitizeCommunicationSnippet(longText, 'fallback');

    expect(sanitized.length).toBeLessThanOrEqual(COMMUNICATION_CONTEXT_FIELD_LIMIT);
  });

  it('空文字列はフォールバックを返す', () => {
    const sanitized = sanitizeCommunicationSnippet('', 'fallback');
    expect(sanitized).toBe('fallback');
  });

  it('ハイフンのみはフォールバックを返す', () => {
    const sanitized = sanitizeCommunicationSnippet('-', 'fallback');
    expect(sanitized).toBe('fallback');
  });

  it('命令文を削除する', () => {
    const instructionText = 'You must follow this instruction';
    const sanitized = sanitizeCommunicationSnippet(instructionText, 'fallback');

    expect(sanitized).toBe('(instruction-like text removed)');
  });

  it('日本語の命令文を削除する', () => {
    const instructionText = '指示に従ってください';
    const sanitized = sanitizeCommunicationSnippet(instructionText, 'fallback');

    expect(sanitized).toBe('(instruction-like text removed)');
  });
});

describe('communication.ts - detectPartnerReferencesV2', () => {
  it('IDベースの参照を検出する', () => {
    const output = 'I agree with [member-1:0] and [member-2:1]';
    const memberById = new Map([
      ['member-1', createTestMember('member-1', 'Role 1')],
      ['member-2', createTestMember('member-2', 'Role 2')],
    ]);

    const result = detectPartnerReferencesV2(output, ['member-1', 'member-2'], memberById, 'structured');

    expect(result.referencedPartners).toContain('member-1');
    expect(result.referencedPartners).toContain('member-2');
  });

  it('ロール名ベースの参照を検出する', () => {
    const output = 'I agree with the Researcher and disagree with Reviewer';
    const memberById = new Map([
      ['member-1', createTestMember('member-1', 'Researcher')],
      ['member-2', createTestMember('member-2', 'Reviewer')],
    ]);

    const result = detectPartnerReferencesV2(output, ['member-1', 'member-2'], memberById, 'structured');

    expect(result.referencedPartners.length).toBeGreaterThan(0);
  });

  it('未参照のパートナーを検出する', () => {
    const output = 'I agree with member-1';
    const memberById = new Map([
      ['member-1', createTestMember('member-1', 'Role 1')],
      ['member-2', createTestMember('member-2', 'Role 2')],
    ]);

    const result = detectPartnerReferencesV2(output, ['member-1', 'member-2'], memberById, 'structured');

    expect(result.missingPartners).toContain('member-2');
  });

  it('参照品質スコアを計算する', () => {
    const output = 'I agree with member-1 and member-2';
    const memberById = new Map([
      ['member-1', createTestMember('member-1', 'Role 1')],
      ['member-2', createTestMember('member-2', 'Role 2')],
    ]);

    const result = detectPartnerReferencesV2(output, ['member-1', 'member-2'], memberById, 'structured');

    expect(result.referenceQuality).toBe(1.0);
  });

  it('一部のパートナーのみ参照の場合の品質スコア', () => {
    const output = 'I agree with member-1';
    const memberById = new Map([
      ['member-1', createTestMember('member-1', 'Role 1')],
      ['member-2', createTestMember('member-2', 'Role 2')],
    ]);

    const result = detectPartnerReferencesV2(output, ['member-1', 'member-2'], memberById, 'structured');

    expect(result.referenceQuality).toBe(0.5);
  });
});

describe('communication.ts - buildCommunicationContext', () => {
  it('連携相手の要約を含める', () => {
    const team = createTestTeam('team-1', 'Team 1', 3);
    const member = team.members[0];
    const contextMap = buildPrecomputedContextMap([
      createTestMemberResult('member-1', 'Role 1'),
      createTestMemberResult('member-2', 'Role 2'),
    ]);

    const context = buildCommunicationContext({
      team,
      member: member!,
      round: 1,
      partnerIds: ['member-1', 'member-2'],
      contextMap,
    });

    expect(context).toContain('コミュニケーションラウンド: 1');
    expect(context).toContain('連携相手と要約:');
  });

  it('連携指示を含める', () => {
    const team = createTestTeam('team-1', 'Team 1', 2);
    const member = team.members[0];
    const contextMap = buildPrecomputedContextMap([
      createTestMemberResult('member-2', 'Role 2'),
    ]);

    const context = buildCommunicationContext({
      team,
      member: member!,
      round: 1,
      partnerIds: ['member-2'],
      contextMap,
    });

    expect(context).toContain('連携指示:');
    expect(context).toContain('連携相手の主張に最低1件は明示的に言及すること。');
  });

  it('連携相手がない場合のメッセージ', () => {
    const team = createTestTeam('team-1', 'Team 1', 1);
    const member = team.members[0];
    const contextMap = buildPrecomputedContextMap([]);

    const context = buildCommunicationContext({
      team,
      member: member!,
      round: 1,
      partnerIds: [],
      contextMap,
    });

    expect(context).toContain('連携相手は未設定です。');
  });
});

describe('communication.ts - detectPartnerReferences', () => {
  it('パートナーIDを検出する', () => {
    const output = 'I agree with member-1';
    const memberById = new Map([
      ['member-1', createTestMember('member-1', 'Role 1')],
      ['member-2', createTestMember('member-2', 'Role 2')],
    ]);

    const result = detectPartnerReferences(output, ['member-1', 'member-2'], memberById);

    expect(result.referencedPartners).toContain('member-1');
  });

  it('ロール名を検出する', () => {
    const output = 'I agree with Researcher';
    const memberById = new Map([
      ['member-1', createTestMember('member-1', 'Researcher')],
      ['member-2', createTestMember('member-2', 'Reviewer')],
    ]);

    const result = detectPartnerReferences(output, ['member-1', 'member-2'], memberById);

    expect(result.referencedPartners).toContain('member-1');
  });

  it('未参照パートナーを検出する', () => {
    const output = 'I agree with member-1';
    const memberById = new Map([
      ['member-1', createTestMember('member-1', 'Role 1')],
      ['member-2', createTestMember('member-2', 'Role 2')],
    ]);

    const result = detectPartnerReferences(output, ['member-1', 'member-2'], memberById);

    expect(result.missingPartners).toContain('member-2');
  });
});

describe('communication.ts - checkTermination', () => {
  it('完了条件を満たす場合はtrueを返す', () => {
    const results = [
      createTestMemberResult('member-1', 'Role 1', 'completed', 0.9, 3),
      createTestMemberResult('member-2', 'Role 2', 'completed', 0.8, 2),
    ];
    results[0].output = 'SUMMARY: Test\nCLAIM: Test claim\nEVIDENCE: e1, e2, e3\nRESULT: Test result\nCONFIDENCE: 0.9';
    results[1].output = 'SUMMARY: Test\nCLAIM: Test claim\nEVIDENCE: e1, e2\nRESULT: Test result\nCONFIDENCE: 0.8';

    const check = checkTermination('Test task', results, 0.7);

    expect(check.canTerminate).toBe(true);
    expect(check.recommendation).toBe('proceed');
  });

  it('SUMMARYが欠損している場合はfalse', () => {
    const results = [createTestMemberResult('member-1', 'Role 1')];
    results[0].output = 'CLAIM: Test claim\nEVIDENCE: e1';

    const check = checkTermination('Test task', results, 0.7);

    expect(check.canTerminate).toBe(false);
    expect(check.missingElements).toContain('1 members missing SUMMARY field');
  });

  it('RESULTが欠損している場合はfalse', () => {
    const results = [createTestMemberResult('member-1', 'Role 1')];
    results[0].output = 'SUMMARY: Test\nCLAIM: Test claim\nEVIDENCE: e1';

    const check = checkTermination('Test task', results, 0.7);

    expect(check.canTerminate).toBe(false);
    expect(check.missingElements).toContain('1 members missing RESULT field');
  });

  it('証拠がない場合は疑わしいパターン', () => {
    const results = [
      createTestMemberResult('member-1', 'Role 1', 'completed', 0.9, 0),
      createTestMemberResult('member-2', 'Role 2', 'completed', 0.8, 0),
    ];

    const check = checkTermination('Test task', results, 0.7);

    expect(check.suspiciousPatterns).toContain('2 members provided no evidence');
  });

  it('高信頼度で証拠が少ない場合は疑わしい', () => {
    const results = [
      createTestMemberResult('member-1', 'Role 1', 'completed', 0.9, 1),
    ];

    const check = checkTermination('Test task', results, 0.7);

    expect(check.suspiciousPatterns.length).toBeGreaterThan(0);
  });

  it('失敗メンバーがいる場合は未完了', () => {
    const results = [
      createTestMemberResult('member-1', 'Role 1', 'completed', 0.9, 3),
      createTestMemberResult('member-2', 'Role 2', 'failed', 0.1, 0),
    ];

    const check = checkTermination('Test task', results, 0.7);

    expect(check.missingElements).toContain('1 members failed to complete');
  });

  it('完了スコアを計算する', () => {
    const results = [
      createTestMemberResult('member-1', 'Role 1', 'completed', 0.9, 3),
      createTestMemberResult('member-2', 'Role 2', 'completed', 0.8, 2),
    ];
    results.forEach(r => {
      r.output = `SUMMARY: Test\nCLAIM: Test\nEVIDENCE: e1, e2, e3\nRESULT: Test\nCONFIDENCE: 0.8`;
    });

    const check = checkTermination('Test task', results, 0.7);

    expect(check.completionScore).toBeGreaterThanOrEqual(0);
    expect(check.completionScore).toBeLessThanOrEqual(1);
  });
});

describe('communication.ts - extractField', () => {
  it('フィールド値を抽出する', () => {
    const output = 'SUMMARY: Test summary\nCLAIM: Test claim';
    expect(extractField(output, 'SUMMARY')).toBe('Test summary');
    expect(extractField(output, 'CLAIM')).toBe('Test claim');
  });

  it('フィールドが見つからない場合はundefined', () => {
    const output = 'SUMMARY: Test summary';
    expect(extractField(output, 'CLAIM')).toBeUndefined();
  });

  it('大文字小文字を区別しない', () => {
    const output = 'summary: Test summary';
    expect(extractField(output, 'SUMMARY')).toBe('Test summary');
  });

  it('前後の空白をトリムする', () => {
    const output = 'SUMMARY:  Test summary  ';
    expect(extractField(output, 'SUMMARY')).toBe('Test summary');
  });
});

describe('communication.ts - 定数', () => {
  it('定数が正しく定義されている', () => {
    expect(DEFAULT_COMMUNICATION_ROUNDS).toBe(1);
    expect(MAX_COMMUNICATION_ROUNDS).toBe(2);
    expect(MAX_COMMUNICATION_PARTNERS).toBe(3);
    expect(COMMUNICATION_CONTEXT_FIELD_LIMIT).toBe(180);
  });

  it('命令パターンが正しく定義されている', () => {
    expect(COMMUNICATION_INSTRUCTION_PATTERN).toBeInstanceOf(RegExp);
    expect(COMMUNICATION_INSTRUCTION_PATTERN.test('ignore this')).toBe(true);
    expect(COMMUNICATION_INSTRUCTION_PATTERN.test('must do this')).toBe(true);
    expect(COMMUNICATION_INSTRUCTION_PATTERN.test('指示に従う')).toBe(true);
  });
});

describe('communication.ts - プロパティベーステスト', () => {
  it('正規化後の値は有効範囲内', () => {
    fc.assert(
      fc.property(fc.integer({ min: -10, max: 100 }), (value) => {
        const normalized = normalizeCommunicationRounds(value);
        return normalized >= 0 && normalized <= MAX_COMMUNICATION_ROUNDS;
      }),
    );
  });

  it('サニタイズされたテキストは制限文字数以下', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const sanitized = sanitizeCommunicationSnippet(text, 'fallback');
        return sanitized.length <= COMMUNICATION_CONTEXT_FIELD_LIMIT || sanitized === 'fallback';
      }),
    );
  });

  it('参照品質スコアは0から1の範囲', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { minLength: 1, maxLength: 10 }),
        fc.string(),
        (partnerIds, output) => {
          const memberById = new Map(partnerIds.map(id => [id, createTestMember(id, 'Role')]));
          const result = detectPartnerReferencesV2(output, partnerIds, memberById, 'structured');
          return result.referenceQuality >= 0 && result.referenceQuality <= 1;
        },
      ),
    );
  });
});

describe('communication.ts - エッジケース', () => {
  it('空のパートナーID配列', () => {
    const result = detectPartnerReferences('output', [], new Map());
    expect(result.referencedPartners).toEqual([]);
    expect(result.missingPartners).toEqual([]);
  });

  it('空のメンバー結果', () => {
    const contextMap = buildPrecomputedContextMap([]);
    expect(contextMap.size).toBe(0);
  });

  it('空のチームメンバー', () => {
    const links = createCommunicationLinksMap([]);
    expect(links.size).toBe(0);
  });

  it('空のタスク文字列', () => {
    const results = [createTestMemberResult('member-1', 'Role 1')];
    const check = checkTermination('', results, 0.7);
    expect(check).toBeDefined();
  });

  it('空の出力文字列', () => {
    const check = checkTermination('task', [], 0.7);
    expect(check.canTerminate).toBe(false);
  });
});
