import { useState, useEffect } from "preact/hooks";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
} from "./ui/card";
import {
  Server,
  Wrench,
  Database,
  RefreshCw,
  Plug,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
} from "lucide-preact";
import { cn } from "@/lib/utils";

// Types matching server response
interface McpConnectionInfo {
  id: string;
  name: string;
  url: string;
  status: "connecting" | "connected" | "disconnected" | "error";
  transportType?: string;
  toolsCount: number;
  resourcesCount: number;
  error?: string;
  connectedAt?: string;
  serverInfo?: { name: string; version: string };
}

interface McpConnectionsResponse {
  connections: McpConnectionInfo[];
  count: number;
}

interface McpConnectionDetail extends McpConnectionInfo {
  tools: Array<{
    name: string;
    description?: string;
    inputSchema: Record<string, unknown>;
  }>;
  resources: Array<{
    uri: string;
    name: string;
    mimeType?: string;
    description?: string;
  }>;
  subscriptions: string[];
}

// Status badge component
function StatusBadge({ status }: { status: McpConnectionInfo["status"] }) {
  const config = {
    connecting: { icon: Loader2, color: "text-yellow-500", label: "Connecting", animate: true },
    connected: { icon: CheckCircle2, color: "text-green-500", label: "Connected", animate: false },
    disconnected: { icon: XCircle, color: "text-gray-500", label: "Disconnected", animate: false },
    error: { icon: AlertCircle, color: "text-red-500", label: "Error", animate: false },
  };
  const { icon: Icon, color, label, animate } = config[status];

  return (
    <div class="flex items-center gap-1.5">
      <Icon class={cn("h-4 w-4", color, animate && "animate-spin")} />
      <span class={cn("text-xs font-medium", color)}>{label}</span>
    </div>
  );
}

// Connection card component
function ConnectionCard({
  connection,
  onExpand,
  isExpanded,
  detail,
}: {
  connection: McpConnectionInfo;
  onExpand: () => void;
  isExpanded: boolean;
  detail?: McpConnectionDetail;
}) {
  return (
    <Card>
      <CardContent class="py-4">
        <div class="flex items-start gap-4">
          {/* Icon */}
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Server class="h-5 w-5 text-primary" />
          </div>

          {/* Info */}
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="font-medium">{connection.name || connection.id}</span>
              <StatusBadge status={connection.status} />
            </div>

            <div class="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span class="truncate font-mono" title={connection.url}>
                {connection.url}
              </span>
              {connection.transportType && (
                <span class="rounded bg-muted px-1.5 py-0.5">
                  {connection.transportType}
                </span>
              )}
            </div>

            {/* Stats */}
            <div class="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
              <div class="flex items-center gap-1">
                <Wrench class="h-3 w-3" />
                <span>{connection.toolsCount} tools</span>
              </div>
              <div class="flex items-center gap-1">
                <Database class="h-3 w-3" />
                <span>{connection.resourcesCount} resources</span>
              </div>
            </div>

            {/* Server Info */}
            {connection.serverInfo && (
              <div class="mt-1 text-xs text-muted-foreground">
                {connection.serverInfo.name} v{connection.serverInfo.version}
              </div>
            )}

            {/* Error */}
            {connection.error && (
              <div class="mt-2 rounded bg-destructive/10 p-2 text-xs text-destructive">
                {connection.error}
              </div>
            )}
          </div>

          {/* Expand Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onExpand}
            disabled={connection.status !== "connected"}
          >
            {isExpanded ? (
              <ChevronDown class="h-4 w-4" />
            ) : (
              <ChevronRight class="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Expanded Detail */}
        {isExpanded && detail && (
          <div class="mt-4 border-t pt-4">
            {/* Tools */}
            <div class="mb-4">
              <h4 class="mb-2 text-sm font-medium">Tools ({detail.tools.length})</h4>
              <div class="space-y-2">
                {detail.tools.map((tool) => (
                  <div
                    key={tool.name}
                    class="rounded border p-2 text-sm"
                  >
                    <div class="font-mono text-xs">{tool.name}</div>
                    {tool.description && (
                      <div class="mt-1 text-xs text-muted-foreground">
                        {tool.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Resources */}
            <div>
              <h4 class="mb-2 text-sm font-medium">
                Resources ({detail.resources.length})
              </h4>
              <div class="space-y-2">
                {detail.resources.map((resource) => (
                  <div
                    key={resource.uri}
                    class="rounded border p-2 text-sm"
                  >
                    <div class="truncate font-mono text-xs">{resource.uri}</div>
                    <div class="mt-1 text-xs text-muted-foreground">
                      {resource.name}
                      {resource.mimeType && (
                        <span class="ml-2 rounded bg-muted px-1">
                          {resource.mimeType}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Tools view - aggregate all tools from all connections
function ToolsView({ connections }: { connections: McpConnectionInfo[] }) {
  const [tools, setTools] = useState<Array<{ connectionId: string; tool: { name: string; description?: string } }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAllTools = async () => {
      setLoading(true);
      const results: Array<{ connectionId: string; tool: { name: string; description?: string } }> = [];

      for (const conn of connections) {
        if (conn.status !== "connected") continue;
        try {
          const res = await fetch(`/api/mcp/tools/${conn.id}`);
          if (res.ok) {
            const json = await res.json();
            for (const tool of json.tools) {
              results.push({ connectionId: conn.id, tool });
            }
          }
        } catch (e) {
          console.error(`Failed to fetch tools for ${conn.id}:`, e);
        }
      }

      setTools(results);
      setLoading(false);
    };

    fetchAllTools();
  }, [connections]);

  if (loading) {
    return (
      <div class="flex items-center justify-center py-8">
        <Loader2 class="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardContent class="py-4">
        <h3 class="mb-3 text-sm font-medium">All Tools ({tools.length})</h3>
        <div class="space-y-2">
          {tools.map(({ connectionId, tool }) => (
            <div key={`${connectionId}-${tool.name}`} class="rounded border p-2">
              <div class="flex items-center gap-2">
                <span class="font-mono text-sm">{tool.name}</span>
                <span class="text-xs text-muted-foreground">({connectionId})</span>
              </div>
              {tool.description && (
                <p class="mt-1 text-xs text-muted-foreground">
                  {tool.description}
                </p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Resources view - aggregate all resources from all connections
function ResourcesView({ connections }: { connections: McpConnectionInfo[] }) {
  const [resources, setResources] = useState<Array<{ connectionId: string; resource: { uri: string; name: string; mimeType?: string } }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAllResources = async () => {
      setLoading(true);
      const results: Array<{ connectionId: string; resource: { uri: string; name: string; mimeType?: string } }> = [];

      for (const conn of connections) {
        if (conn.status !== "connected") continue;
        try {
          const res = await fetch(`/api/mcp/resources/${conn.id}`);
          if (res.ok) {
            const json = await res.json();
            for (const resource of json.resources || []) {
              results.push({ connectionId: conn.id, resource });
            }
          }
        } catch (e) {
          console.error(`Failed to fetch resources for ${conn.id}:`, e);
        }
      }

      setResources(results);
      setLoading(false);
    };

    fetchAllResources();
  }, [connections]);

  if (loading) {
    return (
      <div class="flex items-center justify-center py-8">
        <Loader2 class="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardContent class="py-4">
        <h3 class="mb-3 text-sm font-medium">All Resources ({resources.length})</h3>
        <div class="space-y-2">
          {resources.map(({ connectionId, resource }) => (
            <div key={`${connectionId}-${resource.uri}`} class="rounded border p-2">
              <div class="truncate font-mono text-sm" title={resource.uri}>
                {resource.uri}
              </div>
              <div class="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{resource.name}</span>
                <span class="text-muted-foreground">({connectionId})</span>
                {resource.mimeType && (
                  <span class="rounded bg-muted px-1">{resource.mimeType}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Main page component
export function McpPage() {
  const [data, setData] = useState<McpConnectionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<McpConnectionDetail | null>(null);
  const [activeTab, setActiveTab] = useState<"connections" | "tools" | "resources">(
    "connections"
  );

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);

    try {
      const res = await fetch("/api/mcp/connections");
      if (!res.ok) throw new Error("Failed to fetch connections");
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

  const fetchDetail = async (id: string) => {
    try {
      const res = await fetch(`/api/mcp/connection/${id}`);
      if (res.ok) {
        const json = await res.json();
        setDetail(json);
      }
    } catch (e) {
      console.error("Failed to fetch detail:", e);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (expandedId) {
      fetchDetail(expandedId);
    } else {
      setDetail(null);
    }
  }, [expandedId]);

  if (loading) {
    return (
      <div class="flex h-full items-center justify-center">
        <div class="flex flex-col items-center gap-2">
          <Loader2 class="h-6 w-6 animate-spin text-primary" />
          <p class="text-sm text-muted-foreground">Loading MCP...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div class="flex h-full items-center justify-center p-4">
        <Card class="w-96">
          <CardContent class="py-4">
            <h3 class="mb-2 font-medium text-destructive">Error</h3>
            <p class="text-sm text-muted-foreground">{error}</p>
            <Button class="mt-4" onClick={() => fetchData(true)}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const connections = data?.connections || [];

  return (
    <div class="flex h-full flex-col gap-4 p-4">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold">MCP Connections</h1>
          <p class="text-sm text-muted-foreground">
            {data?.count ?? 0} connection{(data?.count ?? 0) !== 1 ? "s" : ""}
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

      {/* Tabs */}
      <div class="flex gap-2">
        <Button
          variant={activeTab === "connections" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("connections")}
        >
          <Plug class="mr-2 h-4 w-4" />
          Connections
        </Button>
        <Button
          variant={activeTab === "tools" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("tools")}
        >
          <Wrench class="mr-2 h-4 w-4" />
          All Tools
        </Button>
        <Button
          variant={activeTab === "resources" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("resources")}
        >
          <Database class="mr-2 h-4 w-4" />
          All Resources
        </Button>
      </div>

      {/* Content */}
      <div class="flex-1 space-y-3 overflow-y-auto">
        {connections.length === 0 ? (
          <Card>
            <CardContent class="flex flex-col items-center justify-center py-12">
              <Server class="h-12 w-12 text-muted-foreground/50" />
              <p class="mt-4 text-sm text-muted-foreground">
                No MCP connections configured
              </p>
              <p class="mt-1 text-xs text-muted-foreground">
                Add servers to .pi/mcp-servers.json
              </p>
            </CardContent>
          </Card>
        ) : activeTab === "connections" ? (
          connections.map((conn) => (
            <ConnectionCard
              key={conn.id}
              connection={conn}
              isExpanded={expandedId === conn.id}
              onExpand={() =>
                setExpandedId(expandedId === conn.id ? null : conn.id)
              }
              detail={expandedId === conn.id ? detail ?? undefined : undefined}
            />
          ))
        ) : activeTab === "tools" ? (
          <ToolsView connections={connections} />
        ) : (
          <ResourcesView connections={connections} />
        )}
      </div>
    </div>
  );
}
