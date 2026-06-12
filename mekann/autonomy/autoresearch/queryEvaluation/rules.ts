import type { MetricDirection } from "./evaluate.js";

export interface TextRule {
	pattern: RegExp;
	label: string;
}

export interface MetricInferenceRule {
	id: string;
	patterns: RegExp[];
	name: string | ((query: string) => string);
	unit: string | null;
	direction: MetricDirection;
	require?: RegExp;
}

export const RISK_RULES: TextRule[] = [
	{ pattern: /\brm\s+-rf\b|\brm\s+-r\s+-f\b/, label: "破壊的ファイル削除 (rm -rf)" },
	{ pattern: /\bsudo\b/, label: "管理者権限の使用 (sudo)" },
	{ pattern: /curl.*\|\s*(?:sh|bash)/, label: "外部スクリプトの直接実行 (curl | sh)" },
	{ pattern: /\bchmod\s+777\b/, label: "過度な権限付与 (chmod 777)" },
];

export const SCOPE_RULES: TextRule[] = [
	{ pattern: /\bprepush\b/, label: "prepush" },
	{ pattern: /\b(pytest|go\s+test|cargo\s+test|pnpm\s+test|npm\s+run\s+test|\btest\b|テスト)\b/, label: "tests" },
	{ pattern: /\b(coverage|カバレッジ)\b/, label: "coverage" },
	{ pattern: /\blint\b/, label: "lint" },
	{ pattern: /\b(build|ビルド)\b/, label: "build" },
];

export const BROAD_QUERY_PATTERNS: RegExp[] = [
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

export const METRIC_INFERENCE_RULES: MetricInferenceRule[] = [
	{
		id: "latency",
		patterns: [/(p50|p90|p95|p99|latency|レイテンシ|応答時間)/i],
		name: (query) => /p95/i.test(query) ? "p95_latency_ms" : "latency_ms",
		unit: "ms",
		direction: "lower",
	},
	{
		id: "duration",
		patterns: [/(速く|高速化|\btime\b|duration|\bsec\b|秒|実行時間|短縮)/],
		name: "duration_seconds",
		unit: "seconds",
		direction: "lower",
	},
	{
		id: "score",
		patterns: [/(スコア|score|accuracy|pass\s*rate|success\s*rate|win\s*rate)/],
		require: /(上げ|改善|向上)/,
		name: (query) => {
			const match = query.match(/(スコア|score|accuracy|pass\s*rate|success\s*rate|win\s*rate)/);
			return match ? match[1].replace(/\s+/g, "_") : "score";
		},
		unit: null,
		direction: "higher",
	},
	{
		id: "error_count",
		patterns: [/(エラー|error|failure|crash|flaky)/],
		require: /(減ら|削減)/,
		name: "error_count",
		unit: null,
		direction: "lower",
	},
	{
		id: "cost",
		patterns: [/(コスト|cost|token|memory|size|bundle)/],
		name: (query) => {
			const match = query.match(/(コスト|cost|token|memory|size|bundle)/);
			return match ? match[1] : "cost";
		},
		unit: null,
		direction: "lower",
	},
	{
		id: "coverage",
		patterns: [/(coverage|カバレッジ)/],
		name: "coverage",
		unit: "%",
		direction: "higher",
	},
];

export function applyTextRules(query: string, rules: TextRule[]): string[] {
	return rules.filter((rule) => rule.pattern.test(query)).map((rule) => rule.label);
}

export function firstMetricInference(query: string): { name: string; unit: string | null; direction: MetricDirection } | null {
	for (const rule of METRIC_INFERENCE_RULES) {
		if (rule.require && !rule.require.test(query)) continue;
		if (!rule.patterns.some((pattern) => pattern.test(query))) continue;
		return {
			name: typeof rule.name === "function" ? rule.name(query) : rule.name,
			unit: rule.unit,
			direction: rule.direction,
		};
	}
	return null;
}
