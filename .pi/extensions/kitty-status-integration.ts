/**
 * @abdd.meta
 * path: .pi/extensions/kitty-status-integration.ts
 * role: kittyターミナル統合エクステンション
 * why: piの作業状態をkittyのウィンドウタイトルや通知システムへ連携するため
 * related: @mariozechner/pi-coding-agent, child_process
 * public_api: setWindow, notify
 * invariants: kitty以外のターミナルでは標準出力へのエスケープシーケンス出力と通知発火を行わない
 * side_effects: プロセス標準出力への書き込み、osascript/afplayプロセスの生成
 * failure_modes: 外部コマンド(osascript, afplay)の実行失敗時はエラーをログ出力して処理を継続する
 * @abdd.explain
 * overview: kittyのshell integrationを利用し、piのエージェント状態可視化と通知を行う
 * what_it_does:
 *   - kittyのウィンドウタイトルとタブ名をエスケープシーケンスで設定する
 *   - macOSではAppleScriptとafplayを用いて通知とシステムサウンドを再生する
 *   - Linuxではkittyネイティブ通知を表示する
 *   - 実行環境がkittyかどうかを環境変数KITTY_WINDOW_IDで判定する
 * why_it_exists:
 *   - ユーザーがターミナル操作中にpiの状態を非干渉で把握するため
 *   - プラットフォームごとの最適な通知手段（macOS通知センター、kitty通知）を提供するため
 * scope:
 *   in: piのExtensionAPIコールバック、通知設定オブジェクト
 *   out: 標準出力(ESCシーケンス)、OSの通知サブシステム、サウンド再生プロセス
 */

/**
 * Kitty Status Integration Extension
 *
 * kittyのshell integrationを活用して、piの作業状態を反映します。
 * kitty以外のターミナルでは何もしません。
 *
 * macOSの通知: osascriptを使用
 * Linuxの通知: kittyのネイティブ通知
 */

import { spawn, execSync } from "child_process";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// kitty用のエスケープシーケンス
const OSC = "\x1b]";
const ST = "\x07";

// プラットフォーム検出
const isMacOS = process.platform === "darwin";

// 通知設定の型定義
interface NotificationOptions {
  enabled: boolean;             // 通知全体の有効/無効
  soundEnabled: boolean;        // サウンドの有効/無効
  notifyCenterEnabled: boolean; // 通知センターの有効/無効
  successSound: string;         // 成功時のサウンドパス
  errorSound: string;           // エラー時のサウンドパス
}

// デフォルト設定
const notifyOptions: NotificationOptions = {
  enabled: true,
  soundEnabled: true,
  notifyCenterEnabled: true,
  successSound: "/System/Library/Sounds/Tink.aiff",
  errorSound: "/System/Library/Sounds/Basso.aiff",
};

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
  } catch (error) {
    // 通知送信エラーは無視
    console.error("Notification error:", error);
  }
}

// サウンドを再生（macOSのみ）
function playSound(soundPath: string): void {
  if (!isMacOS) return;
  try {
    spawn("afplay", [soundPath], {
      detached: true,
      stdio: "ignore"
    }).unref();
  } catch (error) {
    console.error("Sound playback error:", error);
  }
}

// kittyのネイティブ通知（Linuxなど）
function notifyKitty(text: string, duration = 0): void {
  // i=1: 通知ID, d=duration: 表示時間（ミリ秒）
  process.stdout.write(`${OSC}99;i=1:d=${duration}:${text}${ST}`);
}

// 通知を表示（プラットフォーム別、設定対応版）
function notify(text: string, duration = 0, title = "pi", isError = false): void {
  if (!isKitty()) return;
  if (!notifyOptions.enabled) return;

  // 通知センター通知
  if (notifyOptions.notifyCenterEnabled) {
    if (isMacOS) {
      notifyMacOS(text, title);
    } else {
      notifyKitty(text, duration);
    }
  }

  // サウンド再生
  if (notifyOptions.soundEnabled) {
    const soundPath = isError ? notifyOptions.errorSound : notifyOptions.successSound;
    playSound(soundPath);
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

    // エラー判定: toolResultにisErrorがあるか確認
    const hasError = event.messages.some(
      m => m.type === "message" && 
           m.message.role === "toolResult" && 
           m.message.isError === true
    );

    // 完了通知（エラー時は異なるサウンド）
    const statusText = hasError 
      ? `✗ Error in ${cwd}` 
      : `✓ Done: ${toolCount} tool(s) in ${cwd}`;
    notify(statusText, 0, "pi", hasError);

    // タイトルを復元
    setWindow(`pi: ${cwd}`);

    ctx.ui.notify(
      `Completed turn ${turnCount} (${toolCount} tools)`, 
      hasError ? "error" : "success"
    );
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

    // question ツールの場合は通知
    if (event.toolName === "question") {
      notify("Waiting for your response", 0, "pi: Question");
    }
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
        `  Notifications: ${notifyOptions.enabled ? "on" : "off"}`,
        `  Sound: ${notifyOptions.soundEnabled ? "on" : "off"}`,
      ].join("\n");

      ctx.ui.notify(status, "info");
    },
  });

  // カスタムコマンド: /kitty-notify-config
  pi.registerCommand("kitty-notify-config", {
    description: "Configure kitty notification settings (on|off|sound on|sound off)",
    handler: async (args, ctx) => {
      if (!isKitty()) {
        ctx.ui.notify("Not running in kitty terminal", "error");
        return;
      }

      const arg = args?.trim().toLowerCase();

      if (arg === "off") {
        notifyOptions.enabled = false;
        ctx.ui.notify("Notifications disabled", "info");
      } else if (arg === "on") {
        notifyOptions.enabled = true;
        ctx.ui.notify("Notifications enabled", "info");
      } else if (arg === "sound off") {
        notifyOptions.soundEnabled = false;
        ctx.ui.notify("Sound disabled", "info");
      } else if (arg === "sound on") {
        notifyOptions.soundEnabled = true;
        ctx.ui.notify("Sound enabled", "info");
      } else {
        ctx.ui.notify(
          `Usage: /kitty-notify-config [on|off|sound on|sound off]\n` +
          `Current: enabled=${notifyOptions.enabled}, sound=${notifyOptions.soundEnabled}`,
          "info"
        );
      }
    },
  });
}
