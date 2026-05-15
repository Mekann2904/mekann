/**
 * Subagent Extension — Persistence.
 *
 * Append-only JSONL storage for agent state, lifecycle events, and mailbox items.
 */

import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export interface PersistedEntry {
  t: "metadata" | "event" | "mailbox" | "final_result" | "edge_open" | "edge_closed";
  ts: number;
  data: unknown;
}

/**
 * Append an entry to the subagent state file.
 * Creates parent directories as needed.
 */
export async function appendState(
  filePath: string,
  entry: PersistedEntry,
): Promise<void> {
  const line = JSON.stringify(entry) + "\n";
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, line, "utf8");
}

/**
 * Parse state entries from a JSONL string.
 * Ignores malformed lines.
 */
export function parseStateLog(content: string): PersistedEntry[] {
  const entries: PersistedEntry[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && "t" in parsed && "ts" in parsed) {
        entries.push(parsed as PersistedEntry);
      }
    } catch {
      // Ignore malformed lines
    }
  }
  return entries;
}
