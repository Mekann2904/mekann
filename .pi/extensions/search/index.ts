/**
 * @abdd.meta
 * path: .pi/extensions/search/index.ts
 * role: 検索機能の拡張登録エントリーポイント
 * why: fd, ripgrep, ctagsを用いた高速なファイル検索、コード検索、シンボル検索、および意味検索をエージェントに提供するため
 * related: .pi/extensions/search/tools/file_candidates.ts, .pi/extensions/search/tools/code_search.ts, .pi/extensions/search/tools/call_graph.ts, .pi/extensions/search/tools/semantic_search.ts
 * public_api: file_candidates, code_search, sym_index, sym_find, call_graph_index, find_callers, find_callees, semantic_index, semantic_search
 * invariants: 実行にはExtensionAPIインスタンスが必要、ツールごとの戻り値はフォーマット済み文字列と詳細オブジェクトを含む構造体
 * side_effects: 外部コマンド(fd, rg, ctags)のプロセス生成、標準出力へのエラーログ出力
 * failure_modes: 必要な外部コマンドがインストールされていない場合のエラー、無効な正規表現やパス指定による実行時エラー
 * @abdd.explain
 * overview: PI Coding Agentに対して、ソースコードの静的解析と検索を行うツール群を登録するモジュール
 * what_it_does:
 *   - 高速ファイル列挙ツール(fd)とコードパターン検索ツール(ripgrep)の登録
 *   - ctagsを利用したシンボル定義のインデックス作成と検索機能の提供
 *   - 呼び出し関係(call graph)のインデックス作成、呼び出し元/呼び出し先の検索
 *   - ベクトル埋め込みを用いた意味的インデックス作成と自然言語検索の実行
 *   - 外部コマンドの有無チェックと実行結果のフォーマット
 * why_it_exists:
 *   - エージェントがプロジェクト内のファイルやコード構造を迅速に把握・移動するため
 *   - テキストマッチングだけでなく、意味理解や構造依存の検索ニーズに対応するため
 * scope:
 *   in: ExtensionAPIオブジェクト、各ツールのクエリパラメータ
 *   out: 登録されたツールオブジェクト、ツール実行結果としてのテキストメッセージおよび詳細データオブジェクト
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
				"Search for symbol definitions (functions, classes, variables) from the ctags index. Supports pattern matching on name and filtering by kind.",
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
				limit: Type.Optional(
					Type.Number({ description: "Maximum results (default: 50)" })
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
							limit: params.limit,
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
