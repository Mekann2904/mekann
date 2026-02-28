/**
 * @abdd.meta
 * path: .pi/lib/ul-workflow/infrastructure/extension.ts
 * role: UL Workflow拡張機能のエントリーポイント
 * why: クリーンアーキテクチャの各層を統合し、ツールを登録
 * related: ../application/workflow-service.ts, ../adapters/storage/file-workflow-repo.ts
 * public_api: registerUlWorkflowExtension
 * invariants: なし
 * side_effects: ツール登録、コマンド登録
 * failure_modes: 登録エラー
 * @abdd.explain
 * overview: 拡張機能のエントリーポイント
 * what_it_does:
 *   - 依存関係の組み立て（DI）
 *   - ツールの登録
 *   - コマンドの登録
 * why_it_exists: インフラストラクチャ層として詳細をカプセル化
 * scope:
 *   in: domain, application, adapters
 *   out: .pi/extensions/ul-workflow.ts
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { WorkflowService } from "../application/workflow-service.js";
import { FileWorkflowRepository } from "../adapters/storage/file-workflow-repo.js";
import {
  createStartTool,
  createStatusTool,
  createApproveTool,
  createAbortTool,
  createResumeTool,
} from "../adapters/index.js";

/**
 * UL Workflow拡張機能を登録
 * @summary 拡張機能登録
 * @param pi - 拡張機能API
 */
export function registerUlWorkflowExtension(pi: ExtensionAPI): void {
  // 依存関係の組み立て（DI）
  const repository = new FileWorkflowRepository();
  const workflowService = new WorkflowService({ repository });

  // 基本ツールの登録
  pi.registerTool(createStartTool(workflowService));
  pi.registerTool(createStatusTool(workflowService, (taskId) => repository.readPlanFile(taskId)));
  pi.registerTool(createApproveTool(workflowService));
  pi.registerTool(createAbortTool(workflowService));
  pi.registerTool(createResumeTool(workflowService));

  // スラッシュコマンドの登録
  registerCommands(pi, workflowService, repository);
}

/**
 * スラッシュコマンドを登録
 * @summary コマンド登録
 * @param pi - 拡張機能API
 * @param workflowService - ワークフローサービス
 * @param repository - リポジトリ
 */
function registerCommands(
  pi: ExtensionAPI,
  workflowService: WorkflowService,
  repository: FileWorkflowRepository
): void {
  pi.registerCommand("ul-workflow-start", {
    description: "UL Workflow Modeを開始（従来のスタイル）",
    handler: async (args, ctx) => {
      const task = args.trim();
      if (!task) {
        ctx.ui.notify("タスク説明を入力してください: /ul-workflow-start <task>", "warning");
        return;
      }

      const result = await workflowService.start(task);
      if (!result.success) {
        ctx.ui.notify(`エラー: ${result.error}`, "warning");
        return;
      }

      const phaseStr = result.phases!.join(" -> ");
      ctx.ui.notify(`ワークフロー開始: ${result.taskId}\nフェーズ: ${phaseStr}`, "info");
    },
  });

  pi.registerCommand("ul-workflow-status", {
    description: "ワークフローのステータスを表示",
    handler: async (_args, ctx) => {
      const workflow = await workflowService.getStatus();
      if (!workflow) {
        ctx.ui.notify("アクティブなワークフローはありません", "info");
        return;
      }
      const phaseStr = workflow.phases
        .map((p, i) => (i === workflow.phaseIndex ? `[${p.toUpperCase()}]` : p.toUpperCase()))
        .join(" -> ");
      ctx.ui.notify(
        `Task: ${workflow.taskId}\nPhases: ${phaseStr}\nApproved: ${workflow.approvedPhases.join(", ") || "none"}`,
        "info"
      );
    },
  });

  pi.registerCommand("ul-workflow-approve", {
    description: "現在のフェーズを承認",
    handler: async (_args, ctx) => {
      const result = await workflowService.approve();
      if (!result.success) {
        ctx.ui.notify(`エラー: ${result.error}`, "warning");
        return;
      }
      ctx.ui.notify(`${result.previousPhase!.toUpperCase()} 承認 → ${result.nextPhase!.toUpperCase()}`, "info");
    },
  });

  pi.registerCommand("ul-workflow-abort", {
    description: "ワークフローを中止",
    handler: async (_args, ctx) => {
      const result = await workflowService.abort();
      if (!result.success) {
        ctx.ui.notify("エラー: アクティブなワークフローがありません", "warning");
        return;
      }
      ctx.ui.notify(`ワークフロー中止: ${result.taskId}`, "info");
    },
  });
}
