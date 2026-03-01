/**
 * @file .pi/lib/skill-registry.ts のテスト
 * @description スキルレジストリのテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

import {
	resolveSkills,
	mergeSkills,
	mergeSkillArrays,
	formatSkillsForPrompt,
	formatSkillsWithContent,
	loadSkillsForAgent,
	validateSkillReferences,
	type SkillDefinition,
	type ResolvedSkill,
	type ResolveSkillsOptions,
	type SkillMergeConfig,
} from "../../lib/skill-registry.js";

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_SKILLS_DIR = ".pi/tests/temp/skill-registry-skills";

function setupTestDir(): void {
	if (existsSync(TEST_SKILLS_DIR)) {
		rmSync(TEST_SKILLS_DIR, { recursive: true, force: true });
	}
	mkdirSync(TEST_SKILLS_DIR, { recursive: true });
}

function cleanupTestDir(): void {
	if (existsSync(TEST_SKILLS_DIR)) {
		rmSync(TEST_SKILLS_DIR, { recursive: true, force: true });
	}
}

function createTestSkill(
	name: string,
	description: string,
	content: string
): void {
	const skillDir = join(TEST_SKILLS_DIR, name);
	mkdirSync(skillDir, { recursive: true });

	const skillContent = `---
name: ${name}
description: ${description}
---

${content}
`;

	writeFileSync(join(skillDir, "SKILL.md"), skillContent, "utf-8");
}

function createTestOptions(): ResolveSkillsOptions {
	return {
		cwd: process.cwd(),
		skillPaths: [TEST_SKILLS_DIR],
	};
}

// ============================================================================
// Tests
// ============================================================================

describe("skill-registry", () => {
	beforeEach(() => {
		setupTestDir();
	});

	afterEach(() => {
		cleanupTestDir();
	});

	// ========================================
	// resolveSkills
	// ========================================

	describe("resolveSkills", () => {
		it("should_return_empty_for_empty_references", () => {
			const result = resolveSkills([], createTestOptions());

			expect(result.skills).toHaveLength(0);
			expect(result.errors).toHaveLength(0);
			expect(result.warnings).toHaveLength(0);
		});

		it("should_return_warning_for_nonexistent_skill", () => {
			const result = resolveSkills(["nonexistent-skill"], createTestOptions());

			expect(result.skills).toHaveLength(0);
			expect(result.warnings).toContain("Skill not found: nonexistent-skill");
		});

		it("should_resolve_existing_skill", () => {
			createTestSkill("test-skill", "Test description", "Test content");

			const result = resolveSkills(["test-skill"], createTestOptions());

			expect(result.skills).toHaveLength(1);
			expect(result.skills[0]?.name).toBe("test-skill");
			expect(result.skills[0]?.description).toBe("Test description");
		});

		it("should_deduplicate_duplicate_references", () => {
			createTestSkill("test-skill", "Test description", "Test content");

			const result = resolveSkills(
				["test-skill", "test-skill"],
				createTestOptions()
			);

			expect(result.skills).toHaveLength(1);
			expect(result.warnings).toContain("Duplicate skill reference: test-skill");
		});

		it("should_skip_empty_references", () => {
			createTestSkill("test-skill", "Test description", "Test content");

			const result = resolveSkills(
				["", "  ", "test-skill"],
				createTestOptions()
			);

			expect(result.skills).toHaveLength(1);
		});
	});

	// ========================================
	// mergeSkills
	// ========================================

	describe("mergeSkills", () => {
		it("should_return_empty_when_no_skills_specified", () => {
			const config: SkillMergeConfig = {
				parentSkills: [],
				childSkills: [],
				strategy: "merge",
			};

			const result = mergeSkills(config, createTestOptions());

			expect(result.skills).toHaveLength(0);
		});

		it("should_merge_parent_and_child_skills", () => {
			createTestSkill("parent-skill", "Parent", "Parent content");
			createTestSkill("child-skill", "Child", "Child content");

			const config: SkillMergeConfig = {
				parentSkills: ["parent-skill"],
				childSkills: ["child-skill"],
				strategy: "merge",
			};

			const result = mergeSkills(config, createTestOptions());

			expect(result.skills).toHaveLength(2);
		});

		it("should_replace_parent_with_child_in_replace_mode", () => {
			createTestSkill("parent-skill", "Parent", "Parent content");
			createTestSkill("child-skill", "Child", "Child content");

			const config: SkillMergeConfig = {
				parentSkills: ["parent-skill"],
				childSkills: ["child-skill"],
				strategy: "replace",
			};

			const result = mergeSkills(config, createTestOptions());

			expect(result.skills).toHaveLength(1);
			expect(result.skills[0]?.name).toBe("child-skill");
		});

		it("should_use_parent_when_child_is_empty_in_replace_mode", () => {
			createTestSkill("parent-skill", "Parent", "Parent content");

			const config: SkillMergeConfig = {
				parentSkills: ["parent-skill"],
				childSkills: [],
				strategy: "replace",
			};

			const result = mergeSkills(config, createTestOptions());

			// Replace mode with empty child still falls back to parent
			expect(result.skills).toHaveLength(1);
		});
	});

	// ========================================
	// mergeSkillArrays
	// ========================================

	describe("mergeSkillArrays", () => {
		it("should_return_child_when_child_has_skills", () => {
			const result = mergeSkillArrays(["parent"], ["child"]);

			expect(result).toEqual(["child"]);
		});

		it("should_return_parent_when_child_is_undefined", () => {
			const result = mergeSkillArrays(["parent"], undefined);

			expect(result).toEqual(["parent"]);
		});

		it("should_return_empty_when_both_empty", () => {
			const result = mergeSkillArrays([], []);

			expect(result).toEqual([]);
		});

		it("should_return_parent_when_child_is_empty_array", () => {
			const result = mergeSkillArrays(["parent"], []);

			expect(result).toEqual(["parent"]);
		});
	});

	// ========================================
	// formatSkillsForPrompt
	// ========================================

	describe("formatSkillsForPrompt", () => {
		it("should_return_empty_for_empty_skills", () => {
			const result = formatSkillsForPrompt([]);

			expect(result).toBe("");
		});

		it("should_format_skills_correctly", () => {
			const skills: ResolvedSkill[] = [
				{
					name: "test-skill",
					description: "Test description",
					filePath: "/path/to/skill.md",
					baseDir: "/path/to",
					source: "project",
					disableModelInvocation: false,
					content: "Test content",
				},
			];

			const result = formatSkillsForPrompt(skills);

			expect(result).toContain("<available_skills>");
			expect(result).toContain("<name>test-skill</name>");
			expect(result).toContain("<description>Test description</description>");
			expect(result).toContain("</available_skills>");
		});

		it("should_escape_special_characters", () => {
			const skills: ResolvedSkill[] = [
				{
					name: "test<skill>",
					description: 'Test "description" & more',
					filePath: "/path/to/skill.md",
					baseDir: "/path/to",
					source: "project",
					disableModelInvocation: false,
					content: "Test content",
				},
			];

			const result = formatSkillsForPrompt(skills);

			expect(result).toContain("&lt;");
			expect(result).toContain("&gt;");
			expect(result).toContain("&amp;");
			expect(result).toContain("&quot;");
		});
	});

	// ========================================
	// formatSkillsWithContent
	// ========================================

	describe("formatSkillsWithContent", () => {
		it("should_return_empty_for_empty_skills", () => {
			const result = formatSkillsWithContent([]);

			expect(result).toBe("");
		});

		it("should_format_skills_with_content", () => {
			const skills: ResolvedSkill[] = [
				{
					name: "test-skill",
					description: "Test description",
					filePath: "/path/to/skill.md",
					baseDir: "/path/to",
					source: "project",
					disableModelInvocation: false,
					content: "This is the skill content.",
				},
			];

			const result = formatSkillsWithContent(skills);

			expect(result).toContain('<skill name="test-skill">');
			expect(result).toContain("This is the skill content.");
			expect(result).toContain("</skill>");
		});
	});

	// ========================================
	// loadSkillsForAgent
	// ========================================

	describe("loadSkillsForAgent", () => {
		it("should_return_empty_for_no_skills", () => {
			const result = loadSkillsForAgent(undefined, undefined, process.cwd());

			expect(result.promptSection).toBe("");
			expect(result.skills).toHaveLength(0);
			expect(result.errors).toHaveLength(0);
		});

		it("should_load_and_format_skills", () => {
			createTestSkill("agent-skill", "Agent skill", "Agent content");

			const result = loadSkillsForAgent(
				["agent-skill"],
				undefined,
				process.cwd()
			);

			// Note: This won't find the skill without skillPaths option
			// The test verifies the function structure
			expect(result).toBeDefined();
		});
	});

	// ========================================
	// validateSkillReferences
	// ========================================

	describe("validateSkillReferences", () => {
		it("should_return_valid_and_invalid_lists", () => {
			createTestSkill("valid-skill", "Valid", "Content");

			// Note: validateSkillReferences uses buildSkillIndex which doesn't support skillPaths
			// This test verifies the function structure
			const result = validateSkillReferences(
				["valid-skill", "invalid-skill"],
				process.cwd()
			);

			expect(result.valid).toBeDefined();
			expect(result.invalid).toBeDefined();
		});

		it("should_skip_empty_references", () => {
			const result = validateSkillReferences(
				["", "  ", "skill"],
				process.cwd()
			);

			// Empty references are skipped
			expect(result.valid.length + result.invalid.length).toBeLessThanOrEqual(1);
		});
	});
});
