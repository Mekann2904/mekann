/**
 * @abdd.meta
 * path: .pi/extensions/search/locagent/builder.ts
 * role: LocAgent異種グラフの構築
 * why: 要素レベル（directory/file/class/function）の異種グラフを構築
 * related: .pi/extensions/search/locagent/types.ts, .pi/extensions/search/repograph/builder.ts
 * public_api: buildLocAgentGraph, getLocAgentSourceFiles, extractInheritance
 * invariants:
 * - ノードIDは完全修飾名形式（src/utils.ts:MathUtils.calculate_sum）
 * - directoryノードはパスをIDとする
 * - 標準ライブラリのimportはフィルタリング
 * side_effects:
 * - ファイルシステムからの読み込み
 * - tree-sitter WASM文法のダウンロード（初回のみ）
 * failure_modes:
 * - ファイル読み込みエラー
 * - AST解析エラー
 * - メモリ不足（大規模リポジトリ）
 * @abdd.explain
 * overview: LocAgent論文に基づく異種グラフ構築モジュール
 * what_it_does:
 *   - ディレクトリ構造を走査してdirectory/fileノードを作成
 *   - AST解析でclass/functionノードを抽出
 *   - contain/import/invoke/inheritエッジを構築
 *   - 完全修飾名を生成してノードを一意に識別
 * why_it_exists:
 *   - LocAgent論文の「要素レベル異種グラフ」を実装
 *   - RepoGraph（行レベル）とは別の粒度でグラフを提供
 * scope:
 *   in: プロジェクトディレクトリパス
 *   out: 完全なLocAgentGraph
 */

import { readFile, readdir, stat } from "fs/promises";
import { join, dirname, basename, extname, resolve, normalize } from "path";
import type {
	LocAgentGraph,
	LocAgentNode,
	LocAgentEdge,
	LocAgentMetadata,
	LocAgentNodeType,
	LocAgentSymbolKind,
	LocAgentEdgeType,
} from "./types.js";
import { STANDARD_LIBS } from "../repograph/types.js";
import { parseFile as parseFileTreeSitter } from "../repograph/parser.js";
import { detectLanguage } from "../tree-sitter/loader.js";

// ============================================================================
// Constants
// ============================================================================

/**
 * インデックス対象のファイル拡張子
 */
const SOURCE_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".py",
]);

/**
 * 除外するディレクトリ
 */
const EXCLUDE_DIRS = new Set([
	"node_modules",
	".git",
	"dist",
	"build",
	"out",
	"__pycache__",
	".venv",
	"venv",
	"env",
	".tox",
	".mypy_cache",
	".pytest_cache",
	"coverage",
	".next",
	".nuxt",
	"vendor",
	"target",
	"bin",
	"obj",
]);

function shouldExcludeDirectory(name: string): boolean {
	return EXCLUDE_DIRS.has(name)
		|| name.startsWith(".venv")
		|| name.startsWith("venv")
		|| name === "site-packages";
}

// ============================================================================
// File System Helpers
// ============================================================================

/**
 * ソースファイルを再帰的に収集
 * @summary ソースファイル収集
 * @param path - 走査開始パス
 * @param cwd - 作業ディレクトリ
 * @returns 相対ファイルパスの配列
 */
export async function getLocAgentSourceFiles(
	path: string,
	cwd: string
): Promise<string[]> {
	const files: string[] = [];
	const baseDir = join(cwd, path);

	async function walk(dir: string): Promise<void> {
		try {
			const entries = await readdir(dir, { withFileTypes: true });

			for (const entry of entries) {
				const fullPath = join(dir, entry.name);

				if (entry.isDirectory()) {
					if (!shouldExcludeDirectory(entry.name)) {
						await walk(fullPath);
					}
				} else if (entry.isFile()) {
					const ext = extname(entry.name);
					if (SOURCE_EXTENSIONS.has(ext)) {
						files.push(fullPath.replace(cwd + "/", ""));
					}
				}
			}
		} catch {
			// 読み込みエラーは無視
		}
	}

	await walk(baseDir);
	return files;
}

/**
 * ディレクトリを再帰的に収集
 * @summary ディレクトリ収集
 * @param path - 走査開始パス
 * @param cwd - 作業ディレクトリ
 * @returns 相対ディレクトリパスの配列
 */
async function getDirectories(path: string, cwd: string): Promise<string[]> {
	const dirs: string[] = [];
	const baseDir = join(cwd, path);

	async function walk(dir: string): Promise<void> {
		try {
			const relativeDir = dir.replace(cwd + "/", "");
			if (relativeDir) {
				dirs.push(relativeDir);
			}

			const entries = await readdir(dir, { withFileTypes: true });

			for (const entry of entries) {
				if (entry.isDirectory() && !shouldExcludeDirectory(entry.name)) {
					await walk(join(dir, entry.name));
				}
			}
		} catch {
			// 読み込みエラーは無視
		}
	}

	await walk(baseDir);
	return dirs;
}

// ============================================================================
// Node ID Generation
// ============================================================================

/**
 * 完全修飾名を生成
 * @summary 完全修飾名生成
 * @param filePath - ファイルパス
 * @param scope - スコープ（クラス名等）
 * @param name - 要素名
 * @returns 完全修飾名（例: src/utils.ts:MathUtils.calculate_sum）
 */
export function generateQualifiedName(
	filePath: string,
	scope: string | undefined,
	name: string
): string {
	if (scope) {
		return `${filePath}:${scope}.${name}`;
	}
	return `${filePath}:${name}`;
}

/**
 * ディレクトリノードIDを生成
 * @summary ディレクトリID生成
 * @param dirPath - ディレクトリパス
 * @returns ディレクトリID（パスそのもの）
 */
function generateDirectoryId(dirPath: string): string {
	return dirPath;
}

/**
 * ファイルノードIDを生成
 * @summary ファイルID生成
 * @param filePath - ファイルパス
 * @returns ファイルID
 */
function generateFileId(filePath: string): string {
	return filePath;
}

// ============================================================================
// Import Path Resolution
// ============================================================================

/**
 * 相対importパスを絶対パスに解決
 * @summary importパス解決
 * @param importPath - import文のモジュールパス
 * @param fromFile - import元のファイルパス
 * @param cwd - 作業ディレクトリ
 * @param allFiles - 全ソースファイルリスト
 * @returns 解決済みファイルパス、または元のパス
 */
function resolveImportPath(
	importPath: string,
	fromFile: string,
	cwd: string,
	allFiles: string[]
): string | null {
	// 相対パスでない場合はそのまま返す
	if (!importPath.startsWith(".") && !importPath.startsWith("..")) {
		return null;
	}

	// import元ファイルのディレクトリを基準にパスを解決
	const fromDir = dirname(fromFile);
	const resolvedPath = normalize(join(fromDir, importPath));

	// 可能性のある拡張子を試す
	const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", "/index.ts", "/index.tsx", "/index.js"];

	for (const ext of extensions) {
		const candidatePath = resolvedPath + ext;
		if (allFiles.includes(candidatePath)) {
			return candidatePath;
		}
	}

	// 拡張子なしでマッチするか確認
	if (allFiles.includes(resolvedPath)) {
		return resolvedPath;
	}

	return null;
}

// ============================================================================
// AST Parsing (Tree-sitter based)
// ============================================================================

/**
 * ファイル解析結果
 */
interface ParseResult {
	classes: Array<{
		name: string;
		line: number;
		endLine: number;
		methods: Array<{
			name: string;
			line: number;
			endLine: number;
			signature: string;
			visibility: "public" | "private" | "protected";
		}>;
		properties: Array<{
			name: string;
			line: number;
			visibility: "public" | "private" | "protected";
		}>;
		parentClass?: string;
		interfaces?: string[];
	}>;
	functions: Array<{
		name: string;
		line: number;
		endLine: number;
		signature: string;
		scope?: string;
	}>;
	imports: Array<{
		module: string;
		symbols: string[];
		line: number;
	}>;
	invocations: Array<{
		caller: string;
		callee: string;
		line: number;
	}>;
}

/**
 * 行番号から現在のスコープ（関数/メソッド）を特定する
 * @summary スコープ特定
 * @param lineNum - 行番号
 * @param functions - 関数リスト
 * @param classes - クラスリスト
 * @returns 呼び出し元文字列（例: "ClassName.methodName" または "functionName"）
 */
function findCallerScope(
	lineNum: number,
	functions: ParseResult["functions"],
	classes: ParseResult["classes"]
): string | null {
	// まずクラス内メソッドをチェック
	for (const cls of classes) {
		if (lineNum >= cls.line && lineNum <= cls.endLine) {
			for (const method of cls.methods) {
				// メソッドのスコープ内にあるか（簡易: 開始行以降、次のメソッド開始前まで）
				const methodEndLine = method.endLine || cls.endLine;
				if (lineNum >= method.line && lineNum <= methodEndLine) {
					return `${cls.name}.${method.name}`;
				}
			}
		}
	}

	// クラス外の関数をチェック
	for (const func of functions) {
		// 関数のスコープ内にあるか（簡易: 開始行以降、終了行まで）
		if (lineNum >= func.line && lineNum <= func.endLine) {
			return func.name;
		}
	}

	return null;
}

/**
 * TypeScriptファイルを解析（簡易正規表現ベース）
 * @summary TypeScript解析
 * @param content - ファイル内容
 * @returns 解析結果
 * @description 本格的な実装ではtree-sitterを使用すべき
 */
function parseTypeScript(content: string): ParseResult {
	const lines = content.split("\n");
	const result: ParseResult = {
		classes: [],
		functions: [],
		imports: [],
		invocations: [],
	};

	let currentClass: ParseResult["classes"][0] | null = null;
	let braceDepth = 0;

	// 第1パス: クラス、関数、メソッドの定義を収集（終了行を推定）
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const lineNum = i + 1;

		// Import文
		const importMatch = line.match(
			/import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+['"]([^'"]+)['"]/
		);
		if (importMatch) {
			const symbols = importMatch[1]
				? importMatch[1].split(",").map((s) => s.trim())
				: [importMatch[2]];
			result.imports.push({
				module: importMatch[3],
				symbols: symbols.filter(Boolean),
				line: lineNum,
			});
		}

		// クラス定義
		const classMatch = line.match(
			/(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/
		);
		if (classMatch) {
			currentClass = {
				name: classMatch[1],
				line: lineNum,
				endLine: lineNum,
				methods: [],
				properties: [],
				parentClass: classMatch[2],
				interfaces: classMatch[3]?.split(",").map((s) => s.trim()),
			};
			result.classes.push(currentClass);
		}

		// 関数定義（クラス外）
		const funcMatch = line.match(
			/(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*(?:<[^>]+>)?\s*\(([^)]*)\)/
		);
		if (funcMatch && !currentClass) {
			result.functions.push({
				name: funcMatch[1],
				line: lineNum,
				endLine: lineNum,
				signature: `function ${funcMatch[1]}(${funcMatch[2]})`,
			});
		}

		// メソッド定義
		if (currentClass) {
			const methodMatch = line.match(
				/(?:(public|private|protected)\s+)?(?:async\s+)?(\w+)\s*(?:<[^>]+>)?\s*\(([^)]*)\)/
			);
			if (methodMatch && !["if", "for", "while", "switch"].includes(methodMatch[2])) {
				currentClass.methods.push({
					name: methodMatch[2],
					line: lineNum,
					endLine: lineNum,
					signature: `${methodMatch[2]}(${methodMatch[3]})`,
					visibility: (methodMatch[1] as "public" | "private" | "protected") || "public",
				});
			}

			// プロパティ定義
			const propMatch = line.match(
				/(?:(public|private|protected)\s+)?(?:readonly\s+)?(\w+)\s*[=:!]/
			);
			if (propMatch && !["if", "for", "while", "switch", "function", "class"].includes(propMatch[2])) {
				currentClass.properties.push({
					name: propMatch[2],
					line: lineNum,
					visibility: (propMatch[1] as "public" | "private" | "protected") || "public",
				});
			}
		}

		// ブレースカウント（クラス終了検出）
		braceDepth += (line.match(/{/g) || []).length;
		braceDepth -= (line.match(/}/g) || []).length;

		if (currentClass && braceDepth === 0 && line.includes("}")) {
			currentClass.endLine = lineNum;
			currentClass = null;
		}
	}

	// 終了行を推定: 次の同レベル要素の開始行-1、またはファイル終端
	for (const cls of result.classes) {
		// クラスの終了行は既にブレースカウントで設定済み
		// メソッドの終了行を推定
		for (let i = 0; i < cls.methods.length; i++) {
			if (i < cls.methods.length - 1) {
				cls.methods[i].endLine = cls.methods[i + 1].line - 1;
			} else {
				cls.methods[i].endLine = cls.endLine;
			}
		}
	}

	for (let i = 0; i < result.functions.length; i++) {
		if (i < result.functions.length - 1) {
			result.functions[i].endLine = result.functions[i + 1].line - 1;
		} else {
			result.functions[i].endLine = lines.length;
		}
	}

	// 第2パス: 関数呼び出しを検出し、スコープを特定
	currentClass = null;
	braceDepth = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const lineNum = i + 1;

		// クラススコープ追跡
		const classMatch = line.match(
			/(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/
		);
		if (classMatch) {
			currentClass = result.classes.find(c => c.name === classMatch[1] && c.line === lineNum) || null;
		}

		braceDepth += (line.match(/{/g) || []).length;
		braceDepth -= (line.match(/}/g) || []).length;

		if (currentClass && braceDepth === 0 && line.includes("}")) {
			currentClass = null;
		}

		// 関数呼び出し（簡易検出）
		const callMatches = line.matchAll(/(\w+)\s*\(/g);
		for (const callMatch of callMatches) {
			const calleeName = callMatch[1];

			// 現在の行のスコープを特定
			const callerScope = findCallerScope(lineNum, result.functions, result.classes);

			if (callerScope) {
				// 呼び出し元と呼び出し先が異なる場合のみ記録
				const callerName = callerScope.includes(".") ? callerScope.split(".")[1] : callerScope;
				if (calleeName !== callerName) {
					result.invocations.push({
						caller: callerScope,
						callee: calleeName,
						line: lineNum,
					});
				}
			}
		}
	}

	return result;
}

/**
 * Pythonファイルを解析（簡易正規表現ベース）
 * @summary Python解析
 * @param content - ファイル内容
 * @returns 解析結果
 */
function parsePython(content: string): ParseResult {
	const lines = content.split("\n");
	const result: ParseResult = {
		classes: [],
		functions: [],
		imports: [],
		invocations: [],
	};

	let currentClass: ParseResult["classes"][0] | null = null;
	let currentClassIndent = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const lineNum = i + 1;
		const indent = line.search(/\S/);

		// Import文
		const importMatch = line.match(/(?:from\s+(\S+)\s+)?import\s+(.+)/);
		if (importMatch) {
			const module = importMatch[1] || "";
			const symbols = importMatch[2]
				.split(",")
				.map((s) => s.trim().split(" as ")[0])
				.filter(Boolean);
			result.imports.push({
				module,
				symbols,
				line: lineNum,
			});
		}

		// クラス定義
		const classMatch = line.match(/class\s+(\w+)(?:\s*\(([^)]+)\))?:/);
		if (classMatch) {
			currentClass = {
				name: classMatch[1],
				line: lineNum,
				endLine: lineNum,
				methods: [],
				properties: [],
				parentClass: classMatch[2]?.split(",")[0].trim(),
			};
			currentClassIndent = indent;
			result.classes.push(currentClass);
		}

		// クラス終了検出（インデントベース）
		if (currentClass && indent <= currentClassIndent && line.trim() && !line.match(/class\s+\w+/)) {
			currentClass = null;
		}

		// 関数定義
		const funcMatch = line.match(/def\s+(\w+)\s*\(([^)]*)\)/);
		if (funcMatch) {
			if (currentClass) {
				// メソッド
				currentClass.methods.push({
					name: funcMatch[1],
					line: lineNum,
					endLine: lineNum,
					signature: `${funcMatch[1]}(${funcMatch[2]})`,
					visibility: funcMatch[1].startsWith("_") ? "private" : "public",
				});
			} else {
				// 関数
				result.functions.push({
					name: funcMatch[1],
					line: lineNum,
					endLine: lineNum,
					signature: `def ${funcMatch[1]}(${funcMatch[2]})`,
				});
			}
		}
	}

	return result;
}

/**
 * ファイルを解析（tree-sitterベース）
 * @summary ファイル解析
 * @param filePath - ファイルパス
 * @param content - ファイル内容
 * @returns 解析結果
 */
async function parseFileAsync(filePath: string, content: string): Promise<ParseResult> {
	const ext = extname(filePath);
	const language = detectLanguage(filePath);

	// tree-sitterサポート言語の場合はtree-sitterを使用
	if (language) {
		try {
			const { nodes, edges } = await parseFileTreeSitter(content, filePath, language);
			return convertTreeSitterResult(nodes, edges, content);
		} catch (error) {
			// tree-sitter解析に失敗した場合はフォールバック
			console.warn(`[locagent] tree-sitter parse failed for ${filePath}, using fallback:`, error);
		}
	}

	// フォールバック: 従来の正規表現ベース
	switch (ext) {
		case ".ts":
		case ".tsx":
		case ".js":
		case ".jsx":
		case ".mjs":
		case ".cjs":
			return parseTypeScript(content);
		case ".py":
			return parsePython(content);
		default:
			return {
				classes: [],
				functions: [],
				imports: [],
				invocations: [],
			};
	}
}

/**
 * tree-sitter解析結果をLocAgent形式に変換
 * @summary 結果変換
 * @param nodes - RepoGraphノード配列
 * @param edges - RepoGraphエッジ配列
 * @param content - ソースコード内容
 * @returns LocAgent解析結果
 */
function convertTreeSitterResult(
	nodes: Array<{ id: string; file: string; line: number; nodeType: string; symbolName: string; symbolKind: string; text: string }>,
	edges: Array<{ source: string; target: string; type: string; confidence: number }>,
	content: string
): ParseResult {
	const result: ParseResult = {
		classes: [],
		functions: [],
		imports: [],
		invocations: [],
	};

	const lines = content.split("\n");
	const classMap = new Map<string, ParseResult["classes"][0]>();

	// ノードを処理
	for (const node of nodes) {
		if (node.nodeType === "def") {
			if (node.symbolKind === "class" || node.symbolKind === "interface") {
				const classInfo: ParseResult["classes"][0] = {
					name: node.symbolName,
					line: node.line,
					endLine: node.line, // tree-sitterからは正確な終了行を取得できないため後で推定
					methods: [],
					properties: [],
				};
				result.classes.push(classInfo);
				classMap.set(node.symbolName, classInfo);
			} else if (node.symbolKind === "function" || node.symbolKind === "method") {
				// メソッドか関数かを判定（簡易的に行番号からクラス内か判定）
				let isMethod = false;
				for (const cls of result.classes) {
					if (node.line >= cls.line && node.line <= cls.endLine + 50) {
						// クラス内の可能性が高い
						cls.methods.push({
							name: node.symbolName,
							line: node.line,
							endLine: node.line,
							signature: node.text,
							visibility: "public",
						});
						isMethod = true;
						break;
					}
				}

				if (!isMethod) {
					result.functions.push({
						name: node.symbolName,
						line: node.line,
						endLine: node.line,
						signature: node.text,
					});
				}
			}
		} else if (node.nodeType === "import") {
			// importノードからモジュール情報を抽出
			const moduleMatch = node.text.match(/from\s+['"]([^'"]+)['"]/);
			const moduleName = moduleMatch ? moduleMatch[1] : "";

			result.imports.push({
				module: moduleName,
				symbols: [node.symbolName],
				line: node.line,
			});
		}
	}

	// エッジから呼び出し関係を抽出
	for (const edge of edges) {
		if (edge.type === "invoke") {
			// エッジのsourceから呼び出し元を特定
			const sourceParts = edge.source.split(":");
			const sourceLine = parseInt(sourceParts[1] || "0");
			const callerScope = findCallerScope(sourceLine, result.functions, result.classes);

			// targetから呼び出し先を特定
			const targetParts = edge.target.split(":");
			let calleeName = targetParts[targetParts.length - 1];
			if (calleeName.startsWith("ref:")) {
				calleeName = calleeName.replace("ref:", "");
			}

			if (callerScope && calleeName) {
				result.invocations.push({
					caller: callerScope,
					callee: calleeName,
					line: sourceLine,
				});
			}
		}
	}

	// クラスと関数の終了行を推定
	estimateEndLines(result, lines);

	return result;
}

/**
 * 終了行を推定
 * @summary 終了行推定
 * @param result - 解析結果
 * @param lines - ソースコード行配列
 */
function estimateEndLines(result: ParseResult, lines: string[]): void {
	// クラスの終了行を推定（ブレースベース）
	for (const cls of result.classes) {
		let braceDepth = 0;
		let foundStart = false;

		for (let i = cls.line - 1; i < lines.length; i++) {
			const line = lines[i];

			if (i === cls.line - 1) {
				foundStart = true;
			}

			if (foundStart) {
				braceDepth += (line.match(/{/g) || []).length;
				braceDepth -= (line.match(/}/g) || []).length;

				if (braceDepth === 0 && line.includes("}")) {
					cls.endLine = i + 1;
					break;
				}
			}
		}

		// メソッドの終了行を推定
		for (let i = 0; i < cls.methods.length; i++) {
			if (i < cls.methods.length - 1) {
				cls.methods[i].endLine = cls.methods[i + 1].line - 1;
			} else {
				cls.methods[i].endLine = cls.endLine;
			}
		}
	}

	// 関数の終了行を推定
	for (let i = 0; i < result.functions.length; i++) {
		if (i < result.functions.length - 1) {
			result.functions[i].endLine = result.functions[i + 1].line - 1;
		} else {
			result.functions[i].endLine = lines.length;
		}
	}
}

// ============================================================================
// Graph Building
// ============================================================================

/**
 * 継承関係を抽出
 * @summary 継承抽出
 * @param parseResult - 解析結果
 * @returns 継承関係の配列（クラス名→親クラス名）
 */
export function extractInheritance(
	parseResult: ParseResult
): Array<{ child: string; parent: string }> {
	const inheritance: Array<{ child: string; parent: string }> = [];

	for (const cls of parseResult.classes) {
		if (cls.parentClass) {
			inheritance.push({
				child: cls.name,
				parent: cls.parentClass,
			});
		}
	}

	return inheritance;
}

/**
 * LocAgent異種グラフを構築
 * @summary 異種グラフ構築
 * @param path - インデックス対象パス
 * @param cwd - 作業ディレクトリ
 * @returns 完全なLocAgentGraph
 */
export async function buildLocAgentGraph(
	path: string,
	cwd: string
): Promise<LocAgentGraph> {
	const nodes = new Map<string, LocAgentNode>();
	const edges: LocAgentEdge[] = [];

	// ディレクトリを収集
	const directories = await getDirectories(path, cwd);

	// ディレクトリノードを作成
	for (const dir of directories) {
		const nodeId = generateDirectoryId(dir);
		nodes.set(nodeId, {
			id: nodeId,
			name: basename(dir),
			nodeType: "directory" as LocAgentNodeType,
			symbolKind: "namespace" as LocAgentSymbolKind,
		});
	}

	// ディレクトリ間のcontainエッジを作成
	for (const dir of directories) {
		const parentDir = dirname(dir);
		if (parentDir && parentDir !== "." && directories.includes(parentDir)) {
			edges.push({
				source: generateDirectoryId(parentDir),
				target: generateDirectoryId(dir),
				type: "contain" as LocAgentEdgeType,
				confidence: 1.0,
			});
		}
	}

	// ソースファイルを収集
	const files = await getLocAgentSourceFiles(path, cwd);

	// ファイルごとに処理
	for (const file of files) {
		// ファイルノードを作成
		const fileId = generateFileId(file);
		nodes.set(fileId, {
			id: fileId,
			name: basename(file),
			nodeType: "file" as LocAgentNodeType,
			symbolKind: "namespace" as LocAgentSymbolKind,
			filePath: file,
		});

		// ファイル→ディレクトリのcontainエッジ
		const parentDir = dirname(file);
		if (parentDir && parentDir !== "." && directories.includes(parentDir)) {
			edges.push({
				source: generateDirectoryId(parentDir),
				target: fileId,
				type: "contain" as LocAgentEdgeType,
				confidence: 1.0,
			});
		}

		// ファイルを解析
		try {
			const fullPath = join(cwd, file);
			const content = await readFile(fullPath, "utf-8");
			const parseResult = await parseFileAsync(file, content);

			// クラスノードを作成
			for (const cls of parseResult.classes) {
				const classId = generateQualifiedName(file, undefined, cls.name);
				nodes.set(classId, {
					id: classId,
					name: cls.name,
					nodeType: "class" as LocAgentNodeType,
					symbolKind: "class" as LocAgentSymbolKind,
					filePath: file,
					line: cls.line,
					endLine: cls.endLine,
				});

				// ファイル→クラスのcontainエッジ
				edges.push({
					source: fileId,
					target: classId,
					type: "contain" as LocAgentEdgeType,
					confidence: 1.0,
				});

				// メソッドノードを作成
				for (const method of cls.methods) {
					const methodId = generateQualifiedName(file, cls.name, method.name);
					nodes.set(methodId, {
						id: methodId,
						name: method.name,
						nodeType: "function" as LocAgentNodeType,
						symbolKind: "method" as LocAgentSymbolKind,
						filePath: file,
						line: method.line,
						endLine: method.endLine,
						signature: method.signature,
						scope: cls.name,
						visibility: method.visibility,
					});

					// クラス→メソッドのcontainエッジ
					edges.push({
						source: classId,
						target: methodId,
						type: "contain" as LocAgentEdgeType,
						confidence: 1.0,
					});
				}
			}

			// 関数ノードを作成（クラス外）
			for (const func of parseResult.functions) {
				const funcId = generateQualifiedName(file, func.scope, func.name);
				nodes.set(funcId, {
					id: funcId,
					name: func.name,
					nodeType: "function" as LocAgentNodeType,
					symbolKind: "function" as LocAgentSymbolKind,
					filePath: file,
					line: func.line,
					endLine: func.endLine,
					signature: func.signature,
					scope: func.scope,
				});

				// ファイル→関数のcontainエッジ
				edges.push({
					source: fileId,
					target: funcId,
					type: "contain" as LocAgentEdgeType,
					confidence: 1.0,
				});
			}

			// importエッジを作成
			for (const imp of parseResult.imports) {
				// 標準ライブラリをフィルタリング
				if (!STANDARD_LIBS.has(imp.module)) {
					// 相対importパスを解決
					const resolvedModule = resolveImportPath(imp.module, file, cwd, files);

					for (const symbol of imp.symbols) {
						// 解決済みパスまたはシンボル名で検索
						let found = false;

						for (const [nodeId, node] of nodes) {
							// シンボル名でマッチング
							if (node.name === symbol && node.filePath !== file) {
								// 解決済みパスがある場合は、同じファイルか確認
								if (resolvedModule && node.filePath !== resolvedModule) {
									continue;
								}

								edges.push({
									source: fileId,
									target: nodeId,
									type: "import" as LocAgentEdgeType,
									confidence: resolvedModule ? 1.0 : 0.8,
								});
								found = true;
							}
						}

						// 解決済みパスがあるがシンボルが見つからない場合、ファイルレベルのエッジを作成
						if (!found && resolvedModule) {
							const targetFileId = generateFileId(resolvedModule);
							if (nodes.has(targetFileId)) {
								edges.push({
									source: fileId,
									target: targetFileId,
									type: "import" as LocAgentEdgeType,
									confidence: 0.6,
								});
							}
						}
					}
				}
			}

			// invokeエッジを作成
			for (const inv of parseResult.invocations) {
				// 呼び出し先を検索
				for (const [nodeId, node] of nodes) {
					if (node.name === inv.callee) {
						// 呼び出し元のノードIDを検索
						let callerId: string | undefined;
						if (inv.caller.includes(".")) {
							// メソッド呼び出し
							const [className, methodName] = inv.caller.split(".");
							callerId = generateQualifiedName(file, className, methodName);
						} else {
							// 関数呼び出し
							callerId = generateQualifiedName(file, undefined, inv.caller);
						}

						if (callerId && nodes.has(callerId)) {
							edges.push({
								source: callerId,
								target: nodeId,
								type: "invoke" as LocAgentEdgeType,
								confidence: 0.7,
							});
						}
					}
				}
			}

			// 継承エッジを作成
			const inheritance = extractInheritance(parseResult);
			for (const inh of inheritance) {
				const childId = generateQualifiedName(file, undefined, inh.child);
				// 親クラスを検索（同じファイルまたはimportされたクラス）
				for (const [nodeId, node] of nodes) {
					if (node.name === inh.parent && node.nodeType === "class") {
						edges.push({
							source: childId,
							target: nodeId,
							type: "inherit" as LocAgentEdgeType,
							confidence: 0.9,
						});
					}
				}
			}
		} catch {
			// ファイル読み込みエラーはスキップ
		}
	}

	// メタデータを作成
	const metadata: LocAgentMetadata = {
		indexedAt: Date.now(),
		fileCount: files.length,
		nodeCount: nodes.size,
		edgeCount: edges.length,
		language: "multi",
		version: 2,
	};

	return {
		nodes,
		edges,
		metadata,
	};
}
