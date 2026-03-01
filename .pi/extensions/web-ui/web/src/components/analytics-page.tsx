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
} from "recharts";
import {
  Activity,
  Loader2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Zap,
  FileText,
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

function formatNumber(num: number): string {
  if (num < 1000) return String(num);
  if (num < 1000000) return `${(num / 1000).toFixed(1)}K`;
  return `${(num / 1000000).toFixed(1)}M`;
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

export function AnalyticsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [records, setRecords] = useState<BehaviorRecord[]>([]);
  const [hourlyAggregates, setHourlyAggregates] = useState<Aggregates[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [summaryRes, recordsRes, aggregatesRes] = await Promise.all([
        fetch("/api/analytics/summary"),
        fetch("/api/analytics/records?limit=20"),
        fetch("/api/analytics/aggregates?type=hourly"),
      ]);

      if (summaryRes.ok) {
        setSummary(await summaryRes.json());
      }
      if (recordsRes.ok) {
        setRecords(await recordsRes.json());
      }
      if (aggregatesRes.ok) {
        setHourlyAggregates(await aggregatesRes.json());
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Network error";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const today = summary?.today;
  const anomalyCount = today?.anomalies?.length ?? 0;

  return (
    <div class="flex h-full flex-col gap-4 p-4 overflow-auto">
      {/* Header */}
      <div class="flex gap-2 shrink-0 items-center justify-between">
        <div>
          <h1 class="text-xl font-bold">LLM Analytics</h1>
          <p class="text-sm text-muted-foreground">
            Behavior metrics and optimization insights
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

      {/* Error */}
      {error && (
        <Card class="border-destructive shrink-0">
          <CardContent class="py-3 flex items-center gap-2 text-destructive">
            <AlertTriangle class="h-4 w-4" />
            <span class="text-sm">Failed to load data: {error}</span>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {loading && !summary ? (
        <Card>
          <CardContent class="py-8 flex items-center justify-center">
            <div class="flex flex-col items-center gap-2">
              <Loader2 class="h-6 w-6 animate-spin text-primary" />
              <p class="text-sm text-muted-foreground">Loading analytics...</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Metrics Grid */}
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 shrink-0">
            <MetricCard
              icon={Activity}
              label="Runs"
              value={today?.totals.runs ?? 0}
            />
            <MetricCard
              icon={Zap}
              label="Efficiency"
              value={`${((today?.averages.efficiency ?? 0) * 100).toFixed(0)}%`}
              progress={(today?.averages.efficiency ?? 0) * 100}
            />
            <MetricCard
              icon={Clock}
              label="Avg Duration"
              value={formatDuration(today?.averages.durationMs ?? 0)}
            />
            <MetricCard
              icon={CheckCircle}
              label="Compliance"
              value={`${((today?.averages.formatCompliance ?? 0) * 100).toFixed(0)}%`}
              progress={(today?.averages.formatCompliance ?? 0) * 100}
            />
            <MetricCard
              icon={FileText}
              label="Total Tokens"
              value={formatNumber((today?.totals.totalOutputTokens ?? 0) + (today?.totals.totalPromptTokens ?? 0))}
            />
            <MetricCard
              icon={AlertTriangle}
              label="Anomalies"
              value={anomalyCount}
              variant={anomalyCount > 0 ? "warning" : "default"}
            />
          </div>

          {/* Charts Row */}
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Efficiency Trend */}
            <Card>
              <CardHeader class="pb-2">
                <CardTitle class="text-sm flex items-center gap-2">
                  <TrendingUp class="h-4 w-4" />
                  Efficiency Trend (24h)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {hourlyAggregates.length === 0 ? (
                  <div class="flex h-[150px] items-center justify-center text-muted-foreground text-xs">
                    No data available
                  </div>
                ) : (
                  <div class="h-[150px] w-full">
                    <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                      <LineChart data={hourlyAggregates.map((a) => ({
                        time: new Date(a.startTime).toLocaleTimeString("ja-JP", {
                          hour: "2-digit",
                          minute: "2-digit",
                        }),
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
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "6px",
                            fontSize: "11px",
                          }}
                          formatter={(value: string) => [`${value}%`, "Efficiency"]}
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
                  Token Distribution (24h)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {hourlyAggregates.length === 0 ? (
                  <div class="flex h-[150px] items-center justify-center text-muted-foreground text-xs">
                    No data available
                  </div>
                ) : (
                  <div class="h-[150px] w-full">
                    <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                      <BarChart data={hourlyAggregates.slice(-12).map((a) => ({
                        time: new Date(a.startTime).toLocaleTimeString("ja-JP", {
                          hour: "2-digit",
                        }),
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
                          tickFormatter={(v: number) => formatNumber(v)}
                          width={35}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "6px",
                            fontSize: "11px",
                          }}
                          formatter={(value: number) => [formatNumber(value), ""]}
                        />
                        <Bar
                          dataKey="prompt"
                          name="Prompt"
                          fill="hsl(var(--chart-2))"
                          radius={[2, 2, 0, 0]}
                          maxBarSize={20}
                        />
                        <Bar
                          dataKey="output"
                          name="Output"
                          fill="hsl(var(--chart-1))"
                          radius={[2, 2, 0, 0]}
                          maxBarSize={20}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
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
                  <div class="flex items-center justify-center py-8 text-muted-foreground text-xs">
                    No records found
                  </div>
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
                {(!today?.anomalies || today.anomalies.length === 0) ? (
                  <div class="flex items-center justify-center py-8 text-muted-foreground text-xs">
                    No anomalies detected
                  </div>
                ) : (
                  today.anomalies.map((anomaly, idx) => (
                    <AnomalyItem key={idx} anomaly={anomaly} />
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Sub-Components
// ============================================================================

function MetricCard({
  icon: Icon,
  label,
  value,
  progress,
  variant = "default",
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  progress?: number;
  variant?: "default" | "warning" | "success";
}) {
  return (
    <Card class={cn(
      variant === "warning" && "border-yellow-500/50",
      variant === "success" && "border-green-500/50",
    )}>
      <CardContent class="py-3">
        <div class="flex items-center gap-2 mb-1">
          <Icon class="h-3.5 w-3.5 text-muted-foreground" />
          <span class="text-xs text-muted-foreground">{label}</span>
        </div>
        <div class="text-lg font-bold">{value}</div>
        {progress !== undefined && (
          <div class="mt-1.5 h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div
              class={cn(
                "h-full rounded-full transition-all",
                progress >= 70 ? "bg-green-500" : progress >= 40 ? "bg-yellow-500" : "bg-red-500"
              )}
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecordItem({ record }: { record: BehaviorRecord }) {
  const isSuccess = record.execution.outcomeCode === "SUCCESS";
  const efficiency = (
    (record.output.estimatedTokens / Math.max(1, record.prompt.estimatedTokens)) +
    record.quality.formatComplianceScore +
    record.quality.claimResultConsistency
  ) / 3;

  return (
    <div class="p-2 bg-muted/50 rounded-lg text-xs">
      <div class="flex items-center justify-between mb-1.5">
        <span class="font-mono text-muted-foreground">
          {record.id.slice(0, 12)}...
        </span>
        <span class={cn(
          "px-1.5 py-0.5 rounded text-[10px] font-medium",
          isSuccess ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500"
        )}>
          {record.execution.outcomeCode}
        </span>
      </div>
      <div class="grid grid-cols-4 gap-2 text-muted-foreground">
        <div>
          <span class="block text-[10px]">Prompt</span>
          <span class="text-foreground">{record.prompt.estimatedTokens}</span>
        </div>
        <div>
          <span class="block text-[10px]">Output</span>
          <span class="text-foreground">{record.output.estimatedTokens}</span>
        </div>
        <div>
          <span class="block text-[10px]">Duration</span>
          <span class="text-foreground">{formatDuration(record.execution.durationMs)}</span>
        </div>
        <div>
          <span class="block text-[10px]">Efficiency</span>
          <span class={cn(
            "text-foreground",
            efficiency >= 0.7 ? "text-green-500" : efficiency >= 0.4 ? "text-yellow-500" : "text-red-500"
          )}>
            {(efficiency * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  );
}

function AnomalyItem({ anomaly }: { anomaly: AnomalyRecord }) {
  return (
    <div class={cn(
      "p-2 rounded-lg border-l-2 text-xs",
      anomaly.severity === "high" && "bg-red-500/10 border-red-500",
      anomaly.severity === "medium" && "bg-yellow-500/10 border-yellow-500",
      anomaly.severity === "low" && "bg-blue-500/10 border-blue-500",
    )}>
      <div class="font-medium mb-0.5">{formatAnomalyType(anomaly.type)}</div>
      <div class="text-muted-foreground">{anomaly.details}</div>
      <div class="text-[10px] text-muted-foreground mt-1">
        {new Date(anomaly.timestamp).toLocaleString()}
      </div>
    </div>
  );
}
