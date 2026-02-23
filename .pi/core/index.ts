/**
 * @abdd.meta
 * path: .pi/core/index.ts
 * role: coreモジュールのエクスポートエントリポイント
 * why: 他の層からcoreへの依存を一箇所に集約するため
 * related: application/use-cases, adapters
 * public_api: 全ドメインモデルとドメインサービス
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: coreモジュール（Enterprise Business Rules）の全エクスポート
 * what_it_does:
 *   - agentドメインのエクスポート
 *   - teamドメインのエクスポート
 *   - planドメインのエクスポート
 * why_it_exists:
 *   - 依存関係を整理し、一箇所からのインポートを可能にするため
 * scope:
 *   in: domain/*.ts
 *   out: application層、adapters層
 */

// Domain Models
export * from "./domain/agent.js";
export * from "./domain/team.js";
export * from "./domain/plan.js";
