import { useState, useEffect } from "preact/hooks";
import { Router, route } from "preact-router";
import { ThemePage } from "./components/theme-page";
import { DashboardPage } from "./components/dashboard-page";
import {
  Activity,
  BarChart3,
  Settings,
  Palette,
  Loader2,
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

export function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
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
          <ThemePage path="/theme" />
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
