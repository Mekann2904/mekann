import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CacheFriendlyRequestLog } from "../prompt-core/index.js";
export async function appendCacheFriendlyLog(cwd: string, entry: CacheFriendlyRequestLog): Promise<void> {
  try {
    const dir = path.join(cwd, ".pi-cache-friendly");
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(path.join(dir, "requests.jsonl"), JSON.stringify(entry) + "\n", "utf8");
  } catch { /* logging must never break agent execution */ }
}
