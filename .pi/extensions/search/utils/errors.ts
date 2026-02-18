/**
 * @abdd.meta
 * path: .pi/extensions/search/utils/errors.ts
 * role: 検索拡張機能向けのエラー型定義およびエラークラスの提供
 * why: 検索ツール全体で統一的なエラーハンドリングとユーザーへの回復ヒント提供を実現するため
 * related: .pi/extensions/search/tools/rg.ts, .pi/extensions/search/tools/fd.ts, .pi/extensions/search/indexer.ts, .pi/extensions/search/commands.ts
 * public_api: SearchErrorCategory, SearchToolError, dependencyError
 * invariants: SearchToolErrorのcategoryは必ずSearchErrorCategoryのいずれかの値を持つ、nameプロパティは常に"SearchToolError"
 * side_effects: なし（純粋な型定義とクラス定義）
 * failure_modes: なし（このモジュール自体は実行時エラーを発生させない）
 * @abdd.explain
 * overview: 検索ツールで発生するエラーを6つのカテゴリに分類し、回復ヒント付きで扱うためのエラー定義モジュール
 * what_it_does:
 *   - SearchErrorCategory型で6種類のエラーカテゴリ（dependency, parameter, execution, timeout, index, filesystem）を定義
 *   - SearchToolErrorクラスでカテゴリ・回復ヒント・原因エラーを保持するカスタムエラーを提供
 *   - format()でユーザー向け表示用のエラーメッセージを生成
 *   - toJSON()でシリアライズ可能なオブジェクトへ変換
 *   - dependencyError()で依存関係エラーのファクトリー関数を提供
 * why_it_exists:
 *   - 検索ツール（rg, fd, ctags等）で発生する多様なエラーを統一的に分類・処理するため
 *   - エラー発生時にユーザーへ具体的な回復方法を提示するため
 *   - プログラムによるエラーハンドリングをカテゴリベースで可能にするため
 * scope:
 *   in: なし
 *   out: SearchToolErrorインスタンス、SearchErrorCategory型、dependencyError関数
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
  * @param "dependency" 外部ツールが利用不可 (rg, fd, ctags)
  * @param "parameter" 入力パラメータが無効
  * @param "execution" コマンド実行の失敗
  * @param "timeout" 操作のタイムアウト
  * @param "index" インデックスに関連する問題
  * @param "filesystem" ファイルシステムのエラー (権限、未検出など)
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
  * 検索ツール用の基底エラークラス
  * @param message エラーメッセージ
  * @param category エラーのカテゴリ
  * @param recovery 回復のヒント（省略可）
  * @param cause 元のエラー（省略可）
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
	  * ユーザー向けにエラーをフォーマットする
	  * @returns フォーマットされたエラーメッセージ
	  */
	format(): string {
		let result = this.message;

		if (this.recovery) {
			result += `\nRecovery: ${this.recovery}`;
		}

		return result;
	}

	 /**
	  * JSONシリアライズ可能なオブジェクトを返す
	  * @returns エラー情報を含むオブジェクト
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
  * 依存関係エラーを作成する
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
  * パラメータ検証エラーを作成する
  * @param parameter パラメータ名
  * @param reason エラーの理由
  * @param recovery 回復手順
  * @returns SearchToolError インスタンス
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
  * コマンド実行エラーを作成する
  * @param command コマンド名
  * @param stderr 標準エラー出力
  * @param recovery 回復手段
  * @returns SearchToolError インスタンス
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
  * タイムアウトエラーを作成する
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
  * インデックス関連のエラーを作成する
  * @param message エラーメッセージ
  * @param recovery 回復方法のオプション
  * @returns 作成されたSearchToolError
  */
export function indexError(
	message: string,
	recovery?: string
): SearchToolError {
	return new SearchToolError(message, "index", recovery);
}

 /**
  * ファイルシステム操作のエラーを作成する
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
  * SearchToolErrorかどうかを判定する
  * @param error 判定対象のエラー
  * @returns SearchToolErrorの場合はtrue
  */
export function isSearchToolError(error: unknown): error is SearchToolError {
	return error instanceof SearchToolError;
}

 /**
  * エラーが特定のカテゴリか判定する
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
  * エラーメッセージを取得する
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
  * 検索操作の結果を表す型
  * @param T 成功時の値の型
  * @param E 失敗時のエラー型（デフォルトはSearchToolError）
  */
export type SearchResult<T, E = SearchToolError> =
	| { ok: true; value: T }
	| { ok: false; error: E };

/**
 * 成功結果を作成する
 * @param value 成功時の値
 * @returns 成功を表す検索結果
 */
export function ok<T>(value: T): SearchResult<T> {
	return { ok: true, value };
}

 /**
  * 失敗を表す検索結果を作成する
  * @param error エラー
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
