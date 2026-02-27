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
 * @overview Dashboard showing status, metrics, and multi-instance context usage chart
 * @what_it_does Fetches context history from API, displays real-time graph with SSE updates
 * @why_it_exists Allows users to monitor all pi instances' token usage in one view
 * @scope(in) API data, SSE events, user interactions
 * @scope(out) Rendered dashboard, charts
 */

import { h, FunctionalComponent } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
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
import { Activity, BarChart3, Settings, Loader2, RefreshCw } from "lucide-preact";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Progress } from "./ui/progress";
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

interface DashboardData {
  status: {
    model: string;
    cwd: string;
    contextUsage: number;
    totalTokens: number;
    cost: number;
  };
  metrics: {
    toolCalls: number;
    errors: number;
    avgResponseTime: number;
  };
  config: Record<string, unknown>;
}

interface DashboardPageProps {
  data: DashboardData | null;
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

export function DashboardPage({ data }: DashboardPageProps) {
  const [activeTab, setActiveTab] = useState<"status" | "metrics" | "config">(
    "status"
  );
  const [contextHistory, setContextHistory] = useState<ContextHistoryResponse | null>(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [displayMode, setDisplayMode] = useState<"input" | "output" | "both">("both");
  const sseRef = useRef<EventSource | null>(null);

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

  // 初回データ取得
  useEffect(() => {
    fetchContextHistory();
  }, []);

  // SSE接続でリアルタイム更新
  useEffect(() => {
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const reconnectDelay = 3000;

    const connectSSE = () => {
      try {
        sseRef.current = new EventSource("/api/events");

        sseRef.current.onopen = () => {
          reconnectAttempts = 0;
        };

        sseRef.current.onerror = () => {
          sseRef.current?.close();
          sseRef.current = null;

          if (reconnectAttempts < maxReconnectAttempts) {
            const delay = reconnectDelay * Math.pow(2, reconnectAttempts);
            reconnectTimeout = setTimeout(() => {
              reconnectAttempts++;
              connectSSE();
            }, delay);
          }
        };

        sseRef.current.addEventListener("context-update", () => {
          // コンテキスト更新時にデータを再取得
          fetchContextHistory();
        });
      } catch {
        // SSE not supported
      }
    };

    connectSSE();

    return () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      sseRef.current?.close();
    };
  }, []);

  if (!data) {
    return (
      <div class="flex h-full items-center justify-center p-4">
        <p class="text-muted-foreground">No data available</p>
      </div>
    );
  }

  return (
    <div class="flex h-full flex-col gap-4 p-4 overflow-auto">
      {/* Tabs */}
      <div class="flex gap-2 shrink-0">
        <Button
          variant={activeTab === "status" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("status")}
        >
          <Activity class="mr-2 h-4 w-4" />
          Status
        </Button>
        <Button
          variant={activeTab === "metrics" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("metrics")}
        >
          <BarChart3 class="mr-2 h-4 w-4" />
          Metrics
        </Button>
        <Button
          variant={activeTab === "config" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("config")}
        >
          <Settings class="mr-2 h-4 w-4" />
          Config
        </Button>
        <div class="flex-1" />
        <div class="flex items-center gap-2 text-sm text-muted-foreground">
          <Activity class="h-4 w-4" />
          <span>Live</span>
        </div>
      </div>

      {/* Context Usage Chart - Always visible */}
      <ContextUsageSection
        data={contextHistory}
        loading={contextLoading}
        displayMode={displayMode}
        setDisplayMode={setDisplayMode}
        onRefresh={fetchContextHistory}
      />

      {/* Content */}
      <div class="flex-1 overflow-y-auto">
        {activeTab === "status" && <StatusSection data={data} />}
        {activeTab === "metrics" && <MetricsSection data={data} />}
        {activeTab === "config" && <ConfigSection data={data} />}
      </div>
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

  // 全インスタンスの履歴を時系列でマージ
  const allEntries: (ContextHistoryEntry & { instanceIndex: number })[] = [];
  instances.forEach((instance, idx) => {
    instance.history.forEach((entry) => {
      allEntries.push({ ...entry, instanceIndex: idx });
    });
  });

  // 時刻でソートして最新50件を表示
  const sortedEntries = allEntries
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .slice(-50);

  // チャートデータを作成
  const chartData = sortedEntries.map((entry) => ({
    time: new Date(entry.timestamp).toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    pid: entry.pid,
    input: entry.input,
    output: entry.output,
    instanceIndex: entry.instanceIndex,
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
                    maxBarSize={30}
                  />
                )}
                {(displayMode === "output" || displayMode === "both") && (
                  <Bar
                    dataKey="output"
                    name="Output"
                    fill="hsl(var(--chart-2))"
                    radius={[2, 2, 0, 0]}
                    maxBarSize={30}
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

function StatusSection({ data }: { data: DashboardData }) {
  const contextPercent = Math.round(data.status.contextUsage * 100);

  return (
    <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm">Model</CardTitle>
        </CardHeader>
        <CardContent>
          <p class="font-semibold">{data.status.model}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm">Working Directory</CardTitle>
        </CardHeader>
        <CardContent>
          <p class="truncate font-mono text-sm">{data.status.cwd}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm">Context Usage</CardTitle>
        </CardHeader>
        <CardContent class="space-y-1">
          <Progress value={contextPercent} />
          <p class="text-xs text-muted-foreground">{contextPercent}% used</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm">Total Tokens</CardTitle>
        </CardHeader>
        <CardContent>
          <p class="text-xl font-bold">
            {data.status.totalTokens.toLocaleString()}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm">Cost</CardTitle>
        </CardHeader>
        <CardContent>
          <p class="text-xl font-bold">${data.status.cost.toFixed(4)}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricsSection({ data }: { data: DashboardData }) {
  const errorRate =
    data.metrics.toolCalls > 0
      ? ((data.metrics.errors / data.metrics.toolCalls) * 100).toFixed(1)
      : "0";

  return (
    <div class="grid gap-3 md:grid-cols-3">
      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm">Tool Calls</CardTitle>
        </CardHeader>
        <CardContent>
          <p class="text-2xl font-bold">{data.metrics.toolCalls}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm">Errors</CardTitle>
        </CardHeader>
        <CardContent>
          <p class="text-2xl font-bold text-destructive">{data.metrics.errors}</p>
          <p class="text-xs text-muted-foreground">{errorRate}% error rate</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm">Avg Response Time</CardTitle>
        </CardHeader>
        <CardContent>
          <p class="text-2xl font-bold">{data.metrics.avgResponseTime}ms</p>
        </CardContent>
      </Card>
    </div>
  );
}

function ConfigSection({ data }: { data: DashboardData }) {
  const entries = Object.entries(data.config);

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent class="py-8 text-center text-muted-foreground">
          No configuration available
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader class="pb-2">
        <CardTitle class="text-sm">Configuration</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="space-y-2">
          {entries.map(([key, value]) => (
            <div
              key={key}
              class="flex items-center justify-between rounded-lg border p-2"
            >
              <span class="text-sm font-medium">{key}</span>
              <span class="font-mono text-xs text-muted-foreground">
                {String(value)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
