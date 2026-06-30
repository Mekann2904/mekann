// autoresearch/queryEvaluation.ts
// 静的クエリ評価モジュール: ユーザの自然文クエリを autoresearch の実験契約に変換できるか評価する
// LLM API 呼び出しは行わない純粋関数

// ─── Export する型 ────────────────────────────────────────────

export type MetricDirection = "lower" | "higher" | "unknown";

export type QueryEvaluationDecision =
  | "ready_for_run"
  | "ready_for_init"
  | "needs_metric_design"
  | "needs_command"
  | "needs_metric_extraction"
  | "needs_checks_policy"
  | "needs_rewrite"
  | "reject";

export type MeasurementMethod =
  | "wall_clock"
  | "stdout_metric"
  | "report_file"
  | "unknown";

export type ChecksPolicy =
  | "explicit_command"
  | "autoresearch_checks_sh"
  | "not_specified";

export interface ResearchContractDraft {
  objective: string;
  targetScope: string[];
  primaryMetric: {
    name: string | null;
    unit: string | null;
    direction: MetricDirection;
    source: "stdout" | "file" | "test-report" | "custom" | "unknown";
    measurementMethod: MeasurementMethod;
    extractionRule: string | null;
    extractionConfidence: number;
  };
  benchmarkCommand: string | null;
  checksCommand: string | null;
  checksPolicy: ChecksPolicy;
  constraints: string[];
  stopCondition: string | null;
  missingFields: string[];
}

export interface Readiness {
  initReady: boolean;
  runReady: boolean;
  checksReady: boolean;
  metricExtractionReady: boolean;
  logReady: boolean;
}

export interface StaticNumericScores {
  completeness: number;
  measurability: number;
  commandReadiness: number;
  scopeClarity: number;
  safety: number;
  reproducibility: number;
  readiness: number;
}

export interface QueryEvaluation {
  decision: QueryEvaluationDecision;
  readiness: Readiness;
  scores: StaticNumericScores;
  contractDraft: ResearchContractDraft;
  blockingIssues: string[];
  warnings: string[];
  ambiguityFlags: string[];
  riskFlags: string[];
  suggestedRewrite: string;
  clarifyingQuestions: string[];
}

import {
  buildAmbiguityFlags,
  buildBlockingIssues,
  buildClarifyingQuestions,
  buildSuggestedRewrite,
  buildWarnings,
  computeReadiness,
  computeScores,
  decide,
  detectChecksPolicy,
  detectMeasurementMethod,
  detectMetricNameAndDirection,
  detectRiskFlags,
  detectScope,
  extractCommands,
  findMissingFields,
  inferUnitFromMetricName,
  isBroadQuery,
  sourceFromMeasurementMethod,
} from "./pipeline.js";
import { messageText } from "./messages.js";

// ─── Export する関数 ──────────────────────────────────────────

export function evaluateQueryStatically(query: string): QueryEvaluation {
  const trimmed = query.trim();

  // ── 入力処理: 空文字または長さ < 2 ──
  if (trimmed.length < 2) {
    const emptyDraft: ResearchContractDraft = {
      objective: "",
      targetScope: [],
      primaryMetric: {
        name: null,
        unit: null,
        direction: "unknown",
        source: "unknown",
        measurementMethod: "unknown",
        extractionRule: null,
        extractionConfidence: 0,
      },
      benchmarkCommand: null,
      checksCommand: null,
      checksPolicy: "not_specified",
      constraints: [],
      stopCondition: null,
      missingFields: [
        "objective",
        "primaryMetric.name",
        "primaryMetric.direction",
        "benchmarkCommand",
        "metricExtraction",
        "checksPolicy",
      ],
    };

    const emptyReadiness: Readiness = {
      initReady: false,
      runReady: false,
      checksReady: false,
      metricExtractionReady: false,
      logReady: false,
    };

    const emptyScores: StaticNumericScores = {
      completeness: 0,
      measurability: 0,
      commandReadiness: 0,
      scopeClarity: 0,
      safety: 1,
      reproducibility: 0,
      readiness: 0,
    };

    return {
      decision: "needs_rewrite",
      readiness: emptyReadiness,
      scores: emptyScores,
      contractDraft: emptyDraft,
      blockingIssues: [messageText("block.empty_objective")],
      warnings: [messageText("warn.checks_unspecified"), messageText("warn.scope_unspecified")],
      ambiguityFlags: [messageText("ambig.scope_unknown")],
      riskFlags: [],
      suggestedRewrite: messageText("rewrite.needs_metric_design"),
      clarifyingQuestions: [
        messageText("q.metric_priority"),
        messageText("q.benchmark_command"),
        messageText("q.scope"),
      ],
    };
  }

  // ── Risk detection ──
  const riskFlags = detectRiskFlags(trimmed);
  const isDangerous = riskFlags.length > 0;

  // ── Objective ──
  const objective = isDangerous
    ? ""
    : trimmed.length > 120
      ? trimmed.substring(0, 117) + "..."
      : trimmed;

  // ── Scope detection ──
  const scope = detectScope(trimmed);

  // ── Command extraction ──
  const { benchmarkCommand, checksCommand } = extractCommands(trimmed);

  // ── Checks policy ──
  const checksPolicy = detectChecksPolicy(trimmed, checksCommand);

  // ── Metric name & direction ──
  const metricInfo = detectMetricNameAndDirection(trimmed, benchmarkCommand !== null);

  // ── Measurement method ──
  const measurementInfo = detectMeasurementMethod(trimmed, metricInfo.name);

  // ── Broad query detection ──
  const broad = isBroadQuery(trimmed);
  const effectiveBroad = broad && !metricInfo.name && !benchmarkCommand && scope.length === 0;

  // ── Readiness gate ──
  const readiness = computeReadiness(
    objective,
    metricInfo.name,
    metricInfo.direction,
    benchmarkCommand,
    measurementInfo.metricExtractionReady,
    checksPolicy,
    riskFlags
  );

  // ── Missing fields ──
  const missingFields = findMissingFields(
    objective,
    metricInfo.name,
    metricInfo.direction,
    benchmarkCommand,
    measurementInfo.metricExtractionReady,
    checksPolicy
  );

  // ── Decision ──
  const decision = decide(
    riskFlags,
    objective,
    effectiveBroad,
    metricInfo.name,
    metricInfo.direction,
    benchmarkCommand,
    measurementInfo.metricExtractionReady,
    readiness.checksReady,
    readiness
  );

  // ── Scores ──
  const scores = computeScores(
    missingFields,
    metricInfo.name,
    metricInfo.direction,
    measurementInfo.metricExtractionReady,
    benchmarkCommand,
    readiness.checksReady,
    scope,
    riskFlags,
    effectiveBroad
  );

  // ── Contract draft ──
  const contractDraft: ResearchContractDraft = {
    objective,
    targetScope: scope,
    primaryMetric: {
      name: metricInfo.name,
      unit: metricInfo.unit ?? inferUnitFromMetricName(metricInfo.name),
      direction: metricInfo.direction,
      source: sourceFromMeasurementMethod(measurementInfo.measurementMethod),
      measurementMethod: measurementInfo.measurementMethod,
      extractionRule: measurementInfo.extractionRule,
      extractionConfidence: measurementInfo.extractionConfidence,
    },
    benchmarkCommand,
    checksCommand,
    checksPolicy,
    constraints: [],
    stopCondition: null,
    missingFields,
  };

  // ── Blocking issues ──
  const blockingIssues = buildBlockingIssues(
    decision, riskFlags,
    objective, metricInfo.name, metricInfo.direction,
    benchmarkCommand, measurementInfo.metricExtractionReady, checksPolicy
  );

  // ── Warnings ──
  const warnings = buildWarnings(checksPolicy, scope);

  // ── Ambiguity flags ──
  const ambiguityFlags = buildAmbiguityFlags(effectiveBroad, metricInfo.name, scope);

  // ── Suggested rewrite ──
  const suggestedRewrite = buildSuggestedRewrite(
    decision, effectiveBroad, metricInfo.name, metricInfo.direction,
    benchmarkCommand, measurementInfo.measurementMethod,
    measurementInfo.metricExtractionReady, checksPolicy
  );

  // ── Clarifying questions ──
  const clarifyingQuestions = buildClarifyingQuestions(
    metricInfo.name, benchmarkCommand, scope, effectiveBroad,
    measurementInfo.metricExtractionReady, checksPolicy
  );

  return {
    decision,
    readiness,
    scores,
    contractDraft,
    blockingIssues,
    warnings,
    ambiguityFlags,
    riskFlags,
    suggestedRewrite,
    clarifyingQuestions,
  };
}
