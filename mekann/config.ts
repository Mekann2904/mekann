/**
 * Central configuration values for mekann extensions.
 *
 * Keep feature-specific modules free of hard-coded config paths/defaults so
 * mekann behavior can be audited and changed from one place.
 */
import { homedir } from "node:os";
import { join } from "node:path";

import type { CodexReasoningEffort } from "./utils/codex-shared/types.js";

export const MEKANN_CONFIG_VERSION = 1 as const;

export function getPiAgentConfigDir(home = homedir()): string {
	return join(home, ".pi", "agent");
}

export interface MekannSubagentConfigDefaults {
	maxSubagents: number;
	maxOpenAgents: number;
	maxQueuedSubagents: number;
	maxDepth: number;
	defaultWaitTimeoutMs: number;
	maxWaitTimeoutMs: number;
	minWaitTimeoutMs: number;
	/** Deadline (ms) for an external child Pi to send its initial IPC hello after launch. The child must finish booting (kitty window -> shell -> node -> pi boot -> extension load -> model-registry init -> IPC connect -> hello) within this window or the spawn errors out with no retry. Generous on purpose: a single slow boot otherwise kills the whole synchronous review_fixer run. */
	helloTimeoutMs: number;
	display: "none" | "external-pi" | "external-split";
	allowUnsafeExternalPi: boolean;
	logDir: string;
	kittenBin: string;
	piCommand: string;
	maxPatchBytes: number;
	externalPiSlots: number;
	allowNestedSubagents: boolean;
	/** Max times a single agent result can be re-run via `agent_results action=retry` (issue #83 / C-014). */
	maxResultRetries: number;
	/** Max mailbox items/events retained before eviction (issue #152 / IC). */
	mailboxRetention: number;
	defaultReasoningEffort: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
	toolSurface: "delegate-only" | "async-tools";
}

export const MEKANN_SUBAGENT_DEFAULTS: MekannSubagentConfigDefaults = {
	maxSubagents: 1,
	maxOpenAgents: 2,
	maxQueuedSubagents: 2,
	maxDepth: 2,
	defaultWaitTimeoutMs: 30_000,
	maxWaitTimeoutMs: 600_000,
	minWaitTimeoutMs: 1_000,
	helloTimeoutMs: 60_000,
	display: "external-split",
	allowUnsafeExternalPi: true,
	logDir: "",
	kittenBin: "kitten",
	piCommand: "pi",
	maxPatchBytes: 50_000,
	externalPiSlots: 1,
	allowNestedSubagents: false,
	maxResultRetries: 3,
	mailboxRetention: 10_000,
	defaultReasoningEffort: "low",
	toolSurface: "delegate-only",
};

/**
 * Hard ceiling on concurrent subagents (issue #83 / C-010).
 *
 * Enforced in controlFactory (Math.min cap) and settingsSchema (validation
 * range), and surfaced in the `--subagent-max-agents` flag description so the
 * documented cap matches the enforced cap. Previously the flag description
 * reported `maxSubagents` (the *default*, 1) while the real cap was 4.
 */
export const HARD_MAX_SUBAGENTS = 4;

/**
 * Hard ceiling on the per-result retry budget (issue #83 / C-014).
 *
 * Shared by settingsSchema (validation range) and controlFactory (runtime
 * clamp) so a configured `maxResultRetries` can never exceed this cap —
 * mirroring how {@link HARD_MAX_SUBAGENTS} single-sources the concurrency cap
 * to keep the schema ceiling and the enforced ceiling from drifting apart.
 */
export const HARD_MAX_RESULT_RETRIES = 10;

/**
 * Hard ceiling on the number of pending results a single `apply` call will
 * process (issue #152 / IC-159). Previously `max_results ?? Infinity` applied
 * every pending result in one batch, which on a large backlog could mutate a
 * huge number of files in one trust-transition. The effective batch size is
 * clamped to `[1, HARD_MAX_APPLY_BATCH]` regardless of the requested value.
 */
export const HARD_MAX_APPLY_BATCH = 500;

export const MEKANN_SANDBOX_DEFAULTS = {
	llmOutputMaxBytes: 50 * 1024,
	llmOutputMaxLines: 2000,
} as const;

export const MEKANN_OUTPUT_GATE_DEFAULTS = {
	maxInlineBytes: 48 * 1024,
	previewBytes: 8 * 1024,
	maxSearchResultBytes: 12 * 1024,
	defaultContextLines: 3,
	defaultMaxResults: 10,
	artifactRetentionMaxFiles: 200,
} as const;

/**
 * context-control planner / report / analysis thresholds (issue #166,
 * IC-174 / IC-175 / IC-176).
 *
 * Previously the context-pressure classification, per-pressure inline
 * budgets, message/tool policy thresholds, savings rates, payload-share
 * thresholds, health penalties, risk bands, cache-efficiency warnings, and
 * alert ratios were hard-coded separately in `planner.ts`, `report.ts`, and
 * `analysis.ts` — and the planner and report even disagreed on the same
 * metric (e.g. summarize at 24 KB vs. pressure-aware budgets). Centralising
 * them here lets a single `mekann.json` override move every consumer in
 * tandem. Defaults preserve the pre-issue values, with one intentional
 * behavioural change for IC-175: the report module now classifies messages
 * via the shared `messagePctHigh` (75 %) instead of its old report-only
 * 65 %/60 % thresholds, so planner/report/analysis agree on one knob.
 *
 * Resolution: {@link resolveContextControlConfig} merges
 * `featureConfig("context-control")` over these defaults.
 */
export interface MekannContextControlConfig {
	// Pressure classification (context-window %)
	pressureCriticalPct: number;
	pressureHighPct: number;
	pressureMediumPct: number;
	// Inline budgets by pressure (bytes)
	budgetDynamicTailCriticalBytes: number;
	budgetDynamicTailHighBytes: number;
	budgetDynamicTailMediumBytes: number;
	budgetDynamicTailLowBytes: number;
	budgetMessageCriticalBytes: number;
	budgetMessageHighBytes: number;
	/** Normal-pressure message inline budget; also the summarize threshold shared by analysis/report (IC-175). */
	messageSummarizeBytes: number;
	budgetToolCriticalBytes: number;
	budgetToolHighBytes: number;
	budgetToolNormalBytes: number;
	// Message-item policy (bytes) — shared by planner / analysis / report (IC-175)
	messageRetrieveBytes: number;
	// Savings rates (fraction 0..1)
	savingsSummarizeHigh: number;
	savingsRetrieveMedium: number;
	savingsExternalize: number;
	savingsCacheableOverflow: number;
	savingsSystemPrompt: number;
	savingsToolSchema: number;
	savingsMessagesClassify: number;
	savingsSystemPromptAudit: number;
	savingsToolExternalize: number;
	savingsCompactTrigger: number;
	// Payload-share thresholds (%)
	messagePctHigh: number;
	systemPromptPctHigh: number;
	systemPromptPctAudit: number;
	// Tool-output thresholds (bytes)
	toolExternalizeTotalBytes: number;
	toolWarnBytes: number;
	toolLargeSchemaBytes: number;
	// Growth-rate thresholds
	growthTokensPerRequest: number;
	growthPayloadBytesPerRequest: number;
	// Health-scoring penalties (positive numbers subtracted from score)
	penaltyPressureCritical: number;
	penaltyPressureHigh: number;
	penaltyPressureMedium: number;
	penaltyMessagePct: number;
	penaltySystemPromptPct: number;
	penaltyGrowth: number;
	penaltyLargeResult: number;
	// Risk bands (health-score thresholds; lower bound of each band)
	riskCriticalScore: number;
	riskHighScore: number;
	riskMediumScore: number;
	// Cache-efficiency warnings
	cacheWarmHitRateWarn: number;
	cacheWarmRequestMin: number;
	cachePrefixHashChurn: number;
	cacheModelSwitchChurn: number;
	// Alert thresholds
	alertTokenPct: number;
	alertLargeResultBytes: number;
	alertPayloadGrowthRatio: number;
	alertTokenGrowthRatio: number;
	alertPendingResults: number;
}

export const MEKANN_CONTEXT_CONTROL_DEFAULTS: MekannContextControlConfig = {
	pressureCriticalPct: 85,
	pressureHighPct: 70,
	pressureMediumPct: 45,
	budgetDynamicTailCriticalBytes: 4 * 1024,
	budgetDynamicTailHighBytes: 8 * 1024,
	budgetDynamicTailMediumBytes: 12 * 1024,
	budgetDynamicTailLowBytes: 16 * 1024,
	budgetMessageCriticalBytes: 8 * 1024,
	budgetMessageHighBytes: 16 * 1024,
	messageSummarizeBytes: 24 * 1024,
	budgetToolCriticalBytes: 8 * 1024,
	budgetToolHighBytes: 16 * 1024,
	budgetToolNormalBytes: 32 * 1024,
	messageRetrieveBytes: 8 * 1024,
	savingsSummarizeHigh: 0.75,
	savingsRetrieveMedium: 0.5,
	savingsExternalize: 0.6,
	savingsCacheableOverflow: 0.2,
	savingsSystemPrompt: 0.15,
	savingsToolSchema: 0.25,
	savingsMessagesClassify: 0.25,
	savingsSystemPromptAudit: 0.15,
	savingsToolExternalize: 0.5,
	savingsCompactTrigger: 0.45,
	messagePctHigh: 75,
	systemPromptPctHigh: 30,
	systemPromptPctAudit: 25,
	toolExternalizeTotalBytes: 64 * 1024,
	toolWarnBytes: 48 * 1024,
	toolLargeSchemaBytes: 48 * 1024,
	growthTokensPerRequest: 5000,
	growthPayloadBytesPerRequest: 24 * 1024,
	penaltyPressureCritical: 45,
	penaltyPressureHigh: 30,
	penaltyPressureMedium: 15,
	penaltyMessagePct: 12,
	penaltySystemPromptPct: 10,
	penaltyGrowth: 12,
	penaltyLargeResult: 10,
	riskCriticalScore: 35,
	riskHighScore: 55,
	riskMediumScore: 75,
	cacheWarmHitRateWarn: 0.35,
	cacheWarmRequestMin: 2,
	cachePrefixHashChurn: 3,
	cacheModelSwitchChurn: 3,
	alertTokenPct: 80,
	alertLargeResultBytes: 50 * 1024,
	alertPayloadGrowthRatio: 1.3,
	alertTokenGrowthRatio: 1.2,
	alertPendingResults: 5,
};

/**
 * autoresearch run-artifact retention defaults (issue #47).
 *
 * Run artifact dirs (`.autoresearch/plans/<planId>/runs/<runId>/`) grow
 * unbounded across long autoresearch loops and scale-supervisor candidate
 * evaluation. To keep disk usage bounded, only the `maxRunsPerPlan` newest
 * COMPLETED runs are retained per plan; older completed runs are pruned.
 * In-progress runs are never deleted.
 */
export const MEKANN_AUTORESEARCH_RUNS_DEFAULTS = {
	maxRunsPerPlan: 50,
} as const;

/**
 * context-ledger snapshot retention defaults (issue #76 / C-018).
 *
 * `/context-ledger snapshot --write` (and `restore --write`) create a new
 * timestamped snapshot on every invocation with no pruning, so disk usage
 * grows unbounded across long sessions. To keep it bounded, only the
 * `snapshotRetentionMaxFiles` newest timestamped snapshots are retained;
 * `latest.xml` is never pruned.
 */
export const MEKANN_CONTEXT_LEDGER_DEFAULTS = {
	snapshotRetentionMaxFiles: 50,
} as const;

/**
 * Resolved max completed runs kept per plan. Honors the
 * `MEKANN_AUTORESEARCH_MAX_RUNS_PER_PLAN` env override (non-negative integer);
 * falls back to {@link MEKANN_AUTORESEARCH_RUNS_DEFAULTS.maxRunsPerPlan}.
 * Issue #47.
 */
export function resolveMaxRunsPerPlan(): number {
	const raw = process.env.MEKANN_AUTORESEARCH_MAX_RUNS_PER_PLAN;
	if (raw !== undefined && raw.trim() !== "") {
		const n = Number.parseInt(raw, 10);
		if (Number.isFinite(n) && n >= 0) return n;
	}
	return MEKANN_AUTORESEARCH_RUNS_DEFAULTS.maxRunsPerPlan;
}

/**
 * Goal feature defaults.
 *
 * `compactReserveTokens` is the context-token reserve that triggers
 * compaction before a goal continuation is sent. It mirrors Pi's default
 * `CompactionSettings.reserveTokens` (16384); keeping it here (and exposed as
 * `goal.compactReserveTokens` in mekann.json) lets users re-align the goal
 * continuation threshold if they change Pi's compaction reserve (issue #167 /
 * IC-211). Previously this was a hard-coded `const` in goal/runtime.ts that
 * silently drifted from the user's Pi setting.
 */
export const MEKANN_GOAL_DEFAULTS = {
	compactReserveTokens: 16384,
} as const;

export const MEKANN_CODEX_DEFAULTS = {
	baseUrl: "https://chatgpt.com/backend-api",
	modelCacheTtlMs: 5 * 60 * 1000,
} as const;

/**
 * Dashboard rendering tunables (issue #166, IC-233 / IC-236 / IC-239).
 *
 * The Kitty graphics-escape base64 chunk size, the terminal-width clamp
 * range, and the GitHub-contribution quartile colors were hard-coded in
 * `avatar.ts`, `render.ts`, and `contribution-image.ts`. Centralising them
 * here lets a single `mekann.json` override adapt the dashboard to terminal
 * capability, theme, and color-vision needs. Defaults reproduce the
 * pre-issue behaviour exactly.
 */
export interface MekannDashboardConfig {
	/** Base64 characters per Kitty graphics-protocol APC chunk (IC-233). */
	kittyChunkChars: number;
	/** Minimum clamped terminal width for text rendering (IC-239). */
	widthMin: number;
	/** Maximum clamped terminal width for text rendering (IC-239). */
	widthMax: number;
	/** GitHub-contribution quartile colors, lowest to highest (IC-236). */
	levelColorNone: string;
	levelColorFirst: string;
	levelColorSecond: string;
	levelColorThird: string;
	levelColorFourth: string;
}

export const MEKANN_DASHBOARD_DEFAULTS: MekannDashboardConfig = {
	kittyChunkChars: 4096,
	widthMin: 20,
	widthMax: 140,
	levelColorNone: "#111827",
	levelColorFirst: "#0e4429",
	levelColorSecond: "#006d32",
	levelColorThird: "#26a641",
	levelColorFourth: "#39d353",
};

export const MEKANN_CODEX_WEB_SEARCH_DEFAULTS = {
	enabled: true,
	externalWebAccess: true,
	defaultSearchContextSize: "medium",
	model: undefined,
	effort: undefined,
	nonCodexDefaultModel: "gpt-5.5",
	nonCodexDefaultEffort: "low",
} as const satisfies {
	enabled: boolean;
	externalWebAccess: boolean;
	defaultSearchContextSize: "low" | "medium" | "high";
	model: string | undefined;
	effort: CodexReasoningEffort | undefined;
	nonCodexDefaultModel: string;
	nonCodexDefaultEffort: CodexReasoningEffort;
};
