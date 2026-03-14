/**
 * @abdd.meta
 * path: .pi/lib/observability/trace-context.ts
 * role: W3C Trace Context形式のトレースID/スパンID生成と管理
 * why: 分散システム全体で一意なトレースIDによるリクエスト追跡を実現するため
 * related: .pi/lib/observability/async-context.ts, .pi/lib/observability/unified-logger.ts
 * public_api: TraceContext, createTraceContext, generateTraceId, generateSpanId, propagateTraceContext
 * invariants: traceIdは32文字の16進数、spanIdは16文字の16進数
 * side_effects: なし（純粋関数）
 * failure_modes: 乱数生成エラー（極めて稀）
 * @abdd.explain
 * overview: OpenTelemetry/W3C Trace Context仕様に準拠したトレースコンテキスト管理
 * what_it_does:
 *   - W3C形式のtrace-id（32文字16進数）とspan-id（16文字16進数）を生成
 *   - 親スパンからのコンテキスト継承をサポート
 *   - トレースフラグ（sampled等）の管理
 *   - 複数プロセス間でのコンテキスト伝播用ユーティリティ
 * why_it_exists:
 *   - サブエージェント、ULワークフロー、MCP呼び出しなど分散実行の追跡のため
 *   - OpenTelemetry互換のデータ構造で外部ツールとの連携を可能にするため
 * scope:
 *   in: 親トレースコンテキスト（オプション）
 *   out: W3C形式のトレースコンテキストオブジェクト
 */

import { randomBytes } from "node:crypto";

// ============================================================================
// Types
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
// Constants
// ============================================================================

/** W3C Trace Context バージョン */
const W3C_VERSION = "00";

/** トレースIDのバイト長（16バイト = 32文字） */
const TRACE_ID_BYTES = 16;

/** スパンIDのバイト長（8バイト = 16文字） */
const SPAN_ID_BYTES = 8;

// ============================================================================
// Utilities
// ============================================================================

/**
 * W3C形式のトレースIDを生成
 * @summary トレースID生成
 * @returns 32文字の16進数小文字
 */
export function generateTraceId(): string {
  const buffer = randomBytes(TRACE_ID_BYTES);
  return buffer.toString("hex").padStart(32, "0");
}

/**
 * W3C形式のスパンIDを生成
 * @summary スパンID生成
 * @returns 16文字の16進数小文字
 */
export function generateSpanId(): string {
  const buffer = randomBytes(SPAN_ID_BYTES);
  return buffer.toString("hex").padStart(16, "0");
}

/**
 * 新しいトレースコンテキストを作成
 * @summary トレースコンテキスト作成
 * @param parent 親コンテキスト（継承する場合）
 * @param sampled サンプリングフラグ
 * @returns 新しいトレースコンテキスト
 */
export function createTraceContext(
  parent?: Partial<TraceContext>,
  sampled = true
): TraceContext {
  const spanId = generateSpanId();

  if (parent?.traceId) {
    // 親コンテキストから継承
    return {
      traceId: parent.traceId,
      spanId,
      parentSpanId: parent.spanId,
      traceFlags: parent.traceFlags ?? { sampled },
      traceState: parent.traceState,
    };
  }

  // 新規ルートコンテキスト
  return {
    traceId: generateTraceId(),
    spanId,
    traceFlags: { sampled },
  };
}

/**
 * 子スパン用のコンテキストを作成
 * @summary 子スパン作成
 * @param parent 親コンテキスト
 * @returns 子スパンのトレースコンテキスト
 */
export function createChildSpanContext(parent: TraceContext): TraceContext {
  return {
    traceId: parent.traceId,
    spanId: generateSpanId(),
    parentSpanId: parent.spanId,
    traceFlags: parent.traceFlags,
    traceState: parent.traceState,
  };
}

/**
 * トレースコンテキストをW3C traceparent形式に変換
 * @summary traceparent生成
 * @param context トレースコンテキスト
 * @returns W3C traceparent文字列
 */
export function toTraceParent(context: TraceContext): string {
  const flags = context.traceFlags.sampled ? "01" : "00";
  return `${W3C_VERSION}-${context.traceId}-${context.spanId}-${flags}`;
}

/**
 * W3C traceparent形式からトレースコンテキストを解析
 * @summary traceparent解析
 * @param traceparent W3C traceparent文字列
 * @returns トレースコンテキスト（解析失敗時はundefined）
 */
export function parseTraceParent(traceparent: string): TraceContext | undefined {
  const parts = traceparent.split("-");

  if (parts.length !== 4) {
    return undefined;
  }

  const [version, traceId, spanId, flags] = parts;

  // バージョンチェック
  if (version !== W3C_VERSION && version !== "ff") {
    return undefined;
  }

  // 形式チェック
  if (!/^[0-9a-f]{32}$/.test(traceId)) {
    return undefined;
  }

  if (!/^[0-9a-f]{16}$/.test(spanId)) {
    return undefined;
  }

  if (!/^[0-9a-f]{2}$/.test(flags)) {
    return undefined;
  }

  const sampledFlags = parseInt(flags, 16);

  return {
    traceId,
    spanId,
    traceFlags: {
      sampled: (sampledFlags & 0x01) === 0x01,
    },
  };
}

/**
 * トレースコンテキストをCarrier形式に変換（外部伝播用）
 * @summary Carrier変換
 * @param context トレースコンテキスト
 * @returns Carrier形式のデータ
 */
export function toCarrier(context: TraceContext): TraceContextCarrier {
  const carrier: TraceContextCarrier = {
    traceparent: toTraceParent(context),
  };

  if (context.traceState) {
    carrier.tracestate = context.traceState;
  }

  return carrier;
}

/**
 * Carrier形式からトレースコンテキストを復元
 * @summary Carrier復元
 * @param carrier Carrier形式のデータ
 * @returns トレースコンテキスト（復元失敗時はundefined）
 */
export function fromCarrier(carrier: TraceContextCarrier): TraceContext | undefined {
  const context = parseTraceParent(carrier.traceparent);

  if (!context) {
    return undefined;
  }

  if (carrier.tracestate) {
    context.traceState = carrier.tracestate;
  }

  return context;
}

/**
 * トレースコンテキストをJSON形式で出力（デバッグ・ログ用）
 * @summary JSON出力
 * @param context トレースコンテキスト
 * @returns JSON文字列
 */
export function contextToJson(context: TraceContext): string {
  return JSON.stringify({
    traceId: context.traceId,
    spanId: context.spanId,
    parentSpanId: context.parentSpanId,
    traceFlags: context.traceFlags,
    traceState: context.traceState,
  });
}

/**
 * JSONからトレースコンテキストを復元
 * @summary JSON復元
 * @param json JSON文字列
 * @returns トレースコンテキスト（復元失敗時はundefined）
 */
export function contextFromJson(json: string): TraceContext | undefined {
  try {
    const obj = JSON.parse(json);

    if (typeof obj.traceId !== "string" || typeof obj.spanId !== "string") {
      return undefined;
    }

    return {
      traceId: obj.traceId,
      spanId: obj.spanId,
      parentSpanId: obj.parentSpanId,
      traceFlags: obj.traceFlags ?? { sampled: true },
      traceState: obj.traceState,
    };
  } catch {
    return undefined;
  }
}
