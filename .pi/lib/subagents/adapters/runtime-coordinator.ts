/**
 * @abdd.meta
 * path: .pi/lib/subagents/adapters/runtime-coordinator.ts
 * role: ランタイムコーディネーターの実装
 * why: IRuntimeCoordinatorインターフェースの具体実装を提供
 * related: ../application/interfaces.ts, ../../extensions/agent-runtime.ts
 * public_api: RuntimeCoordinatorImpl
 * invariants: 同時実行数が上限を超えない
 * side_effects: 共有ランタイム状態の更新
 * failure_modes: キャパシティ超過
 * @abdd.explain
 * overview: ランタイムリソースの協調制御
 * what_it_does:
 *   - 実行許可の取得・解放
 *   - 同時実行数の管理
 *   - キャパシティチェック
 * why_it_exists: リソース管理をビジネスロジックから分離
 * scope:
 *   in: Application層のインターフェース
 *   out: 共有ランタイム状態
 */

import type { IRuntimeCoordinator, RuntimePermit } from "../application/interfaces.js";
import { getSharedRuntimeState, notifyRuntimeCapacityChanged } from "../../extensions/agent-runtime.js";

/**
 * ランタイムコーディネーター実装
 * @summary ランタイムコーディネーター
 */
export class RuntimeCoordinatorImpl implements IRuntimeCoordinator {
  private permits: Map<string, RuntimePermit> = new Map();
  private permitCounter = 0;

  /**
   * 実行許可を取得
   * @summary 許可取得
   * @param subagentId - サブエージェントID
   * @returns 実行許可またはnull（キャパシティ超過時）
   */
  async acquirePermit(subagentId: string): Promise<RuntimePermit | null> {
    const state = getSharedRuntimeState();
    const snapshot = {
      activeRequests: state.subagents.activeRunRequests,
      activeAgents: state.subagents.activeAgents,
      maxRequests: 2, // PI_AGENT_MAX_TOTAL_REQUESTS デフォルト
      maxAgents: 4, // PI_AGENT_MAX_TOTAL_LLM デフォルト
    };

    // キャパシティチェック
    if (snapshot.activeRequests >= snapshot.maxRequests) {
      return null;
    }

    if (snapshot.activeAgents >= snapshot.maxAgents) {
      return null;
    }

    // 許可を作成
    const permit: RuntimePermit = {
      id: `permit-${++this.permitCounter}`,
      subagentId,
      acquiredAt: new Date(),
    };

    this.permits.set(permit.id, permit);

    // ランタイム状態を更新
    state.subagents.activeRunRequests++;
    state.subagents.activeAgents++;
    notifyRuntimeCapacityChanged();

    return permit;
  }

  /**
   * 実行許可を解放
   * @summary 許可解放
   * @param permit - 実行許可
   */
  releasePermit(permit: RuntimePermit): void {
    if (!this.permits.has(permit.id)) {
      return;
    }

    this.permits.delete(permit.id);

    // ランタイム状態を更新
    const state = getSharedRuntimeState();
    state.subagents.activeRunRequests = Math.max(
      0,
      state.subagents.activeRunRequests - 1
    );
    state.subagents.activeAgents = Math.max(
      0,
      state.subagents.activeAgents - 1
    );
    notifyRuntimeCapacityChanged();
  }

  /**
   * 現在の同時実行数を取得
   * @summary 同時実行数取得
   * @returns 同時実行数
   */
  getActiveCount(): number {
    const state = getSharedRuntimeState();
    return state.subagents.activeAgents;
  }

  /**
   * 最大同時実行数を取得
   * @summary 最大同時実行数取得
   * @returns 最大同時実行数
   */
  getMaxConcurrency(): number {
    // 環境変数から取得（デフォルト4）
    return parseInt(process.env.PI_AGENT_MAX_TOTAL_LLM ?? "4", 10);
  }
}
