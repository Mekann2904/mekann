/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/components/dashboard-page.tsx
 * @role Dashboard page with per-instance context usage charts
 * @why Visualize real-time context usage for each running pi instance
 * @related app.tsx, ui/chart.tsx
 * @public_api DashboardPage
 * @invariants Data is fetched from API on mount and updated via polling
 * @side_effects Fetches data from /api/context-history
 * @failure_modes API unavailable, network error
 *
 * @abdd.explain
 * @overview Dashboard showing per-instance context usage charts
 * @what_it_does Fetches context history from API, displays individual chart for each instance
 * @why_it_exists Allows users to monitor each pi instance's token usage separately
 * @scope(in) API data, user interactions
 * @scope(out) Rendered dashboard, per-instance charts
 */

import { h } from "preact";
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
import { Activity, Loader2, RefreshCw, Cpu, Folder, AlertCircle } from "lucide-preact";
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
function getInstanceColor(index: number): string {
  return INSTANCE_COLORS[index % INSTANCE_COLORS.length];
}

/**
 * @summary パスを短縮表示
 */
function truncatePath(path: string, maxLength: number = 40): string {
  if (path.length <= maxLength) return path;
  const parts = path.split("/");
  const fileName = parts[parts.length - 1];
  if (fileName.length >= maxLength - 3) {
    return "..." + fileName.slice(-(maxLength - 3));
  }
  return "..." + path.slice(-(maxLength - 3));
}

export function DashboardPage() {
  const [contextHistory, setContextHistory] = useState<ContextHistoryResponse | null>(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [contextError, setContextError] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<"input" | "output" | "both">("both");

  // コンテキスト履歴を取得
  const fetchContextHistory = async () => {
    setContextError(null);
    try {
      const res = await fetch("/api/context-history");
      if (res.ok) {
        const json: ContextHistoryResponse = await res.json();
        setContextHistory(json);
      } else {
        setContextError(`Server error: ${res.status} ${res.statusText}`);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Network error";
      setContextError(message);
      console.error("Failed to fetch context history:", e);
    } finally {
      setContextLoading(false);
    }
  };

  // 初回データ取得 + ポーリング
  useEffect(() => {
    fetchContextHistory();
    const interval = setInterval(() => {
      fetchContextHistory();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const instances = contextHistory ? Object.values(contextHistory.instances) : [];
  const instanceCount = instances.length;

  // 全体の統計
  const totalStats = {
    totalInput: instances.reduce((sum, i) => sum + i.history.reduce((s, e) => s + e.input, 0), 0),
    totalOutput: instances.reduce((sum, i) => sum + i.history.reduce((s, e) => s + e.output, 0), 0),
  };

  return (
    <div class="flex h-full flex-col gap-4 p-4 overflow-auto">
      {/* Header */}
      <div class="flex gap-2 shrink-0 items-center justify-between">
        <div>
          <h1 class="text-xl font-bold">Dashboard</h1>
          <p class="text-sm text-muted-foreground">
            {instanceCount} instance{instanceCount !== 1 ? "s" : ""} active
          </p>
        </div>
        <div class="flex items-center gap-2">
          <div class="flex items-center gap-2 text-sm text-muted-foreground">
            <Activity class="h-4 w-4" />
            <span>Live</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchContextHistory}
            disabled={contextLoading}
          >
            <RefreshCw class={cn("h-4 w-4", contextLoading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* 全体統計 */}
      <div class="grid grid-cols-2 gap-2 shrink-0">
        <Card>
          <CardContent class="py-3 text-center">
            <div class="text-lg font-bold">{totalStats.totalInput.toLocaleString()}</div>
            <div class="text-xs text-muted-foreground">Total Input</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="py-3 text-center">
            <div class="text-lg font-bold">{totalStats.totalOutput.toLocaleString()}</div>
            <div class="text-xs text-muted-foreground">Total Output</div>
          </CardContent>
        </Card>
      </div>

      {/* 表示モード切り替え */}
      <div class="flex gap-2 shrink-0">
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

      {/* Error display */}
      {contextError && (
        <Card class="border-destructive shrink-0">
          <CardContent class="py-3 flex items-center gap-2 text-destructive">
            <AlertCircle class="h-4 w-4" />
            <span class="text-sm">Failed to load data: {contextError}</span>
            <Button variant="outline" size="sm" onClick={fetchContextHistory} class="ml-auto">
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* インスタンスごとのチャート */}
      {contextLoading && !contextHistory ? (
        <Card>
          <CardContent class="py-8 flex items-center justify-center">
            <div class="flex flex-col items-center gap-2">
              <Loader2 class="h-6 w-6 animate-spin text-primary" />
              <p class="text-sm text-muted-foreground">Loading context history...</p>
            </div>
          </CardContent>
        </Card>
      ) : instanceCount === 0 ? (
        <Card>
          <CardContent class="py-8 flex items-center justify-center">
            <p class="text-sm text-muted-foreground">No active instances</p>
          </CardContent>
        </Card>
      ) : (
        <div class="space-y-3">
          {instances.map((instance, idx) => (
            <InstanceChartCard
              key={instance.pid}
              instance={instance}
              color={getInstanceColor(idx)}
              displayMode={displayMode}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * @summary 単一インスタンスのチャートカード
 */
function InstanceChartCard({
  instance,
  color,
  displayMode,
}: {
  instance: InstanceContextHistory;
  color: string;
  displayMode: "input" | "output" | "both";
}) {
  const bucketMs = 10_000;
  const latestByBucket = new Map<number, ContextHistoryEntry>();
  const sorted = [...instance.history].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  for (const entry of sorted) {
    const t = new Date(entry.timestamp).getTime();
    if (Number.isNaN(t)) continue;
    const bucket = Math.floor(t / bucketMs) * bucketMs;
    latestByBucket.set(bucket, entry);
  }

  const chartData = Array.from(latestByBucket.entries())
    .sort((a, b) => a[0] - b[0])
    .slice(-10)
    .map(([bucket, entry]) => ({
      time: new Date(bucket).toLocaleTimeString("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      input: entry.input,
      output: entry.output,
    }));

  return (
    <Card style={{ borderLeftColor: color, borderLeftWidth: "3px" }}>
      <CardHeader class="pb-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <Cpu class="h-4 w-4" style={{ color }} />
            <div>
              <CardTitle class="text-sm font-mono">PID {instance.pid}</CardTitle>
              <CardDescription class="flex items-center gap-1 mt-0.5">
                <Folder class="h-3 w-3" />
                <span class="truncate max-w-[200px]" title={instance.cwd}>
                  {truncatePath(instance.cwd, 30)}
                </span>
              </CardDescription>
            </div>
          </div>
          <span class="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
            {instance.model}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {/* チャート */}
        {chartData.length === 0 ? (
          <div class="flex h-[120px] items-center justify-center text-muted-foreground text-xs">
            No history data
          </div>
        ) : (
          <div class="h-[150px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
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
                  tickFormatter={(value: number) => value.toLocaleString()}
                  allowDecimals={false}
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
                  formatter={(value: number | undefined, name: string) => [
                    value?.toLocaleString() ?? "0",
                    name,
                  ]}
                />
                {(displayMode === "input" || displayMode === "both") && (
                  <Bar
                    dataKey="input"
                    name="Input"
                    fill="hsl(var(--chart-1))"
                    radius={[2, 2, 0, 0]}
                    maxBarSize={12}
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
                    maxBarSize={12}
                    isAnimationActive
                    animationDuration={250}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
