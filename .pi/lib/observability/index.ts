/**
 * @abdd.meta
 * path: .pi/lib/observability/index.ts
 * role: Observabilityモジュールの統一エクスポート
 * why: トレース、コンテキスト、ロギング機能への統一アクセスポイントを提供するため
 * related: .pi/lib/observability/trace-context.ts, .pi/lib/observability/async-context.ts, .pi/lib/observability/unified-logger.ts
 * public_api: 全Observability機能の再エクスポート
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: Observabilityモジュールの公開APIをまとめるエントリポイント
 * what_it_does:
 *   - TraceContext機能の再エクスポート
 *   - AsyncContext機能の再エクスポート
 *   - UnifiedLogger機能の再エクスポート
 *   - 統合ヘルパー関数の提供
 * why_it_exists:
 *   - 利用側のインポートを簡素化するため
 *   - モジュール構造を隠蔽するため
 * scope:
 *   in: なし
 *   out: 各モジュールの公開API
 */

// ============================================================================
// Trace Context
// ============================================================================

export {
  type TraceContext,
  type TraceFlags,
  type TraceContextCarrier,
  generateTraceId,
  generateSpanId,
  createTraceContext,
  createChildSpanContext,
  toTraceParent,
  parseTraceParent,
  toCarrier,
  fromCarrier,
  contextToJson,
  contextFromJson,
} from "./trace-context.js";

// ============================================================================
// Async Context
// ============================================================================

export {
  type AsyncContext,
  type ContextChangeEvent,
  getAsyncContext,
  getCurrentTraceContext,
  getCurrentTaskId,
  getCurrentSessionId,
  setAsyncContext,
  runWithContext,
  runWithChildSpan,
  serializeForChildProcess,
  deserializeFromEnv,
  injectContextToEnv,
  getContextHistory,
  clearContextHistory,
  AsyncContextManager,
  getContextManager,
  resetContextManager,
} from "./async-context.js";

// ============================================================================
// Unified Logger
// ============================================================================

export {
  type LogLevel,
  type LogRecord,
  type UnifiedLoggerConfig,
  LOG_LEVEL_VALUES,
  DEFAULT_LOGGER_CONFIG,
  UnifiedLogger,
  ScopedLogger,
  getLogger,
  createLogger,
  resetLogger,
  createScopedLogger,
} from "./unified-logger.js";

// ============================================================================
// LLM Metrics
// ============================================================================

export {
  type LLMCallEvent,
  type LLMMetrics,
  type ProviderMetrics,
  type ModelMetrics,
  type CostConfig,
  LLMMetricsCollector,
  getLLMMetricsCollector,
  resetLLMMetricsCollector,
} from "./llm-metrics.js";

// ============================================================================
// Subagent Metrics
// ============================================================================

export {
  type SubagentExecutionEvent,
  type SubagentMetrics,
  type AgentTypeMetrics,
  type PatternMetrics,
  SubagentMetricsCollector,
  getSubagentMetricsCollector,
  resetSubagentMetricsCollector,
} from "./subagent-metrics.js";

// ============================================================================
// Dashboard
// ============================================================================

export {
  type DashboardData,
  type DashboardAlert,
  type DashboardConfig,
  DashboardDataProvider,
  getDashboardDataProvider,
  resetDashboardDataProvider,
} from "./metrics-dashboard.js";

// ============================================================================
// Correlation Tracker
// ============================================================================

export {
  type CorrelationEventType,
  type CorrelationEvent,
  type CorrelationLink,
  type ExecutionPath,
  type CorrelationStats,
  CorrelationTracker,
  getCorrelationTracker,
  resetCorrelationTracker,
} from "./correlation-tracker.js";

import {
  createTraceContext,
  createChildSpanContext,
  type TraceContext,
} from "./trace-context.js";
import {
  getAsyncContext,
  setAsyncContext,
  runWithContext,
  serializeForChildProcess,
  type AsyncContext,
} from "./async-context.js";
import { getLogger, type LogLevel } from "./unified-logger.js";

/**
 * 新しいトレースを開始し、コンテキストを設定
 * @summary トレース開始
 * @param name トレース名
 * @param attributes 追加属性
 * @returns トレースコンテキスト
 */
export function startTrace(
  name: string,
  attributes?: Record<string, unknown>
): TraceContext {
  const trace = createTraceContext();

  setAsyncContext({
    trace,
    attributes: { traceName: name, ...attributes },
  });

  getLogger().info(`Trace started: ${name}`, {
    traceId: trace.traceId,
    spanId: trace.spanId,
  });

  return trace;
}

/**
 * 現在のトレースを継続して子スパンを作成
 * @summary 子スパン作成
 * @param name スパン名
 * @param fn 実行する関数
 * @returns 関数の戻り値
 */
export function withSpan<T>(name: string, fn: () => T): T {
  const context = getAsyncContext();
  const logger = getLogger();

  if (!context.trace) {
    logger.warn(`withSpan called without active trace: ${name}`);
    return fn();
  }

  const childTrace = createChildSpanContext(context.trace);

  logger.debug(`Span started: ${name}`, {
    traceId: childTrace.traceId,
    spanId: childTrace.spanId,
    parentSpanId: childTrace.parentSpanId,
  });

  const startTime = Date.now();
  try {
    const result = runWithContext(
      { ...context, trace: childTrace },
      fn
    );

    const durationMs = Date.now() - startTime;
    logger.debug(`Span ended: ${name}`, {
      traceId: childTrace.traceId,
      spanId: childTrace.spanId,
      durationMs,
      success: true,
    });

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error(`Span failed: ${name}`, error as Error, {
      traceId: childTrace.traceId,
      spanId: childTrace.spanId,
      durationMs,
      success: false,
    });
    throw error;
  }
}

/**
 * ログ出力時に自動的にトレースコンテキストを付与
 * @summary トレース付きログ
 * @param level ログレベル
 * @param message メッセージ
 * @param attributes 属性
 */
export function logWithTrace(
  level: LogLevel,
  message: string,
  attributes?: Record<string, unknown>
): void {
  const logger = getLogger();
  const context = getAsyncContext();

  const enrichedAttributes = {
    ...attributes,
    traceId: context.trace?.traceId,
    spanId: context.trace?.spanId,
    taskId: context.taskId,
    sessionId: context.sessionId,
  };

  switch (level) {
    case "TRACE":
      logger.trace(message, enrichedAttributes);
      break;
    case "DEBUG":
      logger.debug(message, enrichedAttributes);
      break;
    case "INFO":
      logger.info(message, enrichedAttributes);
      break;
    case "WARN":
      logger.warn(message, enrichedAttributes);
      break;
    case "ERROR":
      logger.error(message, undefined, enrichedAttributes);
      break;
    case "FATAL":
      logger.fatal(message, undefined, enrichedAttributes);
      break;
  }
}

/**
 * サブエージェント実行用のコンテキストを作成
 * @summary サブエージェントコンテキスト作成
 * @param subagentId サブエージェントID
 * @param task タスク説明
 * @returns 子プロセス用環境変数
 */
export function createSubagentContext(
  subagentId: string,
  task: string
): Record<string, string> {
  const context = getAsyncContext();
  const parentTrace = context.trace ?? createTraceContext();
  const childTrace = createChildSpanContext(parentTrace);

  // 一時的に子コンテキストを設定してシリアライズ
  setAsyncContext({
    ...context,
    trace: childTrace,
    subagentId,
    attributes: { ...context.attributes, task },
  });

  const env = serializeForChildProcess();

  // 元に戻す
  setAsyncContext(context);

  getLogger().info(`Subagent context created: ${subagentId}`, {
    traceId: childTrace.traceId,
    spanId: childTrace.spanId,
    parentSpanId: childTrace.parentSpanId,
    task,
  });

  return env;
}

/**
 * ULワークフローのタスクコンテキストを設定
 * @summary ULタスクコンテキスト設定
 * @param taskId タスクID
 * @param task タスク説明
 * @returns トレースコンテキスト
 */
export function setupULTaskContext(
  taskId: string,
  task: string
): TraceContext {
  const trace = startTrace(`ul-task-${taskId}`, { task, taskId });
  setAsyncContext({ taskId });

  getLogger().info(`UL task context setup: ${taskId}`, {
    traceId: trace.traceId,
    task,
  });

  return trace;
}

/**
 * 現在のコンテキストの概要を取得（デバッグ用）
 * @summary コンテキスト概要
 * @returns コンテキスト概要文字列
 */
export function getContextSummary(): string {
  const context = getAsyncContext();
  const parts: string[] = [];

  if (context.trace) {
    parts.push(`trace=${context.trace.traceId.slice(0, 8)}`);
    parts.push(`span=${context.trace.spanId.slice(0, 8)}`);
  }

  if (context.taskId) {
    parts.push(`task=${context.taskId.slice(0, 8)}`);
  }

  if (context.subagentId) {
    parts.push(`subagent=${context.subagentId}`);
  }

  if (context.sessionId) {
    parts.push(`session=${context.sessionId.slice(0, 8)}`);
  }

  return parts.length > 0 ? `[${parts.join(" | ")}]` : "[no context]";
}
