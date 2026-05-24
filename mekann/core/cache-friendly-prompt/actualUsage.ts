export type NormalizedActualCacheUsage = {
  inputTotalTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens?: number;
  cacheMissTokens?: number;
  tokenHitRate: number | null;
  cacheableReadRate: number | null;
};

export type ActualUsageLog = NormalizedActualCacheUsage & {
  timestamp: string;
  requestId?: string;
  runKey?: string;
  provider?: string;
  model?: string;
  providerPrefixHash?: string;
  usageSource: "pi_normalized_usage" | "provider_raw_usage";
  rawUsage?: unknown;
};

type UsageSource = ActualUsageLog["usageSource"];

type NormalizeResult = NormalizedActualCacheUsage & { usageSource: UsageSource };

function numberOf(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function rate(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

function finish(values: Omit<NormalizedActualCacheUsage, "tokenHitRate" | "cacheableReadRate">, usageSource: UsageSource): NormalizeResult {
  const inputTotalTokens = values.inputTotalTokens;
  const cacheReadTokens = values.cacheReadTokens;
  const cacheWriteTokens = values.cacheWriteTokens;
  return {
    ...values,
    tokenHitRate: rate(cacheReadTokens, inputTotalTokens),
    cacheableReadRate: cacheWriteTokens !== undefined ? rate(cacheReadTokens, cacheReadTokens + cacheWriteTokens) : null,
    usageSource,
  };
}

function providerFamily(provider?: string): string {
  return (provider ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function hasPiNormalizedUsage(usage: Record<string, unknown>): boolean {
  return ["inputTotal", "input", "output", "cacheRead", "cacheWrite", "cacheMiss"].some((key) => key in usage);
}

export function normalizeActualCacheUsage(provider: string | undefined, usage: unknown): NormalizeResult | null {
  if (!usage || typeof usage !== "object") return null;
  const u = usage as Record<string, any>;
  const providerKey = providerFamily(provider);

  if (hasPiNormalizedUsage(u)) {
    const inputTotalTokens = numberOf(u.inputTotal) ?? numberOf(u.input) ?? 0;
    const outputTokens = numberOf(u.output) ?? 0;
    const cacheReadTokens = numberOf(u.cacheRead) ?? 0;
    const cacheWriteTokens = numberOf(u.cacheWrite);
    const cacheMissTokens = numberOf(u.cacheMiss);
    return finish({ inputTotalTokens, outputTokens, cacheReadTokens, cacheWriteTokens, cacheMissTokens }, "pi_normalized_usage");
  }

  if (providerKey.includes("deepseek") || "prompt_cache_hit_tokens" in u || "prompt_cache_miss_tokens" in u) {
    const cacheReadTokens = numberOf(u.prompt_cache_hit_tokens) ?? 0;
    const cacheMissTokens = numberOf(u.prompt_cache_miss_tokens) ?? 0;
    const inputTotalTokens = cacheReadTokens + cacheMissTokens;
    const outputTokens = numberOf(u.completion_tokens) ?? numberOf(u.output_tokens) ?? 0;
    return finish({ inputTotalTokens, outputTokens, cacheReadTokens, cacheMissTokens }, "provider_raw_usage");
  }

  if (providerKey.includes("anthropic") || "cache_read_input_tokens" in u || "cache_creation_input_tokens" in u) {
    const normalInputTokens = numberOf(u.input_tokens) ?? 0;
    const cacheReadTokens = numberOf(u.cache_read_input_tokens) ?? 0;
    const cacheWriteTokens = numberOf(u.cache_creation_input_tokens) ?? 0;
    const outputTokens = numberOf(u.output_tokens) ?? 0;
    return finish({ inputTotalTokens: normalInputTokens + cacheReadTokens + cacheWriteTokens, outputTokens, cacheReadTokens, cacheWriteTokens }, "provider_raw_usage");
  }

  if (providerKey.includes("bedrock") || "inputTokens" in u || "cacheReadInputTokens" in u || "CacheReadInputTokens" in u) {
    const normalInputTokens = numberOf(u.inputTokens) ?? 0;
    const cacheReadTokens = numberOf(u.cacheReadInputTokens) ?? numberOf(u.CacheReadInputTokens) ?? 0;
    const cacheWriteTokens = numberOf(u.cacheWriteInputTokens) ?? numberOf(u.CacheWriteInputTokens) ?? 0;
    const outputTokens = numberOf(u.outputTokens) ?? 0;
    return finish({ inputTotalTokens: normalInputTokens + cacheReadTokens + cacheWriteTokens, outputTokens, cacheReadTokens, cacheWriteTokens }, "provider_raw_usage");
  }

  if (providerKey.includes("gemini") || providerKey.includes("vertex") || "prompt_token_count" in u || "promptTokenCount" in u || "cachedContentTokenCount" in u || "cached_content_token_count" in u) {
    const inputTotalTokens = numberOf(u.prompt_token_count) ?? numberOf(u.promptTokenCount) ?? 0;
    const outputTokens = numberOf(u.candidates_token_count) ?? numberOf(u.candidatesTokenCount) ?? 0;
    const cacheReadTokens = numberOf(u.cached_content_token_count) ?? numberOf(u.cachedContentTokenCount) ?? 0;
    return finish({ inputTotalTokens, outputTokens, cacheReadTokens }, "provider_raw_usage");
  }

  const inputTotalTokens = numberOf(u.prompt_tokens) ?? numberOf(u.input_tokens) ?? 0;
  const outputTokens = numberOf(u.completion_tokens) ?? numberOf(u.output_tokens) ?? 0;
  const cacheReadTokens = numberOf(u.prompt_tokens_details?.cached_tokens) ?? numberOf(u.input_tokens_details?.cached_tokens) ?? numberOf(u.cached_tokens) ?? 0;
  const cacheWriteTokens = numberOf(u.cache_write_tokens);
  return finish({ inputTotalTokens, outputTokens, cacheReadTokens, cacheWriteTokens }, "provider_raw_usage");
}
