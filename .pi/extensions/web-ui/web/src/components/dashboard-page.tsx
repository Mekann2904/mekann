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
  TYPOGRAPHY,
  FORM_STYLES,
  PATTERNS,
} from "./layout";

/**
 * @summary 時間軸の種類
 */
type LlmTimeRange = "1d" | "7d" | "1m" | "1y";

/**
 * @summary ヒートマップのメトリクス種類
 */
type HeatmapMetric = "cost" | "tokens" | "runs";

/**
 * @summary 時間軸に対応する日数を取得
 */
function getTimeRangeDays(range: LlmTimeRange): number {
  switch (range) {
    case "1d": return 1;
    case "7d": return 7;
    case "1m": return 30;
    case "1y": return 365;
  }
}

/**
 * @summary 時間軸に対応するラベルを取得
 */
function getTimeRangeLabel(range: LlmTimeRange): string {
  switch (range) {
    case "1d": return "1 Day";
    case "7d": return "1 Week";
    case "1m": return "1 Month";
    case "1y": return "1 Year";
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
  const [llmTimeRange, setLlmTimeRange] = useState<LlmTimeRange>("1m");
  
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
        { value: "1d" as LlmTimeRange, label: "1D" },
        { value: "7d" as LlmTimeRange, label: "1W" },
        { value: "1m" as LlmTimeRange, label: "1M" },
        { value: "1y" as LlmTimeRange, label: "1Y" },
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

      {/* LLM Usage - Daily Activity Heatmap (GitHub-style green) */}
      {piUsage && Object.keys(piUsage.byDate).length > 0 && (() => {
        const days = getTimeRangeDays(llmTimeRange);
        const label = getTimeRangeLabel(llmTimeRange);
        const metricLabel = getMetricLabel(heatmapMetric);
        
        // Filter data by time range
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const startDateStr = startDate.toISOString().split('T')[0];
        
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
        
        // Build filtered data map
        const filteredByMetric: Record<string, number> = {};
        
        // For 1 year view, aggregate by week
        if (llmTimeRange === "1y") {
          // Create weekly buckets
          const weeklyData: Record<string, number> = {};
          for (let i = 0; i < days; i++) {
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + i);
            const dateStr = date.toISOString().split('T')[0];
            if (dateStr) {
              const value = getMetricValue(dateStr);
              if (value > 0) {
                // Get the Monday of this week as the bucket key
                const dayOfWeek = date.getDay();
                const monday = new Date(date);
                monday.setDate(date.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
                const weekKey = monday.toISOString().split('T')[0] || dateStr;
                weeklyData[weekKey] = (weeklyData[weekKey] || 0) + value;
              }
            }
          }
          // Use weekly data for 1 year view
          Object.assign(filteredByMetric, weeklyData);
        } else {
          // Daily data for other views
          for (let i = 0; i < days; i++) {
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + i);
            const dateStr = date.toISOString().split('T')[0];
            if (dateStr) {
              const value = getMetricValue(dateStr);
              if (value > 0) {
                filteredByMetric[dateStr] = value;
              }
            }
          }
        }
        
        // Calculate max for intensity scaling (use log scale for better distribution)
        const values = Object.values(filteredByMetric);
        const maxValue = values.length > 0 ? Math.max(...values) : 0;
        const hasData = values.length > 0;
        
        // Calculate summary stats
        const totalValue = values.reduce((sum, v) => sum + v, 0);
        const filteredByModel: Record<string, number> = {};
        for (const [date, models] of Object.entries(piUsage.byDateModel)) {
          if (date >= (startDateStr ?? '')) {
            for (const [model, cost] of Object.entries(models)) {
              filteredByModel[model] = (filteredByModel[model] || 0) + cost;
            }
          }
        }
        
        // Generate description based on metric
        const periodUnit = llmTimeRange === "1y" ? "weeks" : llmTimeRange === "1d" ? "hours" : "days";
        const summaryText = heatmapMetric === "cost" 
          ? `Total: $${totalValue.toFixed(2)} | ${Object.keys(filteredByModel).length} models | ${values.length} active ${periodUnit}`
          : heatmapMetric === "tokens"
          ? `Total: ${(totalValue / 1000000).toFixed(2)}M tokens | ${Object.keys(filteredByModel).length} models | ${values.length} active ${periodUnit}`
          : `Total: ${totalValue} runs | ${Object.keys(filteredByModel).length} models | ${values.length} active ${periodUnit}`;
        
        // For 1 year view, render weekly heatmap (52 weeks)
        // For 1 day view, render single day highlight
        // For 1 week / 1 month view, render daily heatmap
        const isYearView = llmTimeRange === "1y";
        const isDayView = llmTimeRange === "1d";
        
        return (
          <Card class="mb-4">
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
                  {isYearView ? (
                    // Year view: 52 weeks as horizontal bars
                    <div class="space-y-1">
                      {Array.from({ length: 52 }, (_, weekIndex) => {
                        // Calculate the Monday of this week
                        const monday = new Date();
                        monday.setDate(monday.getDate() - (365 - weekIndex * 7));
                        const dayOfWeek = monday.getDay();
                        monday.setDate(monday.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
                        const weekKey = monday.toISOString().split('T')[0];
                        const value = filteredByMetric[weekKey || ''] || 0;
                        const intensity = maxValue > 0 ? value / maxValue : 0;
                        const bgClass = getGreenHeatmapClass(intensity);
                        const monthLabel = monday.toLocaleDateString('en-US', { month: 'short' });
                        const showMonthLabel = monday.getDate() <= 7;
                        
                        return (
                          <div key={weekIndex} class="flex items-center gap-1">
                            {showMonthLabel && weekIndex < 50 ? (
                              <span class="w-8 text-xs text-muted-foreground">{monthLabel}</span>
                            ) : (
                              <span class="w-8" />
                            )}
                            <div 
                              class={cn("w-full h-3 rounded-sm", bgClass)}
                              title={`${weekKey || `Week ${weekIndex + 1}`}: ${formatMetricValue(value)}`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : isDayView ? (
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
                    // Week/Month view: GitHub-style calendar heatmap
                    <div class="space-y-0.5">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, dayIndex) => {
                        // Get all dates for this weekday in the selected time range
                        const dates: string[] = [];
                        const today = new Date();
                        for (let i = days - 1; i >= 0; i--) {
                          const date = new Date(today);
                          date.setDate(date.getDate() - i);
                          if (date.getDay() === dayIndex) {
                            dates.push(date.toISOString().split('T')[0] ?? '');
                          }
                        }

                        return (
                          <div key={day} class="flex items-center gap-2">
                            <span class="w-8 text-xs text-muted-foreground">{day}</span>
                            <div class="flex gap-[2px]">
                              {dates.map((dateStr) => {
                                const value = filteredByMetric[dateStr] || 0;
                                const intensity = maxValue > 0 ? value / maxValue : 0;
                                const bgClass = getGreenHeatmapClass(intensity);
                                return (
                                  <div
                                    key={dateStr}
                                    class={cn("w-[11px] h-[11px] rounded-sm", bgClass)}
                                    title={`${dateStr}: ${formatMetricValue(value)}`}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div class="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                    <span>{startDateStr}</span>
                    <div class="flex items-center gap-1">
                      <span>Less</span>
                      <div class="flex gap-[2px]">
                        <div class={cn("w-[11px] h-[11px] rounded-sm", getGreenHeatmapClass(0))} />
                        <div class={cn("w-[11px] h-[11px] rounded-sm", getGreenHeatmapClass(0.1))} />
                        <div class={cn("w-[11px] h-[11px] rounded-sm", getGreenHeatmapClass(0.3))} />
                        <div class={cn("w-[11px] h-[11px] rounded-sm", getGreenHeatmapClass(0.5))} />
                        <div class={cn("w-[11px] h-[11px] rounded-sm", getGreenHeatmapClass(0.9))} />
                      </div>
                      <span>More</span>
                    </div>
                    <span>{new Date().toISOString().split('T')[0]}</span>
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

      {/* Activity Summary - Combined */}
      {piUsage && Object.keys(piUsage.byModel).length > 0 && (() => {
        const days = getTimeRangeDays(llmTimeRange);
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const startDateStr = startDate.toISOString().split('T')[0];
        
        // Calculate totals based on metric
        let totalValue = 0;
        let peakValue = 0;
        let peakDate = '';
        let activeDays = 0;
        
        for (let i = 0; i < days; i++) {
          const date = new Date(startDate);
          date.setDate(startDate.getDate() + i);
          const dateStr = date.toISOString().split('T')[0];
          if (!dateStr) continue;
          
          let value = 0;
          if (heatmapMetric === "cost") {
            value = piUsage.byDate[dateStr] || 0;
          } else if (heatmapMetric === "tokens") {
            const tokens = piUsage.byDateTokens?.[dateStr];
            value = tokens ? tokens.input + tokens.output : 0;
          } else {
            value = piUsage.byDateRuns?.[dateStr] || 0;
          }
          
          if (value > 0) {
            activeDays++;
            totalValue += value;
            if (value > peakValue) {
              peakValue = value;
              peakDate = dateStr;
            }
          }
        }
        
        const avgPerDay = activeDays > 0 ? totalValue / activeDays : 0;
        
        // Model stats
        const filteredByModel: Record<string, number> = {};
        for (const [date, models] of Object.entries(piUsage.byDateModel)) {
          if (date >= (startDateStr ?? '')) {
            for (const [model, cost] of Object.entries(models)) {
              filteredByModel[model] = (filteredByModel[model] || 0) + cost;
            }
          }
        }
        
        const sortedModels = Object.entries(filteredByModel).sort((a, b) => b[1] - a[1]);
        const topModel = sortedModels[0];
        
        // Format functions
        const formatValue = (v: number): string => {
          if (heatmapMetric === "cost") return `$${v.toFixed(2)}`;
          if (heatmapMetric === "tokens") return v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toString();
          return v.toString();
        };
        
        const formatAvg = (v: number): string => {
          if (heatmapMetric === "cost") return `$${v.toFixed(2)}`;
          if (heatmapMetric === "tokens") return v >= 1000000 ? `${(v / 1000000).toFixed(2)}M` : v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toString();
          return v.toFixed(1);
        };
        
        return (
          <Card class="mb-4">
            <CardHeader class="pb-2">
              <div class="flex items-center justify-between">
                <CardTitle class="text-sm">{getMetricLabel(heatmapMetric)} Summary ({getTimeRangeLabel(llmTimeRange)})</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {/* Summary Stats */}
              <div class="grid grid-cols-4 gap-3 mb-4 pb-4 border-b border-border/50">
                <div>
                  <div class="text-muted-foreground text-xs">Total</div>
                  <div class="font-semibold text-lg text-green-500">{formatValue(totalValue)}</div>
                </div>
                <div>
                  <div class="text-muted-foreground text-xs">Top Model</div>
                  <div class="font-semibold truncate text-sm" title={topModel?.[0]}>
                    {topModel ? topModel[0].split('/').pop() : '-'}
                  </div>
                </div>
                <div>
                  <div class="text-muted-foreground text-xs">Avg/Day</div>
                  <div class="font-semibold text-green-400">{formatAvg(avgPerDay)}</div>
                </div>
                <div>
                  <div class="text-muted-foreground text-xs">Peak</div>
                  <div class="font-semibold text-sm text-green-400">{peakValue > 0 ? formatValue(peakValue) : '-'}</div>
                  {peakDate && <div class="text-xs text-muted-foreground">{peakDate}</div>}
                </div>
              </div>
              
              {/* Top Models List */}
              <div class="space-y-1">
                <div class="text-xs text-muted-foreground mb-1">Top Models by Cost</div>
                {sortedModels.slice(0, 5).map(([model, cost], index) => {
                  const totalCost = Object.values(filteredByModel).reduce((s, c) => s + c, 0);
                  const share = totalCost > 0 ? (cost / totalCost * 100) : 0;
                  const barWidth = topModel ? (cost / topModel[1] * 100) : 0;
                  return (
                    <div key={model} class="flex items-center gap-2 text-xs">
                      <span class="w-4 text-muted-foreground">{index + 1}</span>
                      <span class="flex-1 truncate" title={model}>{model}</span>
                      <span class="w-14 text-right">${cost.toFixed(2)}</span>
                      <span class="w-10 text-right text-muted-foreground">{share.toFixed(1)}%</span>
                      <div class="w-14 h-2 bg-muted rounded overflow-hidden">
                        <div class="h-full bg-green-500 rounded" style={{ width: `${barWidth}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Tool Breakdown */}
      {agentUsage && Object.keys(agentUsage.features).length > 0 && (
        <Card class="mb-4">
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
