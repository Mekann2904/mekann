import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CacheFriendlyRequestLog } from "../prompt-core/index.js";
import type { ActualUsageLog } from "./actualUsage.js";
import { generateCacheFriendlyReport } from "./report.js";

function cacheFriendlyDir(cwd: string): string {
  return path.join(cwd, ".pi-cache-friendly");
}

export async function appendCacheFriendlyLog(cwd: string, entry: CacheFriendlyRequestLog): Promise<void> {
  try {
    const dir = cacheFriendlyDir(cwd);
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(path.join(dir, "requests.jsonl"), JSON.stringify(entry) + "\n", "utf8");
    await generateCacheFriendlyReport(dir);
  } catch { /* logging and report generation must never break agent execution */ }
}

export async function appendActualUsageLog(cwd: string, entry: ActualUsageLog): Promise<void> {
  try {
    const dir = cacheFriendlyDir(cwd);
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(path.join(dir, "actual-usage.jsonl"), JSON.stringify(entry) + "\n", "utf8");
    await generateCacheFriendlyReport(dir);
  } catch { /* logging and report generation must never break agent execution */ }
}
