/**
 * @abdd.meta
 * path: .pi/tests/extensions/subagents/tool-executor-subagent.test.ts
 * role: ツール実行サブエージェント定義の単体テスト
 * why: サブエージェント定義の整合性と登録機能の正確性を保証するため
 * related: .pi/extensions/subagents/tool-executor-subagent.ts
 * public_api: なし（テストファイル）
 * invariants: テストは冪等で独立している
 * side_effects: なし（テスト環境）
 * failure_modes: テスト失敗時は実装のバグを示す
 * @abdd.explain
 * overview: tool-executor-subagent.tsの公開APIに対する単体テスト
 * what_it_does:
 *   - TOOL_EXECUTOR_SUBAGENT: 定数の整合性をテスト
 *   - ensureToolExecutorSubagent: 登録関数の動作をテスト
 * why_it_exists: ツール実行サブエージェントの正確性を検証するため
 * scope:
 *   in: tool-executor-subagent.tsの公開関数と定数
 *   out: テスト結果
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  TOOL_EXECUTOR_SUBAGENT,
  ensureToolExecutorSubagent,
} from "../../../extensions/subagents/tool-executor-subagent.js";
import type { SubagentDefinition } from "../../../extensions/subagents/storage.js";

describe("TOOL_EXECUTOR_SUBAGENT", () => {
  it("should have correct id", () => {
    expect(TOOL_EXECUTOR_SUBAGENT.id).toBe("tool-executor");
  });

  it("should have correct name", () => {
    expect(TOOL_EXECUTOR_SUBAGENT.name).toBe("Tool Executor");
  });

  it("should have a description", () => {
    expect(TOOL_EXECUTOR_SUBAGENT.description).toBeDefined();
    expect(TOOL_EXECUTOR_SUBAGENT.description.length).toBeGreaterThan(0);
  });

  it("should have a systemPrompt", () => {
    expect(TOOL_EXECUTOR_SUBAGENT.systemPrompt).toBeDefined();
    expect(TOOL_EXECUTOR_SUBAGENT.systemPrompt.length).toBeGreaterThan(0);
  });

  it("should have systemPrompt with JSON output format requirements", () => {
    expect(TOOL_EXECUTOR_SUBAGENT.systemPrompt).toContain("JSON");
    expect(TOOL_EXECUTOR_SUBAGENT.systemPrompt).toContain("compilationId");
    expect(TOOL_EXECUTOR_SUBAGENT.systemPrompt).toContain("toolResults");
  });

  it("should have enabled set to 'enabled'", () => {
    expect(TOOL_EXECUTOR_SUBAGENT.enabled).toBe("enabled");
  });

  it("should have valid createdAt as ISO date string", () => {
    const date = new Date(TOOL_EXECUTOR_SUBAGENT.createdAt);
    expect(date).toBeInstanceOf(Date);
    expect(isNaN(date.getTime())).toBe(false);
  });

  it("should have valid updatedAt as ISO date string", () => {
    const date = new Date(TOOL_EXECUTOR_SUBAGENT.updatedAt);
    expect(date).toBeInstanceOf(Date);
    expect(isNaN(date.getTime())).toBe(false);
  });
});

describe("ensureToolExecutorSubagent", () => {
  let mockStorage: { agents: SubagentDefinition[] };

  beforeEach(() => {
    mockStorage = { agents: [] };
  });

  it("should add tool-executor subagent when not exists", () => {
    expect(mockStorage.agents.length).toBe(0);

    ensureToolExecutorSubagent(mockStorage);

    expect(mockStorage.agents.length).toBe(1);
    expect(mockStorage.agents[0].id).toBe("tool-executor");
  });

  it("should add exact TOOL_EXECUTOR_SUBAGENT definition", () => {
    ensureToolExecutorSubagent(mockStorage);

    const added = mockStorage.agents[0];
    expect(added.id).toBe(TOOL_EXECUTOR_SUBAGENT.id);
    expect(added.name).toBe(TOOL_EXECUTOR_SUBAGENT.name);
    expect(added.description).toBe(TOOL_EXECUTOR_SUBAGENT.description);
    expect(added.systemPrompt).toBe(TOOL_EXECUTOR_SUBAGENT.systemPrompt);
    expect(added.enabled).toBe(TOOL_EXECUTOR_SUBAGENT.enabled);
  });

  it("should NOT add duplicate when tool-executor already exists", () => {
    // Add first time
    ensureToolExecutorSubagent(mockStorage);
    expect(mockStorage.agents.length).toBe(1);

    // Add second time - should not duplicate
    ensureToolExecutorSubagent(mockStorage);
    expect(mockStorage.agents.length).toBe(1);
  });

  it("should NOT add when storage already has tool-executor with different content", () => {
    // Pre-populate with a different tool-executor
    mockStorage.agents.push({
      id: "tool-executor",
      name: "Different Tool Executor",
      description: "Different description",
      systemPrompt: "Different prompt",
      enabled: "disabled",
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
    });

    const originalAgent = { ...mockStorage.agents[0] };

    ensureToolExecutorSubagent(mockStorage);

    // Should not modify existing entry
    expect(mockStorage.agents.length).toBe(1);
    expect(mockStorage.agents[0]).toEqual(originalAgent);
  });

  it("should handle storage with other agents present", () => {
    // Pre-populate with other agents
    mockStorage.agents.push({
      id: "other-agent",
      name: "Other Agent",
      description: "Other description",
      systemPrompt: "Other prompt",
      enabled: "enabled",
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
    });

    ensureToolExecutorSubagent(mockStorage);

    expect(mockStorage.agents.length).toBe(2);
    const toolExecutor = mockStorage.agents.find((a) => a.id === "tool-executor");
    expect(toolExecutor).toBeDefined();
    expect(toolExecutor?.name).toBe("Tool Executor");
  });
});
