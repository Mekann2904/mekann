/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/services/benchmark-service.ts
 * @role agent benchmark 比較結果の取得サービス
 * @why loop/subagent の benchmark 履歴を Web UI へ渡すため
 * @related routes/benchmark.ts, schemas/benchmark.schema.ts, ../../../../lib/agent/benchmark-store.ts
 * @public_api loadBenchmarkStatus
 */

import { readJsonState } from "../../../../lib/storage/sqlite-state-store.js";
import {
  loadAgentBenchmarkComparison,
  loadAgentBenchmarkStore,
} from "../../../../lib/agent/benchmark-store.js";
import { getInstanceService } from "./instance-service.js";
import type { BenchmarkStatusDto } from "../schemas/benchmark.schema.js";

function resolveBenchmarkCwd(): string {
  const instances = getInstanceService().list();
  if (instances.length > 0) {
    const latest = [...instances].sort((a, b) => b.lastHeartbeat - a.lastHeartbeat)[0];
    return latest?.cwd || process.cwd();
  }

  const knownInstances = readJsonState<Record<number, { cwd?: string; lastHeartbeat?: number }>>({
    stateKey: "webui_instances",
    createDefault: () => ({}),
  });
  const persisted = Object.values(knownInstances).sort(
    (a, b) => (b.lastHeartbeat || 0) - (a.lastHeartbeat || 0),
  )[0];

  return persisted?.cwd || process.cwd();
}

export async function loadBenchmarkStatus(input?: {
  cwd?: string;
  limit?: number;
  variantId?: string;
}): Promise<BenchmarkStatusDto> {
  const cwd = input?.cwd || resolveBenchmarkCwd();
  const limit = Math.max(1, Math.min(100, Math.trunc(input?.limit ?? 20)));
  const variantFilter = input?.variantId?.trim() || "";

  const store = loadAgentBenchmarkStore(cwd);
  const comparison = loadAgentBenchmarkComparison(cwd);

  const variants = variantFilter
    ? comparison.variants.filter((item) => item.variantId.includes(variantFilter))
    : comparison.variants;
  const recentRuns = (variantFilter
    ? store.runs.filter((item) => item.variantId.includes(variantFilter))
    : store.runs
  ).slice(-limit).reverse();
  const bestVariant = variantFilter
    ? variants.find((item) => item.variantId === comparison.bestVariant?.variantId) ?? variants[0] ?? null
    : comparison.bestVariant ?? null;

  return {
    cwd,
    variants,
    recentRuns,
    bestVariant,
  };
}
