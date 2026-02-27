/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/components/dashboard-page.tsx
 * @role Dashboard page with multi-instance context usage graph
 * @why Visualize real-time context usage for all running pi instances
 * @related app.tsx, ui/chart.tsx
 * @public_api DashboardPage
 * @invariants Data is fetched from API on mount and updated via SSE
 * @side_effects Fetches data from /api/context-history, subscribes to SSE events
 * @failure_modes API unavailable, network error
 *
 * @abdd.explain
 * @overview Dashboard showing multi-instance context usage chart
 * @what_it_does Fetches context history from API, displays real-time graph with SSE updates
 * @why_it_exists Allows users to monitor all pi instances' token usage in one view
 * @scope(in) API data, SSE events, user interactions
 * @scope(out) Rendered dashboard, charts
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
  Legend,
} from "recharts";
import { Activity, Loader2, RefreshCw } from "lucide-preact";
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
 * @summary コンテキスト履歴エントリ
 */
interface ContextHistoryEntry {
  timestamp: string;
  input: number;
  output: number;
  pid: number;
}

/**
 * @summary インスタンスごとのコンテキスト履歴
 */
interface InstanceContextHistory {
  pid: number;
  cwd: string;
  model: string;
  history: ContextHistoryEntry[];
}

/**
 * @summary APIレスポンス形式
 */
interface ContextHistoryResponse {
  instances: Record<number, InstanceContextHistory>;
}

/**
 * @summary インスタンス識別用の色
 */
const INSTANCE_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

/**
 * @summary インスタンスの色を取得
 */
function getInstanceColor(pid: number, index: number): string {
  return INSTANCE_COLORS[index % INSTANCE_COLORS.length];
}

export function DashboardPage() {
  const [contextHistory, setContextHistory] = useState<ContextHistoryResponse | null>(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [displayMode, setDisplayMode] = useState<"input" | "output" | "both">("both");

  // コンテキスト履歴を取得
  const fetchContextHistory = async () => {
    try {
      const res = await fetch("/api/context-history");
      if (res.ok) {
        const json: ContextHistoryResponse = await res.json();
        setContextHistory(json);
      }
    } catch (e) {
      console.error("Failed to fetch context history:", e);
    } finally {
      setContextLoading(false);
    }
  };

  // 初回データ取得 + ポーリング
  // NOTE: SSEはapp.tsxで管理（二重接続を避けるため、ここではポーリングのみ）
  useEffect(() => {
    fetchContextHistory();

    const interval = setInterval(() => {
      fetchContextHistory();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div class="flex h-full flex-col gap-4 p-4 overflow-auto">
      {/* Header */}
      <div class="flex gap-2 shrink-0 items-center">
        <div class="flex-1" />
        <div class="flex items-center gap-2 text-sm text-muted-foreground">
          <Activity class="h-4 w-4" />
          <span>Live</span>
        </div>
      </div>

      {/* Context Usage Chart */}
      <ContextUsageSection
        data={contextHistory}
        loading={contextLoading}
        displayMode={displayMode}
        setDisplayMode={setDisplayMode}
        onRefresh={fetchContextHistory}
      />
    </div>
  );
}

/**
 * @summary 複数インスタンスのコンテキスト使用量グラフ
 */
function ContextUsageSection({
  data,
  loading,
  displayMode,
  setDisplayMode,
  onRefresh,
}: {
  data: ContextHistoryResponse | null;
  loading: boolean;
  displayMode: "input" | "output" | "both";
  setDisplayMode: (mode: "input" | "output" | "both") => void;
  onRefresh: () => void;
}) {
  if (loading && !data) {
    return (
      <Card>
        <CardContent class="py-8 flex items-center justify-center">
          <div class="flex flex-col items-center gap-2">
            <Loader2 class="h-6 w-6 animate-spin text-primary" />
            <p class="text-sm text-muted-foreground">Loading context history...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const instances = data ? Object.values(data.instances) : [];
  const instanceCount = instances.length;

  // kilo系の見え方に合わせて、時系列を固定スロットで集約する
  const bucketMs = 10_000;
  const perBucketTotals = new Map<number, { input: number; output: number }>();

  for (const instance of instances) {
    const latestByBucket = new Map<number, ContextHistoryEntry>();
    const sorted = [...instance.history].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    for (const entry of sorted) {
      const t = new Date(entry.timestamp).getTime();
      if (Number.isNaN(t)) {
        continue;
      }
      const bucket = Math.floor(t / bucketMs) * bucketMs;
      latestByBucket.set(bucket, entry);
    }

    for (const [bucket, entry] of latestByBucket) {
      const current = perBucketTotals.get(bucket) ?? { input: 0, output: 0 };
      perBucketTotals.set(bucket, {
        input: current.input + entry.input,
        output: current.output + entry.output,
      });
    }
  }

  const sortedBuckets = Array.from(perBucketTotals.entries())
    .sort((a, b) => a[0] - b[0])
    .slice(-10);

  const chartData = sortedBuckets.map(([bucket, totals]) => ({
    time: new Date(bucket).toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    input: totals.input,
    output: totals.output,
  }));

  // 統計計算
  const stats = {
    totalInput: instances.reduce((sum, i) => sum + i.history.reduce((s, e) => s + e.input, 0), 0),
    totalOutput: instances.reduce((sum, i) => sum + i.history.reduce((s, e) => s + e.output, 0), 0),
    instanceCount,
  };

  return (
    <Card>
      <CardHeader class="pb-2">
        <div class="flex items-center justify-between">
          <div>
            <CardTitle class="text-sm">Multi-Instance Context Usage</CardTitle>
            <CardDescription>
              {instanceCount} instance{instanceCount !== 1 ? "s" : ""} active
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw class={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>
      <CardContent class="space-y-3">
        {/* 統計 */}
        <div class="grid grid-cols-3 gap-2 text-center">
          <div class="rounded-lg border p-2">
            <div class="text-lg font-bold">{stats.instanceCount}</div>
            <div class="text-xs text-muted-foreground">Instances</div>
          </div>
          <div class="rounded-lg border p-2">
            <div class="text-lg font-bold">{stats.totalInput.toLocaleString()}</div>
            <div class="text-xs text-muted-foreground">Total Input</div>
          </div>
          <div class="rounded-lg border p-2">
            <div class="text-lg font-bold">{stats.totalOutput.toLocaleString()}</div>
            <div class="text-xs text-muted-foreground">Total Output</div>
          </div>
        </div>

        {/* 表示モード切り替え */}
        <div class="flex gap-2">
          <Button
            variant={displayMode === "input" ? "default" : "outline"}
            size="sm"
            onClick={() => setDisplayMode("input")}
          >
            Input
          </Button>
          <Button
            variant={displayMode === "output" ? "default" : "outline"}
            size="sm"
            onClick={() => setDisplayMode("output")}
          >
            Output
          </Button>
          <Button
            variant={displayMode === "both" ? "default" : "outline"}
            size="sm"
            onClick={() => setDisplayMode("both")}
          >
            Both
          </Button>
        </div>

        {/* チャート */}
        {chartData.length === 0 ? (
          <div class="flex h-[200px] items-center justify-center text-muted-foreground text-sm">
            No context history data available
          </div>
        ) : (
          <div class="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" class="stroke-border" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10 }}
                  class="text-muted-foreground"
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  class="text-muted-foreground"
                  tickFormatter={(value: number) => value.toLocaleString()}
                  allowDecimals={false}
                  width={60}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                  formatter={(value: number | undefined, name: string) => [
                    value?.toLocaleString() ?? "0",
                    name,
                  ]}
                />
                <Legend
                  wrapperStyle={{ fontSize: "10px" }}
                />
                {(displayMode === "input" || displayMode === "both") && (
                  <Bar
                    dataKey="input"
                    name="Input"
                    fill="hsl(var(--chart-1))"
                    radius={[2, 2, 0, 0]}
                    maxBarSize={16}
                    isAnimationActive
                    animationDuration={250}
                  />
                )}
                {(displayMode === "output" || displayMode === "both") && (
                  <Bar
                    dataKey="output"
                    name="Output"
                    fill="hsl(var(--chart-2))"
                    radius={[2, 2, 0, 0]}
                    maxBarSize={16}
                    isAnimationActive
                    animationDuration={250}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* インスタンス一覧 */}
        {instances.length > 0 && (
          <div class="space-y-1">
            <div class="text-xs font-medium text-muted-foreground">Active Instances</div>
            <div class="flex flex-wrap gap-1">
              {instances.map((instance, idx) => (
                <div
                  key={instance.pid}
                  class="flex items-center gap-1 rounded border px-2 py-1 text-xs"
                  style={{ borderColor: getInstanceColor(instance.pid, idx) }}
                >
                  <div
                    class="h-2 w-2 rounded-full"
                    style={{ backgroundColor: getInstanceColor(instance.pid, idx) }}
                  />
                  <span class="font-mono">PID:{instance.pid}</span>
                  <span class="text-muted-foreground truncate max-w-[100px]">
                    {instance.model}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
