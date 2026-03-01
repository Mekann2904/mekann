/**
 * @file .pi/lib/skill-relevance.ts のテスト
 * @description スキル関連度スコアリングのテスト
 * @testFramework vitest
 */

import { describe, it, expect } from "vitest";

import {
	scoreSkillRelevance,
	filterRelevantSkills,
	getSkillLoadStrategy,
	SKILL_KEYWORDS,
	DEFAULT_SKILL_RELEVANCE_CONFIG,
	type SkillRelevanceScore,
	type SkillRelevanceConfig,
} from "../../lib/skill-relevance.js";

// ============================================================================
// Tests
// ============================================================================

describe("skill-relevance", () => {
	// ========================================
	// Constants
	// ========================================

	describe("SKILL_KEYWORDS", () => {
		it("should_contain_expected_skills", () => {
			expect(SKILL_KEYWORDS["git-workflow"]).toBeDefined();
			expect(SKILL_KEYWORDS["code-review"]).toBeDefined();
			expect(SKILL_KEYWORDS["test-engineering"]).toBeDefined();
			expect(SKILL_KEYWORDS["bug-hunting"]).toBeDefined();
		});

		it("should_have_keywords_for_each_skill", () => {
			for (const [skillId, keywords] of Object.entries(SKILL_KEYWORDS)) {
				expect(Array.isArray(keywords)).toBe(true);
				expect(keywords.length).toBeGreaterThan(0);
			}
		});
	});

	describe("DEFAULT_SKILL_RELEVANCE_CONFIG", () => {
		it("should_have_expected_values", () => {
			expect(DEFAULT_SKILL_RELEVANCE_CONFIG.highRelevanceThreshold).toBe(0.5);
			expect(DEFAULT_SKILL_RELEVANCE_CONFIG.mediumRelevanceThreshold).toBe(0.2);
			expect(DEFAULT_SKILL_RELEVANCE_CONFIG.keywordWeight).toBe(0.7);
			expect(DEFAULT_SKILL_RELEVANCE_CONFIG.contextWeight).toBe(0.3);
		});
	});

	// ========================================
	// scoreSkillRelevance
	// ========================================

	describe("scoreSkillRelevance", () => {
		it("should_return_zero_scores_for_no_matches", () => {
			const task = "This task has no relevant keywords at all";
			const availableSkills = ["git-workflow", "test-engineering"];

			const scores = scoreSkillRelevance(task, availableSkills);

			expect(scores).toHaveLength(2);
			expect(scores[0]?.score).toBe(0);
			expect(scores[1]?.score).toBe(0);
		});

		it("should_score_git_keywords_correctly", () => {
			const task = "I need to commit and push my changes to the branch";
			const availableSkills = ["git-workflow", "test-engineering"];

			const scores = scoreSkillRelevance(task, availableSkills);

			const gitScore = scores.find((s) => s.skillId === "git-workflow");
			expect(gitScore?.score).toBeGreaterThan(0);
			expect(gitScore?.matchedKeywords).toContain("commit");
			expect(gitScore?.matchedKeywords).toContain("push");
			expect(gitScore?.matchedKeywords).toContain("branch");
		});

		it("should_score_test_keywords_correctly", () => {
			const task = "Write unit tests for this function using vitest";
			const availableSkills = ["git-workflow", "test-engineering"];

			const scores = scoreSkillRelevance(task, availableSkills);

			const testScore = scores.find((s) => s.skillId === "test-engineering");
			expect(testScore?.score).toBeGreaterThan(0);
			expect(testScore?.matchedKeywords).toContain("test");
			expect(testScore?.matchedKeywords).toContain("vitest");
		});

		it("should_return_sorted_by_score_descending", () => {
			const task = "Fix the bug and write tests for it";
			const availableSkills = ["git-workflow", "test-engineering", "bug-hunting"];

			const scores = scoreSkillRelevance(task, availableSkills);

			for (let i = 0; i < scores.length - 1; i++) {
				expect(scores[i]?.score).toBeGreaterThanOrEqual(scores[i + 1]?.score ?? 0);
			}
		});

		it("should_return_empty_for_empty_available_skills", () => {
			const scores = scoreSkillRelevance("some task", []);

			expect(scores).toHaveLength(0);
		});

		it("should_handle_unknown_skill_gracefully", () => {
			const scores = scoreSkillRelevance("test task", ["unknown-skill"]);

			expect(scores).toHaveLength(1);
			expect(scores[0]?.score).toBe(0);
		});

		it("should_include_reason_in_result", () => {
			const task = "commit the changes";
			const scores = scoreSkillRelevance(task, ["git-workflow"]);

			expect(scores[0]?.reason).toBeDefined();
			expect(typeof scores[0]?.reason).toBe("string");
		});

		it("should_apply_context_boost", () => {
			const task = "In UL mode, I need to plan the implementation";
			const scores = scoreSkillRelevance(task, ["task-planner", "git-workflow"]);

			const plannerScore = scores.find((s) => s.skillId === "task-planner");
			expect(plannerScore?.score).toBeGreaterThan(0);
			expect(plannerScore?.reason).toContain("context boost");
		});

		it("should_be_case_insensitive", () => {
			const task = "COMMIT and PUSH the BRANCH";
			const scores = scoreSkillRelevance(task, ["git-workflow"]);

			expect(scores[0]?.matchedKeywords).toContain("commit");
			expect(scores[0]?.matchedKeywords).toContain("push");
			expect(scores[0]?.matchedKeywords).toContain("branch");
		});

		it("should_respect_custom_config", () => {
			const customConfig: SkillRelevanceConfig = {
				highRelevanceThreshold: 0.8,
				mediumRelevanceThreshold: 0.4,
				keywordWeight: 1.0,
				contextWeight: 0.0,
			};

			const task = "commit and push";
			const scores = scoreSkillRelevance(task, ["git-workflow"], customConfig);

			expect(scores[0]?.score).toBeGreaterThan(0);
		});
	});

	// ========================================
	// filterRelevantSkills
	// ========================================

	describe("filterRelevantSkills", () => {
		it("should_categorize_skills_correctly", () => {
			const task = "commit and push changes to git branch";
			const availableSkills = ["git-workflow", "test-engineering", "bug-hunting"];

			const result = filterRelevantSkills(task, availableSkills);

			expect(result.highRelevance).toBeDefined();
			expect(result.mediumRelevance).toBeDefined();
			expect(result.lowRelevance).toBeDefined();
			expect(result.scores).toHaveLength(3);
		});

		it("should_put_high_matching_skill_in_high_relevance", () => {
			const task = "commit branch push merge git rebase checkout";
			const availableSkills = ["git-workflow"];

			const result = filterRelevantSkills(task, availableSkills);

			expect(result.highRelevance).toContain("git-workflow");
		});

		it("should_put_no_match_skill_in_low_relevance", () => {
			const task = "This task is about something completely different";
			const availableSkills = ["git-workflow"];

			const result = filterRelevantSkills(task, availableSkills);

			expect(result.lowRelevance).toContain("git-workflow");
		});

		it("should_return_all_scores", () => {
			const task = "test and commit";
			const availableSkills = ["git-workflow", "test-engineering"];

			const result = filterRelevantSkills(task, availableSkills);

			expect(result.scores).toHaveLength(2);
		});

		it("should_respect_custom_thresholds", () => {
			const customConfig: SkillRelevanceConfig = {
				highRelevanceThreshold: 0.9,
				mediumRelevanceThreshold: 0.5,
				keywordWeight: 0.7,
				contextWeight: 0.3,
			};

			const task = "commit the changes";
			const availableSkills = ["git-workflow"];

			const result = filterRelevantSkills(task, availableSkills, customConfig);

			// With high threshold, should likely be in medium or low
			expect(result.scores).toHaveLength(1);
		});
	});

	// ========================================
	// getSkillLoadStrategy
	// ========================================

	describe("getSkillLoadStrategy", () => {
		it("should_return_full_for_high_score", () => {
			const strategy = getSkillLoadStrategy(0.7);

			expect(strategy).toBe("full");
		});

		it("should_return_summary_for_medium_score", () => {
			const strategy = getSkillLoadStrategy(0.3);

			expect(strategy).toBe("summary");
		});

		it("should_return_name_only_for_low_score", () => {
			const strategy = getSkillLoadStrategy(0.1);

			expect(strategy).toBe("name-only");
		});

		it("should_respect_custom_config", () => {
			const customConfig: SkillRelevanceConfig = {
				highRelevanceThreshold: 0.8,
				mediumRelevanceThreshold: 0.4,
				keywordWeight: 0.7,
				contextWeight: 0.3,
			};

			// Score 0.6 is below high threshold (0.8) but above medium (0.4)
			const strategy = getSkillLoadStrategy(0.6, customConfig);

			expect(strategy).toBe("summary");
		});

		it("should_handle_boundary_values", () => {
			expect(getSkillLoadStrategy(0.5)).toBe("full"); // Exactly at high threshold
			expect(getSkillLoadStrategy(0.2)).toBe("summary"); // Exactly at medium threshold
			expect(getSkillLoadStrategy(0.0)).toBe("name-only"); // Zero score
		});
	});

	// ========================================
	// Integration Tests
	// ========================================

	describe("integration", () => {
		it("should_correctly_score_complex_task", () => {
			const task = `
				I need to fix a bug in the authentication module.
				First, I'll search for the relevant code, then debug the issue.
				After fixing, I'll write tests and commit the changes.
			`;
			const availableSkills = [
				"git-workflow",
				"test-engineering",
				"bug-hunting",
				"search-tools",
			];

			const scores = scoreSkillRelevance(task, availableSkills);

			// All skills should have some score
			expect(scores.every((s) => s.score >= 0)).toBe(true);

			// Bug-hunting should score high (bug, debug keywords)
			const bugHunting = scores.find((s) => s.skillId === "bug-hunting");
			expect(bugHunting?.score).toBeGreaterThan(0);
		});

		it("should_filter_complete_workflow", () => {
			const task = "Write unit tests with vitest and commit to branch";
			const availableSkills = ["git-workflow", "test-engineering", "bug-hunting"];

			const result = filterRelevantSkills(task, availableSkills);

			// Git-workflow and test-engineering should be relevant
			const relevantSkills = [
				...result.highRelevance,
				...result.mediumRelevance,
			];
			expect(relevantSkills.length).toBeGreaterThan(0);
		});
	});
});
