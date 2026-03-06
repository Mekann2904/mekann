/*
 * .pi/lib/agent/benchmark-store.ts
 * エージェント比較用の benchmark run 履歴を永続化する。
 * Prompt Stack や Model Adapter の変更を実測で比較できるようにするために存在する。
 * 関連ファイル: .pi/lib/agent/benchmark-harness.ts, .pi/lib/storage/sqlite-state-store.ts, .pi/lib/storage/state-keys.ts, tests/unit/lib/benchmark-store.test.ts
 */

import {
  compareBenchmarkVariants,
  type AgentBenchmarkComparison,
  type AgentBenchmarkRun,
} from "./benchmark-harness.js";
import { readJsonState, writeJsonState } from "../storage/sqlite-state-store.js";
import { getAgentBenchmarkStateKey } from "../storage/state-keys.js";

const MAX_BENCHMARK_RUNS = 500;

/**
 * benchmark 履歴ストア。
 * @summary benchmark 履歴
 */
export interface AgentBenchmarkStore {
  runs: AgentBenchmarkRun[];
}

/**
 * benchmark run を保存する。
 * @summary benchmark run 保存
 * @param cwd 作業ディレクトリ
 * @param run 保存する run
 */
export function recordAgentBenchmarkRun(cwd: string, run: AgentBenchmarkRun): void {
  const stateKey = getAgentBenchmarkStateKey(cwd);
  const current = readJsonState<AgentBenchmarkStore>({
    stateKey,
    createDefault: () => ({ runs: [] }),
  });

  const nextRuns = [...current.runs, run].slice(-MAX_BENCHMARK_RUNS);
  writeJsonState({
    stateKey,
    value: {
      runs: nextRuns,
    },
  });
}

/**
 * benchmark 履歴を読む。
 * @summary benchmark 履歴読込
 * @param cwd 作業ディレクトリ
 * @returns 履歴
 */
export function loadAgentBenchmarkStore(cwd: string): AgentBenchmarkStore {
  return readJsonState<AgentBenchmarkStore>({
    stateKey: getAgentBenchmarkStateKey(cwd),
    createDefault: () => ({ runs: [] }),
  });
}

/**
 * 保存済み run から variant 比較を作る。
 * @summary benchmark 比較読込
 * @param cwd 作業ディレクトリ
 * @returns 比較結果
 */
export function loadAgentBenchmarkComparison(cwd: string): AgentBenchmarkComparison {
  const store = loadAgentBenchmarkStore(cwd);
  return compareBenchmarkVariants(store.runs);
}
