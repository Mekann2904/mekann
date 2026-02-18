/**
 * @abdd.meta
 * path: .pi/lib/fs-utils.ts
 * role: 共有ファイルシステムユーティリティライブラリ
 * why: agent-teams.ts, agent-usage-tracker.ts, subagents.ts に散在していたディレクトリ操作の重複実装を一元管理するため
 * related: agent-teams.ts, agent-usage-tracker.ts, subagents.ts
 * public_api: ensureDir
 * invariants: path引数は非空文字列であることを呼び出し元が保証
 * side_effects: ファイルシステムにディレクトリを作成する
 * failure_modes: パスに書き込み権限がない場合、mkdirSyncが例外をスローする
 * @abdd.explain
 * overview: 複数の拡張機能で使用されるファイルシステム操作の共通ユーティリティ
 * what_it_does:
 *   - ディレクトリの存在確認を行う
 *   - ディレクトリが存在しない場合、再帰的に作成する
 * why_it_exists:
 *   - 各モジュールでのexistsSync/mkdirSyncの重複コードを削減
 *   - ディレクトリ作成ロジックの単一責任化
 * scope:
 *   in: ディレクトリパスの文字列
 *   out: ファイル読み込み、ネットワーク通信、プロセス管理
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
  * ディレクトリが存在することを保証します
  * @param path - 確認するディレクトリのパス
  * @returns なし
  */
export function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}
