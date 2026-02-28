/**
 * @file .pi/lib/agent-common.ts の単体テスト
 * @description サブエージェントおよびチームメンバー実行のための共通定数・型定義・ユーティリティのテスト
 * @testFramework vitest
 */

import { describe, it, expect, afterEach } from "vitest";
import {
	STABLE_RUNTIME_PROFILE,
	ADAPTIVE_PARALLEL_MAX_PENALTY,
	ADAPTIVE_PARALLEL_DECAY_MS,
	STABLE_MAX_RETRIES,
	STABLE_INITIAL_DELAY_MS,
	STABLE_MAX_DELAY_MS,
	SUBAGENT_CONFIG,
	TEAM_MEMBER_CONFIG,
	type EntityType,
	type EntityConfig,
	type NormalizedEntityOutput,
	pickFieldCandidate,
	pickSummaryCandidate,
	pickClaimCandidate,
	isEmptyOutputFailureMessage,
	buildFailureSummary,
	resolveTimeoutWithEnv,
} from "../../lib/agent/agent-common.js";

describe("Runtime Profile Constants", () => {
	describe("正常系", () => {
		it("should have STABLE_RUNTIME_PROFILE defined", () => {
			expect(typeof STABLE_RUNTIME_PROFILE).toBe("boolean");
		});

		it("should have consistent ADAPTIVE_PARALLEL_MAX_PENALTY", () => {
			expect(typeof ADAPTIVE_PARALLEL_MAX_PENALTY).toBe("number");
			expect(ADAPTIVE_PARALLEL_MAX_PENALTY).toBeGreaterThanOrEqual(0);
		});

		it("should have valid ADAPTIVE_PARALLEL_DECAY_MS", () => {
			expect(ADAPTIVE_PARALLEL_DECAY_MS).toBeGreaterThan(0);
		});
	});
});

describe("Stable Retry Constants", () => {
	describe("正常系", () => {
		it("should have valid STABLE_MAX_RETRIES", () => {
			expect(STABLE_MAX_RETRIES).toBeGreaterThan(0);
			expect(Number.isInteger(STABLE_MAX_RETRIES)).toBe(true);
		});

		it("should have valid delay values", () => {
			expect(STABLE_INITIAL_DELAY_MS).toBeGreaterThan(0);
			expect(STABLE_MAX_DELAY_MS).toBeGreaterThan(STABLE_INITIAL_DELAY_MS);
		});
	});
});

describe("EntityType", () => {
	describe("正常系", () => {
		it("should accept valid entity types", () => {
			const subagent: EntityType = "subagent";
			const teamMember: EntityType = "team-member";

			expect(subagent).toBe("subagent");
			expect(teamMember).toBe("team-member");
		});
	});
});

describe("EntityConfig", () => {
	describe("正常系", () => {
		it("should have valid SUBAGENT_CONFIG", () => {
			expect(SUBAGENT_CONFIG.type).toBe("subagent");
			expect(SUBAGENT_CONFIG.label).toBe("subagent");
			expect(SUBAGENT_CONFIG.emptyOutputMessage).toBeDefined();
			expect(SUBAGENT_CONFIG.defaultSummaryFallback).toBeDefined();
		});

		it("should have valid TEAM_MEMBER_CONFIG", () => {
			expect(TEAM_MEMBER_CONFIG.type).toBe("team-member");
			expect(TEAM_MEMBER_CONFIG.label).toBe("team member");
			expect(TEAM_MEMBER_CONFIG.emptyOutputMessage).toBeDefined();
			expect(TEAM_MEMBER_CONFIG.defaultSummaryFallback).toBeDefined();
		});
	});
});

describe("NormalizedEntityOutput", () => {
	describe("正常系", () => {
		it("should have correct structure", () => {
			const output: NormalizedEntityOutput = {
				ok: true,
				output: "test output",
				degraded: false,
			};

			expect(output.ok).toBe(true);
			expect(output.output).toBe("test output");
			expect(output.degraded).toBe(false);
		});

		it("should accept optional reason", () => {
			const output: NormalizedEntityOutput = {
				ok: false,
				output: "",
				degraded: false,
				reason: "empty output",
			};

			expect(output.reason).toBe("empty output");
		});
	});
});

describe("pickFieldCandidate", () => {
	describe("正常系", () => {
		it("should return first non-empty line", () => {
			const result = pickFieldCandidate("First line\nSecond line", {
				maxLength: 100,
			});

			expect(result).toBe("First line");
		});

		it("should truncate long text", () => {
			const longText = "A".repeat(200);
			const result = pickFieldCandidate(longText, {
				maxLength: 50,
			});

			expect(result.length).toBe(53); // 50 + "..."
			expect(result.endsWith("...")).toBe(true);
		});

		it("should return fallback for empty input", () => {
			const result = pickFieldCandidate("", {
				maxLength: 100,
				fallback: "Fallback text",
			});

			expect(result).toBe("Fallback text");
		});
	});

	describe("境界条件", () => {
		it("should exclude labeled lines", () => {
			const result = pickFieldCandidate("SUMMARY: First\nActual content", {
				maxLength: 100,
				excludeLabels: ["SUMMARY"],
			});

			expect(result).toBe("Actual content");
		});

		it("should remove markdown formatting", () => {
			const result = pickFieldCandidate("- List item content", {
				maxLength: 100,
			});

			expect(result).toBe("List item content");
		});
	});
});

describe("pickSummaryCandidate", () => {
	describe("正常系", () => {
		it("should extract summary candidate", () => {
			const result = pickSummaryCandidate("This is a summary of the output.");

			expect(result).toBeDefined();
			expect(result.length).toBeLessThanOrEqual(93); // 90 + "..."
		});
	});
});

describe("pickClaimCandidate", () => {
	describe("正常系", () => {
		it("should extract claim candidate", () => {
			const result = pickClaimCandidate("The main point is this.");

			expect(result).toBeDefined();
		});
	});
});

describe("isEmptyOutputFailureMessage", () => {
	describe("正常系", () => {
		it("should detect empty output message", () => {
			const result = isEmptyOutputFailureMessage(
				"Error: subagent returned empty output",
				SUBAGENT_CONFIG,
			);

			expect(result).toBe(true);
		});

		it("should not detect non-empty output message", () => {
			const result = isEmptyOutputFailureMessage(
				"Error: timeout occurred",
				SUBAGENT_CONFIG,
			);

			expect(result).toBe(false);
		});
	});
});

describe("buildFailureSummary", () => {
	describe("正常系", () => {
		it("should build empty output summary", () => {
			const result = buildFailureSummary("Error: empty output");

			expect(result).toBe("(failed: empty output)");
		});

		it("should build timeout summary", () => {
			const result = buildFailureSummary("Error: timed out");

			expect(result).toBe("(failed: timeout)");
		});

		it("should build rate limit summary", () => {
			const result = buildFailureSummary("Error: rate limit exceeded");

			expect(result).toBe("(failed: rate limit)");
		});

		it("should build generic failure summary", () => {
			const result = buildFailureSummary("Error: unknown error");

			expect(result).toBe("(failed)");
		});
	});
});

describe("resolveTimeoutWithEnv", () => {
	describe("正常系", () => {
		it("should return default when env not set", () => {
			delete process.env.PI_AGENT_COMMON_TEST_NONEXISTENT;
			const result = resolveTimeoutWithEnv(5000, "PI_AGENT_COMMON_TEST_NONEXISTENT");

			expect(result).toBe(5000);
		});
	});
});
