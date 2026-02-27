/**
 * @abdd.meta
 * path: .pi/extensions/kitty-protocol-reload-fix.ts
 * role: Kittyプロトコル状態の再同期化
 * why: モジュールリロード時に_kittyProtocolActiveがリセットされるが、ターミナルはKittyモードのままとなり入力が消失するため
 * related: kitty-status-integration.ts, pi-tui/keys.js, pi-tui/terminal.js
 * public_api: default関数（ExtensionAPIを受け取る）
 * invariants:
 *   - Kitty対応ターミナルでのみ動作する
 *   - ターミナルがKittyモードの場合、再クエリで応答が返る
 * side_effects:
 *   - stdoutへのエスケープシーケンス出力（\x1b[?u, \x1b[>7u）
 *   - stdinの一時的なrawモード変更
 * failure_modes:
 *   - 非Kittyターミナルではタイムアウトして何もしない
 *   - 応答が遅いターミナルではタイムアウト前に検出できない可能性がある
 * @abdd.explain
 * overview: /reloadコマンド実行後のKittyプロトコル状態不整合を修正する拡張機能
 * what_it_does:
 *   - session_startイベントでKittyプロトコル対応を再クエリする
 *   - ターミナルからの応答を検出したらKittyモードを再有効化する
 *   - タイムアウト処理で非Kittyターミナルに対応する
 *   - DEBUG_KITTY_FIX環境変数でデバッグログを出力する
 * why_it_exists:
 *   - pi-tuiの_kittyProtocolActive変数はモジュールレベルでリロード時にfalseにリセットされる
 *   - ターミナル自体はKittyモードのまま維持される
 *   - この不整合によりリロード後の入力が認識されなくなる
 * scope:
 *   in: ExtensionAPI（イベント購読用）, 環境変数（DEBUG_KITTY_FIX）, 標準入出力
 *   out: 標準出力へのエスケープシーケンス, デバッグログ
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// Kitty protocol sequences
const KITTY_QUERY = "\x1b[?u";
const KITTY_ENABLE = "\x1b[>7u";

// Response pattern: ESC [ ? <flags> u
const KITTY_RESPONSE_PATTERN = /^\x1b\[\?(\d+)u$/;

// Configuration
const RESPONSE_TIMEOUT_MS = 100;
const DEBUG_ENABLED = process.env.DEBUG_KITTY_FIX === "1";

// State tracking
let isFixApplied = false;
let responseHandler: ((data: Buffer) => void) | null = null;
let timeoutId: NodeJS.Timeout | null = null;

/**
 * @summary デバッグログを出力する
 * @param message - ログメッセージ
 */
function debugLog(message: string): void {
  if (DEBUG_ENABLED) {
    console.log(`[kitty-fix] ${message}`);
  }
}

/**
 * @summary ターミナルへエスケープシーケンスを送信する
 * @param sequence - 送信するエスケープシーケンス
 */
function writeToTerminal(sequence: string): void {
  // tmux環境ではパススルー処理が必要
  if (process.env.TMUX) {
    const escaped = sequence.replace(/\x1b/g, "\x1b\x1b");
    process.stdout.write(`\x1bPtmux;${escaped}\x1b\\`);
  } else {
    process.stdout.write(sequence);
  }
}

/**
 * @summary 応答ハンドラーとタイムアウトをクリーンアップする
 */
function cleanup(): void {
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
  if (responseHandler) {
    process.stdin.removeListener("data", responseHandler);
    responseHandler = null;
  }
}

/**
 * @summary Kittyプロトコルを再有効化する
 * @description ターミナルがKitty対応の場合、修飾キー報告モードを有効化する
 */
function enableKittyProtocol(): void {
  writeToTerminal(KITTY_ENABLE);
  debugLog("Kitty protocol re-enabled");
  isFixApplied = true;
}

/**
 * @summary Kittyプロトコル応答を処理するハンドラーを作成する
 * @returns stdinデータハンドラー関数
 */
function createResponseHandler(): (data: Buffer) => void {
  return (data: Buffer) => {
    const sequence = data.toString();
    debugLog(`Received response: ${sequence.replace(/\x1b/g, "ESC")}`);

    const match = sequence.match(KITTY_RESPONSE_PATTERN);
    if (match) {
      cleanup();
      enableKittyProtocol();
    }
  };
}

/**
 * @summary Kittyプロトコルの再クエリを実行する
 * @description ターミナルへクエリを送信し、応答を待機する
 */
function requeryKittyProtocol(): void {
  if (isFixApplied) {
    debugLog("Fix already applied, skipping");
    return;
  }

  debugLog("Querying Kitty protocol support...");

  // Create and register response handler
  responseHandler = createResponseHandler();
  process.stdin.prependListener("data", responseHandler);

  // Set timeout for non-Kitty terminals
  timeoutId = setTimeout(() => {
    debugLog("Timeout - assuming non-Kitty terminal");
    cleanup();
  }, RESPONSE_TIMEOUT_MS);

  // Send Kitty query
  writeToTerminal(KITTY_QUERY);
}

/**
 * Kitty Protocol Reload Fix Extension
 *
 * Fixes the state desynchronization that occurs after /reload command:
 * 1. Module reload resets _kittyProtocolActive to false
 * 2. Terminal remains in Kitty mode (no disable sequence sent)
 * 3. User input is sent as Kitty sequences but not recognized
 *
 * This extension:
 * 1. Listens for session_start event
 * 2. Re-queries Kitty protocol support
 * 3. Re-enables Kitty mode if terminal responds
 *
 * Debug mode: DEBUG_KITTY_FIX=1
 */
export default function (pi: ExtensionAPI): void {
  // Re-query on session start (triggered after reload)
  pi.on("session_start", async (_event, _ctx) => {
    debugLog("session_start event received");
    requeryKittyProtocol();
  });

  // Reset state on session shutdown
  pi.on("session_shutdown", async (_event, _ctx) => {
    debugLog("session_shutdown event received");
    cleanup();
    isFixApplied = false;
  });
}
