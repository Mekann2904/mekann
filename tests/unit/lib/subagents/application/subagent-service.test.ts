/**
 * @file subagent-service.ts 単体テスト
 * @description SubagentServiceクラスのテスト
 * @testFramework vitest
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { SubagentService } from "../../../../../.pi/lib/subagents/application/subagent-service.js";
import type {
  ISubagentRepository,
  ISubagentExecutor,
  IRuntimeCoordinator,
  SubagentServiceDependencies,
  SubagentSelectionResult,
  SubagentExecutionResult,
} from "../../../../../.pi/lib/subagents/application/interfaces.js";
import type {
  SubagentDefinition,
  SubagentStorage,
} from "../../../../../.pi/lib/subagents/domain/subagent-definition.js";

// ============================================================================
// モック定義
// ============================================================================

const createMockRepository = (): ISubagentRepository => ({
  load: vi.fn(),
  save: vi.fn(),
  addRunRecord: vi.fn(),
  getRunRecords: vi.fn(),
});

const createMockExecutor = (): ISubagentExecutor => ({
  execute: vi.fn(),
});

const createMockRuntimeCoordinator = (): IRuntimeCoordinator => ({
  acquirePermit: vi.fn(),
  releasePermit: vi.fn(),
  getActiveCount: vi.fn(),
  getMaxConcurrency: vi.fn(),
});

const createMockSubagent = (overrides?: Partial<SubagentDefinition>): SubagentDefinition => ({
  id: "test-agent",
  name: "Test Agent",
  description: "Test description",
  systemPrompt: "Test prompt",
  ...overrides,
});

const createMockStorage = (subagents: SubagentDefinition[] = []): SubagentStorage => ({
  subagents,
  defaultSubagentId: subagents.length > 0 ? subagents[0].id : undefined,
});

// ============================================================================
// SubagentService テスト
// ============================================================================

describe("SubagentService", () => {
  let mockRepository: ReturnType<typeof createMockRepository>;
  let mockExecutor: ReturnType<typeof createMockExecutor>;
  let mockRuntimeCoordinator: ReturnType<typeof createMockRuntimeCoordinator>;
  let service: SubagentService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepository = createMockRepository();
    mockExecutor = createMockExecutor();
    mockRuntimeCoordinator = createMockRuntimeCoordinator();
    service = new SubagentService({
      repository: mockRepository,
      executor: mockExecutor,
      runtimeCoordinator: mockRuntimeCoordinator,
    });
  });

  // ==========================================================================
  // selectById テスト
  // ==========================================================================

  describe("selectById", () => {
    it("selectById_正常_IDで選択成功", async () => {
      // Arrange
      const agent = createMockSubagent({ id: "implementer" });
      vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage([agent]));

      // Act
      const result = await service.selectById("implementer");

      // Assert
      expect(result.success).toBe(true);
      expect(result.subagent).toEqual(agent);
    });

    it("selectById_異常_存在しないID", async () => {
      // Arrange
      vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage([]));

      // Act
      const result = await service.selectById("non-existent");

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe("subagent_not_found: non-existent");
    });

    it("selectById_異常_無効化されたサブエージェント", async () => {
      // Arrange
      const agent = createMockSubagent({ id: "disabled-agent", enabled: false });
      vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage([agent]));

      // Act
      const result = await service.selectById("disabled-agent");

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe("subagent_disabled: disabled-agent");
    });

    it("selectById_エッジケース_複数サブエージェントから選択", async () => {
      // Arrange
      const agents = [
        createMockSubagent({ id: "agent1" }),
        createMockSubagent({ id: "agent2" }),
        createMockSubagent({ id: "agent3" }),
      ];
      vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage(agents));

      // Act
      const result = await service.selectById("agent2");

      // Assert
      expect(result.success).toBe(true);
      expect(result.subagent?.id).toBe("agent2");
    });
  });

  // ==========================================================================
  // selectDefault テスト
  // ==========================================================================

  describe("selectDefault", () => {
    it("selectDefault_正常_デフォルトIDが設定されている場合", async () => {
      // Arrange
      const defaultAgent = createMockSubagent({ id: "default-agent" });
      const otherAgent = createMockSubagent({ id: "other-agent" });
      const storage: SubagentStorage = {
        subagents: [otherAgent, defaultAgent],
        defaultSubagentId: "default-agent",
      };
      vi.mocked(mockRepository.load).mockResolvedValue(storage);

      // Act
      const result = await service.selectDefault();

      // Assert
      expect(result.success).toBe(true);
      expect(result.subagent?.id).toBe("default-agent");
    });

    it("selectDefault_正常_デフォルトIDなし_最初の有効エージェントを選択", async () => {
      // Arrange
      const agents = [
        createMockSubagent({ id: "first-agent" }),
        createMockSubagent({ id: "second-agent" }),
      ];
      vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage(agents));

      // Act
      const result = await service.selectDefault();

      // Assert
      expect(result.success).toBe(true);
      expect(result.subagent?.id).toBe("first-agent");
    });

    it("selectDefault_異常_有効なサブエージェントなし", async () => {
      // Arrange
      vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage([]));

      // Act
      const result = await service.selectDefault();

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe("no_enabled_subagents");
    });

    it("selectDefault_正常_無効化されたエージェントをスキップ", async () => {
      // Arrange
      const agents = [
        createMockSubagent({ id: "disabled", enabled: false }),
        createMockSubagent({ id: "enabled" }),
      ];
      // defaultSubagentIdを明示的にundefinedに設定
      const storage: SubagentStorage = {
        subagents: agents,
        defaultSubagentId: undefined,
      };
      vi.mocked(mockRepository.load).mockResolvedValue(storage);

      // Act
      const result = await service.selectDefault();

      // Assert
      expect(result.success).toBe(true);
      expect(result.subagent?.id).toBe("enabled");
    });

    it("selectDefault_エッジケース_全て無効化", async () => {
      // Arrange
      const agents = [
        createMockSubagent({ id: "disabled1", enabled: false }),
        createMockSubagent({ id: "disabled2", enabled: false }),
      ];
      // defaultSubagentIdを明示的にundefinedに設定
      const storage: SubagentStorage = {
        subagents: agents,
        defaultSubagentId: undefined,
      };
      vi.mocked(mockRepository.load).mockResolvedValue(storage);

      // Act
      const result = await service.selectDefault();

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe("no_enabled_subagents");
    });
  });

  // ==========================================================================
  // selectForParallel テスト
  // ==========================================================================

  describe("selectForParallel", () => {
    it("selectForParallel_正常_デフォルト2件選択", async () => {
      // Arrange
      const agents = [
        createMockSubagent({ id: "implementer" }),
        createMockSubagent({ id: "reviewer" }),
        createMockSubagent({ id: "tester" }),
      ];
      vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage(agents));

      // Act
      const result = await service.selectForParallel();

      // Assert
      expect(result).toHaveLength(2);
    });

    it("selectForParallel_正常_指定数選択", async () => {
      // Arrange
      const agents = [
        createMockSubagent({ id: "implementer" }),
        createMockSubagent({ id: "reviewer" }),
        createMockSubagent({ id: "tester" }),
        createMockSubagent({ id: "architect" }),
      ];
      vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage(agents));

      // Act
      const result = await service.selectForParallel(3);

      // Assert
      expect(result).toHaveLength(3);
    });

    it("selectForParallel_正常_優先度順で選択", async () => {
      // Arrange
      const agents = [
        createMockSubagent({ id: "researcher" }),
        createMockSubagent({ id: "implementer" }),
        createMockSubagent({ id: "reviewer" }),
      ];
      vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage(agents));

      // Act
      const result = await service.selectForParallel(3);

      // Assert
      // 優先度順: implementer, reviewer, tester, architect, researcher
      expect(result[0].id).toBe("implementer");
      expect(result[1].id).toBe("reviewer");
      expect(result[2].id).toBe("researcher");
    });

    it("selectForParallel_正常_無効化されたエージェントを除外", async () => {
      // Arrange
      const agents = [
        createMockSubagent({ id: "implementer", enabled: false }),
        createMockSubagent({ id: "reviewer" }),
        createMockSubagent({ id: "tester" }),
      ];
      vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage(agents));

      // Act
      const result = await service.selectForParallel(2);

      // Assert
      expect(result).toHaveLength(2);
      expect(result.map((a) => a.id)).not.toContain("implementer");
    });

    it("selectForParallel_エッジケース_全て無効化", async () => {
      // Arrange
      const agents = [
        createMockSubagent({ id: "disabled1", enabled: false }),
        createMockSubagent({ id: "disabled2", enabled: false }),
      ];
      vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage(agents));

      // Act
      const result = await service.selectForParallel(2);

      // Assert
      expect(result).toHaveLength(0);
    });

    it("selectForParallel_エッジケース_要求数より少ない", async () => {
      // Arrange
      const agents = [createMockSubagent({ id: "implementer" })];
      vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage(agents));

      // Act
      const result = await service.selectForParallel(5);

      // Assert
      expect(result).toHaveLength(1);
    });

    it("selectForParallel_正常_不明なIDは低優先度", async () => {
      // Arrange
      const agents = [
        createMockSubagent({ id: "custom-agent" }),
        createMockSubagent({ id: "implementer" }),
      ];
      vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage(agents));

      // Act
      const result = await service.selectForParallel(2);

      // Assert
      expect(result[0].id).toBe("implementer");
      expect(result[1].id).toBe("custom-agent");
    });
  });

  // ==========================================================================
  // register テスト
  // ==========================================================================

  describe("register", () => {
    it("register_正常_新規登録", async () => {
      // Arrange
      const newAgent = createMockSubagent({ id: "new-agent" });
      vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage([]));

      // Act
      await service.register(newAgent);

      // Assert
      expect(mockRepository.save).toHaveBeenCalled();
      const savedStorage = vi.mocked(mockRepository.save).mock.calls[0][0];
      expect(savedStorage.subagents).toContainEqual(newAgent);
    });

    it("register_異常_重複ID", async () => {
      // Arrange
      const existingAgent = createMockSubagent({ id: "existing" });
      const newAgent = createMockSubagent({ id: "existing" });
      vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage([existingAgent]));

      // Act & Assert
      await expect(service.register(newAgent)).rejects.toThrow(
        "subagent_already_exists: existing"
      );
    });

    it("register_正常_複数エージェント存在時に追加", async () => {
      // Arrange
      const existingAgent = createMockSubagent({ id: "existing" });
      const newAgent = createMockSubagent({ id: "new" });
      vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage([existingAgent]));

      // Act
      await service.register(newAgent);

      // Assert
      const savedStorage = vi.mocked(mockRepository.save).mock.calls[0][0];
      expect(savedStorage.subagents).toHaveLength(2);
    });
  });

  // ==========================================================================
  // update テスト
  // ==========================================================================

  describe("update", () => {
    it("update_正常_既存エージェント更新", async () => {
      // Arrange
      const existingAgent = createMockSubagent({ id: "agent", name: "Old Name" });
      const updatedAgent = createMockSubagent({ id: "agent", name: "New Name" });
      vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage([existingAgent]));

      // Act
      await service.update(updatedAgent);

      // Assert
      const savedStorage = vi.mocked(mockRepository.save).mock.calls[0][0];
      expect(savedStorage.subagents[0].name).toBe("New Name");
    });

    it("update_異常_存在しないID", async () => {
      // Arrange
      const agent = createMockSubagent({ id: "non-existent" });
      vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage([]));

      // Act & Assert
      await expect(service.update(agent)).rejects.toThrow(
        "subagent_not_found: non-existent"
      );
    });

    it("update_正常_複数エージェント中の特定エージェント更新", async () => {
      // Arrange
      const agents = [
        createMockSubagent({ id: "agent1" }),
        createMockSubagent({ id: "agent2", name: "Old" }),
        createMockSubagent({ id: "agent3" }),
      ];
      const updatedAgent = createMockSubagent({ id: "agent2", name: "New" });
      vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage(agents));

      // Act
      await service.update(updatedAgent);

      // Assert
      const savedStorage = vi.mocked(mockRepository.save).mock.calls[0][0];
      expect(savedStorage.subagents).toHaveLength(3);
      expect(savedStorage.subagents[1].name).toBe("New");
    });
  });

  // ==========================================================================
  // delete テスト
  // ==========================================================================

  describe("delete", () => {
    it("delete_正常_エージェント削除", async () => {
      // Arrange
      const agent = createMockSubagent({ id: "to-delete" });
      vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage([agent]));

      // Act
      await service.delete("to-delete");

      // Assert
      const savedStorage = vi.mocked(mockRepository.save).mock.calls[0][0];
      expect(savedStorage.subagents).toHaveLength(0);
    });

    it("delete_異常_存在しないID", async () => {
      // Arrange
      vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage([]));

      // Act & Assert
      await expect(service.delete("non-existent")).rejects.toThrow(
        "subagent_not_found: non-existent"
      );
    });

    it("delete_正常_複数エージェント中の特定エージェント削除", async () => {
      // Arrange
      const agents = [
        createMockSubagent({ id: "agent1" }),
        createMockSubagent({ id: "agent2" }),
        createMockSubagent({ id: "agent3" }),
      ];
      vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage(agents));

      // Act
      await service.delete("agent2");

      // Assert
      const savedStorage = vi.mocked(mockRepository.save).mock.calls[0][0];
      expect(savedStorage.subagents).toHaveLength(2);
      expect(savedStorage.subagents.map((a) => a.id)).toEqual(["agent1", "agent3"]);
    });
  });

  // ==========================================================================
  // listAll テスト
  // ==========================================================================

  describe("listAll", () => {
    it("listAll_正常_全エージェント取得", async () => {
      // Arrange
      const agents = [
        createMockSubagent({ id: "agent1" }),
        createMockSubagent({ id: "agent2" }),
      ];
      vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage(agents));

      // Act
      const result = await service.listAll();

      // Assert
      expect(result).toHaveLength(2);
      expect(result).toEqual(agents);
    });

    it("listAll_正常_空リスト", async () => {
      // Arrange
      vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage([]));

      // Act
      const result = await service.listAll();

      // Assert
      expect(result).toHaveLength(0);
    });
  });

  // ==========================================================================
  // execute テスト
  // ==========================================================================

  describe("execute", () => {
    it("execute_正常_実行成功", async () => {
      // Arrange
      const agent = createMockSubagent({ id: "implementer" });
      vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage([agent]));
      vi.mocked(mockRuntimeCoordinator.acquirePermit).mockResolvedValue({
        id: "permit-1",
        subagentId: "implementer",
        acquiredAt: new Date(),
      });
      vi.mocked(mockExecutor.execute).mockResolvedValue({
        success: true,
        output: "Task completed",
      });

      // Act
      const result = await service.execute("implementer", "Test task");

      // Assert
      expect(result.success).toBe(true);
      expect(result.output).toBe("Task completed");
      expect(mockRuntimeCoordinator.releasePermit).toHaveBeenCalled();
    });

    it("execute_異常_サブエージェントが見つからない", async () => {
      // Arrange
      vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage([]));

      // Act
      const result = await service.execute("non-existent", "Test task");

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe("subagent_not_found: non-existent");
    });

    it("execute_異常_ランタイム容量超過", async () => {
      // Arrange
      const agent = createMockSubagent({ id: "implementer" });
      vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage([agent]));
      vi.mocked(mockRuntimeCoordinator.acquirePermit).mockResolvedValue(null);

      // Act
      const result = await service.execute("implementer", "Test task");

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe("runtime_capacity_exceeded");
    });

    it("execute_正常_実行失敗時も許可解放", async () => {
      // Arrange
      const agent = createMockSubagent({ id: "implementer" });
      vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage([agent]));
      vi.mocked(mockRuntimeCoordinator.acquirePermit).mockResolvedValue({
        id: "permit-1",
        subagentId: "implementer",
        acquiredAt: new Date(),
      });
      vi.mocked(mockExecutor.execute).mockResolvedValue({
        success: false,
        error: "Execution failed",
      });

      // Act
      const result = await service.execute("implementer", "Test task");

      // Assert
      expect(result.success).toBe(false);
      expect(mockRuntimeCoordinator.releasePermit).toHaveBeenCalled();
    });

    it("execute_正常_オプション付き実行", async () => {
      // Arrange
      const agent = createMockSubagent({ id: "implementer" });
      vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage([agent]));
      vi.mocked(mockRuntimeCoordinator.acquirePermit).mockResolvedValue({
        id: "permit-1",
        subagentId: "implementer",
        acquiredAt: new Date(),
      });
      vi.mocked(mockExecutor.execute).mockResolvedValue({
        success: true,
        output: "Done",
      });

      // Act
      const result = await service.execute("implementer", "Test task", {
        timeoutMs: 5000,
        extraContext: "Additional context",
      });

      // Assert
      expect(result.success).toBe(true);
      expect(mockExecutor.execute).toHaveBeenCalledWith(
        agent,
        "Test task",
        expect.objectContaining({
          timeoutMs: 5000,
          extraContext: "Additional context",
        })
      );
    });
  });

  // ==========================================================================
  // checkResponsibility テスト
  // ==========================================================================

  describe("checkResponsibility", () => {
    it("checkResponsibility_正常_責任チェック実行", async () => {
      // Arrange
      const agents = [
        createMockSubagent({ id: "implementer", skills: ["coding"] }),
        createMockSubagent({ id: "reviewer", skills: ["review"] }),
      ];
      vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage(agents));

      // Act
      const result = await service.checkResponsibility();

      // Assert
      expect(Array.isArray(result)).toBe(true);
    });

    it("checkResponsibility_正常_空リストでも成功", async () => {
      // Arrange
      vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage([]));

      // Act
      const result = await service.checkResponsibility();

      // Assert
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });
  });
});

// ============================================================================
// 依存関係注入テスト
// ============================================================================

describe("SubagentService 依存関係", () => {
  it("コンストラクタ_正常_依存関係が正しく設定される", () => {
    // Arrange
    const mockRepository = createMockRepository();
    const mockExecutor = createMockExecutor();
    const mockRuntimeCoordinator = createMockRuntimeCoordinator();

    // Act
    const service = new SubagentService({
      repository: mockRepository,
      executor: mockExecutor,
      runtimeCoordinator: mockRuntimeCoordinator,
    });

    // Assert
    expect(service).toBeInstanceOf(SubagentService);
  });
});

// ============================================================================
// エッジケース・エラーハンドリング
// ============================================================================

describe("エッジケース・エラーハンドリング", () => {
  let mockRepository: ReturnType<typeof createMockRepository>;
  let mockExecutor: ReturnType<typeof createMockExecutor>;
  let mockRuntimeCoordinator: ReturnType<typeof createMockRuntimeCoordinator>;
  let service: SubagentService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepository = createMockRepository();
    mockExecutor = createMockExecutor();
    mockRuntimeCoordinator = createMockRuntimeCoordinator();
    service = new SubagentService({
      repository: mockRepository,
      executor: mockExecutor,
      runtimeCoordinator: mockRuntimeCoordinator,
    });
  });

  it("selectById_リポジトリエラー", async () => {
    // Arrange
    vi.mocked(mockRepository.load).mockRejectedValue(new Error("Repository error"));

    // Act & Assert
    await expect(service.selectById("test")).rejects.toThrow("Repository error");
  });

  it("register_リポジトリsaveエラー", async () => {
    // Arrange
    const agent = createMockSubagent();
    vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage([]));
    vi.mocked(mockRepository.save).mockRejectedValue(new Error("Save failed"));

    // Act & Assert
    await expect(service.register(agent)).rejects.toThrow("Save failed");
  });

  it("execute_例外発生時も許可解放", async () => {
    // Arrange
    const agent = createMockSubagent({ id: "implementer" });
    vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage([agent]));
    const permit = { id: "permit-1", subagentId: "implementer", acquiredAt: new Date() };
    vi.mocked(mockRuntimeCoordinator.acquirePermit).mockResolvedValue(permit);
    vi.mocked(mockExecutor.execute).mockRejectedValue(new Error("Executor error"));

    // Act & Assert
    await expect(service.execute("implementer", "Test task")).rejects.toThrow("Executor error");
    expect(mockRuntimeCoordinator.releasePermit).toHaveBeenCalledWith(permit);
  });

  it("selectForParallel_count0_空配列", async () => {
    // Arrange
    const agents = [createMockSubagent({ id: "agent1" })];
    vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage(agents));

    // Act
    const result = await service.selectForParallel(0);

    // Assert
    expect(result).toHaveLength(0);
  });

  it("selectForParallel_負のcount_空配列", async () => {
    // Arrange
    const agents = [createMockSubagent({ id: "agent1" })];
    vi.mocked(mockRepository.load).mockResolvedValue(createMockStorage(agents));

    // Act
    const result = await service.selectForParallel(-1);

    // Assert
    expect(result).toHaveLength(0);
  });
});
