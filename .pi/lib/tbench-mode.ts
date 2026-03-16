// path: .pi/lib/tbench-mode.ts
// role: terminal-bench 実行中かどうかを判定する小さな共通ヘルパー
// why: benchmark 用の軽量動作を複数拡張で一貫して切り替えるため
// related: .pi/extensions/startup-context.ts, .pi/extensions/web-ui/index.ts, bench/tbench_pi_agent/harbor_pi_agent.py

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function isTruthyEnv(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return TRUE_VALUES.has(value.trim().toLowerCase());
}

export function isTerminalBenchMode(): boolean {
  return isTruthyEnv(process.env.PI_TBENCH_MODE) || isTruthyEnv(process.env.TBENCH);
}
