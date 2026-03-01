/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/components/agent-usage-page.tsx
 * @role Agent usage statistics page with cumulative area charts
 * @why Visualize agent tool usage, errors, and context occupancy over time
 * @related app.tsx, server.ts
 * @public_api AgentUsagePage
 * @invariants Data is fetched from /api/agent-usage endpoint
 * @side_effects Fetches data from API, renders charts
 * @failure_modes API unavailable, network error
 *
 * @abdd.explain
 * @overview Page showing cumulative agent usage statistics with area charts
 * @what_it_does Fetches usage stats from API, displays cumulative charts for tool calls, errors, and context usage
 * @why_it_exists Allows users to monitor agent activity patterns and identify usage trends
 * @scope(in) API data, user interactions (filtering)
 * @scope(out) Rendered usage charts, filterable statistics
 */

import { h } from "preact";
import { useState, useEffect, useCallback, useMemo } from "preact/hooks";
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import {
  RefreshCw,
  Filter,
  TrendingUp,
  BarChart3,
  GitCompare,
  PieChart,
  Activity,
} from "lucide-preact";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { cn } from "@/lib/utils";
import {
  PageLayout,
  PageHeader,
  StatsGrid,
  SimpleStatsCard,
  LoadingState,
  ErrorBanner,
  EmptyState,
  ChartEmptyState,
  CHART_TOOLTIP_STYLE,
  formatChartNumber,
  TYPOGRAPHY,
  CARD_STYLES,
  FORM_STYLES,
  PATTERNS,
  SPACING,
} from "./layout";

/**
 * @summary Feature metrics from agent-usage-stats.json
 */
interface FeatureMetrics {
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

/**
 * @summary Usage event record
 */
interface UsageEventRecord {
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

/**
 * @summary API response structure
 */
interface AgentUsageResponse {
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

/**
 * @summary Chart data point for cumulative display
 */
interface ChartDataPoint {
  time: string;
  timestamp: number;
  calls: number;
  errors: number;
  contextRatio: number;
  cumulativeCalls: number;
  cumulativeErrors: number;
}

/**
 * @summary Chart data point for extension comparison
 */
interface ComparisonDataPoint {
  time: string;
  timestamp: number;
  [key: string]: string | number;
}

/**
 * @summary Color palette for charts
 */
const CHART_COLORS = {
  calls: "hsl(var(--chart-1))",
  errors: "hsl(var(--chart-2))",
  context: "hsl(var(--chart-3))",
};

/**
 * @summary Color hues for extension comparison
 */
const EXTENSION_HUES = [210, 142, 38, 280, 340, 180, 30, 260, 120, 0, 190, 50];

/**
 * @summary Get color for extension by index
 */
function getExtensionColor(index: number): string {
  const hue = EXTENSION_HUES[index % EXTENSION_HUES.length];
  return `hsl(${hue}, 70%, 55%)`;
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
): Array<{ extension: string; calls: number; errors: number; features: number }> {
  const map = new Map<string, { extension: string; calls: number; errors: number; features: number }>();

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
): { data: ComparisonDataPoint[]; extensions: string[] } {
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

/**
 * @summary Format number with locale
 */
function formatNumber(value: number | undefined): string {
  if (value === undefined || isNaN(value)) return "-";
  return value.toLocaleString();
}

/**
 * @summary Format percentage
 */
function formatPercent(value: number | undefined): string {
  if (value === undefined || isNaN(value)) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

export function AgentUsagePage() {
  const [data, setData] = useState<AgentUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [extensionFilter, setExtensionFilter] = useState<string>("all");
  const [chartType, setChartType] = useState<"cumulative" | "rate">("cumulative");
  const [bucketSize, setBucketSize] = useState<60 | 30 | 10>(60);
  const [viewMode, setViewMode] = useState<"single" | "comparison">("single");
  const [comparisonMetric, setComparisonMetric] = useState<"calls" | "errors">("calls");

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/agent-usage");
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
    fetchData();
  }, [fetchData]);

  // Get unique extensions
  const extensions = data?.data?.features
    ? [...new Set(Object.values(data.data.features).map((f) => f.extension))]
    : [];

  // Filter events by extension
  const filteredEvents =
    extensionFilter === "all"
      ? data?.data?.events || []
      : (data?.data?.events || []).filter((e) => e.extension === extensionFilter);

  // Aggregate chart data
  const chartData = aggregateEventsForChart(filteredEvents, bucketSize);

  // Extension aggregation
  const extensionStats = data?.data?.features
    ? aggregateByExtension(data.data.features)
    : [];

  // Comparison data (all extensions)
  const comparisonData = useMemo(() => {
    if (!data?.data?.events) return { data: [], extensions: [] };
    return aggregateForComparison(data.data.events, bucketSize, comparisonMetric);
  }, [data?.data?.events, bucketSize, comparisonMetric]);

  const totals = data?.data?.totals;

  // ヘッダー説明文
  const headerDescription = totals
    ? `${formatChartNumber(totals.toolCalls)} tool calls, ${formatChartNumber(totals.agentRuns)} agent runs`
    : "Loading...";

  return (
    <PageLayout variant="default">
      {/* Header */}
      <PageHeader
        title="Agent Usage"
        description={headerDescription}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
          >
            <RefreshCw class={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        }
      />

      {/* Stats Cards */}
      <StatsGrid cols={4}>
        <SimpleStatsCard
          value={formatChartNumber(totals?.toolCalls)}
          label="Tool Calls"
        />
        <SimpleStatsCard
          value={formatChartNumber(totals?.toolErrors)}
          label="Tool Errors"
          valueClassName="text-destructive"
        />
        <SimpleStatsCard
          value={formatChartNumber(totals?.agentRuns)}
          label="Agent Runs"
        />
        <SimpleStatsCard
          value={
            totals?.contextSamples && totals.contextSamples > 0
              ? `${((totals.contextRatioSum / totals.contextSamples) * 100).toFixed(1)}%`
              : "-"
          }
          label="Avg Context"
        />
      </StatsGrid>

      {/* Filters */}
      <div class="flex gap-2 shrink-0 flex-wrap items-center">
        <Filter class="h-4 w-4 text-muted-foreground" />
        {/* View Mode Toggle */}
        <div class="flex border rounded overflow-hidden">
          <button
            class={cn(
              "text-xs px-3 py-1 transition-colors",
              viewMode === "single" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
            )}
            onClick={() => setViewMode("single")}
          >
            Single
          </button>
          <button
            class={cn(
              "text-xs px-3 py-1 transition-colors",
              viewMode === "comparison" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
            )}
            onClick={() => setViewMode("comparison")}
          >
            <GitCompare class="h-3 w-3 inline mr-1" />
            Compare
          </button>
        </div>
        {viewMode === "single" && (
          <>
            <select
              class="text-xs border rounded px-2 py-1 bg-background"
              value={extensionFilter}
              onChange={(e) => setExtensionFilter((e.target as HTMLSelectElement).value)}
            >
              <option value="all">All Extensions</option>
              {extensions.map((ext) => (
                <option key={ext} value={ext}>
                  {ext}
                </option>
              ))}
            </select>
            <select
              class="text-xs border rounded px-2 py-1 bg-background"
              value={chartType}
              onChange={(e) => setChartType((e.target as HTMLSelectElement).value as "cumulative" | "rate")}
            >
              <option value="cumulative">Cumulative</option>
              <option value="rate">Rate</option>
            </select>
          </>
        )}
        {viewMode === "comparison" && (
          <select
            class="text-xs border rounded px-2 py-1 bg-background"
            value={comparisonMetric}
            onChange={(e) => setComparisonMetric((e.target as HTMLSelectElement).value as "calls" | "errors")}
          >
            <option value="calls">Calls</option>
            <option value="errors">Errors</option>
          </select>
        )}
        <select
          class="text-xs border rounded px-2 py-1 bg-background"
          value={bucketSize}
          onChange={(e) => setBucketSize(Number((e.target as HTMLSelectElement).value) as 60 | 30 | 10)}
        >
          <option value="60">1 Hour Buckets</option>
          <option value="30">30 Min Buckets</option>
          <option value="10">10 Min Buckets</option>
        </select>
      </div>

      {/* Error display */}
      {error && (
        <ErrorBanner
          message={`Failed to load data: ${error}`}
          onRetry={fetchData}
          onDismiss={() => setError(null)}
        />
      )}

      {/* Charts */}
      {loading && !data ? (
        <LoadingState message="Loading usage data..." />
      ) : viewMode === "comparison" ? (
        /* Comparison Mode */
        <div class="space-y-4">
          {/* Extension Comparison Chart */}
          <Card>
            <CardHeader class="pb-2">
              <div class="flex items-center gap-2">
                <GitCompare class="h-4 w-4" />
                <CardTitle class="text-sm">Extension Comparison</CardTitle>
              </div>
              <CardDescription>
                {comparisonMetric === "calls" ? "Tool calls by extension" : "Errors by extension"} over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div class="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                  <AreaChart data={comparisonData.data} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" class="stroke-border" />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 9 }}
                      class="text-muted-foreground"
                      interval="preserveStartEnd"
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis
                      tick={{ fontSize: 9 }}
                      class="text-muted-foreground"
                      tickFormatter={(value: number) => value.toLocaleString()}
                      allowDecimals={false}
                      width={50}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "6px",
                        fontSize: "11px",
                      }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                      formatter={(value: number | undefined, name: string | undefined) => [
                        value?.toLocaleString() ?? "0",
                        name ?? "",
                      ]}
                    />
                    <Legend />
                    {comparisonData.extensions.map((ext, idx) => (
                      <Area
                        key={ext}
                        type="monotone"
                        dataKey={ext}
                        name={ext}
                        stroke={getExtensionColor(idx)}
                        fill={getExtensionColor(idx)}
                        fillOpacity={0.3}
                        stackId="1"
                        isAnimationActive
                        animationDuration={300}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Extension Distribution Bar Chart */}
          <Card>
            <CardHeader class="pb-2">
              <div class="flex items-center gap-2">
                <PieChart class="h-4 w-4" />
                <CardTitle class="text-sm">Distribution by Extension</CardTitle>
              </div>
              <CardDescription>
                Total {comparisonMetric === "calls" ? "calls" : "errors"} per extension
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div class="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                  <BarChart
                    data={extensionStats.slice(0, 10)}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 80, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" class="stroke-border" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 9 }}
                      class="text-muted-foreground"
                      tickFormatter={(value: number) => value.toLocaleString()}
                      width={50}
                    />
                    <YAxis
                      type="category"
                      dataKey="extension"
                      tick={{ fontSize: 9 }}
                      class="text-muted-foreground"
                      width={70}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "6px",
                        fontSize: "11px",
                      }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                      formatter={(value: number | undefined) => [
                        value?.toLocaleString() ?? "0",
                        comparisonMetric === "calls" ? "Calls" : "Errors",
                      ]}
                    />
                    <Bar
                      dataKey={comparisonMetric === "calls" ? "calls" : "errors"}
                      fill={comparisonMetric === "calls" ? CHART_COLORS.calls : CHART_COLORS.errors}
                      fillOpacity={0.8}
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Comparison Table */}
          <Card>
            <CardHeader class="pb-2">
              <div class="flex items-center gap-2">
                <BarChart3 class="h-4 w-4" />
                <CardTitle class="text-sm">Extension Comparison Table</CardTitle>
              </div>
              <CardDescription>Side-by-side comparison of all extensions</CardDescription>
            </CardHeader>
            <CardContent>
              <div class="overflow-x-auto">
                <table class="w-full text-xs">
                  <thead>
                    <tr class="border-b">
                      <th class="text-left py-2 px-2 font-medium">#</th>
                      <th class="text-left py-2 px-2 font-medium">Extension</th>
                      <th class="text-right py-2 px-2 font-medium">Calls</th>
                      <th class="text-right py-2 px-2 font-medium">Errors</th>
                      <th class="text-right py-2 px-2 font-medium">Error %</th>
                      <th class="text-right py-2 px-2 font-medium">Share %</th>
                      <th class="text-right py-2 px-2 font-medium">Features</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extensionStats.map((row, idx) => {
                      const errorRate = row.calls > 0 ? (row.errors / row.calls) * 100 : 0;
                      const totalCalls = extensionStats.reduce((sum, r) => sum + r.calls, 0);
                      const share = totalCalls > 0 ? (row.calls / totalCalls) * 100 : 0;
                      return (
                        <tr key={row.extension} class="border-b hover:bg-muted/50">
                          <td class="py-2 px-2 text-muted-foreground">{idx + 1}</td>
                          <td class="py-2 px-2">
                            <div class="flex items-center gap-2">
                              <div
                                class="w-3 h-3 rounded"
                                style={{ backgroundColor: getExtensionColor(idx) }}
                              />
                              <span class="font-mono">{row.extension}</span>
                            </div>
                          </td>
                          <td class="text-right py-2 px-2">{formatNumber(row.calls)}</td>
                          <td class="text-right py-2 px-2 text-destructive">{formatNumber(row.errors)}</td>
                          <td class="text-right py-2 px-2">
                            <span
                              class={cn(
                                errorRate > 10 && "text-destructive",
                                errorRate > 5 && errorRate <= 10 && "text-yellow-500"
                              )}
                            >
                              {errorRate.toFixed(1)}%
                            </span>
                          </td>
                          <td class="text-right py-2 px-2">{share.toFixed(1)}%</td>
                          <td class="text-right py-2 px-2">{row.features}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : chartData.length === 0 ? (
        <Card>
          <CardContent class="py-8 flex items-center justify-center">
            <p class="text-sm text-muted-foreground">No usage data available</p>
          </CardContent>
        </Card>
      ) : (
        /* Single Mode */
        <div class="space-y-4">
          {/* Cumulative Area Chart */}
          <Card>
            <CardHeader class="pb-2">
              <div class="flex items-center gap-2">
                <TrendingUp class="h-4 w-4" />
                <CardTitle class="text-sm">
                  {chartType === "cumulative" ? "Cumulative Usage" : "Usage Rate"}
                </CardTitle>
              </div>
              <CardDescription>
                {chartType === "cumulative"
                  ? "Total tool calls and errors over time"
                  : "Tool calls and errors per time bucket"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div class="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                  <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" class="stroke-border" />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 9 }}
                      class="text-muted-foreground"
                      interval="preserveStartEnd"
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis
                      tick={{ fontSize: 9 }}
                      class="text-muted-foreground"
                      tickFormatter={(value: number) => value.toLocaleString()}
                      allowDecimals={false}
                      width={50}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "6px",
                        fontSize: "11px",
                      }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                      formatter={(value: number | undefined, name: string | undefined) => [
                        value?.toLocaleString() ?? "0",
                        name ?? "",
                      ]}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey={chartType === "cumulative" ? "cumulativeCalls" : "calls"}
                      name="Calls"
                      stroke={CHART_COLORS.calls}
                      fill={CHART_COLORS.calls}
                      fillOpacity={0.3}
                      isAnimationActive
                      animationDuration={300}
                    />
                    <Area
                      type="monotone"
                      dataKey={chartType === "cumulative" ? "cumulativeErrors" : "errors"}
                      name="Errors"
                      stroke={CHART_COLORS.errors}
                      fill={CHART_COLORS.errors}
                      fillOpacity={0.3}
                      isAnimationActive
                      animationDuration={300}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Context Usage Chart */}
          <Card>
            <CardHeader class="pb-2">
              <div class="flex items-center gap-2">
                <Activity class="h-4 w-4" />
                <CardTitle class="text-sm">Context Usage</CardTitle>
              </div>
              <CardDescription>Average context window occupancy over time (%)</CardDescription>
            </CardHeader>
            <CardContent>
              <div class="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                  <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" class="stroke-border" />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 9 }}
                      class="text-muted-foreground"
                      interval="preserveStartEnd"
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis
                      tick={{ fontSize: 9 }}
                      class="text-muted-foreground"
                      domain={[0, 100]}
                      tickFormatter={(value: number) => `${value}%`}
                      width={45}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "6px",
                        fontSize: "11px",
                      }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                      formatter={(value: number | undefined) => [
                        value !== undefined ? `${value.toFixed(1)}%` : "-",
                        "Context",
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="contextRatio"
                      name="Context %"
                      stroke={CHART_COLORS.context}
                      fill={CHART_COLORS.context}
                      fillOpacity={0.3}
                      isAnimationActive
                      animationDuration={300}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Extension Statistics Table */}
          <Card>
            <CardHeader class="pb-2">
              <div class="flex items-center gap-2">
                <BarChart3 class="h-4 w-4" />
                <CardTitle class="text-sm">By Extension</CardTitle>
              </div>
              <CardDescription>Usage breakdown by extension</CardDescription>
            </CardHeader>
            <CardContent>
              <div class="overflow-x-auto">
                <table class="w-full text-xs">
                  <thead>
                    <tr class="border-b">
                      <th class="text-left py-2 px-2 font-medium">Extension</th>
                      <th class="text-right py-2 px-2 font-medium">Calls</th>
                      <th class="text-right py-2 px-2 font-medium">Errors</th>
                      <th class="text-right py-2 px-2 font-medium">Error Rate</th>
                      <th class="text-right py-2 px-2 font-medium">Features</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extensionStats.slice(0, 20).map((row) => {
                      const errorRate = row.calls > 0 ? (row.errors / row.calls) * 100 : 0;
                      return (
                        <tr
                          key={row.extension}
                          class="border-b hover:bg-muted/50 cursor-pointer"
                          onClick={() => setExtensionFilter(row.extension)}
                        >
                          <td class="py-2 px-2 font-mono">{row.extension}</td>
                          <td class="text-right py-2 px-2">{formatNumber(row.calls)}</td>
                          <td class="text-right py-2 px-2 text-destructive">{formatNumber(row.errors)}</td>
                          <td class="text-right py-2 px-2">
                            <span
                              class={cn(
                                errorRate > 10 && "text-destructive",
                                errorRate > 5 && errorRate <= 10 && "text-yellow-500"
                              )}
                            >
                              {errorRate.toFixed(1)}%
                            </span>
                          </td>
                          <td class="text-right py-2 px-2">{row.features}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </PageLayout>
  );
}
