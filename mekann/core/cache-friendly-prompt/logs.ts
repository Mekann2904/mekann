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

// ─── Retention (bounded logs: issue #92) ────────────────────────────
//
// `requests.jsonl` and `actual-usage.jsonl` are append-only and previously
// grew without bound (issue #92: 77MB / 18MB on disk). The context-ledger
// bounds its `events.v2.jsonl` with rotation into `.1`/`.2` generations that
// readers merge on read. The cache-friendly report, by contrast, only ever
// reads the *current* log file (see report.ts `generateCacheFriendlyReport`),
// so rotation would leave dead `.1` files on disk while doing nothing for the
// report. We therefore prune in place: when a file crosses the byte trigger,
// rewrite it to keep only the most recent `retentionMaxRows` rows. Because
// prune runs before report generation on every append, the report always
// scans exactly the retained window (acceptance criterion #3).
//
// `summary.json` and the SVG/MD report artifacts are overwritten on every
// report cycle, so they are inherently bounded and intentionally excluded.

const DEFAULT_RETENTION_MAX_BYTES = 10 * 1024 * 1024; // 10 MB trigger per file
const DEFAULT_RETENTION_MAX_ROWS = 2000; // keep this many most-recent rows when pruning
const DEFAULT_RETENTION_CHECK_INTERVAL_MS = 30_000; // throttle prune checks per file

let retentionMaxBytes = DEFAULT_RETENTION_MAX_BYTES;
let retentionMaxRows = DEFAULT_RETENTION_MAX_ROWS;
let retentionCheckIntervalMs = DEFAULT_RETENTION_CHECK_INTERVAL_MS;
const lastRetentionCheckByFile = new Map<string, number>();

export interface CacheFriendlyLogRetentionOptions {
  /** Max bytes per log file before pruning (per file). Default 10 MB. */
  retentionMaxBytes?: number;
  /** Most-recent rows kept after pruning. Default 2000. */
  retentionMaxRows?: number;
  /** Min ms between prune checks for a given file. 0 = check on every append. Default 30_000. */
  retentionCheckIntervalMs?: number;
}

export function configureCacheFriendlyLogRetention(options: CacheFriendlyLogRetentionOptions = {}): void {
  retentionMaxBytes = positiveFiniteNumber(options.retentionMaxBytes, retentionMaxBytes);
  retentionMaxRows = positiveFiniteInt(options.retentionMaxRows, retentionMaxRows);
  retentionCheckIntervalMs = nonNegativeFiniteInt(options.retentionCheckIntervalMs, retentionCheckIntervalMs);
}

/** Test helper: forget per-file prune timers so the next append re-checks. */
export function resetCacheFriendlyLogRetentionTimersForTests(): void {
  lastRetentionCheckByFile.clear();
}

function positiveFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function positiveFiniteInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function nonNegativeFiniteInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
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

/** Rewrite `filePath` to its most-recent `retentionMaxRows` rows once it crosses the byte trigger. */
async function pruneLogIfNeeded(filePath: string): Promise<void> {
  const now = Date.now();
  const last = lastRetentionCheckByFile.get(filePath) ?? 0;
  if (now - last < retentionCheckIntervalMs) return;
  lastRetentionCheckByFile.set(filePath, now);
  try {
    const stat = await fs.stat(filePath).catch(() => undefined);
    if (!stat || stat.size <= retentionMaxBytes) return;
    const raw = await fs.readFile(filePath, "utf8");
    const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
    // Under the row cap: shrinking would only lose recent data, so leave it.
    // (A handful of oversized rows can't be byte-bounded without dropping
    // recent entries; retentionMaxRows is the user-tunable hard bound there.)
    if (lines.length <= retentionMaxRows) return;
    const kept = lines.slice(-retentionMaxRows);
    await fs.writeFile(filePath, `${kept.join("\n")}\n`, "utf8");
  } catch {
    // retention must never break logging or report generation
  }
}

export async function appendCacheFriendlyLog(cwd: string, entry: CacheFriendlyRequestLog): Promise<void> {
  try {
    const dir = cacheFriendlyDir(cwd);
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, "requests.jsonl");
    await fs.appendFile(filePath, JSON.stringify(entry) + "\n", "utf8");
    await pruneLogIfNeeded(filePath);
    await maybeGenerateReport(dir);
  } catch { /* logging and report generation must never break agent execution */ }
}

export async function appendActualUsageLog(cwd: string, entry: ActualUsageLog): Promise<void> {
  try {
    const dir = cacheFriendlyDir(cwd);
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, "actual-usage.jsonl");
    await fs.appendFile(filePath, JSON.stringify(entry) + "\n", "utf8");
    await pruneLogIfNeeded(filePath);
    await maybeGenerateReport(dir);
  } catch { /* logging and report generation must never break agent execution */ }
}
