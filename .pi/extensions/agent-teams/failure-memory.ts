/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/failure-memory.ts
 * role: チーム間で失敗情報を共有するグローバルメモリ
 * why: M1-Parallel論文のGlobal Failure Memory概念を実装し、再計画時に失敗情報を活用するため
 * related: .pi/extensions/agent-teams/team-orchestrator.ts, .pi/extensions/agent-runtime.ts
 * public_api: GlobalFailureMemory, FailureRecord, FailureMemoryStats, getGlobalFailureMemory, clearGlobalFailureMemory
 * invariants: メモリはプロセス内で単一のインスタンス、レコードは最大100件まで、保持期間は5分間
 * side_effects: なし（メモリ内ストレージのみ）
 * failure_modes: メモリリーク（長時間実行プロセス）、大量レコードによるパフォーマンス低下
 * @abdd.explain
 * overview: 並列実行されるチーム間で失敗情報を共有し、後続の再試行や再計画で活用するためのインメモリストア
 * what_it_does:
 *   - 失敗レコードの記録、分類、取得機能を提供する
 *   - 同じエラーが3回以上連続した場合の再試行スキップ判定を行う
 *   - 統計情報の収集と提供を行う
 * why_it_exists:
 *   - 複数チーム並列実行時に同じエラーを繰り返し再試行する無駄を防ぐため
 *   - 失敗パターンの学習と回避を可能にするため
 * scope:
 *   in: 失敗情報（teamId, memberId, error, taskSignature）
 *   out: FailureRecord, FailureMemoryStats, shouldSkipRetry判定
 */

/**
 * 失敗レコード
 * @summary 失敗記録定義
 */
export interface FailureRecord {
  /** 一意識別子 */
  id: string;
  /** チームID */
  teamId: string;
  /** メンバーID */
  memberId: string;
  /** 記録タイムスタンプ */
  timestamp: number;
  /** エラー種別 */
  errorType: "timeout" | "rate-limit" | "capacity" | "validation" | "unknown";
  /** エラーメッセージ */
  errorMessage: string;
  /** タスク署名（重複排除用ハッシュ） */
  taskSignature: string;
  /** 再試行回数 */
  retryAttempt: number;
  /** 復旧済みフラグ */
  recovered: boolean;
}

/**
 * 失敗メモリ統計情報
 * @summary 統計情報定義
 */
export interface FailureMemoryStats {
  /** 総レコード数 */
  totalRecords: number;
  /** エラー種別ごとの件数 */
  uniqueErrorTypes: Record<string, number>;
  /** 復旧率 */
  recoveryRate: number;
  /** 直近5分間の失敗数 */
  recentFailures: number;
}

/** 最大レコード数 */
const MAX_RECORDS = 100;

/** 保持期間（ミリ秒） */
const RETENTION_MS = 5 * 60 * 1000; // 5 minutes

/**
 * グローバル失敗メモリの実装クラス
 * @summary 失敗メモリ実装
 */
class GlobalFailureMemoryImpl {
  private records: FailureRecord[] = [];
  private recordId = 0;

  /**
   * 失敗を記録する
   * @summary 失敗記録追加
   * @param teamId - チームID
   * @param memberId - メンバーID
   * @param error - エラーオブジェクト
   * @param taskSignature - タスク署名
   * @param retryAttempt - 再試行回数
   * @returns 作成された失敗レコード
   */
  recordFailure(
    teamId: string,
    memberId: string,
    error: unknown,
    taskSignature: string,
    retryAttempt: number,
  ): FailureRecord {
    const record: FailureRecord = {
      id: `fail-${++this.recordId}`,
      teamId,
      memberId,
      timestamp: Date.now(),
      errorType: this.classifyError(error),
      errorMessage: this.toErrorMessage(error),
      taskSignature,
      retryAttempt,
      recovered: false,
    };

    this.records.push(record);
    this.pruneOldRecords();

    return record;
  }

  /**
   * レコードを復旧済みとしてマークする
   * @summary 復旧マーク
   * @param recordId - レコードID
   */
  markRecovered(recordId: string): void {
    const record = this.records.find((r) => r.id === recordId);
    if (record) {
      record.recovered = true;
    }
  }

  /**
   * 指定タスクの失敗レコードを取得する
   * @summary タスク別失敗取得
   * @param taskSignature - タスク署名
   * @returns 失敗レコード一覧
   */
  getFailuresForTask(taskSignature: string): FailureRecord[] {
    return this.records.filter((r) => r.taskSignature === taskSignature);
  }

  /**
   * 指定エラー種別の失敗レコードを取得する
   * @summary 種別別失敗取得
   * @param errorType - エラー種別
   * @returns 失敗レコード一覧
   */
  getFailuresByType(
    errorType: FailureRecord["errorType"],
  ): FailureRecord[] {
    return this.records.filter((r) => r.errorType === errorType);
  }

  /**
   * 再試行をスキップすべきか判定する
   * 同じエラーが3回以上連続した場合は再試行をスキップ
   * @summary 再試行スキップ判定
   * @param taskSignature - タスク署名
   * @param errorType - エラー種別
   * @returns スキップすべきならtrue
   */
  shouldSkipRetry(
    taskSignature: string,
    errorType: FailureRecord["errorType"],
  ): boolean {
    const recentFailures = this.records.filter(
      (r) =>
        r.taskSignature === taskSignature &&
        r.errorType === errorType &&
        !r.recovered &&
        Date.now() - r.timestamp < 60000, // Last 1 minute
    );

    // Skip if 3+ recent failures of same type
    return recentFailures.length >= 3;
  }

  /**
   * 統計情報を取得する
   * @summary 統計情報取得
   * @returns 統計情報
   */
  getStats(): FailureMemoryStats {
    const now = Date.now();
    const recentCutoff = now - RETENTION_MS;
    const recentFailures = this.records.filter(
      (r) => r.timestamp > recentCutoff,
    );

    const errorTypeCounts: Record<string, number> = {};
    for (const r of this.records) {
      errorTypeCounts[r.errorType] = (errorTypeCounts[r.errorType] || 0) + 1;
    }

    const recovered = this.records.filter((r) => r.recovered).length;

    return {
      totalRecords: this.records.length,
      uniqueErrorTypes: errorTypeCounts,
      recoveryRate:
        this.records.length > 0 ? recovered / this.records.length : 0,
      recentFailures: recentFailures.length,
    };
  }

  /**
   * メモリをクリアする
   * @summary メモリクリア
   */
  clear(): void {
    this.records = [];
    this.recordId = 0;
  }

  /**
   * 古いレコードを削除する
   * @summary 古いレコード削除
   */
  private pruneOldRecords(): void {
    const cutoff = Date.now() - RETENTION_MS;
    this.records = this.records.filter((r) => r.timestamp > cutoff);

    // Also enforce max records
    if (this.records.length > MAX_RECORDS) {
      this.records = this.records.slice(-MAX_RECORDS);
    }
  }

  /**
   * エラーを分類する
   * @summary エラー分類
   * @param error - エラーオブジェクト
   * @returns エラー種別
   */
  private classifyError(error: unknown): FailureRecord["errorType"] {
    const msg = this.toErrorMessage(error).toLowerCase();
    if (msg.includes("timeout")) return "timeout";
    if (
      msg.includes("rate") ||
      msg.includes("limit") ||
      msg.includes("429")
    ) {
      return "rate-limit";
    }
    if (msg.includes("capacity")) return "capacity";
    if (msg.includes("validation") || msg.includes("invalid")) return "validation";
    return "unknown";
  }

  /**
   * エラーメッセージを文字列化する
   * @summary エラーメッセージ変換
   * @param error - エラーオブジェクト
   * @returns エラーメッセージ文字列
   */
  private toErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    return JSON.stringify(error);
  }
}

// Singleton instance
let globalMemory: GlobalFailureMemoryImpl | undefined;

/**
 * グローバル失敗メモリを取得する
 * @summary 失敗メモリ取得
 * @returns 失敗メモリインスタンス
 */
export function getGlobalFailureMemory(): GlobalFailureMemoryImpl {
  if (!globalMemory) {
    globalMemory = new GlobalFailureMemoryImpl();
  }
  return globalMemory;
}

/**
 * グローバル失敗メモリをクリアする
 * @summary 失敗メモリクリア
 */
export function clearGlobalFailureMemory(): void {
  globalMemory?.clear();
}

/** 型エクスポート */
export type GlobalFailureMemory = GlobalFailureMemoryImpl;

/**
 * タスク文字列からハッシュを生成する
 * @summary タスクハッシュ生成
 * @param task - タスク文字列
 * @returns タスク署名
 */
export function hashTask(task: string): string {
  // Simple hash for task deduplication
  let hash = 0;
  for (let i = 0; i < task.length; i++) {
    const char = task.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `task-${hash.toString(16)}`;
}
