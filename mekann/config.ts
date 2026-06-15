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
	display: "none" | "external-pi" | "external-split";
	allowUnsafeExternalPi: boolean;
	logDir: string;
	kittenBin: string;
	piCommand: string;
	maxPatchBytes: number;
	externalPiSlots: number;
	allowNestedSubagents: boolean;
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
	display: "external-split",
	allowUnsafeExternalPi: true,
	logDir: "",
	kittenBin: "kitten",
	piCommand: "pi",
	maxPatchBytes: 50_000,
	externalPiSlots: 1,
	allowNestedSubagents: false,
	defaultReasoningEffort: "low",
	toolSurface: "delegate-only",
};

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

export const MEKANN_CODEX_DEFAULTS = {
	baseUrl: "https://chatgpt.com/backend-api",
	modelCacheTtlMs: 5 * 60 * 1000,
} as const;

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
