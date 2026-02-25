/**
 * @abdd.meta
 * path: .pi/extensions/repograph-localization/index.ts
 * role: RepoGraph-based code localization extension for subagents and agent teams
 * why: Integrate RepoGraph methodology into AI software engineering workflows
 * related: .pi/extensions/search/repograph/index.ts, .pi/extensions/subagents.ts
 * public_api: repographLocalize, extractKeywords, enrichContext
 * invariants:
 * - Returns empty array if RepoGraph index not found
 * - Keyword extraction is language-agnostic
 * side_effects:
 * - Reads RepoGraph index from disk
 * - May trigger index build if requested
 * failure_modes:
 * - Index not found: returns empty result
 * - Parse errors: handled gracefully
 * @abdd.explain
 * overview: Integration layer for RepoGraph-based code localization
 * what_it_does:
 * - Extract keywords from task descriptions
 * - Query RepoGraph for relevant code locations
 * - Enrich subagent/agent team context with localization data
 * why_it_exists:
 * - Bridge RepoGraph functionality with agent orchestration
 * - Enable SWE-bench methodology (+32.8% improvement)
 * scope:
 * in: Task descriptions, RepoGraph index
 * out: Localization results, enriched context
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { loadRepoGraph, getRepoGraphPath } from "../search/repograph/storage.js";
import { extractEgograph, formatEgograph } from "../search/repograph/egograph.js";
import type { EgographOptions, EgographResult } from "../search/repograph/egograph.js";

// ============================================
// Types
// ============================================

/**
 * Localization result from RepoGraph
 */
export interface LocalizationResult {
	/** Whether localization was successful */
	success: boolean;
	/** Error message if unsuccessful */
	error?: string;
	/** Relevant file:line locations */
	locations: Array<{
		file: string;
		line: number;
		symbolName: string;
		nodeType: "def" | "ref" | "import";
		relevance: number;
	}>;
	/** Egograph result if available */
	egograph?: EgographResult;
}

/**
 * Keyword extraction result
 */
export interface KeywordExtraction {
	/** Extracted keywords */
	keywords: string[];
	/** Confidence score (0-1) */
	confidence: number;
	/** Extraction method used */
	method: "regex" | "heuristic";
}

// ============================================
// Keyword Extraction
// ============================================

/**
 * Common code-related patterns for keyword extraction
 */
const CODE_PATTERNS = [
	// Function/method names
	/\b([a-z][a-zA-Z0-9_]*)\s*\(/gi,
	// Class names
	/\b([A-Z][a-zA-Z0-9_]*)\b/g,
	// Variable names in context
	/\b([a-z][a-zA-Z0-9_]*)\s*[=:]/gi,
	// File paths
	/['"]([^'"]+\.(ts|tsx|js|jsx|py))['"]/gi,
	// Error identifiers
	/\b([A-Z_]{2,}[A-Z_]*)\b/g,
];

/**
 * Stop words to filter out
 */
const STOP_WORDS = new Set([
	"the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
	"have", "has", "had", "do", "does", "did", "will", "would", "could",
	"should", "may", "might", "must", "shall", "can", "need", "dare",
	"ought", "used", "to", "of", "in", "for", "on", "with", "at", "by",
	"from", "as", "into", "through", "during", "before", "after",
	"above", "below", "between", "under", "again", "further", "then",
	"once", "here", "there", "when", "where", "why", "how", "all", "each",
	"few", "more", "most", "other", "some", "such", "no", "nor", "not",
	"only", "own", "same", "so", "than", "too", "very", "just", "and",
	"but", "if", "or", "because", "until", "while", "this", "that",
	"these", "those", "what", "which", "who", "whom", "whose", "it",
	"its", "they", "them", "their", "we", "us", "our", "you", "your",
	"he", "him", "his", "she", "her", "i", "me", "my",
	// Code common words
	"function", "class", "const", "let", "var", "return", "import",
	"export", "default", "async", "await", "new", "this", "self",
	"true", "false", "null", "undefined", "void", "type", "interface",
]);

/**
 * Extract keywords from a task description
 * @summary タスク説明からキーワードを抽出
 * @param task - Task description text
 * @returns Extracted keywords with confidence
 */
export function extractKeywords(task: string): KeywordExtraction {
	const keywords = new Set<string>();

	// Extract using code patterns
	for (const pattern of CODE_PATTERNS) {
		const matches = task.matchAll(pattern);
		for (const match of matches) {
			if (match[1] && match[1].length >= 2 && match[1].length <= 50) {
				const word = match[1].toLowerCase();
				if (!STOP_WORDS.has(word) && !/^\d+$/.test(word)) {
					keywords.add(word);
				}
			}
		}
	}

	// Extract quoted strings (often contain identifiers)
	const quotedMatches = task.matchAll(/['"`]([^'"`]+)['"`]/g);
	for (const match of quotedMatches) {
		if (match[1] && match[1].length >= 2 && match[1].length <= 50) {
			keywords.add(match[1].toLowerCase());
		}
	}

	// Extract camelCase/snake_case identifiers
	const identifierMatches = task.matchAll(/\b([a-z]+[A-Z][a-zA-Z]*|[a-z]+_[a-z_]+)\b/g);
	for (const match of identifierMatches) {
		if (match[1] && !STOP_WORDS.has(match[1].toLowerCase())) {
			keywords.add(match[1]);
		}
	}

	return {
		keywords: Array.from(keywords).slice(0, 20), // Limit to 20 keywords
		confidence: Math.min(1.0, keywords.size / 5), // Higher confidence with more keywords
		method: "regex",
	};
}

// ============================================
// Localization Functions
// ============================================

/**
 * Perform RepoGraph-based localization for a task
 * @summary RepoGraphベースのコードローカライゼーション
 * @param task - Task description
 * @param cwd - Working directory
 * @param options - Localization options
 * @returns Localization result
 */
export async function repographLocalize(
	task: string,
	cwd: string,
	options?: {
		/** Number of hops for egograph (default: 2) */
		k?: number;
		/** Maximum nodes to return (default: 50) */
		maxNodes?: number;
		/** Include egograph in result */
		includeEgograph?: boolean;
	}
): Promise<LocalizationResult> {
	const indexPath = getRepoGraphPath(cwd);

	// Load RepoGraph index
	const graph = await loadRepoGraph(cwd);

	if (!graph) {
		return {
			success: false,
			error: `RepoGraph index not found at ${indexPath}. Run repograph_index first.`,
			locations: [],
		};
	}

	// Extract keywords from task
	const extraction = extractKeywords(task);

	if (extraction.keywords.length === 0) {
		return {
			success: false,
			error: "No keywords could be extracted from the task description.",
			locations: [],
		};
	}

	// Build egograph options
	const egographOptions: EgographOptions = {
		keywords: extraction.keywords,
		k: options?.k ?? 2,
		maxNodes: options?.maxNodes ?? 50,
		summarize: true,
	};

	// Extract egograph
	const egograph = extractEgograph(graph, egographOptions);

	// Convert to localization result
	const locations = egograph.nodes.map((node, index) => ({
		file: node.file,
		line: node.line,
		symbolName: node.symbolName,
		nodeType: node.nodeType as "def" | "ref" | "import",
		relevance: 1.0 - (index * 0.01), // Higher relevance for earlier nodes
	}));

	return {
		success: true,
		locations,
		egograph: options?.includeEgograph ? egograph : undefined,
	};
}

/**
 * Enrich context with RepoGraph localization data
 * @summary RepoGraphデータでコンテキストを拡張
 * @param task - Task description
 * @param cwd - Working directory
 * @returns Enriched context string
 */
export async function enrichContext(
	task: string,
	cwd: string
): Promise<string> {
	const result = await repographLocalize(task, cwd, {
		k: 2,
		maxNodes: 30,
		includeEgograph: true,
	});

	if (!result.success) {
		return `## RepoGraph Localization\n\n${result.error}`;
	}

	const lines: string[] = [];
	lines.push(`## RepoGraph Localization\n`);
	lines.push(`Found ${result.locations.length} relevant code locations:\n`);

	// Group by file
	const byFile = new Map<string, typeof result.locations>();
	for (const loc of result.locations) {
		if (!byFile.has(loc.file)) {
			byFile.set(loc.file, []);
		}
		byFile.get(loc.file)!.push(loc);
	}

	for (const [file, locs] of byFile) {
		lines.push(`### ${file}`);
		for (const loc of locs.slice(0, 10)) {
			const typeIcon = loc.nodeType === "def" ? "D" : loc.nodeType === "ref" ? "R" : "I";
			lines.push(`- \`${loc.line}\` [${typeIcon}] ${loc.symbolName}`);
		}
		if (locs.length > 10) {
			lines.push(`  ... and ${locs.length - 10} more`);
		}
		lines.push("");
	}

	if (result.egograph?.summary) {
		lines.push(`### Summary\n${result.egograph.summary}`);
	}

	return lines.join("\n");
}

// ============================================
// Extension Registration
// ============================================

export default function (pi: ExtensionAPI) {
	// Register localization tool
	pi.registerTool({
		name: "repograph_localize",
		label: "RepoGraph Localize",
		description: `Perform code localization using RepoGraph methodology. Extracts keywords from task description and finds relevant code locations.

This tool is useful for:
- Finding relevant code for bug fixes
- Understanding code dependencies
- Localizing features before implementation

Requires repograph_index to be built first.`,
		parameters: Type.Object({
			task: Type.String({
				description: "Task description to localize",
			}),
			k: Type.Optional(
				Type.Number({
					description: "Number of hops (default: 2)",
					minimum: 1,
					maximum: 5,
				})
			),
			maxNodes: Type.Optional(
				Type.Number({
					description: "Maximum nodes to return (default: 50)",
					minimum: 10,
					maximum: 200,
				})
			),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const cwd = ctx?.cwd ?? process.cwd();

			try {
				const result = await repographLocalize(params.task, cwd, {
					k: params.k,
					maxNodes: params.maxNodes,
					includeEgograph: true,
				});

				if (!result.success) {
					return {
						content: [
							{
								type: "text" as const,
								text: `## Localization Failed\n\n${result.error}`,
							},
						],
						details: result,
					};
				}

				// Format output
				const lines: string[] = [];
				lines.push(`## RepoGraph Localization\n`);
				lines.push(`Found ${result.locations.length} relevant locations.\n`);

				if (result.egograph?.summary) {
					lines.push(`### Summary\n${result.egograph.summary}\n`);
				}

				lines.push(`### Top Locations`);
				for (const loc of result.locations.slice(0, 20)) {
					const typeIcon =
						loc.nodeType === "def" ? "D" : loc.nodeType === "ref" ? "R" : "I";
					lines.push(
						`- \`${loc.file}:${loc.line}\` [${typeIcon}] ${loc.symbolName}`
					);
				}

				return {
					content: [
						{
							type: "text" as const,
							text: lines.join("\n"),
						},
					],
					details: result,
				};
			} catch (error: unknown) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				return {
					content: [
						{
							type: "text" as const,
							text: `## Error\n\n${errorMessage}`,
						},
					],
					details: { success: false, error: errorMessage, locations: [] },
				};
			}
		},
	});

	// ============================================
	// Subagent Context Enrichment Hook
	// ============================================
	if (pi.on) {
		// Hook into subagent tasks to add RepoGraph context
		// Using unknown cast to bypass strict type checking for custom events
		const onEvent = pi.on as unknown as (
			event: string,
			handler: (event: { task: string; cwd: string; context?: Record<string, unknown> }, ctx: unknown) => Promise<void>
		) => void;

		onEvent("subagent:before_task", async (event, _ctx) => {
			const { task, cwd } = event;

			// Skip if task is too short
			if (!task || task.length < 10) return;

			try {
				const enrichment = await enrichContext(task, cwd);

				// Add to subagent context
				if (event.context) {
					event.context.repographContext = enrichment;
				} else {
					event.context = { repographContext: enrichment };
				}
			} catch {
				// Silently fail if RepoGraph not available
			}
		});

		// Hook into agent team tasks
		onEvent("agent_team:before_task", async (event, _ctx) => {
			const { task, cwd } = event;

			if (!task || task.length < 10) return;

			try {
				const enrichment = await enrichContext(task, cwd);

				if (event.context) {
					event.context.repographContext = enrichment;
				} else {
					event.context = { repographContext: enrichment };
				}
			} catch {
				// Silently fail
			}
		});
	}
}
