/**
 * Kitty Status Integration Extension
 *
 * kittyのshell integrationを活用して、piの作業状態を反映します。
 * kitty以外のターミナルでは何もしません。
 *
 * macOSの通知: osascriptを使用
 * Linuxの通知: kittyのネイティブ通知
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { spawn, execSync } from "child_process";

// kitty用のエスケープシーケンス
const OSC = "\x1b]";
const ST = "\x07";

// プラットフォーム検出
const isMacOS = process.platform === "darwin";

// kittyかどうかを判定
function isKitty(): boolean {
  return !!process.env.KITTY_WINDOW_ID;
}

// ウィンドウタイトル/タブ名を設定
function setTitle(title: string): void {
  if (isKitty()) {
    process.stdout.write(`${OSC}2;${title}${ST}`);
  }
}

// macOSの通知センターに通知を送信
function notifyMacOS(text: string, title = "pi"): void {
  try {
    // AppleScriptの文字列として適切にエスケープ
    // ダブルクォートをバックスラッシュでエスケープ
    const escapedText = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const escapedTitle = title.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    
    // spawnで配列として引数を渡す（シェル解釈を回避）
    const child = spawn('osascript', [
      '-e',
      `display notification "${escapedText}" with title "${escapedTitle}"`
    ], {
      stdio: 'ignore',
      detached: true
    });
    child.unref();
    
    // 別途システムサウンドを非同期で再生（Tink音）
    spawn("afplay", ["/System/Library/Sounds/Tink.aiff"], {
      detached: true,
      stdio: "ignore"
    }).unref();
  } catch (error) {
    // 通知送信エラーは無視
    console.error("Notification error:", error);
  }
}

// kittyのネイティブ通知（Linuxなど）
function notifyKitty(text: string, duration = 0): void {
  // i=1: 通知ID, d=duration: 表示時間（ミリ秒）
  process.stdout.write(`${OSC}99;i=1:d=${duration}:${text}${ST}`);
}

// 通知を表示（プラットフォーム別）
function notify(text: string, duration = 0, title = "pi"): void {
  if (!isKitty()) return;

  if (isMacOS) {
    notifyMacOS(text, title);
  } else {
    notifyKitty(text, duration);
  }
}

// 元のタイトルを保存
let originalTitle: string | undefined;

// タイトルを設定（初回のみ元のタイトルを保存）
function setWindow(title: string): void {
  if (!isKitty()) return;

  if (originalTitle === undefined) {
    // 現在のタイトルは取得できないので、デフォルト値を保存
    // ユーザーが手動で設定したものとして、空文字列で初期化
    originalTitle = "";
  }

  setTitle(title);
}

// 元のタイトルに復元
function restoreTitle(): void {
  if (!isKitty()) return;

  if (originalTitle !== undefined) {
    setTitle(originalTitle);
    originalTitle = undefined;
  }
}

// 現在のツール名を追跡
let currentTool: string | undefined;

// 現在のターン数を追跡
let turnCount = 0;

export default function (pi: ExtensionAPI) {
  // セッション開始時
  pi.on("session_start", async (_event, ctx) => {
    if (!isKitty()) return;

    const cwd = ctx.cwd.split("/").pop() || ctx.cwd;
    setWindow(`pi: ${cwd}`);
    turnCount = 0;

    ctx.ui.notify("Kitty Status Integration loaded", "info");
  });

  // エージェント開始時
  pi.on("agent_start", async (_event, ctx) => {
    if (!isKitty()) return;

    turnCount++;
    const cwd = ctx.cwd.split("/").pop() || ctx.cwd;
    setWindow(`pi: ${cwd} [Processing... T${turnCount}]`);
  });

  // エージェント終了時
  pi.on("agent_end", async (event, ctx) => {
    if (!isKitty()) return;

    // メッセージ数から実行されたツール数を推定
    const toolCount = event.messages.filter(
      m => m.type === "message" && m.message.role === "toolResult"
    ).length;

    const cwd = ctx.cwd.split("/").pop() || ctx.cwd;

    // 完了通知
    notify(`✓ Done: ${toolCount} tool(s) in ${cwd}`);

    // タイトルを復元
    setWindow(`pi: ${cwd}`);

    ctx.ui.notify(`Completed turn ${turnCount} (${toolCount} tools)`, "success");
  });

  // ターン開始時
  pi.on("turn_start", async (event, ctx) => {
    if (!isKitty()) return;

    const cwd = ctx.cwd.split("/").pop() || ctx.cwd;
    setWindow(`pi: ${cwd} [Turn ${turnCount}.${event.turnIndex + 1}]`);
  });

  // ターン終了時
  pi.on("turn_end", async (_event, ctx) => {
    if (!isKitty()) return;

    const cwd = ctx.cwd.split("/").pop() || ctx.cwd;
    setWindow(`pi: ${cwd}`);
  });

  // ツール呼び出し時
  pi.on("tool_call", async (event, ctx) => {
    if (!isKitty()) return;

    currentTool = event.toolName;
    const cwd = ctx.cwd.split("/").pop() || ctx.cwd;
    setWindow(`pi: ${cwd} [Running: ${event.toolName}]`);
  });

  // ツール実行結果時
  pi.on("tool_result", async (event, ctx) => {
    if (!isKitty()) return;

    currentTool = undefined;
    const cwd = ctx.cwd.split("/").pop() || ctx.cwd;
    setWindow(`pi: ${cwd}`);
  });

  // セッション終了時
  pi.on("session_shutdown", async () => {
    if (!isKitty()) return;

    restoreTitle();
  });

  // セッション切り替え前
  pi.on("session_before_switch", async (event, ctx) => {
    if (!isKitty()) return;

    const cwd = ctx.cwd.split("/").pop() || ctx.cwd;

    if (event.reason === "new") {
      setWindow(`pi: ${cwd} [New session]`);
    } else if (event.reason === "resume") {
      setWindow(`pi: ${cwd} [Resuming...]`);
    }
  });

  // カスタムコマンド: /kitty-title
  pi.registerCommand("kitty-title", {
    description: "Set custom kitty window/tab title",
    handler: async (args, ctx) => {
      if (!isKitty()) {
        ctx.ui.notify("Not running in kitty terminal", "error");
        return;
      }

      if (args) {
        setWindow(args);
        ctx.ui.notify(`Title set to: ${args}`, "success");
      } else {
        // 引数なしで元のタイトルに復元
        const cwd = ctx.cwd.split("/").pop() || ctx.cwd;
        setWindow(`pi: ${cwd}`);
        ctx.ui.notify("Title reset to default", "info");
      }
    },
  });

  // カスタムコマンド: /kitty-notify
  pi.registerCommand("kitty-notify", {
    description: "Send a notification via kitty",
    handler: async (args, ctx) => {
      if (!isKitty()) {
        ctx.ui.notify("Not running in kitty terminal", "error");
        return;
      }

      if (args) {
        notify(args, 3000);
        ctx.ui.notify(`Notification sent: ${args}`, "success");
      } else {
        ctx.ui.notify("Usage: /kitty-notify <message>", "warning");
      }
    },
  });

  // カスタムコマンド: /kitty-status
  pi.registerCommand("kitty-status", {
    description: "Show kitty integration status",
    handler: async (_args, ctx) => {
      if (!isKitty()) {
        ctx.ui.notify("Not running in kitty terminal", "warning");
        return;
      }

      const windowId = process.env.KITTY_WINDOW_ID || "unknown";
      const cwd = ctx.cwd.split("/").pop() || ctx.cwd;
      const toolInfo = currentTool ? `Running: ${currentTool}` : "Idle";

      const status = [
        `✓ Kitty Status Integration: Active`,
        `  Window ID: ${windowId}`,
        `  Working dir: ${cwd}`,
        `  Turn count: ${turnCount}`,
        `  Status: ${toolInfo}`,
      ].join("\n");

      ctx.ui.notify(status, "info");
    },
  });
}
