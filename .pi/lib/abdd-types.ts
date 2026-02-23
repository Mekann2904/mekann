/**
 * @abdd.meta
 * path: .pi/lib/abdd-types.ts
 * role: ツール全体の設定定数、エラーハンドリング構造、および共通オプションの型定義を管理するモジュール
 * why: 定数値の中央管理、型安全性の確保、エラー発生時のユーザー通知とログ出力形式の統一、および実装間でのインターフェース整合性維持のため
 * related: generate-abdd.ts, main.ts, utils.ts
 * public_api: AbddOptions, AbddError, AbddErrorCodes, DEFAULT_TIMEOUT_MS, MAX_FILE_SIZE_BYTES
 * invariants: AbddErrorCodeはAbddErrorCodesの値のみ取りうる、定数値は実行中に変更されない
 * side_effects: なし（純粋な定数・型・クラス定義）
 * failure_modes: エラーコード定義の追加漏れ、定数値の過不足によるタイムアウトやリソース制限の不整合
 * @abdd.explain
 * overview: ABDDツールの基盤となるデータ構造と静的な設定値を集約したTypeScript定義ファイル
 * what_it_does:
 *   - タイムアウト時間やファイルサイズ上限などの実行パラメータを定数として提供
 *   - AbddErrorクラスとエラーコード定数を通じて、標準化された例外処理とユーザー向けメッセージ生成機能を実装
 *   - ドライランや詳細ログ出力など、ツール全体で共通して使用されるオプションの型を定義
 * why_it_exists:
 *   - マジックナンバーの排除と定義の一元管理により、設定の変更と保守性を向上させるため
 *   - 異常系処理を型システムで補足し、エラー内容をプログラムおよびユーザーの双方に分かりやすく伝えるため
 *   - 複数のスクリプト間でデータ構造と型定義を共有し、実装の一貫性を保証するため
 * scope:
 *   in: 外部モジュールからの定数・型・クラスのインポート要求
 *   out: ツール全体で参照される定数値、エラー処理クラス、共通オプション型定義
 */

import { statSync } from "node:fs";
import { resolve as resolvePath, sep as pathSep } from "node:path";

// ============================================================================
// Constants
// ============================================================================

/** デフォルトタイムアウト（ミリ秒） */
export const DEFAULT_TIMEOUT_MS = 120000;

/** JSDoc生成タイムアウト（ミリ秒） */
export const JSDOC_TIMEOUT_MS = 300000;

/** ワークフローデフォルトタイムアウト（ミリ秒） */
export const WORKFLOW_DEFAULT_TIMEOUT_MS = 300000;

/** Mermaid並列実行制限 */
export const MERMAID_PARALLEL_LIMIT = 4;

/** 最大ファイルサイズ（バイト） */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

/** 最大ファイルサイズ（MB単位、generate-abdd.tsとの互換用） */
export const MAX_FILE_SIZE_MB = 10;

/** デフォルト並列数 */
export const DEFAULT_PARALLEL_LIMIT = 10;

/** 最大コンテキスト行数 */
export const MAX_CONTEXT_LINES = 120;

// ============================================================================
// Error Codes and Classes
// ============================================================================

/** ABDDエラーコード */
export const AbddErrorCodes = {
	/** スクリプトが見つからない */
	SCRIPT_NOT_FOUND: "SCRIPT_NOT_FOUND",
	/** パストラバーサル検出 */
	PATH_TRAVERSAL: "PATH_TRAVERSAL",
	/** タイムアウト */
	TIMEOUT: "TIMEOUT",
	/** プロセスエラー */
	PROCESS_ERROR: "PROCESS_ERROR",
	/** ファイルサイズ超過 */
	FILE_TOO_LARGE: "FILE_TOO_LARGE",
	/** キャッシュエラー */
	CACHE_ERROR: "CACHE_ERROR",
	/** LLM APIエラー */
	LLM_API_ERROR: "LLM_API_ERROR",
	/** JSDoc生成エラー */
	JSDOC_GENERATION_ERROR: "JSDOC_GENERATION_ERROR",
	/** 検証エラー */
	VALIDATION_ERROR: "VALIDATION_ERROR",
} as const;

/**
 * エラーコード型定義
 * @summary エラーコード型
 * @returns なし
 */
export type AbddErrorCode = typeof AbddErrorCodes[keyof typeof AbddErrorCodes];

/**
 * ABDDカスタムエラークラス
 * エラーハンドリングを統一し、エラー分類を明確化する
 */
export class AbddError extends Error {
	constructor(
		message: string,
		public readonly code: AbddErrorCode,
		public readonly cause?: Error
	) {
		super(message);
		this.name = "AbddError";
	}

	/**
	 * エラー情報をJSON形式で出力
	 */
	toJSON(): Record<string, unknown> {
		return {
			name: this.name,
			code: this.code,
			message: this.message,
			cause: this.cause?.message,
		};
	}

	/**
	 * ユーザー向けエラーメッセージを生成
	 */
	toUserMessage(): string {
		switch (this.code) {
			case AbddErrorCodes.SCRIPT_NOT_FOUND:
				return `スクリプトが見つかりません。scripts/ディレクトリを確認してください。\n詳細: ${this.message}`;
			case AbddErrorCodes.PATH_TRAVERSAL:
				return `無効なファイルパスが指定されました。プロジェクトディレクトリ内のファイルのみ指定可能です。`;
			case AbddErrorCodes.TIMEOUT:
				return `処理がタイムアウトしました。ファイルサイズを確認するか、タイムアウト時間を延長してください。`;
			case AbddErrorCodes.FILE_TOO_LARGE:
				return `ファイルサイズが上限（${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB）を超えています。`;
			case AbddErrorCodes.LLM_API_ERROR:
				return `LLM APIでエラーが発生しました。APIキーとネットワーク接続を確認してください。\n詳細: ${this.message}`;
			default:
				return `エラーが発生しました: ${this.message}`;
		}
	}
}

// ============================================================================
// Types
// ============================================================================

/**
 * ABDDツール共通オプション
 */
export interface AbddOptions {
	/** ドライラン（変更を適用しない） */
	dryRun?: boolean;
	/** 詳細ログ出力 */
	verbose?: boolean;
	/** 特定ファイルのみ処理 */
	file?: string;
	/** 処理数上限 */
	limit?: number;
	/** 既存JSDoc/ヘッダーも再生成 */
	regenerate?: boolean;
	/** キャッシュを無視して強制再生成 */
	force?: boolean;
	/** キャッシュを使用しない */
	noCache?: boolean;
}

/**
 * キャッシュエントリ
 */
export interface CacheEntry {
	/** キャッシュキー */
	key: string;
	/** キャッシュ内容 */
	content: string;
	/** ファイルハッシュ */
	fileHash: string;
	/** 作成日時（Unix timestamp） */
	createdAt: number;
	/** 使用したモデルID */
	modelId: string;
}

/**
 * 乖離タイプ
 */
export type DivergenceType =
	| "value_mismatch"
	| "invariant_violation"
	| "contract_breach"
	| "missing_jsdoc";

/**
 * 乖離重要度
 */
export type Severity = "low" | "medium" | "high";

/**
 * ソース参照
 */
export interface SourceReference {
	/** ソース元（ファイル名や"spec.md"など） */
	source: string;
	/** 参照テキスト */
	text: string;
}

/**
 * 乖離情報
 */
export interface Divergence {
	/** 乖離タイプ */
	type: DivergenceType;
	/** 重要度 */
	severity: Severity;
	/** 意図記述側の参照 */
	intention: SourceReference;
	/** 実態記述側の参照 */
	reality: SourceReference;
	/** 乖離理由 */
	reason: string;
}

/**
 * 乖離分析サマリー
 */
export interface DivergenceSummary {
	/** 総検出数 */
	total: number;
	/** 高重要度数 */
	high: number;
	/** 中重要度数 */
	medium: number;
	/** 低重要度数 */
	low: number;
}

/**
 * 乖離分析結果
 */
export interface DivergenceAnalysisResult {
	/** 成功フラグ */
	success: boolean;
	/** 検出された乖離リスト */
	divergences: Divergence[];
	/** サマリー */
	summary: DivergenceSummary;
	/** 警告メッセージ */
	warnings: string[];
}

/**
 * spawn実行結果
 */
export interface SpawnResult {
	/** 成功フラグ */
	success: boolean;
	/** 標準出力 */
	stdout: string;
	/** 標準エラー出力 */
	stderr: string;
	/** タイムアウトしたか */
	timedOut?: boolean;
	/** 終了コード */
	exitCode?: number;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * エラーオブジェクトからメッセージを抽出
 * @param error - 捕捉されたエラー
 * @returns エラーメッセージ文字列
 */
export function extractErrorMessage(error: unknown): string {
	if (error instanceof AbddError) {
		return error.message;
	}
	if (error instanceof Error) {
		return error.message;
	}
	try {
		return String(error);
	} catch {
		try {
			return JSON.stringify(error);
		} catch {
			return "[unstringifiable error]";
		}
	}
}

/**
 * パストラバーサル攻撃を防ぐためのパス検証
 * @param inputPath - 検証するパス
 * @param baseDir - 許可するベースディレクトリ
 * @returns 検証済みの絶対パス
 * @throws AbddError パストラバーサルが検出された場合
 */
export function validateFilePath(inputPath: string, baseDir: string): string {
	const resolved = resolvePath(baseDir, inputPath);
	const normalizedBase = resolvePath(baseDir);
	if (!resolved.startsWith(normalizedBase + pathSep) && resolved !== normalizedBase) {
		throw new AbddError(
			`Path traversal detected: ${inputPath}`,
			AbddErrorCodes.PATH_TRAVERSAL
		);
	}
	return resolved;
}

/**
 * ファイルサイズが上限内かチェック
 * @param filePath - チェックするファイルパス
 * @param maxSizeBytes - 最大サイズ（バイト）
 * @throws AbddError ファイルサイズが上限を超える場合
 */
export function validateFileSize(filePath: string, maxSizeBytes: number = MAX_FILE_SIZE_BYTES): void {
	const stats = statSync(filePath);
	if (stats.size > maxSizeBytes) {
		throw new AbddError(
			`File too large: ${filePath} (${(stats.size / 1024 / 1024).toFixed(2)}MB > ${maxSizeBytes / 1024 / 1024}MB)`,
			AbddErrorCodes.FILE_TOO_LARGE
		);
	}
}

/**
 * 日付文字列（YYYY-MM-DD）のバリデーション
 * @param dateStr - 検証する日付文字列
 * @returns 有効な場合true
 */
export function isValidDateString(dateStr: string): boolean {
	const pattern = /^\d{4}-\d{2}-\d{2}$/;
	if (!pattern.test(dateStr)) {
		return false;
	}
	const date = new Date(dateStr);
	return !isNaN(date.getTime());
}

/**
 * 日付文字列を安全にサニタイズ
 * @param input - 入力文字列
 * @returns サニタイズされた日付文字列（YYYY-MM-DD形式）
 */
export function sanitizeDateString(input: string): string {
	// 数字とハイフンのみを許可
	const sanitized = input.replace(/[^0-9-]/g, "");
	// YYYY-MM-DD形式にマッチしない場合は現在の日付を返す
	if (!isValidDateString(sanitized)) {
		return new Date().toISOString().split("T")[0];
	}
	return sanitized;
}

// ============================================================================
// generate-abdd.ts Types
// ============================================================================

/**
 * 関数情報
 */
export interface FunctionInfo {
	name: string;
	signature: string;
	line: number;
	jsDoc?: string;
	summary?: string;
	parameters: { name: string; type: string; optional: boolean }[];
	returnType: string;
	isAsync: boolean;
	isExported: boolean;
}

/**
 * クラス情報
 */
export interface ClassInfo {
	name: string;
	line: number;
	jsDoc?: string;
	methods: { name: string; signature: string; visibility: string }[];
	properties: { name: string; type: string; visibility: string }[];
	extends?: string;
	implements: string[];
	isExported: boolean;
}

/**
 * インターフェース情報
 */
export interface InterfaceInfo {
	name: string;
	line: number;
	jsDoc?: string;
	properties: { name: string; type: string; optional: boolean }[];
	methods: { name: string; signature: string }[];
	extends: string[];
	isExported: boolean;
}

/**
 * 型情報
 */
export interface TypeInfo {
	name: string;
	line: number;
	jsDoc?: string;
	definition: string;
	isExported: boolean;
}

/**
 * インポートバインディング
 */
export interface ImportBinding {
	source: string;
	localName: string;
	importedName: string;
	kind: "named" | "default" | "namespace";
}

/**
 * インポート情報
 */
export interface ImportInfo {
	source: string;
	bindings: ImportBinding[];
}

/**
 * 呼び出しノード
 */
export interface CallNode {
	name: string;
	line: number;
	signature?: string;
	targetFile?: string;
	targetFunction?: string;
}

/**
 * ツール情報
 */
export interface ToolInfo {
	name: string;
	label: string;
	description: string;
	line: number;
	parameters?: string;
	returnType?: string;
}

/**
 * ファイル情報（generate-abdd用）
 */
export interface FileInfo {
	path: string;
	relativePath: string;
	functions: FunctionInfo[];
	classes: ClassInfo[];
	interfaces: InterfaceInfo[];
	types: TypeInfo[];
	imports: ImportInfo[];
	exports: string[];
	tools: ToolInfo[];
	calls: CallNode[];
}

/**
 * クロスファイルキャッシュ
 */
export interface CrossFileCache {
	fileInfos: Map<string, FileInfo>;
	exportMap: Map<string, { file: string; type: "function" | "class" | "interface" | "type" }>;
}

/**
 * TypeCheckerコンテキスト
 */
export interface TypeCheckerContext {
	program: unknown;
	checker: unknown;
	sourceFiles: Map<string, unknown>;
}

/**
 * ジェネレータオプション
 */
export interface GeneratorOptions {
	dryRun: boolean;
	verbose: boolean;
	file?: string;
	skipMermaidValidation?: boolean;
}

/**
 * ジェネレータコンテキスト
 */
export interface GeneratorContext {
	options: GeneratorOptions;
	crossFileCache: CrossFileCache;
	typeChecker: TypeCheckerContext | null;
}

/**
 * ジェネレータコンテキストを作成
 */
export function createGeneratorContext(options: GeneratorOptions): GeneratorContext {
	return {
		options,
		crossFileCache: {
			fileInfos: new Map(),
			exportMap: new Map(),
		},
		typeChecker: null,
	};
}
