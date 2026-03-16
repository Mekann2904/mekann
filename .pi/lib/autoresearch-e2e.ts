/**
 * path: .pi/lib/autoresearch-e2e.ts
 * role: autoresearch 形式の e2e 実験結果を正規化し、比較と判定を行う
 * why: mekann の e2e 最適化ループで keep/reset 判断を機械的に安定させるため
 * related: scripts/autoresearch-e2e.ts, tests/unit/lib/autoresearch-e2e.test.ts, tests/e2e/README.md, tests/e2e/STRATEGY.md
 */

/**
 * 行動メトリクスの集計サマリー
 * @summary 実験期間中のLLM実行メトリクスを集計したもの
 */
export interface BehaviorMetricsSummary {
  /** 分析対象のレコード数 */
  recordCount: number;
  /** 平均プロンプトトークン数 */
  avgPromptTokens: number;
  /** 平均出力トークン数 */
  avgOutputTokens: number;
  /** 平均品質スコア（0.0-1.0） */
  avgQualityScore: number;
  /** 平均実行時間（ms） */
  avgExecutionMs: number;
  /** 合計トークン数（プロンプト+出力） */
  totalTokens: number;
}

export interface AutoresearchE2EScore {
  failed: number;
  passed: number;
  total: number;
  durationMs: number;
  /** 行動メトリクス（オプション） */
  behaviorMetrics?: BehaviorMetricsSummary;
}

export interface AutoresearchE2EReportSummary {
  score: AutoresearchE2EScore;
  raw: unknown;
}

export type AutoresearchE2EOutcome =
  | "baseline"
  | "improved"
  | "equal"
  | "regressed"
  | "crash"
  | "timeout";

interface VitestJsonLike {
  numFailedTests?: unknown;
  numPassedTests?: unknown;
  numTotalTests?: unknown;
  success?: unknown;
  testResults?: Array<{
    assertionResults?: Array<{ status?: unknown; duration?: unknown }>;
  }>;
}

function toNonNegativeInteger(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.trunc(parsed);
}

function collectDurationFromResults(report: VitestJsonLike): number {
  let durationMs = 0;
  for (const suite of report.testResults ?? []) {
    for (const assertion of suite.assertionResults ?? []) {
      durationMs += toNonNegativeInteger(assertion.duration);
    }
  }
  return durationMs;
}

export function parseVitestJsonReport(raw: string): AutoresearchE2EReportSummary {
  const parsed = JSON.parse(raw) as VitestJsonLike;
  const failed = toNonNegativeInteger(parsed.numFailedTests);
  const passed = toNonNegativeInteger(parsed.numPassedTests);
  const total = toNonNegativeInteger(parsed.numTotalTests) || failed + passed;
  const durationMs = collectDurationFromResults(parsed);

  return {
    score: {
      failed,
      passed,
      total,
      durationMs,
    },
    raw: parsed,
  };
}

export function compareAutoresearchScores(
  candidate: AutoresearchE2EScore,
  incumbent: AutoresearchE2EScore,
): number {
  if (candidate.failed !== incumbent.failed) {
    return candidate.failed < incumbent.failed ? 1 : -1;
  }

  if (candidate.passed !== incumbent.passed) {
    return candidate.passed > incumbent.passed ? 1 : -1;
  }

  if (candidate.total !== incumbent.total) {
    return candidate.total > incumbent.total ? 1 : -1;
  }

  if (candidate.durationMs !== incumbent.durationMs) {
    return candidate.durationMs < incumbent.durationMs ? 1 : -1;
  }

  return 0;
}

export function determineAutoresearchOutcome(
  candidate: AutoresearchE2EScore,
  incumbent?: AutoresearchE2EScore,
): AutoresearchE2EOutcome {
  if (!incumbent) {
    return "baseline";
  }

  const comparison = compareAutoresearchScores(candidate, incumbent);
  if (comparison > 0) {
    return "improved";
  }
  if (comparison < 0) {
    return "regressed";
  }
  return "equal";
}

export function formatAutoresearchScore(score: AutoresearchE2EScore): string {
  const base = `failed=${score.failed} passed=${score.passed} total=${score.total} duration_ms=${score.durationMs}`;
  if (score.behaviorMetrics) {
    const bm = score.behaviorMetrics;
    return `${base} records=${bm.recordCount} avg_quality=${bm.avgQualityScore.toFixed(2)} total_tokens=${bm.totalTokens}`;
  }
  return base;
}
