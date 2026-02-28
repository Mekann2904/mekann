/**
 * @abdd.meta
 * path: .pi/lib/self-improvement/application/index.ts
 * role: アプリケーション層のエクスポート集約
 * why: アプリケーション層の公開APIを一箇所に集約し、他層からの依存を明確にするため
 * related: ./loop-service.ts
 * public_api: アプリケーション層のすべての公開API
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: アプリケーション層のエクスポート集約ファイル
 * what_it_does:
 *   - ループサービスの再エクスポート
 * why_it_exists:
 *   - 他層からのインポートを簡素化するため
 * scope:
 *   in: ./loop-service.ts
 *   out: 拡張機能層
 */

export {
  SelfImprovementLoopService,
  createLoopService,
  type LoopServiceDependencies,
  type LoopServiceConfig,
} from "./loop-service.js";
