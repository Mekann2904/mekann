import { useState, useEffect } from "preact/hooks";
import { StatusCard } from "./components/status-card";
import { ConfigPanel } from "./components/config-panel";
import { MetricsChart } from "./components/metrics-chart";

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
  const [activeTab, setActiveTab] = useState<"status" | "metrics" | "config">("status");

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
      <div class="loading">
        <div class="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div class="app">
      <header class="header">
        <h1>pi Dashboard</h1>
        <nav class="tabs">
          <button
            class={activeTab === "status" ? "active" : ""}
            onClick={() => setActiveTab("status")}
          >
            Status
          </button>
          <button
            class={activeTab === "metrics" ? "active" : ""}
            onClick={() => setActiveTab("metrics")}
          >
            Metrics
          </button>
          <button
            class={activeTab === "config" ? "active" : ""}
            onClick={() => setActiveTab("config")}
          >
            Config
          </button>
        </nav>
      </header>

      <main class="content">
        {activeTab === "status" && data && (
          <StatusCard status={data.status} />
        )}
        {activeTab === "metrics" && data && (
          <MetricsChart metrics={data.metrics} />
        )}
        {activeTab === "config" && data && (
          <ConfigPanel config={data.config} />
        )}
      </main>
    </div>
  );
}
