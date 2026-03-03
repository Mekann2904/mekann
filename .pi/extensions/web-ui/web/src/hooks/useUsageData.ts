/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/hooks/useUsageData.ts
 * @role Agent usage data management hook
 * @why Extract data fetching from agent-usage-page.tsx (915 lines) to reduce complexity
 * @related agent-usage-page.tsx, UsageAreaChart.tsx
 * @public_api useUsageData, UsageDataState
 * @invariants Data is fetched once on mount
 * @side_effects Fetches from /api/agent-usage
 * @failure_modes API unavailable, network error
 *
 * @abdd.explain
 * @overview Agent usage data management hook
 * @what_it_does Fetches usage stats, provides aggregated data for charts
 * @why_it_exists Reduces agent-usage-page.tsx complexity by extracting data logic
 * @scope(in) None
 * @scope(out) Usage data, loading/error state, refresh function
 */

import { useState, useCallback, useEffect, useMemo } from "preact/hooks";

export interface FeatureMetrics {
  extension: string;
  featureType: "tool" | "agent_run";
  featureName: string;
  calls: number;
  errors: number;
  contextSamples: number;
  contextRatioSum: number;
  contextTokenSamples: number;
  contextTokenSum: number;
  lastUsedAt?: string;
  lastErrorAt?: string;
  lastErrorMessage?: string;
}

export interface UsageEventRecord {
  id: string;
  timestamp: string;
  extension: string;
  featureType: "tool" | "agent_run";
  featureName: string;
  status: "ok" | "error";
  durationMs?: number;
  toolCallId?: string;
  inputPreview?: string;
  contextRatio?: number;
  contextTokens?: number;
  contextWindow?: number;
  error?: string;
}

export interface AgentUsageResponse {
  success: boolean;
  data: {
    version: number;
    createdAt: string;
    updatedAt: string;
    totals: {
      toolCalls: number;
      toolErrors: number;
      agentRuns: number;
      agentRunErrors: number;
      contextSamples: number;
      contextRatioSum: number;
      contextTokenSamples: number;
      contextTokenSum: number;
    };
    features: Record<string, FeatureMetrics>;
    events: UsageEventRecord[];
  };
}

export interface ChartDataPoint {
  time: string;
  timestamp: number;
  calls: number;
  errors: number;
  contextRatio: number;
  cumulativeCalls: number;
  cumulativeErrors: number;
}

export interface ExtensionStats {
  extension: string;
  calls: number;
  errors: number;
  features: number;
}

export interface UseUsageDataReturn {
  data: AgentUsageResponse | null;
  loading: boolean;
  error: string | null;
  extensions: string[];
  extensionStats: ExtensionStats[];
  refresh: () => Promise<void>;
  getFilteredEvents: (extensionFilter: string) => UsageEventRecord[];
  getChartData: (events: UsageEventRecord[], bucketMinutes: number) => ChartDataPoint[];
  getComparisonData: (
    bucketMinutes: number,
    metric: "calls" | "errors"
  ) => { data: Array<Record<string, string | number>>; extensions: string[] };
}

/**
 * @summary Bucket events into time intervals and compute cumulative values
 */
function aggregateEventsForChart(
  events: UsageEventRecord[],
  bucketMinutes: number = 60
): ChartDataPoint[] {
  if (events.length === 0) return [];

  const bucketMs = bucketMinutes * 60 * 1000;
  const buckets = new Map<number, { calls: number; errors: number; contextRatioSum: number; contextCount: number }>();

  // Sort events by timestamp
  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Aggregate into buckets
  for (const event of sortedEvents) {
    const timestamp = new Date(event.timestamp).getTime();
    if (isNaN(timestamp)) continue;

    const bucket = Math.floor(timestamp / bucketMs) * bucketMs;
    const existing = buckets.get(bucket) || { calls: 0, errors: 0, contextRatioSum: 0, contextCount: 0 };

    existing.calls += 1;
    if (event.status === "error") {
      existing.errors += 1;
    }
    if (typeof event.contextRatio === "number" && !isNaN(event.contextRatio)) {
      existing.contextRatioSum += event.contextRatio;
      existing.contextCount += 1;
    }

    buckets.set(bucket, existing);
  }

  // Convert to array and compute cumulative values
  const sortedBuckets = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);
  let cumulativeCalls = 0;
  let cumulativeErrors = 0;

  return sortedBuckets.map(([bucket, data]) => {
    cumulativeCalls += data.calls;
    cumulativeErrors += data.errors;
    const avgContextRatio = data.contextCount > 0 ? data.contextRatioSum / data.contextCount : 0;

    return {
      time: new Date(bucket).toLocaleTimeString("ja-JP", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      timestamp: bucket,
      calls: data.calls,
      errors: data.errors,
      contextRatio: avgContextRatio * 100, // Convert to percentage
      cumulativeCalls,
      cumulativeErrors,
    };
  });
}

/**
 * @summary Aggregate features by extension
 */
function aggregateByExtension(
  features: Record<string, FeatureMetrics>
): ExtensionStats[] {
  const map = new Map<string, ExtensionStats>();

  for (const feature of Object.values(features)) {
    const existing = map.get(feature.extension) || {
      extension: feature.extension,
      calls: 0,
      errors: 0,
      features: 0,
    };

    existing.calls += feature.calls;
    existing.errors += feature.errors;
    existing.features += 1;

    map.set(feature.extension, existing);
  }

  return Array.from(map.values()).sort((a, b) => b.calls - a.calls);
}

/**
 * @summary Aggregate events for extension comparison chart
 */
function aggregateForComparison(
  events: UsageEventRecord[],
  bucketMinutes: number = 60,
  metric: "calls" | "errors" = "calls"
): { data: Array<Record<string, string | number>>; extensions: string[] } {
  if (events.length === 0) return { data: [], extensions: [] };

  const bucketMs = bucketMinutes * 60 * 1000;
  const extensions = [...new Set(events.map((e) => e.extension))].sort();

  // Initialize buckets with all extensions
  const buckets = new Map<number, Record<string, number>>();

  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  for (const event of sortedEvents) {
    const timestamp = new Date(event.timestamp).getTime();
    if (isNaN(timestamp)) continue;

    const bucket = Math.floor(timestamp / bucketMs) * bucketMs;
    const existing = buckets.get(bucket) || Object.fromEntries(extensions.map((e) => [e, 0]));

    if (metric === "calls") {
      existing[event.extension] = (existing[event.extension] || 0) + 1;
    } else if (metric === "errors" && event.status === "error") {
      existing[event.extension] = (existing[event.extension] || 0) + 1;
    }

    buckets.set(bucket, existing);
  }

  // Convert to array
  const sortedBuckets = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);

  const data = sortedBuckets.map(([bucket, extData]) => ({
    time: new Date(bucket).toLocaleTimeString("ja-JP", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    timestamp: bucket,
    ...extData,
  }));

  return { data, extensions };
}

export function useUsageData(): UseUsageDataReturn {
  const [data, setData] = useState<AgentUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/v2/agent-usage");
      if (res.ok) {
        const json: AgentUsageResponse = await res.json();
        setData(json);
      } else {
        setError(`Server error: ${res.status} ${res.statusText}`);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Network error";
      setError(message);
      console.error("Failed to fetch agent usage:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Get unique extensions
  const extensions = useMemo(() => {
    return data?.data?.features
      ? [...new Set(Object.values(data.data.features).map((f) => f.extension))]
      : [];
  }, [data?.data?.features]);

  // Extension aggregation
  const extensionStats = useMemo(() => {
    return data?.data?.features
      ? aggregateByExtension(data.data.features)
      : [];
  }, [data?.data?.features]);

  const getFilteredEvents = useCallback((extensionFilter: string): UsageEventRecord[] => {
    if (extensionFilter === "all") {
      return data?.data?.events || [];
    }
    return (data?.data?.events || []).filter((e) => e.extension === extensionFilter);
  }, [data?.data?.events]);

  const getChartData = useCallback((events: UsageEventRecord[], bucketMinutes: number): ChartDataPoint[] => {
    return aggregateEventsForChart(events, bucketMinutes);
  }, []);

  const getComparisonData = useCallback((
    bucketMinutes: number,
    metric: "calls" | "errors"
  ): { data: Array<Record<string, string | number>>; extensions: string[] } => {
    if (!data?.data?.events) return { data: [], extensions: [] };
    return aggregateForComparison(data.data.events, bucketMinutes, metric);
  }, [data?.data?.events]);

  return {
    data,
    loading,
    error,
    extensions,
    extensionStats,
    refresh,
    getFilteredEvents,
    getChartData,
    getComparisonData,
  };
}
