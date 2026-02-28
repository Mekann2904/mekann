/**
 * @abdd.meta
 * path: .pi/lib/agent-runtime/application/interfaces.ts
 * role: Application層のインターフェース定義
 * why: 依存関係逆転の原則（DIP）に従い、詳細に依存しないため
 * related: ./runtime-service.ts, ../domain/runtime-state.ts
 * public_api: IRuntimeStateProvider, ICapacityManager, IDispatchPermitManager
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: Application層のポート（インターフェース）
 * what_it_does:
 *   - 状態プロバイダーインターフェース
 *   - 容量マネージャーインターフェース
 *   - ディスパッチ許可マネージャーIF
 * why_it_exists: DIPにより、ビジネスロジックをインフラストラクチャから分離
 * scope:
 *   in: domain層
 *   out: adapters層の実装
 */

import type {
  AgentRuntimeState,
  AgentRuntimeLimits,
  RuntimeQueueEntry,
  TaskPriority,
  RuntimeQueueClass,
} from "../domain/runtime-state.js";
import type { RuntimeCapacityCheck } from "../domain/capacity-check.js";

/**
 * ランタイムスナップショット
 * @summary スナップショット
 */
export interface AgentRuntimeSnapshot {
  subagentActiveRequests: number;
  subagentActiveAgents: number;
  teamActiveRuns: number;
  teamActiveAgents: number;
  reservedRequests: number;
  reservedLlm: number;
  activeReservations: number;
  consumedReservations: number;
  consumedRequests: number;
  consumedLlm: number;
  activeOrchestrations: number;
  queuedOrchestrations: number;
  queuedTools: string[];
  queueEvictions: number;
  totalActiveRequests: number;
  totalActiveLlm: number;
  limitsVersion: string;
  priorityStats: {
    critical: number;
    high: number;
    normal: number;
    low: number;
    background: number;
  };
  limits: AgentRuntimeLimits;
}

/**
 * ランタイム状態プロバイダーインターフェース
 * @summary 状態プロバイダーIF
 */
export interface IRuntimeStateProvider {
  /**
   * 状態を取得
   * @summary 状態取得
   * @returns ランタイム状態
   */
  getState(): AgentRuntimeState;

  /**
   * 状態を非同期で取得
   * @summary 状態非同期取得
   * @returns ランタイム状態のPromise
   */
  getStateAsync(): Promise<AgentRuntimeState>;

  /**
   * 状態をリセット
   * @summary 状態リセット
   */
  resetState(): void;
}

/**
 * 容量予約リース
 * @summary 予約リース
 */
export interface RuntimeCapacityReservationLease {
  /** 予約ID */
  id: string;
  /** ツール名 */
  toolName: string;
  /** 追加リクエスト数 */
  additionalRequests: number;
  /** 追加LLM数 */
  additionalLlm: number;
  /** 有効期限（ミリ秒） */
  expiresAtMs: number;
  /**
   * 予約を消費
   * @summary 消費
   */
  consume(): void;
  /**
   * ハートビートを送信
   * @summary ハートビート
   * @param ttlMs - TTL（ミリ秒）
   */
  heartbeat(ttlMs?: number): void;
  /**
   * 予約を解放
   * @summary 解放
   */
  release(): void;
}

/**
 * 容量マネージャーインターフェース
 * @summary 容量マネージャーIF
 */
export interface ICapacityManager {
  /**
   * 容量をチェック
   * @summary 容量チェック
   * @param additionalRequests - 追加リクエスト数
   * @param additionalLlm - 追加LLM数
   * @returns 容量チェック結果
   */
  checkCapacity(
    additionalRequests: number,
    additionalLlm: number
  ): RuntimeCapacityCheck;

  /**
   * 容量を予約
   * @summary 容量予約
   * @param toolName - ツール名
   * @param additionalRequests - 追加リクエスト数
   * @param additionalLlm - 追加LLM数
   * @param ttlMs - TTL（ミリ秒）
   * @returns 予約リース（失敗時はnull）
   */
  reserveCapacity(
    toolName: string,
    additionalRequests: number,
    additionalLlm: number,
    ttlMs?: number
  ): RuntimeCapacityReservationLease | null;

  /**
   * スナップショットを取得
   * @summary スナップショット取得
   * @returns ランタイムスナップショット
   */
  getSnapshot(): AgentRuntimeSnapshot;
}

/**
 * ディスパッチ許可入力
 * @summary 許可入力
 */
export interface RuntimeDispatchPermitInput {
  /** ツール名 */
  toolName: string;
  /** 追加リクエスト数 */
  additionalRequests?: number;
  /** 追加LLM数 */
  additionalLlm?: number;
  /** テナントキー */
  tenantKey?: string;
  /** ソース */
  source?: string;
  /** 優先度 */
  priority?: TaskPriority;
  /** キュー分類 */
  queueClass?: RuntimeQueueClass;
  /** 推定実行時間（ミリ秒） */
  estimatedDurationMs?: number;
  /** 推定ラウンド数 */
  estimatedRounds?: number;
  /** 最大待機時間（ミリ秒） */
  maxWaitMs?: number;
  /** ULタスクID */
  ulTaskId?: string;
}

/**
 * ディスパッチ許可リース
 * @summary 許可リース
 */
export interface RuntimeDispatchPermitLease {
  /** 許可ID */
  id: string;
  /** ツール名 */
  toolName: string;
  /** 許可時刻（ミリ秒） */
  permittedAtMs: number;
  /** 追加リクエスト数 */
  additionalRequests: number;
  /** 追加LLM数 */
  additionalLlm: number;
  /**
   * 許可を消費
   * @summary 消費
   */
  consume(): void;
  /**
   * 許可を解放
   * @summary 解放
   */
  release(): void;
}

/**
 * ディスパッチ許可結果
 * @summary 許可結果
 */
export interface RuntimeDispatchPermitResult {
  /** 許可フラグ */
  allowed: boolean;
  /** 許可リース（許可された場合） */
  lease?: RuntimeDispatchPermitLease;
  /** 拒否理由 */
  reasons?: string[];
  /** 待機時間（ミリ秒） */
  waitedMs?: number;
  /** タイムアウトフラグ */
  timedOut?: boolean;
  /** 中止フラグ */
  aborted?: boolean;
}

/**
 * ディスパッチ許可マネージャーインターフェース
 * @summary 許可マネージャーIF
 */
export interface IDispatchPermitManager {
  /**
   * ディスパッチ許可を取得
   * @summary 許可取得
   * @param input - 許可入力
   * @param signal - 中止シグナル
   * @returns 許可結果
   */
  acquirePermit(
    input: RuntimeDispatchPermitInput,
    signal?: AbortSignal
  ): Promise<RuntimeDispatchPermitResult>;

  /**
   * アクティブ数を取得
   * @summary アクティブ数取得
   * @returns アクティブ数
   */
  getActiveCount(): number;

  /**
   * 最大同時実行数を取得
   * @summary 最大同時実行数取得
   * @returns 最大同時実行数
   */
  getMaxConcurrency(): number;
}

/**
 * ランタイムサービスの依存関係
 * @summary サービス依存
 */
export interface RuntimeServiceDependencies {
  stateProvider: IRuntimeStateProvider;
  capacityManager: ICapacityManager;
  dispatchManager: IDispatchPermitManager;
}
