/**
 * @abdd.meta
 * path: .pi/lib/comprehensive-logger-types.ts
 * role: ロガー共通型定義
 * why: ロギングシステム全体で使用するイベントデータ構造と列挙型を一元管理するため
 * related: .pi/lib/comprehensive-logger.ts, .pi/lib/logger-writer.ts, .pi/lib/event-emitter.ts
 * public_api: EventType, ComponentType, ToolType, Status, BaseEvent, SessionStartEvent, SessionEndEvent
 * invariants: BaseEventは全イベントの共通祖先であり、eventIdとtimestampを必ず持つ
 * side_effects: なし（純粋な型定義ファイル）
 * failure_modes: 型定義の不整合により実行時エラーが発生する
 * @abdd.explain
 * overview: ロギングシステムで扱うイベントの種別、ステータス、および基本データ構造を定義するTypeScriptモジュール
 * what_it_does:
 *   - ライフサイクル、ツール、LLM操作などのイベント種別（EventType）を定義する
 *   - コンポーネント、ツール、ステータスの分類型を定義する
 *   - 全イベントに共通するBaseEventインターフェースを定義する
 *   - セション開始および終了イベントの具体的なデータ構造を定義する
 * why_it_exists:
 *   - ログデータの構造を型安全に保証し、実装ミスを防ぐため
 *   - 異なるモジュール間でイベントのスキーマを共有するため
 * scope:
 *   in: なし
 *   out: イベント型、インターフェース、列挙型のエクスポート
 */

/**
 * イベント種別定義
 * @summary イベント種別を定義
 */

// ============================================
// 基本型
// ============================================

export type EventType =
  // ライフサイクル
  | 'session_start'
  | 'session_end'
  | 'task_start'
  | 'task_end'
  | 'operation_start'
  | 'operation_end'
  // ツール
  | 'tool_call'
  | 'tool_result'
  | 'tool_error'
  // LLM
  | 'llm_request'
  | 'llm_response'
  | 'llm_error'
  // ユーザー
  | 'user_input'
  | 'user_feedback'
  // システム
  | 'config_load'
  | 'state_change'
  | 'metrics_snapshot'
  // 実験 (autoresearch)
  | 'experiment_start'
  | 'experiment_baseline'
  | 'experiment_run'
  | 'experiment_improved'
  | 'experiment_regressed'
  | 'experiment_timeout'
  | 'experiment_stop'
  | 'experiment_crash'
  // スケジューラ (MetricsCollector)
  | 'preemption'
  | 'work_steal'
  | 'task_completion';

/**
 * コンポーネント型
 * @summary コンポーネント種別
 */
export type ComponentType = 'extension' | 'subagent' | 'team' | 'skill' | 'tool';

/**
 * ツール型
 * @summary ツール種別
 */
export type ToolType = 'builtin' | 'extension' | 'dynamic';

/**
 * ステータス型
 * @summary 処理状態
 */
export type Status = 'pending' | 'running' | 'success' | 'failure' | 'timeout' | 'partial' | 'cancelled';

// ============================================
// ベースイベント
// ============================================

/**
 * ベースイベント
 * @summary 基底イベントデータ
 * 全イベント共通のデータ構造を定義します。
 */
export interface BaseEvent {
  // 識別子
  eventId: string;
  eventType: EventType;
  
  // 階層的な相関ID
  sessionId: string;
  taskId: string;
  operationId: string;
  parentEventId?: string;
  
  // タイムスタンプ（ナノ秒精度）
  timestamp: string;
  
  // コンポーネント情報
  component: {
    type: ComponentType;
    name: string;
    version?: string;
    filePath?: string;
  };
}

// ============================================
// セッションイベント
// ============================================

/**
 * セッション開始
 * @summary セッションを開始する
 * セッション開始イベントのデータ構造を定義します。
 */
export interface SessionStartEvent extends BaseEvent {
  eventType: 'session_start';
  data: {
    piVersion: string;
    nodeVersion: string;
    platform: string;
    cwd: string;
    envKeys: string[];
    configHash: string;
    startupTimeMs: number;
  };
}

/**
 * セッション終了イベント
 * @summary セッション終了
 */
export interface SessionEndEvent extends BaseEvent {
  eventType: 'session_end';
  data: {
    durationMs: number;
    taskCount: number;
    errorCount: number;
    totalTokensUsed: number;
    exitReason: 'normal' | 'error' | 'user_interrupt' | 'timeout';
  };
}

// ============================================
// タスクイベント
// ============================================

/**
 * タスク開始イベント
 * @summary タスク開始
 */
export interface TaskStartEvent extends BaseEvent {
  eventType: 'task_start';
  data: {
    userInput: string;
    inputType: 'text' | 'voice' | 'file';
    context: {
      filesReferenced: string[];
      skillsLoaded: string[];
      teamsAvailable: string[];
    };
    intent?: string;
  };
}

/**
 * タスク終了イベント
 * @summary タスク終了
 */
export interface TaskEndEvent extends BaseEvent {
  eventType: 'task_end';
  data: {
    durationMs: number;
    status: Status;
    operationsCount: number;
    toolsCount: number;
    tokensUsed: number;
    filesCreated: string[];
    filesModified: string[];
    filesDeleted: string[];
    commandsExecuted: string[];
    summary: string;
    errors: Array<{
      eventId: string;
      message: string;
      type: string;
    }>;
  };
}

// ============================================
// 操作イベント
// ============================================

/**
 * 操作の種類を表す文字列リテラル型
 * @summary 操作種別定義
 */
export type OperationType = 'subagent_run' | 'team_run' | 'loop_run' | 'direct';

/**
 * 操作開始イベント
 * @summary 操作開始
 */
export interface OperationStartEvent extends BaseEvent {
  eventType: 'operation_start';
  data: {
    operationType: OperationType;
    target: string;
    input: {
      task: string;
      params: Record<string, unknown>;
    };
    strategy?: string;
    retryConfig?: {
      maxRetries: number;
      backoffMs: number;
    };
  };
}

/**
 * 操作終了イベント
 * @summary 操作終了通知
 */
export interface OperationEndEvent extends BaseEvent {
  eventType: 'operation_end';
  data: {
    durationMs: number;
    status: Status;
    tokensUsed: number;
    outputLength: number;
    outputFile?: string;
    childOperations: number;
    toolCalls: number;
    error?: {
      type: string;
      message: string;
      stack: string;
    };
  };
}

// ============================================
// ツールイベント
// ============================================

/**
 * ツール呼び出しイベント
 * @summary ツール呼び出し
 */
export interface ToolCallEvent extends BaseEvent {
  eventType: 'tool_call';
  data: {
    toolName: string;
    toolType: ToolType;
    params: Record<string, unknown>;
    caller: {
      file: string;
      line: number;
      function: string;
    };
    environment: {
      cwd: string;
      shell?: string;
    };
  };
}

/**
 * ツール実行結果イベント
 * @summary ツール結果返却
 */
export interface ToolResultEvent extends BaseEvent {
  eventType: 'tool_result';
  data: {
    toolName: string;
    status: 'success' | 'error' | 'partial';
    durationMs: number;
    outputType: 'inline' | 'file' | 'truncated';
    output: string;
    outputHash?: string;
    outputSize: number;
    exitCode?: number;
    mimeType?: string;
  };
}

/**
 * ツール実行時のエラーイベント
 * @summary ツールエラー発生
 */
export interface ToolErrorEvent extends BaseEvent {
  eventType: 'tool_error';
  data: {
    toolName: string;
    errorType: 'validation' | 'execution' | 'timeout' | 'permission' | 'unknown';
    errorMessage: string;
    errorStack?: string;
    recoveryAttempted: boolean;
    recoveryMethod?: string;
    recoverySuccessful?: boolean;
    params: Record<string, unknown>;
    partialOutput?: string;
  };
}

// ============================================
// LLMイベント
// ============================================

/**
 * LLMリクエストイベント
 * @summary LLMリクエスト送信
 */
export interface LLMRequestEvent extends BaseEvent {
  eventType: 'llm_request';
  data: {
    provider: string;
    model: string;
    systemPromptLength: number;
    systemPromptHash: string;
    userMessageCount: number;
    userMessageLength: number;
    temperature?: number;
    maxTokens?: number;
    contextWindowUsed: number;
    toolsAvailable: string[];
  };
}

/**
 * LLM応答イベント
 * @summary LLM応答通知
 */
export interface LLMResponseEvent extends BaseEvent {
  eventType: 'llm_response';
  data: {
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    durationMs: number;
    responseLength: number;
    stopReason: 'end_turn' | 'max_tokens' | 'tool_use' | 'error';
    toolsCalled: Array<{
      name: string;
      paramsSize: number;
    }>;
  };
}

/**
 * LLMエラー通知
 * @summary LLMエラー通知
 */
export interface LLMErrorEvent extends BaseEvent {
  eventType: 'llm_error';
  data: {
    provider: string;
    model: string;
    errorType: 'rate_limit' | 'timeout' | 'context_too_long' | 'api_error' | 'unknown';
    errorMessage: string;
    retryAttempt?: number;
    retryAfterMs?: number;
  };
}

// ============================================
// ユーザーイベント
// ============================================

/**
 * ユーザー入力イベント
 * @summary 入力データ送信
 */
export interface UserInputEvent extends BaseEvent {
  eventType: 'user_input';
  data: {
    input: string;
    inputType: 'text' | 'voice' | 'file';
    metadata?: {
      source?: string;
      timestamp?: string;
    };
  };
}

/**
 * フィードバック通知
 * @summary フィードバック通知
 */
export interface UserFeedbackEvent extends BaseEvent {
  eventType: 'user_feedback';
  data: {
    feedbackType: 'approval' | 'rejection' | 'correction' | 'clarification';
    targetEventId: string;
    content: string;
  };
}

// ============================================
// システムイベント
// ============================================

/**
 * 設定読み込み通知
 * @summary 設定を読み込む
 */
export interface ConfigLoadEvent extends BaseEvent {
  eventType: 'config_load';
  data: {
    configType: 'system' | 'project' | 'user';
    configPath: string;
    configHash: string;
    keysLoaded: string[];
    overrides: Record<string, boolean>;
  };
}

/**
 * 状態変更イベント
 * @summary 状態変化通知
 */
export interface StateChangeEvent extends BaseEvent {
  eventType: 'state_change';
  data: {
    entityType: 'file' | 'storage' | 'memory' | 'config';
    entityPath: string;
    changeType: 'create' | 'update' | 'delete';
    diff?: {
      additions: number;
      deletions: number;
      hunks: number;
    };
    beforeHash?: string;
    afterHash?: string;
  };
}

/**
 * メトリクススナップショットイベント
 * @summary メトリクス通知
 */
export interface MetricsSnapshotEvent extends BaseEvent {
  eventType: 'metrics_snapshot';
  data: {
    memoryUsageMB: number;
    cpuPercent: number;
    eventsTotal: number;
    tasksCompleted: number;
    operationsCompleted: number;
    toolCallsTotal: number;
    tokensTotal: number;
    errorRate: number;
    avgResponseTimeMs: number;
    p95ResponseTimeMs: number;
  };
}

// ============================================
// 実験イベント (autoresearch)
// ============================================

/**
 * 実験開始イベント
 * @summary 実験を開始する
 */
export interface ExperimentStartEvent extends BaseEvent {
  eventType: 'experiment_start';
  data: {
    experimentType: 'e2e' | 'tbench';
    label: string;
    tag?: string;
    branch?: string;
    targetCommit?: string;
    config: Record<string, unknown>;
  };
}

/**
 * 実験ベースラインイベント
 * @summary ベースライン記録
 */
export interface ExperimentBaselineEvent extends BaseEvent {
  eventType: 'experiment_baseline';
  data: {
    experimentType: 'e2e' | 'tbench';
    label: string;
    score: {
      failed: number;
      passed: number;
      total: number;
      durationMs: number;
    };
    commit?: string;
  };
}

/**
 * 実験実行イベント
 * @summary 実験を実行する
 */
export interface ExperimentRunEvent extends BaseEvent {
  eventType: 'experiment_run';
  data: {
    experimentType: 'e2e' | 'tbench';
    label: string;
    iteration: number;
    commit?: string;
    changesSummary?: string;
  };
}

/**
 * 実験改善イベント
 * @summary 改善を検出
 */
export interface ExperimentImprovedEvent extends BaseEvent {
  eventType: 'experiment_improved';
  data: {
    experimentType: 'e2e' | 'tbench';
    label: string;
    previousScore: {
      failed: number;
      passed: number;
      total: number;
      durationMs: number;
    };
    newScore: {
      failed: number;
      passed: number;
      total: number;
      durationMs: number;
    };
    commit?: string;
    improvementType: 'fewer_failures' | 'more_passes' | 'faster';
  };
}

/**
 * 実験退行イベント
 * @summary 退行を検出
 */
export interface ExperimentRegressedEvent extends BaseEvent {
  eventType: 'experiment_regressed';
  data: {
    experimentType: 'e2e' | 'tbench';
    label: string;
    previousScore: {
      failed: number;
      passed: number;
      total: number;
      durationMs: number;
    };
    newScore: {
      failed: number;
      passed: number;
      total: number;
      durationMs: number;
    };
    commit?: string;
    regressionType: 'more_failures' | 'fewer_passes' | 'slower';
    reverted?: boolean;
  };
}

/**
 * 実験タイムアウトイベント
 * @summary タイムアウト発生
 */
export interface ExperimentTimeoutEvent extends BaseEvent {
  eventType: 'experiment_timeout';
  data: {
    experimentType: 'e2e' | 'tbench';
    label: string;
    iteration: number;
    timeoutMs: number;
    partialScore?: {
      failed: number;
      passed: number;
      total: number;
      durationMs: number;
    };
  };
}

/**
 * 実験停止イベント
 * @summary 実験が停止された
 */
export interface ExperimentStopEvent extends BaseEvent {
  eventType: 'experiment_stop';
  data: {
    experimentType: 'e2e' | 'tbench';
    label: string;
    iteration: number;
    reason?: string;
    partialScore?: {
      failed: number;
      passed: number;
      total: number;
      durationMs: number;
    };
  };
}

/**
 * 実験クラッシュイベント
 * @summary 実験がクラッシュした
 */
export interface ExperimentCrashEvent extends BaseEvent {
  eventType: 'experiment_crash';
  data: {
    experimentType: 'e2e' | 'tbench';
    label: string;
    iteration: number;
    error?: string;
    partialScore?: {
      failed: number;
      passed: number;
      total: number;
      durationMs: number;
    };
  };
}

// ============================================
// スケジューライベント (MetricsCollector)
// ============================================

/**
 * プリエンプションイベント
 * @summary タスクがプリエンプションされた
 */
export interface PreemptionEvent extends BaseEvent {
  eventType: 'preemption';
  data: {
    taskId: string;
    reason: string;
  };
}

/**
 * ワークスチールイベント
 * @summary 他インスタンスからタスクを盗用した
 */
export interface WorkStealEvent extends BaseEvent {
  eventType: 'work_steal';
  data: {
    sourceInstance: string;
    taskId: string;
  };
}

/**
 * タスク完了イベント（スケジューラ）
 * @summary タスクが完了した
 */
export interface TaskCompletionEvent extends BaseEvent {
  eventType: 'task_completion';
  data: {
    taskId: string;
    source: string;
    provider: string;
    model: string;
    priority: string;
    waitedMs: number;
    executionMs: number;
    success: boolean;
  };
}

// ============================================
// 統合型
// ============================================

/**
 * ログイベントの統合型
 * @summary ログイベント定義
 */
export type LogEvent =
  | SessionStartEvent
  | SessionEndEvent
  | TaskStartEvent
  | TaskEndEvent
  | OperationStartEvent
  | OperationEndEvent
  | ToolCallEvent
  | ToolResultEvent
  | ToolErrorEvent
  | LLMRequestEvent
  | LLMResponseEvent
  | LLMErrorEvent
  | UserInputEvent
  | UserFeedbackEvent
  | ConfigLoadEvent
  | StateChangeEvent
  | MetricsSnapshotEvent
  | ExperimentStartEvent
  | ExperimentBaselineEvent
  | ExperimentRunEvent
 | ExperimentImprovedEvent
  | ExperimentRegressedEvent
  | ExperimentTimeoutEvent
  | ExperimentStopEvent
  | ExperimentCrashEvent
  | PreemptionEvent
  | WorkStealEvent
  | TaskCompletionEvent;

// ============================================
// 設定型
// ============================================

/**
 * ロガー設定
 * @summary ロガー設定
 */
export interface LoggerConfig {
  logDir: string;
  enabled: boolean;
  bufferSize: number;
  flushIntervalMs: number;
  maxFileSizeMB: number;
  retentionDays: number;
  environment: 'development' | 'production' | 'test';
  minLogLevel: 'debug' | 'info' | 'warn' | 'error';
  /**
   * フラッシュ失敗時のコールバック関数
   * I/Oエラー発生時に呼び出され、下游コンシューマーへの通知に使用する
   */
  onFlushError?: (error: Error, pendingCount: number) => void;
  /**
   * フラッシュ失敗時のリトライ回数
   * @default 3
   */
  flushRetryAttempts?: number;
  /**
   * フラッシュリトライの初期遅延（ミリ秒）
   * 指数バックオフで増加する
   * @default 1000
   */
  flushRetryDelayMs?: number;
}
