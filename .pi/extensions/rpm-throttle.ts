/**
 * @abdd.meta
 * path: .pi/extensions/rpm-throttle.ts
 * role: リクエスト頻度制御エクステンション
 * why: 通常ターンのLLM呼び出しに対し、RPM（Requests Per Minute）超過によるHTTP 429エラーを抑制するため
 * related: .pi/lib/provider-limits.ts, .pi/extensions/pi-coding-agent-rate-limit-fix.ts
 * public_api: before_agent_startフックを介したリクエスト実行許可の制御
 * invariants: requestStartsMsは昇順、cooldownUntilMsは現在時刻以降または過去、状態はプロセス間でデータベース共有される
 * side_effects: SQLiteデータベースへの読み書き、プロセスの待機（sleep）
 * failure_modes: データベース接続エラー時は例外をスロー
 * @abdd.explain
 * overview: プロバイダごとのRPM制限に基づき、移動平均スロットルと動的クールダウンを適用する拡張機能
 * what_it_does:
 *   - before_agent_startフックでリクエスト許可判定を実行し、必要に応じて待機または429エラーを返す
 *   - 直近1分間のリクエスト時刻（requestStartsMs）を追跴し、制限を超過した場合に待機時間を計算する
 *   - 429エラー発生時に指数関数的なバックオフでクールダウン期間を設定し、リクエストを一時停止する
 *   - SQLiteデータベースを用いて複数プロセス間でスロットル状態を共有する
 * why_it_exists:
 *   - APIプロバイダのRPM制限を遵守し、エージェントの実行安定性を向上させるため
 *   - 429エラーの連鎖を防ぎ、効率的なリクエストスケジューリングを実現するため
 * scope:
 *   in: ExtensionAPI（コンテキスト）, 環境変数（設定値）, SQLiteデータベース（状態）
 *   out: リクエストの一時停止, 共有状態の更新, 429エラーのシミュレーション
 */

/**
 * .pi/extensions/rpm-throttle.ts
 * 通常ターンのLLM呼び出しに対して、RPM主因の429を減らすためのスロットリングを提供する。
 * before_agent_startで1分窓のリクエスト数を制御し、429検知時は追加クールダウンを適用する。
 * 関連: .pi/lib/provider-limits.ts, .pi/extensions/pi-coding-agent-rate-limit-fix.ts, package.json
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { detectTier, getRpmLimit } from "../lib/provider-limits.js";
import { sleep } from "../lib/sleep-utils.js";
import {
  RpmThrottleRepository,
  createRpmThrottleRepository,
  type BucketState,
} from "../lib/storage/repositories/rpm-throttle-repo.js";
import { getDatabase } from "../lib/storage/sqlite-db.js";

// ============================================================================
// Constants
// ============================================================================

const WINDOW_MS_DEFAULT = 60_000;
const HEADROOM_FACTOR_DEFAULT = 0.7;
const FALLBACK_429_COOLDOWN_MS = 15_000;
const MAX_COOLDOWN_MS = 5 * 60_000;
const MAX_STATE_AGE_MS = 15 * 60_000; // 15 minutes

// ============================================================================
// State
// ============================================================================

let repo: RpmThrottleRepository | null = null;

/**
 * リポジトリを取得（遅延初期化）
 * @summary リポジトリ取得
 * @returns RpmThrottleRepositoryインスタンス
 */
function getRepo(): RpmThrottleRepository {
  if (!repo) {
    const db = getDatabase();
    repo = createRpmThrottleRepository(db);
  }
  return repo;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * プロバイダ:モデルのキーを構築
 * @summary キー構築
 * @param provider - プロバイダ名
 * @param model - モデル名
 * @returns キー文字列
 */
function buildKey(provider: string, model: string): string {
  return `${provider.toLowerCase()}:${model.toLowerCase()}`;
}

/**
 * バケット状態を取得または初期化
 * @summary バケット状態取得
 * @param key - プロバイダ:モデルキー
 * @returns バケット状態
 */
function getOrInitBucket(key: string): BucketState {
  const r = getRepo();
  return r.getState(key);
}

/**
 * バケット状態を保存
 * @summary バケット状態保存
 * @param key - プロバイダ:モデルキー
 * @param state - バケット状態
 */
function saveBucket(key: string, state: BucketState): void {
  const r = getRepo();
  r.saveState(key, state);
}

/**
 * 古い状態を削除
 * @summary 古い状態削除
 * @param nowMs - 現在時刻（ミリ秒）
 */
function pruneStates(nowMs: number): void {
  const r = getRepo();
  r.pruneOldEntries(MAX_STATE_AGE_MS);
}

/**
 * 許可されたRPMを計算
 * @summary RPM計算
 * @param provider - プロバイダ名
 * @param model - モデル名
 * @returns 許可されたRPM
 */
function calculateAllowedRpm(provider: string, model: string): number {
  const tier = detectTier(provider, model);
  const baseRpm = getRpmLimit(provider, model, tier);
  return Math.max(1, Math.floor(baseRpm * HEADROOM_FACTOR_DEFAULT));
}

/**
 * スロットル判定と待機時間計算
 * @summary スロットル判定
 * @param provider - プロバイダ名
 * @param model - モデル名
 * @param nowMs - 現在時刻（ミリ秒）
 * @returns 待機時間（ミリ秒）、0の場合は即座に実行可能
 */
function checkThrottle(provider: string, model: string, nowMs: number): number {
  const key = buildKey(provider, model);
  const allowedRpm = calculateAllowedRpm(provider, model);
  
  // トランザクション内で状態を取得・更新
  const r = getRepo();
  
  const bucket = r.transaction(() => {
    const state = r.getState(key);
    
    // クールダウンチェック
    if (state.cooldownUntilMs > nowMs) {
      return { waitMs: state.cooldownUntilMs - nowMs, state };
    }
    
    // ウィンドウ内のリクエストをフィルタリング
    const windowStart = nowMs - WINDOW_MS_DEFAULT;
    state.requestStartsMs = state.requestStartsMs.filter((t) => t > windowStart);
    
    // リクエストを追加
    state.requestStartsMs.push(nowMs);
    state.lastAccessedMs = nowMs;
    
    // RPM制限チェック
    if (state.requestStartsMs.length > allowedRpm) {
      // 最も古いリクエストがウィンドウから外れるまでの時間を計算
      const oldestRequest = state.requestStartsMs[0];
      const waitMs = WINDOW_MS_DEFAULT - (nowMs - oldestRequest) + 100; // 100msバッファ
      
      // 追加: 超過率に応じたクールダウン
      const excessRatio = state.requestStartsMs.length / allowedRpm;
      if (excessRatio > 1.5) {
        state.cooldownUntilMs = nowMs + Math.min(FALLBACK_429_COOLDOWN_MS, MAX_COOLDOWN_MS);
      }
      
      r.saveState(key, state);
      return { waitMs, state };
    }
    
    r.saveState(key, state);
    return { waitMs: 0, state };
  });
  
  return bucket.waitMs;
}

/**
 * 429エラーを記録してクールダウンを設定
 * @summary 429記録
 * @param provider - プロバイダ名
 * @param model - モデル名
 * @param nowMs - 現在時刻（ミリ秒）
 */
export function record429(provider: string, model: string, nowMs: number): void {
  const key = buildKey(provider, model);
  const r = getRepo();
  
  r.transaction(() => {
    const state = r.getState(key);
    
    // 指数関数的バックオフでクールダウンを設定
    const currentCooldown = state.cooldownUntilMs > nowMs ? state.cooldownUntilMs - nowMs : 0;
    const newCooldown = Math.min(
      currentCooldown * 2 + FALLBACK_429_COOLDOWN_MS,
      MAX_COOLDOWN_MS,
    );
    
    state.cooldownUntilMs = nowMs + newCooldown;
    state.lastAccessedMs = nowMs;
    
    r.saveState(key, state);
  });
}

// ============================================================================
// Extension Export
// ============================================================================

/**
 * RPMスロットリング拡張機能
 * @summary RPMスロットリング拡張
 */
export default function rpmThrottleExtension(pi: ExtensionAPI) {
  pi.on("before_agent_start", async (_event, ctx) => {
    const provider = String(ctx.model?.provider || "").toLowerCase();
    const model = String(ctx.model?.id || "").toLowerCase();
    
    if (!provider || !model) {
      return; // プロバイダまたはモデルが不明な場合はスロットリングしない
    }
    
    const nowMs = Date.now();
    
    // 古い状態を削除
    pruneStates(nowMs);
    
    // スロットル判定
    const waitMs = checkThrottle(provider, model, nowMs);
    
    if (waitMs > 0) {
      // 待機時間が長すぎる場合は429エラーをシミュレート
      if (waitMs > 30_000) {
        throw new Error(
          `RPM limit exceeded for ${provider}/${model}. ` +
          `Please wait ${Math.ceil(waitMs / 1000)} seconds before retrying.`,
        );
      }
      
      // 短い待機の場合はsleep
      await sleep(waitMs);
    }
  });
  
}

// ============================================================================
// Debug/Monitoring
// ============================================================================

/**
 * 全状態を取得（デバッグ用）
 * @summary 全状態取得
 * @returns 全バケット状態
 */
export function getAllStates(): Record<string, BucketState> {
  const r = getRepo();
  return r.getAllStates();
}

/**
 * 特定の状態を取得
 * @summary 状態取得
 * @param provider - プロバイダ名
 * @param model - モデル名
 * @returns バケット状態
 */
export function getState(provider: string, model: string): BucketState {
  const key = buildKey(provider, model);
  const r = getRepo();
  return r.getState(key);
}

/**
 * 全状態をクリア
 * @summary 全状態クリア
 */
export function clearAllStates(): void {
  const r = getRepo();
  r.clearAll();
}
