/**
 * @abdd.meta
 * path: .pi/extensions/context-reconciler.ts
 * role: APIレスポンスとコンテキスト内訳の照合モジュール
 * why: 実際のトークン使用量を各ソースに正確に配分するため
 * related:
 *   - .pi/extensions/context-tracker.ts (ソース追跡)
 *   - .pi/lib/types.ts (ContextBreakdown型)
 * public_api:
 *   - reconcileTokens
 *   - getLastReconciliation
 * invariants:
 *   - 配分されたトークン数の合計はAPIレスポンスのinput_tokensと一致
 *   - セッション開始時に追跡状態がリセットされる
 * side_effects:
 *   - after_agent_startイベントをリッスン
 *   - グローバルな追跡状態を更新
 * failure_modes:
 *   - APIレスポンスにusage情報がない場合は空の内訳を返す
 *   - 追跡対象ソースがない場合は全トークンを"unknown"に割り当て
 *
 * @abdd.explain
 * overview: APIレスポンスのトークン使用量をコンテキストソース別に照合・配分する
 * what_it_does:
 *   - agent_endイベントでAPIレスポンスからトークン数を取得
 *   - 記録されたソースの注入内容と文字数比率で配分
 *   - ContextBreakdown型に整形して保存・返却
 * why_it_exists:
 *   - どのソースがどれだけのトークンを消費したかを正確に把握するため
 *   - コスト分析や最適化の基礎データを提供するため
 * scope:
 *   in: APIレスポンス(usage.input_tokens), 追跡されたソース情報
 *   out: ソース別トークン配分データ(ContextBreakdown)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { 
  getTrackedSources, 
  clearTrackedSources, 
  startSession, 
  endSession 
} from "../lib/context-breakdown-utils.js";

interface ContextSourceInfo {
  source: string;
  charCount: number;
  injectedContent?: string;
}

interface ContextBreakdown {
  timestamp: number;
  totalTokens: number;
  sources: Array<{
    source: string;
    tokens: number;
    percentage: number;
  }>;
}

/** 最後の照合結果を保持 */
let lastReconciliation: ContextBreakdown | null = null;

/**
 * @summary 総input_tokensを各ソースに比例配分
 * @param totalTokens - APIレスポンスのinput_tokens総数
 * @param sources - 追跡されたソース情報配列
 * @returns ソース別に配分されたContextBreakdown
 * @throws なし
 */
export function reconcileTokens(
  totalTokens: number,
  sources: ContextSourceInfo[]
): ContextBreakdown {
  // ソースがない場合は全てunknownに割り当て
  if (sources.length === 0) {
    return {
      timestamp: Date.now(),
      totalTokens,
      sources: [{ source: "unknown", tokens: totalTokens, percentage: 100 }],
    };
  }

  // 各ソースの文字数を取得
  const sourcesWithLength = sources.map((s) => ({
    ...s,
    length: s.injectedContent?.length || 0,
  }));

  const totalLength = sourcesWithLength.reduce((sum, s) => sum + s.length, 0);

  // 文字数比率でトークン数を配分
  const breakdownSources = sourcesWithLength.map((s) => {
    const ratio = totalLength > 0 ? s.length / totalLength : 1 / sources.length;
    const tokens = Math.round(totalTokens * ratio);
    const percentage = Math.round(ratio * 10000) / 100; // 2桁精度

    return {
      source: s.source,
      tokens,
      percentage,
    };
  });

  // 丸め誤差調整: 最大トークンソースに差分を加算
  const allocatedSum = breakdownSources.reduce((sum, s) => sum + s.tokens, 0);
  const diff = totalTokens - allocatedSum;
  if (diff !== 0 && breakdownSources.length > 0) {
    const maxIndex = breakdownSources.reduce(
      (maxIdx, s, idx, arr) => (s.tokens > arr[maxIdx].tokens ? idx : maxIdx),
      0
    );
    breakdownSources[maxIndex].tokens += diff;
  }

  return {
    timestamp: Date.now(),
    totalTokens,
    sources: breakdownSources,
  };
}

/**
 * @summary 最後の照合結果を取得
 * @returns 最後のContextBreakdown、未照合の場合null
 */
export function getLastReconciliation(): ContextBreakdown | null {
  return lastReconciliation;
}

/**
 * @summary after_agent_startイベントハンドラ
 * @param response - APIレスポンスオブジェクト
 * @description usage.input_tokensを取得し、追跡ソースと照合して配分
 */
export function handleAgentStart(response: unknown): void {
  // セッション開始時に追跡状態をリセット
  clearTrackedSources();
  lastReconciliation = null;

  // APIレスポンスからトークン数を抽出
  const typedResponse = response as {
    usage?: { input_tokens?: number };
  };
  const totalTokens = typedResponse?.usage?.input_tokens;

  if (typeof totalTokens !== "number" || totalTokens <= 0) {
    // トークン情報がない場合は空の内訳を設定
    lastReconciliation = {
      timestamp: Date.now(),
      totalTokens: 0,
      sources: [],
    };
    return;
  }

  // 追跡されたソースを取得して照合
  const trackedSources = getTrackedSources();
  lastReconciliation = reconcileTokens(totalTokens, trackedSources);
}

/**
 * @summary イベントリスナーを登録
 * @param bus - イベントバスインスタンス
 */
export function registerEventListeners(bus: {
  on: (event: string, handler: (data: unknown) => void) => void;
}): void {
  bus.on("after_agent_start", handleAgentStart);
}

// ============================================================================
// Extension Entry Point
// ============================================================================

let isInitialized = false;

/**
 * Context Reconciler Extension
 * 
 * APIレスポンスのトークン使用量をコンテキストソース別に照合・配分する拡張機能
 */
export default function (pi: ExtensionAPI) {
  if (isInitialized) return;
  isInitialized = true;

  // セッション開始時に追跡状態を初期化
  pi.on("session_start", async (_event, ctx) => {
    startSession(createSessionContext(ctx));
  });

  // agent_endイベントでトークン使用量を照合
  pi.on("agent_end", async (_event, ctx) => {
    const usage = ctx.getContextUsage?.();
    if (!usage) return;

    // inputTokensを取得（存在しない場合は総トークンの70%と推定）
    const totalTokens = 
      ('inputTokens' in usage && typeof usage.inputTokens === 'number')
        ? usage.inputTokens
        : ('tokens' in usage && typeof usage.tokens === 'number')
          ? Math.round(usage.tokens * 0.7)
          : 0;

    if (totalTokens > 0) {
      const trackedSources = getTrackedSources();
      lastReconciliation = reconcileTokens(totalTokens, trackedSources);
    }

    return undefined;
  });

  // セッション終了時に追跡状態をリセット
  pi.on("session_shutdown", async () => {
    endSession();
    lastReconciliation = null;
    isInitialized = false;
  });
}

function createSessionContext(ctx: ExtensionAPI["context"]): {
  sessionManager?: { getSessionFile?: () => string };
} | undefined {
  const getSessionFile = ctx.sessionManager?.getSessionFile;
  if (typeof getSessionFile !== "function") {
    return undefined;
  }

  return {
    sessionManager: {
      getSessionFile: () => getSessionFile() ?? "",
    },
  };
}
