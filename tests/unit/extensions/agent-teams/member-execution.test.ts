/**
 * member-execution.tsの単体テスト
 * テスト対象: normalizeTeamMemberOutput, mergeSkillArrays, resolveEffectiveTeamMemberSkills,
 *            formatTeamMemberSkillsSection, loadSkillContent, buildSkillsSectionWithContent,
 *            buildTeamMemberPrompt, extractSummary
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fc from "fast-check";
import {
  normalizeTeamMemberOutput,
  mergeSkillArrays,
  resolveEffectiveTeamMemberSkills,
  formatTeamMemberSkillsSection,
  buildSkillsSectionWithContent,
  buildTeamMemberPrompt,
  type TeamNormalizedOutput,
} from "@ext/agent-teams/member-execution";
import type { TeamDefinition, TeamMember } from "@ext/agent-teams/storage";

// Mock fs module
const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();
vi.mock("node:fs", () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
}));

describe("member-execution.ts - normalizeTeamMemberOutput", () => {
  describe("正常ケース", () => {
    it("有効な構造化出力を正規化する", () => {
      const output = `SUMMARY: テスト要約
CLAIM: テスト主張
EVIDENCE: 証拠1, 証拠2
RESULT:
テスト結果本文
NEXT_STEP: 次のステップ`;
      const result = normalizeTeamMemberOutput(output);
      expect(result.ok).toBe(true);
      expect(result.output).toBe(output);
      expect(result.degraded).toBe(false);
    });

    it("有効なコミュニケーション出力を正規化する", () => {
      const output = `SUMMARY: テスト要約
CLAIM: テスト主張
EVIDENCE: 証拠1, 証拠2
DISCUSSION: 合意: テスト合意
RESULT:
テスト結果本文
NEXT_STEP: 次のステップ`;
      const result = normalizeTeamMemberOutput(output);
      expect(result.ok).toBe(true);
      expect(result.output).toBe(output);
      expect(result.degraded).toBe(false);
    });

    it("構造化されていない出力を正規化する", () => {
      const output = "これは構造化されていない出力です。";
      const result = normalizeTeamMemberOutput(output);
      expect(result.ok).toBe(true);
      expect(result.degraded).toBe(true);
      // reasonはバリデーション結果に依存するため、詳細な値は検証しない
      expect(result.reason).toBeDefined();
      expect(result.output).toContain("SUMMARY:");
      expect(result.output).toContain("CLAIM:");
      expect(result.output).toContain("EVIDENCE: not-provided");
      expect(result.output).toContain("RESULT:");
      expect(result.output).toContain("NEXT_STEP: none");
      expect(result.output).toContain(output);
    });
  });

  describe("エッジケース", () => {
    it("空文字列は失敗として扱う", () => {
      const result = normalizeTeamMemberOutput("");
      expect(result.ok).toBe(false);
      expect(result.output).toBe("");
      expect(result.degraded).toBe(false);
      expect(result.reason).toBe("empty output");
    });

    it("空白のみは失敗として扱う", () => {
      const result = normalizeTeamMemberOutput("   \n  \t  ");
      expect(result.ok).toBe(false);
      expect(result.output).toBe("");
      expect(result.degraded).toBe(false);
      expect(result.reason).toBe("empty output");
    });

    it("長いテキストの要約を正規化する", () => {
      const longText = "A".repeat(200) + " " + "B".repeat(200);
      const result = normalizeTeamMemberOutput(longText);
      expect(result.ok).toBe(true);
      expect(result.degraded).toBe(true);
      expect(result.output).toContain("SUMMARY:");
      // 要約は短縮される
      const summaryMatch = result.output.match(/SUMMARY: (.+)/);
      expect(summaryMatch?.[1]?.length).toBeLessThanOrEqual(103); // "AAA..."形式
    });

    it("Markdown記法を含むテキストを正規化する", () => {
      const markdown = `# タイトル
## サブタイトル
- リスト項目1
- リスト項目2

本文`;
      const result = normalizeTeamMemberOutput(markdown);
      expect(result.ok).toBe(true);
      expect(result.degraded).toBe(true);
      const summaryMatch = result.output.match(/SUMMARY: (.+)/);
      expect(summaryMatch?.[1]).not.toMatch(/^#/);
      expect(summaryMatch?.[1]).not.toMatch(/^[-*]\s+/);
    });
  });

  describe("プロパティベーステスト", () => {
    it("任意の文字列入力で有効な構造を返す", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (input) => {
          const result = normalizeTeamMemberOutput(input);
          expect(result).toHaveProperty("ok");
          expect(result).toHaveProperty("output");
          expect(result).toHaveProperty("degraded");
          expect(typeof result.ok).toBe("boolean");
          expect(typeof result.output).toBe("string");
          expect(typeof result.degraded).toBe("boolean");
        })
      );
    });

    it("正規化された出力は必須フィールドを含む", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 1000 }), (input) => {
          const result = normalizeTeamMemberOutput(input);
          if (result.ok) {
            expect(result.output).toContain("SUMMARY:");
            expect(result.output).toContain("CLAIM:");
            expect(result.output).toContain("RESULT:");
            expect(result.output).toContain("NEXT_STEP:");
          }
        })
      );
    });
  });
});

describe("member-execution.ts - mergeSkillArrays", () => {
  it("両方の配列をマージする", () => {
    const base = ["skill1", "skill2"];
    const override = ["skill3"];
    const result = mergeSkillArrays(base, override);
    expect(result).toEqual(["skill1", "skill2", "skill3"]);
  });

  it("重複を除外してマージする", () => {
    const base = ["skill1", "skill2"];
    const override = ["skill2", "skill3"];
    const result = mergeSkillArrays(base, override);
    expect(result).toEqual(["skill1", "skill2", "skill3"]);
  });

  it("baseのみの場合はbaseを返す", () => {
    const result = mergeSkillArrays(["skill1"], undefined);
    expect(result).toEqual(["skill1"]);
  });

  it("overrideのみの場合はoverrideを返す", () => {
    const result = mergeSkillArrays(undefined, ["skill1"]);
    expect(result).toEqual(["skill1"]);
  });

  it("両方undefinedの場合はundefinedを返す", () => {
    const result = mergeSkillArrays(undefined, undefined);
    expect(result).toBeUndefined();
  });

  it("空配列はundefinedと同様に扱う", () => {
    const result = mergeSkillArrays([], []);
    expect(result).toBeUndefined();
  });

  it("順序を維持してマージする", () => {
    const base = ["skill1", "skill2"];
    const override = ["skill3", "skill4"];
    const result = mergeSkillArrays(base, override);
    expect(result).toEqual(["skill1", "skill2", "skill3", "skill4"]);
  });
});

describe("member-execution.ts - resolveEffectiveTeamMemberSkills", () => {
  it("チームとメンバーのスキルをマージする", () => {
    const team: TeamDefinition = {
      id: "test-team",
      name: "Test Team",
      description: "A test team",
      members: [],
      enabled: true,
      skills: ["team-skill"],
    };
    const member: TeamMember = {
      id: "test-member",
      role: "Tester",
      description: "A test member",
      enabled: true,
      skills: ["member-skill"],
    };
    const result = resolveEffectiveTeamMemberSkills(team, member);
    expect(result).toEqual(["team-skill", "member-skill"]);
  });

  it("チームのみのスキルを返す", () => {
    const team: TeamDefinition = {
      id: "test-team",
      name: "Test Team",
      description: "A test team",
      members: [],
      enabled: true,
      skills: ["team-skill"],
    };
    const member: TeamMember = {
      id: "test-member",
      role: "Tester",
      description: "A test member",
      enabled: true,
    };
    const result = resolveEffectiveTeamMemberSkills(team, member);
    expect(result).toEqual(["team-skill"]);
  });

  it("メンバーのみのスキルを返す", () => {
    const team: TeamDefinition = {
      id: "test-team",
      name: "Test Team",
      description: "A test team",
      members: [],
      enabled: true,
    };
    const member: TeamMember = {
      id: "test-member",
      role: "Tester",
      description: "A test member",
      enabled: true,
      skills: ["member-skill"],
    };
    const result = resolveEffectiveTeamMemberSkills(team, member);
    expect(result).toEqual(["member-skill"]);
  });

  it("両方のスキルがない場合はundefinedを返す", () => {
    const team: TeamDefinition = {
      id: "test-team",
      name: "Test Team",
      description: "A test team",
      members: [],
      enabled: true,
    };
    const member: TeamMember = {
      id: "test-member",
      role: "Tester",
      description: "A test member",
      enabled: true,
    };
    const result = resolveEffectiveTeamMemberSkills(team, member);
    expect(result).toBeUndefined();
  });
});

describe("member-execution.ts - formatTeamMemberSkillsSection", () => {
  it("スキルリストをフォーマットする", () => {
    const result = formatTeamMemberSkillsSection(["skill1", "skill2"]);
    expect(result).toBe("- skill1\n- skill2");
  });

  it("空配列はnullを返す", () => {
    const result = formatTeamMemberSkillsSection([]);
    expect(result).toBeNull();
  });

  it("undefinedはnullを返す", () => {
    const result = formatTeamMemberSkillsSection(undefined);
    expect(result).toBeNull();
  });

  it("単一のスキルをフォーマットする", () => {
    const result = formatTeamMemberSkillsSection(["skill1"]);
    expect(result).toBe("- skill1");
  });
});

describe("member-execution.ts - buildSkillsSectionWithContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("スキルコンテンツを含むセクションを構築する", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("---\ntitle: Skill\n---\nスキルの内容");

    const result = buildSkillsSectionWithContent(["test-skill"]);
    expect(result).toContain("## test-skill");
    expect(result).toContain("スキルの内容");
  });

  it("複数のスキルを結合する", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync
      .mockReturnValueOnce("---\ntitle: Skill1\n---\n内容1")
      .mockReturnValueOnce("---\ntitle: Skill2\n---\n内容2");

    const result = buildSkillsSectionWithContent(["skill1", "skill2"]);
    expect(result).toContain("## skill1");
    expect(result).toContain("内容1");
    expect(result).toContain("## skill2");
    expect(result).toContain("内容2");
  });

  it("スキルが見つからない場合はフォールバックを返す", () => {
    mockExistsSync.mockReturnValue(false);

    const result = buildSkillsSectionWithContent(["test-skill"]);
    expect(result).toContain("## test-skill");
    expect(result).toContain("(スキル内容を読み込めませんでした)");
  });

  it("空配列はnullを返す", () => {
    const result = buildSkillsSectionWithContent([]);
    expect(result).toBeNull();
  });

  it("undefinedはnullを返す", () => {
    const result = buildSkillsSectionWithContent(undefined);
    expect(result).toBeNull();
  });
});

describe("member-execution.ts - buildTeamMemberPrompt", () => {
  it("基本的なプロンプトを構築する", () => {
    const team: TeamDefinition = {
      id: "test-team",
      name: "Test Team",
      description: "A test team",
      members: [],
      enabled: true,
    };
    const member: TeamMember = {
      id: "test-member",
      role: "Tester",
      description: "A test member",
      enabled: true,
    };
    const result = buildTeamMemberPrompt({
      team,
      member,
      task: "テストタスク",
    });
    expect(result).toContain("エージェントチーム Test Team (test-team) のメンバーです。");
    expect(result).toContain("チームミッション: A test team");
    expect(result).toContain("あなたの役割: Tester (test-member)");
    expect(result).toContain("役割目標: A test member");
    expect(result).toContain("リードからのタスク:");
    expect(result).toContain("テストタスク");
  });

  it("共有コンテキストを含むプロンプトを構築する", () => {
    const team: TeamDefinition = {
      id: "test-team",
      name: "Test Team",
      description: "A test team",
      members: [],
      enabled: true,
    };
    const member: TeamMember = {
      id: "test-member",
      role: "Tester",
      description: "A test member",
      enabled: true,
    };
    const result = buildTeamMemberPrompt({
      team,
      member,
      task: "テストタスク",
      sharedContext: "共有コンテキスト情報",
    });
    expect(result).toContain("共有コンテキスト:");
    expect(result).toContain("共有コンテキスト情報");
  });

  it("コミュニケーションコンテキストを含むプロンプトを構築する", () => {
    const team: TeamDefinition = {
      id: "test-team",
      name: "Test Team",
      description: "A test team",
      members: [],
      enabled: true,
    };
    const member: TeamMember = {
      id: "test-member",
      role: "Tester",
      description: "A test member",
      enabled: true,
    };
    const result = buildTeamMemberPrompt({
      team,
      member,
      task: "テストタスク",
      phase: "communication",
      communicationContext: "他メンバーの結果",
    });
    expect(result).toContain("現在フェーズ: コミュニケーション");
    expect(result).toContain("連携コンテキスト:");
    expect(result).toContain("他メンバーの結果");
  });

  it("出力フォーマットを含むプロンプトを構築する", () => {
    const team: TeamDefinition = {
      id: "test-team",
      name: "Test Team",
      description: "A test team",
      members: [],
      enabled: true,
    };
    const member: TeamMember = {
      id: "test-member",
      role: "Tester",
      description: "A test member",
      enabled: true,
    };
    const result = buildTeamMemberPrompt({
      team,
      member,
      task: "テストタスク",
    });
    expect(result).toContain("Output format (strict, labels must stay in English):");
    expect(result).toContain("SUMMARY: <日本語の短い要約>");
    expect(result).toContain("CLAIM: <日本語で1文の中核主張>");
    expect(result).toContain("EVIDENCE: <根拠をカンマ区切り。可能なら file:line>");
    expect(result).toContain("RESULT:");
    expect(result).toContain("NEXT_STEP: <日本語で次のアクション、不要なら none>");
  });
});
