/**
 * @abdd.meta
 * path: .pi/lib/ul-workflow/adapters/tools/approve-tool.ts
 * role: ul_workflow_approve ツール定義
 * why: フェーズ承認ツールを分離
 * related: ./tool-utils.ts, ../../application/workflow-service.ts
 * public_api: createApproveTool
 * invariants: なし
 * side_effects: フェーズ遷移
 * failure_modes: 所有権エラー、フェーズエラー
 * @abdd.explain
 * overview: フェーズ承認ツール
 * what_it_does:
 *   - 現在のフェーズを承認
 *   - 次のフェーズへ進む
 *   - 次のアクションを提示
 * why_it_exists: ツール定義を分離して保守性を向上
 * scope:
 *   in: WorkflowService
 *   out: extension.ts
 */

import { Type } from "@mariozechner/pi-ai";
import { WorkflowService } from "../../application/workflow-service.js";
import { makeResult, makeError, getTaskDir } from "./tool-utils.js";

/**
 * ul_workflow_approve ツールを作成
 * @summary 承認ツール作成
 * @param workflowService - ワークフローサービス
 * @returns ツール定義
 */
export function createApproveTool(workflowService: WorkflowService) {
  return {
    name: "ul_workflow_approve",
    label: "Approve UL Workflow Phase",
    description: "現在のフェーズを承認して次へ進む",
    parameters: Type.Object({}),
    async execute(
      _toolCallId: string,
      _params: Record<string, never>,
      _signal: unknown,
      _onUpdate: unknown,
      _ctx: unknown
    ) {
      const result = await workflowService.approve();

      if (!result.success) {
        return makeError(
          result.nextAction || result.error || "不明なエラー",
          result.error || "unknown"
        );
      }

      let text = `フェーズ ${result.previousPhase!.toUpperCase()} を承認しました。\n\n次のフェーズ: ${result.nextPhase!.toUpperCase()}\n`;

      if (result.nextPhase === "plan") {
        const workflow = await workflowService.getStatus();
        text += `\n計画を作成するには:\n  ul_workflow_plan({ task: "${workflow?.taskDescription}", task_id: "${workflow?.taskId}" })\n`;
      } else if (result.nextPhase === "annotate") {
        const workflow = await workflowService.getStatus();
        text += `\nplan.md をエディタで開いて注釈を追加してください:\n  .pi/ul-workflow/tasks/${workflow?.taskId}/plan.md\n\n注釈形式:\n  <!-- NOTE: ここに注釈を記述 -->\n  または\n  [注釈]: ここに注釈を記述\n`;
      } else if (result.nextPhase === "implement") {
        const workflow = await workflowService.getStatus();
        text += `\n実装を開始するには:\n  ul_workflow_implement({ task_id: "${workflow?.taskId}" })\n`;
      } else if (result.nextPhase === "completed") {
        const workflow = await workflowService.getStatus();
        text += `\nワークフローが完了しました。\n\n`;
        text += `### 次のステップ: コミット\n\n`;
        text += `実装完了後、コミットを作成することを強く推奨します:\n\n`;
        text += `\`\`\`\n`;
        text += `ul_workflow_commit()\n`;
        text += `\`\`\`\n`;
      }

      return makeResult(text, {
        previousPhase: result.previousPhase,
        nextPhase: result.nextPhase,
      });
    },
  };
}
