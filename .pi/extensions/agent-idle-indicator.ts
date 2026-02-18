/**
 * @abdd.meta
 * path: .pi/extensions/agent-idle-indicator.ts
 * role: エージェント実行状態の視覚的インジケーターを提供する拡張機能
 * why: ターミナルを見るだけでエージェントの待機状態を即座に判別可能にするため
 * related: ExtensionAPI, event-system, ui-title-manager, status-bar
 * public_api: default (エクスポート関数)
 * invariants:
 *   - isAgentRunning はエージェント実行状態を一意に表す
 *   - savedTitle は空文字列時のみ元タイトルを保存し、重複保存しない
 * side_effects:
 *   - ターミナルタイトルの変更 (ctx.ui.setTitle)
 *   - フッターステータスの設定/クリア (ctx.ui.setStatus)
 * failure_modes:
 *   - ctx.ui.getTitle が undefined を返す場合、空文字列として処理される
 *   - タイトル取得失敗時はフォールバック値として空文字列を使用
 * @abdd.explain
 * overview: エージェントの実行状態に応じてターミナルタイトルとフッターに視覚的インジケーターを表示する拡張機能
 * what_it_does:
 *   - agent_start イベント受信時に [🟢] タイトルを設定しステータスをクリア
 *   - agent_end イベント受信時に [🔴] タイトルと「停止中」ステータスを設定
 *   - session_start イベント受信時にエージェント非実行時のみアイドル表示
 *   - session_shutdown イベント受信時に元のタイトルを復元しステータスをクリア
 * why_it_exists:
 *   - ユーザーがターミナルタイトルを見るだけでエージェント状態を判別できるようにするため
 *   - 長時間セッションでエージェント待機状態を見落とさないようにするため
 * scope:
 *   in: ExtensionAPI, agent_start/agent_end/session_start/session_shutdown イベント
 *   out: UI タイトル操作、ステータスバー操作
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
export default function (pi: ExtensionAPI) {
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
