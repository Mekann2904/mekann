/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/components/context-usage-page.tsx
 * @role Context usage tracking page with interactive bar chart
 * @why Visualize token usage history for monitoring and analysis
 * @related app.tsx, ui/chart.tsx
 * @public_api ContextUsagePage
 * @invariants Data is fetched from API on mount
 * @side_effects Fetches data from /api/context-history
 * @failure_modes API unavailable, network error
 *
 * @abdd.explain
 * @overview Interactive bar chart showing context usage over time
 * @what_it_does Fetches context history from API and displays it in a toggleable bar chart
 * @why_it_exists Allows users to monitor token usage patterns and identify trends
 * @scope(in) API data, user interactions
 * @scope(out) Rendered chart, statistics
 */

import { h, FunctionalComponent } from "preact";
import { useState, useEffect } from "preact/hooks";
import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { BarChart2, RefreshCw } from "lucide-preact";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import {
  PageLayout,
  PageHeader,
  StatsGrid,
  SimpleStatsCard,
  LoadingState,
  ErrorBanner,
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
 * @summary コンテキスト履歴エントリ
 */
interface ContextHistoryEntry {
  timestamp: string;
  input: number;
  output: number;
  pid?: number;
}

interface InstanceContextHistory {
  pid: number;
  history: ContextHistoryEntry[];
}

interface ContextHistoryResponse {
  instances?: Record<string, InstanceContextHistory>;
}

/**
 * @summary 表示モード
 */
type DisplayMode = "input" | "output" | "both";

/**
 * @summary コンテキスト使用量追跡ページ
 */
export const ContextUsagePage: FunctionalComponent = () => {
  const [data, setData] = useState<ContextHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("both");

  // データ取得
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/context-history");
      if (!res.ok) {
        throw new Error(`HTTP error: ${res.status}`);
      }
      const json: ContextHistoryResponse = await res.json();
      const flatHistory = Object.values(json.instances ?? {})
        .flatMap((instance) =>
          instance.history.map((entry) => ({
            ...entry,
            pid: instance.pid,
          }))
        )
        .sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )
        .slice(-100);
      setData(flatHistory);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // データをチャート用に加工
  const chartData = data.map((entry) => ({
    ...entry,
    time: new Date(entry.timestamp).toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  }));

  // 統計計算
  const stats = {
    totalInput: data.reduce((sum, e) => sum + e.input, 0),
    totalOutput: data.reduce((sum, e) => sum + e.output, 0),
    avgInput: data.length > 0 ? Math.round(data.reduce((sum, e) => sum + e.input, 0) / data.length) : 0,
    avgOutput: data.length > 0 ? Math.round(data.reduce((sum, e) => sum + e.output, 0) / data.length) : 0,
  };

  if (loading && data.length === 0) {
    return <LoadingState message="Loading context history..." />;
  }

  return (
    <PageLayout variant="default">
      {/* Header */}
      <PageHeader
        title="Context Usage"
        description="Token usage history and statistics"
        icon={BarChart2}
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

      {/* Error */}
      {error && (
        <ErrorBanner
          message={`Error: ${error}`}
          onRetry={fetchData}
          onDismiss={() => setError(null)}
        />
      )}

      {/* Stats */}
      <StatsGrid cols={4}>
        <SimpleStatsCard
          value={formatChartNumber(stats.totalInput)}
          label="Total Input"
          subLabel="tokens"
        />
        <SimpleStatsCard
          value={formatChartNumber(stats.totalOutput)}
          label="Total Output"
          subLabel="tokens"
        />
        <SimpleStatsCard
          value={formatChartNumber(stats.avgInput)}
          label="Avg Input"
          subLabel="tokens/req"
        />
        <SimpleStatsCard
          value={formatChartNumber(stats.avgOutput)}
          label="Avg Output"
          subLabel="tokens/req"
        />
      </StatsGrid>

      {/* Display Mode Toggle */}
      <div class={cn("flex items-center", SPACING.element)}>
        <span class={TYPOGRAPHY.label}>Display:</span>
        <div class="flex border rounded overflow-hidden">
          {(["both", "input", "output"] as DisplayMode[]).map((mode) => (
            <button
              key={mode}
              class={cn(
                FORM_STYLES.buttonCompact,
                displayMode === mode
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
              )}
              onClick={() => setDisplayMode(mode)}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader class={CARD_STYLES.headerCompact}>
          <CardTitle class={CARD_STYLES.title}>Usage History</CardTitle>
          <CardDescription>Last {data.length} requests</CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <ChartEmptyState height={300} />
          ) : (
            <div class="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
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
                    tickFormatter={(v: number) => formatChartNumber(v)}
                    width={50}
                  />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(value: number) => formatChartNumber(value)}
                  />
                  {(displayMode === "input" || displayMode === "both") && (
                    <Bar
                      dataKey="input"
                      name="Input"
                      fill="hsl(var(--chart-1))"
                      radius={[2, 2, 0, 0]}
                      maxBarSize={20}
                    />
                  )}
                  {(displayMode === "output" || displayMode === "both") && (
                    <Bar
                      dataKey="output"
                      name="Output"
                      fill="hsl(var(--chart-2))"
                      radius={[2, 2, 0, 0]}
                      maxBarSize={20}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Instance Table */}
      {data.length > 0 && (
        <Card>
          <CardHeader class={CARD_STYLES.headerCompact}>
            <CardTitle class={CARD_STYLES.title}>By Instance</CardTitle>
            <CardDescription>Token usage breakdown by PID</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="overflow-x-auto">
              <table class={cn("w-full", TYPOGRAPHY.body)}>
                <thead>
                  <tr class={PATTERNS.divider}>
                    <th class={cn("text-left py-2 px-2", TYPOGRAPHY.label)}>PID</th>
                    <th class={cn("text-right py-2 px-2", TYPOGRAPHY.label)}>Requests</th>
                    <th class={cn("text-right py-2 px-2", TYPOGRAPHY.label)}>Total Input</th>
                    <th class={cn("text-right py-2 px-2", TYPOGRAPHY.label)}>Total Output</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(
                    data.reduce((acc, e) => {
                      const pid = e.pid ?? "unknown";
                      if (!acc[pid]) {
                        acc[pid] = { count: 0, input: 0, output: 0 };
                      }
                      acc[pid].count++;
                      acc[pid].input += e.input;
                      acc[pid].output += e.output;
                      return acc;
                    }, {} as Record<string, { count: number; input: number; output: number }>)
                  ).map(([pid, stats]) => (
                    <tr key={pid} class={PATTERNS.tableRow}>
                      <td class={cn("py-2 px-2", PATTERNS.mono)}>{pid}</td>
                      <td class="text-right py-2 px-2">{stats.count}</td>
                      <td class="text-right py-2 px-2">{formatChartNumber(stats.input)}</td>
                      <td class="text-right py-2 px-2">{formatChartNumber(stats.output)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </PageLayout>
  );
};
