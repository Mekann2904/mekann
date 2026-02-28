/**
 * @abdd.meta
 * path: .pi/lib/ul-workflow/application/index.ts
 * role: Application層のエクスポート
 * why: アプリケーションモジュールへの統一アクセスを提供
 * related: ./workflow-service.ts, ./interfaces.ts
 * public_api: WorkflowService, すべてのインターフェース
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: Application層の統一エクスポート
 * what_it_does: アプリケーションモジュールの再エクスポート
 * why_it_exists: インポートパスの簡素化
 * scope:
 *   in: workflow-service.ts, interfaces.ts
 *   out: adapters層
 */

export { WorkflowService } from "./workflow-service.js";
export {
  type IWorkflowRepository,
  type ISubagentRunner,
  type IQuestionUI,
  type SubagentResult,
  type QuestionOption,
  type QuestionResult,
  type WorkflowServiceDependencies,
  type StartWorkflowResult,
  type ApprovePhaseResult,
} from "./interfaces.js";
