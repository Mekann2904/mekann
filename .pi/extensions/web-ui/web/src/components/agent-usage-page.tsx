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
import { useState, useEffect, useCallback } from "preact/hooks";
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import {
  Activity,
  Loader2,
  RefreshCw,
  AlertCircle,
  Filter,
  TrendingUp,
  BarChart3,
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
 * @summary Color palette for charts
 */
const CHART_COLORS = {
  calls: "hsl(var(--chart-1))",
  errors: "hsl(var(--chart-2))",
  context: "hsl(var(--chart-3))",
};

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

  const totals = data?.data?.totals;

  return (
    <div class="flex h-full flex-col gap-4 p-4 overflow-auto">
      {/* Header */}
      <div class="flex gap-2 shrink-0 items-center justify-between">
        <div>
          <h1 class="text-xl font-bold">Agent Usage</h1>
          <p class="text-sm text-muted-foreground">
            {formatNumber(totals?.toolCalls)} tool calls, {formatNumber(totals?.agentRuns)} agent runs
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchData}
          disabled={loading}
        >
          <RefreshCw class={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      {/* Stats Cards */}
      <div class="grid grid-cols-4 gap-2 shrink-0">
        <Card>
          <CardContent class="py-3 text-center">
            <div class="text-lg font-bold">{formatNumber(totals?.toolCalls)}</div>
            <div class="text-xs text-muted-foreground">Tool Calls</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="py-3 text-center">
            <div class="text-lg font-bold text-destructive">{formatNumber(totals?.toolErrors)}</div>
            <div class="text-xs text-muted-foreground">Tool Errors</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="py-3 text-center">
            <div class="text-lg font-bold">{formatNumber(totals?.agentRuns)}</div>
            <div class="text-xs text-muted-foreground">Agent Runs</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="py-3 text-center">
            <div class="text-lg font-bold">
              {totals?.contextSamples && totals.contextSamples > 0
                ? formatPercent(totals.contextRatioSum / totals.contextSamples)
                : "-"}
            </div>
            <div class="text-xs text-muted-foreground">Avg Context</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div class="flex gap-2 shrink-0 flex-wrap items-center">
        <Filter class="h-4 w-4 text-muted-foreground" />
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
        <Card class="border-destructive shrink-0">
          <CardContent class="py-3 flex items-center gap-2 text-destructive">
            <AlertCircle class="h-4 w-4" />
            <span class="text-sm">Failed to load data: {error}</span>
            <Button variant="outline" size="sm" onClick={fetchData} class="ml-auto">
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      {loading && !data ? (
        <Card>
          <CardContent class="py-8 flex items-center justify-center">
            <div class="flex flex-col items-center gap-2">
              <Loader2 class="h-6 w-6 animate-spin text-primary" />
              <p class="text-sm text-muted-foreground">Loading usage data...</p>
            </div>
          </CardContent>
        </Card>
      ) : chartData.length === 0 ? (
        <Card>
          <CardContent class="py-8 flex items-center justify-center">
            <p class="text-sm text-muted-foreground">No usage data available</p>
          </CardContent>
        </Card>
      ) : (
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
                      formatter={(value: number | undefined, name: string) => [
                        value?.toLocaleString() ?? "0",
                        name,
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
    </div>
  );
}
