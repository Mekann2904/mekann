/**
 * @abdd.meta
 * path: .pi/extensions/startup-context.ts
 * role: セッション開始時のシステムプロンプト拡張モジュール
 * why: AIエージェントが現在のリポジトリ状態を認識するための動的コンテキスト（20層の環境情報）を自動的に注入するため
 * related: @mariozechner/pi-coding-agent, .pi/lib/startup-context-types.ts, .pi/lib/startup-context-collectors.ts
 * public_api: 関数 (pi: ExtensionAPI) => void
 * invariants:
 *   - セッション開始時に `isFirstPrompt` はtrue
 *   - `before_agent_start` イベント時にコンテキストが注入される
 * side_effects:
 *   - システムプロンプトの書き換え
 *   - 子プロセス実行（各種コマンド）
 *   - ファイルシステム読み取り
 * failure_modes:
 *   - コマンド実行時のタイムアウト
 *   - 非Unix環境でのコマンド不在
 *   - 権限不足による情報取得失敗
 * @abdd.explain
 * overview: セッションの各ターン開始前に環境情報をシステムプロンプトへ追記するエクステンション
 * what_it_does:
 *   - `session_start` イベントでセッションを初期化
 *   - `before_agent_start` イベントでベースライン/差分コンテキストを注入
 *   - 収集した情報をシェルコマンド形式でフォーマット
 * why_it_exists:
 *   - エージェントが環境情報を重複収集することを防ぐ
 *   - トークン効率の良い情報提供を実現
 *   - トラブルシューティングの成功率を向上
 * scope:
 *   in: ExtensionAPIイベントオブジェクト, コンテキストオブジェクト
 *   out: systemPromptが追記されたイベントオブジェクト
 */

/**
 * Startup Context Extension (Enhanced)
 *
 * Injects comprehensive environment context on each turn:
 * - First turn: Full baseline (20 layers)
 * - Subsequent turns: Delta only
 *
 * Collection Policy:
 * - Turn 1: Layers 1,2,3,4,5,6,8,9,10a,11,12,14,15,16,19
 * - Turn 2+: Layers 2,4,5,11 (delta only)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { startSession } from "../lib/context-breakdown-utils.js";
import { applyPromptStack, type PromptStackEntry } from "../lib/agent/prompt-stack.js";
import {
  createRuntimeNotification,
  formatRuntimeNotificationBlock,
} from "../lib/agent/runtime-notifications.js";
import {
  buildTurnExecutionContext,
  buildTurnExecutionRuntimeSection,
  formatTurnExecutionContextBlock,
} from "../lib/agent/turn-context-builder.js";
import { getRuntimeEnvironmentCache } from "../lib/runtime-environment-cache.js";
import {
  collectSessionStartContext,
  collectUserPromptDelta,
  formatSessionStartAsShell,
  formatDeltaAsShell,
} from "../lib/startup-context-collectors.js";
import type { SessionStartContext, UserPromptSubmitDelta } from "../lib/startup-context-types.js";
import { resetToolTelemetryStore } from "../lib/tool-telemetry-store.js";

// モジュールレベルのフラグ（reload時のリスナー重複登録防止）
let isInitialized = false;

/** 前回のコンテキスト（差分計算用） */
let previousContext: SessionStartContext | null = null;

/** 初回ターンかどうか */
let isFirstTurn = true;

/** セッション開始時刻 */
let sessionStartTime = 0;

export default function (pi: ExtensionAPI) {
  if (isInitialized) return;
  isInitialized = true;

  // セッション開始イベント
  pi.on("session_start", async (_event, _ctx) => {
    isFirstTurn = true;
    sessionStartTime = Date.now();
    previousContext = null;
    startSession();
    resetToolTelemetryStore();
    getRuntimeEnvironmentCache().reset();
  });

  // エージェント開始前イベント（毎ターン実行）
  pi.on("before_agent_start", async (event, _ctx) => {
    try {
      if (isFirstTurn) {
        // 初回ターン: ベースラインコンテキストを収集
        isFirstTurn = false;
        const context = collectSessionStartContext();
        previousContext = context;

        // シェル形式でフォーマット
        const formattedContext = formatSessionStartAsShell(context);
        const turnContext = buildTurnExecutionContext({
          availableToolNames: pi.getAllTools().map((tool) => tool.name),
          startupKind: "baseline",
          isFirstTurn: true,
          previousContextAvailable: false,
          sessionElapsedMs: Date.now() - sessionStartTime,
        });
        const runtimeOptimizationSection = buildTurnExecutionRuntimeSection(turnContext);
        const runtimeNotification = createRuntimeNotification(
          "startup-context",
          runtimeOptimizationSection,
          "info",
          1,
        );
        const entries: PromptStackEntry[] = [
          {
            source: "startup-context-baseline",
            recordSource: "startup-context-baseline",
            layer: "startup-context",
            markerId: "startup-context-baseline",
            content: formattedContext,
          },
          {
            source: "turn-execution-context-baseline",
            recordSource: "turn-execution-context",
            layer: "startup-context",
            markerId: "turn-execution-context-baseline",
            content: formatTurnExecutionContextBlock(turnContext),
          },
        ];
        if (runtimeNotification) {
          entries.push({
            source: "startup-runtime-optimization",
            recordSource: "startup-context-runtime",
            layer: "runtime-notification",
            markerId: "startup-runtime-optimization",
            content: formatRuntimeNotificationBlock([runtimeNotification]),
          });
        }
        const result = applyPromptStack(event.systemPrompt ?? "", entries);
        if (result.appliedEntries.length === 0) {
          return undefined;
        }

        return {
          systemPrompt: result.systemPrompt,
        };
      } else {
        // 2回目以降: 差分コンテキストを収集
        if (!previousContext) return undefined;

        const delta = collectUserPromptDelta(previousContext);

        // 有意な差分がない場合はスキップ
        if (!hasSignificantDelta(delta)) {
          return undefined;
        }

        // 差分をフォーマット
        const formattedDelta = formatDeltaAsShell(delta);
        const turnContext = buildTurnExecutionContext({
          availableToolNames: pi.getAllTools().map((tool) => tool.name),
          startupKind: "delta",
          isFirstTurn: false,
          previousContextAvailable: previousContext !== null,
          sessionElapsedMs: Date.now() - sessionStartTime,
        });
        const runtimeOptimizationSection = buildTurnExecutionRuntimeSection(turnContext);
        const runtimeNotification = createRuntimeNotification(
          "startup-context-delta",
          runtimeOptimizationSection,
          "info",
          1,
        );

        // 現在の状態を更新
        const currentCwd = process.cwd();
        if (previousContext.user.cwd !== currentCwd) {
          previousContext.user.cwd = currentCwd;
        }

        const entries: PromptStackEntry[] = [
          {
            source: "startup-context-delta",
            recordSource: "startup-context-delta",
            layer: "startup-context",
            markerId: `startup-context-delta:${Date.now()}`,
            content: `# Context Delta\n\n${formattedDelta}`,
          },
          {
            source: "turn-execution-context-delta",
            recordSource: "turn-execution-context",
            layer: "startup-context",
            markerId: `turn-execution-context-delta:${Date.now()}`,
            content: formatTurnExecutionContextBlock(turnContext),
          },
        ];
        if (runtimeNotification) {
          entries.push({
            source: "startup-runtime-optimization-delta",
            recordSource: "startup-context-runtime",
            layer: "runtime-notification",
            markerId: `startup-runtime-optimization-delta:${Date.now()}`,
            content: formatRuntimeNotificationBlock([runtimeNotification]),
          });
        }
        const result = applyPromptStack(event.systemPrompt ?? "", entries);
        if (result.appliedEntries.length === 0) {
          return undefined;
        }
        return {
          systemPrompt: result.systemPrompt,
        };
      }
    } catch (error) {
      // エラー時は何もしない（セッションを継続）
      console.error("[startup-context] Failed to collect context:", error);
      return undefined;
    }
  });

  // セッション終了イベント
  pi.on("session_shutdown", async () => {
    isInitialized = false;
    previousContext = null;
    isFirstTurn = true;
    sessionStartTime = 0;
  });
}

/**
 * @summary 有意な差分があるかどうかを判定
 * @param delta 差分コンテキスト
 * @returns 有意な差分がある場合true
 */
function hasSignificantDelta(delta: UserPromptSubmitDelta): boolean {
  // CWDの変更
  if (delta.cwd_changed) return true;

  // 環境変数の変更
  if (delta.env_delta) {
    if (Object.keys(delta.env_delta.changed).length > 0) return true;
    if (delta.env_delta.added.length > 0) return true;
    if (delta.env_delta.removed.length > 0) return true;
  }

  // Git差分
  if (delta.git_delta) {
    if (delta.git_delta.branch_changed) return true;
    if (delta.git_delta.commits_since_last > 0) return true;
    if (delta.git_delta.dirty_state.staged > 0) return true;
    if (delta.git_delta.dirty_state.modified > 0) return true;
    if (delta.git_delta.dirty_state.untracked > 0) return true;
  }

  // 失敗シグナル
  if (delta.failure_signals?.detected) return true;

  return false;
}
