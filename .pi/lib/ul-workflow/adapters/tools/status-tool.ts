/**
 * @abdd.meta
 * path: .pi/lib/ul-workflow/adapters/tools/status-tool.ts
 * role: ul_workflow_status ツール定義
 * why: ワークフローステータス表示ツールを分離
 * related: ./tool-utils.ts, ../../application/workflow-service.ts
 * public_api: createStatusTool
 * invariants: なし
 * side_effects: なし（読み取りのみ）
 * failure_modes: なし
 * @abdd.explain
 * overview: ワークフローステータスツール
 * what_it_does:
 *   - 現在のワークフロー状態を表示
 *   - フェーズ進捗を表示
 *   - 次のアクションを提示
 * why_it_exists: ツール定義を分離して保守性を向上
 * scope:
 *   in: WorkflowService, domain層
 *   out: extension.ts
 */

import { Type } from "@mariozechner/pi-ai";
import { WorkflowService } from "../../application/workflow-service.js";
import { getPhaseDescription } from "../../domain/workflow-state.js";
import { makeResult, getTaskDir } from "./tool-utils.js";
import type { WorkflowState } from "../../domain/workflow-state.js";

/**
 * 注釈を抽出
 * @summary 注釈抽出
 * @param content - plan.mdの内容
 * @returns 注釈の配列
 */
function extractAnnotations(content: string): string[] {
  const annotations: string[] = [];

  // NOTE形式
  const notePattern = /<!--\s*NOTE:\s*([\s\S]+?)\s*-->/g;
  let match;
  while ((match = notePattern.exec(content)) !== null) {
    annotations.push(match[1].trim());
  }

  // 日本語形式
  const jpPattern = /\[注釈\]:\s*(.+?)(?=\n|$)/g;
  while ((match = jpPattern.exec(content)) !== null) {
    annotations.push(match[1].trim());
  }

  // ANNOTATION形式
  const annPattern = /<!--\s*ANNOTATION:\s*([\s\S]+?)\s*-->/g;
  while ((match = annPattern.exec(content)) !== null) {
    annotations.push(match[1].trim());
  }

  return annotations;
}

/**
 * ul_workflow_status ツールを作成
 * @summary ステータスツール作成
 * @param workflowService - ワークフローサービス
 * @param readPlanFile - plan.md読み込み関数
 * @returns ツール定義
 */
export function createStatusTool(
  workflowService: WorkflowService,
  readPlanFile: (taskId: string) => Promise<string>
) {
  return {
    name: "ul_workflow_status",
    label: "UL Workflow Status",
    description: "現在のワークフローステータスを表示",
    parameters: Type.Object({}),
    async execute(
      _toolCallId: string,
      _params: Record<string, never>,
      _signal: unknown,
      _onUpdate: unknown,
      _ctx: unknown
    ) {
      const workflow = await workflowService.getStatus();

      if (!workflow) {
        return makeResult(
          `アクティブなワークフローはありません。

新しいワークフローを開始するには:
  ul_workflow_start({ task: "タスク説明" })
`,
          { active: false }
        );
      }

      const planAnnotations =
        workflow.phase === "annotate" || workflow.phase === "implement"
          ? extractAnnotations(await readPlanFile(workflow.taskId))
          : [];

      const phasesDisplay = workflow.phases
        .map((p, i) => {
          const marker = i === workflow.phaseIndex ? ">" : " ";
          const check = workflow.approvedPhases.includes(p) ? "x" : " ";
          return `${marker} [${check}] ${p.toUpperCase()}`;
        })
        .join("\n");

      let text = `ワークフローステータス

Task ID: ${workflow.taskId}
説明: ${workflow.taskDescription}
作成日時: ${workflow.createdAt}
更新日時: ${workflow.updatedAt}
所有者: ${workflow.ownerInstanceId || "unknown"}

フェーズ構成:
${phasesDisplay}

現在のフェーズ: ${workflow.phase.toUpperCase()}
  ${getPhaseDescription(workflow.phase)}

承認済みフェーズ: ${workflow.approvedPhases.join(", ") || "なし"}
注釈数: ${planAnnotations.length}

ファイル:
  - task.md: .pi/ul-workflow/tasks/${workflow.taskId}/task.md
  - research.md: .pi/ul-workflow/tasks/${workflow.taskId}/research.md
  - plan.md: .pi/ul-workflow/tasks/${workflow.taskId}/plan.md
  - status.json: .pi/ul-workflow/tasks/${workflow.taskId}/status.json
`;

      if (planAnnotations.length > 0) {
        text += `\n注釈一覧:\n${planAnnotations.map((a, i) => `  ${i + 1}. ${a}`).join("\n")}\n`;
      }

      if (workflow.phase === "annotate") {
        text += `
次のステップ:
1. plan.md をエディタで開いて注釈を追加してください
   <!-- NOTE: 形式または [注釈]: 形式で記述 -->
2. ul_workflow_annotate で注釈を適用
3. 満足したら ul_workflow_approve で実装フェーズへ
`;
      }

      return makeResult(text, {
        taskId: workflow.taskId,
        phase: workflow.phase,
        phases: workflow.phases,
      });
    },
  };
}
