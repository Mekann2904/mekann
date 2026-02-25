/**
 * @abdd.meta
 * path: .pi/extensions/search/tools/ast_summary.ts
 * role: AST要約ビューアの実装
 * why: ファイルのAST構造をツリー/フラット/JSON形式で表示し、コード理解を高速化するため
 * related: ../types.ts, ./sym_find.ts, ./sym_index.ts, ../utils/output.ts
 * public_api: astSummary, formatAstSummary, astSummaryToolDefinition
 * invariants: 出力形式はtree/flat/jsonのいずれか、深度は正の整数
 * side_effects: sym_findを内部的に呼び出し、シンボルインデックスを参照する
 * failure_modes: ファイルが存在しない場合、シンボルインデックスがない場合はエラーを返す
 * @abdd.explain
 * overview: ファイルのAST構造を解析し、ツリー形式やフラット形式、JSON形式で表示するツール
 * what_it_does:
 *   - 指定されたファイルのシンボル定義（クラス、関数、メソッド、変数）を抽出
 *   - スコープ情報を基に親子関係を構築し、ASTツリーを形成
 *   - 深度制御で表示する階層の深さを調整
 *   - 型情報（シグネチャ）と呼び出し関係の表示オプションを提供
 * why_it_exists:
 *   - エージェントがファイルの構造を素早く理解できるようにするため
 *   - コードレビューやリファクタリング時に全体像を把握しやすくするため
 *   - JSON出力でプログラム的な処理も可能にするため
 * scope:
 *   in: AstSummaryInput（ファイルパス、出力形式、深度、オプション）
 *   out: AstSummaryResult（ASTノードツリー、統計情報）
 */

/**
 * ast_summary Tool
 *
 * Display AST structure of a file in tree, flat, or JSON format.
 * Supports depth control and optional type/call information.
 */

import type {
	AstSummaryInput,
	AstSummaryResult,
	AstNode,
	AstNodeKind,
	SymbolDefinition,
} from "../types.js";
import { symFind } from "./sym_find.js";
import { codeSearch } from "./code_search.js";
import { createErrorResponse } from "../utils/output.js";
import { SearchToolError, isSearchToolError, getErrorMessage } from "../utils/errors.js";

// ============================================
// Node Kind Mapping
// ============================================

/**
 * ctagsのkindをAstNodeKindに変換
 * @summary kind変換
 * @param kind ctagsのシンボル種別
 * @returns AstNodeKindまたはnull
 */
function mapKindToAstKind(kind: string): AstNodeKind | null {
	const kindMap: Record<string, AstNodeKind> = {
		class: "class",
		interface: "interface",
		enum: "enum",
		function: "function",
		method: "method",
		variable: "variable",
		constant: "variable",
		field: "variable",
		property: "variable",
	};

	return kindMap[kind.toLowerCase()] ?? null;
}

/**
 * シンボル定義からASTノードを作成
 * @summary ノード作成
 * @param sym シンボル定義
 * @returns ASTノード
 */
function createAstNode(sym: SymbolDefinition): AstNode {
	const kind = mapKindToAstKind(sym.kind);
	return {
		name: sym.name,
		kind: kind ?? "variable",
		signature: sym.signature,
		line: sym.line,
		children: [],
		calls: [],
	};
}

// ============================================
// AST Tree Building
// ============================================

/**
 * シンボルリストからASTツリーを構築
 * @summary ツリー構築
 * @param symbols シンボル定義配列
 * @returns ルートノード配列
 */
function buildAstTree(symbols: SymbolDefinition[]): AstNode[] {
	const nodes: AstNode[] = [];
	const scopeMap = new Map<string, AstNode>();

	// Sort symbols: classes/interfaces first, then methods/functions, then variables
	const sortedSymbols = [...symbols].sort((a, b) => {
		const kindOrder: Record<string, number> = {
			class: 1,
			interface: 1,
			enum: 1,
			method: 2,
			function: 2,
			variable: 3,
			constant: 3,
			field: 3,
			property: 3,
		};
		const aOrder = kindOrder[a.kind?.toLowerCase()] ?? 99;
		const bOrder = kindOrder[b.kind?.toLowerCase()] ?? 99;
		return aOrder - bOrder;
	});

	for (const sym of sortedSymbols) {
		const node = createAstNode(sym);

		// If this symbol has a scope, find its parent
		if (sym.scope && sym.scope.length > 0) {
			const parent = scopeMap.get(sym.scope);
			if (parent) {
				if (!parent.children) {
					parent.children = [];
				}
				parent.children.push(node);
			} else {
				// Parent not found, add as root
				nodes.push(node);
			}
		} else {
			// No scope, add as root
			nodes.push(node);
		}

		// Register this node in scope map
		scopeMap.set(sym.name, node);
	}

	return nodes;
}

// ============================================
// Call Extraction
// ============================================

/**
 * 関数/メソッド内の呼び出しを抽出
 * @summary 呼び出し抽出
 * @param file ファイルパス
 * @param symbols シンボル定義配列
 * @param cwd 作業ディレクトリ
 */
async function extractCalls(
	file: string,
	symbols: SymbolDefinition[],
	cwd: string
): Promise<void> {
	// Get all function/method symbols
	const functions = symbols.filter(
		(s) => s.kind?.toLowerCase() === "function" || s.kind?.toLowerCase() === "method"
	);

	for (const func of functions) {
		try {
			// Search for function calls within this function's scope
			// This is a simplified approach - we look for identifier patterns
			const result = await codeSearch(
				{
					pattern: "\\b[A-Za-z_][A-Za-z0-9_]*\\s*\\(",
					path: file,
					limit: 100,
				},
				cwd
			);

			if (result.results && result.results.length > 0) {
				const calls = new Set<string>();
				for (const match of result.results) {
					// Extract the function name from the match
					const matchText = match.text.match(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
					if (matchText && matchText[1]) {
						// Skip if it's the function itself or a keyword
						const name = matchText[1];
						if (name !== func.name && !isKeyword(name)) {
							calls.add(name);
						}
					}
				}

				// Find the corresponding AstNode and add calls
				// This is simplified - in a real implementation we'd track the node reference
				if (calls.size > 0) {
					// We'll attach calls during tree traversal
					(func as SymbolDefinition & { extractedCalls?: string[] }).extractedCalls = Array.from(calls);
				}
			}
		} catch {
			// Ignore errors in call extraction
		}
	}
}

/**
 * JavaScript/TypeScriptの予約語かどうかを判定
 * @summary 予約語判定
 * @param name 識別子名
 * @returns 予約語ならtrue
 */
function isKeyword(name: string): boolean {
	const keywords = new Set([
		"if", "else", "for", "while", "do", "switch", "case", "break", "continue",
		"return", "throw", "try", "catch", "finally", "function", "class", "extends",
		"new", "this", "super", "import", "export", "from", "as", "typeof", "instanceof",
		"in", "of", "let", "const", "var", "async", "await", "yield", "static",
		"get", "set", "private", "protected", "public", "readonly", "interface",
		"type", "enum", "namespace", "module", "declare", "abstract", "implements",
		"console", "require", "define", "module",
	]);
	return keywords.has(name);
}

// ============================================
// Depth Control
// ============================================

/**
 * ツリーの深度を制限
 * @summary 深度制限
 * @param nodes ASTノード配列
 * @param maxDepth 最大深度
 * @param currentDepth 現在の深度
 */
function limitDepth(nodes: AstNode[], maxDepth: number, currentDepth = 0): void {
	if (currentDepth >= maxDepth) {
		for (const node of nodes) {
			if (node.children && node.children.length > 0) {
				// Mark that children were truncated
				(node as AstNode & { truncated?: boolean }).truncated = true;
				node.children = [];
			}
		}
		return;
	}

	for (const node of nodes) {
		if (node.children && node.children.length > 0) {
			limitDepth(node.children, maxDepth, currentDepth + 1);
		}
	}
}

// ============================================
// Statistics
// ============================================

/**
 * ASTノードの統計を計算
 * @summary 統計計算
 * @param nodes ASTノード配列
 * @returns 統計情報
 */
function calculateStats(nodes: AstNode[]): { totalClasses: number; totalFunctions: number; totalMethods: number; totalVariables: number } {
	let totalClasses = 0;
	let totalFunctions = 0;
	let totalMethods = 0;
	let totalVariables = 0;

	function countNode(node: AstNode): void {
		switch (node.kind) {
			case "class":
			case "interface":
			case "enum":
				totalClasses++;
				break;
			case "function":
				totalFunctions++;
				break;
			case "method":
				totalMethods++;
				break;
			case "variable":
				totalVariables++;
				break;
		}

		if (node.children) {
			for (const child of node.children) {
				countNode(child);
			}
		}
	}

	for (const node of nodes) {
		countNode(node);
	}

	return { totalClasses, totalFunctions, totalMethods, totalVariables };
}

// ============================================
// Main Entry Point
// ============================================

/**
 * AST要約を実行
 * @summary AST要約実行
 * @param input 入力パラメータ
 * @param cwd 作業ディレクトリ
 * @returns AST要約結果
 */
export async function astSummary(
	input: AstSummaryInput,
	cwd: string
): Promise<AstSummaryResult> {
	const format = input.format ?? "tree";
	const depth = input.depth ?? 2;
	const includeTypes = input.includeTypes ?? true;
	const includeCalls = input.includeCalls ?? false;

	if (!input.file || input.file.length === 0) {
		return {
			file: "",
			format,
			root: [],
			stats: { totalClasses: 0, totalFunctions: 0, totalMethods: 0, totalVariables: 0 },
			error: "file is required",
		};
	}

	try {
		// Get symbol definitions for this file
		const symResult = await symFind(
			{
				file: input.file,
				limit: 500,
				detailLevel: includeTypes ? "full" : "outline",
			},
			cwd
		);

		if (symResult.error) {
			return {
				file: input.file,
				format,
				root: [],
				stats: { totalClasses: 0, totalFunctions: 0, totalMethods: 0, totalVariables: 0 },
				error: symResult.error,
			};
		}

		const symbols = symResult.results;

		if (symbols.length === 0) {
			return {
				file: input.file,
				format,
				root: [],
				stats: { totalClasses: 0, totalFunctions: 0, totalMethods: 0, totalVariables: 0 },
				error: "No symbols found in file. Run sym_index first.",
			};
		}

		// Extract call relationships if requested
		if (includeCalls) {
			await extractCalls(input.file, symbols, cwd);
		}

		// Build AST tree
		const rootNodes = buildAstTree(symbols);

		// Apply depth limit
		if (depth > 0) {
			limitDepth(rootNodes, depth);
		}

		// Attach call information to nodes
		if (includeCalls) {
			attachCallsToNodes(rootNodes, symbols);
		}

		// Remove type information if not requested
		if (!includeTypes) {
			removeSignatures(rootNodes);
		}

		// Calculate statistics
		const stats = calculateStats(rootNodes);

		return {
			file: input.file,
			format,
			root: rootNodes,
			stats,
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		return {
			file: input.file,
			format,
			root: [],
			stats: { totalClasses: 0, totalFunctions: 0, totalMethods: 0, totalVariables: 0 },
			error: errorMessage,
		};
	}
}

/**
 * 呼び出し情報をノードに付加
 * @summary 呼び出し付加
 * @param nodes ASTノード配列
 * @param symbols シンボル定義配列
 */
function attachCallsToNodes(nodes: AstNode[], symbols: SymbolDefinition[]): void {
	const nodeMap = new Map<string, AstNode>();

	function buildNodeMap(nodeList: AstNode[]): void {
		for (const node of nodeList) {
			nodeMap.set(node.name, node);
			if (node.children) {
				buildNodeMap(node.children);
			}
		}
	}

	buildNodeMap(nodes);

	// Attach extracted calls to corresponding nodes
	for (const sym of symbols) {
		const extractedCalls = (sym as SymbolDefinition & { extractedCalls?: string[] }).extractedCalls;
		if (extractedCalls && extractedCalls.length > 0) {
			const node = nodeMap.get(sym.name);
			if (node) {
				node.calls = extractedCalls;
			}
		}
	}
}

/**
 * シグネチャ情報を削除
 * @summary シグネチャ削除
 * @param nodes ASTノード配列
 */
function removeSignatures(nodes: AstNode[]): void {
	for (const node of nodes) {
		delete node.signature;
		if (node.children) {
			removeSignatures(node.children);
		}
	}
}

// ============================================
// Formatting
// ============================================

/**
 * AST要約結果をフォーマット
 * @summary 結果フォーマット
 * @param result AST要約結果
 * @returns フォーマット済み文字列
 */
export function formatAstSummary(result: AstSummaryResult): string {
	if (result.error) {
		return `Error: ${result.error}`;
	}

	switch (result.format) {
		case "json":
			return formatAsJson(result);
		case "flat":
			return formatAsFlat(result);
		case "tree":
		default:
			return formatAsTree(result);
	}
}

/**
 * JSON形式でフォーマット
 * @summary JSONフォーマット
 * @param result AST要約結果
 * @returns JSON文字列
 */
function formatAsJson(result: AstSummaryResult): string {
	return JSON.stringify(
		{
			file: result.file,
			stats: result.stats,
			root: result.root,
		},
		null,
		2
	);
}

/**
 * フラット形式でフォーマット
 * @summary フラットフォーマット
 * @param result AST要約結果
 * @returns フラット形式文字列
 */
function formatAsFlat(result: AstSummaryResult): string {
	const lines: string[] = [];
	lines.push(`AST Summary: ${result.file}`);
	lines.push(`Classes: ${result.stats.totalClasses}, Functions: ${result.stats.totalFunctions}, Methods: ${result.stats.totalMethods}, Variables: ${result.stats.totalVariables}`);
	lines.push("");

	function flattenNodes(nodes: AstNode[], prefix = ""): void {
		for (const node of nodes) {
			const signature = node.signature ? `: ${node.signature}` : "";
			const line = node.line ? ` (line ${node.line})` : "";
			lines.push(`${prefix}${node.kind} ${node.name}${signature}${line}`);

			if (node.calls && node.calls.length > 0) {
				lines.push(`${prefix}  calls: ${node.calls.join(", ")}`);
			}

			if (node.children && node.children.length > 0) {
				flattenNodes(node.children, prefix + "  ");
			}
		}
	}

	flattenNodes(result.root);
	return lines.join("\n");
}

/**
 * ツリー形式でフォーマット
 * @summary ツリーフォーマット
 * @param result AST要約結果
 * @returns ツリー形式文字列
 */
function formatAsTree(result: AstSummaryResult): string {
	const lines: string[] = [];
	lines.push(`AST Summary: ${result.file}`);
	lines.push(`Classes: ${result.stats.totalClasses}, Functions: ${result.stats.totalFunctions}, Methods: ${result.stats.totalMethods}, Variables: ${result.stats.totalVariables}`);
	lines.push("");

	function formatNode(node: AstNode, prefix = "", isLast = true): void {
		const connector = isLast ? "└── " : "├── ";
		const signature = node.signature ? `: ${node.signature}` : "";
		const line = node.line ? ` (L${node.line})` : "";

		// Visibility indicator
		let visibility = "";
		if (node.signature) {
			if (node.signature.includes("private") || node.name.startsWith("_")) {
				visibility = "- ";
			} else if (node.signature.includes("public") || node.signature.includes("+")) {
				visibility = "+ ";
			} else {
				visibility = "+ ";
			}
		}

		lines.push(`${prefix}${connector}${visibility}${node.name}${signature}${line}`);

		// Show calls
		if (node.calls && node.calls.length > 0) {
			const callPrefix = prefix + (isLast ? "    " : "│   ");
			lines.push(`${callPrefix}└── calls: ${node.calls.join(", ")}`);
		}

		// Show children
		if (node.children && node.children.length > 0) {
			const childPrefix = prefix + (isLast ? "    " : "│   ");
			for (let i = 0; i < node.children.length; i++) {
				const childIsLast = i === node.children.length - 1;
				formatNode(node.children[i], childPrefix, childIsLast);
			}
		}
	}

	// Format root nodes
	for (let i = 0; i < result.root.length; i++) {
		const isLast = i === result.root.length - 1;
		formatNode(result.root[i], "", isLast);
	}

	return lines.join("\n");
}

/**
 * Tool definition for pi.registerTool
 */
export const astSummaryToolDefinition = {
	name: "ast_summary",
	label: "AST Summary",
	description:
		"Display AST structure of a file in tree, flat, or JSON format. Supports depth control and optional type/call information. Useful for understanding file structure quickly.",
	parameters: null, // Will be set in index.ts
};
