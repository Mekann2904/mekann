/**
 * Tool: autoresearch_plan
 * 自然文 query から autoresearch.plan.md の draft を生成。
 */

import * as fs from "node:fs";
import { evaluateQueryStatically } from "../queryEvaluation.js";
import { computeContractHash, planPath, type AutoresearchContractV1 } from "../contractV1.js";
import type { SessionStore, ToolResponse } from "./sessionStore.js";

export function executePlan(
	store: SessionStore,
	params: { query: string },
	ctx: { cwd: string },
): ToolResponse {
	const evaluation = evaluateQueryStatically(params.query);
	const m = evaluation.contractDraft.primaryMetric;
	const metricName = m.name ?? "duration_seconds";
	const metricDirection = m.direction === "higher" ? "higher" : "lower";
	const metricSource = m.measurementMethod === "wall_clock" ? "wall_clock" : "metric_line";
	const suggestedBenchmarkCommand = evaluation.contractDraft.benchmarkCommand ?? "./autoresearch.sh";
	const contractBenchmarkCommand = "bash ./autoresearch.sh";

	const contractDraft: AutoresearchContractV1 = {
		schemaVersion: "autoresearch/v1",
		objective: {
			summary: evaluation.contractDraft.objective || params.query,
			successDefinition: `${metricName} improves in ${metricDirection} direction`,
		},
		scope: {
			allowedWritePaths: ["src/**", "tests/**", "lib/**"],
			forbiddenWritePaths: [
				"autoresearch.sh", "checks.sh", "benchmarks/**", "benchmark/**",
				"fixtures/**", "test/fixtures/**", "package-lock.json",
				"pnpm-lock.yaml", "yarn.lock",
			],
			immutableReadPaths: [
				"autoresearch.sh", "checks.sh", "package.json", "package-lock.json",
				"pnpm-lock.yaml", "yarn.lock", "benchmarks/**", "benchmark/**",
				"fixtures/**", "test/fixtures/**",
			],
			requireGit: true,
			requireCleanGitWorktree: true,
		},
		evaluation: {
			benchmark: {
				command: { argv: ["bash", "./autoresearch.sh"], cwd: "." },
				timeoutSeconds: 600, repeats: 3, aggregate: "median",
			},
			primaryMetric: {
				name: metricName, direction: metricDirection,
				source: metricSource === "wall_clock"
					? { type: "wall_clock" }
					: { type: "metric_line", format: "METRIC <name>=<number>", fallback: "wall_clock" },
			},
			checks: evaluation.contractDraft.checksCommand
				? [{ name: "default-checks", command: { argv: ["bash", "./checks.sh"], cwd: "." }, timeoutSeconds: 300, required: true }]
				: [],
		},
		acceptance: {
			mode: "better_than_baseline",
			minRelativeImprovement: 0.02,
			requireImprovementAboveNoiseFloor: true,
			requireAllChecksPass: true,
			rejectIfMetricMissing: true,
			rejectIfImmutableReadPathChanged: true,
			rejectIfForbiddenFilesChanged: true,
			rejectIfBenchmarkChanged: true,
		},
		loop: {
			maxIterations: 50, maxRuntimeMinutes: 120,
			maxConsecutiveNoImprovement: 3, maxConsecutiveFailures: 2,
		},
		failurePolicy: {
			onBenchmarkFailure: "discard", onCheckFailure: "discard",
			onMetricMissing: "discard", onContractViolation: "pause",
			onRevertFailure: "pause",
		},
	};

	const md = [
		`# Autoresearch Plan`, ``, `## User Query`, ``, params.query,
		``, `## Interpreted Objective`, ``, contractDraft.objective.summary,
		``, `## Assumptions`, ``,
		...evaluation.contractDraft.constraints.map((c) => `- ${c}`),
		`- Platform: ${process.platform}`,
		``, `## Unknowns`, ``,
		...evaluation.clarifyingQuestions.map((q) => `- ${q}`),
		``, `## Non-goals`, ``,
		`- Modifying the benchmark script itself`,
		`- Changing the metric definition mid-experiment`,
		``, `## Scope Note`, ``,
		`The default scope is a reasonable starting point. Edit the contract block to match your repo structure:`,
		`- Adjust allowedWritePaths if source is not in src/ or lib/`,
		`- Add benchmark/fixture paths to immutableReadPaths if applicable`,
		`- Add sensitive paths to forbiddenWritePaths`,
		``, `## Proposed Loop Strategy`, ``,
		`1. Baseline measurement with current code`,
		`2. Apply candidate optimization`,
		`3. Run benchmark with ${contractDraft.evaluation.benchmark.repeats} repeats`,
		`4. Evaluate against contract acceptance criteria`,
		`5. Keep if improvement exceeds threshold, otherwise discard and revert`,
		``, `## Evaluation Contract`, ``,
		"```autoresearch-contract jsonc",
		JSON.stringify(contractDraft, null, 2), "```",
	].join("\n");

	const pp = planPath(ctx.cwd);
	try {
		fs.writeFileSync(pp, md, "utf8");
	} catch (e) {
		return store.textResponse(`[ERROR] plan file の書き込みに失敗: ${e instanceof Error ? e.message : String(e)}`);
	}

	const contractHash = computeContractHash(contractDraft);
	let text = `[OK] plan draft を生成しました: ${pp}\n`;
	text += `\n### Query 評価\n`;
	text += `判定: ${evaluation.decision}\n`;
	text += `主指標: ${metricName} (${metricDirection})\n`;
	text += `benchmark: ${contractBenchmarkCommand}\n`;
	text += `note: actual benchmark logic should live in autoresearch.sh, or edit the contract argv explicitly. Suggested by query evaluation: ${suggestedBenchmarkCommand}\n`;
	if (evaluation.blockingIssues.length > 0) {
		text += `\n### ブロッキング issue\n`;
		for (const issue of evaluation.blockingIssues) text += `- ${issue}\n`;
	}
	if (evaluation.clarifyingQuestions.length > 0) {
		text += `\n### 確認質問\n`;
		for (const q of evaluation.clarifyingQuestions) text += `- ${q}\n`;
	}
	text += `\nplan を確認・編集した後、autoresearch_approve で承認してください。`;

	return store.textDetails(text, { planPath: pp, decision: evaluation.decision, contractHash });
}
