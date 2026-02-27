interface MetricsProps {
  metrics: {
    toolCalls: number;
    errors: number;
    avgResponseTime: number;
  };
}

export function MetricsChart({ metrics }: MetricsProps) {
  const errorRate = metrics.toolCalls > 0
    ? ((metrics.errors / metrics.toolCalls) * 100).toFixed(1)
    : "0";

  return (
    <div class="metrics-chart">
      <div class="metric-card">
        <h3>Tool Calls</h3>
        <p class="metric-value">{metrics.toolCalls}</p>
      </div>

      <div class="metric-card">
        <h3>Errors</h3>
        <p class="metric-value error">{metrics.errors}</p>
        <p class="metric-sub">Error rate: {errorRate}%</p>
      </div>

      <div class="metric-card">
        <h3>Avg Response Time</h3>
        <p class="metric-value">{metrics.avgResponseTime}ms</p>
      </div>

      <div class="chart-placeholder">
        <p>Metrics visualization</p>
        <p class="sub">Chart library integration (Chart.js/Recharts) coming soon</p>
      </div>
    </div>
  );
}
