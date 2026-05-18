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

// ─── 内部ヘルパー ─────────────────────────────────────────────

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

// ── Risk detection ────────────────────────────────────────────

function detectRiskFlags(query: string): string[] {
  const flags: string[] = [];
  const q = query.toLowerCase();

  if (/\brm\s+-rf\b/.test(q) || /\brm\s+-r\s+-f\b/.test(q)) {
    flags.push("破壊的ファイル削除 (rm -rf)");
  }
  if (/\bsudo\b/.test(q)) {
    flags.push("管理者権限の使用 (sudo)");
  }
  if (/curl.*\|\s*sh/.test(q) || /curl.*\|\s*bash/.test(q)) {
    flags.push("外部スクリプトの直接実行 (curl | sh)");
  }
  if (/\bchmod\s+777\b/.test(q)) {
    flags.push("過度な権限付与 (chmod 777)");
  }
  if (
    /\b(secret|token|api\s*key|password|秘密|認証情報)\b/.test(q) &&
    /(表示|送信|upload|post|出力|出力し|print|echo|show|dump)/.test(q)
  ) {
    flags.push("秘密情報の漏洩リスク");
  }
  if (
    /\b(production|prod|本番db|本番)\b/.test(q) &&
    /(変更|削除|書き込|update|delete|write|drop|alter|truncate)/.test(q)
  ) {
    flags.push("本番環境への破壊的変更");
  }

  return flags;
}

// ── Scope detection ───────────────────────────────────────────

function detectScope(query: string): string[] {
  const scopes: string[] = [];
  const q = query.toLowerCase();

  if (/\bprepush\b/.test(q)) scopes.push("prepush");
  if (
    /\b(pytest|go\s+test|cargo\s+test|pnpm\s+test|npm\s+run\s+test|\btest\b|テスト)\b/.test(q)
  )
    scopes.push("tests");
  if (/\b(coverage|カバレッジ)\b/.test(q)) scopes.push("coverage");
  if (/\blint\b/.test(q)) scopes.push("lint");
  if (/\b(build|ビルド)\b/.test(q)) scopes.push("build");

  return [...new Set(scopes)];
}

// ── Direction inference from metric name ────────────────────

function inferDirectionFromMetricName(name: string | null): MetricDirection {
  if (!name) return "unknown";

  // higher 系: success / pass / coverage / score 等
  if (/(success_count|pass_count|passed_count|successes|passes)/i.test(name)) {
    return "higher";
  }
  if (/(coverage|accuracy|score|rate|ratio|success|pass|win)/i.test(name)) {
    return "higher";
  }

  // lower 系: time / cost / error 等
  if (/(duration|latency|time|seconds|sec|_ms$|\bms\b|cost|memory|size|error_count|failure_count|violation_count|errors?|failures?|violations?)/i.test(name)) {
    return "lower";
  }

  // count 単体は方向不明
  if (/count/i.test(name)) {
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

interface MetricNameInfo {
  name: string | null;
  unit: string | null;
  direction: MetricDirection;
}

function detectMetricNameAndDirection(
  query: string,
  hasCommand: boolean
): MetricNameInfo {
  const q = query.toLowerCase();
  const explicitName = detectExplicitMetricName(query);

  let name: string | null = explicitName;
  let unit: string | null = null;
  let direction: MetricDirection = "unknown";

  if (!name) {
    if (/(速く|高速化|latency|\btime\b|duration|\bms\b|\bsec\b|秒|実行時間|短縮)/.test(q)) {
      name = "duration_seconds";
      unit = "seconds";
      direction = "lower";
    } else if (
      /(スコア|score|accuracy|pass\s*rate|success\s*rate|win\s*rate)/.test(q) &&
      /(上げ|改善|向上)/.test(q)
    ) {
      const scoreMatch = q.match(/(スコア|score|accuracy|pass\s*rate|success\s*rate|win\s*rate)/);
      name = scoreMatch ? scoreMatch[1].replace(/\s+/g, "_") : "score";
      direction = "higher";
    } else if (/(エラー|error|failure|crash|flaky)/.test(q) && /(減ら|削減)/.test(q)) {
      name = "error_count";
      direction = "lower";
    } else if (/(コスト|cost|token|memory|size|bundle)/.test(q)) {
      const costMatch = q.match(/(コスト|cost|token|memory|size|bundle)/);
      name = costMatch ? costMatch[1] : "cost";
      direction = "lower";
    } else if (/(coverage|カバレッジ)/.test(q)) {
      name = "coverage";
      unit = "%";
      direction = "higher";
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

interface MeasurementInfo {
  measurementMethod: MeasurementMethod;
  extractionRule: string | null;
  extractionConfidence: number;
  metricExtractionReady: boolean;
}

// ── Unit inference from metric name ───────────────────────────

function inferUnitFromMetricName(name: string | null): string | null {
  if (!name) return null;
  // _ms / ms を先にチェック（latency_ms 等の誤判定防止）
  if (/\bms\b|_ms$/i.test(name)) return "ms";
  if (/(duration|elapsed|runtime|wall_clock|time|seconds|sec)/i.test(name)) return "seconds";
  if (/(coverage|rate|ratio|accuracy|percent)/i.test(name)) return "%";
  if (/(error_count|failure_count|violation_count|errors?|failures?|violations?)/i.test(name)) return "count";
  return null;
}

function sourceFromMeasurementMethod(
  method: MeasurementMethod
): "stdout" | "file" | "test-report" | "custom" | "unknown" {
  switch (method) {
    case "wall_clock": return "custom";
    case "stdout_metric": return "stdout";
    case "report_file": return "file";
    default: return "unknown";
  }
}

function detectMeasurementMethod(
  query: string,
  metricName: string | null
): MeasurementInfo {
  const q = query.toLowerCase();

  // 1. Stdout metric: METRIC name=value パターン、または stdout/標準出力 + metric の同時言及
  const hasMetricLinePattern = /\bmetric\s+[\w.-]+\s*=/i.test(query);
  const hasStdoutMetricMention =
    /(stdout|標準出力)/i.test(query) && /\bmetric\b/i.test(query);

  if (hasMetricLinePattern || hasStdoutMetricMention) {
    return {
      measurementMethod: "stdout_metric",
      extractionRule: metricName
        ? `stdout に METRIC ${metricName}=<value> を出力する`
        : "stdout から METRIC 行をパースする",
      extractionConfidence: 0.9,
      metricExtractionReady: true,
    };
  }

  // 2. Internal latency metric: p95/p99/latency 系は wall-clock ではない
  const hasInternalLatencyMetric =
    metricName != null && /(latency|p50|p90|p95|p99)/i.test(metricName);

  if (hasInternalLatencyMetric) {
    return {
      measurementMethod: "unknown",
      extractionRule: null,
      extractionConfidence: 0.4,
      metricExtractionReady: false,
    };
  }

  // 3. Wall-clock: 速度・時間系キーワード（command 全体の実行時間を指す語）
  const hasWallClockLanguage =
    /(wall[-\s]?clock|実行時間|全体時間|elapsed|runtime|duration|秒|短縮|速く|高速化)/i.test(q);

  if (hasWallClockLanguage) {
    return {
      measurementMethod: "wall_clock",
      extractionRule: "autoresearch_run の durationSeconds を primary metric として使う",
      extractionConfidence: 1.0,
      metricExtractionReady: true,
    };
  }

  // 3. Wall-clock: metricName に時間系パターンが含まれる場合
  if (
    metricName &&
    /(duration|latency|time|seconds|sec|_ms$|\bms\b|total_ms)/i.test(metricName)
  ) {
    return {
      measurementMethod: "wall_clock",
      extractionRule: "autoresearch_run の durationSeconds を primary metric として使う",
      extractionConfidence: 0.9,
      metricExtractionReady: true,
    };
  }

  // 3. Report file: coverage report / lcov / json report / test-report 等
  if (/(coverage\s*report|lcov|json\s*report|test-report|coverage-final\.json|report\s*file)/.test(q)) {
    return {
      measurementMethod: "report_file",
      extractionRule: null,
      extractionConfidence: 0.6,
      metricExtractionReady: false,
    };
  }

  // 4. Unknown: 上記いずれにも該当しない
  return {
    measurementMethod: "unknown",
    extractionRule: null,
    extractionConfidence: 0.3,
    metricExtractionReady: false,
  };
}

// ── Command extraction ────────────────────────────────────────

function extractCommands(
  query: string
): { benchmarkCommand: string | null; checksCommand: string | null } {
  const backtickCommands = [...query.matchAll(/`([^`]+)`/g)].map((m) => m[1]);

  const commandPatterns = [
    /((?:npm\s+run|pnpm|yarn|bun)\s+[^\s,，。、]+)/g,
    /((?:pytest)\s+[^\s,，。、]+)/g,
    /((?:cargo)\s+[^\s,，。、]+)/g,
    /((?:go\s+test)\s*[^\s,，。、]*)/g,
    /((?:make)\s+[^\s,，。、]+)/g,
    /(\.\/[^\s,，。、]+\.sh)/g,
  ];

  const additionalCommands: string[] = [];
  for (const pat of commandPatterns) {
    const matches = [...query.matchAll(pat)];
    for (const m of matches) {
      additionalCommands.push(m[1].trim());
    }
  }

  // checksCommand 用: check/checks/検証/成功すること に続く command
  const checksPatterns = [
    /(?:check|checks|検証|成功すること)[\sは:：]*`([^`]+)`/gi,
    /(?:check|checks|検証|成功すること)[\sは:：]+(npm\s+run\s+[^\s,，。、]+|pnpm\s+[^\s,，。、]+|yarn\s+[^\s,，。、]+|pytest\s+[^\s,，。、]+|cargo\s+[^\s,，。、]+|go\s+test\s*[^\s,，。、]*|make\s+[^\s,，。、]+|\.\/[^\s,，。、]+\.sh)/gi,
  ];

  const checksCandidates: string[] = [];
  for (const pat of checksPatterns) {
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

function detectChecksPolicy(
  query: string,
  checksCommand: string | null
): ChecksPolicy {
  // 1. checks command が query から明示的に抽出された
  if (checksCommand) return "explicit_command";

  // 2. autoresearch.checks.sh または「既存 checks」等の表現
  const q = query.toLowerCase();
  if (
    /(autoresearch\.checks\.sh|既存\s*check|既存チェッ|既存のチェッ|既存チェック|checks?\s*として\s*prepush|prepush\s*を\s*checks?\s*と|checks?\s*として\s*test|test\s*を\s*checks?\s*と)/.test(q)
  ) {
    return "autoresearch_checks_sh";
  }

  // 3. 未指定
  return "not_specified";
}

// ── Broad query detection ─────────────────────────────────────

function isBroadQuery(query: string): boolean {
  const patterns = [
    /コード品質/,
    /品質を上げ/,
    /品質を改善/,
    /保守性を改善/,
    /保守性を上げ/,
    /保守性を向上/,
    /良くしたい/,
    /改善したい$/,
    /向上したい$/,
    /全体的に.*良く/,
    /全体的に.*改善/,
    /全体的に.*向上/,
    /リファクタリングしたい/,
  ];
  return patterns.some((p) => p.test(query));
}

// ── Missing fields ────────────────────────────────────────────

function findMissingFields(
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

function computeReadiness(
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

function computeScores(
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

function decide(
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

function buildBlockingIssues(
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

function buildWarnings(
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

function buildAmbiguityFlags(
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

function buildSuggestedRewrite(
  decision: QueryEvaluationDecision,
  broad: boolean,
  metricName: string | null,
  metricDirection: MetricDirection,
  benchmarkCommand: string | null,
  measurementMethod: MeasurementMethod
): string {
  if (decision === "reject") {
    return "安全上の理由により、このクエリは実験として実行できません。危険な操作を削除した上で、安全な代替手段を検討してください。";
  }
  if (broad) {
    return "目的が広すぎるため、まず測定可能な proxy metric を選ぶ必要があります。候補: lint violation 数、型エラー数、重複行数、複雑度、test coverage、prepush 実行時間などから一つ選び、具体的な benchmark command と合わせて再投稿してください。";
  }

  switch (decision) {
    case "ready_for_init":
      return `init は可能ですが、実行には benchmark command と checks 方針が必要です。\n例: \`<command>\` の実行時間を短縮したい。metric は ${metricName ?? "duration_seconds"}、${metricDirection === "higher" ? "higher" : "lower"} is better。既存 checks を使う。`;

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

function buildClarifyingQuestions(
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
      blockingIssues: ["実験の目的が不明確です"],
      warnings: [
        "検証方針 (checks) が未指定です。変更が既存の振る舞いを壊さないか確認するため、checks command または autoresearch.checks.sh の方針を明示することを推奨します。",
        "対象範囲 (scope) が未指定です。改善対象を明確にすると実験の再現性が向上します。",
      ],
      ambiguityFlags: ["対象範囲が不明です"],
      riskFlags: [],
      suggestedRewrite: "測定可能な主指標 (metric) と改善方向 (lower/higher) を指定してください。",
      clarifyingQuestions: [
        "主指標は wall-clock time、テスト成功率、coverage のどれを優先しますか？",
        "benchmark command は何を実行しますか？（例: `npm run prepush`、`pnpm test`）",
        "改善対象の scope はリポジトリ全体ですか、それとも特定 package や directory ですか？",
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
    benchmarkCommand, measurementInfo.measurementMethod
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
