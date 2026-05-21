import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CacheFriendlyRequestLog } from "../prompt-core/index.js";
import { generateCacheFriendlyReport } from "./report.js";

export async function appendCacheFriendlyLog(cwd: string, entry: CacheFriendlyRequestLog): Promise<void> {
  try {
    const dir = path.join(cwd, ".pi-cache-friendly");
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(path.join(dir, "requests.jsonl"), JSON.stringify(entry) + "\n", "utf8");
    await generateCacheFriendlyReport(dir);
  } catch { /* logging and report generation must never break agent execution */ }
}
