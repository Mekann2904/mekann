/**
 * @abdd.meta
 * path: .pi/extensions/agent-idle-indicator.ts
 * role: エージェントの実行状態を視覚的に通知するエクステンション
 * why: ユーザーがエージェントの稼働状況をタイトルバーやフッターから即座に把握するため
 * related: @mariozechner/pi-coding-agent, extension-api
 * public_api: default function (pi: ExtensionAPI)
 * invariants: isAgentRunningは実行状態を反映する、savedTitleは元のタイトルを保持する
 * side_effects: ctx.ui.setTitleによるタイトル変更、ctx.ui.setStatusによるフッターステータス更新
 * failure_modes: タイトル取得失敗時は空文字として扱う、保存済みタイトルがない場合は現在のタイトルを基準にする
 * @abdd.explain
 * overview: エージェントのアイドル状態を赤い丸印とフッターテキストで通知する
 * what_it_does:
 *   - agent_start時に緑色の丸[🟢]を表示しインジケーターを消去する
 *   - agent_end時に赤色の丸[🔴]と「停止中」を表示する
 *   - session_start時に未実行であればアイドル表示を適用する
 *   - session_shutdown時に元のタイトルと状態へ復元する
 * why_it_exists:
 *   - 実行待機時間を明確にするため
 *   - 日本語環境で「停止中」状態を直感的に伝えるため
 * scope:
 *   in: ExtensionAPI (agent_start, agent_end, session_start, session_shutdown)
 *   out: UIタイトル文字列、フッターステータス表示
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
