/**
 * File system utilities shared across extensions.
 * Consolidates duplicate implementations from:
 * - agent-teams.ts
 * - agent-usage-tracker.ts
 * - subagents.ts
 */

import { existsSync, mkdirSync } from "fs";

/**
 * Ensures a directory exists, creating it recursively if necessary.
 * @param path - The directory path to ensure
 */
export function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}
