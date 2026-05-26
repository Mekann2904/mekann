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

export function getLegacyPlanModeConfigPath(home = homedir()): string {
	return join(getPiAgentConfigDir(home), "plan-mode.json");
}

export interface MekannSubagentConfigDefaults {
	maxSubagents: number;
	maxOpenAgents: number;
	maxQueuedSubagents: number;
	maxDepth: number;
	defaultWaitTimeoutMs: number;
	maxWaitTimeoutMs: number;
	minWaitTimeoutMs: number;
	display: "none" | "kitty-pi" | "kitty-split";
	allowUnsafeExternalPi: boolean;
	logDir: string;
	kittenBin: string;
	piCommand: string;
	maxPatchBytes: number;
	externalPiSlots: number;
}

export const MEKANN_SUBAGENT_DEFAULTS: MekannSubagentConfigDefaults = {
	maxSubagents: 2,
	maxOpenAgents: 3,
	maxQueuedSubagents: 8,
	maxDepth: 2,
	defaultWaitTimeoutMs: 30_000,
	maxWaitTimeoutMs: 600_000,
	minWaitTimeoutMs: 1_000,
	display: "kitty-split",
	allowUnsafeExternalPi: true,
	logDir: "",
	kittenBin: "kitten",
	piCommand: "pi",
	maxPatchBytes: 50_000,
	externalPiSlots: 2,
};

export const MEKANN_SANDBOX_DEFAULTS = {
	llmOutputMaxBytes: 50 * 1024,
	llmOutputMaxLines: 2000,
} as const;

export const MEKANN_OUTPUT_GATE_DEFAULTS = {
	maxInlineBytes: 16 * 1024,
	previewBytes: 4 * 1024,
	maxSearchResultBytes: 12 * 1024,
	defaultContextLines: 3,
	defaultMaxResults: 10,
	artifactRetentionMaxFiles: 200,
} as const;

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
