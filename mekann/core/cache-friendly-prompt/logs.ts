import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CacheFriendlyRequestLog } from "../prompt-core/index.js";
import type { ActualUsageLog } from "./actualUsage.js";
import { generateCacheFriendlyReport } from "./report.js";

export type ReportGenerationMode = "immediate" | "debounce" | "off";

const DEFAULT_REPORT_DEBOUNCE_MS = 1000;
let reportMode: ReportGenerationMode = "debounce";
let reportDebounceMs = DEFAULT_REPORT_DEBOUNCE_MS;
const pendingReports = new Map<string, NodeJS.Timeout>();

export function configureCacheFriendlyReports(options: { mode?: ReportGenerationMode; debounceMs?: number } = {}): void {
  reportMode = options.mode ?? reportMode;
  reportDebounceMs = typeof options.debounceMs === "number" && Number.isFinite(options.debounceMs) && options.debounceMs >= 0 ? options.debounceMs : reportDebounceMs;
}

function cacheFriendlyDir(cwd: string): string {
  return path.join(cwd, ".pi-cache-friendly");
}

async function maybeGenerateReport(dir: string): Promise<void> {
  if (reportMode === "off") return;
  if (reportMode === "immediate") {
    await generateCacheFriendlyReport(dir);
    return;
  }
  const existing = pendingReports.get(dir);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    pendingReports.delete(dir);
    void generateCacheFriendlyReport(dir).catch(() => undefined);
  }, reportDebounceMs);
  timer.unref?.();
  pendingReports.set(dir, timer);
}

export async function appendCacheFriendlyLog(cwd: string, entry: CacheFriendlyRequestLog): Promise<void> {
  try {
    const dir = cacheFriendlyDir(cwd);
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(path.join(dir, "requests.jsonl"), JSON.stringify(entry) + "\n", "utf8");
    await maybeGenerateReport(dir);
  } catch { /* logging and report generation must never break agent execution */ }
}

export async function appendActualUsageLog(cwd: string, entry: ActualUsageLog): Promise<void> {
  try {
    const dir = cacheFriendlyDir(cwd);
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(path.join(dir, "actual-usage.jsonl"), JSON.stringify(entry) + "\n", "utf8");
    await maybeGenerateReport(dir);
  } catch { /* logging and report generation must never break agent execution */ }
}
