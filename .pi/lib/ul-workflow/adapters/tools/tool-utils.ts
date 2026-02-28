/**
 * @abdd.meta
 * path: .pi/lib/ul-workflow/adapters/tools/tool-utils.ts
 * role: ツール定義の共通ユーティリティ
 * why: ツール実装の重複を避けるため
 * related: ./start-tool.ts, ./status-tool.ts
 * public_api: makeResult, makeError, getTaskDir
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: ツール定義のヘルパー関数
 * what_it_does:
 *   - 結果オブジェクトの生成
 *   - エラーオブジェクトの生成
 *   - パス操作
 * why_it_exists: ツール実装のボイラープレートを削減
 * scope:
 *   in: なし
 *   out: すべてのツール定義
 */

import * as path from "path";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";

const TASKS_DIR = ".pi/ul-workflow/tasks";

/**
 * タスクディレクトリのパスを取得
 * @summary タスクディレクトリ取得
 * @param taskId - タスクID
 * @returns ディレクトリパス
 */
export function getTaskDir(taskId: string): string {
  return path.join(TASKS_DIR, taskId);
}

/**
 * ツール結果を作成
 * @summary 結果作成
 * @param text - テキスト内容
 * @param details - 詳細情報
 * @returns ツール結果
 */
export function makeResult(
  text: string,
  details: Record<string, unknown> = {}
): AgentToolResult<unknown> {
  return {
    content: [{ type: "text", text }],
    details,
  };
}

/**
 * エラー結果を作成
 * @summary エラー作成
 * @param message - エラーメッセージ
 * @param code - エラーコード
 * @param details - 追加詳細
 * @returns エラー結果
 */
export function makeError(
  message: string,
  code: string,
  details: Record<string, unknown> = {}
): AgentToolResult<unknown> {
  return {
    content: [{ type: "text", text: `エラー: ${message}` }],
    details: { error: code, ...details },
  };
}

/**
 * 質問付き結果を作成
 * @summary 質問結果作成
 * @param text - テキスト内容
 * @param question - 質問データ
 * @param details - 詳細情報
 * @returns 質問付き結果
 */
export function makeResultWithQuestion(
  text: string,
  question: {
    question: string;
    header: string;
    options: Array<{ label: string; description: string }>;
    multiple?: boolean;
    custom?: boolean;
  },
  details: Record<string, unknown> = {}
): AgentToolResult<unknown> {
  return {
    content: [{ type: "text", text }],
    details: {
      ...details,
      askUser: true,
      question,
    },
  };
}
