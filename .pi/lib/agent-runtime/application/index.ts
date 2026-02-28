/**
 * @abdd.meta
 * path: .pi/lib/agent-runtime/application/index.ts
 * role: Application層のエクスポート
 * why: アプリケーションモジュールへの統一アクセスを提供
 * related: ./interfaces.ts, ./runtime-service.ts
 * public_api: RuntimeService, すべてのインターフェース
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

export { RuntimeService } from "./runtime-service.js";

export {
  type AgentRuntimeSnapshot,
  type IRuntimeStateProvider,
  type ICapacityManager,
  type IDispatchPermitManager,
  type RuntimeCapacityReservationLease,
  type RuntimeDispatchPermitInput,
  type RuntimeDispatchPermitLease,
  type RuntimeDispatchPermitResult,
  type RuntimeServiceDependencies,
} from "./interfaces.js";
