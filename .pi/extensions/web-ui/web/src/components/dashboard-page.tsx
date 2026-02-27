import { useState } from "preact/hooks";
import { Activity, BarChart3, Settings, RefreshCw } from "lucide-preact";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Progress } from "./ui/progress";

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

export function DashboardPage({ data }: DashboardPageProps) {
  const [activeTab, setActiveTab] = useState<"status" | "metrics" | "config">(
    "status"
  );

  if (!data) {
    return (
      <div class="flex h-full items-center justify-center p-4">
        <p class="text-muted-foreground">No data available</p>
      </div>
    );
  }

  return (
    <div class="flex h-full flex-col gap-4 p-4">
      {/* Tabs */}
      <div class="flex gap-2">
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

      {/* Content */}
      <div class="flex-1 overflow-y-auto">
        {activeTab === "status" && <StatusSection data={data} />}
        {activeTab === "metrics" && <MetricsSection data={data} />}
        {activeTab === "config" && <ConfigSection data={data} />}
      </div>
    </div>
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
