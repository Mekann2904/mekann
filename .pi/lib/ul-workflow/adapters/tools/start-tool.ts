/**
 * @abdd.meta
 * path: .pi/lib/ul-workflow/adapters/tools/start-tool.ts
 * role: ul_workflow_start ツール定義
 * why: ワークフロー開始ツールを分離
 * related: ./tool-utils.ts, ../../application/workflow-service.ts
 * public_api: createStartTool
 * invariants: なし
 * side_effects: ワークフロー開始
 * failure_modes: バリデーションエラー
 * @abdd.explain
 * overview: ワークフロー開始ツール
 * what_it_does:
 *   - タスク説明のバリデーション
 *   - ワークフロー開始
 *   - 次のアクション提示
 * why_it_exists: ツール定義を分離して保守性を向上
 * scope:
 *   in: WorkflowService
 *   out: extension.ts
 */

import { Type } from "@mariozechner/pi-ai";
import { WorkflowService } from "../../application/workflow-service.js";
import { determineWorkflowPhases } from "../../domain/execution-strategy.js";
import { makeResult, makeError, getTaskDir } from "./tool-utils.js";
import * as path from "path";

/**
 * ul_workflow_start ツールを作成
 * @summary 開始ツール作成
 * @param workflowService - ワークフローサービス
 * @returns ツール定義
 */
export function createStartTool(workflowService: WorkflowService) {
  return {
    name: "ul_workflow_start",
    label: "Start UL Workflow",
    description: "UL Workflow Modeを開始（Research-Plan-Annotate-Implement）",
    parameters: Type.Object({
      task: Type.String({ description: "実行するタスクの説明" }),
    }),
    async execute(
      _toolCallId: string,
      params: { task: string },
      _signal: unknown,
      _onUpdate: unknown,
      _ctx: unknown
    ) {
      const { task } = params;

      // バリデーション
      const trimmedTask = String(task || "").trim();
      if (!trimmedTask) {
        return makeError(
          "タスク説明を入力してください。\n\n使用例:\n  ul_workflow_start({ task: 'バグを修正する' })",
          "empty_task"
        );
      }

      if (trimmedTask.length < 5) {
        return makeError(
          `タスク説明が短すぎます（現在: ${trimmedTask.length}文字）。\n\n少なくとも5文字以上の説明を入力してください。`,
          "task_too_short",
          { length: trimmedTask.length }
        );
      }

      // ワークフロー開始
      const result = await workflowService.start(trimmedTask);

      if (!result.success) {
        return makeError(result.nextAction || result.error || "不明なエラー", result.error || "unknown");
      }

      const phases = result.phases!.join(" -> ");

      return makeResult(
        `ワークフローを開始しました。

Task ID: ${result.taskId}
説明: ${task}

フェーズ構成: ${phases}
現在のフェーズ: ${result.phases![0]}

次のステップ:
1. researcher サブエージェントが調査を実行します
2. 調査結果は .pi/ul-workflow/tasks/${result.taskId}/research.md に保存されます
3. 調査が完了したら ul_workflow_approve で次のフェーズへ進みます

調査を実行するには:
  ul_workflow_research({ task: "${task}", task_id: "${result.taskId}" })
`,
        { taskId: result.taskId, phase: result.phases![0].toLowerCase(), phases: result.phases }
      );
    },
  };
}
