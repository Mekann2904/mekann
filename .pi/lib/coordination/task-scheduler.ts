/**
 * @abdd.meta
 * path: .pi/lib/coordination/task-scheduler.ts
 * role: タスクスケジューラモジュールの後方互換エントリポイント
 * why: 既存のコードが引き続き動作するようにするため
 * related: ./task-scheduler/index.ts
 * public_api: 全ての型と関数を再エクスポート
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: タスクスケジューラモジュールの後方互換レイヤー
 * what_it_does:
 *   - 新しいモジュール構造から全てを再エクスポート
 * why_it_exists: 既存のimportパスを維持しつつ、内部構造をクリーンアーキテクチャに分割するため
 * scope:
 *   in: なし
 *   out: 公開API（後方互換）
 */

// すべてを新しいモジュールから再エクスポート
export * from './task-scheduler/index.js';
