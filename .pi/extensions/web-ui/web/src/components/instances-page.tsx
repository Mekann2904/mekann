import { useState, useEffect } from "preact/hooks";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Activity, Cpu, Folder, Clock, RefreshCw, Monitor } from "lucide-preact";
import { cn } from "@/lib/utils";

/**
 * Instance information from API
 */
interface InstanceInfo {
  pid: number;
  startedAt: number;
  cwd: string;
  model: string;
  lastHeartbeat: number;
}

interface InstancesResponse {
  instances: InstanceInfo[];
  count: number;
  serverPid: number;
  serverPort: number;
}

/**
 * Format relative time
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 1000) return "just now";
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

/**
 * Format duration
 */
function formatDuration(startTime: number): string {
  const diff = Date.now() - startTime;

  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Truncate path for display
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

export function InstancesPage() {
  const [data, setData] = useState<InstancesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);

    try {
      const res = await fetch("/api/instances");
      if (!res.ok) throw new Error("Failed to fetch instances");
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div class="flex h-full items-center justify-center">
        <div class="flex flex-col items-center gap-2">
          <RefreshCw class="h-6 w-6 animate-spin text-primary" />
          <p class="text-sm text-muted-foreground">Loading instances...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div class="flex h-full items-center justify-center">
        <Card class="w-96">
          <CardHeader>
            <CardTitle class="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p class="text-sm text-muted-foreground">{error}</p>
            <Button class="mt-4" onClick={() => fetchData(true)}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const instances = data?.instances || [];
  const sortedInstances = [...instances].sort((a, b) => b.startedAt - a.startedAt);

  return (
    <div class="flex h-full flex-col gap-4 p-4">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold">Instances</h1>
          <p class="text-sm text-muted-foreground">
            {data?.count ?? 0} active instance{(data?.count ?? 0) !== 1 ? "s" : ""}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchData(true)}
          disabled={refreshing}
        >
          <RefreshCw class={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Server Info */}
      {data && (
        <Card>
          <CardContent class="flex items-center gap-4 py-4">
            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Monitor class="h-5 w-5 text-primary" />
            </div>
            <div class="flex-1">
              <p class="text-sm font-medium">Web UI Server</p>
              <p class="text-xs text-muted-foreground">
                PID: {data.serverPid} | Port: {data.serverPort}
              </p>
            </div>
            <a
              href={`http://localhost:${data.serverPort}`}
              target="_blank"
              rel="noopener noreferrer"
              class="text-sm text-primary hover:underline"
            >
              Open in Browser
            </a>
          </CardContent>
        </Card>
      )}

      {/* Instances List */}
      <div class="flex-1 space-y-3 overflow-y-auto">
        {sortedInstances.length === 0 ? (
          <Card>
            <CardContent class="flex flex-col items-center justify-center py-12">
              <Activity class="h-12 w-12 text-muted-foreground/50" />
              <p class="mt-4 text-sm text-muted-foreground">No instances found</p>
            </CardContent>
          </Card>
        ) : (
          sortedInstances.map((instance) => (
            <Card key={instance.pid}>
              <CardContent class="py-4">
                <div class="flex items-start gap-4">
                  {/* Icon */}
                  <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Cpu class="h-5 w-5 text-primary" />
                  </div>

                  {/* Info */}
                  <div class="min-w-0 flex-1">
                    {/* PID & Model */}
                    <div class="flex items-center gap-2">
                      <span class="font-mono text-sm font-medium">
                        PID {instance.pid}
                      </span>
                      <span class="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {instance.model}
                      </span>
                    </div>

                    {/* Path */}
                    <div class="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Folder class="h-3 w-3" />
                      <span class="truncate" title={instance.cwd}>
                        {truncatePath(instance.cwd, 50)}
                      </span>
                    </div>

                    {/* Times */}
                    <div class="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                      <div class="flex items-center gap-1">
                        <Clock class="h-3 w-3" />
                        <span>Started {formatRelativeTime(instance.startedAt)}</span>
                      </div>
                      <div class="flex items-center gap-1">
                        <Activity class="h-3 w-3" />
                        <span>Running {formatDuration(instance.startedAt)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Status Indicator */}
                  <div class="flex items-center gap-2">
                    <div class="h-2 w-2 animate-pulse rounded-full bg-green-500" />
                    <span class="text-xs text-muted-foreground">Active</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
