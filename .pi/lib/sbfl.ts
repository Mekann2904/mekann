/**
 * @abdd.meta
 * path: .pi/lib/sbfl.ts
 * role: SBFL（Spectrum-Based Fault Localization）アルゴリズムの実装
 * why: テストカバレッジデータに基づいてバグの原因箇所を統計的に特定するため
 * related: .pi/extensions/search/tools/fault_localize.ts
 * public_api: calculateOchiai, calculateTarantula, calculateOP2, calculateSuspiciousness, type SBFLAlgorithm, type CoverageData, type SuspiciousnessResult
 * invariants: suspiciousness値は0.0〜1.0の範囲、n_cf/n_nf/n_cs/n_nsは非負整数
 * side_effects: なし（純粋関数）
 * failure_modes: ゼロ除算の場合はsuspiciousness=0を返す
 * @abdd.explain
 * overview: テストの成功/失敗とコードカバレッジの関係から、バグの原因となるコード位置の怪しさ（suspiciousness）を計算するライブラリ
 * what_it_does:
 *   - Ochiai、Tarantula、OP2の3つのSBFLアルゴリズムを提供
 *   - カバレッジデータから各コード行のsuspiciousnessを計算
 *   - テスト失敗時にカバーされた行ほど高いsuspiciousnessを持つ
 * why_it_exists:
 *   - バグ位置特定を統計的にサポートするため
 *   - 手動デバッグの効率を向上させるため
 * scope:
 *   in: カバレッジデータ（各行が成功/失敗テストでカバーされた回数）
 *   out: 各行のsuspiciousnessスコア
 */

/**
 * SBFL（Spectrum-Based Fault Localization）アルゴリズム実装
 *
 * テストカバレッジデータに基づいて、バグの原因となるコード位置を特定する。
 */

// ============================================
// Types
// ============================================

/**
 * SBFLアルゴリズムの種類
 * @summary アルゴリズム種別
 */
export type SBFLAlgorithm = "ochiai" | "tarantula" | "op2";

/**
 * 単一コード要素のカバレッジデータ
 * @summary カバレッジデータ
 * @param n_cf 失敗テストでカバーされた回数
 * @param n_nf 失敗テストでカバーされなかった回数
 * @param n_cs 成功テストでカバーされた回数
 * @param n_ns 成功テストでカバーされなかった回数
 */
export interface CoverageData {
	/** Times covered by failing tests */
	n_cf: number;
	/** Times NOT covered by failing tests */
	n_nf: number;
	/** Times covered by passing tests */
	n_cs: number;
	/** Times NOT covered by passing tests */
	n_ns: number;
}

/**
 * 怪しさ計算結果
 * @summary 怪しさ結果
 * @param suspiciousness 怪しさスコア（0.0-1.0）
 * @param algorithm 使用したアルゴリズム
 * @param coverage 元のカバレッジデータ
 */
export interface SuspiciousnessResult {
	/** Suspiciousness score (0.0-1.0) */
	suspiciousness: number;
	/** Algorithm used */
	algorithm: SBFLAlgorithm;
	/** Original coverage data */
	coverage: CoverageData;
}

/**
 * コード位置の怪しさ情報
 * @summary 位置怪しさ情報
 * @param file ファイルパス
 * @param line 行番号
 * @param method メソッド名
 * @param suspiciousness 怪しさスコア
 * @param coveredByFailing 失敗テストでカバーされた回数
 * @param coveredByPassing 成功テストでカバーされた回数
 */
export interface LocationSuspiciousness {
	file: string;
	line: number;
	method?: string;
	suspiciousness: number;
	coveredByFailing: number;
	coveredByPassing: number;
}

// ============================================
// SBFL Algorithms
// ============================================

/**
 * Ochiaiアルゴリズムでsuspiciousnessを計算
 * @summary Ochiai計算
 * @param coverage カバレッジデータ
 * @returns suspiciousnessスコア（0.0-1.0）
 * @description
 * Ochiai係数は以下の式で計算される:
 * suspiciousness = n_cf / sqrt((n_cf + n_nf) * (n_cf + n_cs))
 *
 * 失敗テストでカバーされた回数が多く、全体でもカバー頻度が低い行ほど高いスコアを持つ。
 */
export function calculateOchiai(coverage: CoverageData): number {
	const { n_cf, n_nf, n_cs } = coverage;

	// ゼロ除算チェック
	if (n_cf === 0) {
		return 0;
	}

	const denominator = Math.sqrt((n_cf + n_nf) * (n_cf + n_cs));

	if (denominator === 0) {
		return 0;
	}

	return n_cf / denominator;
}

/**
 * Tarantulaアルゴリズムでsuspiciousnessを計算
 * @summary Tarantula計算
 * @param coverage カバレッジデータ
 * @returns suspiciousnessスコア（0.0-1.0）
 * @description
 * Tarantulaは以下の式で計算される:
 * suspiciousness = (n_cf / (n_cf + n_nf)) / ((n_cf / (n_cf + n_nf)) + (n_cs / (n_cs + n_ns)))
 *
 * 失敗テストでのカバー率が高く、成功テストでのカバー率が低い行ほど高いスコアを持つ。
 */
export function calculateTarantula(coverage: CoverageData): number {
	const { n_cf, n_nf, n_cs, n_ns } = coverage;

	// ゼロ除算チェック
	const totalFailing = n_cf + n_nf;
	const totalPassing = n_cs + n_ns;

	if (totalFailing === 0) {
		return 0;
	}

	const failRate = n_cf / totalFailing;

	// 成功テストがない場合は失敗率をそのまま返す
	if (totalPassing === 0) {
		return failRate > 0 ? 1 : 0;
	}

	const passRate = n_cs / totalPassing;
	const denominator = failRate + passRate;

	if (denominator === 0) {
		return 0;
	}

	return failRate / denominator;
}

/**
 * OP2アルゴリズムでsuspiciousnessを計算
 * @summary OP2計算
 * @param coverage カバレッジデータ
 * @returns suspiciousnessスコア（0.0-1.0）
 * @description
 * OP2は以下の式で計算される:
 * suspiciousness = n_cf - (n_cs / (n_cs + n_ns + 1))
 *
 * 失敗テストでカバーされた回数から、成功テストでのカバー期待値を引く。
 * シンプルだが効果的な手法。
 */
export function calculateOP2(coverage: CoverageData): number {
	const { n_cf, n_cs, n_ns } = coverage;

	// 成功テストでのカバー期待値を計算
	const passExpectation = n_cs / (n_cs + n_ns + 1);

	return n_cf - passExpectation;
}

/**
 * 指定したアルゴリズムでsuspiciousnessを計算
 * @summary 怪しさ計算
 * @param coverage カバレッジデータ
 * @param algorithm アルゴリズム種別
 * @returns 怪しさ計算結果
 */
export function calculateSuspiciousness(
	coverage: CoverageData,
	algorithm: SBFLAlgorithm = "ochiai"
): SuspiciousnessResult {
	let suspiciousness: number;

	switch (algorithm) {
		case "ochiai":
			suspiciousness = calculateOchiai(coverage);
			break;
		case "tarantula":
			suspiciousness = calculateTarantula(coverage);
			break;
		case "op2":
			suspiciousness = calculateOP2(coverage);
			break;
		default:
			throw new Error(`Unknown SBFL algorithm: ${algorithm}`);
	}

	// スコアを0.0-1.0の範囲に正規化（OP2は負の値や1を超える値を取りうる）
	// OchiaiとTarantulaは既に0-1の範囲
	if (algorithm === "op2") {
		// OP2のスコアは理論上 n_cf 以下なので、正規化
		suspiciousness = Math.max(0, Math.min(1, suspiciousness / Math.max(1, coverage.n_cf)));
	}

	return {
		suspiciousness,
		algorithm,
		coverage,
	};
}

// ============================================
// Batch Processing
// ============================================

/**
 * 複数の位置のsuspiciousnessを一括計算
 * @summary 一括怪しさ計算
 * @param locations 位置とカバレッジデータの配列
 * @param algorithm アルゴリズム種別
 * @param threshold 怪しさ閾値（この値以上のみ返す）
 * @returns 怪しさでソートされた位置配列
 */
export function calculateBatchSuspiciousness(
	locations: Array<{
		file: string;
		line: number;
		method?: string;
		coverage: CoverageData;
	}>,
	algorithm: SBFLAlgorithm = "ochiai",
	threshold: number = 0
): LocationSuspiciousness[] {
	const results = locations.map((loc) => {
		const result = calculateSuspiciousness(loc.coverage, algorithm);
		return {
			file: loc.file,
			line: loc.line,
			method: loc.method,
			suspiciousness: result.suspiciousness,
			coveredByFailing: loc.coverage.n_cf,
			coveredByPassing: loc.coverage.n_cs,
		};
	});

	// 閾値でフィルタリング
	const filtered = results.filter((r) => r.suspiciousness >= threshold);

	// 怪しさの降順でソート
	return filtered.sort((a, b) => b.suspiciousness - a.suspiciousness);
}

// ============================================
// Coverage Aggregation
// ============================================

/**
 * テスト結果からカバレッジデータを集計
 * @summary カバレッジ集計
 * @param testResults テスト結果配列
 * @returns ファイルパスと行番号をキーとしたカバレッジデータマップ
 */
export function aggregateCoverage(
	testResults: Array<{
		passed: boolean;
		coveredLines: Array<{ file: string; line: number }>;
	}>
): Map<string, Map<number, CoverageData>> {
	const coverageMap = new Map<string, Map<number, CoverageData>>();

	for (const test of testResults) {
		for (const covered of test.coveredLines) {
			let fileMap = coverageMap.get(covered.file);
			if (!fileMap) {
				fileMap = new Map();
				coverageMap.set(covered.file, fileMap);
			}

			let coverage = fileMap.get(covered.line);
			if (!coverage) {
				coverage = { n_cf: 0, n_nf: 0, n_cs: 0, n_ns: 0 };
				fileMap.set(covered.line, coverage);
			}

			if (test.passed) {
				coverage.n_cs++;
			} else {
				coverage.n_cf++;
			}
		}
	}

	// n_nf と n_ns を計算（全テスト数からカバーされた回数を引く）
	const totalFailing = testResults.filter((t) => !t.passed).length;
	const totalPassing = testResults.filter((t) => t.passed).length;

	for (const fileMap of Array.from(coverageMap.values())) {
		for (const coverage of Array.from(fileMap.values())) {
			coverage.n_nf = totalFailing - coverage.n_cf;
			coverage.n_ns = totalPassing - coverage.n_cs;
		}
	}

	return coverageMap;
}

// ============================================
// Utility Functions
// ============================================

/**
 * カバレッジデータが有効かどうかを判定
 * @summary カバレッジ有効判定
 * @param coverage カバレッジデータ
 * @returns 有効な場合true
 */
export function isValidCoverage(coverage: CoverageData): boolean {
	return (
		coverage.n_cf >= 0 &&
		coverage.n_nf >= 0 &&
		coverage.n_cs >= 0 &&
		coverage.n_ns >= 0
	);
}

/**
 * カバレッジデータを文字列表現に変換
 * @summary カバレッジ文字列化
 * @param coverage カバレッジデータ
 * @returns 文字列表現
 */
export function coverageToString(coverage: CoverageData): string {
	return `cf=${coverage.n_cf}, nf=${coverage.n_nf}, cs=${coverage.n_cs}, ns=${coverage.n_ns}`;
}
