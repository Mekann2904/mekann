/**
 * @abdd.meta
 * path: .pi/lib/adaptive-rate-controller.ts
 * role: APIリクエストの同時実行制限を動的に調整し、レート制限（429エラー）を回避する適応的コントローラー
 * why: 固定された制限値では対処できない一時的な過負荷や変動するAPI制限に対応するため
 * related: provider-limits.ts, cross-instance-coordinator.ts, runtime-config.ts
 * public_api: LearnedLimit, AdaptiveControllerState, getLimit, recordResult
 * invariants: concurrencyはoriginalConcurrency以下に保たれる、recoveryIntervalMs経過後にのみ制限値が増加する
 * side_effects: SQLiteデータベースへの状態書き込み、同時実行制限値の変更
 * failure_modes: データベース接続エラー時は例外をスロー
 * @abdd.explain
 * overview: 429エラーを学習して同時実行数を減らし、成功履歴に基づいて徐々に回復させるフィードバックループを実装する
 * what_it_does:
 *   - provider-limitsから初期制限値を取得する
 *   - 429エラー発生時に制限値を30%（reductionFactor）減らす
 *   - 5分間（recoveryIntervalMs）の安定稼働後に制限値を徐々に復元する
 *   - プロバイダとモデルごとの制限状態を管理する
 *   - 履歴データに基づく予測的スケジューリングを行う
 * why_it_exists:
 *   - APIプロバイダの未定義のレート制限境界によるエラーを最小限に抑えるため
 *   - 過剰な保守的制限によるスループット低下を防ぐため
 *   - マルチインスタンス環境での一貫性を保つため
 * scope:
 *   in: APIリクエスト結果（成功/429）、初期設定、RuntimeConfig
 *   out: 調整された同時実行制限値、永続化された状態データ
 */

import {
  getRuntimeConfig,
  type RuntimeConfig,
} from "./runtime-config.js";
import { Mutex } from "async-mutex";
import {
  AdaptiveLimitRepository,
  createAdaptiveLimitRepository,
  type ProviderModelKey,
} from "./storage/repositories/adaptive-limit-repo.js";
import { getDatabase } from "./storage/sqlite-db.js";

// ============================================================================
// Types
// ============================================================================

/**
 * 学習された同時実行制限と状態を保持
 * @summary 同時実行制限状態取得
 * @param concurrency 現在の学習された同時実行制限
 * @param originalConcurrency 回復用の元の制限値
 * @param last429At 直近の429エラーのタイムスタンプ
 * @param consecutive429Count 連続した429エラーの数
 * @param total429Count このモデルの総429エラー数
 * @param lastSuccessAt 直近の成功リクエストのタイムスタンプ
 * @param recoveryScheduled 回復スケジュール済みフラグ
 * @param modelNotes モデル固有のメモ
 * @returns LearnedLimit オブジェクト
 */
export interface LearnedLimit {
  /** Current learned concurrency limit */
  concurrency: number;
  /** Original preset limit (for recovery) */
  originalConcurrency: number;
  /** Last 429 error timestamp */
  last429At: string | null;
  /** Number of consecutive 429 errors */
  consecutive429Count: number;
  /** Total 429 errors for this model */
  total429Count: number;
  /** Last successful request timestamp */
  lastSuccessAt: string | null;
  /** Recovery scheduled flag */
  recoveryScheduled: boolean;
  /** Model-specific notes */
  notes?: string;
  /** Predictive: historical 429 timestamps for pattern analysis */
  historical429s?: string[];
  /** Predictive: estimated 429 probability (0-1) */
  predicted429Probability?: number;
  /** Predictive: suggested ramp-up schedule */
  rampUpSchedule?: number[];
}

/**
 * @summary レート制御状態
 * 適応的レート制御の状態
 * @param version バージョン
 * @param lastUpdated 最終更新日時
 * @param limits 学習された制限値（プロバイダ:モデル別）
 * @param globalMultiplier 全体倍率（すべての制限に適用）
 * @param recoveryIntervalMs 回復間隔（ミリ秒）
 * @param reductionFactor 429発生時の低減係数（0.7 = 30%減）
 * @param recoveryFactor 回復係数（1.1 = 回復ごとに10%増）
 * @param predictiveEnabled 予測的スロットリングの有効化
 */
export interface AdaptiveControllerState {
  version: number;
  lastUpdated: string;
  limits: {
    [key: string]: LearnedLimit; // "provider:model"
  };
  /** Global multiplier (applied to all limits) */
  globalMultiplier: number;
  /** Recovery interval in ms */
  recoveryIntervalMs: number;
  /** Reduction factor on 429 (0.7 = 30% reduction) */
  reductionFactor: number;
  /** Recovery factor (1.1 = 10% increase per recovery) */
  recoveryFactor: number;
  /** Predictive: enable proactive throttling */
  predictiveEnabled: boolean;
  /** Predictive: threshold for proactive action */
  predictiveThreshold: number;
}

/**
 * レート制限イベント
 * @summary レート制限イベント
 * @param provider - APIプロバイダー名
 * @param model - 使用されたモデル名
 * @param type - イベントタイプ（"429" | "success" | "timeout" | "error"）
 * @param timestamp - イベント発生時のタイムスタンプ
 * @param details - イベントの追加詳細情報
 */
export interface RateLimitEvent {
  provider: string;
  model: string;
  type: "429" | "success" | "timeout" | "error";
  timestamp: string;
  details?: string;
}

/**
 * 予測分析結果を保持
 * @summary 分析結果を保持
 * @param provider - APIプロバイダー名
 * @param model - 使用されたモデル名
 * @param predicted429Probability - 429エラーの予測確率
 * @param shouldProactivelyThrottle - 能動的なスロットリングが必要かどうか
 * @param recommendedConcurrency - 推奨される並列数
 * @param nextRiskWindow - 次のリスクが予測される時間枠（オプション）
 * @param confidence - 予測の信頼度
 */
export interface PredictiveAnalysis {
  provider: string;
  model: string;
  predicted429Probability: number;
  shouldProactivelyThrottle: boolean;
  recommendedConcurrency: number;
  nextRiskWindow?: { start: Date; end: Date };
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

const MIN_CONCURRENCY = 1;
const MAX_CONCURRENCY = 16;
const MAX_LEARNED_LIMITS = 512;
const LEARNED_LIMIT_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SUMMARY_LEARNED_LIMITS = 80;
const VALID_PROVIDER_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const VALID_MODEL_RE = /^[a-z0-9][a-z0-9._/:-]{0,127}$/;

const RECOVERY_CHECK_INTERVAL_MS = 60 * 1000; // Check every minute

// ============================================================================
// State
// ============================================================================

// BUG-003修正: async-mutexで状態アクセスを保護
const stateMutex = new Mutex();

let repo: AdaptiveLimitRepository | null = null;
let recoveryTimer: ReturnType<typeof setInterval> | null = null;

/**
 * リポジトリを取得（遅延初期化）
 * @summary リポジトリ取得
 * @returns AdaptiveLimitRepositoryインスタンス
 */
function getRepo(): AdaptiveLimitRepository {
  if (!repo) {
    const db = getDatabase();
    repo = createAdaptiveLimitRepository(db);
  }
  return repo;
}

/**
 * 状態をミューテックスで保護しながらアクセスする
 * @summary 状態アクセス保護
 * @param fn - 状態を使用する関数
 * @returns 関数の戻り値
 */
async function withStateMutex<T>(fn: () => Promise<T>): Promise<T> {
  const release = await stateMutex.acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}

// ============================================================================
// Utilities
// ============================================================================

function buildKey(provider: string, model: string): string {
  return `${provider.toLowerCase()}:${model.toLowerCase()}`;
}

function normalizeProvider(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function normalizeModel(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function tryBuildKey(provider: string, model: string): string | null {
  const normalizedProvider = normalizeProvider(provider);
  const normalizedModel = normalizeModel(model);
  if (!VALID_PROVIDER_RE.test(normalizedProvider)) return null;
  if (!VALID_MODEL_RE.test(normalizedModel)) return null;
  return buildKey(normalizedProvider, normalizedModel);
}

function isValidLearnedLimitKey(key: string): boolean {
  const index = key.indexOf(":");
  if (index <= 0 || index >= key.length - 1) return false;
  const provider = key.slice(0, index);
  const model = key.slice(index + 1);
  return VALID_PROVIDER_RE.test(provider) && VALID_MODEL_RE.test(model);
}

function parseProviderModel(key: string): { provider: string; model: string } | null {
  const index = key.indexOf(":");
  if (index <= 0 || index >= key.length - 1) return null;
  return {
    provider: key.slice(0, index),
    model: key.slice(index + 1),
  };
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * 設定値を取得
 * @summary 設定値取得
 * @returns RuntimeConfigの設定値
 */
function getConfig(): RuntimeConfig {
  return getRuntimeConfig();
}

/**
 * 制限値を取得（外部公開API）
 * @summary 制限値取得
 * @param provider - APIプロバイダー名
 * @param model - モデル名
 * @param defaultLimit - デフォルトの制限値
 * @returns 現在の制限値（学習済みまたはデフォルト）
 */
export function getLimit(
  provider: string,
  model: string,
  defaultLimit: number,
): number {
  const key = tryBuildKey(provider, model);
  if (!key) return Math.max(MIN_CONCURRENCY, Math.min(defaultLimit, MAX_CONCURRENCY));

  const parsed = parseProviderModel(key);
  if (!parsed) return Math.max(MIN_CONCURRENCY, Math.min(defaultLimit, MAX_CONCURRENCY));

  const r = getRepo();
  const limit = r.getLimit(parsed.provider, parsed.model, defaultLimit);
  
  return Math.max(MIN_CONCURRENCY, Math.min(limit.concurrency, MAX_CONCURRENCY));
}

/**
 * 429エラーを記録して制限値を下げる
 * @summary 429エラー記録
 * @param provider - APIプロバイダー名
 * @param model - モデル名
 * @param defaultLimit - デフォルトの制限値
 */
export function record429(
  provider: string,
  model: string,
  defaultLimit: number,
): void {
  const key = tryBuildKey(provider, model);
  if (!key) return;

  const parsed = parseProviderModel(key);
  if (!parsed) return;

  const config = getConfig();
  const r = getRepo();
  
  r.record429(parsed.provider, parsed.model, defaultLimit, config.reductionFactor);
}

/**
 * 成功を記録
 * @summary 成功記録
 * @param provider - APIプロバイダー名
 * @param model - モデル名
 */
export function recordSuccess(provider: string, model: string): void {
  const key = tryBuildKey(provider, model);
  if (!key) return;

  const parsed = parseProviderModel(key);
  if (!parsed) return;

  const r = getRepo();
  r.recordSuccess(parsed.provider, parsed.model);
}

/**
 * 結果を記録（統合API）
 * @summary 結果記録
 * @param provider - APIプロバイダー名
 * @param model - モデル名
 * @param defaultLimit - デフォルトの制限値
 * @param success - 成功したかどうか
 * @param is429 - 429エラーだったかどうか
 */
export function recordResult(
  provider: string,
  model: string,
  defaultLimit: number,
  success: boolean,
  is429: boolean,
): void {
  if (is429) {
    record429(provider, model, defaultLimit);
  } else if (success) {
    recordSuccess(provider, model);
  }
}

/**
 * 全制限値を取得（デバッグ・監視用）
 * @summary 全制限値取得
 * @returns 全ての学習済み制限値
 */
export function getAllLimits(): Record<string, LearnedLimit> {
  const r = getRepo();
  const all = r.getAllLimits();
  
  const result: Record<string, LearnedLimit> = {};
  for (const [key, limit] of Object.entries(all)) {
    if (isValidLearnedLimitKey(key)) {
      result[key] = limit;
    }
  }
  
  return result;
}

/**
 * 特定の制限値を取得
 * @summary 制限値詳細取得
 * @param provider - APIプロバイダー名
 * @param model - モデル名
 * @param defaultLimit - デフォルトの制限値
 * @returns 学習済み制限値またはnull
 */
export function getLearnedLimit(
  provider: string,
  model: string,
  defaultLimit: number,
): LearnedLimit | null {
  const key = tryBuildKey(provider, model);
  if (!key) return null;

  const parsed = parseProviderModel(key);
  if (!parsed) return null;

  const r = getRepo();
  return r.getLimit(parsed.provider, parsed.model, defaultLimit);
}

/**
 * 古い制限値を削除
 * @summary 古い制限値削除
 * @param maxAgeMs - 最大経過時間（ミリ秒）
 * @returns 削除されたエントリ数
 */
export function pruneOldLimits(maxAgeMs: number = LEARNED_LIMIT_STALE_MS): number {
  const r = getRepo();
  return r.pruneOldEntries(maxAgeMs);
}

/**
 * 全制限値をクリア
 * @summary 全制限値クリア
 */
export function clearAllLimits(): void {
  const r = getRepo();
  r.clearAll();
}

// ============================================================================
// Recovery
// ============================================================================

/**
 * 回復チェックを実行
 * @summary 回復チェック実行
 */
function runRecoveryCheck(): void {
  const config = getConfig();
  const r = getRepo();
  
  const allLimits = r.getAllLimits();
  const now = Date.now();
  
  for (const [key, limit] of Object.entries(allLimits)) {
    if (!limit.recoveryScheduled) continue;
    if (!limit.last429At) continue;
    
    const last429Time = new Date(limit.last429At).getTime();
    if (now - last429Time < config.recoveryIntervalMs) continue;
    
    const parsed = parseProviderModel(key);
    if (!parsed) continue;
    
    // 回復を実行
    r.updateLimit(parsed.provider, parsed.model, {
      concurrency: Math.min(
        Math.ceil(limit.concurrency * config.recoveryFactor),
        limit.originalConcurrency,
      ),
      recoveryScheduled: false,
    });
  }
}

/**
 * 回復タイマーを開始
 * @summary 回復タイマー開始
 */
export function startRecoveryTimer(): void {
  if (recoveryTimer) return;
  
  recoveryTimer = setInterval(() => {
    void withStateMutex(async () => {
      runRecoveryCheck();
    });
  }, RECOVERY_CHECK_INTERVAL_MS);
  
  // アンリファレンス防止
  recoveryTimer.unref?.();
}

/**
 * 回復タイマーを停止
 * @summary 回復タイマー停止
 */
export function stopRecoveryTimer(): void {
  if (recoveryTimer) {
    clearInterval(recoveryTimer);
    recoveryTimer = null;
  }
}

// ============================================================================
// Initialization
// ============================================================================

// モジュール読み込み時に回復タイマーを自動開始
startRecoveryTimer();

// ============================================================================
// Summary
// ============================================================================

/**
 * 制限値サマリーを取得（ログ出力用）
 * @summary 制限値サマリー取得
 * @returns サマリー文字列
 */
export function getLimitsSummary(): string {
  const r = getRepo();
  const allLimits = r.getAllLimits();
  const entries = Object.entries(allLimits);
  
  if (entries.length === 0) {
    return "No learned limits yet.";
  }
  
  const lines: string[] = [];
  lines.push(`Learned limits (${Math.min(entries.length, MAX_SUMMARY_LEARNED_LIMITS)}/${entries.length} shown):`);
  
  // Sort by total429Count desc
  const sorted = entries
    .sort((a, b) => (b[1].total429Count || 0) - (a[1].total429Count || 0))
    .slice(0, MAX_SUMMARY_LEARNED_LIMITS);
  
  for (const [key, limit] of sorted) {
    const indicator = limit.consecutive429Count > 0 ? "⚠️" : "✓";
    lines.push(
      `  ${indicator} ${key}: concurrency=${limit.concurrency}, ` +
      `original=${limit.originalConcurrency}, ` +
      `429s=${limit.total429Count}`,
    );
  }
  
  return lines.join("\n");
}
