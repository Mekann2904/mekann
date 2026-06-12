/**
 * autoresearch_init ツールハンドラ。
 * index.ts から抽出された plan-scoped 実験セッション初期化ロジック。
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";

import type { ToolResponse, SessionStore } from "./sessionStore.js";
import { validateOptionalEnum, generateSessionId } from "./sessionStore.js";
import { ensureSessionDir } from "./sharedHelpers.js";
import { directionLabel, appendToJsonl, type EventLedgerEntry } from "../state.js";
import {
	buildContract,
	validateContract,
	writeContract,
	validateGitSafety,
	getBaselineCommit,
	DEFAULT_SAFETY,
	type AcceptanceMode,
	type MetricMethod,
	type ChecksMode,
	type AggregateMethod,
	type ExperimentContract,
} from "../contract.js";
import { createOrReusePlan } from "../layout.js";

// ─── Params type ──────────────────────────────────────────────

export interface InitParams {
	name: string;
	metric_name: string;
	metric_unit?: string;
	direction?: "lower" | "higher";
	objective?: string;
	benchmark_command?: string;
	metric_method?: string;
	checks_mode?: string;
	checks_command?: string;
	acceptance_mode?: string;
	min_improvement?: number;
	repeat?: number;
	aggregate?: string;
	require_git?: boolean;
	require_clean_baseline?: boolean;
	allowed_paths?: string[];
	excluded_paths?: string[];
}

// ─── Deps interface ───────────────────────────────────────────

export interface InitDeps {
	readCurrentPlanContract: (cwd: string) => ExperimentContract | null;
	sessionDir: (cwd: string, sessionId: string) => string;
	jsonlPath: (cwd: string) => string;
	eventsLedgerPath: (cwd: string, sessionId: string) => string;
	runsLedgerPath: (cwd: string, sessionId: string) => string;
}

// ─── executeInit ──────────────────────────────────────────────

export async function executeInit(
	store: SessionStore,
	params: InitParams,
	ctx: ExtensionContext,
	deps: InitDeps,
): Promise<ToolResponse> {
	if (!store.active) return store.INACTIVE_RESPONSE;

	// v2: init is plan-scoped. Existing plans/contracts are not destroyed; a new
	// content-addressed plan directory is created or the same planId is reused.

	// --- Extract typed params ---
	const direction = params.direction === "higher" ? "higher" : "lower";
	const metricMethod = validateOptionalEnum(params.metric_method, ["wall_clock", "stdout_metric", "report_file"], "metric_method") ?? "wall_clock" as MetricMethod;
	const checksMode = validateOptionalEnum(params.checks_mode, ["script", "command", "none"], "checks_mode") ?? "script" as ChecksMode;
	const acceptanceMode = validateOptionalEnum(params.acceptance_mode, ["better_than_best", "improvement_threshold", "manual"], "acceptance_mode") ?? "better_than_best" as AcceptanceMode;
	const aggregateMethod = validateOptionalEnum(params.aggregate, ["single", "median", "mean", "min", "max"], "aggregate") ?? "single" as AggregateMethod;

	const sessionId = generateSessionId(params.name);

	// --- P0-1: Build safety policy and validate git safety ---
	const safetyPolicy = {
		requireGit: params.require_git !== false,
		requireCleanBaseline: params.require_clean_baseline !== false,
		allowedPaths: Array.isArray(params.allowed_paths) ? params.allowed_paths : [],
		excludedPaths: Array.isArray(params.excluded_paths) ? params.excluded_paths : [],
		forbiddenCommandPatterns: DEFAULT_SAFETY.forbiddenCommandPatterns,
	};

	const gitViolations = validateGitSafety(ctx.cwd, safetyPolicy);
	if (gitViolations.length > 0) {
		return store.textDetails(`[ERROR] git safety 違反のため初期化できません:\n${gitViolations.map((v, i) => `  ${i + 1}. ${v}`).join("\n")}`, { gitViolations });
	}

	// --- P0-4: Build and validate contract ---
	const contract = buildContract({
		name: params.name,
		sessionId,
		metricName: params.metric_name,
		metricUnit: params.metric_unit ?? "",
		direction,
		metricMethod,
		benchmarkCommand: params.benchmark_command ?? "./autoresearch.sh",
		objective: params.objective ?? params.name,
		checksMode,
		checksCommand: params.checks_command,
		acceptanceMode,
		minImprovement: params.min_improvement,
		repeat: params.repeat,
		aggregate: aggregateMethod,
		requireGit: safetyPolicy.requireGit,
		requireCleanBaseline: safetyPolicy.requireCleanBaseline,
		allowedPaths: safetyPolicy.allowedPaths,
		excludedPaths: safetyPolicy.excludedPaths,
	});

	const validation = validateContract(contract);
	if (!validation.valid) {
		return store.textDetails(`[ERROR] 契約検証失敗:\n${validation.errors.map((e, i) => `  ${i + 1}. ${e}`).join("\n")}`, { errors: validation.errors });
	}

	// --- Create canonical plan-scoped layout; legacy root contract is best-effort only ---
	let planRef: { planId: string; planDir: string; reused: boolean };
	const legacyWarnings: string[] = [];
	try {
		try { writeContract(ctx.cwd, contract); } catch (e) { legacyWarnings.push(`legacy contract: ${e instanceof Error ? e.message : String(e)}`); }
		const benchmarkCommand = contract.benchmarkCommand === "./autoresearch.sh" ? "echo 'TODO: implement benchmark' >&2\nexit 1\n" : `${contract.benchmarkCommand}\n`;
		const checksScript = checksMode === "none" ? null : (checksMode === "command" && params.checks_command ? `${params.checks_command}\n` : null);
		planRef = createOrReusePlan(ctx.cwd, {
			planMarkdown: `# ${params.name}\n\n${params.objective ?? params.name}\n`,
			contract,
			benchmarkScript: `#!/usr/bin/env bash\nset -euo pipefail\n${benchmarkCommand}`,
			checksScript: checksScript ? `#!/usr/bin/env bash\nset -euo pipefail\n${checksScript}` : null,
			metricName: params.metric_name,
			metricDirection: direction,
			successCriteria: contract.acceptance,
			constraints: contract.safety,
		}, sessionId);
	} catch (e) {
		return store.textResponse(`[ERROR] 契約/plan-scoped ファイル書き込み失敗: ${e instanceof Error ? e.message : String(e)}`);
	}

	// --- Update state ---
	store.state.name = params.name;
	store.state.metricName = params.metric_name;
	store.state.metricUnit = params.metric_unit ?? "";
	store.state.sessionId = sessionId;
	store.state.direction = direction;
	store.state.bestMetric = null;
	store.state.results = [];
	store.state.runCount = 0;

	// --- Legacy JSONL config entry (compatibility); canonical history is .autoresearch/journal.jsonl ---
	const jp = deps.jsonlPath(ctx.cwd);
	try {
		fs.appendFileSync(jp, JSON.stringify({
			type: "config", name: store.state.name, metricName: store.state.metricName,
			metricUnit: store.state.metricUnit, direction: store.state.direction, sessionId,
			contractVersion: contract.version,
		}) + "\n");
	} catch (e) {
		legacyWarnings.push(`legacy jsonl: ${e instanceof Error ? e.message : String(e)}`);
	}

	try { ensureSessionDir(ctx.cwd, sessionId, deps.sessionDir); } catch {}

	// --- P0-1: Record baseline commit for future diff tracking ---
	const baselineCommit = getBaselineCommit(ctx.cwd);

	// --- Transaction event: contract_created ---
	try {
		appendToJsonl(deps.eventsLedgerPath(ctx.cwd, sessionId), {
			schemaVersion: 1, event: "contract_created", piRunId: "", timestamp: Date.now(),
			details: { sessionId, contractVersion: contract.version, baselineCommit },
		} satisfies EventLedgerEntry);
	} catch { /* best effort */ }

	store.updateWidget(ctx);

	let text = `[OK] 初期化完了\n名前: ${store.state.name}\n指標: ${store.state.metricName}(${directionLabel(store.state.direction)})\nsessionId: ${sessionId}`;
	text += `\nplanId: ${planRef!.planId}`;
	text += `\n契約: ${path.relative(ctx.cwd, path.join(planRef!.planDir, "contract.json"))}`;
	if (baselineCommit) text += `\nbaseline: ${baselineCommit.slice(0, 12)}`;
	const allWarnings = [...validation.warnings, ...legacyWarnings];
	if (allWarnings.length > 0) {
		text += `\n\n[WARNING]\n${allWarnings.map((w, i) => `  ${i + 1}. ${w}`).join("\n")}`;
	}
	text += `\n\nacceptance mode: ${contract.acceptance.mode}`;
	text += `\nchecks mode: ${contract.checks.mode}`;
	text += `\nbenchmark: ${contract.benchmarkCommand}`;

	return store.textDetails(text, {
		name: store.state.name, metricName: store.state.metricName, metricUnit: store.state.metricUnit,
		direction: store.state.direction, sessionId, contractVersion: contract.version,
		acceptance: contract.acceptance, safety: contract.safety,
		baselineCommit, warnings: allWarnings, planId: planRef!.planId, planDir: path.relative(ctx.cwd, planRef!.planDir),
	});
}
