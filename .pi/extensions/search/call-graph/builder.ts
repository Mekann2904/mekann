/**
 * Call Graph Builder
 *
 * Builds call graph using ripgrep and ctags symbol index.
 * Phase 1: Regex-based call detection with confidence scores.
 */

import { join, dirname } from "node:path";
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import type {
	CallGraphIndex,
	CallGraphNode,
	CallGraphEdge,
	CallGraphMetadata,
	CallGraphNodeKind,
	FunctionDefinition,
	DetectedCall,
} from "./types.js";
import { execute } from "../utils/cli.js";
import { readSymbolIndex } from "../tools/sym_index.js";
import type { SymbolIndexEntry } from "../types.js";
import { DEFAULT_EXCLUDES } from "../utils/constants.js";

// ============================================
// Constants
// ============================================

const CALL_GRAPH_DIR_NAME = "call-graph";
const CALL_GRAPH_INDEX_FILE = "index.json";
const INDEX_VERSION = 1;

// Default confidence levels
const CONFIDENCE_EXACT_MATCH = 0.8;
const CONFIDENCE_SAME_FILE = 1.0;
const CONFIDENCE_COMMON_NAME = 0.5;

// Common function names that are frequently false positives
const COMMON_NAMES = new Set([
	"get",
	"set",
	"init",
	"load",
	"save",
	"parse",
	"format",
	"validate",
	"process",
	"handle",
	"update",
	"delete",
	"create",
	"render",
	"fetch",
	"then",
	"catch",
	"finally",
	"map",
	"filter",
	"reduce",
	"forEach",
	"find",
	"some",
	"every",
	"includes",
	"push",
	"pop",
	"shift",
	"unshift",
	"slice",
	"splice",
	"join",
	"split",
	"toString",
	"valueOf",
	"hasOwnProperty",
	"isPrototypeOf",
]);

// ============================================
// Path Helpers
// ============================================

function getCallGraphDir(cwd: string): string {
	return join(cwd, ".pi/search", CALL_GRAPH_DIR_NAME);
}

function getCallGraphIndexPath(cwd: string): string {
	return join(getCallGraphDir(cwd), CALL_GRAPH_INDEX_FILE);
}

async function fileExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

// ============================================
// Function Definition Extraction
// ============================================

/**
 * Map ctags kind to CallGraphNodeKind
 */
function mapKind(ctagsKind: string): CallGraphNodeKind {
	const kindMap: Record<string, CallGraphNodeKind> = {
		function: "function",
		method: "method",
		arrow: "arrow",
		const: "const",
		f: "function",
		m: "method",
		c: "const",
		v: "const",
	};
	return kindMap[ctagsKind.toLowerCase()] || "function";
}

/**
 * Get function definitions from symbol index.
 * Filters for callable symbols only.
 */
async function getFunctionDefinitions(cwd: string): Promise<FunctionDefinition[]> {
	const entries = await readSymbolIndex(cwd);
	if (!entries) {
		return [];
	}

	// Filter for callable symbols
	const callableKinds = new Set([
		"function",
		"method",
		"f",
		"m",
		"methodproperty",
		"arrow",
	]);

	const definitions: FunctionDefinition[] = [];

	for (const entry of entries) {
		const kind = entry.kind?.toLowerCase() || "";
		if (callableKinds.has(kind) || kind.includes("function") || kind.includes("method")) {
			definitions.push({
				name: entry.name,
				file: entry.file,
				line: entry.line,
				kind: mapKind(kind),
				scope: entry.scope,
			});
		}
	}

	return definitions;
}

/**
 * Generate unique node ID
 */
function generateNodeId(def: FunctionDefinition): string {
	return `${def.file}:${def.line}:${def.name}`;
}

// ============================================
// Function Body Extraction
// ============================================

/**
 * Extract function body using ripgrep with context.
 * Returns lines between function definition and next function/class at same or lower indentation.
 */
async function extractFunctionBody(
	def: FunctionDefinition,
	cwd: string
): Promise<{ body: string; startLine: number; endLine: number } | null> {
	// Read the file content starting from the function definition
	const args = [
		"--json",
		"--line-number",
		"--", def.name,
		def.file,
	];

	const result = await execute("rg", args, { cwd });
	if (result.code !== 0) {
		return null;
	}

	// Find the definition line and extract body
	const lines = result.stdout.trim().split("\n");
	let bodyStartLine = def.line;
	let bodyEndLine = def.line;

	// Simple heuristic: get content until next function definition or class
	// This is a Phase 1 simplification - real implementation would use tree-sitter
	for (const line of lines) {
		try {
			const parsed = JSON.parse(line);
			if (parsed.type === "match") {
				const lineNum = parsed.data.line_number;
				if (lineNum > def.line) {
					// Check if this is a new function definition
					const text = parsed.data.lines.text;
					if (/^\s*(function|const|let|var|async|export|public|private|protected)/.test(text)) {
						bodyEndLine = lineNum - 1;
						break;
					}
					bodyEndLine = lineNum;
				}
			}
		} catch {
			// Skip non-JSON lines
		}
	}

	return {
		body: "", // Body extraction is complex, we'll use ripgrep directly for calls
		startLine: bodyStartLine,
		endLine: Math.max(bodyEndLine, bodyStartLine + 1),
	};
}

// ============================================
// Call Detection
// ============================================

/**
 * Build regex pattern for function calls.
 * Matches functionName( but excludes declarations and property access.
 */
function buildCallPattern(functionName: string): string {
	// Escape special regex characters in function name
	const escaped = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

	// Pattern: function name followed by (
	// Exclude: function name at start of line (declaration)
	// Exclude: .functionName (method call on object - we want these too though)
	// Include: functionName( - direct call
	return `(?<![\\w.])${escaped}\\s*\\(`;
}

/**
 * Find all calls to a specific function using ripgrep.
 */
async function findCallsToFunction(
	functionName: string,
	cwd: string,
	limit = 100
): Promise<DetectedCall[]> {
	const args = [
		"--json",
		"--line-number",
		"--column",
	];

	// Add exclusions
	for (const exc of DEFAULT_EXCLUDES) {
		args.push("--glob", `!${exc}`);
	}

	// Add pattern and path
	args.push("--", buildCallPattern(functionName), ".");

	const result = await execute("rg", args, { cwd, timeout: 60000 });
	if (result.code !== 0) {
		return [];
	}

	const calls: DetectedCall[] = [];
	const lines = result.stdout.trim().split("\n");

	for (const line of lines) {
		if (calls.length >= limit) break;

		try {
			const parsed = JSON.parse(line);
			if (parsed.type === "match") {
				const match = parsed.data;
				const submatch = match.submatches?.[0];
				if (submatch) {
					calls.push({
						name: functionName,
						file: match.path.text,
						line: match.line_number,
						column: submatch.start + 1, // 1-indexed
						text: match.lines.text.trim(),
					});
				}
			}
		} catch {
			// Skip non-JSON lines
		}
	}

	return calls;
}

/**
 * Find all function calls within a specific file and line range.
 * Used to find calls made by a specific function.
 */
async function findCallsInFile(
	filePath: string,
	startLine: number,
	endLine: number,
	cwd: string,
	knownFunctions: Set<string>
): Promise<DetectedCall[]> {
	// Read file content in the range
	const args = [
		"--json",
		"--line-number",
		"--column",
	];

	// Add exclusions
	for (const exc of DEFAULT_EXCLUDES) {
		args.push("--glob", `!${exc}`);
	}

	// Build pattern for any known function call
	// This is expensive, so we use a simpler approach: find all identifier(
	// and filter against known functions
	const callPattern = "\\b([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\(";
	args.push("--", callPattern, filePath);

	const result = await execute("rg", args, { cwd, timeout: 30000 });
	if (result.code !== 0) {
		return [];
	}

	const calls: DetectedCall[] = [];
	const lines = result.stdout.trim().split("\n");

	for (const line of lines) {
		try {
			const parsed = JSON.parse(line);
			if (parsed.type === "match") {
				const match = parsed.data;
				const lineNum = match.line_number;

				// Check if within function body range
				if (lineNum < startLine || lineNum > endLine + 50) {
					// Allow some buffer for end line
					continue;
				}

				// Extract all submatches (function names)
				for (const submatch of match.submatches || []) {
					const name = submatch.match.text;
					if (knownFunctions.has(name) && name !== "function") {
						calls.push({
							name,
							file: match.path.text,
							line: lineNum,
							column: submatch.start + 1,
							text: match.lines.text.trim(),
						});
					}
				}
			}
		} catch {
			// Skip non-JSON lines
		}
	}

	return calls;
}

// ============================================
// Graph Building
// ============================================

/**
 * Calculate confidence score for a call relationship.
 */
function calculateConfidence(
	call: DetectedCall,
	callerDef: FunctionDefinition,
	allDefinitions: Map<string, FunctionDefinition>
): number {
	let confidence = CONFIDENCE_EXACT_MATCH;

	// Same file bonus
	if (call.file === callerDef.file) {
		confidence = CONFIDENCE_SAME_FILE;
	}

	// Common name penalty
	if (COMMON_NAMES.has(call.name.toLowerCase())) {
		confidence *= 0.7;
	}

	// Check if callee has a definition
	if (!allDefinitions.has(call.name)) {
		confidence *= 0.5; // External or unknown function
	}

	return Math.min(1.0, Math.max(0.1, confidence));
}

 /**
  * プロジェクトのコールグラフを構築する
  * @param path - ターゲットパス（デフォルト: cwd）
  * @param cwd - 作業ディレクトリ
  * @returns コールグラフインデックス
  */
export async function buildCallGraph(
	path: string,
	cwd: string
): Promise<CallGraphIndex> {
	const targetPath = path || cwd;

	// 1. Get all function definitions from symbol index
	const definitions = await getFunctionDefinitions(targetPath);

	if (definitions.length === 0) {
		return {
			nodes: [],
			edges: [],
			metadata: {
				indexedAt: Date.now(),
				parserBackend: "ripgrep",
				fileCount: 0,
				nodeCount: 0,
				edgeCount: 0,
				version: INDEX_VERSION,
			},
		};
	}

	// 2. Create nodes
	const nodes: CallGraphNode[] = definitions.map((def) => ({
		id: generateNodeId(def),
		name: def.name,
		file: def.file,
		line: def.line,
		kind: def.kind,
		scope: def.scope,
	}));

	// 3. Build definition lookup map
	const definitionMap = new Map<string, FunctionDefinition>();
	const definitionByFile = new Map<string, FunctionDefinition[]>();

	for (const def of definitions) {
		definitionMap.set(def.name, def);
		const fileDefs = definitionByFile.get(def.file) || [];
		fileDefs.push(def);
		definitionByFile.set(def.file, fileDefs);
	}

	// 4. Find calls for each definition
	const edges: CallGraphEdge[] = [];
	const knownFunctions = new Set(definitions.map((d) => d.name));

	for (const callerDef of definitions) {
		const callerId = generateNodeId(callerDef);

		// Find calls made by this function
		// Phase 1: Use simple line-based range estimation
		const fileDefs = definitionByFile.get(callerDef.file) || [];
		const sortedDefs = fileDefs.sort((a, b) => a.line - b.line);
		const callerIndex = sortedDefs.findIndex((d) => d.line === callerDef.line);
		const nextDefLine = sortedDefs[callerIndex + 1]?.line || callerDef.line + 100;

		const calls = await findCallsInFile(
			callerDef.file,
			callerDef.line,
			nextDefLine,
			cwd,
			knownFunctions
		);

		for (const call of calls) {
			// Skip self-calls
			if (call.name === callerDef.name && call.file === callerDef.file) {
				continue;
			}

			const confidence = calculateConfidence(call, callerDef, definitionMap);

			edges.push({
				caller: callerId,
				callee: call.name,
				callSite: {
					file: call.file,
					line: call.line,
					column: call.column,
				},
				confidence,
			});
		}
	}

	// 5. Build metadata
	const uniqueFiles = new Set(definitions.map((d) => d.file));

	return {
		nodes,
		edges,
		metadata: {
			indexedAt: Date.now(),
			parserBackend: "ripgrep",
			fileCount: uniqueFiles.size,
			nodeCount: nodes.length,
			edgeCount: edges.length,
			version: INDEX_VERSION,
		},
	};
}

// ============================================
// Index Persistence
// ============================================

 /**
  * コールグラフのインデックスをファイルに保存します。
  * @param index コールグラフのインデックスデータ
  * @param cwd カレントワーキングディレクトリ
  * @returns 保存先のファイルパス
  */
export async function saveCallGraphIndex(
	index: CallGraphIndex,
	cwd: string
): Promise<string> {
	const indexPath = getCallGraphIndexPath(cwd);
	const dir = dirname(indexPath);

	await mkdir(dir, { recursive: true });
	await writeFile(indexPath, JSON.stringify(index, null, 2), "utf-8");

	return indexPath;
}

 /**
  * コールグラフのインデックスを読み込む
  * @param cwd 作業ディレクトリのパス
  * @returns コールグラフのインデックス、存在しない場合はnull
  */
export async function readCallGraphIndex(
	cwd: string
): Promise<CallGraphIndex | null> {
	const indexPath = getCallGraphIndexPath(cwd);

	if (!(await fileExists(indexPath))) {
		return null;
	}

	try {
		const content = await readFile(indexPath, "utf-8");
		return JSON.parse(content) as CallGraphIndex;
	} catch {
		return null;
	}
}

 /**
  * コールグラフインデックスが古いか確認
  * @param cwd カレントワーキングディレクトリ
  * @returns 古い場合は true
  */
export async function isCallGraphIndexStale(cwd: string): Promise<boolean> {
	const index = await readCallGraphIndex(cwd);
	if (!index) return true;

	// Check if symbol index is newer
	const symIndexMeta = await import("../tools/sym_index.js")
		.then((m) => m.getIndexMetadata(cwd))
		.catch(() => null);

	if (symIndexMeta && symIndexMeta.updatedAt > index.metadata.indexedAt) {
		return true;
	}

	// Index is valid for 1 hour by default
	const maxAge = 60 * 60 * 1000;
	return Date.now() - index.metadata.indexedAt > maxAge;
}
