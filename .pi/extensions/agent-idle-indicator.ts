/**
 * @abdd.meta
 * path: .pi/extensions/agent-idle-indicator.ts
 * role: エージェントの実行状態に応じたUI視覚エフェクトの制御
 * why: エージェントが動作していない状態をユーザーに即座に認識させるため
 * related: @mariozechner/pi-coding-agent, ExtensionAPI
 * public_api: default関数（ExtensionAPIを受け取る）
 * invariants: savedTitleは元のタイトル文字列（プレフィックス除く）を保持する
 * side_effects: 端末のタイトルバー文字列とフッターのステータス表示を変更する
 * failure_modes: セッション終了時にsavedTitleが空の場合、元のタイトルへ復帰できない
 * @abdd.explain
 * overview: エージェントの稼働状況に応じて、タイトルバーのアイコン（🔴/🟢）とフッターのステータステキストを切り替える拡張機能
 * what_it_does:
 *   - エージェント停止時にタイトルに「[🔴]」を付与し、フッターに赤文字で「停止中」を表示
 *   - エージェント開始時にタイトルを「[🟢]」に更新し、フッターの表示を消去
 *   - セッション開始時、エージェント停止状態であればインジケーターを表示
 *   - セッション終了時にタイトルを保存済みのオリジナルへ復元
 * why_it_exists:
 *   - エージェントの非実行状態を視覚的に明確化するため
 *   - 長時間待機状態にあるかどうかを一目で判断させるため
 * scope:
 *   in: ExtensionAPI（イベント購読用）, ExtensionAPI["context"]（UI操作用）
 * out: なし（UI更新のみ）
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

let isAgentRunning = false;
let savedTitle = "";

/**
 * Agent Idle Indicator
 *
 * Shows visual indicators when the agent is not running:
 * - Terminal title: [🔴] for idle, [🟢] for running
 * - Footer: "停止中" in red text when idle
 */

// モジュールレベルのフラグ（reload時のリスナー重複登録防止）
let isInitialized = false;

export default function (pi: ExtensionAPI) {
  if (isInitialized) return;
  isInitialized = true;

  // Clear red indicator when agent starts
  pi.on("agent_start", async (_event, ctx) => {
    isAgentRunning = true;
    clearIdleIndicator(ctx);
  });

  // Show red indicator when agent ends (idle state)
  pi.on("agent_end", async (_event, ctx) => {
    isAgentRunning = false;
    showIdleIndicator(ctx);
  });

  // Show idle indicator on initial session load
  pi.on("session_start", async (_event, ctx) => {
    if (!isAgentRunning) {
      showIdleIndicator(ctx);
    }
  });

  // Restore original when session ends
  pi.on("session_shutdown", async (_event, ctx) => {
    restoreOriginal(ctx);
  });
}

function showIdleIndicator(ctx: ExtensionAPI["context"]) {
  // 1. Change terminal title to show red circle
  const currentTitle = ctx.ui.getTitle?.() || "";
  if (currentTitle && !savedTitle) {
    savedTitle = currentTitle.replace(/^\[🟢\] /, "").replace(/^\[🔴\] /, "");
  }

  const redSquare = "[🔴] ";
  const newTitle = redSquare + (savedTitle || currentTitle.replace(/^\[🟢\] /, "").replace(/^\[🔴\] /, ""));
  ctx.ui.setTitle(newTitle);

  // 2. Set status in footer with Japanese text
  ctx.ui.setStatus("agent-idle", ctx.ui.theme.fg("error", "停止中"));
}

function clearIdleIndicator(ctx: ExtensionAPI["context"]) {
  // 1. Change terminal title to show green circle
  const currentTitle = ctx.ui.getTitle?.() || "";
  const greenSquare = "[🟢] ";
  const cleanTitle = currentTitle.replace(/^\[🔴\] /, "").replace(/^\[🟢\] /, "");
  ctx.ui.setTitle(greenSquare + cleanTitle);

  // 2. Clear status indicator
  ctx.ui.setStatus("agent-idle", undefined);
}

function restoreOriginal(ctx: ExtensionAPI["context"]) {
  // Restore original title
  if (savedTitle) {
    ctx.ui.setTitle(savedTitle.replace(/^\[🔴\] /, "").replace(/^\[🟢\] /, ""));
    savedTitle = "";
  }

  // Clear status indicator
  ctx.ui.setStatus("agent-idle", undefined);
}
