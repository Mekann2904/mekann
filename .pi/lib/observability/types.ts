/**
 * @abdd.meta
 * path: .pi/lib/observability/types.ts
 * role: Observabilityモジュール共通型定義
 * why: 型の再利用と一貫性を保証するため
 * related: .pi/lib/observability/*.ts
 * public_api: 各種型定義
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: Observability全体で使用される共通型定義
 * what_it_does:
 *   - トレース関連型
 *   - メトリクス関連型
 *   - ログ関連型
 *   - 設定型
 * why_it_exists:
 *   - 型の重複定義を防ぐため
 *   - 型の一貫性を保証するため
 * scope:
 *   in: なし
 *   out: 共通型定義
 */

// ============================================================================
// Trace Context Types
// ============================================================================

/**
 * W3C Trace Context形式のトレースコンテキスト
 * @summary トレースコンテキスト
 */
export interface TraceContext {
  /** W3C形式のトレースID（32文字の16進数小文字） */
  traceId: string;
  /** W3C形式のスパンID（16文字の16進数小文字） */
  spanId: string;
  /** 親スパンID（ルートスパンの場合はundefined） */
  parentSpanId?: string;
  /** トレースフラグ（sampled等） */
  traceFlags: TraceFlags;
  /** トレースステート（ベンダー固有の情報） */
  traceState?: string;
}

/**
 * トレースフラグ
 * @summary W3C trace-flags
 */
export interface TraceFlags {
  /** サンプリングフラグ（0x01） */
  sampled: boolean;
}

/**
 * トレースコンテキストの伝播用フォーマット
 * @summary 伝播用データ
 */
export interface TraceContextCarrier {
  traceparent: string;
  tracestate?: string;
}

// ============================================================================
// Async Context Types
// ============================================================================

/**
 * 非同期コンテキストで保持するデータ
 * @summary 非同期コンテキスト
 */
export interface AsyncContext {
  /** 現在のトレースコンテキスト */
  trace?: TraceContext;
  /** タスクID（ULワークフローのタスクID） */
  taskId?: string;
  /** サブエージェントID */
  subagentId?: string;
  /** ユーザーセッションID */
  sessionId?: string;
  /** カスタム属性 */
  attributes?: Record<string, unknown>;
}

/**
 * コンテキスト変更のログエントリ
 * @summary コンテキスト変更ログ
 */
export interface ContextChangeEvent {
  timestamp: string;
  type: "set" | "update" | "clear";
  field: string;
  value?: unknown;
  traceId?: string;
  spanId?: string;
}

// ============================================================================
// Log Types
// ============================================================================

/**
 * ログレベル
 * @summary OpenTelemetry Logs互換のログレベル
 */
export type LogLevel = "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";

/**
 * ログレベルの数値マッピング
 */
export const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  TRACE: 1,
  DEBUG: 2,
  INFO: 3,
  WARN: 4,
  ERROR: 5,
  FATAL: 6,
};

/**
 * ログレコード
 * @summary OpenTelemetry LogRecord互換の構造
 */
export interface LogRecord {
  /** 観測時刻（ISO 8601形式） */
  time: string;
  /** ログレベル */
  severityNumber: number;
  severityText: LogLevel;
  /** ログ本体 */
  body: string;
  /** 属性（任意のキーバリュー） */
  attributes?: Record<string, unknown>;
  /** トレースコンテキスト */
  traceId?: string;
  spanId?: string;
  traceFlags?: number;
  /** リソース情報（プロセス等） */
  resource?: {
    service: string;
    version?: string;
    pid: number;
    hostname: string;
  };
  /** スコープ（モジュール名等） */
  scope?: {
    name: string;
    version?: string;
  };
  /** 例外情報 */
  exception?: {
    type: string;
    message: string;
    stacktrace?: string;
  };
}

// ============================================================================
// Metrics Types
// ============================================================================

/**
 * パーセンタイル統計
 * @summary パーセンタイル情報
 */
export interface PercentileStats {
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}

/**
 * 期間指定
 * @summary 期間パラメータ
 */
export interface Period {
  /** 期間開始時刻（ISO 8601） */
  start: string;
  /** 期間終了時刻（ISO 8601） */
  end: string;
  /** 期間（ミリ秒） */
  durationMs: number;
}

/**
 * 基本的な成功/失敗統計
 * @summary 成功失敗統計
 */
export interface SuccessFailureStats {
  total: number;
  success: number;
  failed: number;
  successRate: number;
}

// ============================================================================
// Cost Types
// ============================================================================

/**
 * コスト設定
 * @summary 価格定義
 */
export interface CostConfig {
  /** 入力トークン単価（USD/1K tokens） */
  inputCostPer1K: number;
  /** 出力トークン単価（USD/1K tokens） */
  outputCostPer1K: number;
}

/**
 * トークン使用量
 * @summary トークン情報
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

// ============================================================================
// Correlation Types
// ============================================================================

/**
 * 相関イベント種別
 */
export type CorrelationEventType =
  | "task_start"
  | "task_end"
  | "tool_call_start"
  | "tool_call_end"
  | "subagent_start"
  | "subagent_end"
  | "llm_call_start"
  | "llm_call_end"
  | "mcp_call_start"
  | "mcp_call_end"
  | "error";

/**
 * 実行パターン
 */
export type ExecutionPattern = "parallel" | "sequential" | "dag" | "single";

// ============================================================================
// Alert Types
// ============================================================================

/**
 * アラート重要度
 */
export type AlertSeverity = "info" | "warning" | "critical";

/**
 * アラートカテゴリ
 */
export type AlertCategory = "llm" | "subagent" | "system" | "correlation";

/**
 * アラート情報
 * @summary アラート
 */
export interface Alert {
  /** アラート種別 */
  type: AlertSeverity;
  /** カテゴリ */
  category: AlertCategory;
  /** アラートメッセージ */
  message: string;
  /** 関連データ */
  data?: Record<string, unknown>;
  /** 発生時刻 */
  timestamp: string;
}
