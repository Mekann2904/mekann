/**
 * @abdd.meta
 * path: .pi/lib/observability/async-context.ts
 * role: AsyncLocalStorageベースの非同期コンテキスト伝播
 * why: 非同期処理チェーン全体でトレースコンテキストを自動的に伝播するため
 * related: .pi/lib/observability/trace-context.ts, .pi/lib/observability/unified-logger.ts
 * public_api: AsyncContextManager, getAsyncContext, setAsyncContext, runWithContext
 * invariants: コンテキストは非同期呼び出しチェーン全体で維持される
 * side_effects: AsyncLocalStorageへの読み書き
 * failure_modes: コンテキストが設定されていない場合のundefined返却
 * @abdd.explain
 * overview: Node.jsのAsyncLocalStorageを活用した透過的なコンテキスト伝播
 * what_it_does:
 *   - AsyncLocalStorageを使用して非同期境界を越えたコンテキスト維持
 *   - Promise、setTimeout、コールバック等での自動コンテキスト継承
 *   - サブエージェント呼び出し時のコンテキスト注入
 *   - 子プロセスへのコンテキスト引き渡し
 * why_it_exists:
 *   - 手動でコンテキストを渡す負担を軽減するため
 *   - サブエージェントやMCP呼び出しでのトレース連続性を確保するため
 * scope:
 *   in: トレースコンテキスト、相関情報
 *   out: 非同期境界を越えたコンテキストアクセス
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { TraceContext } from "./trace-context.js";

// ============================================================================
// Types
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
// AsyncLocalStorage Singleton
// ============================================================================

/** グローバルAsyncLocalStorageインスタンス */
const asyncLocalStorage = new AsyncLocalStorage<AsyncContext>();

/** コンテキスト変更履歴（デバッグ用） */
const contextHistory: ContextChangeEvent[] = [];
const MAX_HISTORY = 100;

// ============================================================================
// Core Functions
// ============================================================================

/**
 * 現在の非同期コンテキストを取得
 * @summary コンテキスト取得
 * @returns 現在のコンテキスト（存在しない場合は空オブジェクト）
 */
export function getAsyncContext(): AsyncContext {
  const store = asyncLocalStorage.getStore();
  return store ?? {};
}

/**
 * 現在のトレースコンテキストを取得
 * @summary トレースコンテキスト取得
 * @returns トレースコンテキスト（存在しない場合はundefined）
 */
export function getCurrentTraceContext(): TraceContext | undefined {
  return getAsyncContext().trace;
}

/**
 * 現在のタスクIDを取得
 * @summary タスクID取得
 * @returns タスクID（存在しない場合はundefined）
 */
export function getCurrentTaskId(): string | undefined {
  return getAsyncContext().taskId;
}

/**
 * 現在のセッションIDを取得
 * @summary セッションID取得
 * @returns セッションID（存在しない場合はundefined）
 */
export function getCurrentSessionId(): string | undefined {
  return getAsyncContext().sessionId;
}

/**
 * 非同期コンテキストの一部を更新
 * @summary コンテキスト更新
 * @param updates 更新するフィールド
 * @returns 更新後のコンテキスト
 */
export function setAsyncContext(updates: Partial<AsyncContext>): AsyncContext {
  const store = asyncLocalStorage.getStore();
  if (!store) {
    // コンテキスト外で呼ばれた場合はログ出力のみ
    console.warn("[async-context] setAsyncContext called outside of context");
    return {};
  }

  // マージ更新
  Object.assign(store, updates);

  // デバッグ用履歴記録
  if (process.env.PI_TRACE_DEBUG === "1") {
    for (const key of Object.keys(updates)) {
      contextHistory.push({
        timestamp: new Date().toISOString(),
        type: "update",
        field: key,
        value: updates[key as keyof AsyncContext],
        traceId: store.trace?.traceId,
        spanId: store.trace?.spanId,
      });
    }

    // 履歴サイズ制限
    while (contextHistory.length > MAX_HISTORY) {
      contextHistory.shift();
    }
  }

  return store;
}

/**
 * コンテキストを設定して関数を実行
 * @summary コンテキスト実行
 * @param context 初期コンテキスト
 * @param fn 実行する関数
 * @returns 関数の戻り値
 */
export function runWithContext<T>(context: AsyncContext, fn: () => T): T {
  return asyncLocalStorage.run(context, fn);
}

/**
 * 現在のコンテキストを継承して新しいスパンを作成
 * @summary 子スパン作成
 * @param traceContext 新しいトレースコンテキスト（省略時は現在のコンテキストを継承）
 * @param additionalContext 追加のコンテキスト
 * @param fn 実行する関数
 * @returns 関数の戻り値
 */
export function runWithChildSpan<T>(
  traceContext: TraceContext,
  additionalContext: Partial<AsyncContext> = {},
  fn: () => T
): T {
  const current = getAsyncContext();
  const childContext: AsyncContext = {
    ...current,
    trace: traceContext,
    ...additionalContext,
  };

  return asyncLocalStorage.run(childContext, fn);
}

// ============================================================================
// Context Propagation Utilities
// ============================================================================

/**
 * 子プロセス用のコンテキスト情報をシリアライズ
 * @summary 子プロセス用シリアライズ
 * @returns 環境変数に設定可能なオブジェクト
 */
export function serializeForChildProcess(): Record<string, string> {
  const context = getAsyncContext();
  const env: Record<string, string> = {};

  if (context.trace) {
    env.PI_TRACE_ID = context.trace.traceId;
    env.PI_SPAN_ID = context.trace.spanId;
    if (context.trace.parentSpanId) {
      env.PI_PARENT_SPAN_ID = context.trace.parentSpanId;
    }
    env.PI_TRACE_SAMPLED = context.trace.traceFlags.sampled ? "1" : "0";
  }

  if (context.taskId) {
    env.PI_TASK_ID = context.taskId;
  }

  if (context.sessionId) {
    env.PI_SESSION_ID = context.sessionId;
  }

  if (context.subagentId) {
    env.PI_SUBAGENT_ID = context.subagentId;
  }

  if (context.attributes && Object.keys(context.attributes).length > 0) {
    env.PI_CONTEXT_ATTRIBUTES = JSON.stringify(context.attributes);
  }

  return env;
}

/**
 * 環境変数からコンテキストを復元
 * @summary 環境変数からの復元
 * @returns 復元されたコンテキスト
 */
export function deserializeFromEnv(): AsyncContext {
  const context: AsyncContext = {};

  const traceId = process.env.PI_TRACE_ID;
  const spanId = process.env.PI_SPAN_ID;

  if (traceId && spanId) {
    context.trace = {
      traceId,
      spanId,
      parentSpanId: process.env.PI_PARENT_SPAN_ID,
      traceFlags: {
        sampled: process.env.PI_TRACE_SAMPLED !== "0",
      },
    };
  }

  if (process.env.PI_TASK_ID) {
    context.taskId = process.env.PI_TASK_ID;
  }

  if (process.env.PI_SESSION_ID) {
    context.sessionId = process.env.PI_SESSION_ID;
  }

  if (process.env.PI_SUBAGENT_ID) {
    context.subagentId = process.env.PI_SUBAGENT_ID;
  }

  if (process.env.PI_CONTEXT_ATTRIBUTES) {
    try {
      context.attributes = JSON.parse(process.env.PI_CONTEXT_ATTRIBUTES);
    } catch {
      // 無視
    }
  }

  return context;
}

/**
 * 子プロセス起動時にコンテキストを注入
 * @summary 子プロセス用コンテキスト注入
 * @param env 既存の環境変数
 * @returns コンテキストが注入された環境変数
 */
export function injectContextToEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const contextEnv = serializeForChildProcess();
  return { ...env, ...contextEnv };
}

// ============================================================================
// Context History (Debug)
// ============================================================================

/**
 * コンテキスト変更履歴を取得（デバッグ用）
 * @summary 変更履歴取得
 * @returns 変更履歴の配列
 */
export function getContextHistory(): ContextChangeEvent[] {
  return [...contextHistory];
}

/**
 * コンテキスト変更履歴をクリア
 * @summary 履歴クリア
 */
export function clearContextHistory(): void {
  contextHistory.length = 0;
}

// ============================================================================
// Context Manager Class
// ============================================================================

/**
 * 非同期コンテキストマネージャー
 * @summary コンテキスト管理クラス
 * @description 高レベルのコンテキスト管理APIを提供
 */
export class AsyncContextManager {
  private rootContext: AsyncContext | null = null;

  /**
   * ルートコンテキストを開始
   * @summary ルート開始
   * @param context 初期コンテキスト
   * @returns マネージャー自身
   */
  startRoot(context: AsyncContext = {}): this {
    this.rootContext = context;
    return this;
  }

  /**
   * コンテキスト内で関数を実行
   * @summary 実行
   * @param fn 実行する関数
   * @returns 関数の戻り値
   */
  run<T>(fn: () => T): T {
    if (!this.rootContext) {
      this.rootContext = {};
    }
    return runWithContext(this.rootContext, fn);
  }

  /**
   * 現在のコンテキストを取得
   * @summary 取得
   * @returns 現在のコンテキスト
   */
  get(): AsyncContext {
    return getAsyncContext();
  }

  /**
   * コンテキストを更新
   * @summary 更新
   * @param updates 更新内容
   * @returns 更新後のコンテキスト
   */
  update(updates: Partial<AsyncContext>): AsyncContext {
    return setAsyncContext(updates);
  }

  /**
   * トレースコンテキストを設定
   * @summary トレース設定
   * @param trace トレースコンテキスト
   */
  setTrace(trace: TraceContext): void {
    setAsyncContext({ trace });
  }

  /**
   * タスクIDを設定
   * @summary タスクID設定
   * @param taskId タスクID
   */
  setTaskId(taskId: string): void {
    setAsyncContext({ taskId });
  }

  /**
   * セッションIDを設定
   * @summary セッションID設定
   * @param sessionId セッションID
   */
  setSessionId(sessionId: string): void {
    setAsyncContext({ sessionId });
  }

  /**
   * カスタム属性を設定
   * @summary 属性設定
   * @param key 属性キー
   * @param value 属性値
   */
  setAttribute(key: string, value: unknown): void {
    const current = getAsyncContext();
    setAsyncContext({
      attributes: { ...current.attributes, [key]: value },
    });
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultManager: AsyncContextManager | null = null;

/**
 * デフォルトのコンテキストマネージャーを取得
 * @summary デフォルトマネージャー取得
 * @returns コンテキストマネージャー
 */
export function getContextManager(): AsyncContextManager {
  if (!defaultManager) {
    defaultManager = new AsyncContextManager();
  }
  return defaultManager;
}

/**
 * コンテキストマネージャーをリセット
 * @summary リセット
 */
export function resetContextManager(): void {
  defaultManager = null;
  clearContextHistory();
}
