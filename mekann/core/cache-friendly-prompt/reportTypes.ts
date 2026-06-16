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

/** One row in the warning code distribution (code + severity + occurrence count). */
export type WarningBreakdownEntry = { code: string; severity: string; count: number };

/** Warning counts split by origin: base system prompt vs cacheable fragments vs other. */
export type WarningCategoryBreakdown = { baseSystem: number; fragment: number; other: number; total: number };

/** Metrics computed over the most recent N requests, kept separate from all-time totals. */
export type RecentWindowSummary = {
  /** Configured request-count cap that defines the recent window. */
  windowCapacity: number;
  /** Proxy request rows that fell inside the recent window. */
  windowRequestCount: number;
  /** Oldest timestamp inside the recent window (null when empty). */
  windowStartTimestamp: string | null;
  /** Newest timestamp inside the recent window (null when empty). */
  windowEndTimestamp: string | null;
  /** Total warnings emitted by proxy rows in the recent window. */
  warningCount: number;
  /** Distinct scoped reuse keys (`provider/model/reuse key`) in the recent window. */
  uniqueScopedReuseKeys: number;
  /** Adjacent prefix reuse rate (prefix continuity proxy) over the recent window. */
  adjacentPrefixReuseRate: number | null;
  /** Actual-usage rows that fell inside the recent actual window (independent cap). */
  actualRequestCount: number;
  /** Weighted tokenHitRate over the recent actual-usage window. */
  actualTokenHitRateWeighted: number | null;
};

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
  /** Distinct `provider/model/reuse key` prefixes seen over all time (cacheable-prefix churn). */
  uniqueScopedReuseKeyCount: number;
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
  /** Rows whose dynamic tail was truncated at snapshot/injection time (DYNAMIC_TAIL_MAX_CHARS). */
  dynamicTailTruncationCount: number;
  /** Rows whose dynamic fragments were trimmed at render time (DYNAMIC_FRAGMENT_BUDGET_CHARS). */
  dynamicFragmentTruncationCount: number;
  dynamicTruncationOriginalChars: number;
  dynamicTruncationRenderedChars: number;
  dynamicTruncationOmittedChars: number;
  warningCount: number;
  /** Warning distribution by code/severity over the recent window and all-time. */
  warningBreakdownRecent: WarningBreakdownEntry[];
  warningBreakdownAll: WarningBreakdownEntry[];
  /** Warning origin split (base system vs fragment vs other) over recent and all-time. */
  warningCategoriesRecent: WarningCategoryBreakdown;
  warningCategoriesAll: WarningCategoryBreakdown;
  /** Most-recent-N window metrics, kept separate from all-time totals. */
  recentWindow: RecentWindowSummary;
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

