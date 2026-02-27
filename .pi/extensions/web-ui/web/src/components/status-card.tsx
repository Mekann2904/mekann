interface StatusProps {
  status: {
    model: string;
    cwd: string;
    contextUsage: number;
    totalTokens: number;
    cost: number;
  };
}

export function StatusCard({ status }: StatusProps) {
  const contextPercent = Math.round(status.contextUsage * 100);

  return (
    <div class="status-card">
      <div class="card">
        <h3>Model</h3>
        <p class="value">{status.model}</p>
      </div>

      <div class="card">
        <h3>Working Directory</h3>
        <p class="value mono">{status.cwd}</p>
      </div>

      <div class="card">
        <h3>Context Usage</h3>
        <div class="progress-bar">
          <div
            class="progress-fill"
            style={`width: ${contextPercent}%`}
          />
        </div>
        <p class="value">{contextPercent}%</p>
      </div>

      <div class="card">
        <h3>Tokens</h3>
        <p class="value">{status.totalTokens.toLocaleString()}</p>
      </div>

      <div class="card">
        <h3>Cost</h3>
        <p class="value">${status.cost.toFixed(4)}</p>
      </div>
    </div>
  );
}
