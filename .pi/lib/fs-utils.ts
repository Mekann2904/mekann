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
