import type { CodexUsageReport, NormalizedCredits, NormalizedRateLimitSnapshot, NormalizedRateLimitWindow, UsageQueryError } from "./usage.js";

const CODEX_PROVIDER_ID = "openai-codex";
const USAGE_SETTINGS_URL = "https://chatgpt.com/codex/settings/usage";
const BAR_SEGMENTS = 16;
const LIMIT_VALUE_COLUMN = 12;

export type CodexUsageModel = { id?: string; name?: string; provider?: string };

function isOpenAICodexModel(model: Pick<CodexUsageModel, "provider"> | undefined): boolean {
	return model?.provider === CODEX_PROVIDER_ID;
}

export function formatCodexUsageReport(report: CodexUsageReport, _cacheAgeMs?: number): string {
	const lines = [
		"Codex 使用状況",
		`更新時刻: ${formatCapturedAt(report.capturedAt)}`,
		`詳細: ${USAGE_SETTINGS_URL}`,
		"",
	];

	for (const snapshot of report.snapshots) {
		const label = snapshot.limitName ?? snapshot.limitId;
		if (!isPrimaryCodexSnapshot(snapshot)) {
			lines.push(`${label}:`);
		}
		if (snapshot.primary) lines.push(formatWindowLine("5時間制限:", snapshot.primary, true));
		if (snapshot.secondary) lines.push(formatWindowLine("週制限:", snapshot.secondary, true));
		if (!snapshot.primary && !snapshot.secondary) {
			lines.push("このアカウントの制限情報は表示できません。");
		}
	}

	return lines.join("\n");
}

export function formatCodexUsageStatusline(
	report: CodexUsageReport,
	model?: CodexUsageModel,
): string {
	return formatCodexUsageFooterLines(report, model).join(" ");
}

export function formatCodexUsageFooterLines(
	report: CodexUsageReport,
	model?: CodexUsageModel,
): string[] {
	const snapshot = selectSnapshotForModel(report, model);
	if (!snapshot) return ["usage unavailable"];
	const lines: string[] = [];
	if (snapshot.primary) lines.push(formatCompactWindow("5h", snapshot.primary));
	if (snapshot.secondary) lines.push(formatCompactWindow("wk", snapshot.secondary));
	if (lines.length === 0 && snapshot.credits) lines.push(formatCredits(snapshot.credits));
	return lines.length > 0 ? lines : ["Limits unavailable for this account"];
}

function selectSnapshotForModel(
	report: CodexUsageReport,
	model: CodexUsageModel | undefined,
): NormalizedRateLimitSnapshot | undefined {
	const codexSnapshot = report.snapshots.find(isPrimaryCodexSnapshot);
	if (!model || !isOpenAICodexModel(model)) return codexSnapshot ?? report.snapshots[0];

	const modelKeys = normalizedModelUsageKeys(model);
	const exactMatch = report.snapshots.find((snapshot) =>
		!isPrimaryCodexSnapshot(snapshot) &&
		normalizedSnapshotUsageKeys(snapshot).some((key) => modelKeys.has(key)),
	);
	if (exactMatch) return exactMatch;

	const variants = codexModelVariantKeys(modelKeys);
	for (const variant of variants) {
		const matches = report.snapshots.filter(
			(snapshot) =>
				!isPrimaryCodexSnapshot(snapshot) &&
				normalizedSnapshotUsageKeys(snapshot).some((key) => normalizedKeyHasToken(key, variant)),
		);
		if (matches.length === 1) return matches[0];
	}

	return codexSnapshot ?? report.snapshots[0];
}

function normalizedModelUsageKeys(model: CodexUsageModel): Set<string> {
	const keys = new Set<string>();
	addNormalizedUsageKey(keys, model.id);
	addNormalizedUsageKey(keys, model.name);

	for (const key of [...keys]) {
		const codexIndex = key.indexOf("codex");
		if (codexIndex >= 0) keys.add(key.slice(codexIndex));
	}

	return keys;
}

function normalizedSnapshotUsageKeys(snapshot: NormalizedRateLimitSnapshot): string[] {
	return [normalizedUsageKey(snapshot.limitId), normalizedUsageKey(snapshot.limitName)].filter(
		(key): key is string => key !== undefined,
	);
}

function addNormalizedUsageKey(keys: Set<string>, value: string | undefined): void {
	const key = normalizedUsageKey(value);
	if (key) keys.add(key);
}

function normalizedUsageKey(value: string | undefined): string | undefined {
	const key = value
		?.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return key || undefined;
}

function codexModelVariantKeys(modelKeys: Set<string>): string[] {
	const variants = new Set<string>();
	for (const key of modelKeys) {
		const match = key.match(/(?:^|-)codex-(.+)$/);
		if (match?.[1]) variants.add(match[1]);
	}
	return [...variants];
}

function normalizedKeyHasToken(key: string, token: string): boolean {
	return (
		key === token ||
		key.startsWith(`${token}-`) ||
		key.endsWith(`-${token}`) ||
		key.includes(`-${token}-`)
	);
}

function isPrimaryCodexSnapshot(snapshot: NormalizedRateLimitSnapshot): boolean {
	return (
		normalizedUsageKey(snapshot.limitId) === "codex" ||
		normalizedUsageKey(snapshot.limitName) === "codex"
	);
}

function formatWindowLine(label: string, window: NormalizedRateLimitWindow, includeReset = false): string {
	const remaining = 100 - clampPercent(window.usedPercent);
	const reset = includeReset && window.resetsAt ? `  更新 ${formatResetDateTime(window.resetsAt)}` : "";
	return `${label.padEnd(LIMIT_VALUE_COLUMN)}${progressBar(remaining)} ${remaining.toFixed(0).padStart(3)}%${reset}`;
}

function formatCompactWindow(label: string, window: NormalizedRateLimitWindow): string {
	const remaining = 100 - clampPercent(window.usedPercent);
	return `${label} ${progressBar(remaining)} ${remaining.toFixed(0).padStart(3)}%`;
}

function progressBar(percentRemaining: number): string {
	const filled = Math.round((clampPercent(percentRemaining) / 100) * BAR_SEGMENTS);
	return `[${"█".repeat(filled)}${"░".repeat(BAR_SEGMENTS - filled)}]`;
}

function formatCredits(credits: NormalizedCredits): string {
	if (!credits.hasCredits) return "no credits";
	if (credits.unlimited) return "unlimited credits";
	const balance = credits.balance?.trim();
	if (!balance) return "credits available";
	return `${formatNumber(Number(balance), balance)} credits`;
}

function formatCapturedAt(epochMs: number): string {
	return formatDateTime(new Date(epochMs));
}

function formatResetDateTime(epochSeconds: number): string {
	return formatDateTime(new Date(epochSeconds * 1000));
}

function formatDateTime(date: Date): string {
	if (Number.isNaN(date.getTime())) return "不明";
	return date.toLocaleString("ja-JP", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

export function formatQueryErrors(errors: UsageQueryError[]): string {
	const lines = ["Unable to read Codex usage."];
	for (const error of errors) {
		lines.push(`- Codex app-server: ${error.message}`);
	}
	lines.push("");
	lines.push(
		"Tip: install Codex CLI and run codex login, then retry /codex-status.",
	);
	return lines.join("\n");
}

function formatNumber(value: number, fallback: string): string {
	if (!Number.isFinite(value)) return fallback;
	return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function clampPercent(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(100, Math.max(0, value));
}
