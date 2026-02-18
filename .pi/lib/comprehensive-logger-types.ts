/**
 * @abdd.meta
 * path: .pi/lib/comprehensive-logger-types.ts
 * role: 包括的ログ収集システムの型定義モジュール
 * why: ログイベントの構造と種類を型レベルで厳密に定義し、ログ収集・分析時の型安全性を保証するため
 * related: comprehensive-logger.ts, event-processor.ts, log-aggregator.ts
 * public_api: EventType, ComponentType, ToolType, Status, BaseEvent, SessionStartEvent
 * invariants: 全イベントはBaseEventを継承しeventId/sessionId/taskId/operationIdを必須とする、timestampはナノ秒精度の文字列形式
 * side_effects: なし（型定義のみ）
 * failure_modes: なし（実行時コードを含まない）
 * @abdd.explain
 * overview: ログ収集システムで使用する全ての型定義を集約した純粋型定義ファイル
 * what_it_does:
 *   - イベント種別（EventType）として20種類のユニオン型を定義（ライフサイクル/ツール/LLM/ユーザー/システム）
 *   - コンポーネント種別（ComponentType）、ツール種別（ToolType）、ステータス（Status）のユニオン型を定義
 *   - BaseEventインターフェースで全イベントの共通構造（識別子、相関ID、タイムスタンプ、コンポーネント情報）を規定
 *   - SessionStartEvent等の具象イベント型でイベント種別ごとのデータ構造を定義
 * why_it_exists:
 *   - ログイベントのスキーマを一元管理し、収集側と分析側で型の不整合を防ぐ
 *   - 階層的な相関ID（session/task/operation）によるトレーサビリティを型レベルで強制
 *   - ナノ秒精度タイムスタンプによる高精度な時系列分析を可能にする
 * scope:
 *   in: なし
 *   out: ログイベントのシリアライズ/デシリアライズ処理、ログ分析・可視化モジュール
 */

 /**
  * 包括的ログ収集システムで発生するイベントの種類
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
  * コンポーネントの種類を表す型定義
  */
export type ComponentType = 'extension' | 'subagent' | 'team' | 'skill' | 'tool';

 /**
  * ツールの種類を表す型定義
  */
export type ToolType = 'builtin' | 'extension' | 'dynamic';

 /**
  * ステータスの種類を表すユニオン型
  */
export type Status = 'pending' | 'running' | 'success' | 'failure' | 'timeout' | 'partial' | 'cancelled';

// ============================================
// ベースイベント
// ============================================

 /**
  * 全てのイベントの基本構造を定義するインターフェース
  * @param eventId イベントの一意な識別子
  * @param eventType イベントの種類
  * @param sessionId セッションの識別子
  * @param taskId タスクの識別子
  * @param operationId オペレーションの識別子
  * @param parentEventId 親イベントの識別子（任意）
  * @param timestamp タイムスタンプ（ナノ秒精度）
  * @param component コンポーネント情報
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
  * セッション開始イベントのデータ構造。
  * @property eventType - イベント種別（'session_start'）
  * @property data - セッション開始時の環境情報とメタデータ
  * @property data.piVersion - PIのバージョン
  * @property data.nodeVersion - Node.jsのバージョン
  * @property data.platform - 実行プラットフォーム情報
  * @property data.cwd - カレントワーキングディレクトリ
  * @property data.envKeys - 環境変数のキー一覧
  * @property data.configHash - 設定ファイルのハッシュ値
  * @property data.startupTimeMs - 起動時間（ミリ秒）
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
  * @property eventType - イベントタイプ
  * @property data.durationMs - 実行時間（ミリ秒）
  * @property data.taskCount - タスク数
  * @property data.errorCount - エラー数
  * @property data.totalTokensUsed - 使用トークン合計
  * @property data.exitReason - 終了理由
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
  * @param eventType イベント種別 'task_start'
  * @param data タスクデータ
  * @param data.userInput ユーザー入力
  * @param data.inputType 入力種別
  * @param data.context コンテキスト情報
  * @param data.context.filesReferenced 参照ファイル一覧
  * @param data.context.skillsLoaded ロード済みスキル一覧
  * @param data.context.teamsAvailable 利用可能なチーム一覧
  * @param data.intent 意図（任意）
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
  * @param eventType イベントの種類
  * @param data.durationMs 実行時間（ミリ秒）
  * @param data.status ステータス
  * @param data.operationsCount 操作数
  * @param data.toolsCount ツール数
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
 */
export type OperationType = 'subagent_run' | 'team_run' | 'loop_run' | 'direct';

 /**
  * 操作開始イベント
  * @param eventType イベントの種別
  * @param data 操作詳細データ
  * @param data.operationType 操作の種類
  * @param data.target 操作対象
  * @param data.input 操作入力
  * @param data.input.task タスク内容
  * @param data.input.params パラメータ
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
  * オペレーション終了イベント
  * @property eventType - イベント種別
  * @property data.durationMs - 実行時間（ミリ秒）
  * @property data.status - ステータス
  * @property data.tokensUsed - 使用トークン数
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
  * @property eventType - イベント種別（'tool_call'で固定）
  * @property data - ツール呼び出しデータ
  * @property data.toolName - ツール名
  * @property data.toolType - ツール種別
  * @property data.params - ツール引数
  * @property data.caller - 呼び出し元情報
  * @property data.caller.file - ファイルパス
  * @property data.caller.line - 行番号
  * @property data.caller.function - 関数名
  * @property data.environment - 実行環境情報
  * @property data.environment.cwd - カレントワーキングディレクトリ
  * @property data.environment.shell - シェル（オプション）
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
  * ツール実行結果を表すイベント
  * @param eventType イベントの種別（'tool_result'）
  * @param data ツール実行結果データ
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
  * @param eventType - イベントの種類
  * @param data - エラーの詳細情報
  * @param data.toolName - エラーが発生したツール名
  * @param data.errorType - エラーの種類
  * @param data.errorMessage - エラーメッセージ
  * @param data.errorStack - エラースタックトレース（任意）
  * @param data.recoveryAttempted - 復旧が試みられたかどうか
  * @param data.recoveryMethod - 復旧方法（任意）
  * @param data.recoverySuccessful - 復旧が成功したかどうか（任意）
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
  * @param eventType イベントタイプ
  * @param data リクエストデータ
  * @param data.provider プロバイダ名
  * @param data.model モデル名
  * @param data.systemPromptLength システムプロンプトの長さ
  * @param data.systemPromptHash システムプロンプトのハッシュ
  * @param data.userMessageCount ユーザーメッセージ数
  * @param data.userMessageLength ユーザーメッセージの長さ
  * @param data.temperature 温度パラメータ
  * @param data.maxTokens 最大トークン数
  * @param data.contextWindowUsed 使用コンテキストウィンドウ
  * @param data.toolsAvailable 利用可能ツール
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
  * LLMの応答イベント
  * @param eventType イベントタイプ
  * @param data プロバイダー、モデル、トークン数、所要時間、停止理由、ツール呼び出し情報を含む応答データ
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
  * LLMエラー発生時のイベント情報
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
  * ユーザーフィードバックイベント
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
  * 設定読み込みイベント
  * @param eventType イベントの種類
  * @param configType 設定の種類
  * @param configPath 設定ファイルのパス
  * @param configHash 設定のハッシュ値
  * @param keysLoaded 読み込まれたキーのリスト
  * @param overrides 上書き設定
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
  * 状態変化イベントを表すインターフェース
  * @param eventType イベント種別
  * @param data 変更詳細
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
  * メトリクススナップショットイベントを表します
  * @param data メモリ使用量、CPU使用率、イベント数などのメトリクスデータ
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
  * すべてのログイベントの共用体型
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
  * ロガーの動作設定を定義します
  * @param logDir ログ出力先ディレクトリ
  * @param enabled ログ機能の有効フラグ
  * @param bufferSize バッファサイズ
  * @param flushIntervalMs フラッシュ間隔（ミリ秒）
  * @param maxFileSizeMB 最大ファイルサイズ（MB）
  * @param retentionDays ログ保持日数
  * @param environment 実行環境
  * @param minLogLevel 最小ログレベル
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
