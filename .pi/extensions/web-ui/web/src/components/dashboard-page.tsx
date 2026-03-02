/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/components/dashboard-page.tsx
 * @role Dashboard page with per-instance context usage charts
 * @why Visualize real-time context usage for each running pi instance
 * @related app.tsx, ui/chart.tsx
 * @public_api DashboardPage
 * @invariants Data is fetched from API on mount and updated via SSE
 * @side_effects Fetches data from /api/context-history, connects to /api/events
 * @failure_modes API unavailable, network error
 *
 * @abdd.explain
 * @overview Dashboard showing per-instance context usage charts
 * @what_it_does Fetches context history from API, displays individual chart for each instance, updates via SSE
 * @why_it_exists Allows users to monitor each pi instance's token usage separately in real-time
 * @scope(in) API data, SSE events, user interactions
 * @scope(out) Rendered dashboard, per-instance charts
 */

import { h } from "preact";
import { useState, useEffect, useCallback, useRef } from "preact/hooks";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
} from "recharts";
import { RefreshCw, Cpu, Folder, Wifi, WifiOff, FileText, Loader2 } from "lucide-preact";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
} from "./ui/drawer";
import { cn } from "@/lib/utils";
import {
  PageLayout,
  PageHeader,
  LoadingState,
  ErrorBanner,
  ChartEmptyState,
  CHART_TOOLTIP_STYLE,
  TYPOGRAPHY,
  FORM_STYLES,
  PATTERNS,
} from "./layout";

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
 * @summary SSEコンテキスト更新イベント
 */
interface ContextUpdateEvent {
  pid: number;
  timestamp: string;
  input: number;
  output: number;
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

/**
 * @summary ownerInstanceIdからPIDを抽出
 * @param ownerInstanceId - "{sessionId}-{pid}"形式のインスタンスID
 * @returns PID数値、または抽出失敗時はnull
 */
function extractPidFromOwnerInstanceId(ownerInstanceId: string | undefined): number | null {
  if (!ownerInstanceId) return null;
  const match = ownerInstanceId.match(/-(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

export function DashboardPage() {
  const [contextHistory, setContextHistory] = useState<ContextHistoryResponse | null>(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [contextError, setContextError] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<"input" | "output" | "both">("both");
  const [sseConnected, setSseConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // アクティブなUL Workflowタスク
  const [activeTask, setActiveTask] = useState<{ id: string; title: string; ownerInstanceId?: string } | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [isPlanDrawerOpen, setIsPlanDrawerOpen] = useState(false);

  // コンテキスト履歴を取得
  const fetchContextHistory = useCallback(async () => {
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
  }, []);

  // アクティブなUL Workflowタスクを取得
  useEffect(() => {
    const fetchActiveTask = async () => {
      try {
        const res = await fetch("/api/ul-workflow/tasks/active");
        if (res.ok) {
          const json = await res.json();
          if (json.data) {
            setActiveTask({ 
              id: json.data.id, 
              title: json.data.title,
              ownerInstanceId: json.data.ownerInstanceId,
            });
          }
        }
      } catch (e) {
        console.error("Failed to fetch active task:", e);
      }
    };

    fetchActiveTask();
    // 10秒ごとにポーリング
    const interval = setInterval(fetchActiveTask, 10000);
    return () => clearInterval(interval);
  }, []);

  // plan.mdを取得
  useEffect(() => {
    if (!activeTask) {
      setPlan(null);
      return;
    }

    const fetchPlan = async () => {
      setPlanLoading(true);
      try {
        const res = await fetch(`/api/ul-workflow/tasks/${activeTask.id}/plan`);
        if (res.ok) {
          const text = await res.text();
          setPlan(text);
        }
      } catch (e) {
        console.error("Failed to fetch plan:", e);
      } finally {
        setPlanLoading(false);
      }
    };

    fetchPlan();
  }, [activeTask]);

  // SSE接続
  const connectSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource("/api/events");
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setSseConnected(true);
    };

    eventSource.onerror = () => {
      setSseConnected(false);
      // Reconnect after 5 seconds
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        connectSSE();
      }, 5000);
    };

    // Handle context-update event
    eventSource.addEventListener("context-update", (event: MessageEvent) => {
      try {
        const update = JSON.parse(event.data) as ContextUpdateEvent;
        setContextHistory((prev) => {
          if (!prev) return prev;

          const newInstanceHistory = { ...prev.instances };
          const existing = newInstanceHistory[update.pid];

          if (existing) {
            // Add new entry to existing instance
            newInstanceHistory[update.pid] = {
              ...existing,
              history: [...existing.history, {
                timestamp: update.timestamp,
                input: update.input,
                output: update.output,
                pid: update.pid,
              }].slice(-100), // Keep last 100 entries
            };
          } else {
            // Create new instance entry (will be populated by instances-update)
            newInstanceHistory[update.pid] = {
              pid: update.pid,
              cwd: "unknown",
              model: "unknown",
              history: [{
                timestamp: update.timestamp,
                input: update.input,
                output: update.output,
                pid: update.pid,
              }],
            };
          }

          return { instances: newInstanceHistory };
        });
      } catch (e) {
        console.warn("[DashboardPage] Failed to parse context-update:", e);
      }
    });

    // Handle instances-update event to sync instance list
    eventSource.addEventListener("instances-update", () => {
      // Refresh context history when instances change
      fetchContextHistory();
    });

    // Handle heartbeat to confirm connection
    eventSource.addEventListener("heartbeat", () => {
      setSseConnected(true);
    });
  }, [fetchContextHistory]);

  // SSE接続状態をrefで管理（ポーリング判定用）
  const sseConnectedRef = useRef(sseConnected);
  useEffect(() => {
    sseConnectedRef.current = sseConnected;
  }, [sseConnected]);

  // 初回データ取得 + SSE接続
  useEffect(() => {
    fetchContextHistory();
    connectSSE();

    // Fallback polling (30 seconds) in case SSE fails
    const interval = setInterval(() => {
      if (!sseConnectedRef.current) {
        fetchContextHistory();
      }
    }, 30000);

    return () => {
      clearInterval(interval);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [fetchContextHistory, connectSSE]);

  const instances = contextHistory ? Object.values(contextHistory.instances) : [];
  const instanceCount = instances.length;

  // 全体の統計
  const totalStats = {
    totalInput: instances.reduce((sum, i) => sum + i.history.reduce((s, e) => s + e.input, 0), 0),
    totalOutput: instances.reduce((sum, i) => sum + i.history.reduce((s, e) => s + e.output, 0), 0),
  };

  // レーダーチャート用データ
  const totalTokens = totalStats.totalInput + totalStats.totalOutput;
  const totalEntries = instances.reduce((sum, i) => sum + i.history.length, 0);
  const avgTokensPerEntry = totalEntries > 0 ? totalTokens / totalEntries : 0;
  const radarData = [
    { subject: "Instances", value: Math.min(instances.length, 10), raw: instances.length },
    { subject: "Entries", value: Math.min(totalEntries / 10, 10), raw: totalEntries },
    { subject: "Input", value: Math.min(totalStats.totalInput / 10000, 10), raw: totalStats.totalInput },
    { subject: "Output", value: Math.min(totalStats.totalOutput / 10000, 10), raw: totalStats.totalOutput },
    { subject: "Avg/Entry", value: Math.min(avgTokensPerEntry / 1000, 10), raw: Math.round(avgTokensPerEntry) },
  ];

  // SSE接続ステータスコンポーネント
  const ConnectionStatus = () => (
    <div class={cn(
      "flex items-center gap-1.5 text-xs px-2 py-1 rounded",
      sseConnected ? "text-green-500 bg-green-500/10" : "text-yellow-500 bg-yellow-500/10"
    )}>
      {sseConnected ? <Wifi class="h-3 w-3" /> : <WifiOff class="h-3 w-3" />}
      <span>{sseConnected ? "Live" : "Polling"}</span>
    </div>
  );

  // 表示モード切り替えボタン
  const DisplayModeButtons = () => (
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
  );

  return (
    <PageLayout variant="default">
      {/* Header */}
      <PageHeader
        title="Dashboard"
        description={`${instanceCount} instance${instanceCount !== 1 ? "s" : ""} active`}
        actions={
          <>
            <ConnectionStatus />
            <Button
              variant="outline"
              size="sm"
              onClick={fetchContextHistory}
              disabled={contextLoading}
            >
              <RefreshCw class={cn("h-4 w-4", contextLoading && "animate-spin")} />
            </Button>
          </>
        }
      />

      {/* 表示モード切り替え */}
      <DisplayModeButtons />

      {/* チャートセクション（円グラフ・レーダーチャート） */}
      {instances.length > 0 && (
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* コンテキスト分析（円グラフ） */}
          <Card>
            <CardHeader class="pb-2">
              <CardTitle class="text-sm">Context Analysis</CardTitle>
              <CardDescription class="text-xs">Input vs Output token distribution</CardDescription>
            </CardHeader>
            <CardContent>
              <div class="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Input Tokens", value: totalStats.totalInput, color: "hsl(var(--chart-1))" },
                        { name: "Output Tokens", value: totalStats.totalOutput, color: "hsl(var(--chart-2))" },
                      ].filter(d => d.value > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {[
                        { name: "Input Tokens", value: totalStats.totalInput, color: "hsl(var(--chart-1))" },
                        { name: "Output Tokens", value: totalStats.totalOutput, color: "hsl(var(--chart-2))" },
                      ].filter(d => d.value > 0).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={CHART_TOOLTIP_STYLE}
                      formatter={(value: number) => [value.toLocaleString() + " tokens", ""]}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={24}
                      formatter={(value, entry) => {
                        const total = totalStats.totalInput + totalStats.totalOutput;
                        const percent = total > 0 ? ((entry.payload?.value || 0) / total * 100).toFixed(1) : "0";
                        return <span class="text-xs text-muted-foreground">{value} ({percent}%)</span>;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div class="flex justify-center gap-4 mt-2 text-xs text-muted-foreground">
                <span>Total: {(totalStats.totalInput + totalStats.totalOutput).toLocaleString()} tokens</span>
              </div>
            </CardContent>
          </Card>

          {/* リソース使用量（レーダーチャート） */}
          <Card>
            <CardHeader class="pb-2">
              <CardTitle class="text-sm">Resource Usage</CardTitle>
              <CardDescription class="text-xs">System resource metrics overview</CardDescription>
            </CardHeader>
            <CardContent>
              <div class="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart
                    cx="50%"
                    cy="50%"
                    outerRadius="70%"
                    data={radarData}
                  >
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis
                      dataKey="subject"
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                    />
                    <PolarRadiusAxis
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 8 }}
                      tickCount={5}
                    />
                    <Radar
                      name="Usage"
                      dataKey="value"
                      stroke="hsl(var(--chart-3))"
                      fill="hsl(var(--chart-3))"
                      fillOpacity={0.4}
                    />
                    <Tooltip
                      contentStyle={CHART_TOOLTIP_STYLE}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div class="rounded-lg border bg-background p-2 shadow-sm text-xs">
                            {payload.map((entry: { payload?: { subject?: string; raw?: number } }, idx: number) => {
                              const item = entry.payload;
                              if (!item) return null;
                              return (
                                <div key={idx} class="flex justify-between gap-4">
                                  <span class="text-muted-foreground">{item.subject}:</span>
                                  <span class="font-medium">{item.raw?.toLocaleString() ?? "-"}</span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div class="grid grid-cols-3 gap-2 mt-2 text-center text-xs">
                <div>
                  <div class="text-muted-foreground">Instances</div>
                  <div class="font-medium">{instances.length}</div>
                </div>
                <div>
                  <div class="text-muted-foreground">Entries</div>
                  <div class="font-medium">{totalEntries}</div>
                </div>
                <div>
                  <div class="text-muted-foreground">Avg/Entry</div>
                  <div class="font-medium">{Math.round(avgTokensPerEntry).toLocaleString()}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Error display */}
      {contextError && (
        <ErrorBanner
          message={`Failed to load data: ${contextError}`}
          onRetry={fetchContextHistory}
          onDismiss={() => setContextError(null)}
        />
      )}

      {/* インスタンスごとのチャート */}
      {contextLoading && !contextHistory ? (
        <LoadingState message="Loading context history..." />
      ) : instanceCount === 0 ? (
        <ChartEmptyState message="No active instances" height={200} />
      ) : activeTask ? (
        <Drawer direction="bottom" open={isPlanDrawerOpen} onOpenChange={setIsPlanDrawerOpen}>
          <div class="space-y-3">
            {instances.map((instance, idx) => {
              const ownerPid = extractPidFromOwnerInstanceId(activeTask?.ownerInstanceId);
              const isOwner = instance.pid === ownerPid;
              
              return (
                <InstanceChartCard
                  key={instance.pid}
                  instance={instance}
                  color={getInstanceColor(idx)}
                  displayMode={displayMode}
                  planPath={isOwner ? `.pi/ul-workflow/tasks/${activeTask.id}/plan.md` : undefined}
                  onPlanClick={isOwner ? () => setIsPlanDrawerOpen(true) : undefined}
                />
              );
            })}
          </div>

          {/* Full plan drawer */}
          <DrawerContent>
            <div class="flex-1 overflow-y-auto p-4">
              {plan && <MarkdownRenderer content={plan} />}
            </div>
          </DrawerContent>
        </Drawer>
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
    </PageLayout>
  );
}

/**
 * @summary 単一インスタンスのチャートカード
 */
function InstanceChartCard({
  instance,
  color,
  displayMode,
  planPath,
  onPlanClick,
}: {
  instance: InstanceContextHistory;
  color: string;
  displayMode: "input" | "output" | "both";
  planPath?: string;
  onPlanClick?: () => void;
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
    <Card class="border-l-2" style={{ borderLeftColor: color }}>
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
              {planPath && (
                <button
                  type="button"
                  onClick={onPlanClick}
                  class="flex items-center gap-1 mt-1 text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2 cursor-pointer bg-transparent border-0 p-0 font-mono"
                >
                  <FileText class="h-3 w-3" />
                  <span class="truncate max-w-[280px]">{planPath}</span>
                </button>
              )}
            </div>
          </div>
          <span class="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
            {instance.model}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <ChartEmptyState message="No history data" height={120} />
        ) : (
          <div class="h-[150px] w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
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
                  contentStyle={CHART_TOOLTIP_STYLE}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                  formatter={(value: number | undefined, name: string | undefined) => [
                    value?.toLocaleString() ?? "0",
                    name ?? "",
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

/**
 * @summary Markdownレンダラー（react-markdown + Tailwind typography）
 */
function MarkdownRenderer({ content }: { content: string }) {
  return (
    <article class="prose prose-invert prose-sm dark:prose-invert max-w-[900px] mx-auto
      prose-headings:scroll-mt-4
    ">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </article>
  );
}
