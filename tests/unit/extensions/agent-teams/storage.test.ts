/**
 * storage.ts テスト
 *
 * チーム定義の永続化・ロード・バリデーションをテスト
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync, unlinkSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as fc from 'fast-check';

// モックの設定（テスト対象のインポート前に行う必要がある）
vi.mock('node:fs', async (importOriginal) => {
  const mod = await importOriginal<typeof import('node:fs')>();
  return {
    ...mod,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    statSync: vi.fn(),
    openSync: vi.fn(() => 1), // ロックファイル作成用のファイル記述子を返す
    closeSync: vi.fn(() => {}),
    renameSync: vi.fn(() => {}), // リネーム操作を成功させる
  };
});
vi.mock('../../../.pi/lib/storage-lock', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../.pi/lib/storage-lock')>();
  return {
    ...mod,
    withFileLock: vi.fn((_, fn) => {
      // コールバックを即時実行し、ロック取得のシミュレーションを回避
      return fn();
    }),
    atomicWriteTextFile: vi.fn((path, content) => {
      // writeFileSyncを呼び出してファイルを書き込む
      writeFileSync(path, content, 'utf-8');
    }),
  };
});

// テスト対象のモジュール
import {
  toId,
  loadStorage,
  saveStorage,
  saveStorageWithPatterns,
  getPaths,
  ensurePaths,
  MAX_RUNS_TO_KEEP,
  TEAM_DEFAULTS_VERSION,
  type TeamStorage,
  type TeamDefinition,
  type TeamMember,
  type TeamMemberResult,
  type TeamRunRecord,
  type TeamEnabledState,
  type TeamStrategy,
  type TeamJudgeVerdict,
  type TeamFinalJudge,
  type ClaimReference,
  type DiscussionAnalysis,
  type TeamCommunicationAuditEntry,
} from '.pi/extensions/agent-teams/storage.js';

import {
  createTestTeam,
  createTestRunRecord,
  createTestStorage,
  createTestMember,
  testIsoTime,
} from './mocks';

/**
 * テスト用の一時ディレクトリパス
 */
const TEST_CWD = '/tmp/agent-teams-test';

describe('storage.ts - toId', () => {
  describe('基本機能', () => {
    it('小文字に変換してIDを生成する', () => {
      expect(toId('TeamName')).toBe('teamname');
      expect(toId('TEAMNAME')).toBe('teamname');
    });

    it('空白をハイフンに変換する', () => {
      expect(toId('team name')).toBe('team-name');
      expect(toId('team  name')).toBe('team-name');
    });

    it('アンダースコアをハイフンに変換する', () => {
      expect(toId('team_name')).toBe('team-name');
      expect(toId('team__name')).toBe('team-name');
    });

    it('連続するハイフンを1つにまとめる', () => {
      expect(toId('team--name')).toBe('team-name');
      expect(toId('team---name')).toBe('team-name');
    });

    it('先頭と末尾のハイフンを削除する', () => {
      expect(toId('-team-name')).toBe('team-name');
      expect(toId('team-name-')).toBe('team-name');
      expect(toId('-team-name-')).toBe('team-name');
    });

    it('特殊文字を削除する', () => {
      expect(toId('team@name!')).toBe('teamname');
      expect(toId('team.name#')).toBe('teamname');
    });

    it('英数字とハイフンのみを保持する', () => {
      expect(toId('team123-name456')).toBe('team123-name456');
    });

    it('最大48文字に制限する', () => {
      const longInput = 'a'.repeat(100);
      expect(toId(longInput)).toHaveLength(48);
    });
  });

  describe('エッジケース', () => {
    it('空文字列の場合は空文字を返す', () => {
      expect(toId('')).toBe('');
    });

    it('空白のみの場合は空文字を返す', () => {
      expect(toId('   ')).toBe('');
    });

    it('特殊文字のみの場合は空文字を返す', () => {
      expect(toId('!@#$%')).toBe('');
    });

    it('先頭と末尾の空白を削除する', () => {
      expect(toId('  team-name  ')).toBe('team-name');
    });

    it('日本語を削除する', () => {
      expect(toId('チーム名')).toBe('');
    });
  });

  describe('プロパティベーステスト', () => {
    it('結果は常に小文字である', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = toId(input);
          return result === result.toLowerCase();
        }),
      );
    });

    it('結果には英数字とハイフンのみが含まれる', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = toId(input);
          return /^[a-z0-9-]*$/.test(result);
        }),
      );
    });

    it('結果は48文字以下である', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = toId(input);
          return result.length <= 48;
        }),
      );
    });

    it('同じ入力から同じIDが生成される', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const id1 = toId(input);
          const id2 = toId(input);
          return id1 === id2;
        }),
      );
    });
  });
});

describe('storage.ts - TeamDefinition 型', () => {
  it('TeamDefinition 型定義が正しくエクスポートされている', () => {
    const team: TeamDefinition = createTestTeam('test-team', 'Test Team');
    expect(team.id).toBe('test-team');
    expect(team.name).toBe('Test Team');
    expect(team.enabled).toBe('enabled');
    expect(team.members).toHaveLength(3);
    expect(team.createdAt).toBeDefined();
    expect(team.updatedAt).toBeDefined();
  });

  it('TeamMember 型定義が正しくエクスポートされている', () => {
    const member: TeamMember = createTestMember('member-1', 'Role 1');
    expect(member.id).toBe('member-1');
    expect(member.role).toBe('Role 1');
    expect(member.enabled).toBe(true);
  });

  it('TeamEnabledState 型が正しく使用できる', () => {
    const state1: TeamEnabledState = 'enabled';
    const state2: TeamEnabledState = 'disabled';
    expect(state1).toBe('enabled');
    expect(state2).toBe('disabled');
  });

  it('TeamStrategy 型が正しく使用できる', () => {
    const strategy1: TeamStrategy = 'parallel';
    const strategy2: TeamStrategy = 'sequential';
    expect(strategy1).toBe('parallel');
    expect(strategy2).toBe('sequential');
  });

  it('TeamJudgeVerdict 型が正しく使用できる', () => {
    const verdict1: TeamJudgeVerdict = 'trusted';
    const verdict2: TeamJudgeVerdict = 'partial';
    const verdict3: TeamJudgeVerdict = 'untrusted';
    expect(verdict1).toBe('trusted');
    expect(verdict2).toBe('partial');
    expect(verdict3).toBe('untrusted');
  });
});

describe('storage.ts - getPaths', () => {
  it('正しいストレージパスを返す', () => {
    const paths = getPaths(TEST_CWD);
    expect(paths.baseDir).toBe(join(TEST_CWD, '.pi', '.agent-teams-storage'));
    expect(paths.runsDir).toBe(join(TEST_CWD, '.pi', '.agent-teams-storage', 'runs'));
    expect(paths.storageFile).toBe(join(TEST_CWD, '.pi', '.agent-teams-storage', 'storage.json'));
  });
});

describe('storage.ts - loadStorage', () => {
  beforeEach(() => {
    vi.mocked(existsSync).mockClear();
    vi.mocked(readFileSync).mockClear();
  });

  it('ストレージファイルがない場合はデフォルトストレージを返す', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const storage = loadStorage(TEST_CWD);
    expect(storage.teams).toEqual([]);
    expect(storage.runs).toEqual([]);
    expect(storage.currentTeamId).toBeUndefined();
    expect(storage.defaultsVersion).toBe(TEAM_DEFAULTS_VERSION);
  });

  it('有効なストレージファイルを読み込む', () => {
    const mockStorage: TeamStorage = createTestStorage();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockStorage));

    const storage = loadStorage(TEST_CWD);
    expect(storage.teams).toHaveLength(1);
    expect(storage.runs).toHaveLength(1);
    expect(storage.defaultsVersion).toBe(3);
  });

  it('破損したJSONの場合はフォールバックを返す', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('{invalid json');

    const storage = loadStorage(TEST_CWD);
    expect(storage.teams).toEqual([]);
    expect(storage.runs).toEqual([]);
    expect(storage.defaultsVersion).toBe(TEAM_DEFAULTS_VERSION);
  });

  it('部分データでも正常にパースする', () => {
    const partialStorage = {
      teams: [{ id: 'team-1', name: 'Team 1', description: 'desc', enabled: 'enabled', members: [], createdAt: testIsoTime(), updatedAt: testIsoTime() }],
      runs: [],
      currentTeamId: 'team-1',
    };
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(partialStorage));

    const storage = loadStorage(TEST_CWD);
    expect(storage.teams).toHaveLength(1);
    expect(storage.currentTeamId).toBe('team-1');
    expect(storage.defaultsVersion).toBe(0); // デフォルト値
  });

  it('無効な型はデフォルト値に置き換える', () => {
    const invalidStorage = {
      teams: 'not-an-array',
      runs: 'not-an-array',
      currentTeamId: 123,
      defaultsVersion: 'not-a-number',
    };
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(invalidStorage));

    const storage = loadStorage(TEST_CWD);
    expect(storage.teams).toEqual([]);
    expect(storage.runs).toEqual([]);
    expect(storage.currentTeamId).toBeUndefined();
    expect(storage.defaultsVersion).toBe(0);
  });

  it('teams配列でない場合は空配列に置き換える', () => {
    const invalidStorage = {
      teams: { invalid: 'object' },
      runs: [],
      defaultsVersion: 3,
    };
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(invalidStorage));

    const storage = loadStorage(TEST_CWD);
    expect(storage.teams).toEqual([]);
    expect(storage.runs).toEqual([]);
  });
});

describe('storage.ts - saveStorage', () => {
  let savedContent: string | undefined;
  let writeCalls: Array<{ path: unknown; content: string }> = [];

  beforeEach(() => {
    vi.mocked(writeFileSync).mockClear();
    savedContent = undefined;
    writeCalls = [];

    // existsSyncをモックしてロックファイルが存在しないように設定
    vi.mocked(existsSync).mockImplementation((path) => {
      if (typeof path === 'string' && path.includes('.lock')) {
        return false; // ロックファイルは存在しない
      }
      return true; // 他のファイルは存在する
    });
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ teams: [], runs: [], defaultsVersion: 3 }));

    // writeFileSyncの呼び出しを記録
    vi.mocked(writeFileSync).mockImplementation((path, content) => {
      writeCalls.push({ path, content: content as string });
      // atomicWriteTextFileはテンポラリファイルに書き込むので、
      // テンポラリファイルへの書き込みをキャプチャしてリネーム時に使用
      if (typeof path === 'string' && path.includes('.tmp-')) {
        savedContent = content as string;
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ストレージを正しく保存する', () => {
    const storage = createTestStorage(2, 5);
    saveStorage(TEST_CWD, storage);

    // writeFileSyncが呼び出されたことを確認（atomicWriteTextFileを経由して）
    expect(savedContent).toBeDefined();

    const parsed = JSON.parse(savedContent!) as TeamStorage;
    expect(parsed.teams).toHaveLength(2);
    expect(parsed.runs).toHaveLength(Math.min(5, MAX_RUNS_TO_KEEP));
    expect(parsed.defaultsVersion).toBe(TEAM_DEFAULTS_VERSION);
  });

  it('MAX_RUNS_TO_KEEPより古い実行記録を削除する', () => {
    const manyRuns: TeamRunRecord[] = [];
    for (let i = 0; i < MAX_RUNS_TO_KEEP + 10; i++) {
      manyRuns.push(createTestRunRecord(`run-${i}`, 'team-1'));
    }
    const storage: TeamStorage = {
      teams: [createTestTeam('team-1', 'Team 1')],
      runs: manyRuns,
      defaultsVersion: 3,
    };

    saveStorage(TEST_CWD, storage);

    expect(savedContent).toBeDefined();
    const parsed = JSON.parse(savedContent!) as TeamStorage;

    expect(parsed.runs).toHaveLength(MAX_RUNS_TO_KEEP);
    expect(parsed.runs[0].runId).toBe('run-10'); // 古い10件が削除されている
  });

  it('defaultsVersionを強制的に更新する', () => {
    const storage: TeamStorage = {
      teams: [createTestTeam('team-1', 'Team 1')],
      runs: [],
      defaultsVersion: 0,
    };

    saveStorage(TEST_CWD, storage);

    expect(savedContent).toBeDefined();
    const parsed = JSON.parse(savedContent!) as TeamStorage;

    expect(parsed.defaultsVersion).toBe(TEAM_DEFAULTS_VERSION);
  });
});

describe('storage.ts - プロパティベーステスト', () => {
  describe('TeamDefinitionの不変条件', () => {
    it('一意でないIDの配列は重複を含む', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 48 }), { minLength: 2, maxLength: 10 }),
          (ids) => {
            const uniqueIds = new Set(ids);
            // チームIDが一意でない場合、配列長とセット長が異なる可能性がある
            return uniqueIds.size <= ids.length;
          },
        ),
      );
    });

    it('チームには少なくとも1人のメンバーが必要', () => {
      const teams = fc.sample(
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 48 }),
          name: fc.string({ minLength: 1, maxLength: 100 }),
          description: fc.string(),
          enabled: fc.constantFrom('enabled', 'disabled'),
          members: fc.array(fc.object()),
          createdAt: fc.string(),
          updatedAt: fc.string(),
        }),
        100,
      );

      const validTeams = teams.filter((team) => team.members.length > 0);
      expect(validTeams.length).toBeGreaterThan(0);
    });
  });

  describe('toIdのエッジケース', () => {
    it('特殊文字の組み合わせを正しく処理する', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = toId(input);
          return /^[a-z0-9-]*$/.test(result) && result.length <= 48;
        }),
      );
    });

    it('連続する空白文字を正規化する', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = toId(input);
          return !/--/.test(result);
        }),
      );
    });
  });
});

describe('storage.ts - 定数', () => {
  it('MAX_RUNS_TO_KEEPが定義されている', () => {
    expect(MAX_RUNS_TO_KEEP).toBe(100);
  });

  it('TEAM_DEFAULTS_VERSIONが定義されている', () => {
    expect(TEAM_DEFAULTS_VERSION).toBe(3);
  });
});

describe('storage.ts - 型エクスポート', () => {
  it('TeamMemberResult型が正しくエクスポートされている', () => {
    const result: TeamMemberResult = {
      memberId: 'member-1',
      role: 'Role 1',
      summary: 'Summary',
      output: 'Output',
      status: 'completed',
      latencyMs: 100,
      diagnostics: {
        confidence: 0.9,
        evidenceCount: 3,
        contradictionSignals: 0,
        conflictSignals: 0,
      },
    };
    expect(result.memberId).toBe('member-1');
  });

  it('TeamFinalJudge型が正しくエクスポートされている', () => {
    const judge: TeamFinalJudge = {
      verdict: 'trusted',
      confidence: 0.9,
      reason: 'Reason',
      nextStep: 'Next step',
      uIntra: 0.1,
      uInter: 0.2,
      uSys: 0.15,
      collapseSignals: [],
      rawOutput: '',
    };
    expect(judge.verdict).toBe('trusted');
  });

  it('ClaimReference型が正しくエクスポートされている', () => {
    const claimRef: ClaimReference = {
      claimId: 'member-1:0',
      memberId: 'member-1',
      stance: 'agree',
      confidence: 0.9,
    };
    expect(claimRef.stance).toBe('agree');
  });

  it('DiscussionAnalysis型が正しくエクスポートされている', () => {
    const analysis: DiscussionAnalysis = {
      references: [],
      stanceDistribution: {
        agree: 1,
        disagree: 0,
        neutral: 0,
        partial: 0,
      },
    };
    expect(analysis.stanceDistribution.agree).toBe(1);
  });

  it('TeamCommunicationAuditEntry型が正しくエクスポートされている', () => {
    const audit: TeamCommunicationAuditEntry = {
      round: 1,
      memberId: 'member-1',
      role: 'Role 1',
      partnerIds: ['member-2'],
      referencedPartners: ['member-2'],
      missingPartners: [],
      contextPreview: 'Context',
      partnerSnapshots: [],
      resultStatus: 'completed',
    };
    expect(audit.round).toBe(1);
  });
});
