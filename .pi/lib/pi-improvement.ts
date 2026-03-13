/**
 * path: .pi/lib/pi-improvement.ts
 * role: 実運転の失敗傾向を集約し、次ターンに返す改善ブリーフとレポートを生成する
 * why: pi を実際に回した観測結果を、mekann 拡張の精度改善とフロー修復へすぐ戻すため
 * related: .pi/extensions/pi-improvement.ts, .pi/lib/workspace-verification.ts, .pi/extensions/agent-usage-tracker.ts, tests/unit/lib/pi-improvement.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  loadWorkspaceVerificationState,
  type WorkspaceVerificationState,
} from "./workspace-verification.js";

interface UsageEventRecord {
  extension?: string;
  featureName?: string;
  status?: string;
  error?: string;
  timestamp?: string;
}

interface UsageStatsState {
  updatedAt?: string;
  events?: UsageEventRecord[];
}

export interface PiImprovementFocus {
  title: string;
  detail: string;
}

export interface PiImprovementReport {
  generatedAt: string;
  cwd: string;
  health: "stable" | "warning" | "critical";
  summary: string;
  focuses: PiImprovementFocus[];
  verification: {
    dirty: boolean;
    running: boolean;
    failureSteps: string[];
    lastErrorSummary: string[];
  };
  failingFeatures: Array<{
    feature: string;
    count: number;
    lastError: string | null;
  }>;
}

const USAGE_STATS_PATH = join(".pi", "analytics", "agent-usage-stats.json");

function readUsageStats(cwd: string): UsageStatsState {
  const path = resolve(cwd, USAGE_STATS_PATH);
  if (!existsSync(path)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(path, "utf-8")) as UsageStatsState;
  } catch {
    return {};
  }
}

function summarizeVerificationState(state: WorkspaceVerificationState): {
  failureSteps: string[];
  lastErrorSummary: string[];
} {
  const failureSteps = (state.lastRun?.stepResults ?? [])
    .filter((item) => !item.success && !item.skipped)
    .map((item) => item.step);

  const lastErrorSummary = (state.lastRun?.stepResults ?? [])
    .filter((item) => !item.success && !item.skipped && item.error)
    .slice(0, 3)
    .map((item) => {
      const line = item.error?.split("\n").find((entry) => entry.trim().length > 0) ?? "";
      return `${item.step}: ${line}`.trim();
    })
    .filter((item) => item.length > 0);

  return {
    failureSteps,
    lastErrorSummary,
  };
}

function collectFailingFeatures(cwd: string): PiImprovementReport["failingFeatures"] {
  const stats = readUsageStats(cwd);
  const failures = new Map<string, { count: number; lastError: string | null }>();

  for (const event of stats.events ?? []) {
    if (event.status !== "error") {
      continue;
    }

    const feature = [event.extension, event.featureName].filter(Boolean).join("/");
    if (!feature) {
      continue;
    }

    const current = failures.get(feature) ?? { count: 0, lastError: null };
    current.count += 1;
    if (event.error) {
      current.lastError = event.error;
    }
    failures.set(feature, current);
  }

  return Array.from(failures.entries())
    .map(([feature, value]) => ({
      feature,
      count: value.count,
      lastError: value.lastError,
    }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);
}

function buildFocuses(
  verification: ReturnType<typeof summarizeVerificationState>,
  failingFeatures: PiImprovementReport["failingFeatures"],
  state: WorkspaceVerificationState,
): PiImprovementFocus[] {
  const focuses: PiImprovementFocus[] = [];

  if (verification.failureSteps.length > 0) {
    focuses.push({
      title: "workspace verification failure",
      detail: `Failing steps: ${verification.failureSteps.join(", ")}`,
    });
  }

  if (state.replanRequired) {
    focuses.push({
      title: "repair strategy drift",
      detail: state.replanReason ?? "Repeated verification failures require a new repair plan.",
    });
  }

  if (state.pendingReviewArtifact) {
    focuses.push({
      title: "review artifact pending",
      detail: "Latest verification needs a review artifact acknowledgement before completion.",
    });
  }

  for (const feature of failingFeatures.slice(0, 2)) {
    focuses.push({
      title: `failing feature: ${feature.feature}`,
      detail: feature.lastError ?? `${feature.count} recent failures recorded.`,
    });
  }

  if (focuses.length === 0 && state.dirty) {
    focuses.push({
      title: "verification stale",
      detail: "Workspace is dirty. Re-run verification before trusting the next change.",
    });
  }

  return focuses.slice(0, 4);
}

export function collectPiImprovementReport(cwd: string): PiImprovementReport {
  const generatedAt = new Date().toISOString();
  const verificationState = loadWorkspaceVerificationState(cwd);
  const verification = summarizeVerificationState(verificationState);
  const failingFeatures = collectFailingFeatures(cwd);
  const focuses = buildFocuses(verification, failingFeatures, verificationState);

  const health: PiImprovementReport["health"] = verification.failureSteps.length > 0 || verificationState.replanRequired
    ? "critical"
    : verificationState.dirty || failingFeatures.length > 0 || verificationState.pendingReviewArtifact
      ? "warning"
      : "stable";

  const summary = health === "critical"
    ? "Recent pi runs show hard failures. Fix the failing flow before adding more behavior."
    : health === "warning"
      ? "Recent pi runs show soft drift. Tighten the flow before trusting the next iteration."
      : "No recent critical signals were found. Keep the loop small and keep verifying.";

  return {
    generatedAt,
    cwd,
    health,
    summary,
    focuses,
    verification: {
      dirty: verificationState.dirty,
      running: verificationState.running,
      failureSteps: verification.failureSteps,
      lastErrorSummary: verification.lastErrorSummary,
    },
    failingFeatures,
  };
}

export function renderPiImprovementBrief(report: PiImprovementReport): string {
  if (report.health === "stable" && report.focuses.length === 0) {
    return "";
  }

  const lines = [
    "# Pi Improvement Brief",
    "",
    `health: ${report.health}`,
    report.summary,
  ];

  for (const focus of report.focuses) {
    lines.push(`- ${focus.title}: ${focus.detail}`);
  }

  return lines.join("\n");
}

export function renderPiImprovementReport(report: PiImprovementReport): string {
  const lines = [
    "# Pi Improvement Report",
    "",
    `generated_at: ${report.generatedAt}`,
    `cwd: ${report.cwd}`,
    `health: ${report.health}`,
    "",
    report.summary,
    "",
    "## Current Focus",
  ];

  if (report.focuses.length === 0) {
    lines.push("- No urgent focus found.");
  } else {
    for (const focus of report.focuses) {
      lines.push(`- ${focus.title}: ${focus.detail}`);
    }
  }

  lines.push("", "## Workspace Verification");
  lines.push(`- dirty: ${report.verification.dirty}`);
  lines.push(`- running: ${report.verification.running}`);
  lines.push(`- failing_steps: ${report.verification.failureSteps.join(", ") || "-"}`);

  if (report.verification.lastErrorSummary.length > 0) {
    lines.push("- last_errors:");
    for (const line of report.verification.lastErrorSummary) {
      lines.push(`  - ${line}`);
    }
  }

  lines.push("", "## Failing Features");
  if (report.failingFeatures.length === 0) {
    lines.push("- No recent tool or agent failures were recorded.");
  } else {
    for (const feature of report.failingFeatures) {
      lines.push(`- ${feature.feature}: ${feature.count} failures`);
      if (feature.lastError) {
        lines.push(`  last_error: ${feature.lastError}`);
      }
    }
  }

  return lines.join("\n");
}

export function writePiImprovementReport(cwd: string, outputPath?: string): string {
  const report = renderPiImprovementReport(collectPiImprovementReport(cwd));
  const targetPath = resolve(cwd, outputPath ?? ".pi/reports/pi-improvement-report.md");
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, `${report}\n`, "utf-8");
  return targetPath;
}
