/**
 * @abdd.meta
 * path: .pi/lib/spec-analyzer.ts
 * role: TypeScript AST解析から仕様情報を抽出するライブラリ
 * why: 実装コードから自動的にspec-ai.mdを生成するため
 * related: scripts/generate-spec-ai.ts, .pi/lib/abdd-types.ts, .pi/extensions/abdd.ts
 * public_api: SpecAnalyzer, analyzeCodebase, extractSubsystems, parseAbddMeta, SpecInfo, SubsystemInfo
 * invariants: AST解析はTypeScript Compiler APIを使用、ファイルサイズ制限（MAX_FILE_SIZE_BYTES）を遵守
 * side_effects: ファイルシステム読み込み
 * failure_modes: 大きなファイルの解析タイムアウト、循環参照の無限ループ、@abdd.metaパース失敗
 * @abdd.explain
 * overview: TypeScriptソースコードを解析し、システム全体の仕様情報を抽出するライブラリ
 * what_it_does:
 *   - サブシステムの境界を検出（責務、主要ファイル、依存関係）
 *   - データフローを追跡（モジュール間のデータの流れ）
 *   - 状態遷移を抽出（状態マシンパターンの検出）
 *   - @abdd.metaヘッダーから契約・不変条件を抽出
 * why_it_exists:
 *   - 人間が手動で仕様書を更新する負担を軽減するため
 *   - 実装と仕様の乖離を自動検出可能にするため
 *   - 全体像を把握しやすいドキュメントを自動生成するため
 * scope:
 *   in: .pi/extensions/*.ts, .pi/lib/*.ts
 *   out: SpecInfo（subsystems, dataFlows, stateTransitions, contracts, invariants）
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";
import { MAX_FILE_SIZE_BYTES } from "./abdd-types.js";

// ============================================================================
// Constants
// ============================================================================

const ROOT_DIR = process.cwd();
const EXTENSIONS_DIR = path.join(ROOT_DIR, ".pi", "extensions");
const LIB_DIR = path.join(ROOT_DIR, ".pi", "lib");

/** サブシステムとみなす最小ファイル数 */
const MIN_SUBSYSTEM_FILES = 1;

/** 依存関係の最大追跡深度 */
const MAX_DEPENDENCY_DEPTH = 5;

/** 無視するディレクトリ名 */
const IGNORE_DIRS = new Set(["node_modules", "dist", "build", ".git", "coverage"]);

// ============================================================================
// Types
// ============================================================================

/**
 * サブシステム情報
 * @summary サブシステム定義
 */
export interface SubsystemInfo {
	/** サブシステム名（ディレクトリ名または主要ファイル名） */
	name: string;
	/** 責務の説明（@abdd.metaから抽出） */
	responsibility: string;
	/** 主要ファイルのパス（相対パス） */
	mainFiles: string[];
	/** エクスポートされているシンボル */
	exports: string[];
	/** 依存している他サブシステム */
	dependencies: string[];
	/** @abdd.metaから抽出された情報 */
	abddMeta?: AbddMetaInfo;
}

/**
 * データフロー情報
 * @summary データフロー定義
 */
export interface DataFlow {
	/** 送信元サブシステム/モジュール */
	from: string;
	/** 受信先サブシステム/モジュール */
	to: string;
	/** データ型/インターフェース名 */
	dataType: string;
	/** トリガー（関数呼び出し、イベント等） */
	trigger: string;
	/** ソースファイル */
	sourceFile: string;
	/** 行番号 */
	line: number;
}

/**
 * 状態遷移情報
 * @summary 状態遷移定義
 */
export interface StateTransition {
	/** サブシステム/クラス名 */
	context: string;
	/** 状態一覧 */
	states: string[];
	/** 遷移一覧 */
	transitions: {
		from: string;
		to: string;
		event: string;
		guard?: string;
	}[];
	/** 初期状態 */
	initialState: string;
	/** 終了状態一覧 */
	finalStates: string[];
	/** ソースファイル */
	sourceFile: string;
}

/**
 * 契約情報
 * @summary 契約定義
 */
export interface ContractInfo {
	/** 契約名（インターフェース名や関数名） */
	name: string;
	/** 種別: interface, function, class */
	kind: "interface" | "function" | "class";
	/** 定義元ファイル */
	sourceFile: string;
	/** 行番号 */
	line: number;
	/** シグネチャ */
	signature: string;
	/** 事前条件 */
	preconditions: string[];
	/** 事後条件 */
	postconditions: string[];
	/** 不変条件 */
	invariants: string[];
	/** 失敗モード */
	failureModes: string[];
	/** @abdd.metaから抽出 */
	fromAbddMeta: boolean;
}

/**
 * 不変条件情報
 * @summary 不変条件定義
 */
export interface InvariantInfo {
	/** 不変条件ID */
	id: string;
	/** 内容 */
	condition: string;
	/** カテゴリ: error_handling, concurrency, security, data_integrity */
	category: string;
	/** 検出元: abdd_meta, bug_fix, test_failure, design */
	detectedFrom: "abdd_meta" | "bug_fix" | "test_failure" | "design";
	/** 関連ファイル */
	relatedFiles: string[];
	/** 検出日時 */
	detectedAt: string;
	/** 重要度 */
	severity: "low" | "medium" | "high";
}

/**
 * @abdd.metaヘッダー情報
 * @summary ABDDメタデータ
 */
export interface AbddMetaInfo {
	path: string;
	role: string;
	why: string;
	related: string[];
	public_api: string[];
	invariants: string[];
	side_effects: string[];
	failure_modes: string[];
}

/**
 * 仕様情報（全体）
 * @summary 仕様情報統合
 */
export interface SpecInfo {
	/** サブシステム一覧 */
	subsystems: SubsystemInfo[];
	/** データフロー一覧 */
	dataFlows: DataFlow[];
	/** 状態遷移一覧（コンテキスト名 → 状態遷移） */
	stateTransitions: Map<string, StateTransition>;
	/** 契約一覧 */
	contracts: ContractInfo[];
	/** 不変条件一覧 */
	invariants: InvariantInfo[];
	/** 解析メタデータ */
	metadata: {
		analyzedAt: string;
		fileCount: number;
		subsystemCount: number;
	};
}

/**
 * 解析オプション
 * @summary 解析オプション
 */
export interface AnalyzeOptions {
	/** 拡張機能ディレクトリ */
	extensionsDir?: string;
	/** ライブラリディレクトリ */
	libDir?: string;
	/** 詳細ログ */
	verbose?: boolean;
	/** 最大ファイル数 */
	maxFiles?: number;
}

// ============================================================================
// @abdd.meta Parser
// ============================================================================

/**
 * ファイルから@abdd.metaヘッダーを抽出・解析
 * @summary ABDDメタ抽出
 * @param filePath - ファイルパス
 * @returns AbddMetaInfo または null（ヘッダーがない場合）
 */
export function parseAbddMeta(filePath: string): AbddMetaInfo | null {
	if (!fs.existsSync(filePath)) {
		return null;
	}

	const content = fs.readFileSync(filePath, "utf-8");
	
	// @abdd.meta ブロックを検索
	const metaMatch = content.match(/\/\*\*\s*@abdd\.meta\s*([\s\S]*?)\*\//);
	if (!metaMatch) {
		return null;
	}

	const metaBlock = metaMatch[1];
	
	// 各フィールドを抽出
	const extractField = (fieldName: string): string => {
		const regex = new RegExp(`${fieldName}:\\s*(.+?)(?:\\n|$)`, "i");
		const match = metaBlock.match(regex);
		return match ? match[1].trim() : "";
	};

	const extractArray = (fieldName: string): string[] => {
		const regex = new RegExp(`${fieldName}:\\s*(.+?)(?:\\n|$)`, "i");
		const match = metaBlock.match(regex);
		if (!match) return [];
		const value = match[1].trim();
		// カンマ区切りまたはスペース区切りを配列に変換
		return value.split(/,\s*|\s+/).filter(Boolean);
	};

	return {
		path: extractField("path"),
		role: extractField("role"),
		why: extractField("why"),
		related: extractArray("related"),
		public_api: extractArray("public_api"),
		invariants: extractArray("invariants"),
		side_effects: extractArray("side_effects"),
		failure_modes: extractArray("failure_modes"),
	};
}

// ============================================================================
// AST Analyzer
// ============================================================================

/**
 * TypeScriptファイルをAST解析して情報を抽出
 * @summary AST解析
 * @param filePath - ファイルパス
 * @param baseDir - ベースディレクトリ（相対パス計算用）
 * @returns 抽出された情報
 */
function analyzeTypeScriptFile(
	filePath: string,
	baseDir: string
): {
	exports: string[];
	imports: { source: string; bindings: string[] }[];
	functions: { name: string; signature: string }[];
	classes: { name: string; methods: string[] }[];
	interfaces: { name: string; properties: string[] }[];
} {
	const content = fs.readFileSync(filePath, "utf-8");
	const sourceFile = ts.createSourceFile(
		filePath,
		content,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX
	);

	const exports: string[] = [];
	const imports: { source: string; bindings: string[] }[] = [];
	const functions: { name: string; signature: string }[] = [];
	const classes: { name: string; methods: string[] }[] = [];
	const interfaces: { name: string; properties: string[] }[] = [];

	function visit(node: ts.Node) {
		// インポート
		if (ts.isImportDeclaration(node)) {
			const source = node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, "");
			const bindings: string[] = [];
			if (node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
				for (const spec of node.importClause.namedBindings.elements) {
					bindings.push(spec.name.getText(sourceFile));
				}
			}
			imports.push({ source, bindings });
		}

		// エクスポート
		if (ts.isExportDeclaration(node)) {
			// export { ... } from '...'
		}

		// 関数
		if (ts.isFunctionDeclaration(node) && node.name) {
			const name = node.name.getText(sourceFile);
			const isExported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
			if (isExported) {
				exports.push(name);
			}
			const params = node.parameters.map(p => p.name.getText(sourceFile)).join(", ");
			const returnType = node.type?.getText(sourceFile) || "void";
			functions.push({
				name,
				signature: `${name}(${params}): ${returnType}`,
			});
		}

		// クラス
		if (ts.isClassDeclaration(node) && node.name) {
			const name = node.name.getText(sourceFile);
			const isExported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
			if (isExported) {
				exports.push(name);
			}
			const methods = node.members
				.filter(ts.isMethodDeclaration)
				.map(m => m.name.getText(sourceFile));
			classes.push({ name, methods });
		}

		// インターフェース
		if (ts.isInterfaceDeclaration(node)) {
			const name = node.name.getText(sourceFile);
			const isExported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
			if (isExported) {
				exports.push(name);
			}
			const properties = node.members
				.filter(ts.isPropertySignature)
				.map(m => m.name.getText(sourceFile));
			interfaces.push({ name, properties });
		}

		ts.forEachChild(node, visit);
	}

	visit(sourceFile);

	return { exports, imports, functions, classes, interfaces };
}

// ============================================================================
// Subsystem Detection
// ============================================================================

/**
 * ディレクトリ構造からサブシステムを検出
 * @summary サブシステム検出
 * @param options - 解析オプション
 * @returns サブシステム一覧
 */
export function extractSubsystems(options: AnalyzeOptions = {}): SubsystemInfo[] {
	const extensionsDir = options.extensionsDir || EXTENSIONS_DIR;
	const libDir = options.libDir || LIB_DIR;
	const subsystems: SubsystemInfo[] = [];

	// 1. extensions/ のサブディレクトリをサブシステムとして扱う
	if (fs.existsSync(extensionsDir)) {
		const entries = fs.readdirSync(extensionsDir, { withFileTypes: true });
		
		for (const entry of entries) {
			if (IGNORE_DIRS.has(entry.name)) continue;
			
			if (entry.isDirectory()) {
				// サブディレクトリ = サブシステム
				const subsystemPath = path.join(extensionsDir, entry.name);
				const subsystem = analyzeSubsystemDirectory(subsystemPath, ".pi/extensions", options.verbose);
				if (subsystem) {
					subsystems.push(subsystem);
				}
			}
		}
	}

	// 2. lib/ の各ファイルを独立したサブシステムとして扱う（またはグループ化）
	if (fs.existsSync(libDir)) {
		const libFiles = collectTypeScriptFiles(libDir);
		
		// lib/はフラットな構造なので、関連ファイルをグループ化
		// とりあえず各ファイルを独立して扱う
		for (const filePath of libFiles) {
			const relativePath = path.relative(ROOT_DIR, filePath);
			const name = path.basename(filePath, ".ts");
			
			const abddMeta = parseAbddMeta(filePath);
			const analyzed = analyzeTypeScriptFile(filePath, libDir);
			
			subsystems.push({
				name: `lib/${name}`,
				responsibility: abddMeta?.role || "",
				mainFiles: [relativePath],
				exports: analyzed.exports,
				dependencies: extractDependencies(analyzed.imports, libDir, filePath),
				abddMeta: abddMeta || undefined,
			});
		}
	}

	// 3. extensions/ 直下のファイルもサブシステムとして扱う
	if (fs.existsSync(extensionsDir)) {
		const extensionFiles = collectTypeScriptFiles(extensionsDir);
		
		for (const filePath of extensionFiles) {
			const relativePath = path.relative(ROOT_DIR, filePath);
			const name = path.basename(filePath, ".ts");
			
			const abddMeta = parseAbddMeta(filePath);
			const analyzed = analyzeTypeScriptFile(filePath, extensionsDir);
			
			subsystems.push({
				name: `extensions/${name}`,
				responsibility: abddMeta?.role || "",
				mainFiles: [relativePath],
				exports: analyzed.exports,
				dependencies: extractDependencies(analyzed.imports, extensionsDir, filePath),
				abddMeta: abddMeta || undefined,
			});
		}
	}

	return subsystems;
}

/**
 * ディレクトリを解析してサブシステム情報を構築
 * @summary ディレクトリ解析
 */
function analyzeSubsystemDirectory(
	dirPath: string,
	basePath: string,
	verbose?: boolean
): SubsystemInfo | null {
	const files = collectTypeScriptFiles(dirPath);
	if (files.length < MIN_SUBSYSTEM_FILES) {
		return null;
	}

	const name = path.basename(dirPath);
	const relativeFiles = files.map(f => path.relative(ROOT_DIR, f));
	
	// 全ファイルの情報をマージ
	const allExports: string[] = [];
	const allDependencies: string[] = [];
	let primaryMeta: AbddMetaInfo | null = null;

	for (const filePath of files) {
		const analyzed = analyzeTypeScriptFile(filePath, dirPath);
		allExports.push(...analyzed.exports);
		
		const deps = extractDependencies(analyzed.imports, dirPath, filePath);
		allDependencies.push(...deps);

		// 最初の@abdd.metaを優先使用
		if (!primaryMeta) {
			primaryMeta = parseAbddMeta(filePath);
		}
	}

	return {
		name,
		responsibility: primaryMeta?.role || "",
		mainFiles: relativeFiles,
		exports: [...new Set(allExports)],
		dependencies: [...new Set(allDependencies)],
		abddMeta: primaryMeta || undefined,
	};
}

/**
 * インポートから依存関係を抽出
 * @summary 依存関係抽出
 */
function extractDependencies(
	imports: { source: string; bindings: string[] }[],
	baseDir: string,
	currentFile: string
): string[] {
	const dependencies: string[] = [];

	for (const imp of imports) {
		// 相対インポートのみを依存関係として扱う
		if (imp.source.startsWith(".")) {
			// パスを正規化
			const resolvedPath = path.resolve(path.dirname(currentFile), imp.source);
			const relativeToRoot = path.relative(ROOT_DIR, resolvedPath);
			
			// サブシステム名を推測
			const parts = relativeToRoot.split(path.sep);
			if (parts.length >= 2) {
				// .pi/extensions/subsystem-name/file -> subsystem-name
				// .pi/lib/file -> lib/file
				if (parts[0] === ".pi" && parts[1] === "extensions" && parts.length >= 3) {
					dependencies.push(parts[2]);
				} else if (parts[0] === ".pi" && parts[1] === "lib" && parts.length >= 3) {
					dependencies.push(`lib/${parts[2]}`);
				}
			}
		}
	}

	return [...new Set(dependencies)];
}

// ============================================================================
// Data Flow Extraction
// ============================================================================

/**
 * データフローを抽出
 * @summary データフロー抽出
 * @param subsystems - サブシステム一覧
 * @param options - 解析オプション
 * @returns データフロー一覧
 */
export function extractDataFlows(
	subsystems: SubsystemInfo[],
	options: AnalyzeOptions = {}
): DataFlow[] {
	const dataFlows: DataFlow[] = [];
	const subsystemMap = new Map(subsystems.map(s => [s.name, s]));

	for (const subsystem of subsystems) {
		for (const dep of subsystem.dependencies) {
			const targetSubsystem = subsystemMap.get(dep);
			if (targetSubsystem) {
				// 依存関係 = データフロー
				dataFlows.push({
					from: subsystem.name,
					to: dep,
					dataType: "import",
					trigger: "module_import",
					sourceFile: subsystem.mainFiles[0] || "",
					line: 0,
				});
			}
		}
	}

	return dataFlows;
}

// ============================================================================
// Main Analyzer
// ============================================================================

/**
 * コードベース全体を解析
 * @summary コードベース解析
 * @param options - 解析オプション
 * @returns 仕様情報
 */
export async function analyzeCodebase(options: AnalyzeOptions = {}): Promise<SpecInfo> {
	const startTime = Date.now();
	const verbose = options.verbose || false;

	if (verbose) {
		console.log("Starting codebase analysis...");
	}

	// 1. サブシステムを検出
	const subsystems = extractSubsystems(options);
	if (verbose) {
		console.log(`Found ${subsystems.length} subsystems`);
	}

	// 2. データフローを抽出
	const dataFlows = extractDataFlows(subsystems, options);
	if (verbose) {
		console.log(`Found ${dataFlows.length} data flows`);
	}

	// 3. 契約を抽出（@abdd.metaから）
	const contracts = extractContracts(subsystems, options);
	if (verbose) {
		console.log(`Found ${contracts.length} contracts`);
	}

	// 4. 不変条件を抽出（@abdd.metaから）
	const invariants = extractInvariants(subsystems, options);
	if (verbose) {
		console.log(`Found ${invariants.length} invariants`);
	}

	// 5. 状態遷移を検出（TODO: 実装）
	const stateTransitions = new Map<string, StateTransition>();

	const metadata = {
		analyzedAt: new Date().toISOString(),
		fileCount: subsystems.reduce((sum, s) => sum + s.mainFiles.length, 0),
		subsystemCount: subsystems.length,
	};

	if (verbose) {
		console.log(`Analysis completed in ${Date.now() - startTime}ms`);
	}

	return {
		subsystems,
		dataFlows,
		stateTransitions,
		contracts,
		invariants,
		metadata,
	};
}

/**
 * @abdd.metaから契約を抽出
 * @summary 契約抽出
 */
function extractContracts(subsystems: SubsystemInfo[], options: AnalyzeOptions): ContractInfo[] {
	const contracts: ContractInfo[] = [];

	for (const subsystem of subsystems) {
		if (!subsystem.abddMeta) continue;

		// public_apiの各要素を契約として扱う
		for (const api of subsystem.abddMeta.public_api) {
			contracts.push({
				name: api,
				kind: "function", // 推測
				sourceFile: subsystem.mainFiles[0] || "",
				line: 0,
				signature: api,
				preconditions: [],
				postconditions: [],
				invariants: subsystem.abddMeta.invariants,
				failureModes: subsystem.abddMeta.failure_modes,
				fromAbddMeta: true,
			});
		}
	}

	return contracts;
}

/**
 * @abdd.metaから不変条件を抽出
 * @summary 不変条件抽出
 */
function extractInvariants(subsystems: SubsystemInfo[], options: AnalyzeOptions): InvariantInfo[] {
	const invariants: InvariantInfo[] = [];
	let invariantId = 1;

	for (const subsystem of subsystems) {
		if (!subsystem.abddMeta) continue;

		for (const invariant of subsystem.abddMeta.invariants) {
			invariants.push({
				id: `INV-${String(invariantId++).padStart(3, "0")}`,
				condition: invariant,
				category: categorizeInvariant(invariant),
				detectedFrom: "abdd_meta",
				relatedFiles: subsystem.mainFiles,
				detectedAt: new Date().toISOString(),
				severity: "medium",
			});
		}
	}

	return invariants;
}

/**
 * 不変条件をカテゴリ分類
 * @summary カテゴリ分類
 */
function categorizeInvariant(invariant: string): string {
	const lower = invariant.toLowerCase();

	if (lower.includes("error") || lower.includes("retry") || lower.includes("timeout")) {
		return "error_handling";
	}
	if (lower.includes("concurrent") || lower.includes("parallel") || lower.includes("lock")) {
		return "concurrency";
	}
	if (lower.includes("auth") || lower.includes("permission") || lower.includes("secret")) {
		return "security";
	}
	return "data_integrity";
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * ディレクトリ内のTypeScriptファイルを再帰的に収集
 * @summary TSファイル収集
 */
function collectTypeScriptFiles(dir: string): string[] {
	const files: string[] = [];

	if (!fs.existsSync(dir)) {
		return files;
	}

	const entries = fs.readdirSync(dir, { withFileTypes: true });

	for (const entry of entries) {
		if (IGNORE_DIRS.has(entry.name)) continue;

		const fullPath = path.join(dir, entry.name);

		if (entry.isDirectory()) {
			files.push(...collectTypeScriptFiles(fullPath));
		} else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
			// ファイルサイズチェック
			const stats = fs.statSync(fullPath);
			if (stats.size <= MAX_FILE_SIZE_BYTES) {
				files.push(fullPath);
			}
		}
	}

	return files;
}
