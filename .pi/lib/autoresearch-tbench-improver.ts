// path: .pi/lib/autoresearch-tbench-improver.ts
// role: terminal-bench 失敗ログを自動改善向けの短い要約と prompt に変換する
// why: autoresearch-tbench が毎回同じ task 集合から根拠のある修正指示を作れるようにするため
// related: .pi/lib/autoresearch-tbench.ts, .pi/lib/pi-improvement.ts, tests/unit/lib/autoresearch-tbench-improver.test.ts

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

export interface AutoresearchTbenchFailureInsight {
  taskName: string;
  trialName: string;
  exceptionType: string;
  exceptionMessage: string;
  stderrExcerpt: string;
  stopReason: string | null;
  exitCode: number | null;
}

export interface AutoresearchTbenchFailureDigest {
  totalTrials: number;
  completedTrials: number;
  successCount: number;
  errorCount: number;
  meanReward: number;
  elapsedMs: number;
  topExceptionTypes: Array<{ name: string; count: number }>;
  failureInsights: AutoresearchTbenchFailureInsight[];
}

export interface AutoresearchTbenchImprovementPromptInput {
  taskNames: string[];
  bestScoreLine: string;
  lastScoreLine: string;
  failureDigest: AutoresearchTbenchFailureDigest | null;
  piImprovementBrief: string;
}

interface JobReportLike {
  n_total_trials?: unknown;
  started_at?: unknown;
  finished_at?: unknown;
  stats?: {
    n_trials?: unknown;
    n_errors?: unknown;
    evals?: Record<string, {
      n_trials?: unknown;
      n_errors?: unknown;
      metrics?: Array<{ mean?: unknown }>;
      reward_stats?: {
        reward?: Record<string, unknown>;
      };
    }>;
  };
}

interface TrialResultLike {
  task_name?: unknown;
  trial_name?: unknown;
  started_at?: unknown;
  finished_at?: unknown;
  agent_result?: {
    metadata?: {
      exitCode?: unknown;
      stopReason?: unknown;
      stderrLog?: unknown;
    };
  };
  exception_info?: {
    exception_type?: unknown;
    exception_message?: unknown;
  };
  verifier_result?: {
    rewards?: {
      reward?: unknown;
    };
  };
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return parsed;
}

function parseDurationMs(startedAt: unknown, finishedAt: unknown): number {
  if (typeof startedAt !== "string" || typeof finishedAt !== "string") {
    return 0;
  }

  const startedMs = Date.parse(startedAt);
  const finishedMs = Date.parse(finishedAt);
  if (!Number.isFinite(startedMs) || !Number.isFinite(finishedMs) || finishedMs < startedMs) {
    return 0;
  }

  return finishedMs - startedMs;
}

function getPrimaryEval(report: JobReportLike) {
  const evals = report.stats?.evals;
  if (!evals || typeof evals !== "object") {
    return null;
  }

  const firstKey = Object.keys(evals)[0];
  if (!firstKey) {
    return null;
  }

  return evals[firstKey] ?? null;
}

function normalizeBucketCount(bucket: unknown): number {
  if (!Array.isArray(bucket)) {
    return 0;
  }

  return bucket.filter((item) => typeof item === "string").length;
}

function cropLine(value: string, limit: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

function pickStderrExcerpt(stderrPath: string): string {
  if (!existsSync(stderrPath)) {
    return "";
  }

  const lines = readFileSync(stderrPath, "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const preferred = lines.find((line) => /(not found|fatal:|timeout|killed|error|failed|cannot|denied)/i.test(line));
  if (preferred) {
    return cropLine(preferred, 220);
  }

  return cropLine(lines.at(-1) ?? "", 220);
}

function listTrialDirectories(jobDir: string): string[] {
  if (!existsSync(jobDir)) {
    return [];
  }

  return readdirSync(jobDir)
    .map((entry) => join(jobDir, entry))
    .filter((entry) => {
      try {
        return statSync(entry).isDirectory();
      } catch {
        return false;
      }
    });
}

function readTrialResult(trialDir: string): TrialResultLike | null {
  const resultPath = join(trialDir, "result.json");
  if (!existsSync(resultPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(resultPath, "utf-8")) as TrialResultLike;
  } catch {
    return null;
  }
}

function summarizeFailureInsights(jobDir: string): AutoresearchTbenchFailureInsight[] {
  const insights: AutoresearchTbenchFailureInsight[] = [];

  for (const trialDir of listTrialDirectories(jobDir)) {
    const result = readTrialResult(trialDir);
    if (!result?.exception_info) {
      continue;
    }

    const metadata = result.agent_result?.metadata;
    const stderrPath = typeof metadata?.stderrLog === "string"
      ? metadata.stderrLog
      : join(trialDir, "agent", "pi-stderr.txt");

    insights.push({
      taskName: typeof result.task_name === "string" ? result.task_name : "unknown",
      trialName: typeof result.trial_name === "string" ? result.trial_name : "unknown",
      exceptionType: typeof result.exception_info.exception_type === "string"
        ? result.exception_info.exception_type
        : "unknown",
      exceptionMessage: cropLine(
        typeof result.exception_info.exception_message === "string"
          ? result.exception_info.exception_message
          : "",
        220,
      ),
      stderrExcerpt: pickStderrExcerpt(stderrPath),
      stopReason: typeof metadata?.stopReason === "string" ? metadata.stopReason : null,
      exitCode: Number.isFinite(Number(metadata?.exitCode)) ? Number(metadata?.exitCode) : null,
    });
  }

  return insights.slice(0, 6);
}

export function readAutoresearchTbenchFailureDigest(resultPath: string | null): AutoresearchTbenchFailureDigest | null {
  if (!resultPath || !existsSync(resultPath)) {
    return null;
  }

  const parsed = JSON.parse(readFileSync(resultPath, "utf-8")) as JobReportLike;
  const primaryEval = getPrimaryEval(parsed);
  const rewardBuckets = primaryEval?.reward_stats?.reward ?? {};
  const successCount = Object.entries(rewardBuckets).reduce((sum, [reward, bucket]) => {
    const rewardValue = Number(reward);
    if (!Number.isFinite(rewardValue) || rewardValue < 1) {
      return sum;
    }
    return sum + normalizeBucketCount(bucket);
  }, 0);

  const jobDir = dirname(resultPath);
  const failureInsights = summarizeFailureInsights(jobDir);
  const exceptionTypeCounts = failureInsights.reduce<Map<string, number>>((accumulator, insight) => {
    accumulator.set(insight.exceptionType, (accumulator.get(insight.exceptionType) ?? 0) + 1);
    return accumulator;
  }, new Map());

  return {
    totalTrials: toNumber(parsed.n_total_trials),
    completedTrials: Math.max(
      toNumber(primaryEval?.n_trials),
      toNumber(parsed.stats?.n_trials),
    ),
    successCount,
    errorCount: toNumber(primaryEval?.n_errors ?? parsed.stats?.n_errors),
    meanReward: toNumber(primaryEval?.metrics?.[0]?.mean),
    elapsedMs: parseDurationMs(parsed.started_at, parsed.finished_at),
    topExceptionTypes: Array.from(exceptionTypeCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 4),
    failureInsights,
  };
}

function formatFailureDigest(digest: AutoresearchTbenchFailureDigest | null): string {
  if (!digest) {
    return "No previous failure digest is available.";
  }

  const lines = [
    `score: success=${digest.successCount} completed=${digest.completedTrials}/${digest.totalTrials} mean_reward=${digest.meanReward.toFixed(4)} errors=${digest.errorCount} elapsed_ms=${digest.elapsedMs}`,
  ];

  if (digest.topExceptionTypes.length > 0) {
    lines.push(
      `top_exceptions: ${digest.topExceptionTypes.map((item) => `${item.name}(${item.count})`).join(", ")}`,
    );
  }

  if (digest.failureInsights.length > 0) {
    lines.push("", "top_failures:");
    for (const insight of digest.failureInsights) {
      const details = [
        `- ${insight.taskName}`,
        `exception=${insight.exceptionType}`,
      ];
      if (insight.exitCode !== null) {
        details.push(`exit=${insight.exitCode}`);
      }
      if (insight.stopReason) {
        details.push(`stop=${insight.stopReason}`);
      }
      lines.push(details.join(" "));
      if (insight.exceptionMessage) {
        lines.push(`  message: ${insight.exceptionMessage}`);
      }
      if (insight.stderrExcerpt) {
        lines.push(`  stderr: ${insight.stderrExcerpt}`);
      }
    }
  }

  return lines.join("\n");
}

export function buildAutoresearchTbenchImprovementPrompt(
  input: AutoresearchTbenchImprovementPromptInput,
): string {
  const digestBlock = formatFailureDigest(input.failureDigest);
  const improvementBrief = input.piImprovementBrief.trim() || "No additional pi improvement brief.";

  return [
    "You are running an automatic terminal-bench improvement iteration for the mekann repository.",
    "",
    "Goal:",
    "- Improve the fixed terminal-bench task set below.",
    "- Prefer changes that increase success_count or completed_trials.",
    "- If scores tie, lower elapsed time is better.",
    "",
    `Fixed tasks: ${input.taskNames.join(", ")}`,
    `Current best score: ${input.bestScoreLine}`,
    `Latest benchmark score: ${input.lastScoreLine}`,
    "",
    "Latest benchmark failure digest:",
    digestBlock,
    "",
    "Additional local improvement brief:",
    improvementBrief,
    "",
    "Rules:",
    "- Make one focused, high-confidence code change set.",
    "- Target the most shared root cause visible in the failure digest.",
    "- Keep mekann behavior intact. Do not remove core extensions just to game the benchmark.",
    "- Do not edit benchmark artifacts, .pi/autoresearch, .pi/benchmarks, .pi/runtime, .pi/logs, or generated result files.",
    "- Do not commit.",
    "- Do only minimal, fast verification for files you touched.",
    "- Stop after the code change and verification are done.",
    "",
    "Output behavior:",
    "- Apply the change directly.",
    "- Run the smallest useful verification command.",
    "- If no safe improvement is clear, make no code change and explain why in your final response.",
  ].join("\n");
}
