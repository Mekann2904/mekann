/**
 * autoresearch/contract.ts — 実験契約 (Experiment Contract) の型・検証・I/O。
 *
 * 実験契約は autoresearch の不変条件の正本。
 * agent の会話コンテキストではなく、machine-readable なファイルとして保存・強制される。
 *
 * P0-4: experiment contract を machine-readable に保存する
 * P0-1: git safety を強制する
 * P0-3: noisy benchmark 用の acceptance policy
 * P0-7: sandbox / command policy と統合する
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const ACCEPTANCE_MODES = ["better_than_best", "improvement_threshold", "manual"] as const;
export type AcceptanceMode = (typeof ACCEPTANCE_MODES)[number];

const AGGREGATE_METHODS = ["single", "median", "mean", "min", "max"] as const;
export type AggregateMethod = (typeof AGGREGATE_METHODS)[number];

const METRIC_METHODS = ["wall_clock", "stdout_metric", "report_file"] as const;
export type MetricMethod = (typeof METRIC_METHODS)[number];

const CHECKS_MODES = ["script", "command", "none"] as const;
export type ChecksMode = (typeof CHECKS_MODES)[number];

/**
 * 主指標の定義。
 */
export interface PrimaryMetricDef {
	name: string;
	direction: "lower" | "higher";
	method: MetricMethod;
	unit: string;
	/** stdout_metric の場合の抽出ルール。例: "METRIC duration_seconds=<value>" */
	extractionRule?: string;
}

/**
 * Acceptance policy。
 * どのような条件で keep を許可するか。
 */
export interface AcceptancePolicy {
	mode: AcceptanceMode;
	/** 改善率の最小閾値 (0.02 = 2%)。mode=improvement_threshold では必須 */
	minImprovement: number;
	/** 繰り返し回数。1 = 単発。3 = median of 3 */
	repeat: number;
	aggregate: AggregateMethod;
}

/**
 * Checks の定義。
 */
export interface ChecksDef {
	mode: ChecksMode;
	/** mode=command の場合のコマンド。mode=script なら autoresearch.checks.sh */
	command?: string;
}

/**
 * Safety / git / command policy。
 */
export interface SafetyPolicy {
	/** git repo を必須とする。true の場合非 git repo では init を拒否 */
	requireGit: boolean;
	/** init 時に clean working tree を必須とする */
	requireCleanBaseline: boolean;
	/** 変更を許可するパスパターン (空 = すべて許可) */
	allowedPaths: string[];
	/** 除外するパスパターン */
	excludedPaths: string[];
	/** 実行禁止コマンドパターン (正規表現文字列) */
	forbiddenCommandPatterns: string[];
}

/**
 * 実験契約。tool 側の不変条件の正本。
 */
export interface ExperimentContract {
	schemaVersion: 1;
	objective: string;
	targetScope: string[];
	benchmarkCommand: string;
	primaryMetric: PrimaryMetricDef;
	checks: ChecksDef;
	acceptance: AcceptancePolicy;
	safety: SafetyPolicy;
	/** 作成日時 ISO */
	createdAt: string;
	/** セッション ID */
	sessionId: string;
	/** 契約バージョン (再初期化ごとに増加) */
	version: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_ACCEPTANCE: AcceptancePolicy = {
	mode: "better_than_best",
	minImprovement: 0,
	repeat: 1,
	aggregate: "single",
};

export const DEFAULT_SAFETY: SafetyPolicy = {
	requireGit: true,
	requireCleanBaseline: true,
	allowedPaths: [],
	excludedPaths: [],
	forbiddenCommandPatterns: [
		"\\bsudo\\b",
		"\\brm\\s+-rf\\s+/",
		"\\bdd\\s+if=",
		"\\bmkfs\\.",
		"\\bformat\\b.*:",
		":\\(\\)\\s*\\{.*\\}.*:\\(",  // fork bomb
	],
};

export const DEFAULT_CHECKS: ChecksDef = {
	mode: "script",
};

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

const CONTRACT_FILE = "autoresearch.contract.json";

/** contract ファイルのパスを返す */
export function contractFilePath(cwd: string): string {
	return path.join(cwd, CONTRACT_FILE);
}

/** contract ファイルが存在するか */
export function contractExists(cwd: string): boolean {
	return fs.existsSync(contractFilePath(cwd));
}

/** contract をファイルに書き込む */
export function writeContract(cwd: string, contract: ExperimentContract): void {
	fs.writeFileSync(contractFilePath(cwd), JSON.stringify(contract, null, 2), "utf8");
}

/** contract をファイルから読み込む。存在しない場合は null */
export function readContract(cwd: string): ExperimentContract | null {
	const fp = contractFilePath(cwd);
	if (!fs.existsSync(fp)) return null;
	try {
		const data = JSON.parse(fs.readFileSync(fp, "utf8"));
		if (data && typeof data === "object" && data.schemaVersion === 1) {
			return data as ExperimentContract;
		}
		return null;
	} catch {
		return null;
	}
}

/** contract ファイルを削除 */
export function deleteContract(cwd: string): void {
	const fp = contractFilePath(cwd);
	try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch { /* best effort */ }
}

// ---------------------------------------------------------------------------
// Git safety checks
// ---------------------------------------------------------------------------

/** git repo かどうかを判定 */
export function isGitRepo(cwd: string): boolean {
	try {
		execFileSync("git", ["rev-parse", "--git-dir"], {
			cwd, encoding: "utf8", timeout: 5_000, stdio: ["ignore", "pipe", "ignore"],
		});
		return true;
	} catch {
		return false;
	}
}

/** working tree が clean かどうかを判定 (staged + unstaged + untracked) */
export function isWorkingTreeClean(cwd: string): boolean {
	try {
		const result = execFileSync("git", ["status", "--porcelain"], {
			cwd, encoding: "utf8", timeout: 5_000, stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		return result.length === 0;
	} catch {
		return false;
	}
}

/** 現在の HEAD commit hash (full) */
export function getBaselineCommit(cwd: string): string | null {
	try {
		return execFileSync("git", ["rev-parse", "HEAD"], {
			cwd, encoding: "utf8", timeout: 5_000, stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return null;
	}
}

/** git safety の前提を検証し、 violations を返す */
export function validateGitSafety(cwd: string, safety: SafetyPolicy): string[] {
	const violations: string[] = [];

	if (safety.requireGit && !isGitRepo(cwd)) {
		violations.push("git repo ではありません。autoresearch は git repo で使用してください。");
	}

	if (safety.requireCleanBaseline && isGitRepo(cwd) && !isWorkingTreeClean(cwd)) {
		violations.push(
			"working tree に未コミット変更があります。\n" +
			"実験トランザクションの整合性のため、開始前に commit または stash してください。\n" +
			"または `autoresearch_init` で `requireCleanBaseline: false` を指定してください。"
		);
	}

	return violations;
}

// ---------------------------------------------------------------------------
// Command policy
// ---------------------------------------------------------------------------

/** コマンドが safety policy に違反するかを判定 */
export function validateCommand(command: string, safety: SafetyPolicy): string[] {
	const violations: string[] = [];

	for (const pattern of safety.forbiddenCommandPatterns) {
		try {
			const re = new RegExp(pattern);
			if (re.test(command)) {
				violations.push(`禁止コマンドパターン "${pattern}" に一致します: ${command}`);
			}
		} catch {
			// 無効な正規表現はスキップ
		}
	}

	return violations;
}

// ---------------------------------------------------------------------------
// Changed files policy
// ---------------------------------------------------------------------------

/** 変更ファイルが allowedPaths / excludedPaths に収まっているかを検証 */
export function validateChangedFiles(
	changedFiles: string[],
	safety: SafetyPolicy,
): string[] {
	if (safety.allowedPaths.length === 0 && safety.excludedPaths.length === 0) {
		return []; // 制限なし
	}

	const violations: string[] = [];

	for (const file of changedFiles) {
		// excludedPaths チェック
		for (const exPattern of safety.excludedPaths) {
			if (matchesPathPattern(file, exPattern)) {
				violations.push(`変更ファイル "${file}" は除外パターン "${exPattern}" に一致します。`);
			}
		}

		// allowedPaths チェック (指定されている場合)
		if (safety.allowedPaths.length > 0) {
			const allowed = safety.allowedPaths.some((p) => matchesPathPattern(file, p));
			if (!allowed) {
				violations.push(`変更ファイル "${file}" は許可パスに含まれていません。`);
			}
		}
	}

	return violations;
}

function globToRegExp(pattern: string): RegExp {
	let out = "^";
	for (let i = 0; i < pattern.length; i++) {
		const ch = pattern[i];
		const next = pattern[i + 1];
		if (ch === "*") {
			if (next === "*") {
				const after = pattern[i + 2];
				if (after === "/") { out += "(?:.*/)?"; i += 2; }
				else { out += ".*"; i++; }
			} else {
				out += "[^/]*";
			}
		} else if (ch === "?") {
			out += "[^/]";
		} else {
			out += ch.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
		}
	}
	return new RegExp(out + "$");
}

/** Match safety path patterns. Historically these are RegExp strings; glob syntax is also accepted for user-facing ergonomics. */
export function matchesPathPattern(file: string, pattern: string): boolean {
	try {
		if (new RegExp(pattern).test(file)) return true;
	} catch { /* fall through to glob/prefix handling */ }

	if (pattern.includes("*") || pattern.includes("?")) {
		try { return globToRegExp(pattern).test(file); } catch { /* fall through */ }
	}

	return file.startsWith(pattern);
}

// ---------------------------------------------------------------------------
// Contract validation
// ---------------------------------------------------------------------------

export interface ContractValidationResult {
	valid: boolean;
	errors: string[];
	warnings: string[];
}

/** 契約内容を検証する */
export function validateContract(contract: ExperimentContract): ContractValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	// 必須フィールド
	if (!contract.objective) errors.push("objective が未設定です");
	if (!contract.primaryMetric?.name) errors.push("primaryMetric.name が未設定です");
	if (!contract.primaryMetric?.direction || !["lower", "higher"].includes(contract.primaryMetric.direction)) {
		errors.push("primaryMetric.direction は 'lower' または 'higher' である必要があります");
	}
	if (!contract.primaryMetric?.method || !METRIC_METHODS.includes(contract.primaryMetric.method)) {
		errors.push(`primaryMetric.method は ${METRIC_METHODS.join(" | ")} のいずれかである必要があります`);
	}
	if (!contract.benchmarkCommand) errors.push("benchmarkCommand が未設定です");

	// Acceptance policy
	if (!ACCEPTANCE_MODES.includes(contract.acceptance?.mode)) {
		errors.push(`acceptance.mode は ${ACCEPTANCE_MODES.join(" | ")} のいずれかである必要があります`);
	}
	if (contract.acceptance?.mode === "improvement_threshold" && (!contract.acceptance.minImprovement || contract.acceptance.minImprovement <= 0)) {
		errors.push("acceptance.mode=improvement_threshold の場合、minImprovement > 0 が必要です");
	}
	if (contract.acceptance?.repeat && contract.acceptance.repeat < 1) {
		errors.push("acceptance.repeat は 1 以上である必要があります");
	}

	// Checks
	if (!CHECKS_MODES.includes(contract.checks?.mode)) {
		errors.push(`checks.mode は ${CHECKS_MODES.join(" | ")} のいずれかである必要があります`);
	}
	if (contract.checks?.mode === "command" && !contract.checks.command) {
		errors.push("checks.mode=command の場合、checks.command が必要です");
	}

	// Warnings
	if (contract.acceptance?.mode === "manual") {
		warnings.push("acceptance.mode=manual: agent の判断をそのまま採用します。誤った keep が発生する可能性があります。");
	}
	if (contract.acceptance?.repeat === 1 && contract.primaryMetric?.method === "wall_clock") {
		warnings.push("wall_clock 指標を単発測定しています。ノイズが大きい場合、repeat ≥ 3 と aggregate='median' を推奨します。");
	}
	if (contract.safety?.requireGit === false) {
		warnings.push("safety.requireGit=false: 非 git 環境での keep は再現性を保証できません。");
	}

	return {
		valid: errors.length === 0,
		errors,
		warnings,
	};
}

// ---------------------------------------------------------------------------
// Contract builder (from init params)
// ---------------------------------------------------------------------------

export interface InitContractParams {
	name: string;
	sessionId: string;
	metricName: string;
	metricUnit: string;
	direction: "lower" | "higher";
	metricMethod: MetricMethod;
	benchmarkCommand: string;
	objective?: string;
	checksMode?: ChecksMode;
	checksCommand?: string;
	acceptanceMode?: AcceptanceMode;
	minImprovement?: number;
	repeat?: number;
	aggregate?: AggregateMethod;
	requireGit?: boolean;
	requireCleanBaseline?: boolean;
	allowedPaths?: string[];
	excludedPaths?: string[];
	forbiddenCommandPatterns?: string[];
	extractionRule?: string;
}

/** init パラメータから契約を構築 */
export function buildContract(params: InitContractParams): ExperimentContract {
	return {
		schemaVersion: 1,
		objective: params.objective ?? params.name,
		targetScope: [],
		benchmarkCommand: params.benchmarkCommand,
		primaryMetric: {
			name: params.metricName,
			direction: params.direction,
			method: params.metricMethod,
			unit: params.metricUnit,
			extractionRule: params.extractionRule,
		},
		checks: {
			mode: params.checksMode ?? DEFAULT_CHECKS.mode,
			command: params.checksCommand,
		},
		acceptance: {
			mode: params.acceptanceMode ?? DEFAULT_ACCEPTANCE.mode,
			minImprovement: params.minImprovement ?? DEFAULT_ACCEPTANCE.minImprovement,
			repeat: params.repeat ?? DEFAULT_ACCEPTANCE.repeat,
			aggregate: params.aggregate ?? DEFAULT_ACCEPTANCE.aggregate,
		},
		safety: {
			requireGit: params.requireGit ?? DEFAULT_SAFETY.requireGit,
			requireCleanBaseline: params.requireCleanBaseline ?? DEFAULT_SAFETY.requireCleanBaseline,
			allowedPaths: params.allowedPaths ?? [],
			excludedPaths: params.excludedPaths ?? [],
			forbiddenCommandPatterns: params.forbiddenCommandPatterns ?? DEFAULT_SAFETY.forbiddenCommandPatterns,
		},
		createdAt: new Date().toISOString(),
		sessionId: params.sessionId,
		version: 1,
	};
}
