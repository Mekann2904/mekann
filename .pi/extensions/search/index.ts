/**
 * @abdd.meta
 * path: .pi/extensions/search/index.ts
 * role: PI Coding Agent向け検索拡張機能のエントリーポイント
 * why: ファイル列挙、コード検索、シンボル検索、意味検索など、プロジェクトコードの高速な検索機能をエージェントに提供するため
 * related: .pi/extensions/search/tools/file_candidates.ts, .pi/extensions/search/tools/code_search.ts, .pi/extensions/search/tools/semantic_search.ts
 * public_api: file_candidates, code_search, sym_index, sym_find, call_graph_index, find_callers, find_callees, semantic_index, semantic_search
 * invariants: piオブジェクトがnullの場合は登録処理を中断する
 * side_effects: なし
 * failure_modes: 必要なCLIツールがインストールされていない場合、またはファイルシステムアクセス権限がない場合にエラーが発生する
 * @abdd.explain
 * overview: fd, ripgrep, ctagsなどのCLIツールをラップし、ファイルシステム上のソースコードに対する多様な検索手段を提供する拡張機能
 * what_it_does:
 *   - 拡張機能の初期化および各種ツールの登録を行う
 *   - ファイルパスに基づくファイル・ディレクトリの列挙(file_candidates)
 *   - 正規表現によるコードパターンの検索(code_search)
 *   - ctagsを用いたシンボル定義のインデックス化と検索(sym_index, sym_find)
 *   - ripgrepを用いた呼び出し関係グラフの生成と解析(call_graph_index, find_callers, find_callees)
 *   - ベクトル埋め込みを用いた意味的なコード検索(semantic_index, semantic_search)
 * why_it_exists:
 *   - エージェントがコードベースを迅速に理解・ナビゲートするために高性能な検索ツールが必要なため
 *   - 構造的な検索（シンボル、呼び出し関係）と意味的な検索（ベクトル）の両方をサポートするため
 * scope:
 *   in: PI Coding AgentのExtensionAPIオブジェクト
 *   out: 検索ツール群を登録済みのExtensionAPIオブジェクト
 */

/**
 * Search Extension for PI Coding Agent
 *
 * High-performance search tools using fd, ripgrep, and ctags
 * with fallback support for environments without these tools.
 *
 * Tools:
 * - file_candidates: Fast file enumeration (fd wrapper)
 * - code_search: Code pattern search (rg wrapper)
 * - sym_index: Symbol index generation (ctags wrapper)
 * - sym_find: Symbol definition search
 * - call_graph_index: Call graph generation (ripgrep-based)
 * - find_callers: Find functions that call a symbol
 * - find_callees: Find functions called by a symbol
 * - semantic_index: Generate vector embeddings for code files
 * - semantic_search: Semantic code search with natural language queries
 * - context_explore: Chain multiple search queries with context budget
 * - search_class: Search class definitions with optional method listing
 * - search_method: Search method definitions with optional implementation
 * - fault_localize: SBFL-based bug location identification
 * - search_history: Manage search history across sessions
 * - ast_summary: Display AST structure in tree/flat/JSON format
 * - merge_results: Merge results from multiple search methods with ranking
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { fileCandidates } from "./tools/file_candidates.js";
import { codeSearch } from "./tools/code_search.js";
import { symIndex } from "./tools/sym_index.js";
import { symFind } from "./tools/sym_find.js";
import {
	callGraphIndex,
	findCallersTool,
	findCalleesTool,
	formatCallGraphIndex,
	formatCallers,
	formatCallees,
} from "./tools/call_graph.js";
import { semanticIndex } from "./tools/semantic_index.js";
import { semanticSearch, formatSemanticSearch } from "./tools/semantic_search.js";
import { contextExplore, formatContextExplore } from "./tools/context_explore.js";
import { searchClass, formatSearchClass } from "./tools/search_class.js";
import { searchMethod, formatSearchMethod } from "./tools/search_method.js";
import { faultLocalize, formatFaultLocalize } from "./tools/fault_localize.js";
import { searchHistory, formatSearchHistory } from "./tools/search_history.js";
import { astSummary, formatAstSummary } from "./tools/ast_summary.js";
import { mergeResults, formatMergeResults } from "./tools/merge_results.js";
import {
	repographIndex,
	repographQuery,
	formatRepoGraphIndex,
	formatRepoGraphQuery,
} from "./tools/repograph_index.js";
import { checkToolAvailability } from "./utils/cli.js";
import {
	formatFileCandidates,
	formatCodeSearch,
	formatSymbols,
} from "./utils/output.js";
import { MAX_CODE_SEARCH_LIMIT, MAX_CODE_SEARCH_CONTEXT } from "./utils/constants.js";

// ============================================
// Extension Registration
// ============================================

export default function (pi: ExtensionAPI) {
	try {
		if (!pi) {
			console.error("search extension: pi object is null");
			return;
		}

		// ============================================
		// Tool: file_candidates
		// ============================================
		pi.registerTool({
			name: "file_candidates",
			label: "File Candidates",
			description:
				"Enumerate files and directories using fd with fast glob and extension filtering. Returns up to 100 results by default.",
			parameters: Type.Object({
				pattern: Type.Optional(
					Type.String({ description: "Glob pattern (e.g., '*.ts')" })
				),
				type: Type.Optional(
					Type.Union([
						Type.Literal("file"),
						Type.Literal("dir"),
					], { description: "Entry type filter" })
				),
				extension: Type.Optional(
					Type.Array(Type.String(), { description: "Extension filter (e.g., ['ts', 'tsx'])" })
				),
				exclude: Type.Optional(
					Type.Array(Type.String(), {
						description: "Exclude patterns (e.g., ['node_modules', 'dist'])",
					})
				),
				maxDepth: Type.Optional(
					Type.Number({ description: "Maximum directory depth" })
				),
				limit: Type.Optional(
					Type.Number({ description: "Maximum results (default: 100)" })
				),
				path: Type.Optional(
					Type.String({ description: "Search path (default: project root)" })
				),
			}),

			async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
				const cwd = ctx?.cwd ?? process.cwd();

				try {
					const result = await fileCandidates(
						{
							pattern: params.pattern,
							type: params.type,
							extension: params.extension,
							exclude: params.exclude,
							maxDepth: params.maxDepth,
							limit: params.limit,
							cwd: params.path ?? cwd,
						},
						cwd
					);

					return {
						content: [
							{
								type: "text" as const,
								text: formatFileCandidates(result),
							},
						],
						details: result,
					};
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					return {
						content: [{ type: "text" as const, text: `Error: ${errorMessage}` }],
						details: { error: errorMessage, total: 0, truncated: false, results: [] },
					};
				}
			},
		});

		// ============================================
		// Tool: code_search
		// ============================================
		pi.registerTool({
			name: "code_search",
			label: "Code Search",
			description:
				"Search code patterns using ripgrep (rg) with regex support. Returns matches with file, line, and context. Up to 50 results by default.",
			parameters: Type.Object({
				pattern: Type.String({ description: "Search pattern (regex enabled)" }),
				path: Type.Optional(Type.String({ description: "Search scope path" })),
				type: Type.Optional(
					Type.String({ description: "File type filter (ts, js, py, etc.)" })
				),
				ignoreCase: Type.Optional(
					Type.Boolean({ description: "Case insensitive search (default: true)" })
				),
				literal: Type.Optional(
					Type.Boolean({ description: "Treat pattern as literal string" })
				),
				context: Type.Optional(
					Type.Number({
						description: `Number of context lines around matches (max: ${MAX_CODE_SEARCH_CONTEXT})`,
						minimum: 0,
						maximum: MAX_CODE_SEARCH_CONTEXT,
					})
				),
				limit: Type.Optional(
					Type.Number({
						description: `Maximum results (default: 50, max: ${MAX_CODE_SEARCH_LIMIT})`,
						minimum: 1,
						maximum: MAX_CODE_SEARCH_LIMIT,
					})
				),
			}),

			async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
				const cwd = ctx?.cwd ?? process.cwd();

				if (!params.pattern || params.pattern.length === 0) {
					return {
						content: [{ type: "text" as const, text: "Error: pattern is required" }],
						details: { error: "pattern is required", total: 0, truncated: false, summary: [], results: [] },
					};
				}

				try {
					const result = await codeSearch(
						{
							pattern: params.pattern,
							path: params.path,
							type: params.type,
							ignoreCase: params.ignoreCase,
							literal: params.literal,
							context: params.context,
							limit: params.limit,
							cwd,
						},
						cwd
					);

					return {
						content: [
							{
								type: "text" as const,
								text: formatCodeSearch(result),
							},
						],
						details: result,
					};
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					return {
						content: [{ type: "text" as const, text: `Error: ${errorMessage}` }],
						details: { error: errorMessage, total: 0, truncated: false, summary: [], results: [] },
					};
				}
			},
		});

		// ============================================
		// Tool: sym_index
		// ============================================
		pi.registerTool({
			name: "sym_index",
			label: "Symbol Index",
			description:
				"Generate a symbol index using ctags. Creates a JSONL file with function, class, and variable definitions.",
			parameters: Type.Object({
				path: Type.Optional(
					Type.String({ description: "Target path for indexing (default: project root)" })
				),
				force: Type.Optional(
					Type.Boolean({ description: "Force regeneration of index" })
				),
			}),

			async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
				const cwd = ctx?.cwd ?? process.cwd();

				try {
					const result = await symIndex(
						{
							path: params.path,
							force: params.force,
							cwd,
						},
						cwd
					);

					const hasError = !!result.error;

					return {
						content: [
							{
								type: "text" as const,
								text: hasError
									? `Error: ${result.error}`
									: `Indexed ${result.indexed} symbols to ${result.outputPath}`,
							},
						],
						details: result,
					};
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					return {
						content: [{ type: "text" as const, text: `Error: ${errorMessage}` }],
						details: { error: errorMessage, indexed: 0, outputPath: "" },
					};
				}
			},
		});

		// ============================================
		// Tool: sym_find
		// ============================================
		pi.registerTool({
			name: "sym_find",
			label: "Symbol Find",
			description:
				"Search for symbol definitions (functions, classes, variables) from the ctags index. Supports pattern matching on name and filtering by kind. Use detailLevel to control output verbosity.",
			parameters: Type.Object({
				name: Type.Optional(
					Type.String({ description: "Symbol name pattern (supports wildcards)" })
				),
				kind: Type.Optional(
					Type.Array(Type.String(), {
						description: "Symbol kinds (function, class, variable, etc.)",
					})
				),
				file: Type.Optional(
					Type.String({ description: "File path filter" })
				),
				scope: Type.Optional(
					Type.String({ description: "Scope filter (e.g., class name to find methods within)" })
				),
				limit: Type.Optional(
					Type.Number({ description: "Maximum results (default: 50)" })
				),
				detailLevel: Type.Optional(
					Type.Union(
						[
							Type.Literal("full"),
							Type.Literal("signature"),
							Type.Literal("outline"),
						],
						{ description: "Detail level: full (default), signature (method signatures only), outline (structure only)" }
					)
				),
			}),

			async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
				const cwd = ctx?.cwd ?? process.cwd();

				try {
					const result = await symFind(
						{
							name: params.name,
							kind: params.kind,
							file: params.file,
							scope: params.scope,
							limit: params.limit,
							detailLevel: params.detailLevel as "full" | "signature" | "outline" | undefined,
							cwd,
						},
						cwd
					);

					return {
						content: [
							{
								type: "text" as const,
								text: formatSymbols(result),
							},
						],
						details: result,
					};
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					return {
						content: [{ type: "text" as const, text: `Error: ${errorMessage}` }],
						details: { error: errorMessage, total: 0, truncated: false, results: [] },
					};
				}
			},
		});

		// ============================================
		// Tool: call_graph_index
		// ============================================
		pi.registerTool({
			name: "call_graph_index",
			label: "Call Graph Index",
			description:
				"Generate a call graph index showing function call relationships. Uses ctags and ripgrep for analysis.",
			parameters: Type.Object({
				path: Type.Optional(
					Type.String({ description: "Target path for indexing (default: project root)" })
				),
				force: Type.Optional(
					Type.Boolean({ description: "Force regeneration of index" })
				),
			}),

			async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
				const cwd = ctx?.cwd ?? process.cwd();

				try {
					const result = await callGraphIndex(
						{
							path: params.path,
							force: params.force,
							cwd,
						},
						cwd
					);

					return {
						content: [
							{
								type: "text" as const,
								text: formatCallGraphIndex(result),
							},
						],
						details: result,
					};
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					return {
						content: [{ type: "text" as const, text: `Error: ${errorMessage}` }],
						details: { error: errorMessage, nodeCount: 0, edgeCount: 0, outputPath: "" },
					};
				}
			},
		});

		// ============================================
		// Tool: find_callers
		// ============================================
		pi.registerTool({
			name: "find_callers",
			label: "Find Callers",
			description:
				"Find all functions that call the specified symbol. Supports depth-based traversal to find indirect callers.",
			parameters: Type.Object({
				symbolName: Type.String({ description: "Symbol name to find callers for" }),
				depth: Type.Optional(
					Type.Number({ description: "Recursion depth (default: 1, direct callers only)" })
				),
				limit: Type.Optional(
					Type.Number({ description: "Maximum results (default: 50)" })
				),
			}),

			async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
				const cwd = ctx?.cwd ?? process.cwd();

				if (!params.symbolName || params.symbolName.length === 0) {
					return {
						content: [{ type: "text" as const, text: "Error: symbolName is required" }],
						details: { error: "symbolName is required", symbolName: "", total: 0, truncated: false, results: [] },
					};
				}

				try {
					const result = await findCallersTool(
						{
							symbolName: params.symbolName,
							depth: params.depth,
							limit: params.limit,
							cwd,
						},
						cwd
					);

					return {
						content: [
							{
								type: "text" as const,
								text: formatCallers(result),
							},
						],
						details: result,
					};
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					return {
						content: [{ type: "text" as const, text: `Error: ${errorMessage}` }],
						details: { error: errorMessage, symbolName: params.symbolName, total: 0, truncated: false, results: [] },
					};
				}
			},
		});

		// ============================================
		// Tool: find_callees
		// ============================================
		pi.registerTool({
			name: "find_callees",
			label: "Find Callees",
			description:
				"Find all functions called by the specified symbol. Supports depth-based traversal to find indirect callees.",
			parameters: Type.Object({
				symbolName: Type.String({ description: "Symbol name to find callees for" }),
				depth: Type.Optional(
					Type.Number({ description: "Recursion depth (default: 1, direct callees only)" })
				),
				limit: Type.Optional(
					Type.Number({ description: "Maximum results (default: 50)" })
				),
			}),

			async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
				const cwd = ctx?.cwd ?? process.cwd();

				if (!params.symbolName || params.symbolName.length === 0) {
					return {
						content: [{ type: "text" as const, text: "Error: symbolName is required" }],
						details: { error: "symbolName is required", symbolName: "", total: 0, truncated: false, results: [] },
					};
				}

				try {
					const result = await findCalleesTool(
						{
							symbolName: params.symbolName,
							depth: params.depth,
							limit: params.limit,
							cwd,
						},
						cwd
					);

					return {
						content: [
							{
								type: "text" as const,
								text: formatCallees(result),
							},
						],
						details: result,
					};
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					return {
						content: [{ type: "text" as const, text: `Error: ${errorMessage}` }],
						details: { error: errorMessage, symbolName: params.symbolName, total: 0, truncated: false, results: [] },
					};
				}
			},
		});

		// ============================================
		// Tool: semantic_index
		// ============================================
		pi.registerTool({
			name: "semantic_index",
			label: "Semantic Index",
			description:
				"Generate a semantic index of code files using vector embeddings. Enables semantic code search with natural language queries. Requires OpenAI API key.",
			parameters: Type.Object({
				path: Type.Optional(
					Type.String({ description: "Target path for indexing (default: project root)" })
				),
				force: Type.Optional(
					Type.Boolean({ description: "Force regeneration of index" })
				),
				chunkSize: Type.Optional(
					Type.Number({ description: "Chunk size in characters (default: 500)" })
				),
				chunkOverlap: Type.Optional(
					Type.Number({ description: "Overlap between chunks (default: 50)" })
				),
				extensions: Type.Optional(
					Type.Array(Type.String(), {
						description: "File extensions to include (default: ts,tsx,js,jsx,py,go,rs)",
					})
				),
			}),

			async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
				const cwd = ctx?.cwd ?? process.cwd();

				try {
					const result = await semanticIndex(
						{
							path: params.path,
							force: params.force,
							chunkSize: params.chunkSize,
							chunkOverlap: params.chunkOverlap,
							extensions: params.extensions,
							cwd,
						},
						cwd
					);

					const hasError = !!result.error;

					return {
						content: [
							{
								type: "text" as const,
								text: hasError
									? `Error: ${result.error}`
									: `Indexed ${result.indexed} chunks from ${result.files} files to ${result.outputPath}`,
							},
						],
						details: result,
					};
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					return {
						content: [{ type: "text" as const, text: `Error: ${errorMessage}` }],
						details: { error: errorMessage, indexed: 0, files: 0, outputPath: "" },
					};
				}
			},
		});

		// ============================================
		// Tool: semantic_search
		// ============================================
		pi.registerTool({
			name: "semantic_search",
			label: "Semantic Search",
			description:
				"Search code using natural language queries with semantic understanding. Requires a pre-built semantic index (run semantic_index first). Returns code chunks ranked by similarity.",
			parameters: Type.Object({
				query: Type.String({ description: "Natural language search query" }),
				topK: Type.Optional(
					Type.Number({ description: "Maximum results (default: 10)" })
				),
				threshold: Type.Optional(
					Type.Number({ description: "Minimum similarity threshold 0-1 (default: 0.5)" })
				),
				language: Type.Optional(
					Type.String({ description: "Filter by programming language" })
				),
				kind: Type.Optional(
					Type.Array(Type.String(), {
						description: "Filter by symbol kind (function, class, variable, chunk)",
					})
				),
			}),

			async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
				const cwd = ctx?.cwd ?? process.cwd();

				if (!params.query || params.query.trim().length === 0) {
					return {
						content: [{ type: "text" as const, text: "Error: query is required" }],
						details: { error: "query is required", total: 0, truncated: false, results: [] },
					};
				}

				try {
					const result = await semanticSearch(
						{
							query: params.query,
							topK: params.topK,
							threshold: params.threshold,
							language: params.language,
							kind: params.kind as ("function" | "class" | "variable" | "chunk")[] | undefined,
							cwd,
						},
						cwd
					);

					return {
						content: [
							{
								type: "text" as const,
								text: formatSemanticSearch(result),
							},
						],
						details: result,
					};
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					return {
						content: [{ type: "text" as const, text: `Error: ${errorMessage}` }],
						details: { error: errorMessage, total: 0, truncated: false, results: [] },
					};
				}
			},
		});

		// ============================================
		// Tool: context_explore
		// ============================================
		pi.registerTool({
			name: "context_explore",
			label: "Context Explore",
			description:
				"Execute a chain of search queries in sequence. Supports find_class, find_methods, search_code, and get_callers steps. Results from previous steps can be referenced using $0, $1, etc. Automatically compresses results based on token budget.",
			parameters: Type.Object({
				steps: Type.Array(
					Type.Object({
						type: Type.Union(
							[
								Type.Literal("find_class"),
								Type.Literal("find_methods"),
								Type.Literal("search_code"),
								Type.Literal("get_callers"),
							],
							{ description: "Step type" }
						),
						query: Type.Optional(
							Type.String({ description: "Search query pattern" })
						),
						classRef: Type.Optional(
							Type.String({ description: "Reference to previous step result ($0, $1, etc.)" })
						),
						scope: Type.Optional(
							Type.String({ description: "Scope filter" })
						),
					}),
					{ description: "Chain of search steps to execute" }
				),
				contextBudget: Type.Optional(
					Type.Number({ description: "Token budget for results (default: 15000)" })
				),
				compression: Type.Optional(
					Type.Union(
						[
							Type.Literal("full"),
							Type.Literal("signature"),
							Type.Literal("summary"),
						],
						{ description: "Compression mode (default: full)" }
					)
				),
			}),

			async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
				const cwd = ctx?.cwd ?? process.cwd();

				if (!params.steps || params.steps.length === 0) {
					return {
						content: [{ type: "text" as const, text: "Error: steps array is required" }],
						details: { error: "steps array is required", total: 0, compressed: false, estimatedTokens: 0, contextBudget: 15000, steps: [] },
					};
				}

				try {
					const result = await contextExplore(
						{
							steps: params.steps as Array<{
								type: "find_class" | "find_methods" | "search_code" | "get_callers";
								query?: string;
								classRef?: string;
								scope?: string;
							}>,
							contextBudget: params.contextBudget,
							compression: params.compression as "full" | "signature" | "summary" | undefined,
							cwd,
						},
						cwd
					);

					return {
						content: [
							{
								type: "text" as const,
								text: formatContextExplore(result),
							},
						],
						details: result,
					};
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					return {
						content: [{ type: "text" as const, text: `Error: ${errorMessage}` }],
						details: { error: errorMessage, total: 0, compressed: false, estimatedTokens: 0, contextBudget: 15000, steps: [] },
					};
				}
			},
		});

		// ============================================
		// Tool: search_class
		// ============================================
		pi.registerTool({
			name: "search_class",
			label: "Search Class",
			description:
				"Search for class definitions with optional method listing. Supports wildcards in class name. Use includeMethods to get class structure overview.",
			parameters: Type.Object({
				name: Type.String({ description: "Class name pattern (supports wildcards: *, ?)" }),
				includeMethods: Type.Optional(
					Type.Boolean({ description: "Include method list (default: true)" })
				),
				detailLevel: Type.Optional(
					Type.Union(
						[
							Type.Literal("full"),
							Type.Literal("signature"),
							Type.Literal("outline"),
						],
						{ description: "Detail level (default: full)" }
					)
				),
				file: Type.Optional(
					Type.String({ description: "File path filter" })
				),
				limit: Type.Optional(
					Type.Number({ description: "Maximum results (default: 20)" })
				),
			}),

			async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
				const cwd = ctx?.cwd ?? process.cwd();

				if (!params.name || params.name.length === 0) {
					return {
						content: [{ type: "text" as const, text: "Error: name is required" }],
						details: { error: "name is required", total: 0, truncated: false, results: [] },
					};
				}

				try {
					const result = await searchClass(
						{
							name: params.name,
							includeMethods: params.includeMethods,
							detailLevel: params.detailLevel as "full" | "signature" | "outline" | undefined,
							file: params.file,
							limit: params.limit,
						},
						cwd
					);

					return {
						content: [
							{
								type: "text" as const,
								text: formatSearchClass(result),
							},
						],
						details: result,
					};
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					return {
						content: [{ type: "text" as const, text: `Error: ${errorMessage}` }],
						details: { error: errorMessage, total: 0, truncated: false, results: [] },
					};
				}
			},
		});

		// ============================================
		// Tool: search_method
		// ============================================
		pi.registerTool({
			name: "search_method",
			label: "Search Method",
			description:
				"Search for method definitions with optional implementation code. Supports wildcards in method name. Use className to filter by containing class.",
			parameters: Type.Object({
				method: Type.String({ description: "Method name pattern (supports wildcards: *, ?)" }),
				className: Type.Optional(
					Type.String({ description: "Filter by class name" })
				),
				includeImplementation: Type.Optional(
					Type.Boolean({ description: "Include implementation code (default: false)" })
				),
				detailLevel: Type.Optional(
					Type.Union(
						[
							Type.Literal("full"),
							Type.Literal("signature"),
							Type.Literal("outline"),
						],
						{ description: "Detail level (default: full)" }
					)
				),
				file: Type.Optional(
					Type.String({ description: "File path filter" })
				),
				limit: Type.Optional(
					Type.Number({ description: "Maximum results (default: 30)" })
				),
			}),

			async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
				const cwd = ctx?.cwd ?? process.cwd();

				if (!params.method || params.method.length === 0) {
					return {
						content: [{ type: "text" as const, text: "Error: method is required" }],
						details: { error: "method is required", total: 0, truncated: false, results: [] },
					};
				}

				try {
					const result = await searchMethod(
						{
							method: params.method,
							className: params.className,
							includeImplementation: params.includeImplementation,
							detailLevel: params.detailLevel as "full" | "signature" | "outline" | undefined,
							file: params.file,
							limit: params.limit,
						},
						cwd
					);

					return {
						content: [
							{
								type: "text" as const,
								text: formatSearchMethod(result),
							},
						],
						details: result,
					};
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					return {
						content: [{ type: "text" as const, text: `Error: ${errorMessage}` }],
						details: { error: errorMessage, total: 0, truncated: false, results: [] },
					};
				}
			},
		});

		// ============================================
		// Tool: fault_localize
		// ============================================
		pi.registerTool({
			name: "fault_localize",
			label: "Fault Localize",
			description:
				"Identify potential bug locations using Spectrum-Based Fault Localization (SBFL). Analyzes test coverage data to find code that is frequently covered by failing tests. Supports Ochiai, Tarantula, and OP2 algorithms.",
			parameters: Type.Object({
				testCommand: Type.String({ description: "Test execution command (e.g., 'npm test', 'pytest')" }),
				failingTests: Type.Optional(
					Type.Array(Type.String(), { description: "List of failing test names" })
				),
				passingTests: Type.Optional(
					Type.Array(Type.String(), { description: "List of passing test names" })
				),
				suspiciousnessThreshold: Type.Optional(
					Type.Number({ description: "Suspiciousness threshold (default: 0.5)" })
				),
				coverageReport: Type.Optional(
					Type.String({ description: "Path to coverage report file" })
				),
				algorithm: Type.Optional(
					Type.Union(
						[
							Type.Literal("ochiai"),
							Type.Literal("tarantula"),
							Type.Literal("op2"),
						],
						{ description: "SBFL algorithm (default: ochiai)" }
					)
				),
			}),

			async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
				const cwd = ctx?.cwd ?? process.cwd();

				if (!params.testCommand || params.testCommand.length === 0) {
					return {
						content: [{ type: "text" as const, text: "Error: testCommand is required" }],
						details: { error: "testCommand is required", locations: [], algorithm: "ochiai", totalTests: 0, failingTestCount: 0, passingTestCount: 0, testExecuted: false },
					};
				}

				try {
					const result = await faultLocalize(
						{
							testCommand: params.testCommand,
							failingTests: params.failingTests,
							passingTests: params.passingTests,
							suspiciousnessThreshold: params.suspiciousnessThreshold,
							coverageReport: params.coverageReport,
							algorithm: params.algorithm as "ochiai" | "tarantula" | "op2" | undefined,
						},
						cwd
					);

					return {
						content: [
							{
								type: "text" as const,
								text: formatFaultLocalize(result),
							},
						],
						details: result,
					};
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					return {
						content: [{ type: "text" as const, text: `Error: ${errorMessage}` }],
						details: { error: errorMessage, locations: [], algorithm: "ochiai", totalTests: 0, failingTestCount: 0, passingTestCount: 0, testExecuted: false },
					};
				}
			},
		});

		// ============================================
		// Tool: search_history
		// ============================================
		pi.registerTool({
			name: "search_history",
			label: "Search History",
			description:
				"Manage search history across sessions. Use 'get' to retrieve history, 'clear' to delete history, 'save_query' to manually save a query. Supports filtering by session (current/previous/all).",
			parameters: Type.Object({
				action: Type.Union(
					[
						Type.Literal("get"),
						Type.Literal("clear"),
						Type.Literal("save_query"),
					],
					{ description: "Action to perform (default: get)" }
				),
				session: Type.Optional(
					Type.Union(
						[
							Type.Literal("current"),
							Type.Literal("previous"),
							Type.Literal("all"),
						],
						{ description: "Session filter (default: all)" }
					)
				),
				limit: Type.Optional(
					Type.Number({ description: "Maximum entries to return (default: 50)" })
				),
				query: Type.Optional(
					Type.String({ description: "Query to save (for save_query action)" })
				),
				tool: Type.Optional(
					Type.String({ description: "Tool name (for save_query action)" })
				),
			}),

			async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
				const cwd = ctx?.cwd ?? process.cwd();

				try {
					const result = await searchHistory(
						{
							action: params.action ?? "get",
							session: params.session as "current" | "previous" | "all" | undefined,
							limit: params.limit,
							query: params.query,
							tool: params.tool,
						},
						cwd
					);

					return {
						content: [
							{
								type: "text" as const,
								text: formatSearchHistory(result),
							},
						],
						details: result,
					};
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					return {
						content: [{ type: "text" as const, text: `Error: ${errorMessage}` }],
						details: { error: errorMessage, queries: [], session: "all", total: 0 },
					};
				}
			},
		});

		// ============================================
		// Tool: ast_summary
		// ============================================
		pi.registerTool({
			name: "ast_summary",
			label: "AST Summary",
			description:
				"Display AST structure of a file in tree, flat, or JSON format. Supports depth control and type information. Useful for understanding file structure quickly.",
			parameters: Type.Object({
				file: Type.String({ description: "File path to analyze" }),
				format: Type.Optional(
					Type.Union(
						[
							Type.Literal("tree"),
							Type.Literal("flat"),
							Type.Literal("json"),
						],
						{ description: "Output format (default: tree)" }
					)
				),
				depth: Type.Optional(
					Type.Number({ description: "Depth level for tree display (default: 2)" })
				),
				includeTypes: Type.Optional(
					Type.Boolean({ description: "Include type information (default: true)" })
				),
				includeCalls: Type.Optional(
					Type.Boolean({ description: "Include call relationships (default: false)" })
				),
			}),

			async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
				const cwd = ctx?.cwd ?? process.cwd();

				if (!params.file || params.file.length === 0) {
					return {
						content: [{ type: "text" as const, text: "Error: file is required" }],
						details: {
							file: "",
							format: "tree",
							root: [],
							stats: { totalClasses: 0, totalFunctions: 0, totalMethods: 0, totalVariables: 0 },
							error: "file is required",
						},
					};
				}

				try {
					const result = await astSummary(
						{
							file: params.file,
							format: params.format as "tree" | "flat" | "json" | undefined,
							depth: params.depth,
							includeTypes: params.includeTypes,
							includeCalls: params.includeCalls,
						},
						cwd
					);

					return {
						content: [
							{
								type: "text" as const,
								text: formatAstSummary(result),
							},
						],
						details: result,
					};
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					return {
						content: [{ type: "text" as const, text: `Error: ${errorMessage}` }],
						details: {
							file: params.file,
							format: "tree",
							root: [],
							stats: { totalClasses: 0, totalFunctions: 0, totalMethods: 0, totalVariables: 0 },
							error: errorMessage,
						},
					};
				}
			},
		});

		// ============================================
		// Tool: merge_results
		// ============================================
		pi.registerTool({
			name: "merge_results",
			label: "Merge Results",
			description:
				"Merge results from multiple search methods (semantic, symbol, code) with ranking improvements. Supports weighted, rank_fusion, and interleave strategies.",
			parameters: Type.Object({
				sources: Type.Array(
					Type.Object({
						type: Type.Union(
							[
								Type.Literal("semantic"),
								Type.Literal("symbol"),
								Type.Literal("code"),
							],
							{ description: "Source type" }
						),
						query: Type.String({ description: "Search query" }),
						weight: Type.Optional(
							Type.Number({ description: "Weight for this source (default: 1.0)" })
						),
					}),
					{ description: "Search sources to merge" }
				),
				deduplicate: Type.Optional(
					Type.Boolean({ description: "Deduplicate results (default: true)" })
				),
				limit: Type.Optional(
					Type.Number({ description: "Maximum results (default: 20)" })
				),
				mergeStrategy: Type.Optional(
					Type.Union(
						[
							Type.Literal("weighted"),
							Type.Literal("rank_fusion"),
							Type.Literal("interleave"),
						],
						{ description: "Merge strategy (default: weighted)" }
					)
				),
			}),

			async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
				const cwd = ctx?.cwd ?? process.cwd();

				if (!params.sources || params.sources.length === 0) {
					return {
						content: [{ type: "text" as const, text: "Error: sources array is required" }],
						details: {
							merged: [],
							stats: { totalSources: 0, totalResults: 0, duplicatesRemoved: 0 },
							error: "sources array is required",
						},
					};
				}

				try {
					const result = await mergeResults(
						{
							sources: params.sources as Array<{
								type: "semantic" | "symbol" | "code";
								query: string;
								weight?: number;
							}>,
							deduplicate: params.deduplicate,
							limit: params.limit,
							mergeStrategy: params.mergeStrategy as "weighted" | "rank_fusion" | "interleave" | undefined,
						},
						cwd
					);

					return {
						content: [
							{
								type: "text" as const,
								text: formatMergeResults(result),
							},
						],
						details: result,
					};
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					return {
						content: [{ type: "text" as const, text: `Error: ${errorMessage}` }],
						details: {
							merged: [],
							stats: { totalSources: 0, totalResults: 0, duplicatesRemoved: 0 },
							error: errorMessage,
						},
					};
				}
			},
		});

		// ============================================
		// Tool: repograph_index
		// ============================================
		pi.registerTool({
			name: "repograph_index",
			label: "RepoGraph Index",
			description:
				"Build a RepoGraph index showing line-level code dependencies. Uses tree-sitter for AST-based analysis. More accurate than regex-based call graph for definition/reference extraction.",
			parameters: Type.Object({
				path: Type.Optional(
					Type.String({ description: "Target path to index (default: project root)" })
				),
				force: Type.Optional(
					Type.Boolean({ description: "Force rebuild even if index exists" })
				),
			}),

			async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
				const cwd = ctx?.cwd ?? process.cwd();

				try {
					const result = await repographIndex(
						{
							path: params.path,
							force: params.force,
						},
						cwd
					);

					return {
						content: [
							{
								type: "text" as const,
								text: formatRepoGraphIndex(result),
							},
						],
						details: result,
					};
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					return {
						content: [{ type: "text" as const, text: `Error: ${errorMessage}` }],
						details: { error: errorMessage, fileCount: 0, nodeCount: 0, edgeCount: 0, outputPath: "" },
					};
				}
			},
		});

		// ============================================
		// Tool: repograph_query
		// ============================================
		pi.registerTool({
			name: "repograph_query",
			label: "RepoGraph Query",
			description:
				"Query the RepoGraph index for symbols, definitions, references, and related nodes. Supports k-hop traversal for context extraction. Requires repograph_index to be built first.",
			parameters: Type.Object({
				type: Type.Union(
					[
						Type.Literal("symbol"),
						Type.Literal("file"),
						Type.Literal("definitions"),
						Type.Literal("references"),
						Type.Literal("related"),
						Type.Literal("stats"),
					],
					{ description: "Query type" }
				),
				symbol: Type.Optional(
					Type.String({ description: "Symbol name (for symbol, definitions, references queries)" })
				),
				file: Type.Optional(
					Type.String({ description: "File path filter (for file queries)" })
				),
				nodeId: Type.Optional(
					Type.String({ description: "Node ID for related queries (format: file:line)" })
				),
				depth: Type.Optional(
					Type.Number({ description: "Traversal depth for related queries (default: 2)" })
				),
				limit: Type.Optional(
					Type.Number({ description: "Maximum results (default: 100)" })
				),
			}),

			async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
				const cwd = ctx?.cwd ?? process.cwd();

				try {
					const result = await repographQuery(
						{
							type: params.type as "symbol" | "file" | "definitions" | "references" | "related" | "stats",
							symbol: params.symbol,
							file: params.file,
							nodeId: params.nodeId,
							depth: params.depth,
							limit: params.limit,
						},
						cwd
					);

					return {
						content: [
							{
								type: "text" as const,
								text: formatRepoGraphQuery(result),
							},
						],
						details: result,
					};
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					return {
						content: [{ type: "text" as const, text: `Error: ${errorMessage}` }],
						details: { error: errorMessage, type: params.type, total: 0, truncated: false, nodes: [] },
					};
				}
			},
		});

		// ============================================
		// Session Start Notification
		// ============================================
		if (pi.on) {
			pi.on("session_start", async (_event, ctx) => {
				// Check tool availability asynchronously
				const availability = await checkToolAvailability();

				const tools: string[] = [];
				if (availability.fd) tools.push("fd");
				if (availability.rg) tools.push("rg");
				if (availability.ctags) tools.push("ctags");

				const message =
					tools.length > 0
						? `search extension loaded (using: ${tools.join(", ")})`
						: "search extension loaded (using native fallbacks)";

				if (ctx?.ui) {
					ctx.ui.notify(message, "info");
				}
			});
		}
	} catch (error) {
		console.error("search extension error:", error);
	}
}
