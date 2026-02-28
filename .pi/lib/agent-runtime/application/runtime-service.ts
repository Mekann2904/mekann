/**
 * @abdd.meta
 * path: .pi/lib/agent-runtime/application/runtime-service.ts
 * role: ランタイム管理のユースケース
 * why: ランタイム操作のビジネスルールを集約
 * related: ./interfaces.ts, ../domain/runtime-state.ts
 * public_api: RuntimeService
 * invariants: なし
 * side_effects: プロバイダ経由でI/O
 * failure_modes: プロバイダエラー、容量超過
 * @abdd.explain
 * overview: ランタイムのアプリケーションサービス
 * what_it_does:
 *   - 状態管理ユースケース
 *   - 容量チェックユースケース
 *   - 許可管理ユースケース
 * why_it_exists: ビジネスロジックをインフラストラクチャから分離
 * scope:
 *   in: domain層、interfaces
 *   out: adapters層から呼び出される
 */

import type {
  IRuntimeStateProvider,
  ICapacityManager,
  IDispatchPermitManager,
  RuntimeServiceDependencies,
  AgentRuntimeSnapshot,
  RuntimeDispatchPermitInput,
  RuntimeDispatchPermitResult,
} from "./interfaces.js";
import type { AgentRuntimeState, AgentRuntimeLimits } from "../domain/runtime-state.js";
import { checkCapacity, calculateProjectedUsage } from "../domain/capacity-check.js";

/**
 * ランタイムサービス
 * @summary ランタイムサービス
 */
export class RuntimeService {
  private stateProvider: IRuntimeStateProvider;
  private capacityManager: ICapacityManager;
  private dispatchManager: IDispatchPermitManager;

  constructor(deps: RuntimeServiceDependencies) {
    this.stateProvider = deps.stateProvider;
    this.capacityManager = deps.capacityManager;
    this.dispatchManager = deps.dispatchManager;
  }

  /**
   * 状態を取得
   * @summary 状態取得
   * @returns ランタイム状態
   */
  getState(): AgentRuntimeState {
    return this.stateProvider.getState();
  }

  /**
   * 状態を非同期で取得
   * @summary 状態非同期取得
   * @returns ランタイム状態のPromise
   */
  async getStateAsync(): Promise<AgentRuntimeState> {
    return this.stateProvider.getStateAsync();
  }

  /**
   * 状態をリセット
   * @summary 状態リセット
   */
  resetState(): void {
    this.stateProvider.resetState();
  }

  /**
   * スナップショットを取得
   * @summary スナップショット取得
   * @returns ランタイムスナップショット
   */
  getSnapshot(): AgentRuntimeSnapshot {
    return this.capacityManager.getSnapshot();
  }

  /**
   * 容量をチェック
   * @summary 容量チェック
   * @param additionalRequests - 追加リクエスト数
   * @param additionalLlm - 追加LLM数
   * @returns 容量チェック結果
   */
  checkCapacity(additionalRequests: number, additionalLlm: number) {
    return this.capacityManager.checkCapacity(additionalRequests, additionalLlm);
  }

  /**
   * ディスパッチ許可を取得
   * @summary 許可取得
   * @param input - 許可入力
   * @param signal - 中止シグナル
   * @returns 許可結果
   */
  async acquirePermit(
    input: RuntimeDispatchPermitInput,
    signal?: AbortSignal
  ): Promise<RuntimeDispatchPermitResult> {
    return this.dispatchManager.acquirePermit(input, signal);
  }

  /**
   * アクティブ数を取得
   * @summary アクティブ数取得
   * @returns アクティブ数
   */
  getActiveCount(): number {
    return this.dispatchManager.getActiveCount();
  }

  /**
   * 最大同時実行数を取得
   * @summary 最大同時実行数取得
   * @returns 最大同時実行数
   */
  getMaxConcurrency(): number {
    return this.dispatchManager.getMaxConcurrency();
  }

  /**
   * 制限を取得
   * @summary 制限取得
   * @returns ランタイム制限
   */
  getLimits(): AgentRuntimeLimits {
    return this.getState().limits;
  }

  /**
   * 使用率を計算
   * @summary 使用率計算
   * @returns リクエスト使用率とLLM使用率
   */
  getUtilization(): { requestUtilization: number; llmUtilization: number } {
    const snapshot = this.getSnapshot();
    const requestUtilization = snapshot.limits.maxTotalActiveRequests > 0
      ? snapshot.totalActiveRequests / snapshot.limits.maxTotalActiveRequests
      : 0;
    const llmUtilization = snapshot.limits.maxTotalActiveLlm > 0
      ? snapshot.totalActiveLlm / snapshot.limits.maxTotalActiveLlm
      : 0;
    return { requestUtilization, llmUtilization };
  }

  /**
   * 容量が利用可能かチェック
   * @summary 容量可用チェック
   * @param additionalRequests - 追加リクエスト数
   * @param additionalLlm - 追加LLM数
   * @returns 利用可能フラグ
   */
  hasCapacity(additionalRequests: number, additionalLlm: number): boolean {
    const check = this.checkCapacity(additionalRequests, additionalLlm);
    return check.allowed;
  }
}
