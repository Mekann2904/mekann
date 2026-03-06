// Path: .pi/lib/tool-telemetry.ts
// Role: ツール実行テレメトリの共通型と正規化ユーティリティを提供する
// Why: ツールの実行コストを一貫して記録し、policy判断に再利用するため
// Related: .pi/lib/tool-telemetry-store.ts, .pi/lib/tool-policy-engine.ts, .pi/extensions/search/utils/cli.ts

import { createHash } from "node:crypto";

export type ToolExecutionErrorType =
  | "timeout"
  | "validation"
  | "execution"
  | "permission"
  | "duplicate"
  | "aborted"
  | "unknown";

export interface ToolExecutionRecord {
  id: string;
  toolName: string;
  startedAtMs: number;
  finishedAtMs: number;
  durationMs: number;
  timeoutMs: number;
  success: boolean;
  timedOut: boolean;
  aborted: boolean;
  retryCount: number;
  outputBytes: number;
  inputFingerprint: string;
  normalizedSignature: string;
  duplicateOfId?: string;
  reusedPreviousResult?: boolean;
  executionMode?: "probe" | "full";
  resultSummary?: string;
  errorType?: ToolExecutionErrorType;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface PendingToolExecution {
  id: string;
  toolName: string;
  startedAtMs: number;
  timeoutMs: number;
  retryCount: number;
  inputFingerprint: string;
  normalizedSignature: string;
  executionMode?: "probe" | "full";
  metadata?: Record<string, unknown>;
}

export interface ToolStats {
  count: number;
  successRate: number;
  timeoutRate: number;
  averageDurationMs: number;
  p95DurationMs: number;
  averageOutputBytes: number;
  recentDuplicateCount: number;
  probeToFullEscalationRate: number;
  modeStats: Partial<Record<"probe" | "full", ToolModeStats>>;
  lastUsedAtMs?: number;
}

export interface ToolModeStats {
  count: number;
  successRate: number;
  timeoutRate: number;
  averageDurationMs: number;
  p95DurationMs: number;
}

export interface PromptHintOptions {
  maxHints?: number;
  slowCallThresholdMs?: number;
  duplicateWindowMs?: number;
}

export function createTelemetryId(prefix = "tool"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeToolPayload(input: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(input).sort()) {
    const value = input[key];
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      normalized[key] = value.map((item) =>
        typeof item === "object" && item !== null
          ? normalizeToolPayload(item as Record<string, unknown>)
          : item
      );
      continue;
    }
    if (typeof value === "object" && value !== null) {
      normalized[key] = normalizeToolPayload(value as Record<string, unknown>);
      continue;
    }
    normalized[key] = value;
  }
  return normalized;
}

export function buildInputFingerprint(toolName: string, input: Record<string, unknown>): string {
  const normalized = JSON.stringify(normalizeToolPayload(input));
  return createHash("sha256").update(`${toolName}:${normalized}`).digest("hex");
}

export function buildNormalizedSignature(
  toolName: string,
  input: Record<string, unknown>,
  keysToIgnore: string[] = ["timeout", "timeoutMs", "maxOutputSize", "limit", "maxResults"]
): string {
  const normalized = normalizeToolPayload(input);
  for (const key of keysToIgnore) {
    delete normalized[key];
  }
  return `${toolName}:${JSON.stringify(normalized)}`;
}

export function estimateOutputBytes(output: unknown): number {
  if (typeof output === "string") {
    return Buffer.byteLength(output, "utf-8");
  }
  if (output === undefined || output === null) {
    return 0;
  }
  try {
    return Buffer.byteLength(JSON.stringify(output), "utf-8");
  } catch {
    return Buffer.byteLength(String(output), "utf-8");
  }
}

export function summarizeOutput(output: unknown, maxLength = 200): string {
  if (output === undefined || output === null) {
    return "";
  }
  const text = typeof output === "string" ? output : JSON.stringify(output);
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`;
}

export function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((percentile / 100) * sorted.length));
  return sorted[index] ?? 0;
}
