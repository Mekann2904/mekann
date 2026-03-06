/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/schemas/benchmark.schema.ts
 * @role benchmark API 用の型と Zod スキーマ
 * @why Web UI で agent benchmark 比較結果を型安全に扱うため
 * @related routes/benchmark.ts, services/benchmark-service.ts, web/api/client.ts
 * @public_api AgentBenchmarkRunSchema, AgentBenchmarkVariantSummarySchema, BenchmarkStatusSchema
 */

import { z } from "zod";

export const PromptLayerTokensSchema = z.object({
  "tool-description": z.number().nonnegative(),
  "system-policy": z.number().nonnegative(),
  "startup-context": z.number().nonnegative(),
  "runtime-notification": z.number().nonnegative(),
});

export const PromptStackBenchmarkSummarySchema = z.object({
  entryCount: z.number().int().nonnegative(),
  totalChars: z.number().int().nonnegative(),
  estimatedTokens: z.number().int().nonnegative(),
  byLayer: z.object({
    "tool-description": z.number().int().nonnegative(),
    "system-policy": z.number().int().nonnegative(),
    "startup-context": z.number().int().nonnegative(),
    "runtime-notification": z.number().int().nonnegative(),
  }),
  bySource: z.record(z.string(), z.number().int().nonnegative()),
});

export const AgentBenchmarkRunSchema = z.object({
  variantId: z.string(),
  scenarioId: z.string(),
  completed: z.boolean(),
  toolCalls: z.number().int().nonnegative(),
  toolFailures: z.number().int().nonnegative(),
  retries: z.number().int().nonnegative(),
  emptyOutputs: z.number().int().nonnegative(),
  turns: z.number().int().nonnegative(),
  latencyMs: z.number().optional(),
  promptChars: z.number().optional(),
  promptStackSummary: PromptStackBenchmarkSummarySchema.optional(),
  runtimeNotificationCount: z.number().int().nonnegative().optional(),
});

export const AgentBenchmarkVariantSummarySchema = z.object({
  variantId: z.string(),
  runCount: z.number().int().nonnegative(),
  scenarioCount: z.number().int().nonnegative(),
  completionRate: z.number().min(0).max(1),
  toolFailureRate: z.number().min(0).max(1),
  retryRate: z.number().min(0).max(1),
  emptyOutputRate: z.number().min(0).max(1),
  averageTurns: z.number().nonnegative(),
  averageLatencyMs: z.number().nonnegative(),
  averagePromptTokens: z.number().nonnegative(),
  averageRuntimeNotificationCount: z.number().nonnegative(),
  averagePromptLayerTokens: PromptLayerTokensSchema,
});

export const BenchmarkStatusSchema = z.object({
  cwd: z.string(),
  variants: z.array(AgentBenchmarkVariantSummarySchema),
  recentRuns: z.array(AgentBenchmarkRunSchema),
  bestVariant: AgentBenchmarkVariantSummarySchema.nullable(),
});

export type AgentBenchmarkRunDto = z.infer<typeof AgentBenchmarkRunSchema>;
export type AgentBenchmarkVariantSummaryDto = z.infer<typeof AgentBenchmarkVariantSummarySchema>;
export type BenchmarkStatusDto = z.infer<typeof BenchmarkStatusSchema>;
