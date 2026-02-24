/**
 * @abdd.meta
 * path: .pi/extensions/search/tools/fault_localize.ts
 * role: SBFLベースのバグ位置特定ツール
 * why: テストカバレッジデータに基づいて、バグの原因となるコード位置を統計的に特定するため
 * related: ../../../lib/sbfl.ts, ./sym_find.ts, ./code_search.ts, ../types.ts
 * public_api: faultLocalize, faultLocalizeToolDefinition, type FaultLocalizeInput, type FaultLocalizeResult
 * invariants: suspiciousness値は0.0〜1.0の範囲、結果は怪しさの降順でソート済み
 * side_effects: テスト実行コマンドを実行する可能性がある（現在はプレースホルダー）
 * failure_modes: テスト実行やカバレッジ取得に失敗した場合、エラーを返す
 * @abdd.explain
 * overview: テストの成功/失敗とコードカバレッジの関係から、バグの原因となるコード位置を特定するツール
 * what_it_does:
 *   - テスト実行コマンドを実行し、成功/失敗テストを特定
 *   - カバレッジデータを収集
 *   - SBFLアルゴリズム（Ochiai, Tarantula, OP2）で怪しさを計算
 *   - 怪しさの高い順にコード位置を提示
 * why_it_exists:
 *   - 手動デバッグの効率を向上させるため
 *   - テストカバレッジを活用した統計的バグ特定を自動化するため
 * scope:
 *   in: テスト実行コマンド、成功/失敗テストリスト、カバレッジレポートパス
 *   out: 怪しさでソートされたコード位置リスト
 */

/**
 * fault_localize Tool
 *
 * SBFL (Spectrum-Based Fault Localization) tool for identifying bug locations
 * based on test coverage data.
 *
 * NOTE: Test execution and coverage collection are complex features.
 * This implementation provides the interface and placeholder logic.
 * Actual test execution will be implemented in a future task.
 */

import type { SearchDetails } from "../types.js";
import {
	type SBFLAlgorithm,
	type CoverageData,
	type LocationSuspiciousness,
	calculateBatchSuspiciousness,
	aggregateCoverage,
} from "../../../lib/sbfl.js";

// ============================================
// Types
// ============================================

/**
 * バグ位置特定の入力パラメータ
 * @summary バグ位置特定入力
 * @param testCommand テスト実行コマンド
 * @param failingTests 失敗テストのリスト（省略時は自動検出）
 * @param passingTests 成功テストのリスト
 * @param suspiciousnessThreshold 怪しさ閾値
 * @param coverageReport カバレッジレポートパス
 * @param algorithm SBFLアルゴリズム
 */
export interface FaultLocalizeInput {
	/** Test execution command (e.g., "npm test", "pytest") */
	testCommand: string;
	/** List of failing test names (auto-detected if omitted) */
	failingTests?: string[];
	/** List of passing test names */
	passingTests?: string[];
	/** Suspiciousness threshold (default: 0.5) */
	suspiciousnessThreshold?: number;
	/** Path to coverage report file */
	coverageReport?: string;
	/** SBFL algorithm to use (default: ochiai) */
	algorithm?: SBFLAlgorithm;
}

/**
 * 単一の怪しいコード位置
 * @summary 怪しい位置
 */
export interface SuspiciousLocation {
	/** Method/function name */
	method: string;
	/** File path */
	file: string;
	/** Line number */
	line: number;
	/** Suspiciousness score (0.0-1.0) */
	suspiciousness: number;
	/** Times covered by failing tests */
	coveredByFailing: number;
	/** Times covered by passing tests */
	coveredByPassing: number;
}

/**
 * バグ位置特定の出力結果
 * @summary バグ位置特定出力
 */
export interface FaultLocalizeResult {
	/** Suspicious locations sorted by suspiciousness (descending) */
	locations: SuspiciousLocation[];
	/** Algorithm used */
	algorithm: SBFLAlgorithm;
	/** Total number of tests analyzed */
	totalTests: number;
	/** Number of failing tests */
	failingTestCount: number;
	/** Number of passing tests */
	passingTestCount: number;
	/** Whether test execution was actually performed */
	testExecuted: boolean;
	/** Error message if localization failed */
	error?: string;
	/** Details with hints */
	details?: SearchDetails;
}

// ============================================
// Placeholder Implementations
// ============================================

/**
 * テストを実行して結果を取得（プレースホルダー）
 * @summary テスト実行
 * @param testCommand テストコマンド
 * @param cwd 作業ディレクトリ
 * @returns テスト結果
 */
async function executeTests(
	testCommand: string,
	cwd: string
): Promise<{
	passingTests: string[];
	failingTests: string[];
	executed: boolean;
	error?: string;
}> {
	// TODO: 実際のテスト実行を実装
	// 現在はプレースホルダーとして、実行されなかったことを返す
	return {
		passingTests: [],
		failingTests: [],
		executed: false,
		error: "Test execution not implemented. Please provide failingTests and passingTests manually.",
	};
}

/**
 * カバレッジデータを収集（プレースホルダー）
 * @summary カバレッジ収集
 * @param testCommand テストコマンド
 * @param passingTests 成功テスト
 * @param failingTests 失敗テスト
 * @param coverageReport カバレッジレポートパス
 * @param cwd 作業ディレクトリ
 * @returns カバレッジマップ
 */
async function collectCoverage(
	testCommand: string,
	passingTests: string[],
	failingTests: string[],
	coverageReport: string | undefined,
	cwd: string
): Promise<Map<string, Map<number, CoverageData & { method?: string }>>> {
	// TODO: 実際のカバレッジ収集を実装
	// 現在はプレースホルダーとして空のマップを返す
	return new Map();
}

// ============================================
// Main Implementation
// ============================================

/**
 * バグ位置を特定
 * @summary バグ位置特定実行
 * @param input 入力パラメータ
 * @param cwd 作業ディレクトリ
 * @returns バグ位置特定結果
 */
export async function faultLocalize(
	input: FaultLocalizeInput,
	cwd: string
): Promise<FaultLocalizeResult> {
	const algorithm: SBFLAlgorithm = input.algorithm ?? "ochiai";
	const threshold = input.suspiciousnessThreshold ?? 0.5;

	let failingTests = input.failingTests ?? [];
	let passingTests = input.passingTests ?? [];
	let testExecuted = false;

	// 1. テスト実行（必要な場合）
	if (failingTests.length === 0 && passingTests.length === 0) {
		const testResult = await executeTests(input.testCommand, cwd);
		if (testResult.error && !testResult.executed) {
			// テスト実行が未実装の場合はプレースホルダー結果を返す
			return {
				locations: [],
				algorithm,
				totalTests: 0,
				failingTestCount: 0,
				passingTestCount: 0,
				testExecuted: false,
				error: testResult.error,
				details: {
					hints: {
						confidence: 0,
						suggestedNextAction: "try_different_tool",
						alternativeTools: ["code_search", "sym_find"],
					},
				},
			};
		}
		failingTests = testResult.failingTests;
		passingTests = testResult.passingTests;
		testExecuted = testResult.executed;
	}

	// 2. カバレッジデータを収集
	const coverageMap = await collectCoverage(
		input.testCommand,
		passingTests,
		failingTests,
		input.coverageReport,
		cwd
	);

	// 3. カバレッジデータから位置リストを作成
	const locations: Array<{
		file: string;
		line: number;
		method?: string;
		coverage: CoverageData;
	}> = [];

	for (const entry of Array.from(coverageMap.entries())) {
		const [file, lineMap] = entry;
		for (const lineEntry of Array.from(lineMap.entries())) {
			const [line, coverage] = lineEntry;
			locations.push({
				file,
				line,
				method: (coverage as CoverageData & { method?: string }).method,
				coverage,
			});
		}
	}

	// 4. SBFLアルゴリズムで怪しさを計算
	const suspiciousLocations = calculateBatchSuspiciousness(
		locations,
		algorithm,
		threshold
	);

	// 5. 結果を変換
	const resultLocations: SuspiciousLocation[] = suspiciousLocations.map((loc) => ({
		method: loc.method ?? "unknown",
		file: loc.file,
		line: loc.line,
		suspiciousness: loc.suspiciousness,
		coveredByFailing: loc.coveredByFailing,
		coveredByPassing: loc.coveredByPassing,
	}));

	// 6. ヒントを生成
	const hints: SearchDetails["hints"] = {
		confidence: resultLocations.length > 0 ? 0.7 : 0.1,
		estimatedTokens: resultLocations.length * 50,
	};

	if (resultLocations.length === 0) {
		hints.suggestedNextAction = "refine_pattern";
		hints.alternativeTools = ["code_search", "sym_find"];
	}

	return {
		locations: resultLocations,
		algorithm,
		totalTests: failingTests.length + passingTests.length,
		failingTestCount: failingTests.length,
		passingTestCount: passingTests.length,
		testExecuted,
		details: { hints },
	};
}

/**
 * バグ位置特定結果をフォーマット
 * @summary 結果フォーマット
 * @param output 出力データ
 * @returns フォーマット済み文字列
 */
export function formatFaultLocalize(output: FaultLocalizeResult): string {
	const lines: string[] = [];

	if (output.error) {
		lines.push(`Error: ${output.error}`);
		return lines.join("\n");
	}

	lines.push(`Fault Localization (SBFL - ${output.algorithm})`);
	lines.push(`Tests: ${output.totalTests} (${output.failingTestCount} failing, ${output.passingTestCount} passing)`);
	lines.push(`Test executed: ${output.testExecuted}`);
	lines.push("");

	if (output.locations.length === 0) {
		lines.push("No suspicious locations found.");
		lines.push("Try lowering the suspiciousnessThreshold or providing coverage data.");
		return lines.join("\n");
	}

	lines.push("Suspicious Locations:");
	lines.push("");

	for (const loc of output.locations.slice(0, 20)) {
		const suspiciousness = (loc.suspiciousness * 100).toFixed(1);
		lines.push(`[${suspiciousness}%] ${loc.method}`);
		lines.push(`  ${loc.file}:${loc.line}`);
		lines.push(`  Covered by: ${loc.coveredByFailing} failing, ${loc.coveredByPassing} passing tests`);
		lines.push("");
	}

	if (output.locations.length > 20) {
		lines.push(`... and ${output.locations.length - 20} more locations`);
	}

	return lines.join("\n");
}

/**
 * Tool definition for pi.registerTool
 */
export const faultLocalizeToolDefinition = {
	name: "fault_localize",
	label: "Fault Localize",
	description:
		"Identify potential bug locations using Spectrum-Based Fault Localization (SBFL). Analyzes test coverage data to find code that is frequently covered by failing tests. Supports Ochiai, Tarantula, and OP2 algorithms.",
	parameters: null, // Will be set in index.ts
};
