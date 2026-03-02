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
  LineChart,
  Line,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "./ui/chart";
import { RefreshCw, Cpu, Folder, Wifi, WifiOff, FileText } from "lucide-preact";
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
import { Progress } from "./ui/progress";
import { cn } from "@/lib/utils";
import {
  PageLayout,
  PageHeader,
  LoadingState,
  ErrorBanner,
  ChartEmptyState,
  CHART_TOOLTIP_STYLE,
  FORM_STYLES,
  PATTERNS,
} from "./layout";
import { StatsCard, StatsGrid } from "./layout/stats-card";

/**
 * @summary 時間軸の種類
 */
type LlmTimeRange = "1d" | "1w" | "1m" | "1y";

/**
 * @summary ヒートマップのメトリクス種類
 */
type HeatmapMetric = "cost" | "tokens" | "runs";

/**
 * @summary 時間範囲の開始日を取得（今日/今週/今月/今年）
 */
function getTimeRangeStartDate(range: LlmTimeRange): Date {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  switch (range) {
    case "1d": {
      // 今日の0:00
      return today;
    }
    case "1w": {
      // 今週の月曜日
      const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // 月曜日までの日数
      const monday = new Date(today);
      monday.setDate(today.getDate() + diff);
      return monday;
    }
    case "1m": {
      // 今月の1日
      return new Date(today.getFullYear(), today.getMonth(), 1);
    }
    case "1y": {
      // 今年の1月1日
      return new Date(today.getFullYear(), 0, 1);
    }
  }
}

/**
 * @summary 時間範囲の日数を計算
 */
function getTimeRangeDays(range: LlmTimeRange): number {
  const startDate = getTimeRangeStartDate(range);
  const today = new Date();
  today.setHours(23, 59, 59, 999); // 今日の終わり
  const diffTime = today.getTime() - startDate.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end
}

/**
 * @summary 時間軸に対応するラベルを取得
 */
function getTimeRangeLabel(range: LlmTimeRange): string {
  switch (range) {
    case "1d": return "Today";
    case "1w": return "This Week";
    case "1m": return "This Month";
    case "1y": return "This Year";
  }
}

/**
 * @summary メトリクスに対応するラベルを取得
 */
function getMetricLabel(metric: HeatmapMetric): string {
  switch (metric) {
    case "cost": return "Cost";
    case "tokens": return "Tokens";
    case "runs": return "Runs";
  }
}

/**
 * @summary GitHub風緑色のヒートマップ色クラスを取得（5段階）
 */
function getGreenHeatmapClass(intensity: number): string {
  // intensity: 0-1
  if (intensity === 0) return "bg-[#161b22]"; // No data - dark background
  if (intensity < 0.2) return "bg-[#0e4429]"; // Level 1 - darkest green
  if (intensity < 0.4) return "bg-[#006d32]"; // Level 2
  if (intensity < 0.6) return "bg-[#26a641]"; // Level 3
  if (intensity < 0.8) return "bg-[#39d353]"; // Level 4
  return "bg-[#7ee787]"; // Level 5 - brightest green
}

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
  const [sseConnected, setSseConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Agent Usage Stats
  const [agentUsage, setAgentUsage] = useState<{
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
    features: Record<string, {
      calls: number;
      errors: number;
      avgContext?: number;
      contextTokenSum?: number;
      extension?: string;
      featureName?: string;
    }>;
  } | null>(null);

  // Current Context Usage
  const [currentContext, setCurrentContext] = useState<{
    used: number;
    total: number;
    percent: number;
    free: number;
    categoryTokens: {
      user: number;
      assistant: number;
      tools: number;
      other: number;
    };
    toolOccupancy: Record<string, {
      tokens: number;
      calls: number;
      share: number;
    }>;
    cwd: string;
    model: string;
  } | null>(null);

  // LLM Usage Stats
  const [llmUsage, setLlmUsage] = useState<{
    totals: {
      runs: number;
      promptTokens: number;
      outputTokens: number;
      thinkingTokens: number;
    };
    dailyActivity: Array<{ date: string; tokens: number; runs: number }>;
  } | null>(null);

  // Time range for all stats (shared across all cards)
  const [llmTimeRange, setLlmTimeRange] = useState<LlmTimeRange>("1y");
  
  // Metric type for heatmap
  const [heatmapMetric, setHeatmapMetric] = useState<HeatmapMetric>("tokens");

  // PI Usage Stats (cost, models, tokens, runs)
  const [piUsage, setPiUsage] = useState<{
    byModel: Record<string, number>;
    byDate: Record<string, number>;
    byDateModel: Record<string, Record<string, number>>;
    totalCost: number;
    byDateTokens?: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }>;
    byDateRuns?: Record<string, number>;
    byModelTokens?: Record<string, { input: number; output: number }>;
    totalTokens?: { input: number; output: number };
    totalRuns?: number;
  } | null>(null);

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

  // Agent Usage Statsを取得
  const fetchAgentUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/agent-usage");
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setAgentUsage(json.data);
        }
      }
    } catch (e) {
      console.error("Failed to fetch agent usage:", e);
    }
  }, []);

  // Current Context Usageを取得
  const fetchCurrentContext = useCallback(async () => {
    try {
      const res = await fetch("/api/context/current");
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setCurrentContext(json.data);
        }
      }
    } catch (e) {
      console.error("Failed to fetch current context:", e);
    }
  }, []);

  // PI Usage Statsを取得（コスト、モデル別）
  const fetchPiUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/pi-usage");
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setPiUsage(json.data);
        }
      }
    } catch (e) {
      console.error("Failed to fetch pi usage:", e);
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
    fetchAgentUsage();
    fetchCurrentContext();
    fetchPiUsage();
    connectSSE();

    // Fallback polling (30 seconds) in case SSE fails
    const interval = setInterval(() => {
      if (!sseConnectedRef.current) {
        fetchContextHistory();
        fetchAgentUsage();
        fetchCurrentContext();
        fetchPiUsage();
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
  }, [fetchContextHistory, fetchAgentUsage, fetchCurrentContext, fetchPiUsage, connectSSE]);

  const instances = contextHistory ? Object.values(contextHistory.instances) : [];
  const instanceCount = instances.length;

  // チャート設定
  const chartConfig: ChartConfig = {
    tokens: {
      label: "Tokens",
    },
    input: {
      label: "Input",
      color: "hsl(var(--chart-1))",
    },
    output: {
      label: "Output",
      color: "hsl(var(--chart-2))",
    },
  };

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

  // Global Time Range Selector (used in header)
  const GlobalTimeRangeSelector = () => (
    <div class="flex gap-0.5 bg-muted rounded p-0.5">
      {([
        { value: "1d" as LlmTimeRange, label: "Today" },
        { value: "1w" as LlmTimeRange, label: "Week" },
        { value: "1m" as LlmTimeRange, label: "Month" },
        { value: "1y" as LlmTimeRange, label: "Year" },
      ]).map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => setLlmTimeRange(item.value)}
          class={cn(
            "px-2 py-0.5 text-xs rounded transition-colors cursor-pointer border-0",
            llmTimeRange === item.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );

  // Metric Selector for heatmap
  const MetricSelector = () => (
    <div class="flex gap-0.5 bg-muted rounded p-0.5">
      {(["tokens", "cost", "runs"] as HeatmapMetric[]).map((metric) => (
        <button
          key={metric}
          type="button"
          onClick={() => setHeatmapMetric(metric)}
          class={cn(
            "px-2 py-0.5 text-xs rounded transition-colors cursor-pointer border-0 capitalize",
            heatmapMetric === metric
              ? "bg-green-600 text-white"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
          )}
        >
          {metric}
        </button>
      ))}
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
            <GlobalTimeRangeSelector />
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

      {/* Current Context Usage */}
      {currentContext && (
        <Card class="mb-4">
          <CardHeader class="pb-2">
            <div class="flex items-center justify-between">
              <div>
                <CardTitle class="text-sm">Current Context</CardTitle>
                <div class="text-xs text-muted-foreground truncate max-w-[300px]" title={currentContext.cwd}>
                  {currentContext.cwd}
                </div>
              </div>
              <span class="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                {currentContext.model}
              </span>
            </div>
          </CardHeader>
          <CardContent class="space-y-4">
            {/* Usage bar */}
            <div class="space-y-2">
              <div class="flex items-center justify-between text-sm">
                <span class="text-muted-foreground">
                  used {currentContext.used.toLocaleString()} / {currentContext.total.toLocaleString()} ({currentContext.percent.toFixed(1)}%)
                </span>
                <span class="text-muted-foreground">
                  free {currentContext.free.toLocaleString()} tokens
                </span>
              </div>
              <Progress value={currentContext.percent} class="h-2" />
            </div>

            {/* Category breakdown */}
            <div class="grid grid-cols-4 gap-2 text-xs">
              <div class="text-center">
                <div class="text-muted-foreground">User</div>
                <div class="font-mono">{(currentContext.categoryTokens.user / 1000).toFixed(1)}k</div>
              </div>
              <div class="text-center">
                <div class="text-muted-foreground">Assistant</div>
                <div class="font-mono">{(currentContext.categoryTokens.assistant / 1000).toFixed(1)}k</div>
              </div>
              <div class="text-center">
                <div class="text-muted-foreground">Tools</div>
                <div class="font-mono">{(currentContext.categoryTokens.tools / 1000).toFixed(1)}k</div>
              </div>
              <div class="text-center">
                <div class="text-muted-foreground">Other</div>
                <div class="font-mono">{(currentContext.categoryTokens.other / 1000).toFixed(1)}k</div>
              </div>
            </div>

            {/* Tool Occupancy */}
            {Object.keys(currentContext.toolOccupancy).length > 0 && (
              <div class="space-y-1">
                <div class="text-xs text-muted-foreground font-medium">Current Tool Occupancy (estimate)</div>
                <div class="space-y-1 max-h-[200px] overflow-y-auto">
                  {Object.entries(currentContext.toolOccupancy)
                    .sort((a, b) => b[1].tokens - a[1].tokens)
                    .slice(0, 8)
                    .map(([tool, data]) => (
                      <div key={tool} class="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0">
                        <span class="text-muted-foreground truncate flex-1">{tool}</span>
                        <div class="flex items-center gap-4 text-right">
                          <span class="w-16">{data.tokens.toLocaleString()}</span>
                          <span class="w-10 text-muted-foreground">{(data.share * 100).toFixed(1)}%</span>
                          <span class="w-10 text-muted-foreground">{data.calls}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats Grid - Summary */}
      {piUsage && Object.keys(piUsage.byModel).length > 0 && (() => {
        const startDate = getTimeRangeStartDate(llmTimeRange);
        const endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
        
        // Calculate totals for all metrics
        let totalTokens = 0;
        let totalRuns = 0;
        let totalCost = 0;
        let activeDays = 0;
        
        const current = new Date(startDate);
        while (current <= endDate) {
          const dateStr = current.toISOString().split('T')[0];
          if (dateStr) {
            const cost = piUsage.byDate[dateStr] || 0;
            const tokens = piUsage.byDateTokens?.[dateStr];
            const runs = piUsage.byDateRuns?.[dateStr] || 0;
            
            if (cost > 0 || (tokens && (tokens.input > 0 || tokens.output > 0)) || runs > 0) {
              activeDays++;
            }
            
            totalCost += cost;
            if (tokens) {
              totalTokens += tokens.input + tokens.output;
            }
            totalRuns += runs;
          }
          current.setDate(current.getDate() + 1);
        }
        
        const avgTokensPerDay = activeDays > 0 ? Math.round(totalTokens / activeDays) : 0;
        
        // Top model by cost
        const startDateStr = startDate.toISOString().split('T')[0];
        const filteredByModel: Record<string, number> = {};
        for (const [date, models] of Object.entries(piUsage.byDateModel)) {
          if (date >= startDateStr) {
            for (const [model, cost] of Object.entries(models)) {
              filteredByModel[model] = (filteredByModel[model] || 0) + cost;
            }
          }
        }
        const sortedModels = Object.entries(filteredByModel).sort((a, b) => b[1] - a[1]);
        const topModelName = sortedModels[0]?.[0]?.split('/').pop() || '-';
        
        return (
          <StatsGrid cols={6} className="mb-4">
            <StatsCard
              label="Total Tokens"
              value={totalTokens >= 1000000 ? `${(totalTokens / 1000000).toFixed(1)}M` : totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}K` : totalTokens.toString()}
            />
            <StatsCard
              label="Total Runs"
              value={totalRuns >= 1000 ? `${(totalRuns / 1000).toFixed(1)}K` : totalRuns.toString()}
            />
            <StatsCard
              label="Total Cost"
              value={`$${totalCost.toFixed(2)}`}
            />
            <StatsCard
              label="Active Days"
              value={activeDays.toString()}
            />
            <StatsCard
              label="Avg Tokens/Day"
              value={avgTokensPerDay >= 1000 ? `${(avgTokensPerDay / 1000).toFixed(1)}K` : avgTokensPerDay.toString()}
            />
            <StatsCard
              label="Top Model"
              value={topModelName}
            />
          </StatsGrid>
        );
      })()}

      {/* Activity Heatmap and Tool Breakdown Row */}
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* LLM Usage - Daily Activity Heatmap (GitHub-style green) */}
        {piUsage && Object.keys(piUsage.byDate).length > 0 && (() => {
          const label = getTimeRangeLabel(llmTimeRange);
        
        // Get start date based on time range (Today/This Week/This Month/This Year)
        const startDate = getTimeRangeStartDate(llmTimeRange);
        const endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];
        
        // Get filtered data based on metric
        const getMetricValue = (date: string): number => {
          if (heatmapMetric === "cost") {
            return piUsage.byDate[date] || 0;
          } else if (heatmapMetric === "tokens") {
            const tokens = piUsage.byDateTokens?.[date];
            return tokens ? tokens.input + tokens.output : 0;
          } else {
            return piUsage.byDateRuns?.[date] || 0;
          }
        };
        
        const formatMetricValue = (value: number): string => {
          if (heatmapMetric === "cost") {
            return `$${value.toFixed(2)}`;
          } else if (heatmapMetric === "tokens") {
            return value >= 1000000 ? `${(value / 1000000).toFixed(1)}M` :
                   value >= 1000 ? `${(value / 1000).toFixed(1)}K` :
                   value.toString();
          } else {
            return `${value} runs`;
          }
        };
        
        // Build filtered data map from startDate to endDate
        const filteredByMetric: Record<string, number> = {};
        const allDates: string[] = [];
        const current = new Date(startDate);
        while (current <= endDate) {
          const dateStr = current.toISOString().split('T')[0];
          if (dateStr) {
            allDates.push(dateStr);
            const value = getMetricValue(dateStr);
            if (value > 0) {
              filteredByMetric[dateStr] = value;
            }
          }
          current.setDate(current.getDate() + 1);
        }
        
        // Calculate max for intensity scaling
        const values = Object.values(filteredByMetric);
        const maxValue = values.length > 0 ? Math.max(...values) : 0;
        const hasData = values.length > 0;
        
        // Calculate summary stats
        const totalValue = values.reduce((sum, v) => sum + v, 0);
        const activeDays = values.length;
        
        // Generate description based on metric
        const summaryText = heatmapMetric === "cost" 
          ? `Total: $${totalValue.toFixed(2)} | ${activeDays} active days`
          : heatmapMetric === "tokens"
          ? `Total: ${(totalValue / 1000000).toFixed(2)}M tokens | ${activeDays} active days`
          : `Total: ${totalValue.toLocaleString()} runs | ${activeDays} active days`;
        
        // For 1 day view, render single day highlight
        // For all other views, render GitHub-style calendar heatmap
        const isDayView = llmTimeRange === "1d";
        const isYearView = llmTimeRange === "1y";
        const isWeekView = llmTimeRange === "1w";
        
        // Cell size based on view
        // Year: 10px (53 weeks, scrollable)
        // Month: 14px (4-5 weeks)
        // Week: 18px (1 week)
        const cellSize = isYearView ? "w-[10px] h-[10px]" : isWeekView ? "w-[18px] h-[18px]" : "w-[14px] h-[14px]";
        const cellGap = isYearView ? "gap-[2px]" : "gap-[3px]";
        
        // Group dates by week (for GitHub-style layout)
        // Each column is a week, rows are days of week (Sun=0 to Sat=6)
        const weeks: Array<Array<string | null>> = [];
        let currentWeek: Array<string | null> = new Array(7).fill(null);
        
        // Find the first Sunday on or before startDate
        const firstSunday = new Date(startDate);
        const startDayOfWeek = startDate.getDay();
        firstSunday.setDate(startDate.getDate() - startDayOfWeek);
        
        // Build weeks array
        const iterDate = new Date(firstSunday);
        while (iterDate <= endDate || weeks.length === 0) {
          const dayOfWeek = iterDate.getDay();
          const dateStr = iterDate.toISOString().split('T')[0];
          
          // Only include dates within our range
          if (iterDate >= startDate && iterDate <= endDate) {
            currentWeek[dayOfWeek] = dateStr;
          } else if (iterDate < startDate) {
            // Before start date - leave as null (empty cell)
            currentWeek[dayOfWeek] = null;
          }
          
          // If Saturday, end the week
          if (dayOfWeek === 6) {
            weeks.push(currentWeek);
            currentWeek = new Array(7).fill(null);
          }
          
          iterDate.setDate(iterDate.getDate() + 1);
          
          // Safety: don't create infinite loop
          if (weeks.length > 60) break;
        }
        
        // Push remaining week if not empty
        if (currentWeek.some(d => d !== null)) {
          weeks.push(currentWeek);
        }
        
        return (
          <Card class="lg:col-span-2">
            <CardHeader class="pb-2">
              <div class="flex items-center justify-between">
                <div>
                  <CardTitle class="text-sm">Activity Heatmap ({label})</CardTitle>
                  <CardDescription class="text-xs">{summaryText}</CardDescription>
                </div>
                <MetricSelector />
              </div>
            </CardHeader>
            <CardContent>
              {hasData ? (
                <>
                  {isDayView ? (
                    // Day view: Show today's data prominently
                    <div class="flex items-center justify-center py-4">
                      <div class="text-center">
                        <div class={cn(
                          "w-20 h-20 rounded-lg flex items-center justify-center text-2xl font-bold mx-auto mb-2",
                          maxValue > 0 ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"
                        )}>
                          {formatMetricValue(totalValue)}
                        </div>
                        <div class="text-sm text-muted-foreground">
                          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    // Week/Month/Year view: GitHub-style calendar heatmap
                    <div class="flex gap-2">
                      {/* Day labels (hide for year view) */}
                      {!isYearView && (
                        <div class={cn("flex flex-col", cellGap)}>
                          {["", "Mon", "", "Wed", "", "Fri", ""].map((day, i) => (
                            <div key={i} class={cn(cellSize, "flex items-center justify-center text-[9px] text-muted-foreground")}>
                              {day}
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Heatmap grid */}
                      <div class="overflow-x-auto">
                        <div class={cn("flex", cellGap)}>
                          {weeks.map((week, weekIndex) => (
                            <div key={weekIndex} class={cn("flex flex-col flex-shrink-0", cellGap)}>
                              {week.map((dateStr, dayIndex) => {
                                if (dateStr === null) {
                                  // Empty cell (before start date)
                                  return <div key={dayIndex} class={cn(cellSize, "flex-shrink-0")} />;
                                }
                                const value = filteredByMetric[dateStr] || 0;
                                const intensity = maxValue > 0 ? value / maxValue : 0;
                                const bgClass = getGreenHeatmapClass(intensity);
                                return (
                                  <div
                                    key={dayIndex}
                                    class={cn("rounded-sm flex-shrink-0", cellSize, bgClass)}
                                    title={`${dateStr}: ${formatMetricValue(value)}`}
                                  />
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  <div class="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                    <span>{startDateStr}</span>
                    <div class="flex items-center gap-1">
                      <span>Less</span>
                      <div class={cn("flex", cellGap)}>
                        <div class={cn("rounded-sm flex-shrink-0", cellSize, getGreenHeatmapClass(0))} />
                        <div class={cn("rounded-sm flex-shrink-0", cellSize, getGreenHeatmapClass(0.1))} />
                        <div class={cn("rounded-sm flex-shrink-0", cellSize, getGreenHeatmapClass(0.3))} />
                        <div class={cn("rounded-sm flex-shrink-0", cellSize, getGreenHeatmapClass(0.5))} />
                        <div class={cn("rounded-sm flex-shrink-0", cellSize, getGreenHeatmapClass(0.9))} />
                      </div>
                      <span>More</span>
                    </div>
                    <span>{endDateStr}</span>
                  </div>
                </>
              ) : (
                <div class="text-center text-muted-foreground py-8 text-sm">
                  No activity data for this period
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

        {/* Tool Breakdown */}
        {agentUsage && Object.keys(agentUsage.features).length > 0 && (
          <Card>
            <CardHeader class="pb-2">
              <CardTitle class="text-sm">Tool Breakdown ({getTimeRangeLabel(llmTimeRange)})</CardTitle>
              <CardDescription class="text-xs">
                {agentUsage.totals.toolCalls.toLocaleString()} calls | {Math.round(agentUsage.totals.contextTokenSum / 1000000).toLocaleString()}M context tokens
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div class="space-y-1">
                {Object.entries(agentUsage.features)
                  .filter(([key]) => key.startsWith('tool:'))
                  .sort((a, b) => b[1].calls - a[1].calls)
                  .slice(0, 10)
                  .map(([key, data]) => {
                    const toolName = data.featureName || key.split(':').pop() || key;
                    const contextEst = data.contextTokenSum ? Math.round(data.contextTokenSum / 1000) : 0;
                    const maxCalls = Math.max(...Object.values(agentUsage.features).map(f => f.calls));
                    const barWidth = maxCalls > 0 ? (data.calls / maxCalls * 100) : 0;
                    return (
                      <div key={key} class="flex items-center gap-2 text-xs">
                        <span class="flex-1 truncate font-mono">{toolName}</span>
                        <span class="w-12 text-right">{data.calls.toLocaleString()}</span>
                        <span class="w-16 text-right text-muted-foreground">{contextEst > 0 ? `${contextEst}K` : '-'}</span>
                        <div class="w-12 h-2 bg-muted rounded overflow-hidden">
                          <div class="h-full bg-emerald-500 rounded" style={{ width: `${barWidth}%` }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
              <div class="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                <span>Tool</span>
                <span>Calls</span>
                <span>Context</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

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
  planPath,
  onPlanClick,
}: {
  instance: InstanceContextHistory;
  color: string;
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
                <Bar
                  dataKey="input"
                  name="Input"
                  fill="hsl(var(--chart-1))"
                  radius={[2, 2, 0, 0]}
                  maxBarSize={12}
                  isAnimationActive
                  animationDuration={250}
                />
                <Bar
                  dataKey="output"
                  name="Output"
                  fill="hsl(var(--chart-2))"
                  radius={[2, 2, 0, 0]}
                  maxBarSize={12}
                  isAnimationActive
                  animationDuration={250}
                />
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
