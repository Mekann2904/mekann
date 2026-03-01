/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/components/analytics-page.tsx
 * @role LLM行動アナリティクスページ
 * @why 実行効率・品質・異常をリアルタイム監視するため
 * @related app.tsx, ui/chart.tsx, ui/card.tsx
 * @public_api AnalyticsPage
 * @invariants データはAPIから取得し、30秒ごとに自動更新
 * @side_effects /api/analytics エンドポイントにアクセス
 * @failure_modes API unavailable, network error
 *
 * @abdd.explain
 * @overview LLM実行の効率・品質・異常を表示するダッシュボード
 * @what_it_does メトリクスカード、レコード一覧、異常パネル、効率グラフを表示
 * @why_it_exists 最適化の効果を可視化し、問題を早期発見するため
 * @scope(in) API data, user interactions
 * @scope(out) Rendered analytics dashboard
 */

import { h } from "preact";
import { useState, useEffect, useCallback } from "preact/hooks";
import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Activity,
  RefreshCw,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertTriangle,
  Zap,
  FileText,
  BarChart3,
  PieChart as PieChartIcon,
} from "lucide-preact";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "./ui/chart";
import { cn } from "@/lib/utils";
import {
  PageLayout,
  PageHeader,
  StatsCard,
  StatsGrid,
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
  STATE_STYLES,
  SPACING,
} from "./layout";

// ============================================================================
// Types
// ============================================================================

interface BehaviorRecord {
  id: string;
  timestamp: string;
  source: string;
  prompt: {
    charCount: number;
    estimatedTokens: number;
    skillCount: number;
    constraintCount: number;
  };
  output: {
    charCount: number;
    estimatedTokens: number;
    thinkingBlockPresent: boolean;
    structureType: string;
  };
  execution: {
    durationMs: number;
    retryCount: number;
    outcomeCode: string;
  };
  quality: {
    formatComplianceScore: number;
    claimResultConsistency: number;
    evidenceCount: number;
  };
  /** 効率スコア（オプション） */
  efficiency?: number;
}

interface Aggregates {
  period: string;
  startTime: string;
  endTime: string;
  totals: {
    runs: number;
    errors: number;
    totalPromptTokens: number;
    totalOutputTokens: number;
    totalThinkingTokens: number;
    totalDurationMs: number;
  };
  averages: {
    promptTokens: number;
    outputTokens: number;
    efficiency: number;
    formatCompliance: number;
    claimResultConsistency: number;
    durationMs: number;
  };
  anomalies: AnomalyRecord[];
}

interface AnomalyRecord {
  timestamp: string;
  type: string;
  severity: "high" | "medium" | "low";
  details: string;
  runId: string;
}

interface Summary {
  today: Aggregates | null;
  thisWeek: Aggregates | null;
  last24Hours: Aggregates[];
}

// ============================================================================
// Utility Functions
// ============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatAnomalyType(type: string): string {
  const map: Record<string, string> = {
    efficiency_drop: "Efficiency Drop",
    format_violation: "Format Violation",
    timeout_spike: "Timeout Spike",
    unusual_pattern: "Unusual Pattern",
  };
  return map[type] || type;
}

// ============================================================================
// Components
// ============================================================================

type TimeRange = "24h" | "7d" | "30d";

export function AnalyticsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [records, setRecords] = useState<BehaviorRecord[]>([]);
  const [aggregates, setAggregates] = useState<Aggregates[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      // 期間に応じた集計タイプを決定
      const aggregateType = timeRange === "24h" ? "hourly" : timeRange === "7d" ? "daily" : "daily";
      
      const [summaryRes, recordsRes, aggregatesRes] = await Promise.all([
        fetch("/api/analytics/summary"),
        fetch("/api/analytics/records?limit=20"),
        fetch(`/api/analytics/aggregates?type=${aggregateType}&range=${timeRange}`),
      ]);

      if (summaryRes.ok) {
        setSummary(await summaryRes.json());
      }
      if (recordsRes.ok) {
        setRecords(await recordsRes.json());
      }
      if (aggregatesRes.ok) {
        setAggregates(await aggregatesRes.json());
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Network error";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const today = summary?.today;
  const last24Hours = summary?.last24Hours ?? [];
  
  // todayがない場合はlast24Hoursから集計値を計算
  const displayData = today ?? (last24Hours.length > 0 ? {
    totals: {
      runs: last24Hours.reduce((sum, h) => sum + h.totals.runs, 0),
      errors: last24Hours.reduce((sum, h) => sum + h.totals.errors, 0),
      totalPromptTokens: last24Hours.reduce((sum, h) => sum + h.totals.totalPromptTokens, 0),
      totalOutputTokens: last24Hours.reduce((sum, h) => sum + h.totals.totalOutputTokens, 0),
      totalThinkingTokens: last24Hours.reduce((sum, h) => sum + h.totals.totalThinkingTokens, 0),
      totalDurationMs: last24Hours.reduce((sum, h) => sum + h.totals.totalDurationMs, 0),
    },
    averages: {
      promptTokens: last24Hours.reduce((sum, h) => sum + h.averages.promptTokens, 0) / last24Hours.length,
      outputTokens: last24Hours.reduce((sum, h) => sum + h.averages.outputTokens, 0) / last24Hours.length,
      efficiency: last24Hours.reduce((sum, h) => sum + h.averages.efficiency, 0) / last24Hours.length,
      formatCompliance: last24Hours.reduce((sum, h) => sum + h.averages.formatCompliance, 0) / last24Hours.length,
      claimResultConsistency: last24Hours.reduce((sum, h) => sum + h.averages.claimResultConsistency, 0) / last24Hours.length,
      durationMs: last24Hours.reduce((sum, h) => sum + h.averages.durationMs, 0) / last24Hours.length,
    },
    anomalies: [],
  } : null);
  
  const anomalyCount = displayData?.anomalies?.length ?? 0;
  
  // 期間表示用のラベル
  const timeRangeLabel = timeRange === "24h" ? "24h" : timeRange === "7d" ? "7 days" : "30 days";

  // Time Range Selector
  const TimeRangeSelector = () => (
    <div class="flex gap-1 bg-muted rounded-lg p-1">
      {(["24h", "7d", "30d"] as TimeRange[]).map((range) => (
        <Button
          key={range}
          variant={timeRange === range ? "default" : "ghost"}
          size="sm"
          onClick={() => setTimeRange(range)}
          class="px-3"
        >
          {range}
        </Button>
      ))}
    </div>
  );

  return (
    <PageLayout variant="default">
      {/* Header */}
      <PageHeader
        title="LLM Analytics"
        description="Behavior metrics and optimization insights"
        actions={
          <>
            <TimeRangeSelector />
            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
              disabled={loading}
            >
              <RefreshCw class={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </>
        }
      />

      {/* Error */}
      {error && (
        <ErrorBanner
          message={`Failed to load data: ${error}`}
          onRetry={fetchData}
          onDismiss={() => setError(null)}
        />
      )}

      {/* Loading */}
      {loading && !summary ? (
        <LoadingState message="Loading analytics..." />
      ) : (
        <>
          {/* Metrics Grid */}
          <StatsGrid cols={6}>
            <StatsCard
              icon={Activity}
              label="Runs"
              value={displayData?.totals.runs ?? 0}
            />
            <StatsCard
              icon={Zap}
              label="Efficiency"
              value={`${((displayData?.averages.efficiency ?? 0) * 100).toFixed(0)}%`}
              progress={(displayData?.averages.efficiency ?? 0) * 100}
            />
            <StatsCard
              icon={Clock}
              label="Avg Duration"
              value={formatDuration(displayData?.averages.durationMs ?? 0)}
            />
            <StatsCard
              icon={CheckCircle}
              label="Compliance"
              value={`${((displayData?.averages.formatCompliance ?? 0) * 100).toFixed(0)}%`}
              progress={(displayData?.averages.formatCompliance ?? 0) * 100}
            />
            <StatsCard
              icon={FileText}
              label="Total Tokens"
              value={formatChartNumber((displayData?.totals.totalOutputTokens ?? 0) + (displayData?.totals.totalPromptTokens ?? 0))}
            />
            <StatsCard
              icon={AlertTriangle}
              label="Anomalies"
              value={anomalyCount}
              variant={anomalyCount > 0 ? "warning" : "default"}
            />
          </StatsGrid>

          {/* Charts Row */}
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Efficiency Trend */}
            <Card>
              <CardHeader class="pb-2">
                <CardTitle class="text-sm flex items-center gap-2">
                  <TrendingUp class="h-4 w-4" />
                  Efficiency Trend ({timeRangeLabel})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {aggregates.length === 0 ? (
                  <ChartEmptyState height={150} />
                ) : (
                  <div class="h-[150px] w-full">
                    <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                      <LineChart data={aggregates.map((a) => ({
                        time: timeRange === "24h" 
                          ? new Date(a.startTime).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })
                          : new Date(a.startTime).toLocaleDateString("ja-JP", { month: "short", day: "numeric" }),
                        efficiency: (a.averages.efficiency * 100).toFixed(1),
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" class="stroke-border" />
                        <XAxis
                          dataKey="time"
                          tick={{ fontSize: 9 }}
                          class="text-muted-foreground"
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          tick={{ fontSize: 9 }}
                          class="text-muted-foreground"
                          domain={[0, 100]}
                          width={30}
                        />
                        <Tooltip
                          contentStyle={CHART_TOOLTIP_STYLE}
                          formatter={(value: string | undefined) => [`${value ?? ""}%`, "Efficiency"]}
                        />
                        <Line
                          type="monotone"
                          dataKey="efficiency"
                          stroke="hsl(var(--chart-1))"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Token Distribution */}
            <Card>
              <CardHeader class="pb-2">
                <CardTitle class="text-sm flex items-center gap-2">
                  <BarChart3 class="h-4 w-4" />
                  Token Distribution ({timeRangeLabel})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {aggregates.length === 0 ? (
                  <ChartEmptyState height={150} />
                ) : (
                  <div class="h-[150px] w-full">
                    <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                      <BarChart data={aggregates.slice(-12).map((a) => ({
                        time: timeRange === "24h"
                          ? new Date(a.startTime).toLocaleTimeString("ja-JP", { hour: "2-digit" })
                          : new Date(a.startTime).toLocaleDateString("ja-JP", { month: "short", day: "numeric" }),
                        prompt: a.totals.totalPromptTokens,
                        output: a.totals.totalOutputTokens,
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" class="stroke-border" />
                        <XAxis
                          dataKey="time"
                          tick={{ fontSize: 9 }}
                          class="text-muted-foreground"
                        />
                        <YAxis
                          tick={{ fontSize: 9 }}
                          class="text-muted-foreground"
                          tickFormatter={(v: number) => formatChartNumber(v)}
                          width={35}
                        />
                        <Tooltip
                          contentStyle={CHART_TOOLTIP_STYLE}
                          formatter={(value: number | undefined) => formatChartNumber(value ?? 0)}
                        />
                        <Bar
                          dataKey="prompt"
                          name="Input"
                          fill="hsl(var(--chart-1))"
                          radius={[2, 2, 0, 0]}
                          maxBarSize={20}
                        />
                        <Bar
                          dataKey="output"
                          name="Output"
                          fill="hsl(var(--chart-2))"
                          radius={[2, 2, 0, 0]}
                          maxBarSize={20}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Context Ratio (Pie Chart) */}
            <Card>
              <CardHeader class="pb-2">
                <CardTitle class="text-sm flex items-center gap-2">
                  <PieChartIcon class="h-4 w-4" />
                  Context Ratio ({timeRangeLabel})
                </CardTitle>
                <CardDescription>
                  Input vs Output token distribution
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!displayData ? (
                  <ChartEmptyState height={180} />
                ) : (() => {
                  const totalTokens = displayData.totals.totalPromptTokens + displayData.totals.totalOutputTokens;
                  const inputPercent = totalTokens > 0
                    ? ((displayData.totals.totalPromptTokens / totalTokens) * 100).toFixed(1)
                    : "0";
                  const outputPercent = totalTokens > 0
                    ? ((displayData.totals.totalOutputTokens / totalTokens) * 100).toFixed(1)
                    : "0";

                  const pieConfig: ChartConfig = {
                    input: {
                      label: "Input",
                      color: "hsl(var(--chart-1))",
                    },
                    output: {
                      label: "Output",
                      color: "hsl(var(--chart-2))",
                    },
                  };

                  const pieData = [
                    { name: "input", value: displayData.totals.totalPromptTokens, fill: "hsl(var(--chart-1))" },
                    { name: "output", value: displayData.totals.totalOutputTokens, fill: "hsl(var(--chart-2))" },
                  ];

                  return (
                    <div class="flex flex-col items-center">
                      <ChartContainer config={pieConfig} class="h-[180px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={pieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={45}
                              outerRadius={70}
                              paddingAngle={2}
                              dataKey="value"
                              strokeWidth={0}
                            >
                              <Cell fill="hsl(var(--chart-1))" />
                              <Cell fill="hsl(var(--chart-2))" />
                            </Pie>
                            <Tooltip
                              content={({ active, payload }) => (
                                <ChartTooltipContent
                                  active={active}
                                  payload={payload?.map(p => ({
                                    name: p.name ?? "",
                                    value: p.value as number,
                                    color: pieConfig[p.name ?? ""]?.color ?? "",
                                  })) ?? []}
                                  config={pieConfig}
                                />
                              )}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </ChartContainer>
                      <div class="grid grid-cols-2 gap-4 w-full mt-2">
                        <div class="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                          <div class="w-3 h-3 rounded-full bg-[hsl(var(--chart-1))]" />
                          <div class="flex-1">
                            <div class="text-xs text-muted-foreground">Input</div>
                            <div class="text-sm font-semibold">{inputPercent}%</div>
                          </div>
                          <div class="text-xs text-muted-foreground">
                            {formatChartNumber(displayData.totals.totalPromptTokens)}
                          </div>
                        </div>
                        <div class="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                          <div class="w-3 h-3 rounded-full bg-[hsl(var(--chart-2))]" />
                          <div class="flex-1">
                            <div class="text-xs text-muted-foreground">Output</div>
                            <div class="text-sm font-semibold">{outputPercent}%</div>
                          </div>
                          <div class="text-xs text-muted-foreground">
                            {formatChartNumber(displayData.totals.totalOutputTokens)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>

          {/* Records and Anomalies Row */}
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Recent Records */}
            <Card class="lg:col-span-2">
              <CardHeader class="pb-2">
                <CardTitle class="text-sm">Recent Records</CardTitle>
                <CardDescription>Last 20 executions</CardDescription>
              </CardHeader>
              <CardContent class="max-h-[300px] overflow-auto space-y-2">
                {records.length === 0 ? (
                  <EmptyState message="No records found" showCard={false} />
                ) : (
                  records.map((record) => (
                    <RecordItem key={record.id} record={record} />
                  ))
                )}
              </CardContent>
            </Card>

            {/* Anomalies */}
            <Card>
              <CardHeader class="pb-2">
                <CardTitle class="text-sm">Anomalies</CardTitle>
                <CardDescription>Detected issues</CardDescription>
              </CardHeader>
              <CardContent class="max-h-[300px] overflow-auto space-y-2">
                {(!displayData?.anomalies || displayData.anomalies.length === 0) ? (
                  <EmptyState message="No anomalies detected" showCard={false} />
                ) : (
                  displayData.anomalies.map((anomaly, idx) => (
                    <AnomalyItem key={idx} anomaly={anomaly} />
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </PageLayout>
  );
}

// ============================================================================
// Sub-Components
// ============================================================================

function RecordItem({ record }: { record: BehaviorRecord }) {
  const isSuccess = record.execution.outcomeCode === "SUCCESS";
  // efficiencyはAPIから取得した値を使用（集計と同じ計算式）
  // フォールバックとして簡易計算を使用
  const efficiency = record.efficiency ?? (
    (record.output.estimatedTokens / Math.max(1, record.prompt.estimatedTokens)) +
    record.quality.formatComplianceScore +
    record.quality.claimResultConsistency
  ) / 3;

  return (
    <div class={cn("p-2 bg-muted/50 rounded-lg", TYPOGRAPHY.bodySmall)}>
      <div class="flex items-center justify-between mb-1.5">
        <span class={PATTERNS.monoSm}>
          {record.id.slice(0, 12)}...
        </span>
        <span class={cn(
          PATTERNS.badgeSm,
          isSuccess ? cn(STATE_STYLES.success.bg, STATE_STYLES.success.text) : cn(STATE_STYLES.error.bg, STATE_STYLES.error.text)
        )}>
          {record.execution.outcomeCode}
        </span>
      </div>
      <div class={cn("grid grid-cols-4", SPACING.element, "text-muted-foreground")}>
        <div>
          <span class={cn("block", TYPOGRAPHY.muted)}>Prompt</span>
          <span class="text-foreground">{record.prompt.estimatedTokens}</span>
        </div>
        <div>
          <span class={cn("block", TYPOGRAPHY.muted)}>Output</span>
          <span class="text-foreground">{record.output.estimatedTokens}</span>
        </div>
        <div>
          <span class={cn("block", TYPOGRAPHY.muted)}>Duration</span>
          <span class="text-foreground">{formatDuration(record.execution.durationMs)}</span>
        </div>
        <div>
          <span class={cn("block", TYPOGRAPHY.muted)}>Efficiency</span>
          <span class={cn(
            efficiency >= 0.7 ? STATE_STYLES.success.text : efficiency >= 0.4 ? STATE_STYLES.warning.text : STATE_STYLES.error.text
          )}>
            {(efficiency * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  );
}

function AnomalyItem({ anomaly }: { anomaly: AnomalyRecord }) {
  const severityStyle = anomaly.severity === "high"
    ? STATE_STYLES.error
    : anomaly.severity === "medium"
    ? STATE_STYLES.warning
    : STATE_STYLES.info;

  return (
    <div class={cn(
      "p-2 rounded-lg border-l-2",
      TYPOGRAPHY.bodySmall,
      severityStyle.bg,
      `border-l-[${severityStyle.border.split(" ")[0]}]`,
    )}>
      <div class="font-medium mb-0.5">{formatAnomalyType(anomaly.type)}</div>
      <div class="text-muted-foreground">{anomaly.details}</div>
      <div class={cn("mt-1", TYPOGRAPHY.muted)}>
        {new Date(anomaly.timestamp).toLocaleString()}
      </div>
    </div>
  );
}
