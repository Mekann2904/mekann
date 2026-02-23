/**
 * @abdd.meta
 * path: .pi/extensions/search/utils/errors.ts
 * role: 検索機能における例外型定義および生成ファクトリ
 * why: 検索ツール固有のエラー分類と復旧ヒントを一元化し、エラーハンドリングとユーザー案内を標準化するため
 * related: .pi/extensions/search/tools/base.ts, .pi/extensions/search/utils/logger.ts, .pi/extensions/search/index.ts
 * public_api: SearchErrorCategory, SearchToolError, dependencyError
 * invariants: SearchToolErrorのcategoryプロパティは必ずSearchErrorCategoryのリテラル値を含む
 * side_effects: なし
 * failure_modes: 不正なカテゴリが渡された場合の挙動はTypeScriptの型チェックに依存する
 * @abdd.explain
 * overview: 検索拡張機能専用のエラークラス、列挙型、および生成ヘルパーを定義するモジュール
 * what_it_does:
 *   - エラーを6つのカテゴリ（dependency, parameter, execution, timeout, index, filesystem）に分類する型定義を提供する
 *   - エラーメッセージ、復旧提案、原因エラーを保持するSearchToolErrorクラスを定義する
 *   - エラーの整形出力やJSONシリアライズ機能を実装する
 *   - 特定のエラーパターンを生成するファクトリ関数（dependencyError等）を提供する
 * why_it_exists:
 *   - 標準のErrorオブジェクトでは不十分な検索ツール固有の文脈（外部ツールの欠如など）を明確にするため
 *   - ユーザーへの復旧提案（recovery）をエラー構造に含めることでUXを向上させるため
 *   - プログラム上でのエラー分類処理を容易にするため
 * scope:
 *   in: エラーメッセージ文字列、カテゴリ種別、復旧ヒント、原因エラーオブジェクト
 *   out: SearchToolErrorインスタンス、フォーマット済み文字列、JSONシリアライズオブジェクト
 */

/**
 * Search Extension Error Types
 *
 * Categorized error types with recovery hints for better error handling
 * and user guidance across all search tools.
 */

// ============================================
// Error Categories
// ============================================

/**
 * 検索ツールのエラー区分
 * @summary エラー区分
 * @returns エラー種別の文字列リテラル
 */
export type SearchErrorCategory =
	| "dependency"   // External tool not available (rg, fd, ctags)
	| "parameter"    // Invalid input parameters
	| "execution"    // Command execution failed
	| "timeout"      // Operation timed out
	| "index"        // Index-related issues
	| "filesystem";  // File system errors (permission, not found, etc.)

// ============================================
// SearchToolError Class
// ============================================

/**
 * 検索ツールエラーを定義
 * @summary エラー定義
 * @returns 生成されたエラーインスタンス
 */
export class SearchToolError extends Error {
	/**
	 * Category of the error for programmatic handling.
	 */
	public readonly category: SearchErrorCategory;

	/**
	 * Optional recovery suggestion for the user.
	 */
	public readonly recovery?: string;

	/**
	 * Original error that caused this error, if any.
	 */
	public readonly cause?: Error;

	constructor(
		message: string,
		category: SearchErrorCategory,
		recovery?: string,
		cause?: Error
	) {
		super(message);
		this.name = "SearchToolError";
		this.category = category;
		this.recovery = recovery;
		this.cause = cause;

		// Maintain proper stack trace in V8 environments
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, SearchToolError);
		}
	}

	/**
	 * エラーメッセージ整形
	 * @summary エラーメッセージ整形
	 * @returns 整形済みメッセージ
	 */
	format(): string {
		let result = this.message;

		if (this.recovery) {
			result += `\nRecovery: ${this.recovery}`;
		}

		return result;
	}

	/**
	 * JSONオブジェクト化
	 * @summary JSONオブジェクト化
	 * @returns シリアライズデータ
	 */
	toJSON(): {
		name: string;
		message: string;
		category: SearchErrorCategory;
		recovery?: string;
	} {
		return {
			name: this.name,
			message: this.message,
			category: this.category,
			recovery: this.recovery,
		};
	}
}

// ============================================
// Error Factory Functions
// ============================================

/**
 * 依存関係エラー生成
 * @summary 依存関係エラー生成
 * @param tool ツール名
 * @param recovery 回復方法
 * @returns 検索ツールエラー
 */
export function dependencyError(
	tool: string,
	recovery?: string
): SearchToolError {
	const defaultRecovery = getInstallHint(tool);
	return new SearchToolError(
		`${tool} not found. Please install ${tool} to use this feature.`,
		"dependency",
		recovery ?? defaultRecovery
	);
}

/**
 * Get installation hint for common tools.
 */
function getInstallHint(tool: string): string {
	const hints: Record<string, string> = {
		rg: "Install ripgrep: brew install ripgrep (macOS) or apt install ripgrep (Ubuntu)",
		fd: "Install fd: brew install fd (macOS) or apt install fd-find (Ubuntu)",
		ctags:
			"Install universal-ctags: brew install universal-ctags (macOS) or apt install universal-ctags (Ubuntu)",
	};

	return hints[tool] ?? `Please install ${tool} to your system PATH.`;
}

/**
 * パラメータエラー生成
 * @summary パラメータエラー生成
 * @param parameter パラメータ名
 * @param reason エラー理由
 * @param recovery 回復方法
 * @returns 検索ツールエラー
 */
export function parameterError(
	parameter: string,
	reason: string,
	recovery?: string
): SearchToolError {
	return new SearchToolError(
		`Invalid parameter '${parameter}': ${reason}`,
		"parameter",
		recovery
	);
}

/**
 * 実行エラー生成
 * @summary 実行エラー生成
 * @param command コマンド文字列
 * @param stderr 標準エラー出力
 * @param recovery 回復方法
 * @returns 検索ツールエラー
 */
export function executionError(
	command: string,
	stderr: string,
	recovery?: string
): SearchToolError {
	const message = stderr
		? `Command '${command}' failed: ${stderr}`
		: `Command '${command}' failed`;

	return new SearchToolError(message, "execution", recovery);
}

/**
 * タイムアウトエラー生成
 * @summary タイムアウトエラー生成
 * @param operation 操作名
 * @param timeoutMs タイムアウト時間（ミリ秒）
 * @param recovery 回復手順（省略可）
 * @returns SearchToolError インスタンス
 */
export function timeoutError(
	operation: string,
	timeoutMs: number,
	recovery?: string
): SearchToolError {
	return new SearchToolError(
		`Operation '${operation}' timed out after ${timeoutMs}ms`,
		"timeout",
		recovery ?? "Try reducing the search scope or increasing the timeout."
	);
}

/**
 * エラーを生成
 * @summary FSエラーを生成
 * @param operation 操作内容
 * @param path パス
 * @param cause 原因
 * @returns 検索ツールエラー
 */
export function indexError(
	message: string,
	recovery?: string
): SearchToolError {
	return new SearchToolError(message, "index", recovery);
}

/**
 * ファイルシステムエラーを作成
 * @summary ファイルシステムエラー生成
 * @param operation 操作内容
 * @param path ファイルパス
 * @param cause 元となったエラー
 * @returns 検索ツールエラー
 */
export function filesystemError(
	operation: string,
	path: string,
	cause?: Error
): SearchToolError {
	return new SearchToolError(
		`Filesystem error during ${operation}: ${path}`,
		"filesystem",
		cause?.message,
		cause
	);
}

// ============================================
// Error Detection Utilities
// ============================================

/**
 * カテゴリ判定
 * @summary エラーカテゴリを判定
 * @param error 検査対象
 * @param category カテゴリ
 * @returns 一致するか
 */
export function isSearchToolError(error: unknown): error is SearchToolError {
	return error instanceof SearchToolError;
}

/**
 * @summary エラーカテゴリ判定
 * @param error 検査対象のエラー
 * @param category 判定するカテゴリ
 * @returns 一致する場合はtrue
 */
export function isErrorCategory(
	error: unknown,
	category: SearchErrorCategory
): boolean {
	return isSearchToolError(error) && error.category === category;
}

/**
 * エラーメッセージを取得
 * @summary エラーメッセージ取得
 * @param error エラーオブジェクト
 * @returns エラーメッセージ
 */
export function getErrorMessage(error: unknown): string {
	if (isSearchToolError(error)) {
		return error.format();
	}

	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}

// ============================================
// Result Type Helpers
// ============================================

/**
 * @summary エラーメッセージ取得
 * @param error エラー未知数
 * @returns エラーメッセージ文字列
 */
export type SearchResult<T, E = SearchToolError> =
	| { ok: true; value: T }
	| { ok: false; error: E };

/**
 * @summary 成功判定
 * @param result 検索結果
 * @returns 成功した場合はtrue
 */
export function ok<T>(value: T): SearchResult<T> {
	return { ok: true, value };
}

/**
 * @summary 失敗結果生成
 * @param error エラー情報
 * @returns 失敗した検索結果
 */
export function err<E = SearchToolError>(error: E): SearchResult<never, E> {
	return { ok: false, error };
}

/**
 * Check if a result is successful.
 */
export function isOk<T, E>(result: SearchResult<T, E>): result is { ok: true; value: T } {
	return result.ok === true;
}

 /**
  * 検索結果が失敗か判定する
  * @param result 検索結果
  * @returns 失敗の場合true
  */
export function isErr<T, E>(result: SearchResult<T, E>): result is { ok: false; error: E } {
	return result.ok === false;
}
