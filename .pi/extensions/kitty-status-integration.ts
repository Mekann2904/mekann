/**
 * @abdd.meta
 * path: .pi/extensions/kitty-status-integration.ts
 * role: kittyターミナル連携拡張
 * why: piの作業進捗をkittyのウィンドウタイトルや通知システムへ即時反映し、画像を表示するため
 * related: @mariozechner/pi-coding-agent, child_process
 * public_api: notify, setWindow, export default function(api)
 * invariants: process.env.KITTY_WINDOW_IDが存在する場合のみkittyコマンドを出力する
 * side_effects: stdoutへのエスケープシーケンス出力、osascript/afplayプロセスの生成
 * failure_modes: 通知コマンドの実行エラー（捕捉してログ出力のみ）、KITTY_WINDOW_ID未定義時の機能無効化
 * @abdd.explain
 * overview: piエージェントのイベントをフックし、kittyターミナルのUI要素（タイトル、通知）を制御する
 * what_it_does:
 *   - kittyのOSCコマンドを使用してウィンドウタイトルおよびタブ名を変更する
 *   - macOSではosascript経由で通知センターへ通知を送信する
 *   - macOSではafplayコマンドでシステムサウンドを再生する
 *   - readツールで画像を読み込んだ際にオーバーレイで表示する
 * why_it_exists:
 *   - ターミナル離れていてもエージェントの完了やエラーを認知可能にする
 *   - 現在のタスク状態をウィンドウタイトルで常時表示する
 *   - エージェントが画像を確認できるようにする
 * scope:
 *   in: ExtensionAPI(pi-coreからのイベント), プラットフォーム情報, 環境変数
 *   out: 標準出力へのエスケープシーケンス, 外部プロセス(osascript/afplay)の実行
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

import { spawn } from "child_process";
import { homedir } from "os";
import { closeSync, existsSync, openSync, writeSync } from "fs";
import { extname, isAbsolute, resolve } from "path";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// kitty用のエスケープシーケンス
const OSC = "\x1b]";
const ST = "\x07";
const KITTY_GRAPHICS_BEGIN = "\x1b_G";
const KITTY_GRAPHICS_END = "\x1b\\";

const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
]);

let terminalFd: number | undefined;

function wrapForTmuxPassthrough(data: string): string {
  // tmux passthrough: ESC は二重化して DCS で包む
  // 形式: ESC P tmux; <ESCを二重化したペイロード> ESC \
  const escaped = data.replace(/\x1b/g, "\x1b\x1b");
  return `\x1bPtmux;${escaped}\x1b\\`;
}

function writeToTerminal(data: string): void {
  // テスト時は stdout 強制にしてアサート可能にする
  if (process.env.PI_KITTY_FORCE_STDOUT === "1") {
    process.stdout.write(data);
    return;
  }

  // TUIがstdoutを捕捉する場合に備えて /dev/tty へ直接出力
  try {
    const outbound = process.env.TMUX ? wrapForTmuxPassthrough(data) : data;
    if (terminalFd === undefined) {
      terminalFd = openSync("/dev/tty", "w");
    }
    writeSync(terminalFd, outbound);
    return;
  } catch {
    // /dev/tty が使えない環境では従来どおり stdout へフォールバック
    process.stdout.write(process.env.TMUX ? wrapForTmuxPassthrough(data) : data);
  }
}

function closeTerminalIfNeeded(): void {
  if (terminalFd === undefined) return;
  try {
    closeSync(terminalFd);
  } catch {
    // no-op
  } finally {
    terminalFd = undefined;
  }
}

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
    writeToTerminal(`${OSC}2;${title}${ST}`);
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
  } catch (error: unknown) {
    // 通知送信エラーは無視
    console.error("Notification error:", error instanceof Error ? error.message : String(error));
  }
}

// サウンドを再生（macOSのみ、フォールバック付き）
export function playSound(soundPath: string): void {
  // macOSの場合: afplayを使用
  if (isMacOS) {
    // デフォルトサウンドファイルのリスト
    const defaultSounds = [
      soundPath,
      "/System/Library/Sounds/Glass.aiff",
      "/System/Library/Sounds/Ping.aiff",
      "/System/Library/Sounds/Tink.aiff",
    ];
    
    // 存在するサウンドファイルを探す
    const existingSound = defaultSounds.find(s => existsSync(s));
    
    if (existingSound) {
      try {
        spawn("afplay", [existingSound], {
          detached: true,
          stdio: "ignore"
        }).unref();
      } catch (error: unknown) {
        // サウンド再生失敗時はターミナルベルをフォールバック
        process.stdout.write('\u0007');
      }
    } else {
      // サウンドファイルが見つからない場合はターミナルベル
      process.stdout.write('\u0007');
    }
  } else {
    // 非macOSの場合: ターミナルベルを使用
    process.stdout.write('\u0007');
  }
}

// kittyのネイティブ通知（Linuxなど）
function notifyKitty(text: string, duration = 0): void {
  // i=1: 通知ID, d=duration: 表示時間（ミリ秒）
  writeToTerminal(`${OSC}99;i=1:d=${duration}:${text}${ST}`);
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

function emitKittyGraphics(control: string, payload = ""): void {
  writeToTerminal(`${KITTY_GRAPHICS_BEGIN}${control};${payload}${KITTY_GRAPHICS_END}`);
}

function clearKittyImages(): void {
  // d=A はこの端末内の表示中画像をすべて削除する
  emitKittyGraphics("a=d,d=A");
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

function asToolResultMessage(raw: unknown): { role?: string; isError?: boolean } | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const maybe = raw as { role?: unknown; isError?: unknown };
  return {
    role: typeof maybe.role === "string" ? maybe.role : undefined,
    isError: typeof maybe.isError === "boolean" ? maybe.isError : undefined,
  };
}

function getToolResultStats(messages: unknown[]): { toolCount: number; errorCount: number } {
  let toolCount = 0;
  let errorCount = 0;

  for (const entry of messages) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const wrapped = entry as { message?: unknown; role?: unknown; isError?: unknown };
    const candidate = asToolResultMessage(wrapped.message ?? wrapped);
    if (candidate?.role !== "toolResult") {
      continue;
    }
    toolCount += 1;
    if (candidate.isError === true) {
      errorCount += 1;
    }
  }

  return { toolCount, errorCount };
}

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
    interface EventWithMessages { messages?: unknown[] }
    function hasMessages(value: unknown): value is EventWithMessages {
      return typeof value === "object" && value !== null && "messages" in value;
    }
    const stats = getToolResultStats(hasMessages(event) ? event.messages : []);
    const toolCount = stats.toolCount;
    const toolErrorCount = stats.errorCount;

    const cwd = ctx.cwd.split("/").pop() || ctx.cwd;

    // ツールの部分失敗はwarning扱いにする（ターン全体失敗とは区別）
    const hasToolError = toolErrorCount > 0;

    // 完了通知
    const statusText = hasToolError
      ? `! Done: ${toolCount} tool(s), ${toolErrorCount} error(s) in ${cwd}`
      : `✓ Done: ${toolCount} tool(s) in ${cwd}`;
    // 部分失敗はエラー音にしない（誤検知防止）
    notify(statusText, 0, "pi", false);

    // タイトルを復元
    setWindow(`pi: ${cwd}`);

    ctx.ui.notify(
      hasToolError
        ? `Completed turn ${turnCount} (${toolCount} tools, ${toolErrorCount} errors)`
        : `Completed turn ${turnCount} (${toolCount} tools)`,
      hasToolError ? "warning" : "success"
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
    closeTerminalIfNeeded();
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
