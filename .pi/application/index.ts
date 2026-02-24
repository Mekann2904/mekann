/**
 * @abdd.meta
 * path: .pi/application/index.ts
 * role: applicationモジュールのエクスポートエントリポイント
 * why: 他の層からapplicationへの依存を一箇所に集約するため
 * related: core, adapters
 * public_api: 全ポートとDTO
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: applicationモジュール（Application Business Rules）の全エクスポート
 * what_it_does:
 *   - ポート（インターフェース）のエクスポート
 *   - DTOのエクスポート
 * why_it_exists:
 *   - 依存関係を整理し、一箇所からのインポートを可能にするため
 * scope:
 *   in: ports/*.ts, dto/*.ts
 *   out: adapters層、extensions
 */

// Ports (Interfaces)
export * from "./ports/index.js";
