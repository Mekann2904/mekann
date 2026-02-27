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

export function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [themeLoaded, setThemeLoaded] = useState(false);

  // Initialize theme on mount
  useLayoutEffect(() => {
    initializeTheme().then(() => {
      setThemeLoaded(true);
    });
  }, []);

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
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

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
