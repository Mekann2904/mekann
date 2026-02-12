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
