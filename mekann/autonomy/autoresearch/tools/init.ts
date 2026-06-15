/**
 * autoresearch_init ツールハンドラ。
 * index.ts から抽出された plan-scoped 実験セッション初期化ロジック。
 *
 * contract は AutoresearchContractV1 (V1 schema) を構築し、
 * `.autoresearch/plans/<planId>/contract.json` に保存する。
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";

import type { ToolResponse, SessionStore } from "./sessionStore.js";
import { validateOptionalEnum, generateSessionId } from "./sessionStore.js";
import { ensureSessionDir } from "./sharedHelpers.js";
import { directionLabel, appendToJsonl, type EventLedgerEntry } from "../state.js";
import {
	buildContractV1,
	validateContractV1,
	validateScopeGitSafety,
	type AutoresearchContractV1,
	type InitContractV1Params,
	type InitAcceptanceMode,
	type V1Aggregate,
} from "../contractV1.js";
import { getBaselineCommit } from "../git.js";
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
	readCurrentPlanContract: (cwd: string) => AutoresearchContractV1 | null;
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
	const metricMethod = validateOptionalEnum(params.metric_method, ["wall_clock", "stdout_metric", "report_file"], "metric_method") ?? "wall_clock" as InitContractV1Params["metricMethod"];
	const checksMode = validateOptionalEnum(params.checks_mode, ["script", "command", "none"], "checks_mode") ?? "script" as InitContractV1Params["checksMode"];
	// V1 acceptance mode は better_than_baseline | better_than_best のみ。
	// legacy manual/improvement_threshold は buildContractV1 内で V1 に正規化する。
	const acceptanceMode = validateOptionalEnum(
		params.acceptance_mode,
		["better_than_baseline", "better_than_best", "manual", "improvement_threshold"],
		"acceptance_mode",
	) as InitAcceptanceMode | undefined;
	const aggregateMethod = validateOptionalEnum(params.aggregate, ["median", "mean", "min", "max"], "aggregate") as V1Aggregate | undefined;

	const sessionId = generateSessionId(params.name);

	// --- P0-4: Build V1 contract ---
	const contract = buildContractV1({
		name: params.name,
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
		requireGit: params.require_git,
		requireCleanBaseline: params.require_clean_baseline,
		allowedPaths: Array.isArray(params.allowed_paths) ? params.allowed_paths : undefined,
		excludedPaths: Array.isArray(params.excluded_paths) ? params.excluded_paths : undefined,
	});

	// --- P0-1: Validate git safety (V1 scope) ---
	const gitViolations = validateScopeGitSafety(ctx.cwd, contract.scope);
	if (gitViolations.length > 0) {
		return store.textDetails(`[ERROR] git safety 違反のため初期化できません:\n${gitViolations.map((v, i) => `  ${i + 1}. ${v}`).join("\n")}`, { gitViolations });
	}

	// --- Validate V1 contract ---
	const validation = validateContractV1(contract);
	if (!validation.valid) {
		return store.textDetails(`[ERROR] 契約検証失敗:\n${validation.errors.map((e, i) => `  ${i + 1}. ${e}`).join("\n")}`, { errors: validation.errors });
	}

	// --- Create canonical plan-scoped layout ---
	let planRef: { planId: string; planDir: string; reused: boolean };
	const warnings: string[] = [];
	try {
		const benchmarkCommandScript = params.benchmark_command && params.benchmark_command !== "./autoresearch.sh"
			? `${params.benchmark_command}\n`
			: "echo 'TODO: implement benchmark' >&2\nexit 1\n";
		const checksScript = checksMode === "none" ? null : (checksMode === "command" && params.checks_command ? `${params.checks_command}\n` : null);
		planRef = createOrReusePlan(ctx.cwd, {
			planMarkdown: `# ${params.name}\n\n${params.objective ?? params.name}\n`,
			contract,
			benchmarkScript: `#!/usr/bin/env bash\nset -euo pipefail\n${benchmarkCommandScript}`,
			checksScript: checksScript ? `#!/usr/bin/env bash\nset -euo pipefail\n${checksScript}` : null,
			metricName: params.metric_name,
			metricDirection: direction,
			successCriteria: contract.acceptance,
			constraints: contract.scope,
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
			schemaVersion: contract.schemaVersion,
		}) + "\n");
	} catch (e) {
		warnings.push(`legacy jsonl: ${e instanceof Error ? e.message : String(e)}`);
	}

	try { ensureSessionDir(ctx.cwd, sessionId, deps.sessionDir); } catch {}

	// --- P0-1: Record baseline commit for future diff tracking ---
	const baselineCommit = getBaselineCommit(ctx.cwd);

	// --- Transaction event: contract_created ---
	try {
		appendToJsonl(deps.eventsLedgerPath(ctx.cwd, sessionId), {
			schemaVersion: 1, event: "contract_created", piRunId: "", timestamp: Date.now(),
			details: { sessionId, schemaVersion: contract.schemaVersion, baselineCommit },
		} satisfies EventLedgerEntry);
	} catch { /* best effort */ }

	store.updateWidget(ctx);

	let text = `[OK] 初期化完了\n名前: ${store.state.name}\n指標: ${store.state.metricName}(${directionLabel(store.state.direction)})\nsessionId: ${sessionId}`;
	text += `\nplanId: ${planRef!.planId}`;
	text += `\n契約: ${path.relative(ctx.cwd, path.join(planRef!.planDir, "contract.json"))}`;
	if (baselineCommit) text += `\nbaseline: ${baselineCommit.slice(0, 12)}`;
	const allWarnings = [...validation.warnings, ...warnings];
	if (allWarnings.length > 0) {
		text += `\n\n[WARNING]\n${allWarnings.map((w, i) => `  ${i + 1}. ${w}`).join("\n")}`;
	}
	text += `\n\nacceptance mode: ${contract.acceptance.mode}`;
	text += `\nchecks: ${contract.evaluation.checks.length > 0 ? `${contract.evaluation.checks.length} 個` : "なし"}`;
	text += `\nbenchmark: ${contract.evaluation.benchmark.command.argv.join(" ")}`;

	return store.textDetails(text, {
		name: store.state.name, metricName: store.state.metricName, metricUnit: store.state.metricUnit,
		direction: store.state.direction, sessionId, schemaVersion: contract.schemaVersion,
		acceptance: contract.acceptance, scope: contract.scope,
		baselineCommit, warnings: allWarnings, planId: planRef!.planId, planDir: path.relative(ctx.cwd, planRef!.planDir),
	});
}
