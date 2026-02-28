/**
 * @abdd.meta
 * path: .pi/lib/subagents/infrastructure/index.ts
 * role: Infrastructure層のエクスポート
 * why: インフラストラクチャモジュールへの統一アクセスを提供
 * related: ./extension-adapter.ts
 * public_api: createSubagentTools, SubagentToolFactory
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: Infrastructure層の統一エクスポート
 * what_it_does: インフラストラクチャモジュールの再エクスポート
 * why_it_exists: インポートパスの簡素化
 * scope:
 *   in: すべてのインフラストラクチャファイル
 *   out: 外部コンシューマー
 */

export {
  createSubagentTools,
  SubagentToolFactory,
} from "./extension-adapter.js";
