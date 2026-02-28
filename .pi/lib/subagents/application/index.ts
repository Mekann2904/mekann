/**
 * @abdd.meta
 * path: .pi/lib/subagents/application/index.ts
 * role: Application層のエクスポート
 * why: アプリケーションモジュールへの統一アクセスを提供
 * related: ./interfaces.ts, ./subagent-service.ts
 * public_api: SubagentService, すべてのインターフェース
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: Application層の統一エクスポート
 * what_it_does: アプリケーションモジュールの再エクスポート
 * why_it_exists: インポートパスの簡素化
 * scope:
 *   in: すべてのアプリケーションファイル
 *   out: adapters層、infrastructure層
 */

export { SubagentService } from "./subagent-service.js";
export {
  type ISubagentRepository,
  type ISubagentExecutor,
  type IRuntimeCoordinator,
  type SubagentExecutionResult,
  type SubagentExecutionOptions,
  type SubagentServiceDependencies,
  type SubagentSelectionResult,
  type RuntimePermit,
} from "./interfaces.js";
