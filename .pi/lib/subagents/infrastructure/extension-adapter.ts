/**
 * @abdd.meta
 * path: .pi/lib/subagents/infrastructure/extension-adapter.ts
 * role: サブエージェント拡張機能の登録
 * why: piフレームワークへの統合を提供
 * related: ../application/subagent-service.ts, ../../extensions/subagents.ts
 * public_api: createSubagentTools, SubagentToolFactory
 * invariants: ツール登録の一意性
 * side_effects: piへのツール・コマンド登録
 * failure_modes: 登録エラー
 * @abdd.explain
 * overview: pi拡張機能としてのサブエージェント登録
 * what_it_does:
 *   - ツール定義の作成
 *   - コマンド定義の作成
 *   - イベントハンドラーの登録
 * why_it_exists: フレームワーク詳細をビジネスロジックから分離
 * scope:
 *   in: application層
 *   out: piフレームワーク
 */

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { SubagentService } from "../application/subagent-service.js";
import { FileSubagentRepository } from "../adapters/file-subagent-repo.js";
import { RuntimeCoordinatorImpl } from "../adapters/runtime-coordinator.js";

/**
 * サブエージェントツールファクトリー
 * @summary ツールファクトリー
 */
export class SubagentToolFactory {
  private service: SubagentService;

  /**
   * コンストラクタ
   * @summary コンストラクタ
   * @param cwd - 作業ディレクトリ
   */
  constructor(private readonly cwd: string) {
    const repository = new FileSubagentRepository(cwd);
    const runtimeCoordinator = new RuntimeCoordinatorImpl();

    this.service = new SubagentService({
      repository,
      // executor は後で設定（循環依存を避けるため）
      executor: {
        execute: async () => ({ success: false, error: "executor_not_configured" }),
      },
      runtimeCoordinator,
    });
  }

  /**
   * サブエージェントサービスを取得
   * @summary サービス取得
   * @returns サブエージェントサービス
   */
  getService(): SubagentService {
    return this.service;
  }
}

/**
 * サブエージェントツールを作成して登録
 * @summary ツール作成
 * @param pi - 拡張機能API
 * @param cwd - 作業ディレクトリ
 * @returns ツールファクトリー
 */
export function createSubagentTools(
  pi: ExtensionAPI,
  cwd: string
): SubagentToolFactory {
  const factory = new SubagentToolFactory(cwd);
  const service = factory.getService();

  // subagent_list ツール
  pi.registerTool({
    name: "subagent_list",
    label: "Subagent List",
    description: "List all subagent definitions and the current default subagent.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const subagents = await service.listAll();
      const storage = await (service as unknown as { repository: { load: () => Promise<{ defaultSubagentId?: string }> } }).repository.load();

      const lines = ["Subagents:"];
      for (const agent of subagents) {
        const mark = agent.id === storage.defaultSubagentId ? "*" : " ";
        const status = agent.enabled !== false ? "enabled" : "disabled";
        lines.push(`${mark} ${agent.id} (${status}) - ${agent.name}`);
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { subagents, defaultSubagentId: storage.defaultSubagentId },
      };
    },
  });

  // subagent_status ツール
  pi.registerTool({
    name: "subagent_status",
    label: "Subagent Status",
    description: "Show active subagent request count and active subagent agent count.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const activeCount = factory.getService() ? 0 : 0; // TODO: 実装
      const maxConcurrency = parseInt(process.env.PI_AGENT_MAX_TOTAL_LLM ?? "4", 10);

      return {
        content: [
          {
            type: "text",
            text: `Active: ${activeCount}/${maxConcurrency}`,
          },
        ],
        details: { activeCount, maxConcurrency },
      };
    },
  });

  return factory;
}
