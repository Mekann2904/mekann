/**
 * @abdd.meta
 * path: .pi/lib/comprehensive-logger-types.ts
 * role: 包括的ログ収集システムのデータ構造定義
 * why: セッション、タスク、ツール、LLM操作などシステム全体のイベントを統一的な形式で記録するため
 * related: .pi/lib/comprehensive-logger.ts, .pi/lib/session-manager.ts
 * public_api: EventType, ComponentType, ToolType, Status, BaseEvent, SessionStartEvent, SessionEndEvent
 * invariants: すべてのイベントはBaseEventを継承し、一意なeventIdとナノ秒精度のtimestampを持つ
 * side_effects: なし（型定義のみ）
 * failure_modes: なし（型定義のみ）
 * @abdd.explain
 * overview: ログシステムで扱うイベントの種別、ステータス、階層構造を定義する型宣言ファイル
 * what_it_does:
 *   - ライフサイクル、ツール、LLM、ユーザー、システム操作など14種類のEventTypeを定義する
 *   - イベントの共通フィールド（ID、相関ID、タイムスタンプ、コンポーネント情報）を持つBaseEventを定義する
 *   - SessionStartEventなど、具体的なイベントのペイロード構造を定義する
 * why_it_exists:
 *   - 分散したシステムコンポーネント間でログのデータ形式を統一し、追跡可能性を確保するため
 *   - セッション、タスク、オペレーションの親子関係を明確にするため
 * scope:
 *   in: なし
 *   out: 全てのログ出力クラス、イベント監視クラス
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
  | 'metrics_snapshot';

/**
 * コンポーネント型
 * @summary コンポーネント種別を取得する
 * コンポーネントの種類を表す型定義です。
 * @returns {'extension' | 'subagent' | 'team' | 'skill' | 'tool'} コンポーネント種別
 */
export type ComponentType = 'extension' | 'subagent' | 'team' | 'skill' | 'tool';

/**
 * ツール型
 * @summary ツール種別を取得する
 * ツールの種類を表す型定義です。
 * @returns {'builtin' | 'extension' | 'dynamic'} ツール種別
 */
export type ToolType = 'builtin' | 'extension' | 'dynamic';

/**
 * ステータス型
 * @summary ステータスを取得する
 * 処理状態を表す型定義です。
 * @returns {'pending' | 'running' | 'success' | 'failure' | ...'} 処理状態
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
/**
     * 操作の種類を表す型
     *
     * エージェントの実行モードを区別するための文字列リテラル型。
     * サブエージェント実行、チーム実行、ループ実行、直接実行のいずれかを指定する。
     *
     * @example
     * const operationType: OperationType = 'subagent_run';
     */
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
/**
     * /**
     * * 操作終
     */
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
/**
     * /**
     * * ツール呼び出しイベントを表すインターフェース
     * *
     * * ツールの実行に関する詳細情報を含むイベントデータ。
     * * ツール名、タイプ、パラメータ、呼び出し元情報、環境情報を保持する。
     * *
     */
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
 * @param eventType イベントタイプ
 * @param data 操作結果データ
 */
export interface OperationEndEvent extends BaseEvent {
  eventType: 'operation_end';
  data: {
    durationMs: number;
    status: Status;
    tokensUsed: number;
/**
     * /**
     * * LLMリクエストイベントの構造を定義するインターフェース
     * *
     * * LLMへのリクエストに関する情報を記録するイベント型。
     * * プロバイダ、モデル、プロンプト情報、トークン設定などを含む。
     * *
     * * @property eventType - イベント種別（'llm_request'で固定）
     * * @property data.provider - LLMプロバイダー名
     * * @property data.model - 使用するモデル名
     * * @property data.systemPromptLength - システムプロンプトの文字数
     * * @property data.systemPromptHash - システムプロンプトのハッシュ値
     * * @property data.userMessageCount - ユーザーメッセージの数
     * * @property data.userMessageLength - ユーザーメッセージの総文字数
     * * @property data.temperature - 生成の温度パラメータ（オプション）
     * * @property data.maxTokens - 最大トークン数（オプション）
     * * @property data.contextWindowUsed - 使用したコンテキストウィンドウサイズ
     * * @property data
     */
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
 * LLM API呼び出しエラーを表すイベントインターフェース
 *
 * BaseEventを継承し、LLMプロバイダーでのエラー発生時の詳細情報を格納する。
 * レート制限、タイムアウト、コンテキスト超過などのエラータイプを区別可能。
 *
 * @property eventType - イベント種別（固定値: 'llm_error'）
 * @property data.provider - LLMプロバイダー名
 * @property data.model - 使用モデル名
 * @property data.errorType - エラーの種類（rate_limit, timeout, context_too_long, api_error, unknown）
 * @property data.errorMessage - エラーメッセージ
 * @property data.retryAttempt - リトライ試行回数（省略可）
 */

/**
 * ユーザー入力イベントを表すインターフェース
 *
 * BaseEventを継承し、ユーザーからの入力情報を格納する。
 * テキスト、音声、ファイルのいずれかの入力タイプをサポートする。
 *
 * @property eventType - イベント種別（'user_input'で固定）
 * @property data.input - ユーザーが入力した内容
 * @property data.inputType - 入力形式（'text' | 'voice' | 'file'）
 * @property data.metadata - オプションのメタ情報（入力ソースやタイムスタンプ）
 * @example
 * const event: UserInputEvent = {
 *   eventType: 'user_input',
 *   data: {
 *     input: 'こんにちは',
 *     inputType: 'text',
 *     metadata: { source: 'chat' }
 *   }
 * };
 */

/**
 * ツール呼び出しイベント
 * @summary ツール呼び出し
 * @param eventType イベント種別
 * @param data ツール呼び出しデータ
 * @param data.toolName ツール名
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
 * @param eventType イベントタイプ
 * @param data 実行結果データ
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
 * ツール実行時のエラーイベントを表します。
 * @summary ツールエラー発生
 * @param eventType イベントの種類
 * @param data エラー詳細データ
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
/**
     * /**
     * * ロガーの動作設定を定義するインターフェース
     * *
     * * ログ出力先、バッファリング、ローテーション、保持期間などの設定を管理します。
     * *
     * * @property logDir - ログファイルを保存するディレクトリパス
     * * @property enabled - ログ出力の有効/無効フラグ
     * * @property bufferSize - バッファサイズ（バイト単位）
     * * @property flushIntervalMs - バッファフラッシュ間隔（ミリ秒）
     * * @property maxFileSizeMB - ログファイルの最大サイズ（メガバイト）
     * * @property retentionDays - ログファイルの保持期間（日数）
     * * @property environment - 実行環境（development/production/test）
     * * @property minLogLevel - 出力する最小ログレベル（
     */
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
 * @param eventType イベントタイプ
 * @param data リクエストデータ
 * @param data.provider プロバイダ名
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
 * @summary LLM応答通知
 * LLMの応答イベント
 * @param eventType イベントタイプ
 * @param data プロバイダー、モデル、トークン数、所要時間、停止理由、ツール呼び出し情報を含む応答データ
 * @returns LLMResponseEvent
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
 * @param eventType イベントの種類
 * @param data エラー詳細情報
 * @param data.provider プロバイダ名
 * @param data.model モデル名
 * @param data.errorType エラーの種類
 * @param data.errorMessage エラーメッセージ
 * @param data.retryAttempt リトライ回数
 * @param data.retryAfterMs リトライ待機時間
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
 * @param eventType イベントの種類
 * @param data 入力データ（input, inputType, metadata）
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
 * @param eventType イベントの種類
 * @param data フィードバックデータ
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
 * @param eventType イベントの種類
 * @param data 設定の詳細情報
 * - configType: 設定の種類
 * - configPath: 設定ファイルのパス
 * - configHash: 設定のハッシュ値
 * - keysLoaded: 読み込まれたキーのリスト
 * - overrides: 上書き設定
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
 * @param {string} eventType - イベント種別
 * @param {object} data - 変更詳細データ
 * @returns {void}
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
 * @param {string} eventType - イベント種別
 * @param {object} data - イベントデータ
 * @returns {void}
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
// 統合型
// ============================================

/**
 * ログイベントの統合型
 * @summary ログイベント定義
 * @returns {void}
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
  | MetricsSnapshotEvent;

// ============================================
// 設定型
// ============================================

/**
 * ロガー設定
 * @summary ロガー設定
 * @param {string} logDir - ログ出力ディレクトリ
 * @param {boolean} enabled - ログ出力有効フラグ
 * @param {number} bufferSize - バッファサイズ
 * @param {number} flushIntervalMs - フラッシュ間隔(ミリ秒)
 * @param {number} maxFileSizeMB - 最大ファイルサイズ(MB)
 * @returns {void}
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
}
