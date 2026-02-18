/**
 * @abdd.meta
 * path: .pi/lib/fs-utils.ts
 * role: ディレクトリ操作に関するユーティリティを提供する共有モジュール
 * why: 複数の拡張機能で重複していた実装を統一・集約するため
 * related: agent-teams.ts, agent-usage-tracker.ts, subagents.ts
 * public_api: ensureDir(path: string): void
 * invariants: ensureDir実行後、指定されたパスのディレクトリが存在する状態になる
 * side_effects: ファイルシステム上にディレクトリが作成される
 * failure_modes: 指定されたパスへの書き込み権限がない場合、またはパスが無効な場合にエラーが発生する
 * @abdd.explain
 * overview: ファイルシステム操作のヘルパー関数を定義したモジュール
 * what_it_does:
 *   - 指定されたパスにディレクトリが存在しない場合、再帰的に作成する
 *   - agent-teams.ts, agent-usage-tracker.ts, subagents.ts に分散していた重複コードを置き換える
 * why_it_exists:
 *   - コードの重複を排除し、保守性を向上させるため
 *   - 拡張機能間で共通のファイルシステム操作ロジックを再利用するため
 * scope:
 *   in: ディレクトリパス（文字列）
 *   out: ファイルシステムへのディレクトリ作成、および戻り値なし（void）
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
