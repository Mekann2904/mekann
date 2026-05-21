/**
 * SessionStore: autoresearch ツール群で共有する mutable state。
 * 旧 closure 変数をクラスに集約し、tool handler 間で安全に共有する。
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ChecksResult, RunResult } from "../runner.js";
import type { ExperimentState, RunEntry } from "../state.js";
import { freshState, isBestMetric, countByStatus } from "../state.js";
import { renderWidget, directionLabel, type LoopInfo } from "../state.js";

// ─── Constants ────────────────────────────────────────────────

export const DEFAULT_MAX_LOOP_ITERATIONS = 100;
export const NO_PROGRESS_LIMIT = 10;
export const DEFAULT_TIMEOUT_SECONDS = 600;

export const STATUS_LABELS: Record<string, string> = {
	keep: "採用", discard: "棄却", crash: "クラッシュ",
	checks_failed: "checks失敗", revert_failed: "revert失敗",
};
export const STATUS_PREFIX: Record<string, string> = {
	keep: "[KEEP]", discard: "[DISCARD]", crash: "[CRASH]",
	checks_failed: "[CHECKS_FAILED]", revert_failed: "[REVERT_FAILED]",
};

// ─── Types ────────────────────────────────────────────────────

export interface RunData {
	result: RunResult;
	checks: ChecksResult;
	startedAt: number;
	completedAt: number;
	createdAt: number;
	artifactDir?: string;
	artifactFailed?: boolean;
	runSeq?: number;
}

export type ToolResponse = Readonly<{
	content: ReadonlyArray<{ type: "text"; text: string }>;
	details: Record<string, unknown>;
}>;

// ─── SessionStore ─────────────────────────────────────────────

export class SessionStore {
	active = false;
	autoLoop = false;
	loopPromptQueued = false;
	loopIterationCount = 0;
	maxLoopIterations: number | null = DEFAULT_MAX_LOOP_ITERATIONS;
	lastLoggedRun = 0;
	agentStartRunCount = 0;
	noProgressAgentEnds = 0;
	runningExperiment: { startedAt: number; command: string } | null = null;
	lastChecks: ChecksResult | null = null;
	lastRunResult: (RunResult & { piRunId: string }) | null = null;
	lastRunChecks: ChecksResult | null = null;
	state: ExperimentState = freshState();
	runResultMap = new Map<string, RunData>();

	// ─── Helper methods ────────────────────────────────────

	textResponse(text: string): ToolResponse {
		return { content: [{ type: "text" as const, text }], details: {} } as const;
	}

	textDetails(text: string, details: Record<string, unknown>): ToolResponse {
		return { content: [{ type: "text" as const, text }], details };
	}

	get INACTIVE_RESPONSE(): ToolResponse {
		return this.textResponse(
			"[ERROR] autoresearch モードが無効です。\n`/autoresearch on` で有効化してください。",
		);
	}

	loopInfo(): LoopInfo {
		return {
			enabled: this.autoLoop,
			iteration: this.loopIterationCount,
			maxIterations: this.maxLoopIterations,
			noProgress: this.noProgressAgentEnds,
			noProgressLimit: NO_PROGRESS_LIMIT,
		};
	}

	resetLoopProgress(): void {
		this.loopPromptQueued = false;
		this.loopIterationCount = 0;
		this.lastLoggedRun = this.state.runCount;
		this.agentStartRunCount = this.state.runCount;
		this.noProgressAgentEnds = 0;
	}

	updateWidget(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;
		const lines = renderWidget(this.state, this.active, this.runningExperiment, this.loopInfo());
		ctx.ui.setWidget("autoresearch", lines ?? undefined);
	}

	resolvePrimaryMetricValue(
		metricName: string,
		runResult: { durationSeconds?: number; parsedMetrics?: Record<string, number> | null },
	): { value: number | null; source: "stdout_metric" | "wall_clock" | "missing" } {
		const parsed = runResult.parsedMetrics?.[metricName];
		if (typeof parsed === "number" && Number.isFinite(parsed)) {
			return { value: parsed, source: "stdout_metric" };
		}
		if (
			metricName === "duration_seconds" &&
			typeof runResult.durationSeconds === "number" &&
			Number.isFinite(runResult.durationSeconds)
		) {
			return { value: runResult.durationSeconds, source: "wall_clock" };
		}
		return { value: null, source: "missing" };
	}
}

// ─── Pure helper functions ────────────────────────────────────

export function validateOptionalEnum<T extends string>(
	value: unknown,
	valid: readonly T[],
	_fieldName: string,
): T | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value === "string" && (valid as readonly string[]).includes(value)) return value as T;
	return undefined;
}

export function generateSessionId(name: string): string {
	const ts = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
	const slug = name.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g, "-").slice(0, 20);
	return `${ts}-${slug}`;
}
