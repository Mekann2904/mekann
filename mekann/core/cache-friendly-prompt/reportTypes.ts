import type { CacheFriendlyRequestLog } from "../prompt-core/index.js";
import type { ActualUsageLog } from "./actualUsage.js";

export type ParsedLog = CacheFriendlyRequestLog & { line: number };
export type ParsedActualUsageLog = ActualUsageLog & { line: number };

export type ProviderSummary = {
  requests: number;
  uniqueReuseKeys: number;
  uniqueStablePrefixHashes: number;
  latestReuseKey: string;
  latestStablePrefixHash: string;
  latestStablePrefixChars: number;
  latestProviderPrefixChars: number;
  latestTotalPromptChars: number;
};

export type ActualProviderSummary = {
  requests: number;
  inputTotalTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheMissTokens: number;
  averageTokenHitRate: number | null;
  weightedTokenHitRate: number | null;
  averageCacheableReadRate: number | null;
  weightedCacheableReadRate: number | null;
};

export type PercentileSummary = { p50: number | null; p90: number | null; p99: number | null };

export type CacheFriendlySummary = {
  generatedAt: string;
  totalRequests: number;
  latest?: {
    timestamp: string;
    provider?: string;
    model?: string;
    stablePrefixHash: string;
    stablePrefixChars: number;
    totalPromptChars: number;
  };
  recentSameReuseKeyStreak: number;
  adjacentPrefixReuseRate: number | null;
  windowPrefixReuseRate: number | null;
  uniqueScopedReuseKeyRatio: number | null;
  /** @deprecated Use uniqueScopedReuseKeyRatio. */
  uniqueReuseKeyRatio: number | null;
  recentSameHashStreak: number;
  baseSystemHashChanges: number;
  stablePrefixHashChanges: number;
  featureCacheablePrefixHashChanges: number;
  providerPrefixHashChanges: number;
  toolSetHashChanges: number;
  toolOrderHashChanges: number;
  providerModelSwitches: number;
  providerSwitches: number;
  modelSwitchesWithinProvider: number;
  dynamicTruncationCount: number;
  dynamicTruncationOriginalChars: number;
  dynamicTruncationRenderedChars: number;
  dynamicTruncationOmittedChars: number;
  warningCount: number;
  providers: Record<string, ProviderSummary>;
  actualRequestCount: number;
  actualTokenHitRateAvg: number | null;
  actualTokenHitRateWeighted: number | null;
  actualCacheableReadRateAvg: number | null;
  actualCacheableReadRateWeighted: number | null;
  actualCacheReadTokens: number;
  actualTokenHitRatePercentiles: PercentileSummary;
  actualMatchedRequestCount: number;
  actualMatchedTokenHitRateWeighted: number | null;
  actualMatchedTokenHitRatePercentiles: PercentileSummary;
  actualColdRequestCount: number;
  actualColdTokenHitRateWeighted: number | null;
  actualWarmRequestCount: number;
  actualWarmTokenHitRateWeighted: number | null;
  actualByWarmState: Record<string, ActualProviderSummary>;
  actualCacheWriteTokens: number;
  actualCacheMissTokens: number;
  actualInputTotalTokens: number;
  actualByProvider: Record<string, ActualProviderSummary>;
  actualByProviderModel: Record<string, ActualProviderSummary>;
  actualByRequestRole: Record<string, ActualProviderSummary>;
  actualByProviderPrefixHash: Record<string, ActualProviderSummary>;
  actualByToolSetHash: Record<string, ActualProviderSummary>;
  actualByToolOrderHash: Record<string, ActualProviderSummary>;
  actualByBaseSystemHash: Record<string, ActualProviderSummary>;
};

