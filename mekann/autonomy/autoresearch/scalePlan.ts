import * as fs from "node:fs";
import * as path from "node:path";

import { evaluateQueryStatically } from "./queryEvaluation.js";
import { computeContractHash, type AutoresearchContractV1 } from "./contractV1.js";

const BASELINE_HYPOTHESIS_SLOTS = [
	"file_cluster",
	"algorithmic_strategy",
	"measurement_bottleneck",
	"risk_reduction",
	"negative_control",
	"cross_cutting_simplification",
] as const;

function nowIso(): string { return new Date().toISOString(); }

export function buildScalingPlan(query: string): { markdown: string; contract: AutoresearchContractV1; contractHash: string; decision: string; blockingIssues: string[]; clarifyingQuestions: string[] } {
	const evaluation = evaluateQueryStatically(query);
	const m = evaluation.contractDraft.primaryMetric;
	const metricName = m.name ?? "duration_seconds";
	const metricDirection = m.direction === "higher" ? "higher" : "lower";
	const metricSource = m.measurementMethod === "wall_clock" ? "wall_clock" : "metric_line";
	const objectiveSlots = deriveObjectiveSlots(query);
	const contract = {
		schemaVersion: "autoresearch/v1",
		mode: "test_time_scaling",
		objective: {
			summary: evaluation.contractDraft.objective || query,
			successDefinition: `${metricName} improves in ${metricDirection} direction through evidence-driven candidate selection`,
		},
		scope: {
			allowedWritePaths: ["src/**", "tests/**", "lib/**"],
			forbiddenWritePaths: ["autoresearch.sh", "checks.sh", "benchmarks/**", "benchmark/**", "fixtures/**", "test/fixtures/**", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"],
			immutableReadPaths: ["autoresearch.sh", "checks.sh", "package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "benchmarks/**", "benchmark/**", "fixtures/**", "test/fixtures/**"],
			requireGit: true,
			requireCleanGitWorktree: true,
		},
		evaluation: {
			benchmark: { command: { argv: ["bash", "./autoresearch.sh"], cwd: "." }, timeoutSeconds: 600, repeats: 3, aggregate: "median" },
			primaryMetric: {
				name: metricName,
				direction: metricDirection,
				source: metricSource === "wall_clock" ? { type: "wall_clock" } : { type: "metric_line", format: "METRIC <name>=<number>", fallback: "wall_clock" },
			},
			checks: evaluation.contractDraft.checksCommand ? [{ name: "default-checks", command: { argv: ["bash", "./checks.sh"], cwd: "." }, timeoutSeconds: 300, required: true }] : [],
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
		loop: { maxIterations: 50, maxRuntimeMinutes: 120, maxConsecutiveNoImprovement: 3, maxConsecutiveFailures: 2 },
		failurePolicy: { onBenchmarkFailure: "discard", onCheckFailure: "discard", onMetricMissing: "discard", onContractViolation: "pause", onRevertFailure: "pause" },
		scaling: {
			population: { initialHypotheses: 6, candidatesPerGeneration: 3, survivorsPerGeneration: 1, baselineSlots: [...BASELINE_HYPOTHESIS_SLOTS], objectiveDerivedSlots: objectiveSlots },
			roles: { scouts: 2, proposers: 2, critics: 1, historians: 1 },
			generation: { proposalMapping: "one_hypothesis_one_proposal", evaluationOrder: "slot_diversity_round_robin", survivorKinds: ["candidate", "hypothesis", "strategy"] },
			scoring: { method: "rules_with_critic_comments", ranking: "hard_gate_then_primary_metric" },
			resources: { respectSubagentConcurrencyLimit: true, maxConcurrentEvaluations: 1, maxActiveWorktrees: 2 },
			evidence: { preferMechanicalEvidence: true, recordFailedCandidates: true, recordPatterns: ["checks", "benchmark", "critic_finding", "cheap_evidence"] },
			stopPolicy: { stopCommand: "/autoresearch-scale stop", gracefulStopBoundary: "candidate", internalState: "draining", uiState: "graceful stopping", completeMarkerBehavior: "record_exploration_exhaustion" },
		},
	} as AutoresearchContractV1;
	const markdown = [
		"# Autoresearch Scaling Plan", "", "## User Query", "", query,
		"", "## Interpreted Objective", "", contract.objective.summary,
		"", "## Scaling Strategy", "", "Autoresearch test-time scaling は既存 autoresearch loop を置き換えず、候補集団・証拠・世代更新で探索量を増やします。root agent は supervisor が出す単一 action を実行します。",
		"", "## Hypothesis Population", "", "Baseline slots:", ...BASELINE_HYPOTHESIS_SLOTS.map((s) => `- ${s}`), "", "Objective-derived slots:", ...(objectiveSlots.length ? objectiveSlots.map((s) => `- ${s}`) : ["- （目的文から追加 slot は検出されませんでした。必要なら編集してください）"]),
		"", "## Role Mix", "", "- scout: structured hypotheses を作る", "- proposer: 1 hypothesis から 1 patch proposal を作る", "- critic: scope / metric hacking / hidden side effect を監査する", "- historian: failure memory と strategy survivor を整理する",
		"", "## Generation Policy", "", "- hypothesis は rule-based scoring + critic comments で順位づける", "- candidate evaluation は slot diversity round-robin で行う", "- benchmark は初期値では逐次実行する", "- candidate / hypothesis / strategy survivor を別カテゴリで残す",
		"", "## Evidence Policy", "", "- contract, checks, benchmark, git diff, scope validation, revert 可能性を中心証拠にする", "- Negative-control hypothesis は弱い patch ではなく評価系の sanity check とする", "- COMPLETE marker は停止ではなく exploration exhaustion として記録する",
		"", "## Stop / Pause Policy", "", "- `/autoresearch-scale stop` は graceful stop。現在の candidate evaluation を完了してから止める", "- safety pause は contract violation / unexpected dirty workspace / revert failure / resource exhausted or unavailable after degradation / unsafe or irreversible decision required に限定する", "- no improvement / weak candidate / critic finding / unresolved unknown / benchmark or check failure は pause ではなく discard / exhaustion / failure memory で処理する", "- winning candidate は pending adoption として保持し、main worktree には自動反映しない",
		"", "## Assumptions", "", ...evaluation.contractDraft.constraints.map((c) => `- ${c}`), `- Platform: ${process.platform}`,
		"", "## Autonomous assumptions / unresolved unknowns", "", "- clarifying questions must not be surfaced as user prompts during scaling; resolve from contract / plan / repo docs / code, or record an autonomous assumption", ...evaluation.clarifyingQuestions.map((q) => `- ${q}`),
		"", "## Evaluation Contract", "", "```autoresearch-contract jsonc", JSON.stringify(contract, null, 2), "```",
	].join("\n");
	return { markdown, contract, contractHash: computeContractHash(contract), decision: evaluation.decision, blockingIssues: evaluation.blockingIssues, clarifyingQuestions: evaluation.clarifyingQuestions };
}

function deriveObjectiveSlots(query: string): string[] {
	const slots: string[] = [];
	const q = query.toLowerCase();
	if (/ui|tui|widget|表示|画面/.test(q)) slots.push("ui_interaction");
	if (/type|型|typecheck|tsc/.test(q)) slots.push("type_safety");
	if (/bench|metric|性能|遅|速|latency|performance/.test(q)) slots.push("performance_measurement");
	if (/test|テスト|check/.test(q)) slots.push("test_signal_quality");
	if (/api|tool|command|コマンド/.test(q)) slots.push("api_boundary");
	return [...new Set(slots)];
}

export function createPlanningScaleState(cwd: string): void {
	fs.mkdirSync(path.join(cwd, ".autoresearch"), { recursive: true });
	fs.writeFileSync(path.join(cwd, ".autoresearch", "scale.planning.json"), JSON.stringify({ status: "planning", updatedAt: nowIso() }, null, 2) + "\n", "utf8");
}
