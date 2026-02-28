/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/tools/shared.ts
 * role: チームツール用の共通ヘルパー関数
 * why: ツール間で共有されるロジックを集約し、コード重複を削減するため
 * related: ./extension.ts
 * public_api: reportTeamExecutionFailure, refreshRuntimeStatus, toRetryOverrides, normalizeAggregationConfig, runPiPrintMode, AggregationConfig
 * invariants: なし
 * side_effects: UI通知、ログ出力
 * failure_modes: なし
 * @abdd.explain
 * overview: チームツール用の共通ヘルパー関数
 * what_it_does:
 *   - エラー報告
 *   - ランタイム状態更新
 *   - 設定正規化
 * why_it_exists:
 *   - 複数のツールで共有されるロジックを一箇所に集約するため
 * scope:
 *   in: なし
 *   out: team-run.ts, team-run-parallel.ts
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import {
  getRuntimeSnapshot,
} from "../../agent-runtime";
import {
  refreshRuntimeStatus as sharedRefreshRuntimeStatus,
} from "../../shared/runtime-helpers";
import {
  type RetryWithBackoffOverrides,
} from "../../../lib/retry-with-backoff.js";
import {
  STABLE_RUNTIME_PROFILE,
} from "../../../lib/agent/agent-common.js";
import {
  runPiPrintMode as sharedRunPiPrintMode,
  type PrintExecutorOptions,
} from "../../shared/pi-print-executor";
import type { PrintCommandResult } from "../../../lib/agent/subagent-types.js";
import type { AggregationStrategy } from "../result-aggregation";

// ============================================================================
// 型定義
// ============================================================================

/** 集約戦略の正規化結果 */
export interface AggregationConfig {
  strategy: AggregationStrategy;
}

// ============================================================================
// 定数
// ============================================================================

/** 安定ランタイムプロファイルを使用するか */
export const STABLE_AGENT_TEAM_RUNTIME = STABLE_RUNTIME_PROFILE;

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * チーム実行失敗を報告する
 * @summary 実行失敗を報告
 * @param scope スコープ名
 * @param teamId チームID
 * @param errorMessage エラーメッセージ
 * @param ctx 拡張コンテキスト
 * @param pi 拡張API
 */
export function reportTeamExecutionFailure(
  scope: "agent_team_run" | "agent_team_run_parallel",
  teamId: string,
  errorMessage: string,
  ctx: any,
  pi: ExtensionAPI
): void {
  const message = `${scope} failed [${teamId}]: ${errorMessage}`;
  ctx.ui.notify(message, "error");
  pi.sendMessage({
    customType: "agent-team-run-failed",
    content: message,
    display: true,
  });
}

/**
 * ランタイム状態表示を更新する
 * @summary ランタイム状態を更新
 * @param ctx 拡張コンテキスト
 */
export function refreshRuntimeStatus(ctx: any): void {
  const snapshot = getRuntimeSnapshot();
  sharedRefreshRuntimeStatus(
    ctx,
    "agent-team-runtime",
    "Team",
    snapshot.teamActiveAgents,
    "Sub",
    snapshot.subagentActiveAgents,
  );
}

/**
 * リトライ設定を正規化する
 * 安定プロファイルの場合はundefinedを返す
 * @summary リトライ設定を正規化
 * @param value ユーザー指定のリトライ設定
 * @returns 正規化されたリトライ設定
 */
export function toRetryOverrides(value: unknown): RetryWithBackoffOverrides | undefined {
  // Stable profile: ignore per-call retry tuning
  if (STABLE_AGENT_TEAM_RUNTIME) return undefined;
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const jitter =
    raw.jitter === "full" || raw.jitter === "partial" || raw.jitter === "none"
      ? raw.jitter
      : undefined;
  return {
    maxRetries: typeof raw.maxRetries === "number" ? raw.maxRetries : undefined,
    initialDelayMs: typeof raw.initialDelayMs === "number" ? raw.initialDelayMs : undefined,
    maxDelayMs: typeof raw.maxDelayMs === "number" ? raw.maxDelayMs : undefined,
    multiplier: typeof raw.multiplier === "number" ? raw.multiplier : undefined,
    jitter,
  };
}

/**
 * 集約戦略を正規化する
 * デフォルトは'rule-based'
 * @summary 集約戦略を正規化
 * @param param ユーザー指定の集約戦略
 * @returns 正規化された集約設定
 */
export function normalizeAggregationConfig(param: unknown): AggregationConfig {
  const validStrategies: AggregationStrategy[] = ['rule-based', 'majority-vote', 'best-confidence', 'llm-aggregate'];

  if (typeof param === 'string' && validStrategies.includes(param as AggregationStrategy)) {
    return { strategy: param as AggregationStrategy };
  }

  return { strategy: 'rule-based' };
}

/**
 * pi-printモードを実行する
 * @summary pi-printモードを実行
 * @param input 実行パラメータ
 * @returns 実行結果
 */
export async function runPiPrintMode(input: {
  provider?: string;
  model?: string;
  prompt: string;
  timeoutMs: number;
  signal?: AbortSignal;
  onTextDelta?: (delta: string) => void;
  onStderrChunk?: (chunk: string) => void;
}): Promise<PrintCommandResult> {
  return sharedRunPiPrintMode({
    ...input,
    entityLabel: "agent team member",
  });
}

/**
 * リトライスキーマを作成する
 * @summary リトライスキーマを作成
 * @returns Typeスキーマ
 */
export function createTeamRetrySchema() {
  return Type.Optional(
    Type.Object({
      maxRetries: Type.Optional(Type.Number({ description: "Max retry count" })),
      initialDelayMs: Type.Optional(Type.Number({ description: "Initial backoff delay in ms" })),
      maxDelayMs: Type.Optional(Type.Number({ description: "Max backoff delay in ms" })),
      multiplier: Type.Optional(Type.Number({ description: "Backoff multiplier" })),
      jitter: Type.Optional(
        Type.Union([
          Type.Literal("full"),
          Type.Literal("partial"),
          Type.Literal("none"),
        ], { description: "Jitter mode: full | partial | none" })
      ),
    })
  );
}
