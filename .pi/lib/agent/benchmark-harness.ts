/*
 * .pi/lib/agent/benchmark-harness.ts
 * Prompt Stack とエージェント実行の比較指標を集計する。
 * 実装差分を完了率や失敗率で機械的に比較できるようにするために存在する。
 * 関連ファイル: .pi/lib/agent/prompt-stack.ts, .pi/lib/agent/model-adapters.ts, tests/unit/lib/benchmark-harness.test.ts, tests/integration/prompt-stack.integration.test.ts
 */

import type { PromptStackEntry, PromptStackLayer } from "./prompt-stack.js";

/**
 * 1 実行分のベンチマーク入力。
 * @summary ベンチマーク実行入力
 */
export interface AgentBenchmarkRun {
  variantId: string;
  scenarioId: string;
  completed: boolean;
  toolCalls: number;
  toolFailures: number;
  retries: number;
  emptyOutputs: number;
  turns: number;
  latencyMs?: number;
  promptChars?: number;
  promptStackSummary?: PromptStackBenchmarkSummary;
  runtimeNotificationCount?: number;
}

/**
 * 実行結果から 1 件分の比較指標を作るための入力。
 * @summary ベンチマーク実行ビルダー入力
 */
export interface AgentBenchmarkRunInput {
  variantId: string;
  scenarioId: string;
  completed: boolean;
  toolCalls?: number;
  toolFailures?: number;
  retries?: number;
  emptyOutputs?: number;
  turns?: number;
  latencyMs?: number;
  promptChars?: number;
  promptStackSummary?: PromptStackBenchmarkSummary;
  runtimeNotificationCount?: number;
}

/**
 * Prompt Stack 集計結果。
 * @summary Prompt Stack 指標
 */
export interface PromptStackBenchmarkSummary {
  entryCount: number;
  totalChars: number;
  estimatedTokens: number;
  byLayer: Record<PromptStackLayer, number>;
  bySource: Record<string, number>;
}

/**
 * 変種ごとの集計結果。
 * @summary Variant 指標
 */
export interface AgentBenchmarkVariantSummary {
  variantId: string;
  runCount: number;
  scenarioCount: number;
  completionRate: number;
  toolFailureRate: number;
  retryRate: number;
  emptyOutputRate: number;
  averageTurns: number;
  averageLatencyMs: number;
  averagePromptTokens: number;
  averageRuntimeNotificationCount: number;
  averagePromptLayerTokens: Record<PromptStackLayer, number>;
}

/**
 * 比較結果。
 * @summary ベンチマーク比較結果
 */
export interface AgentBenchmarkComparison {
  variants: AgentBenchmarkVariantSummary[];
  bestVariant?: AgentBenchmarkVariantSummary;
}

const EMPTY_LAYER_COUNTS: Record<PromptStackLayer, number> = {
  "tool-description": 0,
  "system-policy": 0,
  "startup-context": 0,
  "runtime-notification": 0,
};

/**
 * おおまかなトークン数を推定する。
 * @summary トークン推定
 * @param text 対象文字列
 * @returns 推定トークン数
 */
export function estimatePromptTokens(text: string): number {
  const normalizedLength = text.trim().length;
  if (normalizedLength === 0) {
    return 0;
  }

  return Math.ceil(normalizedLength / 4);
}

/**
 * 比較用の 1 実行レコードを標準化して作る。
 * @summary ベンチマーク実行作成
 * @param input 入力
 * @returns 正規化済み benchmark run
 */
export function createAgentBenchmarkRun(
  input: AgentBenchmarkRunInput,
): AgentBenchmarkRun {
  return {
    variantId: input.variantId.trim(),
    scenarioId: input.scenarioId.trim(),
    completed: input.completed,
    toolCalls: Math.max(0, Math.trunc(input.toolCalls ?? 0)),
    toolFailures: Math.max(0, Math.trunc(input.toolFailures ?? 0)),
    retries: Math.max(0, Math.trunc(input.retries ?? 0)),
    emptyOutputs: Math.max(0, Math.trunc(input.emptyOutputs ?? 0)),
    turns: Math.max(0, Math.trunc(input.turns ?? 0)),
    latencyMs: input.latencyMs,
    promptChars: input.promptChars,
    promptStackSummary: input.promptStackSummary,
    runtimeNotificationCount: Math.max(0, Math.trunc(input.runtimeNotificationCount ?? 0)),
  };
}

/**
 * サブエージェント実行から比較用レコードを作る。
 * @summary サブエージェント比較レコード作成
 * @param input 入力
 * @returns benchmark run
 */
export function createSubagentBenchmarkRun(input: {
  provider?: string;
  model?: string;
  task: string;
  successCount: number;
  failureCount: number;
  retries?: number;
  promptChars?: number;
  latencyMs?: number;
  promptStackSummary?: PromptStackBenchmarkSummary;
  runtimeNotificationCount?: number;
}): AgentBenchmarkRun {
  return createAgentBenchmarkRun({
    variantId: buildVariantId(input.provider, input.model),
    scenarioId: `subagent:${normalizeScenarioId(input.task)}`,
    completed: input.failureCount === 0 && input.successCount > 0,
    toolCalls: input.successCount + input.failureCount,
    toolFailures: input.failureCount,
    retries: input.retries ?? 0,
    emptyOutputs: 0,
    turns: Math.max(1, input.successCount + input.failureCount),
    latencyMs: input.latencyMs,
    promptChars: input.promptChars,
    promptStackSummary: input.promptStackSummary,
    runtimeNotificationCount: input.runtimeNotificationCount,
  });
}

/**
 * loop 実行から比較用レコードを作る。
 * @summary loop 比較レコード作成
 * @param input 入力
 * @returns benchmark run
 */
export function createLoopBenchmarkRun(input: {
  provider?: string;
  model?: string;
  task: string;
  completed: boolean;
  iterations: number;
  verificationFailures?: number;
  emptyOutputs?: number;
  promptChars?: number;
  promptStackSummary?: PromptStackBenchmarkSummary;
  runtimeNotificationCount?: number;
}): AgentBenchmarkRun {
  return createAgentBenchmarkRun({
    variantId: buildVariantId(input.provider, input.model),
    scenarioId: `loop:${normalizeScenarioId(input.task)}`,
    completed: input.completed,
    toolCalls: input.iterations,
    toolFailures: input.verificationFailures ?? 0,
    retries: 0,
    emptyOutputs: input.emptyOutputs ?? 0,
    turns: input.iterations,
    promptChars: input.promptChars,
    promptStackSummary: input.promptStackSummary,
    runtimeNotificationCount: input.runtimeNotificationCount,
  });
}

/**
 * Prompt Stack の構成を指標化する。
 * @summary Prompt Stack 集計
 * @param entries Prompt Stack entry 一覧
 * @returns 集計結果
 */
export function summarizePromptStackForBenchmark(
  entries: PromptStackEntry[],
): PromptStackBenchmarkSummary {
  const byLayer: Record<PromptStackLayer, number> = { ...EMPTY_LAYER_COUNTS };
  const bySource: Record<string, number> = {};

  let totalChars = 0;
  let entryCount = 0;

  for (const entry of entries) {
    const content = entry.content.trim();
    if (!content) {
      continue;
    }

    entryCount += 1;
    totalChars += content.length;
    byLayer[entry.layer] += content.length;
    bySource[entry.source] = (bySource[entry.source] ?? 0) + content.length;
  }

  return {
    entryCount,
    totalChars,
    estimatedTokens: estimatePromptTokens("x".repeat(totalChars)),
    byLayer,
    bySource,
  };
}

/**
 * 複数の Prompt Stack 集計を合算する。
 * @summary Prompt Stack 集計合算
 * @param summaries 集計一覧
 * @returns 合算結果
 */
export function mergePromptStackBenchmarkSummaries(
  summaries: PromptStackBenchmarkSummary[],
): PromptStackBenchmarkSummary {
  const byLayer: Record<PromptStackLayer, number> = { ...EMPTY_LAYER_COUNTS };
  const bySource: Record<string, number> = {};

  let entryCount = 0;
  let totalChars = 0;

  for (const summary of summaries) {
    entryCount += summary.entryCount;
    totalChars += summary.totalChars;
    for (const layer of Object.keys(byLayer) as PromptStackLayer[]) {
      byLayer[layer] += summary.byLayer[layer] ?? 0;
    }
    for (const [source, chars] of Object.entries(summary.bySource)) {
      bySource[source] = (bySource[source] ?? 0) + chars;
    }
  }

  return {
    entryCount,
    totalChars,
    estimatedTokens: estimatePromptTokens("x".repeat(totalChars)),
    byLayer,
    bySource,
  };
}

/**
 * 変種ごとの指標を集計する。
 * @summary Variant 集計
 * @param runs 実行一覧
 * @returns 比較結果
 */
export function compareBenchmarkVariants(
  runs: AgentBenchmarkRun[],
): AgentBenchmarkComparison {
  const grouped = new Map<string, AgentBenchmarkRun[]>();

  for (const run of runs) {
    const variantId = run.variantId.trim();
    if (!variantId) {
      continue;
    }

    const bucket = grouped.get(variantId) ?? [];
    bucket.push(run);
    grouped.set(variantId, bucket);
  }

  const variants = [...grouped.entries()]
    .map(([variantId, variantRuns]) => summarizeVariant(variantId, variantRuns))
    .sort(compareVariantSummaries);

  return {
    variants,
    bestVariant: variants[0],
  };
}

/**
 * 1 変種の指標をまとめる。
 * @summary 変種サマリー
 * @param variantId 変種 ID
 * @param runs 実行一覧
 * @returns 集計結果
 */
function summarizeVariant(
  variantId: string,
  runs: AgentBenchmarkRun[],
): AgentBenchmarkVariantSummary {
  const scenarioIds = new Set<string>();

  let completedCount = 0;
  let totalToolCalls = 0;
  let totalToolFailures = 0;
  let totalRetries = 0;
  let totalEmptyOutputs = 0;
  let totalTurns = 0;
  let totalLatencyMs = 0;
  let totalPromptTokens = 0;
  let totalRuntimeNotificationCount = 0;
  const promptLayerTokenTotals: Record<PromptStackLayer, number> = { ...EMPTY_LAYER_COUNTS };

  for (const run of runs) {
    scenarioIds.add(run.scenarioId);
    if (run.completed) {
      completedCount += 1;
    }

    totalToolCalls += run.toolCalls;
    totalToolFailures += run.toolFailures;
    totalRetries += run.retries;
    totalEmptyOutputs += run.emptyOutputs;
    totalTurns += run.turns;
    totalLatencyMs += run.latencyMs ?? 0;
    totalPromptTokens += estimatePromptTokens("x".repeat(run.promptChars ?? 0));
    totalRuntimeNotificationCount += run.runtimeNotificationCount ?? 0;
    for (const layer of Object.keys(promptLayerTokenTotals) as PromptStackLayer[]) {
      const chars = run.promptStackSummary?.byLayer[layer] ?? 0;
      promptLayerTokenTotals[layer] += estimatePromptTokens("x".repeat(chars));
    }
  }

  const runCount = runs.length;
  const safeRunCount = runCount === 0 ? 1 : runCount;
  const safeToolCalls = totalToolCalls === 0 ? 1 : totalToolCalls;

  return {
    variantId,
    runCount,
    scenarioCount: scenarioIds.size,
    completionRate: completedCount / safeRunCount,
    toolFailureRate: totalToolFailures / safeToolCalls,
    retryRate: totalRetries / safeToolCalls,
    emptyOutputRate: totalEmptyOutputs / safeRunCount,
    averageTurns: totalTurns / safeRunCount,
    averageLatencyMs: totalLatencyMs / safeRunCount,
    averagePromptTokens: totalPromptTokens / safeRunCount,
    averageRuntimeNotificationCount: totalRuntimeNotificationCount / safeRunCount,
    averagePromptLayerTokens: {
      "tool-description": promptLayerTokenTotals["tool-description"] / safeRunCount,
      "system-policy": promptLayerTokenTotals["system-policy"] / safeRunCount,
      "startup-context": promptLayerTokenTotals["startup-context"] / safeRunCount,
      "runtime-notification": promptLayerTokenTotals["runtime-notification"] / safeRunCount,
    },
  };
}

/**
 * 比較の優先順位を定義する。
 * @summary Variant 比較
 * @param left 左
 * @param right 右
 * @returns sort 用比較値
 */
function compareVariantSummaries(
  left: AgentBenchmarkVariantSummary,
  right: AgentBenchmarkVariantSummary,
): number {
  if (left.completionRate !== right.completionRate) {
    return right.completionRate - left.completionRate;
  }

  if (left.toolFailureRate !== right.toolFailureRate) {
    return left.toolFailureRate - right.toolFailureRate;
  }

  if (left.emptyOutputRate !== right.emptyOutputRate) {
    return left.emptyOutputRate - right.emptyOutputRate;
  }

  if (left.averageTurns !== right.averageTurns) {
    return left.averageTurns - right.averageTurns;
  }

  return left.averagePromptTokens - right.averagePromptTokens;
}

/**
 * variant 表示名を作る。
 * @summary variant ID 作成
 * @param provider provider 名
 * @param model model 名
 * @returns variant ID
 */
function buildVariantId(provider?: string, model?: string): string {
  const normalizedProvider = provider?.trim() || "unknown-provider";
  const normalizedModel = model?.trim() || "unknown-model";
  return `${normalizedProvider}/${normalizedModel}`;
}

/**
 * scenario ID を短く正規化する。
 * @summary scenario ID 正規化
 * @param value 入力文字列
 * @returns 正規化済み ID
 */
function normalizeScenarioId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 64);
}
