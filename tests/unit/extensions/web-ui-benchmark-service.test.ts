// path: tests/unit/extensions/web-ui-benchmark-service.test.ts
// what: Web UI benchmark service の解決ロジックを検証する
// why: cwd 解決と bestVariant 選択を安定化するため
// related: .pi/extensions/web-ui/src/services/benchmark-service.ts, .pi/lib/agent/benchmark-store.ts

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  instances: [] as Array<{ cwd: string; lastHeartbeat: number }>,
  knownInstances: {} as Record<number, { cwd?: string; lastHeartbeat?: number }>,
  store: {
    runs: [] as Array<{ variantId: string; scenarioId: string }>,
  },
  comparison: {
    variants: [] as Array<{
      variantId: string;
      runCount: number;
      scenarioCount: number;
      completionRate: number;
      toolFailureRate: number;
      retryRate: number;
      emptyOutputRate: number;
      averageTurns: number;
      averageLatencyMs: number;
      averagePromptTokens: number;
      averageRuntimeNotificationCount: number;
      averagePromptLayerTokens: {
        "tool-description": number;
        "system-policy": number;
        "startup-context": number;
        "runtime-notification": number;
      };
    }>,
    bestVariant: undefined as
      | {
          variantId: string;
          runCount: number;
          scenarioCount: number;
          completionRate: number;
          toolFailureRate: number;
          retryRate: number;
          emptyOutputRate: number;
          averageTurns: number;
          averageLatencyMs: number;
          averagePromptTokens: number;
          averageRuntimeNotificationCount: number;
          averagePromptLayerTokens: {
            "tool-description": number;
            "system-policy": number;
            "startup-context": number;
            "runtime-notification": number;
          };
        }
      | undefined,
  },
}));

vi.mock("../../../.pi/extensions/web-ui/src/services/instance-service.js", () => ({
  getInstanceService: () => ({
    list: () => mockState.instances,
  }),
}));

vi.mock("../../../.pi/lib/storage/sqlite-state-store.js", () => ({
  readJsonState: vi.fn(() => mockState.knownInstances),
}));

vi.mock("../../../.pi/lib/agent/benchmark-store.js", () => ({
  loadAgentBenchmarkStore: vi.fn(() => mockState.store),
  loadAgentBenchmarkComparison: vi.fn(() => mockState.comparison),
}));

import { loadBenchmarkStatus } from "../../../.pi/extensions/web-ui/src/services/benchmark-service.js";

function createVariant(variantId: string, completionRate: number) {
  return {
    variantId,
    runCount: 3,
    scenarioCount: 2,
    completionRate,
    toolFailureRate: 0,
    retryRate: 0,
    emptyOutputRate: 0,
    averageTurns: 2,
    averageLatencyMs: 0,
    averagePromptTokens: 100,
    averageRuntimeNotificationCount: 1,
    averagePromptLayerTokens: {
      "tool-description": 10,
      "system-policy": 20,
      "startup-context": 30,
      "runtime-notification": 40,
    },
  };
}

describe("web-ui benchmark service", () => {
  beforeEach(() => {
    mockState.instances = [];
    mockState.knownInstances = {};
    mockState.store = {
      runs: [],
    };
    mockState.comparison = {
      variants: [],
      bestVariant: undefined,
    };
  });

  it("最新のアクティブインスタンスの cwd を優先する", async () => {
    mockState.instances = [
      { cwd: "/repo/older", lastHeartbeat: 10 },
      { cwd: "/repo/latest", lastHeartbeat: 20 },
    ];

    const status = await loadBenchmarkStatus();

    expect(status.cwd).toBe("/repo/latest");
  });

  it("アクティブインスタンスがないときは保存済み cwd を使う", async () => {
    mockState.knownInstances = {
      1: { cwd: "/repo/old", lastHeartbeat: 10 },
      2: { cwd: "/repo/persisted", lastHeartbeat: 50 },
    };

    const status = await loadBenchmarkStatus();

    expect(status.cwd).toBe("/repo/persisted");
  });

  it("variant filter 時も comparison.bestVariant を保つ", async () => {
    const best = createVariant("sonnet-strict", 0.9);
    const other = createVariant("gpt5-strict", 0.8);

    mockState.comparison = {
      variants: [other, best],
      bestVariant: best,
    };
    mockState.store = {
      runs: [
        { variantId: "sonnet-strict", scenarioId: "s1" },
        { variantId: "gpt5-strict", scenarioId: "s2" },
      ],
    };

    const status = await loadBenchmarkStatus({ variantId: "sonnet" });

    expect(status.variants).toHaveLength(1);
    expect(status.variants[0]?.variantId).toBe("sonnet-strict");
    expect(status.bestVariant?.variantId).toBe("sonnet-strict");
  });

  it("recentRuns は limit を守って新しい順に返す", async () => {
    mockState.store = {
      runs: [
        { variantId: "a", scenarioId: "s1" },
        { variantId: "b", scenarioId: "s2" },
        { variantId: "c", scenarioId: "s3" },
      ],
    };

    const status = await loadBenchmarkStatus({ limit: 2 });

    expect(status.recentRuns.map((item) => item.scenarioId)).toEqual(["s3", "s2"]);
  });
});
