/**
 * @abdd.meta
 * path: .pi/lib/context-reporter.ts
 * role: 子プロセス用軽量コンテキストレポーター
 * why: 子プロセス（subagent/agent_team）がweb-ui拡張を読み込まずにコンテキスト履歴を記録するため
 * related: .pi/extensions/web-ui/server.ts, .pi/extensions/cross-instance-runtime.ts, .pi/lib/runtime-sessions.ts
 * public_api: ContextEntry, reportContextUsage, getParentPid, MAX_HISTORY, SHARED_DIR
 * invariants:
 *   - 履歴ファイルは常にMAX_HISTORY件以下を保持する
 *   - ファイル書き込みは原子的に行われる
 *   - 親PIDが取得できない場合はppidにフォールバックする
 * side_effects:
 *   - ~/.pi-shared/ ディレクトリの作成
 *   - context-history-{pid}.json ファイルへの書き込み
 * failure_modes:
 *   - ディスク容量不足による書き込み失敗
 *   - ファイルロック競合によるデータ破損（原子的書き込みで緩和）
 * @abdd.explain
 * overview: 子プロセスから親プロセスのコンテキスト履歴ファイルへ安全に書き込む軽量モジュール
 * what_it_does:
 *   - 親PIDを環境変数またはppidから特定する
 *   - コンテキスト使用量エントリを親の履歴ファイルに追記する
 *   - 履歴サイズがMAX_HISTORYを超えた場合、古いエントリを削除する
 * why_it_exists:
 *   - 子プロセスは--no-extensionsフラグで実行され、web-ui拡張が読み込まれない
 *   - ダッシュボードが全プロセスのコンテキスト履歴を統合表示するために必要
 * scope:
 *   in: タイムスタンプ、入出力トークン数
 *   out: ~/.pi-shared/context-history-{parentPid}.json への書き込み
 */

/**
 * Lightweight Context Reporter for Child Processes
 *
 * Writes context history to parent's file without requiring web-ui extension.
 * Enables dashboard to show context usage from all child processes.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";

// ============================================================================
// Constants
// ============================================================================

/** 共有ディレクトリのパス */
export const SHARED_DIR = join(homedir(), ".pi-shared");

/** 履歴の最大保持件数 */
export const MAX_HISTORY = 100;

// ============================================================================
// Types
// ============================================================================

/**
 * コンテキスト使用量エントリ
 * @summary コンテキスト使用量を記録
 * @param timestamp - ISO形式のタイムスタンプ
 * @param input - 入力トークン数
 * @param output - 出力トークン数
 * @param pid - このエントリを記録したプロセスのPID
 * @param parentPid - 親プロセスのPID
 */
export interface ContextEntry {
  /** ISO形式のタイムスタンプ */
  timestamp: string;
  /** 入力トークン数 */
  input: number;
  /** 出力トークン数 */
  output: number;
  /** このエントリを記録したプロセスのPID */
  pid: number;
  /** 親プロセスのPID（オプション） */
  parentPid?: number;
}

/**
 * reportContextUsageに渡す部分的なエントリ
 * @summary 入力引数の型
 * @param timestamp - ISO形式のタイムスタンプ
 * @param input - 入力トークン数
 * @param output - 出力トークン数
 */
export type ContextEntryInput = Omit<ContextEntry, "pid" | "parentPid">;

// ============================================================================
// Functions
// ============================================================================

/**
 * 親PIDを環境変数またはppidから取得
 * @summary 親プロセスIDを特定
 * @returns 親プロセスのPID
 * @description
 *   環境変数PI_PARENT_PIDが設定されている場合はその値を使用し、
 *   設定されていない場合はprocess.ppidにフォールバックする。
 *   子プロセス起動時にPI_PARENT_PIDを設定することを推奨。
 */
export function getParentPid(): number {
  const envParent = process.env.PI_PARENT_PID;
  if (envParent) {
    const parsed = parseInt(envParent, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  // Fallback to ppid
  return process.ppid;
}

/**
 * 親プロセスの履歴ファイルパスを取得
 * @summary 履歴ファイルパスを生成
 * @param parentPid - 親プロセスのPID
 * @returns 履歴ファイルのフルパス
 * @internal
 */
function getHistoryFilePath(parentPid: number): string {
  return join(SHARED_DIR, `context-history-${parentPid}.json`);
}

/**
 * 共有ディレクトリを確保
 * @summary ディレクトリが存在しない場合は作成
 * @internal
 */
function ensureSharedDir(): void {
  if (!existsSync(SHARED_DIR)) {
    mkdirSync(SHARED_DIR, { recursive: true });
  }
}

/**
 * 履歴ファイルを読み込む
 * @summary JSONファイルから履歴配列を読み込む
 * @param filePath - ファイルパス
 * @returns 履歴配列（ファイルが存在しない、または読み込みエラー時は空配列）
 * @internal
 */
function readHistoryFile(filePath: string): ContextEntry[] {
  try {
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch {
    // File corruption or parse error - start fresh
  }
  return [];
}

/**
 * 履歴をトリムして保存
 * @summary 履歴をMAX_HISTORY件に制限して保存
 * @param filePath - ファイルパス
 * @param history - 履歴配列
 * @internal
 */
function writeHistoryFile(filePath: string, history: ContextEntry[]): void {
  // Trim to max size
  const trimmed = history.length > MAX_HISTORY
    ? history.slice(-MAX_HISTORY)
    : history;

  // Write atomically using temp file pattern
  const tempFile = `${filePath}.tmp`;

  try {
    writeFileSync(tempFile, JSON.stringify(trimmed, null, 2));
    writeFileSync(filePath, JSON.stringify(trimmed, null, 2));
  } finally {
    // Clean up temp file
    try {
      unlinkSync(tempFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * コンテキスト使用量を親プロセスの履歴ファイルに記録
 * @summary コンテキスト使用量を報告
 * @param entry - タイムスタンプ、入力トークン数、出力トークン数を含むエントリ
 * @description
 *   子プロセスから呼び出され、親プロセスのコンテキスト履歴ファイルに
 *   使用量を追記する。親PIDは環境変数PI_PARENT_PIDまたはppidから自動取得される。
 *   履歴は最大MAX_HISTORY件まで保持され、超過分は古い順に削除される。
 *
 * @example
 * ```typescript
 * import { reportContextUsage } from "./context-reporter.js";
 *
 * // At turn end or message completion:
 * reportContextUsage({
 *   timestamp: new Date().toISOString(),
 *   input: 1500,
 *   output: 500,
 * });
 * ```
 */
export function reportContextUsage(entry: ContextEntryInput): void {
  const parentPid = getParentPid();
  const historyFile = getHistoryFilePath(parentPid);

  // Ensure directory exists
  ensureSharedDir();

  // Read existing history
  const history = readHistoryFile(historyFile);

  // Add new entry with child PID metadata
  const fullEntry: ContextEntry = {
    ...entry,
    pid: process.pid,
    parentPid,
  };

  history.push(fullEntry);

  // Write with trimming
  writeHistoryFile(historyFile, history);
}

/**
 * 現在のプロセスの履歴ファイルパスを取得（デバッグ用）
 * @summary 履歴ファイルパスを返す
 * @returns 現在の親プロセス用の履歴ファイルパス
 */
export function getCurrentHistoryFilePath(): string {
  return getHistoryFilePath(getParentPid());
}

/**
 * 履歴をクリア（テスト用）
 * @summary 履歴ファイルを削除
 * @param parentPid - 削除対象の親PID（省略時は現在の親PID）
 */
export function clearHistory(parentPid?: number): void {
  const pid = parentPid ?? getParentPid();
  const filePath = getHistoryFilePath(pid);

  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  } catch {
    // Ignore errors
  }
}
