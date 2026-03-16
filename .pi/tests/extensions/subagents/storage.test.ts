/**
 * @abdd.meta
 * path: .pi/tests/extensions/subagents/storage.test.ts
 * role: サブエージェントストレージモジュールの単体テスト
 * why: ストレージ操作の正確性と整合性を保証するため
 * related: .pi/extensions/subagents/storage.ts
 * public_api: なし（テストファイル）
 * invariants: テストは冪等で独立している
 * side_effects: 一時ディレクトリへの書き込み（テスト環境）
 * failure_modes: テスト失敗時は実装のバグを示す
 * @abdd.explain
 * overview: storage.tsの公開関数に対する単体テスト
 * what_it_does:
 *   - createDefaultAgents: デフォルトエージェント生成をテスト
 *   - loadStorage/saveStorage: ストレージ読み書きをテスト
 *   - 型定義の整合性をテスト
 * why_it_exists: ストレージ操作の信頼性を検証するため
 * scope:
 *   in: storage.tsの公開関数
 *   out: テスト結果
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createDefaultAgents,
  loadStorage,
  saveStorage,
  MAX_RUNS_TO_KEEP,
  SUBAGENT_DEFAULTS_VERSION,
  type SubagentDefinition,
  type SubagentStorage,
} from "../../../extensions/subagents/storage.js";

describe("createDefaultAgents", () => {
  it("should create an array of default agents", () => {
    const agents = createDefaultAgents("2024-01-01T00:00:00Z");
    expect(Array.isArray(agents)).toBe(true);
    expect(agents.length).toBeGreaterThan(0);
  });

  it("should create agents with required fields", () => {
    const agents = createDefaultAgents("2024-01-01T00:00:00Z");
    for (const agent of agents) {
      expect(agent.id).toBeDefined();
      expect(agent.name).toBeDefined();
      expect(agent.description).toBeDefined();
      expect(agent.systemPrompt).toBeDefined();
      expect(agent.enabled).toBeDefined();
      expect(agent.createdAt).toBeDefined();
      expect(agent.updatedAt).toBeDefined();
    }
  });

  it("should set timestamps to the provided ISO string", () => {
    const timestamp = "2024-01-01T00:00:00Z";
    const agents = createDefaultAgents(timestamp);
    for (const agent of agents) {
      expect(agent.createdAt).toBe(timestamp);
      expect(agent.updatedAt).toBe(timestamp);
    }
  });

  it("should create implementer agent", () => {
    const agents = createDefaultAgents("2024-01-01T00:00:00Z");
    const implementer = agents.find((a) => a.id === "implementer");
    expect(implementer).toBeDefined();
    expect(implementer?.name).toContain("Implementer");
  });

  it("should create researcher agent", () => {
    const agents = createDefaultAgents("2024-01-01T00:00:00Z");
    const researcher = agents.find((a) => a.id === "researcher");
    expect(researcher).toBeDefined();
    expect(researcher?.name).toContain("Researcher");
  });

  it("should create reviewer agent", () => {
    const agents = createDefaultAgents("2024-01-01T00:00:00Z");
    const reviewer = agents.find((a) => a.id === "reviewer");
    expect(reviewer).toBeDefined();
    expect(reviewer?.name).toContain("Reviewer");
  });

  it("should create architect agent", () => {
    const agents = createDefaultAgents("2024-01-01T00:00:00Z");
    const architect = agents.find((a) => a.id === "architect");
    expect(architect).toBeDefined();
    expect(architect?.name).toContain("Architect");
  });
});

describe("loadStorage and saveStorage", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `subagent-storage-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should create new storage if not exists", () => {
    const storage = loadStorage(tempDir);
    expect(storage).toBeDefined();
    expect(storage.agents).toBeDefined();
    expect(Array.isArray(storage.agents)).toBe(true);
  });

  it("should save and load storage", () => {
    const storage: SubagentStorage = {
      agents: [
        {
          id: "test-agent",
          name: "Test Agent",
          description: "A test agent",
          systemPrompt: "Test prompt",
          enabled: "enabled",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
        },
      ],
      runs: [],
      version: SUBAGENT_DEFAULTS_VERSION,
    };

    saveStorage(tempDir, storage);
    const loaded = loadStorage(tempDir);

    // デフォルトエージェント + テストエージェントが含まれる
    const testAgent = loaded.agents.find((a) => a.id === "test-agent");
    expect(testAgent).toBeDefined();
    expect(testAgent?.name).toBe("Test Agent");
  });

  it("should preserve run records", () => {
    const storage: SubagentStorage = {
      agents: [],
      runs: [
        {
          runId: "run-1",
          agentId: "test-agent",
          task: "task-1",
          summary: "Test output",
          status: "completed",
          startedAt: "2024-01-01T00:00:00Z",
          finishedAt: "2024-01-01T00:01:00Z",
          latencyMs: 60000,
          outputFile: "test-output.json",
        },
      ],
      version: SUBAGENT_DEFAULTS_VERSION,
    };

    saveStorage(tempDir, storage);
    const loaded = loadStorage(tempDir);

    expect(loaded.runs.length).toBe(1);
    expect(loaded.runs[0].runId).toBe("run-1");
  });

  it("should prune old runs when exceeding MAX_RUNS_TO_KEEP", () => {
    const runs = Array.from({ length: MAX_RUNS_TO_KEEP + 50 }, (_, i) => ({
      id: `run-${i}`,
      subagentId: "test-agent",
      taskId: `task-${i}`,
      status: "completed" as const,
      startedAt: `2024-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`,
      completedAt: `2024-01-${String((i % 28) + 1).padStart(2, "0")}T00:01:00Z`,
      output: `Output ${i}`,
    }));

    const storage: SubagentStorage = {
      agents: [],
      runs,
      version: SUBAGENT_DEFAULTS_VERSION,
    };

    saveStorage(tempDir, storage);
    const loaded = loadStorage(tempDir);

    expect(loaded.runs.length).toBeLessThanOrEqual(MAX_RUNS_TO_KEEP);
  });
});

describe("constants", () => {
  it("MAX_RUNS_TO_KEEP should be a positive number", () => {
    expect(MAX_RUNS_TO_KEEP).toBeGreaterThan(0);
    expect(typeof MAX_RUNS_TO_KEEP).toBe("number");
  });

  it("SUBAGENT_DEFAULTS_VERSION should be a positive number", () => {
    expect(SUBAGENT_DEFAULTS_VERSION).toBeGreaterThan(0);
    expect(typeof SUBAGENT_DEFAULTS_VERSION).toBe("number");
  });
});

describe("SubagentDefinition type", () => {
  it("should accept valid definition", () => {
    const definition: SubagentDefinition = {
      id: "test",
      name: "Test",
      description: "Test agent",
      systemPrompt: "Test prompt",
      enabled: true,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };

    expect(definition.id).toBe("test");
  });

  it("should accept optional provider and model", () => {
    const definition: SubagentDefinition = {
      id: "test",
      name: "Test",
      description: "Test agent",
      systemPrompt: "Test prompt",
      enabled: true,
      provider: "anthropic",
      model: "claude-3-sonnet",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };

    expect(definition.provider).toBe("anthropic");
    expect(definition.model).toBe("claude-3-sonnet");
  });

  it("should accept optional skills", () => {
    const definition: SubagentDefinition = {
      id: "test",
      name: "Test",
      description: "Test agent",
      systemPrompt: "Test prompt",
      enabled: true,
      skills: ["git-workflow", "code-review"],
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };

    expect(definition.skills).toEqual(["git-workflow", "code-review"]);
  });
});

describe("saveStorageWithPatterns", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `subagent-storage-pattern-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should save storage and not throw on pattern extraction", async () => {
    const { saveStorageWithPatterns } = await import(
      "../../../extensions/subagents/storage.js"
    );

    const storage: SubagentStorage = {
      version: SUBAGENT_DEFAULTS_VERSION,
      agents: createDefaultAgents("2024-01-01T00:00:00Z"),
      runs: [
        {
          runId: "test-run-1",
          agentId: "implementer",
          task: "テストタスク",
          summary: "テスト完了",
          status: "completed",
          startedAt: "2024-01-01T00:00:00Z",
          finishedAt: "2024-01-01T00:01:00Z",
          error: null,
        },
      ],
      customAgents: [],
    };

    // Should not throw even if pattern extraction has issues
    await expect(saveStorageWithPatterns(tempDir, storage)).resolves.not.toThrow();
  });

  it("should handle empty runs array", async () => {
    const { saveStorageWithPatterns } = await import(
      "../../../extensions/subagents/storage.js"
    );

    const storage: SubagentStorage = {
      version: SUBAGENT_DEFAULTS_VERSION,
      agents: createDefaultAgents("2024-01-01T00:00:00Z"),
      runs: [],
      customAgents: [],
    };

    await expect(saveStorageWithPatterns(tempDir, storage)).resolves.not.toThrow();
  });

  it("should handle runs with missing fields gracefully", async () => {
    const { saveStorageWithPatterns } = await import(
      "../../../extensions/subagents/storage.js"
    );

    const storage: SubagentStorage = {
      version: SUBAGENT_DEFAULTS_VERSION,
      agents: createDefaultAgents("2024-01-01T00:00:00Z"),
      runs: [
        {
          runId: "incomplete-run",
          agentId: "implementer",
          task: "タスク",
          summary: null,
          status: "failed",
          startedAt: "2024-01-01T00:00:00Z",
          finishedAt: null,
          error: "エラー",
        },
      ],
      customAgents: [],
    };

    await expect(saveStorageWithPatterns(tempDir, storage)).resolves.not.toThrow();
  });

  it("should persist storage even if pattern extraction fails", async () => {
    const { saveStorageWithPatterns } = await import(
      "../../../extensions/subagents/storage.js"
    );

    const storage: SubagentStorage = {
      version: SUBAGENT_DEFAULTS_VERSION,
      agents: createDefaultAgents("2024-01-01T00:00:00Z"),
      runs: [
        {
          runId: "run-persist-test",
          agentId: "implementer",
          task: "永続化テスト",
          summary: "テスト",
          status: "completed",
          startedAt: "2024-01-01T00:00:00Z",
          finishedAt: "2024-01-01T00:01:00Z",
          error: null,
        },
      ],
      customAgents: [],
    };

    await saveStorageWithPatterns(tempDir, storage);

    // Verify storage was saved
    const loaded = loadStorage(tempDir);
    expect(loaded.runs.length).toBe(1);
    expect(loaded.runs[0].runId).toBe("run-persist-test");
  });

  it("should handle multiple recent runs", async () => {
    const { saveStorageWithPatterns } = await import(
      "../../../extensions/subagents/storage.js"
    );

    const storage: SubagentStorage = {
      version: SUBAGENT_DEFAULTS_VERSION,
      agents: createDefaultAgents("2024-01-01T00:00:00Z"),
      runs: [
        {
          runId: "run-1",
          agentId: "implementer",
          task: "タスク1",
          summary: "完了1",
          status: "completed",
          startedAt: "2024-01-01T00:00:00Z",
          finishedAt: "2024-01-01T00:01:00Z",
          error: null,
        },
        {
          runId: "run-2",
          agentId: "researcher",
          task: "タスク2",
          summary: "完了2",
          status: "completed",
          startedAt: "2024-01-01T00:02:00Z",
          finishedAt: "2024-01-01T00:03:00Z",
          error: null,
        },
        {
          runId: "run-3",
          agentId: "reviewer",
          task: "タスク3",
          summary: "完了3",
          status: "completed",
          startedAt: "2024-01-01T00:04:00Z",
          finishedAt: "2024-01-01T00:05:00Z",
          error: null,
        },
      ],
      customAgents: [],
    };

    await expect(saveStorageWithPatterns(tempDir, storage)).resolves.not.toThrow();
  });
});
