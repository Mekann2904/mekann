import type {
  ChecksPolicy,
  MeasurementMethod,
  MetricDirection,
  QueryEvaluationDecision,
  Readiness,
  StaticNumericScores,
} from "./evaluate.js";
import { applyTextRules, BROAD_QUERY_PATTERNS, firstMetricInference, RISK_RULES, SCOPE_RULES } from "./rules.js";
import {
  CHECKS_COMMAND_PATTERNS,
  COMMAND_PATTERNS,
  detectChecksPolicyText,
  detectInternalLatency,
  detectReportFile,
  detectStdoutMetric,
  detectWallClock,
  UNKNOWN_MEASUREMENT,
} from "./measurementRules.js";

// ─── 内部ヘルパー ─────────────────────────────────────────────

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

// ── Risk detection ────────────────────────────────────────────

// 秘密情報・本番環境の検出語彙。ASCII 系は `\b` 境界、CJK 系は substring のみ
// (`\b` は ASCII 境界なので「本番の秘密」のように非 ASCII 同士に挟まれた日本語
//  単語の境界を検出できず、リスク検出が抜ける — issue #147)。
const SECRET_TERMS =
  /\b(?:secret|token|api\s*key|password)\b|秘密|認証情報|シークレット|トークン|パスワード|api\s*キー|秘密鍵/i;
const LEAK_ACTIONS =
  /\b(?:upload|post|print|echo|show|dump|reveal|expose)\b|表示|送信|出力|公開|吐き?出|見せ|印刷|書き出|転送/i;  // 吐出(としゅつ)・吐き出(はきだ)し両方を許容
const PROD_TERMS = /\b(?:production|prod)\b|本番|商用環境?|プロダクション/i;
const DESTRUCTIVE_ACTIONS =
  /\b(?:update|delete|write|drop|alter|truncate|erase|clear)\b|変更|削除|書き込|消去|破棄|初期化|落と[すし]/i;

export function detectRiskFlags(query: string): string[] {
  const q = query.toLowerCase();
  const flags = applyTextRules(q, RISK_RULES);

  if (SECRET_TERMS.test(q) && LEAK_ACTIONS.test(q)) {
    flags.push("秘密情報の漏洩リスク");
  }
  if (PROD_TERMS.test(q) && DESTRUCTIVE_ACTIONS.test(q)) {
    flags.push("本番環境への破壊的変更");
  }

  return flags;
}

// ── Scope detection ───────────────────────────────────────────

export function detectScope(query: string): string[] {
  return [...new Set(applyTextRules(query.toLowerCase(), SCOPE_RULES))];
}

// ── Direction inference from metric name ────────────────────

function inferDirectionFromMetricName(name: string | null): MetricDirection {
  if (!name) return "unknown";

  // lower 系 (negative): error_rate, failure_rate 等を先に判定
  if (/(error_rate|failure_rate|crash_rate|flaky_rate|violation_rate|defect_rate|bug_rate)/i.test(name)) {
    return "lower";
  }
  if (/(error_count|failure_count|violation_count|crash_count|flaky_count|defect_count|bug_count|errors?|failures?|violations?)/i.test(name)) {
    return "lower";
  }
  if (/(duration|latency|time|seconds|sec|_ms$|\bms\b|cost|memory|size)/i.test(name)) {
    return "lower";
  }

  // higher 系 (positive): success / pass / coverage / score 等
  if (/(success_count|pass_count|passed_count|successes|passes)/i.test(name)) {
    return "higher";
  }
  if (/(success_rate|pass_rate|win_rate|coverage|accuracy|score)/i.test(name)) {
    return "higher";
  }

  // rate / ratio / count 単体は方向不明（ドメイン依存）
  if (/(rate|ratio|count)/i.test(name)) {
    return "unknown";
  }

  return "unknown";
}

// ── Metric name & direction detection ─────────────────────────

function detectExplicitMetricName(query: string): string | null {
  const patterns = [
    /metric\s+is\s+([\w.-]+)/i,
    /metric\s+は\s+([\w.-]+)/,
    /指標は\s+([\w.-]+)/,
    /主指標は\s+([\w.-]+)/,
  ];
  for (const p of patterns) {
    const m = query.match(p);
    if (m) return m[1];
  }
  return null;
}

export interface MetricNameInfo {
  name: string | null;
  unit: string | null;
  direction: MetricDirection;
}

export function detectMetricNameAndDirection(
  query: string,
  hasCommand: boolean
): MetricNameInfo {
  const q = query.toLowerCase();
  const explicitName = detectExplicitMetricName(query);

  let name: string | null = explicitName;
  let unit: string | null = null;
  let direction: MetricDirection = "unknown";

  if (!name) {
    const inferred = firstMetricInference(q);
    if (inferred) {
      name = inferred.name;
      unit = inferred.unit;
      direction = inferred.direction;
    }
  }

  // Direction の明示検出
  if (/(lower\s+is\s+better|小さいほど|短縮|減ら|削減|\blower\b)/.test(q)) {
    direction = "lower";
  } else if (/(higher\s+is\s+better|大きいほど|上げ|\bhigher\b)/.test(q)) {
    direction = "higher";
  }

  // 明示 metric name がある場合、direction がまだ unknown なら metricName 由来 → キーワードの順で推定
  if (explicitName && direction === "unknown") {
    const inferredFromName = inferDirectionFromMetricName(explicitName);
    if (inferredFromName !== "unknown") {
      direction = inferredFromName;
    } else if (/(速く|高速化|latency|\btime\b|duration|\bms\b|\bsec\b|秒|実行時間|短縮|減ら|削減|小さい|lower)/.test(q)) {
      direction = "lower";
    } else if (/(上げ|大きい|高い|higher|向上)/.test(q)) {
      direction = "higher";
    }
  }

  return { name, unit, direction };
}

// ── Measurement method detection ──────────────────────────────

export interface MeasurementInfo {
  measurementMethod: MeasurementMethod;
  extractionRule: string | null;
  extractionConfidence: number;
  metricExtractionReady: boolean;
}

// ── Unit inference from metric name ───────────────────────────

export function inferUnitFromMetricName(name: string | null): string | null {
  if (!name) return null;
  // _ms / ms を先にチェック（latency_ms 等の誤判定防止）
  if (/\bms\b|_ms$/i.test(name)) return "ms";
  if (/(duration|elapsed|runtime|wall_clock|time|seconds|sec)/i.test(name)) return "seconds";
  if (/(coverage|rate|ratio|accuracy|percent)/i.test(name)) return "%";
  if (/(error_count|failure_count|violation_count|errors?|failures?|violations?)/i.test(name)) return "count";
  return null;
}

export function sourceFromMeasurementMethod(
  method: MeasurementMethod
): "stdout" | "file" | "test-report" | "custom" | "unknown" {
  switch (method) {
    case "wall_clock": return "custom";
    case "stdout_metric": return "stdout";
    case "report_file": return "file";
    default: return "unknown";
  }
}

export function detectMeasurementMethod(
  query: string,
  metricName: string | null
): MeasurementInfo {
  return detectStdoutMetric(query, metricName)
    ?? detectInternalLatency(metricName)
    ?? detectWallClock(query, metricName)
    ?? detectReportFile(query)
    ?? UNKNOWN_MEASUREMENT;
}

// ── Command extraction ────────────────────────────────────────

export function extractCommands(
  query: string
): { benchmarkCommand: string | null; checksCommand: string | null } {
  const backtickCommands = [...query.matchAll(/`([^`]+)`/g)].map((m) => m[1]);

  const additionalCommands: string[] = [];
  for (const pat of COMMAND_PATTERNS) {
    const matches = [...query.matchAll(pat)];
    for (const m of matches) {
      additionalCommands.push(m[1].trim());
    }
  }

  const checksCandidates: string[] = [];
  for (const pat of CHECKS_COMMAND_PATTERNS) {
    const matches = [...query.matchAll(pat)];
    for (const m of matches) {
      checksCandidates.push((m[1] || m[0]).trim());
    }
  }

  const allCommands = [...backtickCommands, ...additionalCommands];
  const uniqueCommands = [...new Set(allCommands)];

  let benchmarkCommand: string | null = null;
  let checksCommand: string | null = null;

  if (backtickCommands.length > 0) {
    const nonChecksBacktick = backtickCommands.filter(
      (c) => !checksCandidates.includes(c)
    );
    benchmarkCommand = nonChecksBacktick[0] ?? null;
  } else if (uniqueCommands.length > 0) {
    const nonChecksCommands = uniqueCommands.filter(
      (c) => !checksCandidates.includes(c)
    );
    benchmarkCommand = nonChecksCommands[0] ?? null;
  }

  if (checksCandidates.length > 0) {
    checksCommand = checksCandidates[0];
  }

  return { benchmarkCommand, checksCommand };
}

// ── Checks policy detection ───────────────────────────────────

export function detectChecksPolicy(
  query: string,
  checksCommand: string | null
): ChecksPolicy {
  return detectChecksPolicyText(query, checksCommand);
}

// ── Broad query detection ─────────────────────────────────────

export function isBroadQuery(query: string): boolean {
  return BROAD_QUERY_PATTERNS.some((pattern) => pattern.test(query));
}

// ── Missing fields ────────────────────────────────────────────

export function findMissingFields(
  objective: string,
  metricName: string | null,
  metricDirection: MetricDirection,
  benchmarkCommand: string | null,
  metricExtractionReady: boolean,
  checksPolicy: ChecksPolicy
): string[] {
  const missing: string[] = [];
  if (!objective) missing.push("objective");
  if (!metricName) missing.push("primaryMetric.name");
  if (metricDirection === "unknown") missing.push("primaryMetric.direction");
  if (!benchmarkCommand) missing.push("benchmarkCommand");
  if (!metricExtractionReady) missing.push("metricExtraction");
  if (checksPolicy === "not_specified") missing.push("checksPolicy");
  return missing;
}

// ── Readiness gate ────────────────────────────────────────────

export function computeReadiness(
  objective: string,
  metricName: string | null,
  metricDirection: MetricDirection,
  benchmarkCommand: string | null,
  metricExtractionReady: boolean,
  checksPolicy: ChecksPolicy,
  riskFlags: string[]
): Readiness {
  const noRisk = riskFlags.length === 0;
  const initReady =
    !!objective &&
    !!metricName &&
    (metricDirection === "lower" || metricDirection === "higher") &&
    noRisk;

  const runReady =
    initReady &&
    !!benchmarkCommand &&
    metricExtractionReady;

  const checksReady = checksPolicy !== "not_specified";

  const logReady = runReady && checksReady;

  return { initReady, runReady, checksReady, metricExtractionReady, logReady };
}

// ── Scores ────────────────────────────────────────────────────

export function computeScores(
  missingFields: string[],
  metricName: string | null,
  metricDirection: MetricDirection,
  metricExtractionReady: boolean,
  benchmarkCommand: string | null,
  checksReady: boolean,
  scope: string[],
  riskFlags: string[],
  broad: boolean
): StaticNumericScores {
  const filledRequiredFields = 6 - missingFields.length;
  const completeness = clamp(filledRequiredFields / 6);
  const measurability = clamp(
    (metricName ? 0.5 : 0) +
    (metricDirection === "lower" || metricDirection === "higher" ? 0.2 : 0) +
    (metricExtractionReady ? 0.3 : 0)
  );
  const commandReadiness = clamp(benchmarkCommand ? 1 : 0);
  const scopeClarity = clamp(scope.length > 0 ? 1 : broad ? 0.2 : 0.5);
  const safety = riskFlags.length === 0 ? 1 : 0;
  const reproducibility = clamp(
    (benchmarkCommand ? 0.4 : 0) +
    (checksReady ? 0.3 : 0) +
    (metricExtractionReady ? 0.3 : 0)
  );
  const readiness = clamp(
    Math.min(completeness, measurability, commandReadiness, safety, reproducibility)
  );

  return {
    completeness,
    measurability,
    commandReadiness,
    scopeClarity,
    safety,
    reproducibility,
    readiness,
  };
}

// ── Decision ──────────────────────────────────────────────────

export function decide(
  riskFlags: string[],
  objective: string,
  broad: boolean,
  metricName: string | null,
  metricDirection: MetricDirection,
  benchmarkCommand: string | null,
  metricExtractionReady: boolean,
  checksReady: boolean,
  readiness: Readiness
): QueryEvaluationDecision {
  if (riskFlags.length > 0) return "reject";
  if (!objective) return "needs_rewrite";
  if (broad && !metricName && !benchmarkCommand) return "needs_rewrite";
  if (!metricName || metricDirection === "unknown") return "needs_metric_design";

  // init は可能だが benchmark command がなく、broad でもない → ready_for_init
  if (!benchmarkCommand) {
    if (readiness.initReady && !broad) return "ready_for_init";
    return "needs_command";
  }

  if (!metricExtractionReady) return "needs_metric_extraction";
  if (!checksReady) return "needs_checks_policy";
  return "ready_for_run";
}

// ── Blocking issues ───────────────────────────────────────────

export function buildBlockingIssues(
  decision: QueryEvaluationDecision,
  riskFlags: string[],
  objective: string,
  metricName: string | null,
  metricDirection: MetricDirection,
  benchmarkCommand: string | null,
  metricExtractionReady: boolean,
  checksPolicy: ChecksPolicy
): string[] {
  const issues: string[] = [];

  if (!objective) issues.push("実験の目的が不明確です");
  if (!metricName) issues.push("主指標 (metric) が未定義です");
  if (metricDirection === "unknown") issues.push("改善方向 (lower/higher) が未指定です");
  if (!benchmarkCommand) issues.push("ベンチマークコマンドが未指定です");
  if (!metricExtractionReady && metricName) {
    issues.push("metric の抽出方法 (extraction rule) が未確定です");
  }
  if (checksPolicy === "not_specified" && benchmarkCommand) {
    issues.push("検証方針 (checks policy) が未指定です");
  }

  if (decision === "reject") {
    for (const flag of riskFlags) {
      issues.push(`安全上の問題: ${flag}`);
    }
  }

  return issues;
}

// ── Warnings ──────────────────────────────────────────────────

export function buildWarnings(
  checksPolicy: ChecksPolicy,
  scope: string[]
): string[] {
  const w: string[] = [];
  if (checksPolicy === "not_specified") {
    w.push(
      "検証方針 (checks) が未指定です。変更が既存の振る舞いを壊さないか確認するため、checks command または autoresearch.checks.sh の方針を明示することを推奨します。"
    );
  }
  if (scope.length === 0) {
    w.push(
      "対象範囲 (scope) が未指定です。改善対象を明確にすると実験の再現性が向上します。"
    );
  }
  return w;
}

// ── Ambiguity flags ───────────────────────────────────────────

export function buildAmbiguityFlags(
  broad: boolean,
  metricName: string | null,
  scope: string[]
): string[] {
  const flags: string[] = [];
  if (broad) {
    flags.push("目的が広すぎます。具体的な測定可能な指標に分解する必要があります");
  }
  if (!metricName && !broad) {
    flags.push("測定指標が不明です。主指標 (primary metric) を明記してください");
  }
  if (scope.length === 0) flags.push("対象範囲が不明です");
  if (scope.length > 2) flags.push("複数の対象範囲が含まれています");
  return flags;
}

// ── Suggested rewrite ─────────────────────────────────────────

// ── Missing run requirements ───────────────────────────────

function describeMissingRunRequirements(
  benchmarkCommand: string | null,
  metricExtractionReady: boolean,
  checksPolicy: ChecksPolicy
): string[] {
  const items: string[] = [];
  if (!benchmarkCommand) items.push("benchmark command");
  if (!metricExtractionReady) items.push("metric extraction rule");
  if (checksPolicy === "not_specified") items.push("checks policy");
  return items;
}

export function buildSuggestedRewrite(
  decision: QueryEvaluationDecision,
  broad: boolean,
  metricName: string | null,
  metricDirection: MetricDirection,
  benchmarkCommand: string | null,
  measurementMethod: MeasurementMethod,
  metricExtractionReady: boolean,
  checksPolicy: ChecksPolicy
): string {
  if (decision === "reject") {
    return "安全上の理由により、このクエリは実験として実行できません。危険な操作を削除した上で、安全な代替手段を検討してください。";
  }
  if (broad) {
    return "目的が広すぎるため、まず測定可能な proxy metric を選ぶ必要があります。候補: lint violation 数、型エラー数、重複行数、複雑度、test coverage、prepush 実行時間などから一つ選び、具体的な benchmark command と合わせて再投稿してください。";
  }

  switch (decision) {
    case "ready_for_init": {
      const missing = describeMissingRunRequirements(benchmarkCommand, metricExtractionReady, checksPolicy);
      const missingText = missing.length > 0 ? missing.join("、") : "追加情報";
      return `init は可能ですが、run 前に ${missingText} が必要です。\n例: \`<command>\` の実行時間を短縮したい。metric は ${metricName ?? "duration_seconds"}、${metricDirection === "higher" ? "higher" : "lower"} is better。既存 checks を使う。`;
    }

    case "needs_command": {
      const metric = metricName ?? "duration_seconds";
      return `主指標は ${metric} で、${metricDirection === "higher" ? "higher" : "lower"} is better。benchmark command を指定してください。`;
    }

    case "needs_metric_extraction": {
      const metric = metricName ?? "<metric>";
      return `主指標 ${metric} の抽出方法を指定してください。\n- wall-clock (実行時間): 自動測定\n- stdout_metric: コマンドが METRIC ${metric}=<value> を出力\n- report_file: カバレッジレポート等から抽出`;
    }

    case "needs_checks_policy":
      return `検証方針を指定してください。\n- checks command を明示: checks は \`npm test\`\n- autoresearch.checks.sh を使う: 「既存 checks を使う」と記載`;

    case "needs_metric_design":
      return "測定可能な主指標 (metric) と改善方向 (lower/higher) を指定してください。";

    default: {
      // ready_for_run or fallback
      if (measurementMethod === "wall_clock") {
        const cmd = benchmarkCommand ?? "<benchmark command>";
        return `主指標は \`${cmd}\` の実行時間秒数で、lower is better。挙動を変えず、既存 checks が成功する範囲で改善する。`;
      }
      if (metricDirection === "higher") {
        const name = metricName ?? "score";
        return `主指標は ${name} で、higher is better。`;
      }
      return "主指標と benchmark command を明記してください。";
    }
  }
}

// ── Clarifying questions ──────────────────────────────────────

export function buildClarifyingQuestions(
  metricName: string | null,
  benchmarkCommand: string | null,
  scope: string[],
  broad: boolean,
  metricExtractionReady: boolean,
  checksPolicy: ChecksPolicy
): string[] {
  const questions: string[] = [];

  if (!metricName) {
    questions.push(
      "主指標は wall-clock time、テスト成功率、coverage のどれを優先しますか？"
    );
  }
  if (!benchmarkCommand) {
    questions.push(
      "benchmark command は何を実行しますか？（例: `npm run prepush`、`pnpm test`）"
    );
  }
  if (!metricExtractionReady && metricName) {
    questions.push(
      `主指標 ${metricName} はどうやって測定しますか？（stdout / report file / wall-clock）`
    );
  }
  if (checksPolicy === "not_specified" && benchmarkCommand) {
    questions.push(
      "検証には autoresearch.checks.sh を使いますか？それとも checks command を指定しますか？"
    );
  }
  if (scope.length === 0) {
    questions.push(
      "改善対象の scope はリポジトリ全体ですか、それとも特定 package や directory ですか？"
    );
  }
  if (broad) {
    questions.push("どの側面を最優先で改善しますか？");
  }

  return questions.slice(0, 3);
}

