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
import { BarChart2, Loader2, RefreshCw } from "lucide-preact";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

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
 * @summary チャート設定
 */
const chartConfig = {
  input: {
    label: "Input Tokens",
    color: "hsl(var(--chart-1))",
  },
  output: {
    label: "Output Tokens",
    color: "hsl(var(--chart-2))",
  },
};

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
    return (
      <div class="flex h-full items-center justify-center p-8">
        <div class="flex flex-col items-center gap-2">
          <Loader2 class="h-6 w-6 animate-spin text-primary" />
          <p class="text-sm text-muted-foreground">Loading context history...</p>
        </div>
      </div>
    );
  }

  return (
    <div class="h-full overflow-auto p-6">
      <div class="mx-auto max-w-4xl space-y-6">
        {/* ヘッダー */}
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <BarChart2 class="h-6 w-6 text-primary" />
            <h1 class="text-2xl font-semibold">Context Usage</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
            class="flex items-center gap-2"
          >
            <RefreshCw class={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {/* エラー表示 */}
        {error && (
          <div class="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            Error: {error}
          </div>
        )}

        {/* 統計カード */}
        <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Card>
            <CardHeader class="pb-2">
              <CardTitle class="text-sm font-medium text-muted-foreground">
                Total Input
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div class="text-2xl font-bold">
                {stats.totalInput.toLocaleString()}
              </div>
              <p class="text-xs text-muted-foreground">tokens</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader class="pb-2">
              <CardTitle class="text-sm font-medium text-muted-foreground">
                Total Output
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div class="text-2xl font-bold">
                {stats.totalOutput.toLocaleString()}
              </div>
              <p class="text-xs text-muted-foreground">tokens</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader class="pb-2">
              <CardTitle class="text-sm font-medium text-muted-foreground">
                Avg Input
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div class="text-2xl font-bold">{stats.avgInput.toLocaleString()}</div>
              <p class="text-xs text-muted-foreground">tokens/req</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader class="pb-2">
              <CardTitle class="text-sm font-medium text-muted-foreground">
                Avg Output
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div class="text-2xl font-bold">
                {stats.avgOutput.toLocaleString()}
              </div>
              <p class="text-xs text-muted-foreground">tokens/req</p>
            </CardContent>
          </Card>
        </div>

        {/* 表示モード切り替え */}
        <div class="flex gap-2">
          <Button
            variant={displayMode === "input" ? "default" : "outline"}
            size="sm"
            onClick={() => setDisplayMode("input")}
          >
            Input Only
          </Button>
          <Button
            variant={displayMode === "output" ? "default" : "outline"}
            size="sm"
            onClick={() => setDisplayMode("output")}
          >
            Output Only
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
        <Card>
          <CardHeader>
            <CardTitle>Token Usage Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div class="flex h-[300px] items-center justify-center text-muted-foreground">
                No context history data available
              </div>
            ) : (
              <div class="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" class="stroke-border" />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 12 }}
                      class="text-muted-foreground"
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      class="text-muted-foreground"
                      tickFormatter={(value: number) => value.toLocaleString()}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                    />
                    {(displayMode === "input" || displayMode === "both") && (
                      <Bar
                        dataKey="input"
                        name="Input"
                        fill="hsl(var(--chart-1))"
                        radius={[4, 4, 0, 0]}
                      />
                    )}
                    {(displayMode === "output" || displayMode === "both") && (
                      <Bar
                        dataKey="output"
                        name="Output"
                        fill="hsl(var(--chart-2))"
                        radius={[4, 4, 0, 0]}
                      />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* データテーブル（オプション） */}
        {chartData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Recent Requests</CardTitle>
            </CardHeader>
            <CardContent>
              <div class="max-h-[200px] overflow-auto">
                <table class="w-full text-sm">
                  <thead class="sticky top-0 bg-card">
                    <tr class="border-b">
                      <th class="px-4 py-2 text-left font-medium">Time</th>
                      <th class="px-4 py-2 text-right font-medium">Input</th>
                      <th class="px-4 py-2 text-right font-medium">Output</th>
                      <th class="px-4 py-2 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartData
                      .slice()
                      .reverse()
                      .slice(0, 10)
                      .map((entry, index) => (
                        <tr key={index} class="border-b">
                          <td class="px-4 py-2 text-muted-foreground">
                            {entry.time}
                          </td>
                          <td class="px-4 py-2 text-right">
                            {entry.input.toLocaleString()}
                          </td>
                          <td class="px-4 py-2 text-right">
                            {entry.output.toLocaleString()}
                          </td>
                          <td class="px-4 py-2 text-right font-medium">
                            {(entry.input + entry.output).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
