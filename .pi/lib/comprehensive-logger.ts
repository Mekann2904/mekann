/**
 * @abdd.meta
 * path: .pi/lib/comprehensive-logger.ts
 * role: アプリケーション全操作の機械的記録と永続化を行う包括的ロガー
 * why: 動作追跡、デバッグ、パフォーマンス分析のために高精度なイベントログを集約するため
 * related: comprehensive-logger-config.ts, comprehensive-logger-types.ts
 * public_api: ComprehensiveLoggerクラス、startSessionメソッド
 * invariants: sessionIdはインスタンスごとに一意、ログバッファはフラッシュでクリア、タイマーは有効時のみ動作
 * side_effects: ファイルシステムへのログ書き込み、定期タイマーの設定、標準エラー出力へのエラー出力
 * failure_modes: ディレクトリ作成権限不足によるログ出力失敗、フラッシュ処理中のI/Oエラー、バッファオーバーフロー（設定未実装時）
 * @abdd.explain
 * overview: セッション、タスク、操作、ツール呼び出し、LLM応答などのイベントを時系列かつ高精度に記録し、ファイルへ非同期に出力するシステム
 * what_it_does:
 *   - ナノ秒精度のタイムスタンプ生成とUUIDベースのセッション管理
 *   - インメモリバッファによるログの蓄積と定期フラッシュ
 *   - ログディレクトリの自動作成
 *   - 各イベントライフサイクル（開始・終了）の追跡と指標（Tokens, ErrorCount等）の集計
 * why_it_exists:
 *   - システム全体の挙動を詳細に監視・再現するため
 *   - ボトルネックやエラーの原因特定を効率化するため
 *   - セッション単位のユーザー行動分析を行うため
 * scope:
 *   in: 設定オブジェクト、各種イベントデータ
 *   out: 構造化されたJSONログファイル
 */

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
 * 包括的ロガー
 * @summary ログ出力管理
 * @returns {void}
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
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }
  
  // ============================================
  // セッション管理
  // ============================================
  
  /**
   * セッション開始
   * @summary セッション開始処理
   * @param data セッション開始データ
   * @returns {string} セッションID
   */
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
  
  /**
   * セッション終了
   * @summary セッション終了処理
   * @param exitReason 終了理由
   * @returns {void}
   */
  endSession(exitReason: SessionEndEvent['data']['exitReason']): void {
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
  
  /**
   * タスク開始
   * @summary タスク開始処理
   * @param userInput ユーザー入力
   * @param context コンテキスト
   * @returns {string} タスクID
   */
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
  
  /**
   * タスク終了
   * @summary タスク終了処理
   * @param data タスク終了データ
   * @returns {void}
   */
  endTask(data: Omit<TaskEndEvent['data'], 'durationMs'>): void {
    const durationMs = Math.round(performance.now() - this.taskStartTime);

    this.emit({
      eventType: 'task_end',
      data: {
        ...data,
        durationMs,
      },
    } as TaskEndEvent);

    this.activeTasks.delete(this.currentTaskId);
    this.currentTaskId = '';
  }
  
  // ============================================
  // 操作管理
  // ============================================
  
  /**
   * 操作を開始し、操作IDを生成する
   * @summary 操作開始
   * @param {string} operationType 操作の種類
   * @param {string} target 対象
   * @param {unknown} input 入力データ
   * @param {Partial<LogOptions>} options ログオプション
   * @returns {string} 操作ID
   */
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
  
  /**
   * 操作を終了する
   * @summary 操作終了
   * @param {Record<string, unknown>} data 操作データ
   * @returns {void}
   */
  endOperation(data: Omit<OperationEndEvent['data'], 'durationMs'>): void {
    const durationMs = Math.round(performance.now() - this.operationStartTime);

    if (data.error) {
      this.errorCount++;
    }

    if (data.tokensUsed) {
      this.totalTokens += data.tokensUsed;
    }

    this.emit({
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

  /**
   * ツール呼び出しをログに記録する
   * @summary ツール呼び出し記録
   * @param {string} toolName ツール名
   * @param {Record<string, unknown>} params 呼び出しパラメータ
   * @param {string} caller 呼び出し元
   * @returns {string} イベントID
   */
  logToolCall(
    toolName: string,
    params: Record<string, unknown>,
    caller: ToolCallEvent['data']['caller']
  ): string {
    const eventId = randomUUID();

    this.emit({
      eventType: 'tool_call',
      data: {
        toolName,
        toolType: this.getToolType(toolName),
        params,
        caller,
        environment: {
          cwd: process.cwd(),
          shell: process.env.SHELL,
        },
      },
    } as ToolCallEvent);
    
    this.parentEventId = eventId;
    return eventId;
  }
  
  /**
   * ツール実行結果を記録
   * @summary ツール結果記録
   * @param {string} toolName ツール名
   * @param {unknown} result 実行結果
   * @returns {void}
   */
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
  
  /**
   * ツールエラーを記録
   * @summary ツールエラー記録
   * @param {string} toolName ツール名
   * @param {Error} error エラーオブジェクト
   * @returns {void}
   */
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
  
  /**
   * @summary LLMリクエスト記録
   * @param data LLMリクエストデータ
   * @returns 生成されたイベントID
   */
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
   * LLM応答をログ記録する
   * @param data プロバイダ、モデル、トークン数、所要時間等を含む応答データ
   * @returns なし
   */
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
  
  /**
   * 状態変更ログを出力する
   * @param data 状態変更データ（エンティティ種別、パス、変更種別、変更前後の内容など）
   * @returns なし
   */
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
  
  /**
   * メトリクス記録
   * @summary メトリクスを記録
   * @param data スナップショットデータ
   * @returns なし
   * @fires metrics_snapshot
   */
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
  
  /**
   * ログをフラッシュする
   * @summary ログをフラッシュ
   * @returns 解決時に処理完了
   */
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
  
  /**
   * セッションIDを取得
   * @summary セッションIDを取得
   * @returns 現在のセッションID
   */
  getSessionId(): string {
    return this.sessionId;
  }
  
  /**
   * タスクIDを取得
   * @summary タスクIDを取得
   * @returns 現在のタスクID
   */
  getCurrentTaskId(): string {
    return this.currentTaskId;
  }
  
  /**
   * オペレーションIDを取得
   * @summary オペレーションIDを取得
   * @returns 現在のオペレーションID
   */
  getCurrentOperationId(): string {
    return this.currentOperationId;
  }
  
  /**
   * イベント件数を取得
   * @summary イベント件数を取得
   * @returns 現在のイベント件数
   */
  getEventCount(): number {
    return this.eventCounter;
  }
  
  /**
   * エラー数を取得
   * @summary エラー数を返す
   * @returns {number} エラー数
   */
  getErrorCount(): number {
    return this.errorCount;
  }
  
  /**
   * 総トークン数を取得
   * @summary 総トークン数を返す
   * @returns {number} 総トークン数
   */
  getTotalTokens(): number {
    return this.totalTokens;
  }
}

// ============================================
// シングルトンインスタンス
// ============================================

let globalLogger: ComprehensiveLogger | null = null;

/**
 * ロガーを取得
 * @summary ロガーを取得する
 * @returns {ComprehensiveLogger} ロガーインスタンス
 */
export function getLogger(): ComprehensiveLogger {
  if (globalLogger === null) {
    globalLogger = new ComprehensiveLogger();
  }
  return globalLogger;
}

/**
 * ロガーをリセット
 * @summary ロガーを初期化する
 * @returns {void}
 */
export function resetLogger(): void {
  if (globalLogger) {
    globalLogger.endSession('normal');
  }
  globalLogger = null;
}

// デフォルトエクスポート
export default getLogger;
