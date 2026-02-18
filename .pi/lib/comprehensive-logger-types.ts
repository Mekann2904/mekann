/**
 * 包括的ログ収集システム - 型定義
 * 
 * ファイル: .pi/lib/comprehensive-logger-types.ts
 * 目的: 全イベントの型定義
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

export type ComponentType = 'extension' | 'subagent' | 'team' | 'skill' | 'tool';

export type ToolType = 'builtin' | 'extension' | 'dynamic';

export type Status = 'pending' | 'running' | 'success' | 'failure' | 'timeout' | 'partial' | 'cancelled';

// ============================================
// ベースイベント
// ============================================

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
 * /**
 * * セッション開始イベントを表すインターフェース
 * *
 * * セッションが開始された際に記録されるイベント。PIバージョン、Node.jsバージョン、
 * * プラットフォーム情報、環境変数キー一覧、設定ハッシュ、起動時間などの
 * * セッション初期化に関する情報を含む。
 * *
 * * @property eventType - イベント種別（'session_start'）
 * * @property data - セッション開始時の環境情報とメタデータ
 * * @property data.piVersion - PIのバージョン
 * * @property data.nodeVersion - Node.jsのバージョン
 * * @property data.platform - 実行プラットフォーム情報
 * * @property data.cwd - カレントワーキングディレクトリ
 * * @property data.envKeys - 環境変数のキー一覧
 * * @property data.configHash - 設定ファイルのハッシュ値
 * * @property data.startupTimeMs -
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

export type OperationType = 'subagent_run' | 'team_run' | 'loop_run' | 'direct';

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
 * ツール実行結果を表すイベントインターフェース
 *
 * ツールの実行完了時に生成されるイベントで、実行ステータス、
 * 出力内容、実行時間などの結果情報を含みます。
 *
 * @property eventType - イベント種別（'tool_result'で固定）
 * @property data - ツール実行結果の詳細データ
 * @property data.toolName - 実行されたツール名
 * @property data.status - 実行ステータス（success/error/partial）
 * @property data.durationMs - 実行時間（ミリ秒）
 * @property data.outputType - 出力タイプ（inline/file/truncated）
 * @property data.output - ツールの出力内容
 * @property data.outputHash - 出力内容のハッシュ値（オプション）
 * @property data.outputSize - 出力サイズ（バイト）
 * @property data.exitCode - 終了コード（オプション）
 * @property data.mimeType - 出力のMIMEタイプ（オプション）
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
 * ユーザーからのフィードバックを表すイベント
 *
 * ユーザーがシステムの応答やアクションに対して行ったフィードバック情報を格納する。
 * 承認、拒否、修正、明確化の4種類のフィードバックタイプをサポートする。
 *
 * @property eventType - イベント種別（'user_feedback'で固定）
 * @property data - フィードバックデータ
 * @property data.feedbackType - フィードバック種別（'approval' | 'rejection' | 'correction' | 'clarification'）
 * @property data.targetEventId - フィードバック対象のイベントID
 * @property data.content - フィードバックの内容
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
 * すべてのログイベント型を統合したユニオン型
 *
 * セッション、タスク、操作、ツール呼び出し、LLMリクエストなど、
 * ログシステムで扱うすべてのイベント型を統合した型定義です。
 *
 * @example
 * const event: LogEvent = sessionStartEvent;
 * if (event.type === 'session_start') {
 *   console.log('Session started:', event.sessionId);
 * }
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
