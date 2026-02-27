/**
 * @path .pi/extensions/web-ui/web/src/app.tsx
 * @role Web UI全体のレイアウト、ルーティング、SSE同期を管理する。
 * @why ダッシュボード表示とリアルタイム更新を1箇所で安全に制御するため。
 * @related ./components/dashboard-page.tsx, ./components/theme-page.tsx, ./main.tsx
 */

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "preact/hooks";
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
  AlertCircle,
} from "lucide-preact";
import { cn } from "@/lib/utils";
import "./styles/globals.css";

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
 * @returns Object with connection state, reconnect function, and exhausted flag
 */
function useSSE(
  onEvent: (event: SSEEvent) => void
): { connected: boolean; reconnect: () => void; exhausted: boolean } {
  const [connected, setConnected] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const reconnectRef = useRef<(() => void) | null>(null);
  const connectionIdRef = useRef(0); // Track connection instances

  useEffect(() => {
    const currentConnectionId = ++connectionIdRef.current;
    let eventSource: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const reconnectDelay = 3000;

    const connect = () => {
      // Check if this connection is still current
      if (currentConnectionId !== connectionIdRef.current) {
        return;
      }

      try {
        eventSource = new EventSource("/api/events");

        eventSource.onopen = () => {
          if (currentConnectionId !== connectionIdRef.current) {
            eventSource?.close();
            return;
          }
          reconnectAttempts = 0;
          setExhausted(false);
          setConnected(true);
        };

        eventSource.onerror = () => {
          if (currentConnectionId !== connectionIdRef.current) {
            return;
          }
          setConnected(false);
          eventSource?.close();
          eventSource = null;

          // Auto-reconnect with exponential backoff
          if (reconnectAttempts < maxReconnectAttempts) {
            const delay = reconnectDelay * Math.pow(2, reconnectAttempts);
            reconnectTimeout = setTimeout(() => {
              if (currentConnectionId === connectionIdRef.current) {
                reconnectAttempts++;
                connect();
              }
            }, delay);
          } else {
            // Max attempts reached, mark as exhausted
            setExhausted(true);
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
        if (currentConnectionId === connectionIdRef.current) {
          setConnected(false);
          setExhausted(true);
        }
      }
    };

    // Store reconnect function for external access
    reconnectRef.current = () => {
      if (currentConnectionId !== connectionIdRef.current) {
        return;
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      reconnectAttempts = 0;
      setExhausted(false);
      connect();
    };

    connect();

    return () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      eventSource?.close();
      setConnected(false);
    };
  }, [onEvent]);

  const reconnect = useCallback(() => {
    reconnectRef.current?.();
  }, []);

  return { connected, reconnect, exhausted };
}

export function App() {
  const [themeLoaded, setThemeLoaded] = useState(false);

  // Initialize theme on mount
  useLayoutEffect(() => {
    initializeTheme().then(() => {
      setThemeLoaded(true);
    });
  }, []);

  // SSE event handler (for connection status only)
  const handleSSEEvent = useCallback((_event: SSEEvent) => {
    // SSE is used for connection status indicator only.
    // Individual pages poll /api endpoints for data (simpler, more reliable).
    // Future: Could add SSE-driven updates for real-time data if needed.
  }, []);

  // Connect to SSE
  const { connected: sseConnected, reconnect: sseReconnect, exhausted: sseExhausted } = useSSE(handleSSEEvent);

  if (!themeLoaded) {
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
      <Sidebar sseConnected={sseConnected} sseExhausted={sseExhausted} onSseReconnect={sseReconnect} />
      <main class="flex-1 overflow-hidden">
        <Router>
          <DashboardPage path="/" />
          <InstancesPage path="/instances" />
          <McpPage path="/mcp" />
          <ThemePage path="/theme" onThemeChange={applyTheme} />
        </Router>
      </main>
    </div>
  );
}

interface SidebarProps {
  sseConnected: boolean;
  sseExhausted: boolean;
  onSseReconnect: () => void;
}

function Sidebar({ sseConnected, sseExhausted, onSseReconnect }: SidebarProps) {
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
      {/* Connection status indicator */}
      <div class="flex flex-col items-center gap-1 pb-3">
        {sseExhausted ? (
          <button
            onClick={onSseReconnect}
            class="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/20 text-destructive hover:bg-destructive/30 transition-colors"
            title="SSE disconnected - Click to reconnect"
          >
            <AlertCircle class="h-4 w-4" />
          </button>
        ) : !sseConnected ? (
          <div
            class="flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-500/20 text-yellow-500"
            title="SSE connecting..."
          >
            <Loader2 class="h-4 w-4 animate-spin" />
          </div>
        ) : (
          <div
            class="h-2 w-2 rounded-full bg-green-500 animate-pulse"
            title="SSE connected"
          />
        )}
      </div>
    </nav>
  );
}
