/**
 * @abdd.meta
 * path: .pi/lib/ul-workflow/adapters/tools/abort-resume-tools.ts
 * role: ul_workflow_abort, ul_workflow_resume ツール定義
 * why: 中止・再開ツールを分離
 * related: ./tool-utils.ts, ../../application/workflow-service.ts
 * public_api: createAbortTool, createResumeTool
 * invariants: なし
 * side_effects: ワークフロー状態変更
 * failure_modes: 所有権エラー
 * @abdd.explain
 * overview: 中止・再開ツール
 * what_it_does:
 *   - ワークフロー中止
 *   - 中止したワークフローの再開
 * why_it_exists: ツール定義を分離して保守性を向上
 * scope:
 *   in: WorkflowService
 *   out: extension.ts
 */

import { Type } from "@mariozechner/pi-ai";
import { WorkflowService } from "../../application/workflow-service.js";
import { makeResult, makeError, getTaskDir } from "./tool-utils.js";

/**
 * ul_workflow_abort ツールを作成
 * @summary 中止ツール作成
 * @param workflowService - ワークフローサービス
 * @returns ツール定義
 */
export function createAbortTool(workflowService: WorkflowService) {
  return {
    name: "ul_workflow_abort",
    label: "Abort UL Workflow",
    description: "ワークフローを中止",
    parameters: Type.Object({}),
    async execute(
      _toolCallId: string,
      _params: Record<string, never>,
      _signal: unknown,
      _onUpdate: unknown,
      _ctx: unknown
    ) {
      const result = await workflowService.abort();

      if (!result.success) {
        return makeError(
          "アクティブなワークフローがありません。",
          result.error || "no_active_workflow"
        );
      }

      return makeResult(
        `ワークフローを中止しました。

Task ID: ${result.taskId}
状態: aborted

ファイルは保持されています:
  .pi/ul-workflow/tasks/${result.taskId}/

再開するには:
  ul_workflow_resume({ task_id: "${result.taskId}" })
`,
        { taskId: result.taskId, phase: "aborted" }
      );
    },
  };
}

/**
 * ul_workflow_resume ツールを作成
 * @summary 再開ツール作成
 * @param workflowService - ワークフローサービス
 * @returns ツール定義
 */
export function createResumeTool(workflowService: WorkflowService) {
  return {
    name: "ul_workflow_resume",
    label: "Resume UL Workflow",
    description: "中止したワークフローを再開",
    parameters: Type.Object({
      task_id: Type.String({ description: "再開するタスクID" }),
    }),
    async execute(
      _toolCallId: string,
      params: { task_id: string },
      _signal: unknown,
      _onUpdate: unknown,
      _ctx: unknown
    ) {
      const result = await workflowService.resume(params.task_id);

      if (!result.success) {
        return makeError(
          result.error === "task_not_found"
            ? `タスク ${params.task_id} が見つかりません。`
            : result.error || "不明なエラー",
          result.error || "unknown"
        );
      }

      return makeResult(
        `ワークフローを再開しました。

Task ID: ${params.task_id}
フェーズ: ${result.phase!.toUpperCase()}

次のステップ:
  ul_workflow_status で詳細を確認
`,
        { taskId: params.task_id, phase: result.phase }
      );
    },
  };
}
