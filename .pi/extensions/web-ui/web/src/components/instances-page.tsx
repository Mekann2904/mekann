/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/components/instances-page.tsx
 * @role piインスタンス一覧ページ
 * @why 稼働中のpiインスタンスを監視・管理するため
 * @related app.tsx, server.ts
 * @public_api InstancesPage
 * @invariants データはAPIとSSEでリアルタイム更新
 * @side_effects /api/instances, /api/events にアクセス
 * @failure_modes API unavailable, SSE切断
 *
 * @abdd.explain
 * @overview 稼働中のpiインスタンスを一覧表示
 * @what_it_does インスタンス情報を取得し、ステータス付きで表示
 * @why_it_exists 複数のpiインスタンスを把握・監視するため
 * @scope(in) API data, SSE events
 * @scope(out) Rendered instance list
 */

import { h } from "preact";
import { useState, useEffect, useCallback, useRef } from "preact/hooks";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
} from "./ui/card";
import { Activity, Cpu, Folder, Clock, RefreshCw, Monitor, Wifi, WifiOff } from "lucide-preact";
import { cn } from "@/lib/utils";
import {
  PageLayout,
  PageHeader,
  LoadingState,
  ErrorBanner,
  EmptyState,
  TYPOGRAPHY,
  CARD_STYLES,
  PATTERNS,
  SPACING,
  STATE_STYLES,
} from "./layout";

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

/**
 * Get instance status based on heartbeat
 */
function getInstanceStatus(instance: InstanceInfo): "active" | "stale" | "dead" {
  const timeSinceHeartbeat = Date.now() - instance.lastHeartbeat;
  if (timeSinceHeartbeat < 30000) return "active";
  if (timeSinceHeartbeat < 60000) return "stale";
  return "dead";
}

export function InstancesPage() {
  const [data, setData] = useState<InstancesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    // Handle instances-update event
    eventSource.addEventListener("instances-update", (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as { instances: InstanceInfo[]; count: number };
        setData((prev) => ({
          instances: payload.instances,
          count: payload.count,
          serverPid: prev?.serverPid ?? 0,
          serverPort: prev?.serverPort ?? 3456,
        }));
      } catch (e) {
        console.warn("[InstancesPage] Failed to parse instances-update:", e);
      }
    });

    return () => {
      eventSource.close();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    fetchData();
    const cleanup = connectSSE();
    return cleanup;
  }, [connectSSE]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const instances = data?.instances || [];
  const sortedInstances = [...instances].sort((a, b) => b.startedAt - a.startedAt);

  // Header description
  const headerDescription = `${data?.count ?? 0} active instance${(data?.count ?? 0) !== 1 ? "s" : ""}`;

  return (
    <PageLayout variant="default">
      {/* Header */}
      <PageHeader
        title="Instances"
        description={headerDescription}
        actions={
          <div class={cn("flex items-center", SPACING.element)}>
            {/* SSE Connection Status */}
            <div class={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded",
              PATTERNS.badge,
              sseConnected ? cn(STATE_STYLES.success.bg, STATE_STYLES.success.text) : cn(STATE_STYLES.warning.bg, STATE_STYLES.warning.text)
            )}>
              {sseConnected ? <Wifi class="h-3 w-3" /> : <WifiOff class="h-3 w-3" />}
              <span>{sseConnected ? "Live" : "Polling"}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchData(true)}
              disabled={refreshing}
            >
              <RefreshCw class={cn("h-4 w-4", refreshing && "animate-spin")} />
            </Button>
          </div>
        }
      />

      {/* Loading */}
      {loading && <LoadingState message="Loading instances..." />}

      {/* Error */}
      {error && (
        <ErrorBanner
          message={`Error: ${error}`}
          onRetry={() => fetchData()}
          onDismiss={() => setError(null)}
        />
      )}

      {/* Server Info */}
      {data && !loading && (
        <Card>
          <CardContent class={cn("flex items-center", SPACING.element, "py-4")}>
            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Monitor class="h-5 w-5 text-primary" />
            </div>
            <div class="flex-1">
              <p class={TYPOGRAPHY.labelLarge}>Web UI Server</p>
              <p class={TYPOGRAPHY.muted}>
                PID: {data.serverPid} | Port: {data.serverPort}
              </p>
            </div>
            <a
              href={`http://localhost:${data.serverPort}`}
              target="_blank"
              rel="noopener noreferrer"
              class={cn(TYPOGRAPHY.body, "text-primary hover:underline")}
            >
              Open in Browser
            </a>
          </CardContent>
        </Card>
      )}

      {/* Instances List */}
      <div class={cn("flex-1", SPACING.element, "overflow-y-auto")}>
        {sortedInstances.length === 0 && !loading ? (
          <EmptyState
            message="No instances found"
            icon={Activity}
          />
        ) : (
          sortedInstances.map((instance) => {
            const status = getInstanceStatus(instance);
            const isStale = status !== "active";

            return (
              <Card key={instance.pid} class={cn(isStale && "opacity-60")}>
                <CardContent class="py-4">
                  <div class={cn("flex items-start", SPACING.element)}>
                    {/* Icon */}
                    <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Cpu class="h-5 w-5 text-primary" />
                    </div>

                    {/* Info */}
                    <div class="min-w-0 flex-1">
                      {/* PID & Model */}
                      <div class={cn("flex items-center", SPACING.element)}>
                        <span class={cn(PATTERNS.mono, TYPOGRAPHY.labelLarge)}>
                          PID {instance.pid}
                        </span>
                        <span class={cn(PATTERNS.badge, "bg-muted", TYPOGRAPHY.muted)}>
                          {instance.model}
                        </span>
                      </div>

                      {/* Path */}
                      <div class={cn("mt-1 flex items-center", SPACING.tight, TYPOGRAPHY.muted)}>
                        <Folder class="h-3 w-3" />
                        <span class="truncate" title={instance.cwd}>
                          {truncatePath(instance.cwd, 50)}
                        </span>
                      </div>

                      {/* Times */}
                      <div class={cn("mt-2 flex items-center", SPACING.element, TYPOGRAPHY.muted)}>
                        <div class={cn("flex items-center", SPACING.tight)}>
                          <Clock class="h-3 w-3" />
                          <span>Started {formatRelativeTime(instance.startedAt)}</span>
                        </div>
                        <div class={cn("flex items-center", SPACING.tight)}>
                          <Activity class="h-3 w-3" />
                          <span>Running {formatDuration(instance.startedAt)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Status Indicator */}
                    <div class={cn("flex items-center", SPACING.element)}>
                      {status === "active" && (
                        <>
                          <div class="h-2 w-2 animate-pulse rounded-full bg-green-500" />
                          <span class={TYPOGRAPHY.muted}>Active</span>
                        </>
                      )}
                      {status === "stale" && (
                        <>
                          <div class="h-2 w-2 rounded-full bg-yellow-500" />
                          <span class={STATE_STYLES.warning.text}>Stale</span>
                        </>
                      )}
                      {status === "dead" && (
                        <>
                          <div class="h-2 w-2 rounded-full bg-red-500" />
                          <span class={STATE_STYLES.error.text}>Disconnected</span>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </PageLayout>
  );
}
