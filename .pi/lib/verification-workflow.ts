/**
 * @abdd.meta
 * path: .pi/lib/verification-workflow.ts
 * role: 検証ワークフローの後方互換性エクスポート
 * why: モジュール分割後も既存のインポートパスを維持するため
 * related: ./verification/index.ts, ./verification-workflow-types.ts
 * public_api: 全検証ワークフロー関連の型、関数、定数（verification/から再エクスポート）
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: 検証ワークフローの後方互換性エクスポート
 * what_it_does:
 *   - 新しいモジュール構造（verification/）から全てを再エクスポート
 *   - 既存のインポートパスを維持
 * why_it_exists:
 *   - モジュール分割による破壊的変更を防ぐ
 *   - 段階的な移行を可能にする
 * scope:
 *   in: verification/index.ts
 *   out: 全てのコンシューマー
 *
 * @deprecated 新規コードでは `./verification/index.js` から直接インポートしてください
 */

// ============================================================================
// 全てのエクスポートを新しいモジュールから再エクスポート
// ============================================================================

export * from "./verification/index.js";
