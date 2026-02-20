/**
 * テスト用モックとユーティリティ
 */

import type {
  TeamDefinition,
  TeamMember,
  TeamMemberResult,
  TeamRunRecord,
  TeamStorage,
  TeamFinalJudge,
  TeamUncertaintyProxy,
} from '../../../.pi/extensions/agent-teams/storage';
import type { TeamFrontmatter, TeamMemberFrontmatter } from '../../../.pi/lib/team-types';

/**
 * テスト用日時文字列生成
 */
export function testIsoTime(offsetMinutes = 0): string {
  const date = new Date(Date.now() + offsetMinutes * 60 * 1000);
  return date.toISOString();
}

/**
 * テスト用チームメンバー生成
 */
export function createTestMember(
  id: string,
  role: string,
  enabled = true,
): TeamMember {
  return {
    id,
    role,
    description: `${role}のテスト用メンバー`,
    enabled,
  };
}

/**
 * テスト用チーム定義生成
 */
export function createTestTeam(
  id: string,
  name: string,
  memberCount = 3,
  enabled: 'enabled' | 'disabled' = 'enabled',
): TeamDefinition {
  const members: TeamMember[] = [];
  for (let i = 0; i < memberCount; i++) {
    members.push(createTestMember(`member-${i}`, `Role ${i}`));
  }
  return {
    id,
    name,
    description: `${name}のテスト用チーム定義`,
    enabled,
    members,
    createdAt: testIsoTime(),
    updatedAt: testIsoTime(),
  };
}

/**
 * テスト用チームメンバー結果生成
 */
export function createTestMemberResult(
  memberId: string,
  role: string,
  status: 'completed' | 'failed' = 'completed',
  confidence = 0.9,
  evidenceCount = 3,
): TeamMemberResult {
  return {
    memberId,
    role,
    summary: `${role}のサマリー`,
    output: `SUMMARY: ${role}の実行結果\nCLAIM: ${role}の主張\nEVIDENCE: evidence-1, evidence-2, evidence-${evidenceCount}\nCONFIDENCE: ${confidence}`,
    status,
    latencyMs: 100,
    diagnostics: {
      confidence,
      evidenceCount,
      contradictionSignals: 0,
      conflictSignals: 0,
    },
  };
}

/**
 * テスト用チーム実行記録生成
 */
export function createTestRunRecord(
  runId: string,
  teamId: string,
  status: 'completed' | 'failed' = 'completed',
  memberCount = 3,
): TeamRunRecord {
  return {
    runId,
    teamId,
    strategy: 'parallel',
    task: 'テストタスク',
    communicationRounds: 1,
    summary: 'テスト実行サマリー',
    status,
    startedAt: testIsoTime(-10),
    finishedAt: testIsoTime(),
    memberCount,
    outputFile: `.pi/agent-teams/runs/${runId}.json`,
  };
}

/**
 * テスト用ストレージ生成
 */
export function createTestStorage(
  teamCount = 1,
  runCount = 1,
): TeamStorage {
  const teams: TeamDefinition[] = [];
  const runs: TeamRunRecord[] = [];

  for (let i = 0; i < teamCount; i++) {
    teams.push(createTestTeam(`team-${i}`, `Team ${i}`));
  }
  for (let i = 0; i < runCount; i++) {
    runs.push(createTestRunRecord(`run-${i}`, teams[0]?.id || 'unknown'));
  }

  return {
    teams,
    runs,
    currentTeamId: teams[0]?.id,
    defaultsVersion: 3,
  };
}

/**
 * テスト用フロントマター生成
 */
export function createTestFrontmatter(
  id: string,
  name: string,
  memberCount = 3,
): TeamFrontmatter {
  const members: TeamMemberFrontmatter[] = [];
  for (let i = 0; i < memberCount; i++) {
    members.push({
      id: `member-${i}`,
      role: `Role ${i}`,
      description: `Member ${i} description`,
      enabled: true,
    });
  }
  return {
    id,
    name,
    description: `${name} description`,
    enabled: 'enabled',
    members,
  };
}

/**
 * テスト用Markdownコンテンツ生成
 */
export function createTestMarkdown(frontmatter: TeamFrontmatter, body = 'Test body'): string {
  const fmLines: string[] = ['---'];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (key === 'members' && Array.isArray(value)) {
      fmLines.push('members:');
      for (const member of value) {
        fmLines.push(`  - id: ${member.id}`);
        fmLines.push(`    role: ${member.role}`);
        fmLines.push(`    description: ${member.description}`);
        fmLines.push(`    enabled: ${member.enabled ?? true}`);
      }
    } else {
      fmLines.push(`${key}: ${value}`);
    }
  }
  fmLines.push('---');
  fmLines.push(body);
  return fmLines.join('\n');
}

/**
 * ファイルシステムモック
 */
export class MockFileSystem {
  private files = new Map<string, string>();
  private directories = new Set<string>();

  constructor() {
    this.mkdir('/tmp');
    this.mkdir('/project');
    this.mkdir('/project/.pi');
    this.mkdir('/project/.pi/agent-teams');
    this.mkdir('/project/.pi/agent-teams/runs');
  }

  mkdir(path: string): void {
    this.directories.add(path);
  }

  exists(path: string): boolean {
    return this.files.has(path) || this.directories.has(path);
  }

  readFile(path: string): string | null {
    return this.files.get(path) ?? null;
  }

  writeFile(path: string, content: string): void {
    this.files.set(path, content);
  }

  delete(path: string): void {
    this.files.delete(path);
  }

  listDir(path: string): string[] {
    const results: string[] = [];
    for (const [filePath] of this.files) {
      if (filePath.startsWith(path)) {
        const relative = filePath.slice(path.length + 1);
        results.push(relative);
      }
    }
    return results;
  }

  clear(): void {
    this.files.clear();
    this.directories.clear();
  }
}

/**
 * テスト用不確実性プロキシ生成
 */
export function createTestUncertaintyProxy(
  uIntra = 0.2,
  uInter = 0.3,
  uSys = 0.25,
): TeamUncertaintyProxy {
  return {
    uIntra,
    uInter,
    uSys,
    collapseSignals: [],
  };
}

/**
 * テスト用最終審査生成
 */
export function createTestFinalJudge(
  verdict: 'trusted' | 'partial' | 'untrusted' = 'trusted',
  confidence = 0.9,
): TeamFinalJudge {
  return {
    verdict,
    confidence,
    reason: 'テスト用審査結果',
    nextStep: '次のステップ',
    uIntra: 0.2,
    uInter: 0.3,
    uSys: 0.25,
    collapseSignals: [],
    rawOutput: '',
  };
}

/**
 * fast-check用Arb（任意値生成）
 */
export const testArbs = {
  memberId: () => `member-${Math.floor(Math.random() * 100)}`,
  teamId: () => `team-${Math.floor(Math.random() * 100)}`,
  role: () => `Role ${Math.floor(Math.random() * 10)}`,
  confidence: () => Math.random(),
  enabled: () => Math.random() > 0.5,
};
