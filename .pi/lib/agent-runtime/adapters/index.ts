/**
 * @abdd.meta
 * path: .pi/lib/agent-runtime/adapters/index.ts
 * role: Adapters層のエクスポート
 * why: アダプターモジュールへの統一アクセスを提供
 * related: ./global-state-provider.ts
 * public_api: GlobalRuntimeStateProvider
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

export { GlobalRuntimeStateProvider } from "./global-state-provider.js";
