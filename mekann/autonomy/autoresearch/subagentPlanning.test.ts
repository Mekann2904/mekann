import { describe, expect, it } from "vitest";
import type { AutoresearchContractV1 } from "./contractV1.js";
import { contractViewForAgent, evaluatorOnlyChecks, visibleChecks } from "./contractV1.js";
import { authorityFromContract, suggestSubagents } from "./subagentPlanning.js";

function contract(): AutoresearchContractV1 {
	return {
		schemaVersion: "autoresearch/v1",
		objective: { summary: "obj", successDefinition: "success" },
		scope: { allowedWritePaths: ["src"], forbiddenWritePaths: ["bench"], immutableReadPaths: ["fixtures"], requireGit: true, requireCleanGitWorktree: true },
		evaluation: {
			benchmark: { command: { argv: ["npm", "run", "bench"], cwd: "." }, timeoutSeconds: 10, repeats: 1, aggregate: "median" },
			primaryMetric: { name: "ms", direction: "lower", source: { type: "wall_clock" } },
			checks: [
				{ name: "public", command: { argv: ["npm", "run", "test"], cwd: "." }, timeoutSeconds: 10, required: true, visibility: "agent_visible" } as any,
				{ name: "holdout", command: { argv: ["npm", "run", "holdout"], cwd: "." }, timeoutSeconds: 10, required: true, visibility: "evaluator_only" } as any,
			],
		},
		acceptance: { mode: "better_than_baseline", minRelativeImprovement: 0, requireImprovementAboveNoiseFloor: false, requireAllChecksPass: true, rejectIfMetricMissing: true, rejectIfImmutableReadPathChanged: true, rejectIfForbiddenFilesChanged: true, rejectIfBenchmarkChanged: true },
		loop: { maxIterations: 1, maxRuntimeMinutes: 1, maxConsecutiveNoImprovement: 1, maxConsecutiveFailures: 1 },
		failurePolicy: { onBenchmarkFailure: "discard", onCheckFailure: "discard", onMetricMissing: "discard", onContractViolation: "pause", onRevertFailure: "pause" },
	};
}

describe("subagent planning helpers", () => {
	it("hides evaluator-only checks from agent contract view and authority", () => {
		const c = contract();
		expect(visibleChecks(c).map((x) => x.name)).toEqual(["public"]);
		expect(evaluatorOnlyChecks(c).map((x) => x.name)).toEqual(["holdout"]);
		expect(contractViewForAgent(c).evaluation.checks.map((x) => x.name)).toEqual(["public"]);
		const auth = authorityFromContract(c, "proposer");
		expect(auth.mode).toBe("propose_patch");
		expect(auth.allowed_commands).toEqual([{ kind: "npm_script", script: "test", args: [] }]);
	});

	it("suggests roles without spawning subagents", () => {
		const s = suggestSubagents(contract()) as any;
		expect(s.scouts[0].authority.mode).toBe("read_only");
		expect(s.proposers[0].authority.mode).toBe("propose_patch");
		expect(JSON.stringify(s)).not.toContain("holdout");
	});
});
