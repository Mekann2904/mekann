/**
 * @file .pi/lib/agent/benchmark-store.ts の単体テスト
 * @description benchmark run の保存と比較読込を検証する
 * @testFramework vitest
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = new Map<string, unknown>();

vi.mock("../../../.pi/lib/storage/sqlite-state-store.js", () => ({
  readJsonState: vi.fn(({ stateKey, createDefault }) => {
    if (state.has(stateKey)) {
      return state.get(stateKey);
    }
    const value = createDefault();
    state.set(stateKey, value);
    return value;
  }),
  writeJsonState: vi.fn(({ stateKey, value }) => {
    state.set(stateKey, value);
  }),
}));

import {
  loadAgentBenchmarkComparison,
  loadAgentBenchmarkStore,
  recordAgentBenchmarkRun,
} from "../../../.pi/lib/agent/benchmark-store.js";

describe("benchmark-store", () => {
  beforeEach(() => {
    state.clear();
  });

  it("benchmark run を保存して読み戻せる", () => {
    recordAgentBenchmarkRun("/tmp/project", {
      variantId: "openai/gpt-5",
      scenarioId: "subagent:demo",
      completed: true,
      toolCalls: 2,
      toolFailures: 0,
      retries: 0,
      emptyOutputs: 0,
      turns: 2,
    });

    const store = loadAgentBenchmarkStore("/tmp/project");
    expect(store.runs).toHaveLength(1);
    expect(store.runs[0]?.variantId).toBe("openai/gpt-5");
  });

  it("保存済み run から比較結果を作れる", () => {
    recordAgentBenchmarkRun("/tmp/project", {
      variantId: "openai/gpt-5",
      scenarioId: "loop:demo",
      completed: true,
      toolCalls: 3,
      toolFailures: 0,
      retries: 0,
      emptyOutputs: 0,
      turns: 3,
    });
    recordAgentBenchmarkRun("/tmp/project", {
      variantId: "anthropic/claude-sonnet-4-5",
      scenarioId: "loop:demo",
      completed: false,
      toolCalls: 3,
      toolFailures: 1,
      retries: 0,
      emptyOutputs: 1,
      turns: 3,
    });

    const comparison = loadAgentBenchmarkComparison("/tmp/project");
    expect(comparison.variants).toHaveLength(2);
    expect(comparison.bestVariant?.variantId).toBe("openai/gpt-5");
  });
});
