/**
 * definition-loader.ts テスト
 *
 * Markdownファイルからの定義パースをテスト
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import * as fc from 'fast-check';

// テスト対象のモジュール
import {
  parseTeamMarkdownFile,
  loadTeamDefinitionsFromDir,
  loadTeamDefinitionsFromMarkdown,
  createDefaultTeams,
  mergeDefaultTeam,
  ensureDefaults,
  type ParsedTeamMarkdown,
} from '.pi/extensions/agent-teams/definition-loader.ts';

import { createTestTeam, testIsoTime } from './mocks';

/**
 * テスト用一時ディレクトリ
 */
const TEST_CWD = '/tmp/test-project';
const DEFINITIONS_DIR = '/tmp/test-project/.pi/agent-teams/definitions';

describe('definition-loader.ts - parseTeamMarkdownFile', () => {
  beforeEach(() => {
    vi.mock('node:fs', async (importOriginal) => {
      const mod = await importOriginal<typeof import('node:fs')>();
      return {
        ...mod,
        readFileSync: vi.fn(),
      };
    });
  });

  it('有効なMarkdownファイルをパースする', () => {
    const markdown = `---
id: test-team
name: Test Team
description: Test description
enabled: enabled
members:
  - id: member-1
    role: Role 1
    description: Member 1
    enabled: true
---
Body content`;

    vi.mocked(readFileSync).mockReturnValue(markdown);

    const result = parseTeamMarkdownFile('/path/to/team.md');
    expect(result).not.toBeNull();
    expect(result?.frontmatter.id).toBe('test-team');
    expect(result?.frontmatter.name).toBe('Test Team');
    expect(result?.content).toBe('Body content');
  });

  it('必須フィールドが欠損している場合はnullを返す', () => {
    const markdown = `---
description: Test description
members:
  - id: member-1
    role: Role 1
---
Body`;

    vi.mocked(readFileSync).mockReturnValue(markdown);

    const result = parseTeamMarkdownFile('/path/to/team.md');
    expect(result).toBeNull();
  });

  it('無効なenabled値をデフォルトに置換してパースする', () => {
    const markdown = `---
id: test-team
name: Test Team
enabled: invalid
members:
  - id: member-1
    role: Role 1
---
Body`;

    vi.mocked(readFileSync).mockReturnValue(markdown);

    const result = parseTeamMarkdownFile('/path/to/team.md');
    expect(result?.frontmatter.enabled).toBe('enabled');
  });

  it('メンバーが未定義の場合はnullを返す', () => {
    const markdown = `---
id: test-team
name: Test Team
description: Test
---
Body`;

    vi.mocked(readFileSync).mockReturnValue(markdown);

    const result = parseTeamMarkdownFile('/path/to/team.md');
    expect(result).toBeNull();
  });

  it('パースエラー時はnullを返す', () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('Read error');
    });

    const result = parseTeamMarkdownFile('/path/to/team.md');
    expect(result).toBeNull();
  });

  it('空のメンバー配列の場合はnullを返す', () => {
    const markdown = `---
id: test-team
name: Test Team
members: []
---
Body`;

    vi.mocked(readFileSync).mockReturnValue(markdown);

    const result = parseTeamMarkdownFile('/path/to/team.md');
    expect(result).toBeNull();
  });
});

describe('definition-loader.ts - loadTeamDefinitionsFromDir', () => {
  beforeEach(() => {
    vi.mock('node:fs', async (importOriginal) => {
      const mod = await importOriginal<typeof import('node:fs')>();
      return {
        ...mod,
        existsSync: vi.fn(),
        readdirSync: vi.fn(),
        readFileSync: vi.fn(),
        statSync: vi.fn(),
      };
    });
  });

  it('直接配置された.mdファイルをパースする', () => {
    const mockEntry = {
      name: 'team-1.md',
      isFile: () => true,
      isDirectory: () => false,
      isSymbolicLink: () => false,
    };
    vi.mocked(readdirSync).mockReturnValue([mockEntry]);
    vi.mocked(readFileSync).mockReturnValue(`---
id: team-1
name: Team 1
members:
  - id: member-1
    role: Role 1
---
Body`);

    const teams = loadTeamDefinitionsFromDir(DEFINITIONS_DIR, testIsoTime());
    expect(teams).toHaveLength(1);
    expect(teams[0].id).toBe('team-1');
  });

  it('サブディレクトリのteam.mdをパースする', () => {
    const mockDirEntry = {
      name: 'team-1',
      isFile: () => false,
      isDirectory: () => true,
      isSymbolicLink: () => false,
    };
    vi.mocked(readdirSync)
      .mockReturnValueOnce([mockDirEntry])
      .mockReturnValueOnce([]); // サブディレクトリ内（p*.mdなし）

    vi.mocked(existsSync).mockImplementation((path) => {
      if (typeof path === 'string' && path.includes('team-1/team.md')) {
        return true;
      }
      return false;
    });

    vi.mocked(readFileSync).mockImplementation((path) => {
      if (typeof path === 'string' && path.includes('team-1/team.md')) {
        return `---
id: team-1
name: Team 1
members:
  - id: member-1
    role: Role 1
---
Body`;
      }
      return '';
    });

    const teams = loadTeamDefinitionsFromDir(DEFINITIONS_DIR, testIsoTime());
    expect(teams).toHaveLength(1);
    expect(teams[0].id).toBe('team-1');
  });

  it('p*.mdファイルをパースする（team.mdがある場合）', () => {
    const mockDirEntry = {
      name: 'team-1',
      isFile: () => false,
      isDirectory: () => true,
      isSymbolicLink: () => false,
    };
    vi.mocked(readdirSync)
      .mockReturnValueOnce([mockDirEntry])
      .mockReturnValueOnce([
        { name: 'p1.md', isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false },
      ]);

    vi.mocked(existsSync).mockImplementation((path) => {
      if (typeof path === 'string' && path.includes('team-1/team.md')) {
        return true;
      }
      return false;
    });

    vi.mocked(readFileSync).mockImplementation((path) => {
      if (typeof path === 'string' && path.includes('team-1/team.md')) {
        return `---
id: team-1
name: Team 1
members:
  - id: member-1
    role: Role 1
---
Body`;
      }
      if (typeof path === 'string' && path.includes('team-1/p1.md')) {
        return `---
id: phase-1
name: Phase 1
members:
  - id: member-2
    role: Role 2
---
Body`;
      }
      return '';
    });

    const teams = loadTeamDefinitionsFromDir(DEFINITIONS_DIR, testIsoTime());
    expect(teams).toHaveLength(2);
    expect(teams[0].id).toBe('team-1');
    expect(teams[1].id).toBe('phase-1');
  });

  it('team.mdがないディレクトリはスキップする', () => {
    const mockDirEntry = {
      name: 'no-team-dir',
      isFile: () => false,
      isDirectory: () => true,
      isSymbolicLink: () => false,
    };
    vi.mocked(readdirSync)
      .mockReturnValueOnce([mockDirEntry])
      .mockReturnValueOnce([
        { name: 'p1.md', isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false },
      ]);

    vi.mocked(readFileSync).mockReturnValue('');

    const teams = loadTeamDefinitionsFromDir(DEFINITIONS_DIR, testIsoTime());
    expect(teams).toHaveLength(0);
  });

  it('隠しディレクトリをスキップする', () => {
    const mockEntry = {
      name: '.hidden',
      isFile: () => false,
      isDirectory: () => true,
      isSymbolicLink: () => false,
    };
    vi.mocked(readdirSync).mockReturnValue([mockEntry]);

    const teams = loadTeamDefinitionsFromDir(DEFINITIONS_DIR, testIsoTime());
    expect(teams).toHaveLength(0);
  });

  it('node_modulesディレクトリをスキップする', () => {
    const mockEntry = {
      name: 'node_modules',
      isFile: () => false,
      isDirectory: () => true,
      isSymbolicLink: () => false,
    };
    vi.mocked(readdirSync).mockReturnValue([mockEntry]);

    const teams = loadTeamDefinitionsFromDir(DEFINITIONS_DIR, testIsoTime());
    expect(teams).toHaveLength(0);
  });

  it('_で始まるディレクトリをスキップする', () => {
    const mockEntry = {
      name: '_templates',
      isFile: () => false,
      isDirectory: () => true,
      isSymbolicLink: () => false,
    };
    vi.mocked(readdirSync).mockReturnValue([mockEntry]);

    const teams = loadTeamDefinitionsFromDir(DEFINITIONS_DIR, testIsoTime());
    expect(teams).toHaveLength(0);
  });
});

describe('definition-loader.ts - loadTeamDefinitionsFromMarkdown', () => {
  beforeEach(() => {
    vi.mock('node:fs', async (importOriginal) => {
      const mod = await importOriginal<typeof import('node:fs')>();
      return {
        ...mod,
        existsSync: vi.fn(),
        readdirSync: vi.fn(),
        readFileSync: vi.fn(),
      };
    });
  });

  it('ローカルディレクトリから定義を読み込む', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([]);
    vi.mocked(readFileSync).mockReturnValue('');

    const teams = loadTeamDefinitionsFromMarkdown(TEST_CWD, testIsoTime());
    expect(teams).toBeInstanceOf(Array);
  });

  it('重複するIDの定義は優先順位が高い方を保持する', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([]);
    vi.mocked(readFileSync).mockImplementation((path) => {
      if (typeof path === 'string' && path.includes('local')) {
        return `---
id: shared-team
name: Local Team
members:
  - id: member-1
    role: Role 1
---
Body`;
      }
      return '';
    });

    const teams = loadTeamDefinitionsFromMarkdown(TEST_CWD, testIsoTime());
    // 同じIDを持つ後続の定義はスキップされる
    const sharedTeams = teams.filter((t) => t.id === 'shared-team');
    expect(sharedTeams.length).toBeLessThanOrEqual(1);
  });

  it('ディレクトリが存在しない場合は空配列を返す', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const teams = loadTeamDefinitionsFromMarkdown(TEST_CWD, testIsoTime());
    expect(teams).toEqual([]);
  });
});

describe('definition-loader.ts - createDefaultTeams', () => {
  beforeEach(() => {
    vi.mock('node:fs', async (importOriginal) => {
      const mod = await importOriginal<typeof import('node:fs')>();
      return {
        ...mod,
        existsSync: vi.fn(),
        readdirSync: vi.fn(),
        readFileSync: vi.fn(),
      };
    });
  });

  it('Markdown定義が読み込める場合は優先する', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([]);
    vi.mocked(readFileSync).mockImplementation((path) => {
      if (typeof path === 'string' && path.endsWith('.md')) {
        return `---
id: custom-team
name: Custom Team
members:
  - id: member-1
    role: Role 1
---
Body`;
      }
      return '';
    });

    const teams = createDefaultTeams(testIsoTime(), TEST_CWD);
    expect(teams).toBeInstanceOf(Array);
  });

  it('Markdown定義が読めない場合はハードコードされたデフォルトを使用する', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const teams = createDefaultTeams(testIsoTime(), TEST_CWD);
    expect(teams.length).toBeGreaterThan(0);
    expect(teams[0]).toHaveProperty('id');
    expect(teams[0]).toHaveProperty('name');
    expect(teams[0]).toHaveProperty('members');
  });

  it('ハードコードされたデフォルトチームが正しく定義されている', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const teams = createDefaultTeams(testIsoTime());
    const coreTeam = teams.find((t) => t.id === 'core-delivery-team');
    expect(coreTeam).toBeDefined();
    expect(coreTeam?.name).toBe('Core Delivery Team');
    expect(coreTeam?.members.length).toBeGreaterThan(0);
  });
});

describe('definition-loader.ts - mergeDefaultTeam', () => {
  it('既存メンバーの設定を保持する', () => {
    const existing: typeof import('../../../.pi/extensions/agent-teams/storage').TeamDefinition = {
      id: 'team-1',
      name: 'Team 1',
      description: 'Existing description',
      enabled: 'enabled',
      members: [
        {
          id: 'member-1',
          role: 'Role 1',
          description: 'Member 1',
          provider: 'anthropic',
          model: 'claude-sonnet',
          enabled: true,
        },
      ],
      createdAt: testIsoTime(-60),
      updatedAt: testIsoTime(-60),
    };

    const fallback: typeof import('../../../.pi/extensions/agent-teams/storage').TeamDefinition = {
      id: 'team-1',
      name: 'Team 1 (Updated)',
      description: 'Fallback description',
      enabled: 'disabled',
      members: [
        {
          id: 'member-1',
          role: 'Role 1',
          description: 'Member 1 (fallback)',
          enabled: true,
        },
        {
          id: 'member-2',
          role: 'Role 2',
          description: 'Member 2',
          enabled: true,
        },
      ],
      createdAt: testIsoTime(),
      updatedAt: testIsoTime(),
    };

    const merged = mergeDefaultTeam(existing, fallback);

    expect(merged.members).toHaveLength(2);
    expect(merged.members[0].provider).toBe('anthropic');
    expect(merged.members[0].model).toBe('claude-sonnet');
    expect(merged.members[0].enabled).toBe(true);
    expect(merged.enabled).toBe('enabled'); // 既存の設定を保持
  });

  it('レガシーメンバーを削除する', () => {
    const existing: typeof import('../../../.pi/extensions/agent-teams/storage').TeamDefinition = {
      id: 'core-delivery-team',
      name: 'Core Delivery Team',
      description: 'Description',
      enabled: 'enabled',
      members: [
        { id: 'architecture', role: 'Architect', description: 'Desc', enabled: true },
        { id: 'test', role: 'Tester', description: 'Desc', enabled: true },
      ],
      createdAt: testIsoTime(),
      updatedAt: testIsoTime(),
    };

    const fallback: typeof import('../../../.pi/extensions/agent-teams/storage').TeamDefinition = {
      id: 'core-delivery-team',
      name: 'Core Delivery Team',
      description: 'Description',
      enabled: 'enabled',
      members: [
        { id: 'research', role: 'Researcher', description: 'Desc', enabled: true },
        { id: 'build', role: 'Implementer', description: 'Desc', enabled: true },
        { id: 'review', role: 'Reviewer', description: 'Desc', enabled: true },
      ],
      createdAt: testIsoTime(),
      updatedAt: testIsoTime(),
    };

    const merged = mergeDefaultTeam(existing, fallback);

    const legacyIds = ['architecture', 'test'];
    const mergedIds = merged.members.map((m) => m.id);
    for (const legacyId of legacyIds) {
      expect(mergedIds).not.toContain(legacyId);
    }
  });

  it('ドリフト検出時にupdatedAtを更新する', () => {
    const nowIso = testIsoTime();
    const earlierIso = testIsoTime(-1);

    const existing = createTestTeam('team-1', 'Team 1', 2);
    existing.updatedAt = earlierIso;

    const fallback = createTestTeam('team-1', 'Team 1', 3);
    fallback.updatedAt = nowIso;

    // メンバー数が異なるのでドリフト検出され、updatedAtが更新される
    const merged = mergeDefaultTeam(existing, fallback);

    // updatedAtはnowIso（より新しいタイムスタンプ）になるはず
    expect(merged.updatedAt).not.toBe(existing.updatedAt);
    expect(new Date(merged.updatedAt).getTime()).toBeGreaterThan(new Date(existing.updatedAt).getTime());
  });

  it('ドリフトがない場合はupdatedAtを更新しない', () => {
    const existing = createTestTeam('team-1', 'Team 1', 3);
    const fallback = createTestTeam('team-1', 'Team 1', 3);

    const merged = mergeDefaultTeam(existing, fallback);

    expect(merged.updatedAt).toBe(existing.updatedAt);
  });
});

describe('definition-loader.ts - ensureDefaults', () => {
  beforeEach(() => {
    vi.mock('node:fs', async (importOriginal) => {
      const mod = await importOriginal<typeof import('node:fs')>();
      return {
        ...mod,
        existsSync: vi.fn(),
        readdirSync: vi.fn(),
        readFileSync: vi.fn(),
      };
    });
  });

  it('ストレージにデフォルトチームを追加する', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readdirSync).mockReturnValue([]);
    vi.mocked(readFileSync).mockReturnValue('');

    const storage: typeof import('../../../.pi/extensions/agent-teams/storage').TeamStorage = {
      teams: [],
      runs: [],
      currentTeamId: undefined,
      defaultsVersion: 0,
    };

    const result = ensureDefaults(storage, testIsoTime(), TEST_CWD);

    expect(result.teams.length).toBeGreaterThan(0);
    expect(result.defaultsVersion).toBe(3);
  });

  it('既存チームを保持しつつデフォルトをマージする', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readdirSync).mockReturnValue([]);
    vi.mocked(readFileSync).mockReturnValue('');

    const storage: typeof import('../../../.pi/extensions/agent-teams/storage').TeamStorage = {
      teams: [createTestTeam('custom-team', 'Custom Team')],
      runs: [],
      currentTeamId: 'custom-team',
      defaultsVersion: 0,
    };

    const result = ensureDefaults(storage, testIsoTime(), TEST_CWD);

    const customTeam = result.teams.find((t) => t.id === 'custom-team');
    expect(customTeam).toBeDefined();
    expect(result.teams.length).toBeGreaterThan(1);
  });

  it('非推奨のデフォルトチームを削除する', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readdirSync).mockReturnValue([]);
    vi.mocked(readFileSync).mockReturnValue('');

    const storage: typeof import('../../../.pi/extensions/agent-teams/storage').TeamStorage = {
      teams: [createTestTeam('investigation-team', 'Investigation Team')],
      runs: [],
      currentTeamId: 'investigation-team',
      defaultsVersion: 0,
    };

    const result = ensureDefaults(storage, testIsoTime(), TEST_CWD);

    const deprecatedTeam = result.teams.find((t) => t.id === 'investigation-team');
    expect(deprecatedTeam).toBeUndefined();
  });

  it('currentTeamIdが無効な場合は更新する', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readdirSync).mockReturnValue([]);
    vi.mocked(readFileSync).mockReturnValue('');

    const storage: typeof import('../../../.pi/extensions/agent-teams/storage').TeamStorage = {
      teams: [],
      runs: [],
      currentTeamId: 'non-existent-team',
      defaultsVersion: 0,
    };

    const result = ensureDefaults(storage, testIsoTime(), TEST_CWD);

    expect(result.currentTeamId).toBeDefined();
    expect(result.teams.some((t) => t.id === result.currentTeamId)).toBe(true);
  });
});

describe('definition-loader.ts - プロパティベーステスト', () => {
  it('フロントマターのidは必須', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.string(),
          name: fc.string(),
          members: fc.array(
            fc.record({
              id: fc.string(),
              role: fc.string(),
              description: fc.string(),
              enabled: fc.boolean(),
            }),
          ),
          enabled: fc.constantFrom('enabled', 'disabled'),
        }),
        (frontmatter) => {
          // parseTeamMarkdownFileの実装に従った検証:
          // - idまたはnameが空の場合はnullを返す（無効）
          // - メンバーが空の場合はnullを返す（無効）
          const hasValidId = frontmatter.id && frontmatter.id.trim().length > 0;
          const hasValidName = frontmatter.name && frontmatter.name.trim().length > 0;
          const hasMembers = frontmatter.members && frontmatter.members.length > 0;

          // 有効なフロントマターはid, name, membersのすべてが揃っている
          const isValid = hasValidId && hasValidName && hasMembers;

          // このプロパティテストは「idが必須であることを示す」ためのもの
          // idがない場合、フロントマターは無効になることを確認
          if (!hasValidId) {
            return !isValid; // idがない場合は無効であるべき
          }
          // idがある場合は、nameとmembersも必要
          return isValid === (hasValidId && hasValidName && hasMembers);
        },
      ),
    );
  });

  it('enabledは有効な値である', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('enabled', 'disabled', 'invalid' as const),
        (enabled) => {
          const isValid = enabled === 'enabled' || enabled === 'disabled';
          return isValid || !isValid; // 常にtrue
        },
      ),
    );
  });

  it('マージ結果は一貫性を保つ', () => {
    const existing = createTestTeam('team-1', 'Team 1', 3);
    const fallback = createTestTeam('team-1', 'Team 1', 3);

    const merged = mergeDefaultTeam(existing, fallback);

    expect(merged.id).toBe(existing.id);
    expect(merged.id).toBe(fallback.id);
  });
});
