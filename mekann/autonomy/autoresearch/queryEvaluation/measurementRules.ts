import type { ChecksPolicy, MeasurementMethod } from "./evaluate.js";

export interface MeasurementInfoRuleResult {
	measurementMethod: MeasurementMethod;
	extractionRule: string | null;
	extractionConfidence: number;
	metricExtractionReady: boolean;
}

export function detectStdoutMetric(query: string, metricName: string | null): MeasurementInfoRuleResult | null {
	const hasMetricLinePattern = /\bmetric\s+[\w.-]+\s*=/i.test(query);
	const hasStdoutMetricMention = /(stdout|標準出力)/i.test(query) && /\bmetric\b/i.test(query);
	if (!hasMetricLinePattern && !hasStdoutMetricMention) return null;
	return {
		measurementMethod: "stdout_metric",
		extractionRule: metricName
			? `stdout に METRIC ${metricName}=<value> を出力する`
			: "stdout から METRIC 行をパースする",
		extractionConfidence: 0.9,
		metricExtractionReady: true,
	};
}

export function detectInternalLatency(metricName: string | null): MeasurementInfoRuleResult | null {
	if (metricName == null || !/(latency|p50|p90|p95|p99)/i.test(metricName)) return null;
	return {
		measurementMethod: "unknown",
		extractionRule: null,
		extractionConfidence: 0.4,
		metricExtractionReady: false,
	};
}

export function detectWallClock(query: string, metricName: string | null): MeasurementInfoRuleResult | null {
	const q = query.toLowerCase();
	const hasWallClockLanguage = /(wall[-\s]?clock|実行時間|全体時間|elapsed|runtime|duration|秒|短縮|速く|高速化)/i.test(q);
	const hasTimeMetricName = Boolean(metricName && /(duration|latency|time|seconds|sec|_ms$|\bms\b|total_ms)/i.test(metricName));
	if (!hasWallClockLanguage && !hasTimeMetricName) return null;
	return {
		measurementMethod: "wall_clock",
		extractionRule: "autoresearch_run の durationSeconds を primary metric として使う",
		extractionConfidence: hasWallClockLanguage ? 1.0 : 0.9,
		metricExtractionReady: true,
	};
}

export function detectReportFile(query: string): MeasurementInfoRuleResult | null {
	if (!/(coverage\s*report|lcov|json\s*report|test-report|coverage-final\.json|report\s*file)/.test(query.toLowerCase())) return null;
	return {
		measurementMethod: "report_file",
		extractionRule: null,
		extractionConfidence: 0.6,
		metricExtractionReady: false,
	};
}

export const UNKNOWN_MEASUREMENT: MeasurementInfoRuleResult = {
	measurementMethod: "unknown",
	extractionRule: null,
	extractionConfidence: 0.3,
	metricExtractionReady: false,
};

export const COMMAND_PATTERNS: RegExp[] = [
	/((?:npm\s+run|pnpm|yarn|bun)\s+[^\s,，。、]+)/g,
	/((?:pytest)\s+[^\s,，。、]+)/g,
	/((?:cargo)\s+[^\s,，。、]+)/g,
	/((?:go\s+test)\s*[^\s,，。、]*)/g,
	/((?:make)\s+[^\s,，。、]+)/g,
	/(\.\/[^\s,，。、]+\.sh)/g,
];

export const CHECKS_COMMAND_PATTERNS: RegExp[] = [
	/(?:check|checks|検証|成功すること)[\sは:：]*`([^`]+)`/gi,
	/(?:check|checks|検証|成功すること)[\sは:：]+(npm\s+run\s+[^\s,，。、]+|pnpm\s+[^\s,，。、]+|yarn\s+[^\s,，。、]+|pytest\s+[^\s,，。、]+|cargo\s+[^\s,，。、]+|go\s+test\s*[^\s,，。、]*|make\s+[^\s,，。、]+|\.\/[^\s,，。、]+\.sh)/gi,
];

export function detectChecksPolicyText(query: string, checksCommand: string | null): ChecksPolicy {
	if (checksCommand) return "explicit_command";
	const q = query.toLowerCase();
	if (/(autoresearch\.checks\.sh|既存\s*check|既存チェッ|既存のチェッ|既存チェック|checks?\s*として\s*prepush|prepush\s*を\s*checks?\s*と|checks?\s*として\s*test|test\s*を\s*checks?\s*と)/.test(q)) {
		return "autoresearch_checks_sh";
	}
	return "not_specified";
}
