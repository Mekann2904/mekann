/**
 * 包括的ログ収集システム - ロガー実装
 * 
 * ファイル: .pi/lib/comprehensive-logger.ts
 * 目的: 全操作を機械的に記録するロガー
 */

import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import { existsSync, statSync } from 'fs';
import { appendFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { performance } from 'perf_hooks';

import { DEFAULT_CONFIG, getConfig } from './comprehensive-logger-config';
import {
  BaseEvent,
  EventType,
  LogEvent,
  LoggerConfig,
  SessionStartEvent,
  SessionEndEvent,
  TaskStartEvent,
  TaskEndEvent,
  OperationStartEvent,
  OperationEndEvent,
  ToolCallEvent,
  ToolResultEvent,
  ToolErrorEvent,
  LLMResponseEvent,
  MetricsSnapshotEvent,
  OperationType,
  ToolType,
  Status,
} from './comprehensive-logger-types';

// ============================================
// ユーティリティ関数
// ============================================

function getTimestamp(): string {
  const now = new Date();
  const ms = now.getMilliseconds().toString().padStart(3, '0');
  const ns = (performance.now() % 1).toFixed(6).slice(2);
  return now.toISOString().replace(/\.\d{3}Z$/, `.${ms}${ns}Z`);
}

function getDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function hashString(str: string): string {
  return createHash('sha256').update(str).digest('hex').slice(0, 16);
}

// ============================================
// ロガークラス
// ============================================

/**
 * セッション、タスク、オペレーションを包括的に管理するロガークラス
 *
 * ログイベントのバッファリング、定期フラッシュ、エラー追跡、トークン使用量の記録など、
 * 高度なログ機能を提供します。各ログイベントは一意のIDで追跡され、
 * 階層的なタスク・オペレーション管理をサポートします。
 *
 * @param config - ロガー設定オプション（省略時はデフォルト設定を使用）
 * @example
 * // 基本的な使用方法
 * const logger = new ComprehensiveLogger({ logDir: './logs' });
 * logger.startSession();
 * logger.startTask('ユーザー入力');
 * // ... 処理 ...
 * logger.endTask();
 * logger.endSession();
 */
export class ComprehensiveLogger {
  private config: LoggerConfig;
  private buffer: LogEvent[] = [];
  private sessionId: string;
  private currentTaskId: string = '';
  private currentOperationId: string = '';
  private parentEventId: string = '';
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private eventCounter: number = 0;
  private errorCount: number = 0;
  private totalTokens: number = 0;
  private sessionStartTime: number = 0;
  private taskStartTime: number = 0;
  private operationStartTime: number = 0;
  private activeOperations: Map<string, { startTime: number; target: string }> = new Map();
  private activeTasks: Map<string, { startTime: number; userInput: string }> = new Map();
  
  constructor(config?: Partial<LoggerConfig>) {
    this.config = config ? { ...DEFAULT_CONFIG, ...config } : getConfig();
    this.sessionId = randomUUID();
    this.sessionStartTime = performance.now();
    
    if (this.config.enabled) {
      this.startFlushTimer();
      this.ensureLogDir();
    }
  }
  
  // ============================================
  // 初期化
  // ============================================
  
  private async ensureLogDir(): Promise<void> {
    if (!existsSync(this.config.logDir)) {
/**
       * セッションを開始し、セッションIDを返す
       *
       * セッション開始イベントを発行し、自動的に起動時間を計算して追加します。
       *
       * @param data - セッション開始データ（startupTimeMsは自動計算されるため除外）
       * @returns 現在のセッションID
       * @example
       * const sessionId = logger.startSession({
       *   userId: 'user123',
       *   deviceInfo: { platform: 'web' }
       * });
       */
      await mkdir(this.config.logDir, { recursive: true });
    }
  }
  
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(err => {
        // eslint-disable-next-line no-console
        console.error('[comprehensive-logger] Flush error:', err);
      });
    }, this.config.flushIntervalMs);
  }
  
  // ============================================
  // セッション管理
  // ============================================
  
  startSession(data: Omit<SessionStartEvent['data'], 'startupTimeMs'>): string {
    this.emit({
      eventType: 'session_start',
      data: {
        ...data,
        startupTimeMs: Math.round(performance.now() - this.sessionStartTime),
      },
    } as SessionStartEvent);
    return this.sessionId;
  }
  
  endSession(exitReason: SessionEndEvent['data']['exitReason']): void {
/**
     * タスクを終了し、終了イベントを記録する
     *
     * タスクの実行時間を自動的に計算し、`task_end`イベントとして発行する。
     * `durationMs`は内部で自動計算されるため、dataには含める必要がない。
     *
     * @param data - タスク終了データ（success、result、errorなどを含む）
     * @returns なし
     * @example
     * // 成功時のタスク終了
     * logger.endTask({
     *   success: true,
     *   result: '処理が完了しました'
     * });
     *
     * // エラー時のタスク終了
     * logger.endTask({
     *   success: false,
     *   error: '処理中にエラーが発生しました'
     * });
     */
    const durationMs = Math.round(performance.now() - this.sessionStartTime);
    
    this.emit({
      eventType: 'session_end',
      data: {
        durationMs,
        taskCount: this.activeTasks.size,
        errorCount: this.errorCount,
        totalTokensUsed: this.totalTokens,
        exitReason,
      },
    } as SessionEndEvent);
    
    this.flush();
    this.stopFlushTimer();
  }
  
  // ============================================
  // タスク管理
  // ============================================
  
  startTask(
    userInput: string,
    context: TaskStartEvent['data']['context']
  ): string {
    this.currentTaskId = randomUUID();
    this.taskStartTime = performance.now();
    
    this.activeTasks.set(this.currentTaskId, {
      startTime: this.taskStartTime,
      userInput,
    });
    
    this.emit({
      eventType: 'task_start',
      data: {
        userInput,
        inputType: 'text',
        context,
      },
    } as TaskStartEvent);
    
    return this.currentTaskId;
  }
  
  endTask(data: Omit<TaskEndEvent['data'], 'durationMs'>): void {
    const durationMs = Math.round(performance.now() - this.taskStartTime);
    
    this.emit({
      eventType: 'task_end',
      data: {
        ...data,
        durationMs,
      },
    } as TaskEndEvent);
    
/**
     * ツール呼び出しをログに記録する
     *
     * @param toolName - 呼び出すツールの名前
     * @param params - ツールに渡すパラメータオブジェクト
     * @param caller - ツール呼び出し元の情報
     * @returns 生成されたイベントID
     * @example
     * const eventId = logger.logToolCall('readFile', { path: '/src/index.ts' }, { type: 'agent', id: 'agent-1' });
     */
    this.activeTasks.delete(this.currentTaskId);
    this.currentTaskId = '';
  }
  
  // ============================================
  // 操作管理
  // ============================================
  
  startOperation(
    operationType: OperationType,
    target: string,
    input: OperationStartEvent['data']['input'],
    options?: {
      strategy?: string;
      retryConfig?: OperationStartEvent['data']['retryConfig'];
    }
  ): string {
    this.currentOperationId = randomUUID();
    this.operationStartTime = performance.now();
    
    this.activeOperations.set(this.currentOperationId, {
      startTime: this.operationStartTime,
      target,
    });
    
    this.emit({
      eventType: 'operation_start',
      data: {
        operationType,
        target,
        input,
        strategy: options?.strategy,
        retryConfig: options?.retryConfig,
      },
    } as OperationStartEvent);
    
    return this.currentOperationId;
  }
  
  endOperation(data: Omit<OperationEndEvent['data'], 'durationMs'>): void {
    const durationMs = Math.round(performance.now() - this.operationStartTime);
    
    if (data.error) {
      this.errorCount++;
    }
    
    if (data.tokensUsed) {
      this.totalTokens += data.tokensUsed;
    }
    
    this.emit({
/**
       * /**
       * * LLMリクエストをログに記録し、イベントIDを返す
       * *
       * * @param data - LLMリクエストデータ
       * * @param data.provider - LLMプロバイダー名
       * * @param data.model - モデル名
       * * @param data.systemPrompt - システムプロンプト
       * * @param data.userMessages - ユーザーメッセージの配列
       * * @param data.temperature - 生成の温度パラメータ（オプション）
       * * @param data.maxTokens - 最大トークン数（オプション）
       * * @param data.toolsAvailable - 利用可能
       */
      eventType: 'operation_end',
      data: {
        ...data,
        durationMs,
      },
    } as OperationEndEvent);
    
    this.activeOperations.delete(this.currentOperationId);
    this.currentOperationId = '';
  }
  
  // ============================================
  // ツールログ
  // ============================================
  
  logToolCall(
    toolName: string,
    params: Record<string, unknown>,
/**
     * /**
     * * LLMの応答結果をログに記録する
     * *
     * * @param data - LLM応答データ
     * * @param data.provider - LLMプロバイダー名
     * * @param data.model - 使用されたモデル名
     * * @param data.inputTokens - 入力トークン数
     * * @param data.outputTokens - 出力トークン数
     * * @param data.durationMs - 応答にかかった時間（ミリ秒）
     * * @param data.responseLength - 応答の長さ
     * * @param data.stopReason - 停止理由
     * * @param data.toolsCalled - 呼び出されたツールの配列
     * * @returns なし
     * * @example
     * * // LLM応答のログ記録
     * * logger.logLLMResponse({
     * *   provider: 'openai',
     * *   model: 'gpt-4',
     * *   inputTokens: 150,
     * *   outputTokens: 300,
     * *   durationMs: 2500,
     * *
     */
    caller: ToolCallEvent['data']['caller']
  ): string {
    const eventId = randomUUID();
    
/**
     * /**
     * * 状態変更をログに記録する
     * *
     * * ファイル、ストレージ、メモリ、設定の状態変更を追跡し、
     * * 変更前後の内容や差分情報を記録します。
     * *
     * * @param data - 状態変更情報
     * * @param data.entityType - エンティティの種類（'file' | 'storage' | 'memory' | 'config'）
     * * @param data.entityPath - エンティティのパス
     * * @param data.changeType - 変更の種類（'create' | 'update' | 'delete'）
     * * @param data.beforeContent - 変更前の内容（省略可能）
     * * @param data.afterContent - 変更後の内容（省略可能）
     * * @param data.diff - 差分情報（省略可能）
     * * @returns なし
     */
    this.emit({
      eventType: 'tool_call',
      data: {
        toolName,
        toolType: this.getToolType(toolName),
        params,
        caller,
        environment: {
          cwd: process.cwd(),
/**
           * メトリクススナップショットをログに出力する
           *
           * 指定されたメトリクスデータにイベント総数を付加して、
           * メトリクススナップショットイベントとして出力する。
           *
           * @param data - メトリクススナップショットのデータ
           * @returns なし
           * @example
           * // メトリクススナップショットのログ出力
           * logger.logMetricsSnapshot({
           *   timestamp: Date.now(),
           *   metrics: { cpu: 0.5, memory: 1024 }
           * });
           */
          shell: process.env.SHELL,
        },
      },
    } as ToolCallEvent);
    
    this.parentEventId = eventId;
    return eventId;
  }
  
  logToolResult(
    toolName: string,
    result: Omit<ToolResultEvent['data'], 'toolName'>
  ): void {
    this.emit({
      eventType: 'tool_result',
      data: {
        toolName,
        ...result,
      },
    } as ToolResultEvent);
    
    this.parentEventId = '';
  }
  
  logToolError(
    toolName: string,
    error: Omit<ToolErrorEvent['data'], 'toolName'>
  ): void {
    this.errorCount++;
    
    this.emit({
      eventType: 'tool_error',
      data: {
        toolName,
        ...error,
      },
    } as ToolErrorEvent);
    
    this.parentEventId = '';
  }
  
  // ============================================
  // LLMログ
  // ============================================
  
  logLLMRequest(data: {
    provider: string;
    model: string;
    systemPrompt: string;
    userMessages: Array<{ content: string }>;
    temperature?: number;
    maxTokens?: number;
    toolsAvailable: string[];
  }): string {
    const eventId = randomUUID();
    
    this.emit({
      eventType: 'llm_request',
      data: {
        provider: data.provider,
        model: data.model,
        systemPromptLength: data.systemPrompt.length,
        systemPromptHash: hashString(data.systemPrompt),
        userMessageCount: data.userMessages.length,
        userMessageLength: data.userMessages.reduce((sum, m) => sum + m.content.length, 0),
        temperature: data.temperature,
        maxTokens: data.maxTokens,
        contextWindowUsed: 0, // 計算が必要
        toolsAvailable: data.toolsAvailable,
      },
    });
    
    this.parentEventId = eventId;
    return eventId;
  }
  
  /**
   * 現在のセッションIDを取得する
   * @returns セッションID文字列
   */
  getSessionId(): string {
    return this.sessionId;
  }
  
  /**
   * 現在のタスクIDを取得する
   * @returns 現在のタスクID文字列
   */
  getCurrentTaskId(): string | undefined {
    return this.currentTaskId;
  }
  
  /**
   * 現在の操作IDを取得する
   * @returns 現在の操作ID文字列
   */
  getCurrentOperationId(): string | undefined {
    return this.currentOperationId;
  }
  
  /**
   * 記録されたイベント数を取得する
   * @returns これまでに記録されたイベントの総数
   */
  getEventCount(): number {
    return this.events.length;
  }
  
  /**
   * エラー発生回数を取得する
   * @returns 記録されたエラーの総数
   */
  getErrorCount(): number {
    return this.events.filter(e => e.eventType === 'error').length;
  }
  
  /**
   * 累積トークン数を取得する
   * @returns 累積トークン数
   */
  getTotalTokens(): number {
    return this.totalTokens;
  }
  
  logLLMResponse(data: {
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
    responseLength: number;
    stopReason: LLMResponseEvent['data']['stopReason'];
    toolsCalled: Array<{ name: string; paramsSize: number }>;
  }): void {
    const totalTokens = data.inputTokens + data.outputTokens;
    this.totalTokens += totalTokens;
    
    this.emit({
      eventType: 'llm_response',
      data: {
        ...data,
        totalTokens,
      },
    });
    
    this.parentEventId = '';
  }
  
  // ============================================
  // 状態変更ログ
  // ============================================
  
  logStateChange(data: {
    entityType: 'file' | 'storage' | 'memory' | 'config';
    entityPath: string;
    changeType: 'create' | 'update' | 'delete';
    beforeContent?: string;
    afterContent?: string;
    diff?: { additions: number; deletions: number; hunks: number };
  }): void {
    this.emit({
      eventType: 'state_change',
      data: {
        entityType: data.entityType,
        entityPath: data.entityPath,
        changeType: data.changeType,
        diff: data.diff,
        beforeHash: data.beforeContent ? hashString(data.beforeContent) : undefined,
        afterHash: data.afterContent ? hashString(data.afterContent) : undefined,
      },
    });
  }
  
  // ============================================
  // メトリクススナップショット
  // ============================================
  
  logMetricsSnapshot(data: MetricsSnapshotEvent['data']): void {
    this.emit({
      eventType: 'metrics_snapshot',
      data: {
        ...data,
        eventsTotal: this.eventCounter,
      },
    });
  }
  
  // ============================================
  // 内部メソッド
  // ============================================
  
  private emit(event: { eventType: EventType } & Omit<BaseEvent, 'eventId' | 'sessionId' | 'taskId' | 'operationId' | 'parentEventId' | 'timestamp' | 'component'> & { data: unknown }): void {
    if (!this.config.enabled) return;
    
    const fullEvent: BaseEvent = {
      ...event,
      eventId: randomUUID(),
      sessionId: this.sessionId,
      taskId: this.currentTaskId,
      operationId: this.currentOperationId,
      parentEventId: this.parentEventId || undefined,
      timestamp: getTimestamp(),
      component: {
        type: 'extension',
        name: 'comprehensive-logger',
        version: '1.0.0',
      },
    };
    
    this.buffer.push(fullEvent as LogEvent);
    this.eventCounter++;
    
    if (this.buffer.length >= this.config.bufferSize) {
      this.flush().catch(err => {
        // eslint-disable-next-line no-console
        console.error('[comprehensive-logger] Flush error:', err);
      });
    }
  }
  
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    
    const events = [...this.buffer];
    this.buffer = [];
    
    await this.ensureLogDir();
    
    const logFile = join(this.config.logDir, `events-${getDateStr()}.jsonl`);
    
    // ファイルサイズチェック
    if (existsSync(logFile)) {
      const stats = statSync(logFile);
      const sizeMB = stats.size / (1024 * 1024);
      if (sizeMB >= this.config.maxFileSizeMB) {
        // ローテーション: 新しいファイル名を使用
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const rotatedFile = join(this.config.logDir, `events-${getDateStr()}-${timestamp}.jsonl`);
        const lines = events.map(e => JSON.stringify(e)).join('\n') + '\n';
        await appendFile(rotatedFile, lines, 'utf-8');
        return;
      }
    }
    
    const lines = events.map(e => JSON.stringify(e)).join('\n') + '\n';
    await appendFile(logFile, lines, 'utf-8');
  }
  
  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
  
  private getToolType(toolName: string): ToolType {
    const builtins = ['read', 'write', 'edit', 'bash'];
    if (builtins.includes(toolName)) return 'builtin';
    if (toolName.startsWith('dynamic_')) return 'dynamic';
    return 'extension';
  }
  
  // ============================================
  // ユーティリティ
  // ============================================
  
  getSessionId(): string {
    return this.sessionId;
  }
  
  getCurrentTaskId(): string {
    return this.currentTaskId;
  }
  
  getCurrentOperationId(): string {
    return this.currentOperationId;
  }
  
  getEventCount(): number {
    return this.eventCounter;
  }
  
  getErrorCount(): number {
    return this.errorCount;
  }
  
  getTotalTokens(): number {
    return this.totalTokens;
  }
}

// ============================================
// シングルトンインスタンス
// ============================================

let globalLogger: ComprehensiveLogger | null = null;

export function getLogger(): ComprehensiveLogger {
  if (globalLogger === null) {
    globalLogger = new ComprehensiveLogger();
  }
  return globalLogger;
}

export function resetLogger(): void {
  if (globalLogger) {
    globalLogger.endSession('normal');
  }
  globalLogger = null;
}

// デフォルトエクスポート
export default getLogger;
