import { useState, useEffect, useLayoutEffect } from "preact/hooks";
import { Router, route } from "preact-router";
import { ThemePage, applyThemeToDOM, type Mode } from "./components/theme-page";
import { DashboardPage } from "./components/dashboard-page";
import { InstancesPage } from "./components/instances-page";
import { McpPage } from "./components/mcp-page";
import {
  Activity,
  Monitor,
  Palette,
  Loader2,
  Server,
} from "lucide-preact";
import { cn } from "@/lib/utils";
import "./styles/globals.css";

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

interface ThemeSettings {
  themeId: string;
  mode: Mode;
}

/**
 * @summary SSE event types matching server-side SSEEventType
 */
type SSEEventType = "status" | "tool-call" | "response" | "heartbeat" | "connected";

/**
 * @summary SSE event structure from server
 */
interface SSEEvent {
  type: SSEEventType;
  data: Record<string, unknown>;
  timestamp: number;
}

// Global theme state (fetched from server)
let globalTheme: ThemeSettings | null = null;

// Get global theme from server
async function fetchGlobalTheme(): Promise<ThemeSettings | null> {
  try {
    const res = await fetch("/api/theme");
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn("Failed to fetch global theme:", e);
  }
  return null;
}

// Save global theme to server
async function saveGlobalTheme(themeId: string, mode: Mode): Promise<boolean> {
  try {
    const res = await fetch("/api/theme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ themeId, mode }),
    });
    return res.ok;
  } catch (e) {
    console.warn("Failed to save global theme:", e);
    return false;
  }
}

// Initialize theme from global settings
async function initializeTheme(): Promise<ThemeSettings> {
  // Try to get global theme first
  const theme = await fetchGlobalTheme();
  if (theme) {
    globalTheme = theme;
    applyThemeToDOM(theme.themeId, theme.mode);
    return theme;
  }

  // Fallback to localStorage
  const themeId = localStorage.getItem("pi-theme-id") || "blue";
  const mode = (localStorage.getItem("pi-theme-mode") as Mode) || "dark";
  applyThemeToDOM(themeId, mode);
  return { themeId, mode };
}

// Apply theme to DOM (exported for theme-page)
export function applyTheme(themeId: string, mode: Mode): void {
  applyThemeToDOM(themeId, mode);
  saveGlobalTheme(themeId, mode);
  globalTheme = { themeId, mode };
}

/**
 * @summary Custom hook for SSE connection with auto-reconnect
 */
function useSSE(onEvent: (event: SSEEvent) => void) {
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const reconnectDelay = 3000;

    const connect = () => {
      try {
        eventSource = new EventSource("/api/events");

        eventSource.onopen = () => {
          reconnectAttempts = 0;
        };

        eventSource.onerror = () => {
          eventSource?.close();
          eventSource = null;

          // Auto-reconnect with exponential backoff
          if (reconnectAttempts < maxReconnectAttempts) {
            const delay = reconnectDelay * Math.pow(2, reconnectAttempts);
            reconnectTimeout = setTimeout(() => {
              reconnectAttempts++;
              connect();
            }, delay);
          }
        };

        // Handle all event types
        const eventTypes: SSEEventType[] = ["status", "tool-call", "response", "heartbeat", "connected"];
        eventTypes.forEach((eventType) => {
          eventSource?.addEventListener(eventType, (e) => {
            try {
              const data = JSON.parse((e as MessageEvent).data);
              onEvent({ type: eventType, data, timestamp: Date.now() });
            } catch {
              // Ignore parse errors
            }
          });
        });
      } catch {
        // SSE not supported or connection failed
      }
    };

    connect();

    return () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      eventSource?.close();
    };
  }, [onEvent]);
}

export function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [themeLoaded, setThemeLoaded] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);

  // Initialize theme on mount
  useLayoutEffect(() => {
    initializeTheme().then(() => {
      setThemeLoaded(true);
    });
  }, []);

  // SSE event handler
  const handleSSEEvent = (event: SSEEvent) => {
    if (event.type === "connected") {
      setSseConnected(true);
      return;
    }

    if (event.type === "heartbeat") {
      return; // Ignore heartbeat events
    }

    // Update dashboard data from SSE events
    if (event.type === "status" || event.type === "response") {
      setData((prevData) => ({
        status: {
          model: (event.data.model as string) ?? prevData?.status.model ?? "unknown",
          cwd: (event.data.cwd as string) ?? prevData?.status.cwd ?? "",
          contextUsage: (event.data.contextUsage as number) ?? prevData?.status.contextUsage ?? 0,
          totalTokens: (event.data.totalTokens as number) ?? prevData?.status.totalTokens ?? 0,
          cost: prevData?.status.cost ?? 0,
        },
        metrics: prevData?.metrics ?? { toolCalls: 0, errors: 0, avgResponseTime: 0 },
        config: prevData?.config ?? {},
      }));
    }

    if (event.type === "tool-call") {
      setData((prevData) => ({
        status: prevData?.status ?? { model: "unknown", cwd: "", contextUsage: 0, totalTokens: 0, cost: 0 },
        metrics: {
          toolCalls: (prevData?.metrics.toolCalls ?? 0) + 1,
          errors: prevData?.metrics.errors ?? 0,
          avgResponseTime: prevData?.metrics.avgResponseTime ?? 0,
        },
        config: prevData?.config ?? {},
      }));
    }
  };

  // Connect to SSE
  useSSE(handleSSEEvent);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/status");
        const json = await res.json();
        setData(json);
      } catch (e) {
        console.error("Failed to fetch data:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Polling as fallback (only if SSE not connected)
    const interval = setInterval(() => {
      if (!sseConnected) {
        fetchData();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [sseConnected]);

  if (!themeLoaded || loading) {
    return (
      <div class="flex h-screen items-center justify-center">
        <div class="flex flex-col items-center gap-2">
          <Loader2 class="h-6 w-6 animate-spin text-primary" />
          <p class="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div class="flex h-screen bg-background">
      <Sidebar />
      <main class="flex-1 overflow-hidden">
        <Router>
          <DashboardPage path="/" data={data} />
          <InstancesPage path="/instances" />
          <McpPage path="/mcp" />
          <ThemePage path="/theme" onThemeChange={applyTheme} />
        </Router>
      </main>
    </div>
  );
}

function Sidebar() {
  const [currentPath, setCurrentPath] = useState(
    typeof window !== "undefined" ? window.location.pathname : "/"
  );

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = (path: string) => {
    route(path);
    setCurrentPath(path);
  };

  const navItems = [
    { path: "/", icon: Activity, label: "Dashboard" },
    { path: "/instances", icon: Monitor, label: "Instances" },
    { path: "/mcp", icon: Server, label: "MCP" },
    { path: "/theme", icon: Palette, label: "Theme" },
  ];

  return (
    <nav class="flex h-full w-12 shrink-0 flex-col border-r bg-card">
      <div class="flex flex-1 flex-col items-center gap-2 py-3">
        {navItems.map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            class={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
              currentPath === item.path
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
            title={item.label}
          >
            <item.icon class="h-4 w-4" />
          </button>
        ))}
      </div>
    </nav>
  );
}
