/**
 * @abdd.meta
 * path: .pi/lib/subagents/adapters/index.ts
 * role: Adapters層のエクスポート
 * why: アダプターモジュールへの統一アクセスを提供
 * related: ./file-subagent-repo.ts, ./runtime-coordinator.ts
 * public_api: FileSubagentRepository, RuntimeCoordinatorImpl
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: Adapters層の統一エクスポート
 * what_it_does: アダプターモジュールの再エクスポート
 * why_it_exists: インポートパスの簡素化
 * scope:
 *   in: すべてのアダプターファイル
 *   out: infrastructure層
 */

export { FileSubagentRepository } from "./file-subagent-repo.js";
export { RuntimeCoordinatorImpl } from "./runtime-coordinator.js";
