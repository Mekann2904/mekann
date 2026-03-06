// Path: .pi/lib/tool-policy-engine.ts
// Role: ツール実行前に timeout と重複抑制を決める軽量 policy engine を提供する
// Why: 遅い操作や重複操作を runtime 側で抑え、安い実行パスを選びやすくするため
// Related: .pi/lib/tool-telemetry-store.ts, .pi/lib/runtime-environment-cache.ts, .pi/lib/dynamic-tools/types.ts

import type { ToolCostMetadata } from "./dynamic-tools/types.js";
import { getRuntimeEnvironmentCache } from "./runtime-environment-cache.js";
import { getToolTelemetryStore } from "./tool-telemetry-store.js";

export interface ToolExecutionPolicyInput {
  toolName: string;
  inputFingerprint?: string;
  inputSignature: string;
  requestedTimeoutMs?: number;
  defaultTimeoutMs: number;
  metadata?: ToolCostMetadata;
  executionMode?: "probe" | "full";
  canReuseDuplicateResult?: boolean;
}

export interface ToolExecutionPolicyDecision {
  timeoutMs: number;
  duplicateWarning?: string;
  reusedDuplicateRecordId?: string;
  promptHints: string[];
}

export interface ProbeLimitResolutionInput {
  toolName: string;
  requestedLimit: number;
  minimumProbeLimit?: number;
  maximumProbeLimit?: number;
  metadata?: ToolCostMetadata;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function resolveToolExecutionPolicy(
  input: ToolExecutionPolicyInput
): ToolExecutionPolicyDecision {
  const telemetry = getToolTelemetryStore();
  const envCache = getRuntimeEnvironmentCache();
  const stats = telemetry.getToolStats(input.toolName);
  const duplicate = telemetry.findRecentDuplicate(input.inputSignature);
  const exactDuplicate = input.inputFingerprint
    ? telemetry.findRecentExactDuplicate(input.inputFingerprint)
    : undefined;
  const metadata = input.metadata;

  let timeoutMs = input.requestedTimeoutMs && input.requestedTimeoutMs > 0
    ? input.requestedTimeoutMs
    : metadata?.defaultTimeoutMs ?? input.defaultTimeoutMs;

  if (!input.requestedTimeoutMs || input.requestedTimeoutMs <= 0) {
    if (stats.count >= 3 && stats.p95DurationMs > 0) {
      timeoutMs = Math.max(timeoutMs, Math.round(stats.p95DurationMs * 1.5));
    }
    if ((metadata?.outputSizeEstimate === "large") || stats.averageOutputBytes > 128_000) {
      timeoutMs = Math.round(timeoutMs * 1.25);
    }
    if (input.executionMode === "probe" || metadata?.requiresProbe) {
      timeoutMs = Math.min(timeoutMs, Math.max(3_000, Math.round(timeoutMs * 0.35)));
    }
    if (stats.timeoutRate >= 0.34 && stats.p95DurationMs > 0) {
      timeoutMs = Math.max(timeoutMs, Math.round(stats.p95DurationMs * 1.75));
    }
  }

  timeoutMs = clamp(timeoutMs, 1_000, metadata?.maxTimeoutMs ?? 300_000);

  let duplicateWarning: string | undefined;
  let reusedDuplicateRecordId: string | undefined;
  if (duplicate) {
    const ageMs = Date.now() - duplicate.finishedAtMs;
    duplicateWarning = `同じか近い操作が ${Math.max(1, Math.round(ageMs / 1000))} 秒前に実行済みです。結果の再利用か条件の絞り込みを優先してください。`;
    if (input.canReuseDuplicateResult && exactDuplicate?.success) {
      reusedDuplicateRecordId = exactDuplicate.id;
    }
  }

  const promptHints = [
    ...telemetry.buildPromptHints({ maxHints: 3 }),
    envCache.formatForPrompt(),
  ];

  return {
    timeoutMs,
    duplicateWarning,
    reusedDuplicateRecordId,
    promptHints,
  };
}

export function resolveProbeLimit(input: ProbeLimitResolutionInput): number {
  const telemetry = getToolTelemetryStore();
  const stats = telemetry.getToolStats(input.toolName);
  const minimumProbeLimit = Math.max(1, input.minimumProbeLimit ?? 5);
  const maximumProbeLimit = Math.max(minimumProbeLimit, input.maximumProbeLimit ?? 20);

  if (input.requestedLimit <= minimumProbeLimit) {
    return input.requestedLimit;
  }

  let probeLimit = Math.min(input.requestedLimit, maximumProbeLimit);
  const isHistoricallyExpensive =
    stats.p95DurationMs >= 1_500 ||
    stats.averageOutputBytes >= 64_000 ||
    stats.timeoutRate >= 0.2 ||
    input.metadata?.outputSizeEstimate === "large";

  if (isHistoricallyExpensive) {
    probeLimit = Math.min(probeLimit, Math.max(minimumProbeLimit, Math.floor(maximumProbeLimit / 2)));
  }

  const isHistoricallyCheap =
    stats.count >= 3 &&
    stats.p95DurationMs > 0 &&
    stats.p95DurationMs <= 400 &&
    stats.averageOutputBytes <= 8_000 &&
    stats.timeoutRate === 0 &&
    input.metadata?.outputSizeEstimate !== "large";

  if (isHistoricallyCheap) {
    probeLimit = Math.min(input.requestedLimit, Math.max(probeLimit, maximumProbeLimit));
  }

  return clamp(probeLimit, minimumProbeLimit, input.requestedLimit);
}
