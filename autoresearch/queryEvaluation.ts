// autoresearch/queryEvaluation.ts
// 静的クエリ評価モジュール: ユーザの自然文クエリを autoresearch の実験契約に変換できるか評価する
// LLM API 呼び出しは行わない純粋関数

// ─── Export する型 ────────────────────────────────────────────

export type MetricDirection = "lower" | "higher" | "unknown";

export type QueryEvaluationDecision =
  | "ready"
  | "needs_rewrite"
  | "needs_metric_design"
  | "needs_clarification"
  | "reject";

export interface ResearchContractDraft {
  objective: string;
  targetScope: string[];
  primaryMetric: {
    name: string | null;
    unit: string | null;
    direction: MetricDirection;
    source: "stdout" | "file" | "test-report" | "custom" | "unknown";
    extractionRule: string | null;
  };
  benchmarkCommand: string | null;
  checksCommand: string | null;
  constraints: string[];
  stopCondition: string | null;
  missingFields: string[];
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

function detectScope(query: string): string[] {
  const scopes: string[] = [];
  const q = query.toLowerCase();

  if (/\bprepush\b/.test(q)) scopes.push("prepush");
  if (
    /\b(pytest|go\s+test|cargo\s+test|pnpm\s+test|npm\s+run\s+test|\btest\b|テスト)\b/.test(
      q
    )
  )
    scopes.push("tests");
  if (/\b(coverage|カバレッジ)\b/.test(q)) scopes.push("coverage");
  if (/\blint\b/.test(q)) scopes.push("lint");
  if (/\b(build|ビルド)\b/.test(q)) scopes.push("build");

  // 重複除去
  return [...new Set(scopes)];
}

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

interface MetricInfo {
  name: string | null;
  unit: string | null;
  direction: MetricDirection;
  source: "stdout" | "file" | "test-report" | "custom" | "unknown";
  extractionRule: string | null;
}

function detectMetric(
  query: string,
  hasCommand: boolean
): MetricInfo {
  const q = query.toLowerCase();

  // 1. 明示指定を最優先
  const explicitName = detectExplicitMetricName(query);

  // 2. キーワード推定
  let name: string | null = explicitName;
  let unit: string | null = null;
  let direction: MetricDirection = "unknown";

  if (!name) {
    if (
      /(速く|高速化|latency|time|duration|\bms\b|\bsec\b|秒|実行時間|短縮)/.test(
        q
      )
    ) {
      name = "duration_seconds";
      unit = "seconds";
      direction = "lower";
    } else if (
      /(スコア|score|accuracy|pass\s*rate|success\s*rate|win\s*rate)/.test(
        q
      ) &&
      /(上げ|改善|向上)/.test(q)
    ) {
      const scoreMatch = q.match(
        /(スコア|score|accuracy|pass\s*rate|success\s*rate|win\s*rate)/
      );
      name = scoreMatch ? scoreMatch[1].replace(/\s+/g, "_") : "score";
      direction = "higher";
    } else if (
      /(エラー|error|failure|crash|flaky)/.test(q) &&
      /(減ら|削減)/.test(q)
    ) {
      name = "error_count";
      direction = "lower";
    } else if (
      /(コスト|cost|token|memory|size|bundle)/.test(q)
    ) {
      const costMatch = q.match(
        /(コスト|cost|token|memory|size|bundle)/
      );
      name = costMatch ? costMatch[1] : "cost";
      direction = "lower";
    } else if (/(coverage|カバレッジ)/.test(q)) {
      name = "coverage";
      unit = "%";
      direction = "higher";
    }
  }

  // 3. Direction の明示検出
  if (
    /(lower\s+is\s+better|小さいほど|短縮|減ら|削減|\blower\b)/.test(q)
  ) {
    direction = "lower";
  } else if (
    /(higher\s+is\s+better|大きいほど|上げ|\bhigher\b)/.test(q)
  ) {
    direction = "higher";
  }

  // 明示 metric name がある場合、direction がまだ unknown ならキーワード推定を再試行
  if (explicitName && direction === "unknown") {
    if (/(速く|高速化|latency|time|duration|\bms\b|\bsec\b|秒|実行時間|短縮|減ら|削減|小さい|lower)/.test(q)) {
      direction = "lower";
    } else if (/(上げ|大きい|高い|higher|改善|向上)/.test(q)) {
      direction = "higher";
    }
  }

  const source = hasCommand ? "stdout" : "unknown";
  const extractionRule =
    name !== null
      ? `stdout に METRIC ${name}=<value> を出力する`
      : null;

  return { name, unit, direction, source, extractionRule };
}

function extractCommands(
  query: string
): { benchmarkCommand: string | null; checksCommand: string | null } {
  // 1. バッククォート内の command を最優先
  const backtickCommands = [...query.matchAll(/`([^`]+)`/g)].map(
    (m) => m[1]
  );

  let benchmarkCommand: string | null = null;
  let checksCommand: string | null = null;

  // 追加の正規表現によるコマンド検出
  const commandPatterns = [
    /((?:npm\s+run|pnpm|yarn|bun)\s+\S+)/g,
    /((?:pytest)\s+[^\s,，。、]+)/g,
    /((?:cargo\s+\S+))/g,
    /((?:go\s+test)\s*[^\s,，。、]*)/g,
    /((?:make)\s+\S+)/g,
    /(\.\/\S+\.sh)/g,
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
    /(?:check|checks|検証|成功すること)\s*[`:]?\s*`([^`]+)`/gi,
    /(?:check|checks|検証|成功すること)\s+(npm\s+run\s+\S+|pnpm\s+\S+|yarn\s+\S+|pytest\s+\S+|cargo\s+\S+|go\s+test\s*\S*|make\s+\S+|\.\/\S+\.sh)/gi,
  ];

  const checksCandidates: string[] = [];
  for (const pat of checksPatterns) {
    const matches = [...query.matchAll(pat)];
    for (const m of matches) {
      checksCandidates.push((m[1] || m[0]).trim());
    }
  }

  // 全コマンドを統合
  const allCommands = [...backtickCommands, ...additionalCommands];
  const uniqueCommands = [...new Set(allCommands)];

  // benchmarkCommand: バッククォート優先 → 残り
  if (backtickCommands.length > 0) {
    // checks の文脈にあるものを除く
    const nonChecksBacktick = backtickCommands.filter(
      (c) => !checksCandidates.includes(c)
    );
    benchmarkCommand = nonChecksBacktick[0] ?? backtickCommands[0];
  } else if (uniqueCommands.length > 0) {
    benchmarkCommand = uniqueCommands[0];
  }

  // checksCommand
  if (checksCandidates.length > 0) {
    checksCommand = checksCandidates[0];
  } else if (uniqueCommands.length > 1 && backtickCommands.length <= 1) {
    // 2 つ目のコマンドを checks にする（backtick が複数ある場合は別枠）
    checksCommand = uniqueCommands[1];
  } else if (backtickCommands.length > 1) {
    checksCommand = backtickCommands[1];
  }

  return { benchmarkCommand, checksCommand };
}

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

function findMissingFields(draft: ResearchContractDraft): string[] {
  const missing: string[] = [];
  if (!draft.objective) missing.push("objective");
  if (!draft.primaryMetric.name) missing.push("primaryMetric.name");
  if (draft.primaryMetric.direction === "unknown")
    missing.push("primaryMetric.direction");
  if (!draft.benchmarkCommand) missing.push("benchmarkCommand");
  if (!draft.checksCommand) missing.push("checksCommand");
  if (draft.targetScope.length === 0) missing.push("targetScope");
  return missing;
}

function computeScores(
  missingFields: string[],
  metricName: string | null,
  metricDirection: MetricDirection,
  benchmarkCommand: string | null,
  checksCommand: string | null,
  scope: string[],
  riskFlags: string[],
  broad: boolean
): StaticNumericScores {
  const filledRequiredFields = 6 - missingFields.length;
  const completeness = clamp(filledRequiredFields / 6);
  const measurability = clamp(
    (metricName ? 0.7 : 0) +
      (metricDirection === "lower" || metricDirection === "higher" ? 0.3 : 0)
  );
  const commandReadiness = clamp(
    (benchmarkCommand ? 0.7 : 0) + (checksCommand ? 0.3 : 0)
  );
  const scopeClarity = clamp(
    scope.length > 0 ? 1 : broad ? 0.2 : 0.5
  );
  const safety = riskFlags.length === 0 ? 1 : 0;
  const reproducibility = clamp(
    (benchmarkCommand ? 0.7 : 0) + (checksCommand ? 0.3 : 0)
  );
  const readiness = clamp(
    Math.min(completeness, measurability, commandReadiness, safety)
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

function decide(
  riskFlags: string[],
  objective: string,
  broad: boolean,
  metricName: string | null,
  metricDirection: MetricDirection,
  benchmarkCommand: string | null,
  scope: string[]
): QueryEvaluationDecision {
  if (riskFlags.length > 0) return "reject";
  if (!objective) return "needs_rewrite";
  if (broad && !metricName && !benchmarkCommand) return "needs_rewrite";
  if (!metricName || metricDirection === "unknown")
    return "needs_metric_design";
  if (!benchmarkCommand || scope.length === 0)
    return "needs_clarification";
  return "ready";
}

function buildBlockingIssues(
  decision: QueryEvaluationDecision,
  riskFlags: string[],
  draft: ResearchContractDraft
): string[] {
  const issues: string[] = [];

  if (!draft.objective) issues.push("実験の目的が不明確です");
  if (!draft.primaryMetric.name)
    issues.push("主指標 (metric) が未定義です");
  if (draft.primaryMetric.direction === "unknown")
    issues.push("改善方向 (lower/higher) が未指定です");
  if (!draft.benchmarkCommand)
    issues.push("ベンチマークコマンドが未指定です");

  if (decision === "reject") {
    for (const flag of riskFlags) {
      issues.push(`安全上の問題: ${flag}`);
    }
  }

  return issues;
}

function buildWarnings(
  checksCommand: string | null,
  scope: string[]
): string[] {
  const w: string[] = [];
  if (!checksCommand)
    w.push(
      "検証コマンド (checks) が未指定です。変更が既存の振る舞いを壊さないか確認する checks を追加することを推奨します。"
    );
  if (scope.length === 0)
    w.push(
      "対象範囲 (scope) が未指定です。改善対象を明確にすると実験の再現性が向上します。"
    );
  return w;
}

function buildAmbiguityFlags(
  broad: boolean,
  metricName: string | null,
  scope: string[]
): string[] {
  const flags: string[] = [];
  if (broad)
    flags.push(
      "目的が広すぎます。具体的な測定可能な指標に分解する必要があります"
    );
  if (!metricName && !broad)
    flags.push(
      "測定指標が不明です。主指標 (primary metric) を明記してください"
    );
  if (scope.length === 0) flags.push("対象範囲が不明です");
  if (scope.length > 2) flags.push("複数の対象範囲が含まれています");
  return flags;
}

function buildSuggestedRewrite(
  decision: QueryEvaluationDecision,
  broad: boolean,
  metricName: string | null,
  metricDirection: MetricDirection,
  benchmarkCommand: string | null
): string {
  if (decision === "reject") {
    return "安全上の理由により、このクエリは実験として実行できません。危険な操作を削除した上で、安全な代替手段を検討してください。";
  }
  if (broad) {
    return "目的が広すぎるため、まず測定可能な proxy metric を選ぶ必要があります。候補: lint violation 数、型エラー数、重複行数、複雑度、test coverage、prepush 実行時間などから一つ選び、具体的な benchmark command と合わせて再投稿してください。";
  }
  if (
    metricName === "duration_seconds" ||
    metricDirection === "lower"
  ) {
    const cmd = benchmarkCommand ?? "<benchmark command>";
    return `目的を達成するため、主指標は \`${cmd}\` の実行時間秒数で、lower is better。挙動を変えず、既存 checks が成功する範囲で改善する。`;
  }
  if (metricDirection === "higher") {
    const name = metricName ?? "score";
    return `目的を達成するため、主指標は ${name} で、higher is better。`;
  }
  return "目的を達成するため、metric と benchmark command を明記してください。";
}

function buildClarifyingQuestions(
  metricName: string | null,
  benchmarkCommand: string | null,
  scope: string[],
  broad: boolean
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
        extractionRule: null,
      },
      benchmarkCommand: null,
      checksCommand: null,
      constraints: [],
      stopCondition: null,
      missingFields: [
        "objective",
        "primaryMetric.name",
        "primaryMetric.direction",
        "benchmarkCommand",
        "checksCommand",
        "targetScope",
      ],
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
      scores: emptyScores,
      contractDraft: emptyDraft,
      blockingIssues: ["実験の目的が不明確です"],
      warnings: [
        "検証コマンド (checks) が未指定です。変更が既存の振る舞いを壊さないか確認する checks を追加することを推奨します。",
        "対象範囲 (scope) が未指定です。改善対象を明確にすると実験の再現性が向上します。",
      ],
      ambiguityFlags: ["対象範囲が不明です"],
      riskFlags: [],
      suggestedRewrite:
        "目的を達成するため、metric と benchmark command を明記してください。",
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

  // ── Metric detection ──
  const metric = detectMetric(trimmed, benchmarkCommand !== null);

  // ── Broad query detection ──
  const broad = isBroadQuery(trimmed);

  // ── Contract draft ──
  const contractDraft: ResearchContractDraft = {
    objective,
    targetScope: scope,
    primaryMetric: {
      name: metric.name,
      unit: metric.unit,
      direction: metric.direction,
      source: metric.source,
      extractionRule: metric.extractionRule,
    },
    benchmarkCommand,
    checksCommand,
    constraints: [],
    stopCondition: null,
    missingFields: [],
  };
  contractDraft.missingFields = findMissingFields(contractDraft);

  // ── Decision ──
  const decision = decide(
    riskFlags,
    objective,
    broad,
    metric.name,
    metric.direction,
    benchmarkCommand,
    scope
  );

  // ── Scores ──
  const scores = computeScores(
    contractDraft.missingFields,
    metric.name,
    metric.direction,
    benchmarkCommand,
    checksCommand,
    scope,
    riskFlags,
    broad
  );

  // ── Blocking issues ──
  const blockingIssues = buildBlockingIssues(decision, riskFlags, contractDraft);

  // ── Warnings ──
  const warnings = buildWarnings(checksCommand, scope);

  // ── Ambiguity flags ──
  const ambiguityFlags = buildAmbiguityFlags(broad, metric.name, scope);

  // ── Suggested rewrite ──
  const suggestedRewrite = buildSuggestedRewrite(
    decision,
    broad,
    metric.name,
    metric.direction,
    benchmarkCommand
  );

  // ── Clarifying questions ──
  const clarifyingQuestions = buildClarifyingQuestions(
    metric.name,
    benchmarkCommand,
    scope,
    broad
  );

  return {
    decision,
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
