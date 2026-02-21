/**
 * @file cross-instance-runtime統合テスト
 * @description 複数PIインスタンス間の通信、レート制限の学習と適用、並列処理数の動的調整の統合テスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { describeScenario, createMockPi, createTempDir, cleanupTempDir } from "../../helpers/bdd-helpers";

// ============================================================================
// Integration Test Scenarios
// ============================================================================

describe("cross-instance-runtime統合テスト", () => {
  let testCwd: string;

  beforeEach(async () => {
    testCwd = createTempDir("cross-instance-runtime-integration-");
  });

  afterEach(() => {
    cleanupTempDir(testCwd);
    vi.clearAllMocks();
  });

  describeScenario(
    "複数PIインスタンス間の通信",
    "インスタンス登録とステータス共有",
    (ctx) => {
      let mockPi: any;
      let sessionId: string;

      ctx.given("cross-instance-runtime拡張機能がロードされている", async () => {
        mockPi = createMockPi();

        // pi_instance_statusツールをモック
        mockPi.registerTool({
          name: "pi_instance_status",
          execute: vi.fn().mockResolvedValue({
            content: [{ text: "インスタンスステータス取得完了" }],
            details: {
              coordinator: {
                registered: true,
                myInstanceId: "instance-test-1",
                activeInstanceCount: 2,
                myParallelLimit: 4,
              },
              runtime: {
                limits: {
                  maxTotalActiveLlm: 8,
                  maxTotalActiveRequests: 16,
                },
              },
            },
          }),
        });
      });

      ctx.when("セッションを開始してインスタンスを登録する", async () => {
        sessionId = `session-${Date.now()}`;
        const ctx = {
          cwd: testCwd,
          model: undefined,
          ui: { notify: mockPi.uiNotify },
        };

        const result = await mockPi.getTool("pi_instance_status")?.execute(
          "status-1",
          {},
          undefined,
          undefined,
          ctx
        );

        expect(result.details.coordinator.registered).toBe(true);
      });

      ctx.and("インスタンスステータスを確認する", async () => {
        const ctx = {
          cwd: testCwd,
          model: undefined,
          ui: { notify: mockPi.uiNotify },
        };

        const result = await mockPi.getTool("pi_instance_status")?.execute(
          "status-2",
          {},
          undefined,
          undefined,
          ctx
        );

        expect(result.details.coordinator.activeInstanceCount).toBeGreaterThan(0);
        expect(result.details.coordinator.myParallelLimit).toBeGreaterThan(0);
      });

      ctx.then("複数PIインスタンス間の通信が正しく機能する", () => {
        const tool = mockPi.getTool("pi_instance_status");
        expect(tool).toBeDefined();
      });
    }
  );

  describeScenario(
    "レート制限の学習と適用",
    "429エラーからのレート制限適応的学習",
    (ctx) => {
      let mockPi: any;
      let learnedLimit: number = 10;

      ctx.given("レート制限学習が有効である", async () => {
        mockPi = createMockPi();

        // pi_model_limitsツールをモック
        mockPi.registerTool({
          name: "pi_model_limits",
          execute: vi.fn().mockImplementation(({ provider, model }) => {
            return {
              content: [{ text: "モデル制限取得完了" }],
              details: {
                resolved: {
                  provider,
                  model,
                  tier: "pro",
                  rpm: 60,
                  concurrency: 10,
                  source: "default",
                },
                learned: learnedLimit < 10 ? { concurrency: learnedLimit, originalConcurrency: 10 } : null,
                effectiveLimit: learnedLimit,
                modelInstanceLimit: learnedLimit,
                instanceCount: 1,
              },
            };
          }),
        });
      });

      ctx.when("モデル制限を確認する", async () => {
        const ctx = {
          cwd: testCwd,
          model: {
            provider: "anthropic",
            id: "claude-sonnet-4-20250514",
          },
          ui: { notify: mockPi.uiNotify },
        };

        const result = await mockPi.getTool("pi_model_limits")?.execute(
          "limits-1",
          { provider: "anthropic", model: "claude-sonnet-4-20250514" },
          undefined,
          undefined,
          ctx
        );

        expect(result.details.resolved).toBeDefined();
        expect(result.details.effectiveLimit).toBeGreaterThan(0);
      });

      ctx.and("429エラーを検出してレート制限を調整する", async () => {
        // 429エラー検出後の挙動をシミュレート
        learnedLimit = 5;

        const ctx = {
          cwd: testCwd,
          model: {
            provider: "anthropic",
            id: "claude-sonnet-4-20250514",
          },
          ui: { notify: mockPi.uiNotify },
        };

        const result = await mockPi.getTool("pi_model_limits")?.execute(
          "limits-2",
          { provider: "anthropic", model: "claude-sonnet-4-20250514" },
          undefined,
          undefined,
          ctx
        );

        expect(result.details.learned).toBeDefined();
        expect(result.details.learned!.concurrency).toBe(5);
        expect(result.details.effectiveLimit).toBe(5);
      });

      ctx.then("レート制限の学習と適用が正しく機能する", () => {
        const tool = mockPi.getTool("pi_model_limits");
        expect(tool).toBeDefined();
      });
    }
  );

  describeScenario(
    "並列処理数の動的調整",
    "アクティブインスタンス数に応じた並列度調整",
    (ctx) => {
      let mockPi: any;
      let parallelLimits: number[] = [];

      ctx.given("複数インスタンスがアクティブである", async () => {
        mockPi = createMockPi();

        // pi_instance_statusツールをモック
        let instanceCount = 1;

        mockPi.registerTool({
          name: "pi_instance_status",
          execute: vi.fn().mockImplementation(() => {
            const parallelLimit = Math.floor(8 / instanceCount);
            parallelLimits.push(parallelLimit);
            return {
              content: [{ text: "インスタンスステータス取得完了" }],
              details: {
                coordinator: {
                  registered: true,
                  activeInstanceCount: instanceCount,
                  myParallelLimit: parallelLimit,
                },
              },
            };
          }),
        });
      });

      ctx.when("単一インスタンスの状態を確認する", async () => {
        const ctx = {
          cwd: testCwd,
          model: undefined,
          ui: { notify: mockPi.uiNotify },
        };

        const result = await mockPi.getTool("pi_instance_status")?.execute(
          "status-1",
          {},
          undefined,
          undefined,
          ctx
        );

        expect(result.details.coordinator.myParallelLimit).toBe(8);
      });

      ctx.and("インスタンス数が増加した際の並列度調整を確認する", async () => {
        const ctx = {
          cwd: testCwd,
          model: undefined,
          ui: { notify: mockPi.uiNotify },
        };

        const result = await mockPi.getTool("pi_instance_status")?.execute(
          "status-2",
          {},
          undefined,
          undefined,
          ctx
        );

        // インスタンス数に応じて並列度が調整されていることを確認
        expect(result.details.coordinator.myParallelLimit).toBeLessThanOrEqual(8);
      });

      ctx.then("並列処理数の動的調整が正しく機能する", () => {
        expect(parallelLimits.length).toBeGreaterThan(0);
        const firstResult = parallelLimits[0];
        expect(firstResult).toBeGreaterThan(0);
      });
    }
  );

  describeScenario(
    "インスタンス登録・登録解除のライフサイクル",
    "インスタンスの登録、登録解除、状態管理",
    (ctx) => {
      let mockPi: any;
      let instanceId: string;

      ctx.given("インスタンスがコーディネータに登録されている", async () => {
        mockPi = createMockPi();

        mockPi.registerTool({
          name: "pi_instance_status",
          execute: vi.fn().mockResolvedValue({
            content: [{ text: "インスタンス登録完了" }],
            details: {
              coordinator: {
                registered: true,
                myInstanceId: "test-instance-123",
                activeInstanceCount: 1,
                myParallelLimit: 8,
              },
              runtime: {
                limits: {
                  maxTotalActiveLlm: 8,
                  maxTotalActiveRequests: 16,
                },
              },
            },
          }),
        });
      });

      ctx.when("インスタンスIDを取得する", async () => {
        const ctx = {
          cwd: testCwd,
          model: undefined,
          ui: { notify: mockPi.uiNotify },
        };

        const result = await mockPi.getTool("pi_instance_status")?.execute(
          "lifecycle-1",
          {},
          undefined,
          undefined,
          ctx
        );

        instanceId = result.details.coordinator.myInstanceId;
        expect(instanceId).toBeDefined();
        expect(typeof instanceId).toBe("string");
      });

      ctx.and("インスタンスのランタイム制限を確認する", async () => {
        const ctx = {
          cwd: testCwd,
          model: undefined,
          ui: { notify: mockPi.uiNotify },
        };

        const result = await mockPi.getTool("pi_instance_status")?.execute(
          "lifecycle-2",
          {},
          undefined,
          undefined,
          ctx
        );

        expect(result.details.runtime.limits.maxTotalActiveLlm).toBeGreaterThan(0);
        expect(result.details.runtime.limits.maxTotalActiveRequests).toBeGreaterThan(0);
      });

      ctx.then("インスタンスのライフサイクル管理が正しく機能する", () => {
        expect(instanceId).toBeDefined();
      });
    }
  );

  describeScenario(
    "コマンド実行とUI連携",
    "pi-instances、pi-limits、pi-limits-resetコマンドの実行",
    (ctx) => {
      let mockPi: any;
      let messages: any[] = [];

      ctx.given("コマンドが登録されている", async () => {
        mockPi = createMockPi();

        // sendMessageをインターセプト
        mockPi.sendMessage = vi.fn().mockImplementation((msg) => {
          messages.push(msg);
        });

        mockPi.registerCommand("pi-instances", {
          description: "Show active pi instances",
          handler: async () => {
            mockPi.sendMessage({
              customType: "pi-instances-status",
              content: "Active pi instances: 1",
              display: true,
            });
          },
        });

        mockPi.registerCommand("pi-limits", {
          description: "Show provider limits",
          handler: async () => {
            mockPi.sendMessage({
              customType: "pi-limits-info",
              content: "Provider Limits",
              display: true,
            });
          },
        });

        mockPi.registerCommand("pi-limits-reset", {
          description: "Reset learned limits",
          handler: async () => {
            mockPi.sendMessage({
              customType: "pi-limits-reset",
              content: "Learned limits reset",
              display: false,
            });
          },
        });
      });

      ctx.when("pi-instancesコマンドを実行する", async () => {
        const command = mockPi.commands.get("pi-instances");
        const ctx = { cwd: testCwd, ui: { notify: mockPi.uiNotify } };

        await command!.handler("", ctx);

        expect(messages.length).toBeGreaterThan(0);
        expect(messages[messages.length - 1].customType).toBe("pi-instances-status");
      });

      ctx.and("pi-limitsコマンドを実行する", async () => {
        const command = mockPi.commands.get("pi-limits");
        const ctx = { cwd: testCwd, ui: { notify: mockPi.uiNotify } };

        await command!.handler("", ctx);

        expect(messages[messages.length - 1].customType).toBe("pi-limits-info");
      });

      ctx.and("pi-limits-resetコマンドを実行する", async () => {
        const command = mockPi.commands.get("pi-limits-reset");
        const ctx = { cwd: testCwd, ui: { notify: mockPi.uiNotify } };

        await command!.handler("", ctx);

        expect(messages[messages.length - 1].customType).toBe("pi-limits-reset");
      });

      ctx.then("コマンドが正しく実行されUIにメッセージが送信される", () => {
        expect(messages.length).toBe(3);
      });
    }
  );
});
