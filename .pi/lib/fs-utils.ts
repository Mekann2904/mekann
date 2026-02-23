/**
 * @abdd.meta
 * path: .pi/lib/fs-utils.ts
 * role: ファイルシステムユーティリティ
 * why: agent-teams.ts, agent-usage-tracker.ts, subagents.ts に散在していた重複実装を統一するため
 * related: agent-teams.ts, agent-usage-tracker.ts, subagents.ts
 * public_api: ensureDir
 * invariants: 関数実行後、指定したパスのディレクトリが存在する状態になる
 * side_effects: ファイルシステム上にディレクトリを作成する
 * failure_modes: ディレクトリ作成権限がない場合、またはパスが無効な場合にエラーが発生する
 * @abdd.explain
 * overview: 拡張機能間で共有されるファイルシステム操作を提供するモジュール
 * what_it_does:
 *   - 指定されたパスが存在しない場合、再帰的にディレクトリを作成する
 * why_it_exists:
 *   - コードの重複を排除し、ディレクトリ生成ロジックを一元管理する
 *   - 各エージェントファイルでの実装ミスを防ぐ
 * scope:
 *   in: 文字列型のファイルパス
 *   out: なし（void）
 */

/**
 * File system utilities shared across extensions.
 * Consolidates duplicate implementations from:
 * - agent-teams.ts
 * - agent-usage-tracker.ts
 * - subagents.ts
 */

import { existsSync, mkdirSync } from "fs";

/**
 * ディレクトリ生成
 * @summary ディレクトリを生成
 * @param path - 確認するディレクトリのパス
 * @returns なし
 */
export function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}
