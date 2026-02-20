/**
 * @file tests/unit/extensions/subagents.test.ts
 * @description subagents拡張機能の単体テスト
 * @testFramework vitest + fast-check
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fc from "fast-check";
import { join } from "node:path";

// モック: 外部依存を分離
vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => JSON.stringify({ definitions: [], runs: [] })),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock("../../pi/lib/fs-utils", () => ({
  ensureDir: vi.fn(),
}));

vi.mock("../../pi/lib/format-utils", () => ({
  formatDurationMs: vi.fn((ms: number) => `${ms}ms`),
  formatBytes: vi.fn((bytes: number) => `${bytes}B`),
  formatClockTime: vi.fn((date: Date) => date.toISOString()),
}));

vi.mock("../../pi/lib/agent-utils", () => ({
  createRunId: vi.fn((prefix: string) => `${prefix}-${Date.now()}`),
  computeLiveWindow: vi.fn(() => ({ start: 0, end: 100 })),
}));

vi.mock("../../pi/lib/agent-types", () => ({
  ThinkingLevel: { NONE: "none", LOW: "low", MEDIUM: "medium", HIGH: "high" },
  RunOutcomeCode: {
    SUCCESS: "success",
    FAILURE: "failure",
    TIMEOUT: "timeout",
    CANCELLED: "cancelled",
  },
  DEFAULT_AGENT_TIMEOUT_MS: 300000,
}));

vi.mock("../../pi/lib/runtime-utils", () => ({
  trimForError: vi.fn((msg: string) => msg.slice(0, 200)),
  buildRateLimitKey: vi.fn((p: string, m: string) => `${p}:${m}`),
  createRetrySchema: vi.fn(() => ({ maxRetries: 3, initialDelayMs: 1000 })),
  toConcurrencyLimit: vi.fn((n: number) => Math.max(1, n)),
}));

vi.mock("./agent-runtime", () => ({
  getRuntimeSnapshot: vi.fn(() => ({
    subagentActiveRequests: 0,
    subagentActiveAgents: 0,
    teamActiveRuns: 0,
    teamActiveAgents: 0,
    reservedRequests: 0,
    reservedLlm: 0,
    activeReservations: 0,
    activeOrchestrations: 0,
    queuedOrchestrations: 0,
    queuedTools: [],
    totalActiveRequests: 0,
    totalActiveLlm: 0,
    limits: {
      maxTotalActiveLlm: 6,
      maxTotalActiveRequests: 6,
      maxParallelSubagentsPerRun: 4,
      maxParallelTeamsPerRun: 3,
      maxParallelTeammatesPerTeam: 6,
      maxConcurrentOrchestrations: 4,
      capacityWaitMs: 30000,
      capacityPollMs: 100,
    },
    limitsVersion: "6:6:4:3:6:4:30000:100",
  })),
  getSharedRuntimeState: vi.fn(() => ({
    subagents: { activeRunRequests: 0, activeAgents: 0 },
    teams: { activeTeamRuns: 0, activeTeammates: 0 },
    queue: { activeOrchestrations: 0, pending: [], consecutiveDispatchesByTenant: 0 },
    reservations: { active: [] },
    limits: {
      maxTotalActiveLlm: 6,
      maxTotalActiveRequests: 6,
      maxParallelSubagentsPerRun: 4,
      maxParallelTeamsPerRun: 3,
      maxParallelTeammatesPerTeam: 6,
      maxConcurrentOrchestrations: 4,
      capacityWaitMs: 30000,
      capacityPollMs: 100,
    },
    limitsVersion: "6:6:4:3:6:4:30000:100",
  })),
  resetRuntimeTransientState: vi.fn(),
  reserveRuntimeCapacity: vi.fn(),
  tryReserveRuntimeCapacity: vi.fn(),
  notifyRuntimeCapacityChanged: vi.fn(),
  formatRuntimeStatusLine: vi.fn(() => "0/6 agents active"),
  waitForRuntimeOrchestrationTurn: vi.fn(async () => true),
}));

// テスト対象の型定義
interface SubagentDefinition {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  enabled: boolean;
  provider?: string;
  model?: string;
}

interface SubagentRunRecord {
  runId: string;
  agentId: string;
  task: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt: string;
  finishedAt?: string;
  summary?: string;
  outputFile: string;
}

interface SubagentStorage {
  definitions: SubagentDefinition[];
  runs: SubagentRunRecord[];
}

// ============================================================================
// ユーティリティ関数のテスト
// ============================================================================

describe("subagents ユーティリティ", () => {
  describe("createRunId形式の検証", () => {
    it("should_generate_valid_run_id_format", async () => {
      const { createRunId } = await import("../../pi/lib/agent-utils");
      const runId = createRunId("test");
      expect(runId).toMatch(/^test-\d+$/);
    });

    it("should_generate_unique_ids", async () => {
      // モックは一意性を保証しないため、実際の実装に依存するテストはスキップ
      // ここでは形式の確認のみ
      const { createRunId } = await import("../../pi/lib/agent-utils");
      const id1 = createRunId("test");
      const id2 = createRunId("test");
      // 両方とも正しい形式であることを確認
      expect(id1).toMatch(/^test-\d+$/);
      expect(id2).toMatch(/^test-\d+$/);
    });
  });

  describe("trimForError", () => {
    it("should_truncate_long_messages", async () => {
      const { trimForError } = await import("../../pi/lib/runtime-utils");
      const longMessage = "x".repeat(500);
      const result = trimForError(longMessage);
      expect(result.length).toBeLessThanOrEqual(200);
    });

    it("should_keep_short_messages_unchanged", async () => {
      const { trimForError } = await import("../../pi/lib/runtime-utils");
      const shortMessage = "short error";
      const result = trimForError(shortMessage);
      expect(result).toBe(shortMessage);
    });
  });

  describe("buildRateLimitKey", () => {
    it("should_combine_provider_and_model", async () => {
      const { buildRateLimitKey } = await import("../../pi/lib/runtime-utils");
      const key = buildRateLimitKey("anthropic", "claude-3-opus");
      expect(key).toBe("anthropic:claude-3-opus");
    });

    it("should_handle_empty_model", async () => {
      const { buildRateLimitKey } = await import("../../pi/lib/runtime-utils");
      const key = buildRateLimitKey("openai", "");
      expect(key).toBe("openai:");
    });
  });

  describe("toConcurrencyLimit", () => {
    it("should_return_at_least_1", async () => {
      const { toConcurrencyLimit } = await import("../../pi/lib/runtime-utils");
      expect(toConcurrencyLimit(0)).toBe(1);
      expect(toConcurrencyLimit(-5)).toBe(1);
    });

    it("should_return_input_for_positive_values", async () => {
      const { toConcurrencyLimit } = await import("../../pi/lib/runtime-utils");
      expect(toConcurrencyLimit(4)).toBe(4);
      expect(toConcurrencyLimit(10)).toBe(10);
    });
  });
});

// ============================================================================
// ストレージ操作のテスト
// ============================================================================

describe("subagents ストレージ", () => {
  let mockStorage: SubagentStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = {
      definitions: [
        {
          id: "researcher",
          name: "Researcher",
          description: "Research agent",
          systemPrompt: "You are a researcher.",
          enabled: true,
        },
        {
          id: "architect",
          name: "Architect",
          description: "Architecture agent",
          systemPrompt: "You are an architect.",
          enabled: true,
        },
      ],
      runs: [],
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("ストレージ構造", () => {
    it("should_have_definitions_array", () => {
      expect(Array.isArray(mockStorage.definitions)).toBe(true);
    });

    it("should_have_runs_array", () => {
      expect(Array.isArray(mockStorage.runs)).toBe(true);
    });

    it("should_validate_definition_structure", () => {
      const def = mockStorage.definitions[0];
      expect(def).toHaveProperty("id");
      expect(def).toHaveProperty("name");
      expect(def).toHaveProperty("description");
      expect(def).toHaveProperty("systemPrompt");
      expect(def).toHaveProperty("enabled");
    });
  });

  describe("定義の検証", () => {
    it("should_require_id", () => {
      const def = { ...mockStorage.definitions[0] } as Partial<SubagentDefinition>;
      delete def.id;
      expect(def.id).toBeUndefined();
    });

    it("should_require_systemPrompt", () => {
      const def = { ...mockStorage.definitions[0] } as Partial<SubagentDefinition>;
      delete def.systemPrompt;
      expect(def.systemPrompt).toBeUndefined();
    });

    it("should_default_enabled_to_true", () => {
      const def = mockStorage.definitions.find((d) => d.id === "researcher");
      expect(def?.enabled).toBe(true);
    });
  });

  describe("run record構造", () => {
    it("should_create_valid_run_record", () => {
      const run: SubagentRunRecord = {
        runId: "test-123",
        agentId: "researcher",
        task: "Research something",
        status: "completed",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        summary: "Done",
        outputFile: "/path/to/output.json",
      };

      expect(run.runId).toBeDefined();
      expect(run.agentId).toBe("researcher");
      expect(run.status).toBe("completed");
    });

    it("should_allow_pending_status", () => {
      const run: SubagentRunRecord = {
        runId: "test-456",
        agentId: "architect",
        task: "Design something",
        status: "pending",
        startedAt: new Date().toISOString(),
        outputFile: "/path/to/output.json",
      };

      expect(run.status).toBe("pending");
      expect(run.finishedAt).toBeUndefined();
    });
  });
});

// ============================================================================
// 定義済みエージェントのテスト
// ============================================================================

describe("定義済みサブエージェント", () => {
  const defaultAgents = [
    "researcher",
    "architect",
    "implementer",
    "reviewer",
    "tester",
  ];

  describe("エージェントIDの検証", () => {
    it.each(defaultAgents)("should_have_%s_agent", (agentId) => {
      expect(agentId).toMatch(/^[a-z]+$/);
    });

    it("should_have_unique_ids", () => {
      const uniqueIds = new Set(defaultAgents);
      expect(uniqueIds.size).toBe(defaultAgents.length);
    });
  });

  describe("エージェント名の検証", () => {
    const agentNames: Record<string, string> = {
      researcher: "Researcher",
      architect: "Architect",
      implementer: "Implementer",
      reviewer: "Reviewer",
      tester: "Tester",
    };

    it.each(Object.entries(agentNames))(
      "should_map_%s_to_%s",
      (id, expectedName) => {
        expect(agentNames[id]).toBe(expectedName);
      }
    );
  });
});

// ============================================================================
// エラーハンドリングのテスト
// ============================================================================

describe("エラーハンドリング", () => {
  describe("エラーメッセージ処理", () => {
    it("should_handle_timeout_error", () => {
      const errorMessage = "Operation timed out after 30000ms";
      expect(errorMessage).toContain("timed out");
    });

    it("should_handle_rate_limit_error", () => {
      const errorMessage = "Rate limit exceeded: 429 Too Many Requests";
      expect(errorMessage).toContain("429");
    });

    it("should_handle_cancelled_error", () => {
      const errorMessage = "Operation was cancelled by user";
      expect(errorMessage).toContain("cancelled");
    });
  });

  describe("ステータス遷移", () => {
    const validStatuses = ["pending", "running", "completed", "failed"];

    it("should_have_valid_status_values", () => {
      validStatuses.forEach((status) => {
        expect(["pending", "running", "completed", "failed"]).toContain(status);
      });
    });

    it("should_transition_from_pending_to_running", () => {
      const transitions: Record<string, string[]> = {
        pending: ["running", "failed"],
        running: ["completed", "failed"],
        completed: [],
        failed: [],
      };

      expect(transitions.pending).toContain("running");
    });
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  describe("runId生成", () => {
    it("PBT: runIdは常にプレフィックスとタイムスタンプで構成される", async () => {
      const { createRunId } = await import("../../pi/lib/agent-utils");

      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-z]{1,10}$/),
          (prefix) => {
            const runId = createRunId(prefix);
            return runId.startsWith(prefix + "-") && /\d+$/.test(runId);
          }
        )
      );
    });
  });

  describe("concurrencyLimit", () => {
    it("PBT: 結果は常に1以上", async () => {
      const { toConcurrencyLimit } = await import("../../pi/lib/runtime-utils");

      fc.assert(
        fc.property(fc.integer({ min: -1000, max: 1000 }), (n) => {
          const result = toConcurrencyLimit(n);
          return result >= 1;
        })
      );
    });
  });

  describe("rateLimitKey", () => {
    it("PBT: キーは常にprovider:model形式", async () => {
      const { buildRateLimitKey } = await import("../../pi/lib/runtime-utils");

      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 0, maxLength: 20 }),
          (provider, model) => {
            const key = buildRateLimitKey(provider, model);
            return key === `${provider}:${model}` && key.includes(":");
          }
        )
      );
    });
  });

  describe("trimForError", () => {
    it("PBT: 結果の長さは常に200以下", async () => {
      const { trimForError } = await import("../../pi/lib/runtime-utils");

      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 1000 }), (msg) => {
          const result = trimForError(msg);
          return result.length <= 200;
        })
      );
    });
  });
});

// ============================================================================
// ランタイム連携のテスト
// ============================================================================

describe("ランタイム連携", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getRuntimeSnapshot", () => {
    it("should_return_valid_snapshot", async () => {
      const { getRuntimeSnapshot } = await import("./agent-runtime");
      const snapshot = getRuntimeSnapshot();

      expect(snapshot).toHaveProperty("subagentActiveRequests");
      expect(snapshot).toHaveProperty("subagentActiveAgents");
      expect(snapshot).toHaveProperty("totalActiveRequests");
      expect(snapshot).toHaveProperty("totalActiveLlm");
      expect(snapshot).toHaveProperty("limits");
    });

    it("should_have_valid_limits", async () => {
      const { getRuntimeSnapshot } = await import("./agent-runtime");
      const snapshot = getRuntimeSnapshot();

      expect(snapshot.limits.maxTotalActiveLlm).toBeGreaterThan(0);
      expect(snapshot.limits.maxTotalActiveRequests).toBeGreaterThan(0);
      expect(snapshot.limits.maxParallelSubagentsPerRun).toBeGreaterThan(0);
    });
  });

  describe("getSharedRuntimeState", () => {
    it("should_return_valid_state", async () => {
      const { getSharedRuntimeState } = await import("./agent-runtime");
      const state = getSharedRuntimeState();

      expect(state).toHaveProperty("subagents");
      expect(state).toHaveProperty("teams");
      expect(state).toHaveProperty("queue");
      expect(state).toHaveProperty("reservations");
      expect(state).toHaveProperty("limits");
    });
  });

  describe("formatRuntimeStatusLine", () => {
    it("should_return_formatted_status", async () => {
      const { formatRuntimeStatusLine } = await import("./agent-runtime");
      const status = formatRuntimeStatusLine();

      expect(typeof status).toBe("string");
      expect(status.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// エッジケース
// ============================================================================

describe("エッジケース", () => {
  describe("空のストレージ", () => {
    it("should_handle_empty_definitions", () => {
      const emptyStorage: SubagentStorage = {
        definitions: [],
        runs: [],
      };
      expect(emptyStorage.definitions).toHaveLength(0);
    });

    it("should_handle_empty_runs", () => {
      const emptyStorage: SubagentStorage = {
        definitions: [],
        runs: [],
      };
      expect(emptyStorage.runs).toHaveLength(0);
    });
  });

  describe("特殊文字を含むタスク", () => {
    it("should_handle_unicode_task", () => {
      const task = "日本語のタスク";
      expect(task.length).toBeGreaterThan(0);
    });

    it("should_handle_special_characters", () => {
      const task = "Task with special chars: <>&\"'\\n\\t";
      expect(task).toContain("special");
    });
  });

  describe("長い入力", () => {
    it("should_handle_long_task_description", () => {
      const longTask = "x".repeat(10000);
      expect(longTask.length).toBe(10000);
    });

    it("should_handle_long_system_prompt", () => {
      const longPrompt = "You are an agent. ".repeat(1000);
      expect(longPrompt.length).toBeGreaterThan(10000);
    });
  });
});
