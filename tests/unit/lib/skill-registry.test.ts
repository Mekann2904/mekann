/**
 * skill-registry.ts 単体テスト
 * カバレッジ分析: resolveSkills, mergeSkills, mergeSkillArrays, formatSkillsForPrompt, validateSkillReferences
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from "vitest";
import * as fc from "fast-check";

// Node.jsモジュールのモック
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock("node:os", () => ({
  homedir: vi.fn(() => "/home/user"),
}));

vi.mock("node:path", () => ({
  dirname: vi.fn((p) => p.split("/").slice(0, -1).join("/")),
  join: vi.fn((...args) => args.join("/")),
}));

import { existsSync, readFileSync, readdirSync } from "node:fs";
import {
  resolveSkills,
  mergeSkills,
  mergeSkillArrays,
  formatSkillsForPrompt,
  formatSkillsWithContent,
  validateSkillReferences,
  loadSkillsForAgent,
  type SkillReference,
  type ResolveSkillsOptions,
  type SkillMergeConfig,
  type ResolvedSkill,
} from "../../../.pi/lib/skill-registry.js";

// ============================================================================
// テストデータ
// ============================================================================

const createMockSkill = (
  name: string,
  description: string = "Test skill",
  filePath: string = `/skills/${name}/SKILL.md`,
  content: string = "# Test Skill\n\nContent here."
): ResolvedSkill => ({
  name,
  description,
  filePath,
  baseDir: `/skills/${name}`,
  source: "project",
  disableModelInvocation: false,
  content,
});

// ============================================================================
// resolveSkills テスト
// ============================================================================

describe("resolveSkills", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolveSkills_空配列_空結果", () => {
    // Arrange
    const options: ResolveSkillsOptions = { cwd: "/test" };

    // Act
    const result = resolveSkills([], options);

    // Assert
    expect(result.skills).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("resolveSkills_undefined配列_空結果", () => {
    // Arrange
    const options: ResolveSkillsOptions = { cwd: "/test" };

    // Act
    const result = resolveSkills(undefined as any, options);

    // Assert
    expect(result.skills).toEqual([]);
  });

  it("resolveSkills_スキルなし_警告", () => {
    // Arrange
    vi.mocked(existsSync).mockReturnValue(false);
    const options: ResolveSkillsOptions = { cwd: "/test" };

    // Act
    const result = resolveSkills(["nonexistent-skill"], options);

    // Assert
    expect(result.skills).toEqual([]);
    expect(result.warnings).toContain("Skill not found: nonexistent-skill");
  });

  it("resolveSkills_重複参照_警告", () => {
    // Arrange
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([]);
    vi.mocked(readFileSync).mockReturnValue(
      "---\nname: test-skill\ndescription: Test\n---\nContent"
    );
    const options: ResolveSkillsOptions = { cwd: "/test" };

    // Act
    const result = resolveSkills(
      ["test-skill", "test-skill"],
      options
    );

    // Assert - 重複は解決時に1つだけ処理される
    expect(result.skills).toHaveLength(1);
  });

  it("resolveSkills_空文字参照_スキップ", () => {
    // Arrange
    const options: ResolveSkillsOptions = { cwd: "/test" };

    // Act
    const result = resolveSkills(["", "  ", undefined] as any, options);

    // Assert
    expect(result.skills).toEqual([]);
  });
});

// ============================================================================
// mergeSkills テスト
// ============================================================================

describe("mergeSkills", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(false);
  });

  it("mergeSkills_置換戦略_子のみ", () => {
    // Arrange
    const config: SkillMergeConfig = {
      parentSkills: ["parent-skill"],
      childSkills: ["child-skill"],
      strategy: "replace",
    };
    const options: ResolveSkillsOptions = { cwd: "/test" };

    // Act
    const result = mergeSkills(config, options);

    // Assert - childSkillsのみが参照される
    expect(result.warnings.some((w) => w.includes("child-skill"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("parent-skill"))).toBe(false);
  });

  it("mergeSkills_マージ戦略_両方参照", () => {
    // Arrange
    const config: SkillMergeConfig = {
      parentSkills: ["parent-skill"],
      childSkills: ["child-skill"],
      strategy: "merge",
    };
    const options: ResolveSkillsOptions = { cwd: "/test" };

    // Act
    const result = mergeSkills(config, options);

    // Assert - 両方が参照される
    expect(result.warnings.some((w) => w.includes("parent-skill"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("child-skill"))).toBe(true);
  });

  it("mergeSkills_空設定_空結果", () => {
    // Arrange
    const config: SkillMergeConfig = {};
    const options: ResolveSkillsOptions = { cwd: "/test" };

    // Act
    const result = mergeSkills(config, options);

    // Assert
    expect(result.skills).toEqual([]);
  });

  it("mergeSkills_子のみ_置換戦略_子使用", () => {
    // Arrange
    const config: SkillMergeConfig = {
      childSkills: ["child-skill"],
      strategy: "replace",
    };
    const options: ResolveSkillsOptions = { cwd: "/test" };

    // Act
    const result = mergeSkills(config, options);

    // Assert
    expect(result.warnings.some((w) => w.includes("child-skill"))).toBe(true);
  });
});

// ============================================================================
// mergeSkillArrays テスト
// ============================================================================

describe("mergeSkillArrays", () => {
  it("mergeSkillArrays_子あり_子優先", () => {
    // Arrange & Act
    const result = mergeSkillArrays(
      ["parent1", "parent2"],
      ["child1", "child2"]
    );

    // Assert
    expect(result).toEqual(["child1", "child2"]);
  });

  it("mergeSkillArrays_子なし_親継承", () => {
    // Arrange & Act
    const result = mergeSkillArrays(["parent1", "parent2"], undefined);

    // Assert
    expect(result).toEqual(["parent1", "parent2"]);
  });

  it("mergeSkillArrays_空配列子_親継承", () => {
    // Arrange & Act
    const result = mergeSkillArrays(["parent1"], []);

    // Assert
    expect(result).toEqual(["parent1"]);
  });

  it("mergeSkillArrays_両方なし_空配列", () => {
    // Arrange & Act
    const result = mergeSkillArrays(undefined, undefined);

    // Assert
    expect(result).toEqual([]);
  });

  it("mergeSkillArrays_親なし_子空_空配列", () => {
    // Arrange & Act
    const result = mergeSkillArrays(undefined, []);

    // Assert
    expect(result).toEqual([]);
  });
});

// ============================================================================
// formatSkillsForPrompt テスト
// ============================================================================

describe("formatSkillsForPrompt", () => {
  it("formatSkillsForPrompt_空配列_空文字", () => {
    // Arrange & Act
    const result = formatSkillsForPrompt([]);

    // Assert
    expect(result).toBe("");
  });

  it("formatSkillsForPrompt_スキルあり_XML形式", () => {
    // Arrange
    const skills: ResolvedSkill[] = [
      createMockSkill("skill1", "Description 1"),
      createMockSkill("skill2", "Description 2"),
    ];

    // Act
    const result = formatSkillsForPrompt(skills);

    // Assert
    expect(result).toContain("<available_skills>");
    expect(result).toContain("</available_skills>");
    expect(result).toContain("<name>skill1</name>");
    expect(result).toContain("<description>Description 1</description>");
    expect(result).toContain("<location>");
  });

  it("formatSkillsForPrompt_XMLエスケープ_正しく処理", () => {
    // Arrange
    const skills: ResolvedSkill[] = [
      createMockSkill("skill<test>", "Description & more"),
    ];

    // Act
    const result = formatSkillsForPrompt(skills);

    // Assert
    expect(result).toContain("&lt;");
    expect(result).toContain("&gt;");
    expect(result).toContain("&amp;");
  });

  it("formatSkillsForPrompt_undefined_空文字", () => {
    // Arrange & Act
    const result = formatSkillsForPrompt(undefined as any);

    // Assert
    expect(result).toBe("");
  });
});

// ============================================================================
// formatSkillsWithContent テスト
// ============================================================================

describe("formatSkillsWithContent", () => {
  it("formatSkillsWithContent_空配列_空文字", () => {
    // Arrange & Act
    const result = formatSkillsWithContent([]);

    // Assert
    expect(result).toBe("");
  });

  it("formatSkillsWithContent_スキルあり_コンテンツ含む", () => {
    // Arrange
    const skills: ResolvedSkill[] = [
      createMockSkill("skill1", "Desc", "/path", "# Skill 1\n\nContent"),
    ];

    // Act
    const result = formatSkillsWithContent(skills);

    // Assert
    expect(result).toContain('<skill name="skill1">');
    expect(result).toContain("# Skill 1");
    expect(result).toContain("</skill>");
  });
});

// ============================================================================
// validateSkillReferences テスト
// ============================================================================

describe("validateSkillReferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(false);
  });

  it("validateSkillReferences_空配列_空結果", () => {
    // Arrange & Act
    const result = validateSkillReferences([], "/test");

    // Assert
    expect(result.valid).toEqual([]);
    expect(result.invalid).toEqual([]);
  });

  it("validateSkillReferences_スキルなし_全無効", () => {
    // Arrange & Act
    const result = validateSkillReferences(["skill1", "skill2"], "/test");

    // Assert
    expect(result.valid).toEqual([]);
    expect(result.invalid).toEqual(["skill1", "skill2"]);
  });
});

// ============================================================================
// loadSkillsForAgent テスト
// ============================================================================

describe("loadSkillsForAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(false);
  });

  it("loadSkillsForAgent_空配列_空結果", () => {
    // Arrange & Act
    const result = loadSkillsForAgent([], [], "/test");

    // Assert
    expect(result.promptSection).toBe("");
    expect(result.skills).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("loadSkillsForAgent_未定義_空結果", () => {
    // Arrange & Act
    const result = loadSkillsForAgent(undefined, undefined, "/test");

    // Assert
    expect(result.promptSection).toBe("");
    expect(result.skills).toEqual([]);
  });

  it("loadSkillsForAgent_子スキルのみ_子使用", () => {
    // Arrange & Act
    const result = loadSkillsForAgent(["child-skill"], undefined, "/test");

    // Assert
    expect(result.errors.some((e) => e.includes("child-skill"))).toBe(true);
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  it("mergeSkillArrays_任意配列_非null結果", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(undefined), fc.array(fc.string())),
        fc.oneof(fc.constant(undefined), fc.array(fc.string())),
        (parent, child) => {
          const result = mergeSkillArrays(parent, child);
          return Array.isArray(result);
        }
      )
    );
  });

  it("formatSkillsForPrompt_任意スキル配列_文字列返却", () => {
    fc.assert(
      fc.property(fc.array(fc.string({ minLength: 1 })), (names) => {
        const skills: ResolvedSkill[] = names.map((name) =>
          createMockSkill(name, "desc")
        );
        const result = formatSkillsForPrompt(skills);
        return typeof result === "string";
      })
    );
  });
});

// ============================================================================
// 境界値テスト
// ============================================================================

describe("境界値テスト", () => {
  it("resolveSkills_大量参照_処理可能", () => {
    // Arrange
    vi.mocked(existsSync).mockReturnValue(false);
    const references = Array.from({ length: 100 }, (_, i) => `skill-${i}`);
    const options: ResolveSkillsOptions = { cwd: "/test" };

    // Act
    const result = resolveSkills(references, options);

    // Assert
    expect(result.warnings).toHaveLength(100);
  });

  it("formatSkillsForPrompt_特殊文字含む_エスケープ", () => {
    // Arrange
    const skills: ResolvedSkill[] = [
      createMockSkill('test"quote', "desc<rip>tion&more"),
    ];

    // Act
    const result = formatSkillsForPrompt(skills);

    // Assert
    expect(result).toContain("&quot;");
    expect(result).toContain("&lt;");
    expect(result).toContain("&gt;");
    expect(result).toContain("&amp;");
  });
});
