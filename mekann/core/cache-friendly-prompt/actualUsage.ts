export type InputSemantics = "total_input" | "non_cached_input" | "unknown";
export type NormalizationStrategy =
  | "pi_inputTotal"
  | "pi_totalTokens_parts"
  | "pi_inferred_non_cached_input"
  | "pi_input_as_total"
  | "provider_deepseek"
  | "provider_anthropic"
  | "provider_bedrock"
  | "provider_gemini"
  | "provider_openai_compatible";

export type NormalizedActualCacheUsage = {
  inputTotalTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens?: number;
  cacheMissTokens?: number;
  tokenHitRate: number | null;
  cacheableReadRate: number | null;
  inputSemantics?: InputSemantics;
  normalizationStrategy?: NormalizationStrategy;
  normalizationWarnings?: string[];
};

export type ActualUsageLog = NormalizedActualCacheUsage & {
  timestamp: string;
  requestId?: string;
  runKey?: string;
  requestRole?: "main" | "subagent" | "tool" | "unknown";
  requestRoleSource?: string;
  provider?: string;
  model?: string;
  correlationConfidence?: "requestId_matched" | "runKey_latest" | "missing";
  stablePrefixHash?: string;
  featureCacheablePrefixHash?: string;
  providerPrefixHash?: string;
  providerPrefixChars?: number;
  stablePrefixChars?: number;
  semiStableChars?: number;
  totalPromptChars?: number;
  latestDynamicFragmentHashes?: Array<{ id: string; source: string; kind: string; stability: string; hash: string; chars?: number; tokenEstimate?: number }>;
  dynamicContextTruncated?: boolean;
  dynamicContextOriginalChars?: number;
  dynamicContextRenderedChars?: number;
  dynamicContextLimitChars?: number;
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

function providerReportsCacheWrite(providerKey: string): boolean {
  return providerKey.includes("anthropic") || providerKey.includes("bedrock") || providerKey.includes("minimax") || providerKey.includes("openrouter");
}

function hasPiNormalizedUsage(usage: Record<string, unknown>): boolean {
  return ["inputTotal", "input", "output", "cacheRead", "cacheWrite", "cacheMiss"].some((key) => key in usage);
}

export function normalizeActualCacheUsage(provider: string | undefined, usage: unknown): NormalizeResult | null {
  if (!usage || typeof usage !== "object") return null;
  const u = usage as Record<string, any>;
  const providerKey = providerFamily(provider);

  if (hasPiNormalizedUsage(u)) {
    const inputTokens = numberOf(u.input) ?? 0;
    const outputTokens = numberOf(u.output) ?? 0;
    const cacheReadTokens = numberOf(u.cacheRead) ?? 0;
    const rawCacheWriteTokens = numberOf(u.cacheWrite);
    const cacheWriteTokens = providerReportsCacheWrite(providerKey) ? rawCacheWriteTokens : rawCacheWriteTokens && rawCacheWriteTokens > 0 ? rawCacheWriteTokens : undefined;
    const cacheMissTokens = numberOf(u.cacheMiss);
    const totalTokens = numberOf(u.totalTokens);
    const inputTotal = numberOf(u.inputTotal);
    const observedInputParts = inputTokens + outputTokens + cacheReadTokens + (rawCacheWriteTokens ?? 0);
    const warnings: string[] = [];
    let inputTotalTokens: number;
    let inputSemantics: InputSemantics;
    let normalizationStrategy: NormalizationStrategy;
    if (inputTotal !== undefined) {
      inputTotalTokens = inputTotal;
      inputSemantics = "total_input";
      normalizationStrategy = "pi_inputTotal";
    } else if (totalTokens !== undefined && Math.abs(totalTokens - observedInputParts) <= 1) {
      inputTotalTokens = inputTokens + cacheReadTokens + (rawCacheWriteTokens ?? 0);
      inputSemantics = "non_cached_input";
      normalizationStrategy = "pi_totalTokens_parts";
    } else if (cacheReadTokens > inputTokens || (rawCacheWriteTokens ?? 0) > 0) {
      inputTotalTokens = inputTokens + cacheReadTokens + (rawCacheWriteTokens ?? 0);
      inputSemantics = "non_cached_input";
      normalizationStrategy = "pi_inferred_non_cached_input";
      warnings.push("Pi usage.input was inferred as non-cached input because cacheRead/cacheWrite made total-input semantics impossible or unlikely.");
    } else {
      inputTotalTokens = inputTokens;
      inputSemantics = "unknown";
      normalizationStrategy = "pi_input_as_total";
      warnings.push("Pi usage.input semantics are ambiguous; treated as total input tokens.");
    }
    return finish({ inputTotalTokens, outputTokens, cacheReadTokens, cacheWriteTokens, cacheMissTokens, inputSemantics, normalizationStrategy, normalizationWarnings: warnings }, "pi_normalized_usage");
  }

  if (providerKey.includes("deepseek") || "prompt_cache_hit_tokens" in u || "prompt_cache_miss_tokens" in u) {
    const cacheReadTokens = numberOf(u.prompt_cache_hit_tokens) ?? 0;
    const cacheMissTokens = numberOf(u.prompt_cache_miss_tokens);
    const inputTotalTokens = cacheMissTokens !== undefined
      ? cacheReadTokens + cacheMissTokens
      : numberOf(u.prompt_tokens) ?? numberOf(u.input_tokens) ?? cacheReadTokens;
    const outputTokens = numberOf(u.completion_tokens) ?? numberOf(u.output_tokens) ?? 0;
    return finish({ inputTotalTokens, outputTokens, cacheReadTokens, cacheMissTokens, inputSemantics: "total_input", normalizationStrategy: "provider_deepseek" }, "provider_raw_usage");
  }

  if (providerKey.includes("anthropic") || "cache_read_input_tokens" in u || "cache_creation_input_tokens" in u) {
    const normalInputTokens = numberOf(u.input_tokens) ?? 0;
    const cacheReadTokens = numberOf(u.cache_read_input_tokens) ?? 0;
    const cacheWriteTokens = numberOf(u.cache_creation_input_tokens) ?? 0;
    const outputTokens = numberOf(u.output_tokens) ?? 0;
    return finish({ inputTotalTokens: normalInputTokens + cacheReadTokens + cacheWriteTokens, outputTokens, cacheReadTokens, cacheWriteTokens, inputSemantics: "non_cached_input", normalizationStrategy: "provider_anthropic" }, "provider_raw_usage");
  }

  if (providerKey.includes("bedrock") || "inputTokens" in u || "cacheReadInputTokens" in u || "CacheReadInputTokens" in u) {
    const normalInputTokens = numberOf(u.inputTokens) ?? 0;
    const cacheReadTokens = numberOf(u.cacheReadInputTokens) ?? numberOf(u.CacheReadInputTokens) ?? 0;
    const cacheWriteTokens = numberOf(u.cacheWriteInputTokens) ?? numberOf(u.CacheWriteInputTokens) ?? 0;
    const outputTokens = numberOf(u.outputTokens) ?? 0;
    return finish({ inputTotalTokens: normalInputTokens + cacheReadTokens + cacheWriteTokens, outputTokens, cacheReadTokens, cacheWriteTokens, inputSemantics: "non_cached_input", normalizationStrategy: "provider_bedrock" }, "provider_raw_usage");
  }

  if (providerKey.includes("gemini") || providerKey.includes("vertex") || "prompt_token_count" in u || "promptTokenCount" in u || "cachedContentTokenCount" in u || "cached_content_token_count" in u) {
    const inputTotalTokens = numberOf(u.prompt_token_count) ?? numberOf(u.promptTokenCount) ?? 0;
    const outputTokens = numberOf(u.candidates_token_count) ?? numberOf(u.candidatesTokenCount) ?? 0;
    const cacheReadTokens = numberOf(u.cached_content_token_count) ?? numberOf(u.cachedContentTokenCount) ?? 0;
    return finish({ inputTotalTokens, outputTokens, cacheReadTokens, inputSemantics: "total_input", normalizationStrategy: "provider_gemini" }, "provider_raw_usage");
  }

  const inputTotalTokens = numberOf(u.prompt_tokens) ?? numberOf(u.input_tokens) ?? 0;
  const outputTokens = numberOf(u.completion_tokens) ?? numberOf(u.output_tokens) ?? 0;
  const cacheReadTokens = numberOf(u.prompt_tokens_details?.cached_tokens) ?? numberOf(u.input_tokens_details?.cached_tokens) ?? numberOf(u.cached_tokens) ?? 0;
  const cacheWriteTokens = numberOf(u.cache_write_tokens);
  return finish({ inputTotalTokens, outputTokens, cacheReadTokens, cacheWriteTokens, inputSemantics: "total_input", normalizationStrategy: "provider_openai_compatible" }, "provider_raw_usage");
}
