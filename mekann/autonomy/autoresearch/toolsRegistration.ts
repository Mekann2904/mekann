import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { readCurrentContract } from "./contractV1.js";
import { executeEvaluateQuery } from "./tools/evaluateQuery.js";
import { executePlan } from "./tools/plan.js";
import { executeInit } from "./tools/init.js";
import { executeRun } from "./tools/run.js";
import { executeLog } from "./tools/log.js";
import { executeApprove } from "./tools/approve.js";
import { executeRunContract } from "./tools/runContract.js";
import { executeApplyCandidate, executeApplyCandidateIsolated, executeCandidateEscrow, executeListCandidates, executeRejectCandidate, executeShowCandidate } from "./tools/candidates.js";
import { suggestSubagents } from "./subagentPlanning.js";
import type { SessionStore } from "./tools/sessionStore.js";
import type { toolDeps } from "./index.js";

export function registerAutoresearchTools(pi: ExtensionAPI, store: SessionStore, deps: typeof toolDeps): void {
// ─── Tool: autoresearch_evaluate_query ─────────────────────

pi.registerTool({
	name: "autoresearch_evaluate_query",
	label: "autoresearch evaluate query",
	description: "Evaluate whether a natural-language request can become an autoresearch contract.",
	promptSnippet: "Evaluate an autoresearch request.",
	promptGuidelines: [
		"Use before autoresearch when the user objective is ambiguous.",
		"Ask for missing metric or command details when required.",
	],
	parameters: Type.Object({
		query: Type.String({ description: "User request." }),
	}),

	async execute(_tc, params, _sig, _ou, _ctx) {
		return executeEvaluateQuery(store, params);
	},
});

// ─── Tool: autoresearch_init ───────────────────────────────

const initParamDefs = Type.Object({
	name: Type.String({ description: "Experiment name." }),
	metric_name: Type.String({ description: "Primary metric name, e.g. total_ms." }),
	metric_unit: Type.Optional(Type.String({ description: "Metric unit, e.g. ms." })),
	direction: Type.Optional(StringEnum(["lower", "higher"] as const, { description: "Default: lower." }) as any),
	objective: Type.Optional(Type.String({ description: "Experiment objective." })),
	benchmark_command: Type.Optional(Type.String({ description: "Benchmark command, e.g. ./autoresearch.sh." })),
	metric_method: Type.Optional(StringEnum(["wall_clock", "stdout_metric", "report_file"] as const, { description: "Metric method. Default: wall_clock." }) as any),
	checks_mode: Type.Optional(StringEnum(["script", "command", "none"] as const, { description: "Checks mode. Default: script." }) as any),
	checks_command: Type.Optional(Type.String({ description: "Checks command when checks_mode=command." })),
	acceptance_mode: Type.Optional(StringEnum(["better_than_baseline", "better_than_best"] as const, { description: "Acceptance mode (V1). Default: better_than_baseline. manual/improvement_threshold は V1 schema で禁止済み。" }) as any),
	min_improvement: Type.Optional(Type.Number({ description: "Minimum relative improvement ratio (minRelativeImprovement), e.g. 0.02." })),
	repeat: Type.Optional(Type.Number({ description: "Measurement repeats. Default: 3." })),
	aggregate: Type.Optional(StringEnum(["median", "mean", "min", "max"] as const, { description: "Aggregation method (V1). Default: median." }) as any),
	require_git: Type.Optional(Type.Boolean({ description: "Require a git repo. Default: true." })),
	require_clean_baseline: Type.Optional(Type.Boolean({ description: "Require a clean baseline. Default: true." })),
	allowed_paths: Type.Optional(Type.Array(Type.String(), { description: "Allowed path patterns." })),
	excluded_paths: Type.Optional(Type.Array(Type.String(), { description: "Excluded path patterns." })),
});

pi.registerTool({
	name: "autoresearch_init",
	label: "autoresearch init",
	description:
		"Initialize an autoresearch plan and state under .autoresearch/.",
	promptSnippet: "Initialize an autoresearch session.",
	promptGuidelines: [
		"Use once at session start; do not reinitialize existing config.",
	],
	parameters: initParamDefs as any,

	async execute(_tc, params, _sig, _ou, ctx) {
		return executeInit(store, params as any, ctx, deps);
	},
});

// ─── Tool: autoresearch_run ────────────────────────────────

pi.registerTool({
	name: "autoresearch_run",
	label: "autoresearch run",
	description:
		"Run a benchmark command, record output/time, parse METRIC/RUN_ID/ARTIFACT_DIR, and run checks when configured.",
	promptSnippet: "Run and measure a benchmark command.",
	promptGuidelines: [
		"Set timeout_seconds for long commands.",
		"Do not run non-terminating commands such as web UIs.",
	],
	parameters: Type.Object({
		command: Type.String({ description: "Command to run." }),
		timeout_seconds: Type.Optional(Type.Number({ description: "Timeout seconds. Default: 600." })),
		checks_timeout_seconds: Type.Optional(Type.Number({ description: "Checks timeout seconds. Default: 300." })),
	}),

	async execute(_tc, params, signal, _ou, ctx) {
		return executeRun(store, params, signal, ctx, deps);
	},
});

// ─── Tool: autoresearch_log ────────────────────────────────

pi.registerTool({
	name: "autoresearch_log",
	label: "autoresearch log",
	description: "Record an experiment result; keep commits, discard/crash/checks_failed revert.",
	promptSnippet: "Record an experiment result.",
	promptGuidelines: [
		"Do not keep timeouts, nonzero exits, failed checks, or missing metrics.",
		"Pass the runId from autoresearch_run; piRunId is accepted as a legacy alias.",
	],
	parameters: Type.Object({
		metric: Type.Number({ description: "Primary metric value." }),
		status: StringEnum(["keep", "discard", "crash", "checks_failed"] as const, { description: "Result status." }) as any,
		description: Type.String({ description: "Short experiment description." }),
		runId: Type.Optional(Type.String({ description: "runId from autoresearch_run." })),
		commit: Type.Optional(Type.String({ description: "Git commit hash; auto when omitted." })),
		metrics: Type.Optional(Type.Object({}, { additionalProperties: Type.Number(), description: "Additional metrics." })),
		memo: Type.Optional(Type.String({ description: "Memo." })),
	}),

	async execute(_tc, params, _sig, _ou, ctx) {
		return executeLog(store, params as any, ctx, deps);
	},
});

// ─── Tool: autoresearch_plan ───────────────────────────────

pi.registerTool({
	name: "autoresearch_plan",
	label: "autoresearch plan",
	description:
		"Draft autoresearch.plan.md from a natural-language query without running baseline measurement.",
	promptSnippet: "Draft an autoresearch plan.",
	promptGuidelines: [
		"Treat the plan as an editable discussion document.",
		"Use `autoresearch-contract jsonc` for the contract block language.",
	],
	parameters: Type.Object({
		query: Type.String({ description: "User request." }),
	}),

	async execute(_tc, params, _sig, _ou, ctx) {
		return executePlan(store, params, ctx);
	},
});

// ─── Tool: autoresearch_approve ────────────────────────────

pi.registerTool({
	name: "autoresearch_approve",
	label: "autoresearch approve",
	description:
		"Validate the plan contract, measure baseline, and write current contract/lock files.",
	promptSnippet: "Approve a contract and measure baseline.",
	promptGuidelines: [
		"Review or edit the plan before approval.",
		"Do not change the contract after approval.",
	],
	parameters: Type.Object({
		plan_path: Type.Optional(Type.String({ description: "Plan file path. Default: autoresearch.plan.md." })),
	}),

	async execute(_tc, params, signal, _ou, ctx) {
		return executeApprove(store, params, signal, ctx, deps);
	},
});

// ─── Tool: autoresearch candidates ─────────────────────────

pi.registerTool({
	name: "autoresearch_candidate_escrow",
	label: "autoresearch candidate escrow",
	description: "Escrow pending subagent patch results as autoresearch candidates.",
	promptSnippet: "Escrow subagent patch results as candidates.",
	promptGuidelines: [
		"During autoresearch, use this tool instead of agent_results({ action: 'apply' }).",
		"Evaluate via autoresearch_apply_candidate, then autoresearch_run_contract({ candidate_id }).",
	],
	parameters: Type.Object({
		source: Type.Optional(Type.Union([Type.Literal("pending"), Type.Literal("result_ids")])),
		result_ids: Type.Optional(Type.Array(Type.String())),
		max_results: Type.Optional(Type.Number()),
	}),
	async execute(_tc, params, _signal, _ou, ctx) { return executeCandidateEscrow(store, params, ctx); },
});

pi.registerTool({
	name: "autoresearch_list_candidates",
	label: "autoresearch list candidates",
	description: "List autoresearch candidates for the current plan.",
	parameters: Type.Object({}),
	async execute(_tc, params, _signal, _ou, ctx) { return executeListCandidates(store, params as Record<string, never>, ctx); },
});

pi.registerTool({
	name: "autoresearch_show_candidate",
	label: "autoresearch show candidate",
	description: "Show an autoresearch candidate, optionally with patch/source content.",
	parameters: Type.Object({ candidate_id: Type.String(), include_patch: Type.Optional(Type.Boolean()), include_source: Type.Optional(Type.Boolean()) }),
	async execute(_tc, params, _signal, _ou, ctx) { return executeShowCandidate(store, params, ctx); },
});

pi.registerTool({
	name: "autoresearch_reject_candidate",
	label: "autoresearch reject candidate",
	description: "Reject an autoresearch candidate without changing the source subagent result.",
	parameters: Type.Object({ candidate_id: Type.String(), reason: Type.Optional(Type.String()) }),
	async execute(_tc, params, _signal, _ou, ctx) { return executeRejectCandidate(store, params, ctx); },
});

pi.registerTool({
	name: "autoresearch_apply_candidate",
	label: "autoresearch apply candidate",
	description: "Apply one pending autoresearch candidate as a trial patch. Does not mark subagent result applied.",
	parameters: Type.Object({ candidate_id: Type.String() }),
	async execute(_tc, params, _signal, _ou, ctx) { return executeApplyCandidate(store, params, ctx); },
});

pi.registerTool({
	name: "autoresearch_suggest_subagents",
	label: "autoresearch suggest subagents",
	description: "Suggest scout/proposer/critic subagent spawn payloads derived from the current contract.",
	parameters: Type.Object({}),
	async execute(_tc, _params, _signal, _ou, ctx) {
		const contract = readCurrentContract(ctx.cwd);
		if (!contract) return store.textResponse("[ERROR] current contract が見つかりません。");
		const result = suggestSubagents(contract);
		return store.textDetails(JSON.stringify(result, null, 2), result as Record<string, unknown>);
	},
});

pi.registerTool({
	name: "autoresearch_apply_candidate_isolated",
	label: "autoresearch apply candidate isolated",
	description: "Apply one pending candidate in .pi/autoresearch-worktrees/<candidateId> for isolated evaluation.",
	parameters: Type.Object({ candidate_id: Type.String() }),
	async execute(_tc, params, _signal, _ou, ctx) { return executeApplyCandidateIsolated(store, params, ctx); },
});

// ─── Tool: autoresearch_run_contract ───────────────────────

pi.registerTool({
	name: "autoresearch_run_contract",
	label: "autoresearch run contract",
	description:
		"Run checks, benchmark, repeats, aggregation, and acceptance from the approved contract.",
	promptSnippet: "Run an approved contract evaluation.",
	promptGuidelines: [
		"Do not provide keep/discard status in contract mode.",
		"Let the evaluator return the decision.",
	],
	parameters: Type.Object({
		reason: Type.Optional(Type.String({ description: "Reason for this run." })),
		iteration_label: Type.Optional(Type.String({ description: "iteration label" })),
		candidate_id: Type.Optional(Type.String({ description: "autoresearch candidate id" })),
	}),

	async execute(_tc, params, signal, _ou, ctx) {
		return executeRunContract(store, params, signal, ctx, deps);
	},
});
}
