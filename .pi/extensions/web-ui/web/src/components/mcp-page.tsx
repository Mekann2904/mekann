import { useState, useEffect, useMemo } from "preact/hooks";
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
  PlugZap,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Power,
  PowerOff,
  Circle,
} from "lucide-preact";
import { cn } from "@/lib/utils";

// Types matching server response (from /api/mcp/servers)
interface McpServerInfo {
  id: string;
  name: string;
  url: string;
  description?: string;
  enabled: boolean;
  transportType?: string;
  // Connection status
  status: "connecting" | "connected" | "disconnected" | "error";
  toolsCount: number;
  resourcesCount: number;
  error?: string;
  connectedAt?: string;
  serverInfo?: { name: string; version: string };
}

interface McpServersResponse {
  servers: McpServerInfo[];
  count: number;
}

interface McpConnectionDetail {
  id: string;
  name: string;
  url: string;
  status: string;
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
function StatusBadge({ status, enabled }: { status: McpServerInfo["status"]; enabled: boolean }) {
  if (!enabled) {
    return (
      <div class="flex items-center gap-1.5">
        <Circle class="h-4 w-4 text-gray-400" />
        <span class="text-xs font-medium text-gray-400">Disabled</span>
      </div>
    );
  }

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

// Server card component with connect/disconnect buttons
function ServerCard({
  server,
  onExpand,
  isExpanded,
  detail,
  onConnect,
  onDisconnect,
  isConnecting,
  isDisconnecting,
}: {
  server: McpServerInfo;
  onExpand: () => void;
  isExpanded: boolean;
  detail?: McpConnectionDetail;
  onConnect: () => void;
  onDisconnect: () => void;
  isConnecting: boolean;
  isDisconnecting: boolean;
}) {
  const isConnected = server.status === "connected";
  const isConnectingState = server.status === "connecting" || isConnecting;

  return (
    <Card class={cn(!server.enabled && "opacity-60")}>
      <CardContent class="py-4">
        <div class="flex items-start gap-4">
          {/* Icon */}
          <div class={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            isConnected ? "bg-primary/10" : "bg-muted"
          )}>
            <Server class={cn("h-5 w-5", isConnected ? "text-primary" : "text-muted-foreground")} />
          </div>

          {/* Info */}
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="font-medium">{server.name || server.id}</span>
              <StatusBadge status={server.status} enabled={server.enabled} />
            </div>

            {server.description && (
              <div class="mt-0.5 text-xs text-muted-foreground">
                {server.description}
              </div>
            )}

            <div class="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span class="truncate font-mono" title={server.url}>
                {server.url}
              </span>
              {server.transportType && (
                <span class="rounded bg-muted px-1.5 py-0.5">
                  {server.transportType}
                </span>
              )}
            </div>

            {/* Stats (only show when connected) */}
            {isConnected && (
              <div class="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                <div class="flex items-center gap-1">
                  <Wrench class="h-3 w-3" />
                  <span>{server.toolsCount} tools</span>
                </div>
                <div class="flex items-center gap-1">
                  <Database class="h-3 w-3" />
                  <span>{server.resourcesCount} resources</span>
                </div>
              </div>
            )}

            {/* Server Info */}
            {server.serverInfo && (
              <div class="mt-1 text-xs text-muted-foreground">
                {server.serverInfo.name} v{server.serverInfo.version}
              </div>
            )}

            {/* Error */}
            {server.error && (
              <div class="mt-2 rounded bg-destructive/10 p-2 text-xs text-destructive">
                {server.error}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div class="flex items-center gap-1">
            {/* Connect/Disconnect Button */}
            {server.enabled && (
              isConnected ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onDisconnect}
                  disabled={isDisconnecting}
                  title="Disconnect"
                >
                  {isDisconnecting ? (
                    <Loader2 class="h-4 w-4 animate-spin" />
                  ) : (
                    <PowerOff class="h-4 w-4" />
                  )}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onConnect}
                  disabled={isConnectingState}
                  title="Connect"
                >
                  {isConnectingState ? (
                    <Loader2 class="h-4 w-4 animate-spin" />
                  ) : (
                    <Power class="h-4 w-4" />
                  )}
                </Button>
              )
            )}

            {/* Expand Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={onExpand}
              disabled={!isConnected}
              title="View details"
            >
              {isExpanded ? (
                <ChevronDown class="h-4 w-4" />
              ) : (
                <ChevronRight class="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Expanded Detail */}
        {isExpanded && detail && (
          <div class="mt-4 border-t pt-4">
            {/* Tools */}
            <div class="mb-4">
              <h4 class="mb-2 text-sm font-medium">Tools ({detail.tools.length})</h4>
              <div class="space-y-2 max-h-60 overflow-y-auto">
                {detail.tools.length === 0 ? (
                  <div class="text-xs text-muted-foreground">No tools available</div>
                ) : (
                  detail.tools.map((tool) => (
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
                  ))
                )}
              </div>
            </div>

            {/* Resources */}
            <div>
              <h4 class="mb-2 text-sm font-medium">
                Resources ({detail.resources.length})
              </h4>
              <div class="space-y-2 max-h-60 overflow-y-auto">
                {detail.resources.length === 0 ? (
                  <div class="text-xs text-muted-foreground">No resources available</div>
                ) : (
                  detail.resources.map((resource) => (
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
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Tools view - aggregate all tools from connected servers
function ToolsView({ servers }: { servers: McpServerInfo[] }) {
  const [tools, setTools] = useState<Array<{ serverId: string; tool: { name: string; description?: string } }>>([]);
  const [loading, setLoading] = useState(true);

  const connectedServers = servers.filter(s => s.status === "connected");
  const connectedServerIds = useMemo(
    () => connectedServers.map(s => s.id),
    [connectedServers]
  );

  useEffect(() => {
    const fetchAllTools = async () => {
      setLoading(true);
      const results: Array<{ serverId: string; tool: { name: string; description?: string } }> = [];

      for (const server of connectedServers) {
        try {
          const res = await fetch(`/api/mcp/tools/${server.id}`);
          if (res.ok) {
            const json = await res.json();
            for (const tool of json.tools) {
              results.push({ serverId: server.id, tool });
            }
          }
        } catch (e) {
          console.error(`Failed to fetch tools for ${server.id}:`, e);
        }
      }

      setTools(results);
      setLoading(false);
    };

    fetchAllTools();
  }, [connectedServerIds]);

  if (connectedServers.length === 0) {
    return (
      <Card>
        <CardContent class="py-8">
          <div class="flex flex-col items-center justify-center text-center">
            <PlugZap class="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p class="text-sm text-muted-foreground">No connected servers</p>
            <p class="text-xs text-muted-foreground mt-1">Connect to a server to view tools</p>
          </div>
        </CardContent>
      </Card>
    );
  }

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
        {tools.length === 0 ? (
          <div class="text-xs text-muted-foreground">No tools available from connected servers</div>
        ) : (
          <div class="space-y-2 max-h-[60vh] overflow-y-auto">
            {tools.map(({ serverId, tool }) => (
              <div key={`${serverId}-${tool.name}`} class="rounded border p-2">
                <div class="flex items-center gap-2">
                  <span class="font-mono text-sm">{tool.name}</span>
                  <span class="text-xs text-muted-foreground">({serverId})</span>
                </div>
                {tool.description && (
                  <p class="mt-1 text-xs text-muted-foreground">
                    {tool.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Resources view - aggregate all resources from connected servers
function ResourcesView({ servers }: { servers: McpServerInfo[] }) {
  const [resources, setResources] = useState<Array<{ serverId: string; resource: { uri: string; name: string; mimeType?: string } }>>([]);
  const [loading, setLoading] = useState(true);

  const connectedServers = servers.filter(s => s.status === "connected");
  const connectedServerIds = useMemo(
    () => connectedServers.map(s => s.id),
    [connectedServers]
  );

  useEffect(() => {
    const fetchAllResources = async () => {
      setLoading(true);
      const results: Array<{ serverId: string; resource: { uri: string; name: string; mimeType?: string } }> = [];

      for (const server of connectedServers) {
        try {
          const res = await fetch(`/api/mcp/resources/${server.id}`);
          if (res.ok) {
            const json = await res.json();
            for (const resource of json.resources || []) {
              results.push({ serverId: server.id, resource });
            }
          }
        } catch (e) {
          console.error(`Failed to fetch resources for ${server.id}:`, e);
        }
      }

      setResources(results);
      setLoading(false);
    };

    fetchAllResources();
  }, [connectedServerIds]);

  if (connectedServers.length === 0) {
    return (
      <Card>
        <CardContent class="py-8">
          <div class="flex flex-col items-center justify-center text-center">
            <PlugZap class="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p class="text-sm text-muted-foreground">No connected servers</p>
            <p class="text-xs text-muted-foreground mt-1">Connect to a server to view resources</p>
          </div>
        </CardContent>
      </Card>
    );
  }

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
        {resources.length === 0 ? (
          <div class="text-xs text-muted-foreground">No resources available from connected servers</div>
        ) : (
          <div class="space-y-2 max-h-[60vh] overflow-y-auto">
            {resources.map(({ serverId, resource }) => (
              <div key={`${serverId}-${resource.uri}`} class="rounded border p-2">
                <div class="truncate font-mono text-sm" title={resource.uri}>
                  {resource.uri}
                </div>
                <div class="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{resource.name}</span>
                  <span class="text-muted-foreground">({serverId})</span>
                  {resource.mimeType && (
                    <span class="rounded bg-muted px-1">{resource.mimeType}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Main page component
export function McpPage() {
  const [data, setData] = useState<McpServersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<McpConnectionDetail | null>(null);
  const [activeTab, setActiveTab] = useState<"servers" | "tools" | "resources">("servers");
  const [actionInProgress, setActionInProgress] = useState<Record<string, "connect" | "disconnect" | null>>({});

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);

    try {
      // Use /api/mcp/servers to get all servers (including disconnected)
      const res = await fetch("/api/mcp/servers");
      if (!res.ok) throw new Error("Failed to fetch servers");
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

  const handleConnect = async (serverId: string) => {
    setActionInProgress(prev => ({ ...prev, [serverId]: "connect" }));
    try {
      const res = await fetch(`/api/mcp/connect/${serverId}`, { method: "POST" });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.details || json.error || "Connect failed");
      }
      // Refresh data after successful connect
      await fetchData();
    } catch (e) {
      console.error("Connect failed:", e);
      // Show error in UI (could use a toast notification)
    } finally {
      setActionInProgress(prev => ({ ...prev, [serverId]: null }));
    }
  };

  const handleDisconnect = async (serverId: string) => {
    setActionInProgress(prev => ({ ...prev, [serverId]: "disconnect" }));
    try {
      const res = await fetch(`/api/mcp/disconnect/${serverId}`, { method: "POST" });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.details || json.error || "Disconnect failed");
      }
      // Clear expanded state if disconnecting the expanded server
      if (expandedId === serverId) {
        setExpandedId(null);
        setDetail(null);
      }
      // Refresh data after successful disconnect
      await fetchData();
    } catch (e) {
      console.error("Disconnect failed:", e);
    } finally {
      setActionInProgress(prev => ({ ...prev, [serverId]: null }));
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

  const servers = data?.servers || [];
  const connectedCount = servers.filter(s => s.status === "connected").length;
  const enabledCount = servers.filter(s => s.enabled).length;

  return (
    <div class="flex h-full flex-col gap-4 p-4">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold">MCP Servers</h1>
          <p class="text-sm text-muted-foreground">
            {connectedCount} / {enabledCount} connected ({servers.length} total)
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
          variant={activeTab === "servers" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("servers")}
        >
          <Server class="mr-2 h-4 w-4" />
          Servers
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
        {servers.length === 0 ? (
          <Card>
            <CardContent class="flex flex-col items-center justify-center py-12">
              <Server class="h-12 w-12 text-muted-foreground/50" />
              <p class="mt-4 text-sm text-muted-foreground">
                No MCP servers configured
              </p>
              <p class="mt-1 text-xs text-muted-foreground">
                Add servers to .pi/mcp-servers.json
              </p>
            </CardContent>
          </Card>
        ) : activeTab === "servers" ? (
          servers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              isExpanded={expandedId === server.id}
              onExpand={() =>
                setExpandedId(expandedId === server.id ? null : server.id)
              }
              detail={expandedId === server.id ? detail ?? undefined : undefined}
              onConnect={() => handleConnect(server.id)}
              onDisconnect={() => handleDisconnect(server.id)}
              isConnecting={actionInProgress[server.id] === "connect"}
              isDisconnecting={actionInProgress[server.id] === "disconnect"}
            />
          ))
        ) : activeTab === "tools" ? (
          <ToolsView servers={servers} />
        ) : (
          <ResourcesView servers={servers} />
        )}
      </div>
    </div>
  );
}
