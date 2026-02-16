/**
 * code_search Tool
 *
 * Fast code search using ripgrep (rg) with JSON output and fallback support
 */

import { execute, buildRgArgs, checkToolAvailability } from "../utils/cli.js";
import type {
	CodeSearchInput,
	CodeSearchOutput,
	CodeSearchMatch,
	CodeSearchSummary,
} from "../types.js";
import {
	truncateResults,
	parseRgOutput,
	summarizeResults,
	createCodeSearchError,
} from "../utils/output.js";

// ============================================
// Native Fallback Implementation
// ============================================

/**
 * Pure Node.js code search fallback
 */
async function nativeCodeSearch(
	input: CodeSearchInput,
	cwd: string
): Promise<CodeSearchOutput> {
	const { readdir, readFile } = await import("node:fs/promises");
	const { join, relative } = await import("node:path");

	const results: CodeSearchMatch[] = [];
	const limit = input.limit ?? 50;
	const summary = new Map<string, number>();

	// Build regex pattern
	let pattern: RegExp;
	try {
		const flags = input.ignoreCase !== false ? "gi" : "g";
		if (input.literal) {
			const escaped = input.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			pattern = new RegExp(escaped, flags);
		} else {
			pattern = new RegExp(input.pattern, flags);
		}
	} catch (e) {
		return createCodeSearchError(`Invalid pattern: ${e}`);
	}

	async function searchFile(filePath: string): Promise<void> {
		try {
			const content = await readFile(filePath, "utf-8");
			const lines = content.split("\n");

			for (let i = 0; i < lines.length; i++) {
				if (results.length >= limit * 2) break;

				const line = lines[i];
				const match = pattern.exec(line);

				if (match) {
					const relPath = relative(cwd, filePath);
					const result: CodeSearchMatch = {
						file: relPath,
						line: i + 1,
						column: match.index + 1,
						text: line.trimEnd(),
					};

					// Context lines
					if (input.context && input.context > 0) {
						const start = Math.max(0, i - input.context);
						const end = Math.min(lines.length - 1, i + input.context);
						result.context = lines.slice(start, end + 1).map((l) => l.trimEnd());
					}

					results.push(result);
					summary.set(relPath, (summary.get(relPath) || 0) + 1);
				}

				// Reset regex lastIndex for global flag
				pattern.lastIndex = 0;
			}
		} catch {
			// Skip files that can't be read
		}
	}

	async function scanDir(dirPath: string): Promise<void> {
		try {
			const entries = await readdir(dirPath, { withFileTypes: true });

			for (const entry of entries) {
				if (results.length >= limit * 2) break;

				// Skip hidden and common exclusions
				if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

				const fullPath = join(dirPath, entry.name);

				if (entry.isFile()) {
					// Type filter
					if (input.type) {
						const ext = entry.name.split(".").pop()?.toLowerCase();
						if (ext !== input.type.toLowerCase()) continue;
					}

					await searchFile(fullPath);
				} else if (entry.isDirectory()) {
					await scanDir(fullPath);
				}
			}
		} catch {
			// Skip inaccessible directories
		}
	}

	const searchPath = input.path ? join(cwd, input.path) : cwd;
	await scanDir(searchPath);

	const truncated = truncateResults(results, limit);
	return {
		total: truncated.total,
		truncated: truncated.truncated,
		summary: summarizeResults(summary),
		results: truncated.results,
	};
}

// ============================================
// rg Command Implementation
// ============================================

/**
 * Use ripgrep command for code search
 */
async function useRgCommand(
	input: CodeSearchInput,
	cwd: string
): Promise<CodeSearchOutput> {
	const args = buildRgArgs(input);
	const limit = input.limit ?? 50;

	const result = await execute("rg", args, { cwd });

	if (result.code !== 0 && result.code !== 1) {
		// exitCode 1 means no matches, which is fine
		throw new Error(`rg command failed: ${result.stderr}`);
	}

	const { matches, summary } = parseRgOutput(result.stdout, input.context ?? 0);
	const truncated = truncateResults(matches, limit);

	return {
		total: truncated.total,
		truncated: truncated.truncated,
		summary: summarizeResults(summary),
		results: truncated.results,
	};
}

// ============================================
// Main Entry Point
// ============================================

/**
 * Code search with rg or fallback
 */
export async function codeSearch(
	input: CodeSearchInput,
	cwd: string
): Promise<CodeSearchOutput> {
	if (!input.pattern || input.pattern.length === 0) {
		return createCodeSearchError("pattern is required");
	}

	try {
		const availability = await checkToolAvailability();

		if (availability.rg) {
			return await useRgCommand({ ...input, cwd }, cwd);
		} else {
			return await nativeCodeSearch(input, cwd);
		}
	} catch (error) {
		// Fallback to native on error
		try {
			return await nativeCodeSearch(input, cwd);
		} catch (nativeError) {
			const message = nativeError instanceof Error ? nativeError.message : String(nativeError);
			return createCodeSearchError(message);
		}
	}
}

/**
 * Tool definition for pi.registerTool
 */
export const codeSearchToolDefinition = {
	name: "code_search",
	label: "Code Search",
	description:
		"Search code patterns using ripgrep (rg) with regex support. Returns matches with file, line, and context. Up to 50 results by default.",
	parameters: null, // Will be set in index.ts
};
