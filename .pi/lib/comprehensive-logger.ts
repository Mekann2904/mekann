/**
 * @abdd.meta
 * path: .pi/lib/comprehensive-logger.ts
 * role: 包括的ログ収集システムのメイン実装クラス
 * why: アプリケーション全体の操作、タスク、ツール呼び出しを機械的に記録し、後続の監査やデバッグを可能にするため
 * related: .pi/lib/comprehensive-logger-config.ts, .pi/lib/comprehensive-logger-types.ts
 * public_api: ComprehensiveLoggerクラスのコンストラクタ、各種イベント記録メソッド（startSession, startTask等）
 * invariants: sessionIdは不変、eventCounterは単調増加、bufferは配列構造を維持
 * side_effects: ファイルシステムへのログ書き込み、メモリ内バッファへの蓄積、タイマーの起動
 * failure_modes: ディスク容量不足による書き込み失敗、タイマー設定の不備によるメモリ枯渇
 * @abdd.explain
 * overview: 高精度なタイムスタンプと構造化イベントを持つ、機械可読なロガーの実装
 * what_it_does:
 *   - セッション、タスク、操作のライフサイクルイベントを生成・管理する
 *   - 内部バッファにログを蓄積し、定期的または手動でディスクへフラッシュする
 *   - ハッシュ関数やUUIDを用いて、一意な識別子と整合性チェックを行う
 * why_it_exists:
 *   - 複雑な処理フローにおける実行履歴を正確に再構築するため
 *   - エラー発生時のトレースバックやパフォーマンス分析のデータソースとするため
 *   - 開発者による手動ログ記述の負担を軽減し、網羅性を確保するため
 * scope:
 *   in: ロガー設定、外部イベントトリガー、タイマー割り込み
 *   out: 構造化されたJSONログファイル、標準エラー出力への例外通知
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
  private static readonly MAX_ACTIVE_OPERATIONS = 1024;
  private static readonly MAX_ACTIVE_TASKS = 256;
  private static readonly STALE_ACTIVE_MS = 60 * 60 * 1000;

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
  /** シャットダウン中フラグ - レースコンディション防止 */
  private isShuttingDown: boolean = false;
  /** flush実行中フラグ - 並行flush呼び出しの直列化 */
  private isFlushing: boolean = false;
  
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
         
        console.error('[comprehensive-logger] Flush error:', err);
      });
    }, this.config.flushIntervalMs);
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }

  private trimOldestEntries<T>(map: Map<string, T>, maxSize: number): void {
    if (map.size <= maxSize) return;
    const overflow = map.size - maxSize;
    const keys = Array.from(map.keys());
    for (let index = 0; index < overflow; index += 1) {
      const key = keys[index];
      if (key) {
        map.delete(key);
      }
    }
  }

  private pruneActiveTasks(now = performance.now()): void {
    for (const [taskId, task] of this.activeTasks.entries()) {
      if (now - task.startTime > ComprehensiveLogger.STALE_ACTIVE_MS) {
        this.activeTasks.delete(taskId);
      }
    }
    this.trimOldestEntries(this.activeTasks, ComprehensiveLogger.MAX_ACTIVE_TASKS);
  }

  private pruneActiveOperations(now = performance.now()): void {
    for (const [operationId, operation] of this.activeOperations.entries()) {
      if (now - operation.startTime > ComprehensiveLogger.STALE_ACTIVE_MS) {
        this.activeOperations.delete(operationId);
      }
    }
    this.trimOldestEntries(this.activeOperations, ComprehensiveLogger.MAX_ACTIVE_OPERATIONS);
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
    // 二重シャットダウン防止
    if (this.isShuttingDown) return;

    const durationMs = Math.round(performance.now() - this.sessionStartTime);

    // session_endイベントはシャットダウンフラグ設定前に送出
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

    // シャットダウンフラグを設定（以降の新規イベントを拒否）
    this.isShuttingDown = true;

    // タイマーを停止（タイマー発火とflushのレース防止）
    this.stopFlushTimer();
    // その後でフラッシュ
    this.flush();
    this.activeTasks.clear();
    this.activeOperations.clear();
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
    this.pruneActiveTasks();
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

    if (this.currentTaskId) {
      this.activeTasks.delete(this.currentTaskId);
    }
    this.pruneActiveTasks();
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
    this.pruneActiveOperations();
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

    if (this.currentOperationId) {
      this.activeOperations.delete(this.currentOperationId);
    }
    this.pruneActiveOperations();
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
  // 実験イベント (autoresearch)
  // ============================================

  /**
   * 実験開始を記録する
   * @summary 実験を開始する
   * @param data 実験開始データ
   * @returns なし
   * @fires experiment_start
   */
  logExperimentStart(data: {
    experimentType: 'e2e' | 'tbench';
    label: string;
    tag?: string;
    branch?: string;
    targetCommit?: string;
    config: Record<string, unknown>;
  }): void {
    this.emit({
      eventType: 'experiment_start',
      data,
    });
  }

  /**
   * 実験ベースラインを記録する
   * @summary ベースライン記録
   * @param data ベースラインデータ
   * @returns なし
   * @fires experiment_baseline
   */
  logExperimentBaseline(data: {
    experimentType: 'e2e' | 'tbench';
    label: string;
    score: {
      failed: number;
      passed: number;
      total: number;
      durationMs: number;
    };
    commit?: string;
  }): void {
    this.emit({
      eventType: 'experiment_baseline',
      data,
    });
  }

  /**
   * 実験実行を記録する
   * @summary 実験を実行する
   * @param data 実験実行データ
   * @returns なし
   * @fires experiment_run
   */
  logExperimentRun(data: {
    experimentType: 'e2e' | 'tbench';
    label: string;
    iteration: number;
    commit?: string;
    changesSummary?: string;
  }): void {
    this.emit({
      eventType: 'experiment_run',
      data,
    });
  }

  /**
   * 実験改善を記録する
   * @summary 改善を検出
   * @param data 改善データ
   * @returns なし
   * @fires experiment_improved
   */
  logExperimentImproved(data: {
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
  }): void {
    this.emit({
      eventType: 'experiment_improved',
      data,
    });
  }

  /**
   * 実験退行を記録する
   * @summary 退行を検出
   * @param data 退行データ
   * @returns なし
   * @fires experiment_regressed
   */
  logExperimentRegressed(data: {
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
  }): void {
    this.emit({
      eventType: 'experiment_regressed',
      data,
    });
  }

  /**
   * 実験タイムアウトを記録する
   * @summary タイムアウト発生
   * @param data タイムアウトデータ
   * @returns なし
   * @fires experiment_timeout
   */
  logExperimentTimeout(data: {
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
  }): void {
    this.emit({
      eventType: 'experiment_timeout',
      data,
    });
  }

  /**
   * 実験停止を記録する
   * @summary 停止発生
   * @param data 停止データ
   * @returns なし
   * @fires experiment_stop
   */
  logExperimentStop(data: {
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
  }): void {
    this.emit({
      eventType: 'experiment_stop',
      data,
    });
  }

  /**
   * 実験クラッシュを記録する
   * @summary クラッシュ発生
   * @param data クラッシュデータ
   * @returns なし
   * @fires experiment_crash
   */
  logExperimentCrash(data: {
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
  }): void {
    this.emit({
      eventType: 'experiment_crash',
      data,
    });
  }

  // ============================================
  // 警告ログ
  // ============================================

  /**
   * 警告ログを出力する
   * @summary 警告ログ出力
   * @param message 警告メッセージ
   * @returns なし
   */
  warn(message: string): void {
    // Output to console for immediate visibility
    console.warn(`[comprehensive-logger] ${message}`);
  }

  // ============================================
  // 内部メソッド
  // ============================================
  
  private emit(event: { eventType: EventType } & Omit<BaseEvent, 'eventId' | 'sessionId' | 'taskId' | 'operationId' | 'parentEventId' | 'timestamp' | 'component'> & { data: unknown }): void {
    if (!this.config.enabled) return;
    // シャットダウン中は新規イベントを拒否
    if (this.isShuttingDown) return;
    
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
         
        console.error('[comprehensive-logger] Flush error:', err);
      });
    }
  }
  
  /**
   * ログをフラッシュする
   * @summary ログをフラッシュ
   * @returns 解決時に処理完了
   * @throws I/Oエラー時に例外をスロー（データはバッファに保持）
   */
  async flush(): Promise<void> {
    // 並行flush呼び出しの直列化 - 既にflush実行中の場合は早期リターン
    if (this.isFlushing) return;
    if (this.buffer.length === 0) return;

    this.isFlushing = true;

    // 原子的バッファスワップ - レースコンディション防止
    const events = this.buffer;
    this.buffer = [];

    const maxAttempts = this.config.flushRetryAttempts ?? 3;
    const baseDelayMs = this.config.flushRetryDelayMs ?? 1000;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
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
        return; // 成功時は早期リターン
      } catch (error) {
        lastError = error as Error;
        
        // リトライ可能な場合、指数バックオフで待機
        if (attempt < maxAttempts) {
          const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
          console.error(`[comprehensive-logger] Flush attempt ${attempt}/${maxAttempts} failed, retrying in ${delayMs}ms:`, error);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    // 全リトライ失敗時の処理
    // I/Oエラー時はバッファに戻す（データ損失を防ぐ）
    this.buffer = [...events, ...this.buffer];
    
    console.error('[comprehensive-logger] Flush failed after all retries, re-queued events:', lastError);
    
    // コールバックが設定されている場合は呼び出し
    if (this.config.onFlushError && lastError) {
      try {
        this.config.onFlushError(lastError, events.length);
      } catch (callbackError) {
        console.error('[comprehensive-logger] onFlushError callback threw error:', callbackError);
      }
    }
    
    this.isFlushing = false;
    throw lastError;
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

  /**
   * 未フラッシュイベント数を取得
   * @summary バッファ内の未フラッシュイベント数を返す
   * @returns {number} 未フラッシュイベント数
   */
  getPendingEventsCount(): number {
    return this.buffer.length;
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
