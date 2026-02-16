/**
 * sym_find Tool
 *
 * Search symbol definitions from the ctags-generated index
 */

import type { SymFindInput, SymFindOutput, SymbolDefinition, SymbolIndexEntry } from "../types.js";
import { truncateResults, createErrorResponse } from "../utils/output.js";
import { symIndex, readSymbolIndex } from "./sym_index.js";

// ============================================
// Filtering
// ============================================

/**
 * Escape regex special characters
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Convert wildcard pattern to regex
 */
function wildcardToRegex(pattern: string): RegExp {
	const escaped = escapeRegex(pattern);
	const regexStr = escaped.replace(/\\\*/g, ".*").replace(/\\\?/g, ".");
	return new RegExp(`^${regexStr}$`, "i");
}

/**
 * Filter symbols by criteria
 */
function filterSymbols(
	entries: SymbolIndexEntry[],
	input: SymFindInput
): SymbolDefinition[] {
	// Build name pattern regex
	let nameRegex: RegExp | null = null;
	if (input.name && input.name.length > 0) {
		nameRegex = wildcardToRegex(input.name);
	}

	// Normalize kinds for comparison
	const kinds = input.kind?.map((k) => k.toLowerCase());

	const results: SymbolDefinition[] = [];

	for (const entry of entries) {
		// Name filter
		if (nameRegex && !nameRegex.test(entry.name)) {
			continue;
		}

		// Kind filter
		if (kinds && kinds.length > 0) {
			const entryKind = entry.kind?.toLowerCase();
			if (!entryKind || !kinds.includes(entryKind)) {
				continue;
			}
		}

		// File filter
		if (input.file && input.file.length > 0) {
			if (!entry.file.includes(input.file)) {
				continue;
			}
		}

		results.push({
			name: entry.name,
			kind: entry.kind,
			file: entry.file,
			line: entry.line,
			signature: entry.signature,
			scope: entry.scope,
		});
	}

	return results;
}

/**
 * Sort symbols by relevance
 */
function sortSymbols(symbols: SymbolDefinition[], input: SymFindInput): void {
	symbols.sort((a, b) => {
		// Exact name match priority
		if (input.name) {
			const aExact = a.name.toLowerCase() === input.name.toLowerCase() ? 0 : 1;
			const bExact = b.name.toLowerCase() === input.name.toLowerCase() ? 0 : 1;
			if (aExact !== bExact) return aExact - bExact;
		}

		// Then by kind (functions first)
		const kindOrder: Record<string, number> = {
			function: 1,
			method: 2,
			class: 3,
			interface: 4,
			struct: 5,
			variable: 6,
			constant: 7,
		};
		const aKind = kindOrder[a.kind?.toLowerCase()] ?? 99;
		const bKind = kindOrder[b.kind?.toLowerCase()] ?? 99;
		if (aKind !== bKind) return aKind - bKind;

		// Then by file path
		return a.file.localeCompare(b.file);
	});
}

// ============================================
// Main Entry Point
// ============================================

/**
 * Find symbol definitions from index
 */
export async function symFind(
	input: SymFindInput,
	cwd: string
): Promise<SymFindOutput> {
	const limit = input.limit ?? 50;

	// Try to read existing index
	let entries = await readSymbolIndex(cwd);

	// If no index exists, try to generate one
	if (!entries || entries.length === 0) {
		const indexResult = await symIndex({ force: false, cwd }, cwd);

		// Check for error
		if (indexResult.error) {
			return createErrorResponse<SymbolDefinition>(indexResult.error);
		}

		entries = await readSymbolIndex(cwd);
	}

	if (!entries || entries.length === 0) {
		return {
			total: 0,
			truncated: false,
			results: [],
		};
	}

	// Filter entries
	const filtered = filterSymbols(entries, input);

	// Sort by relevance
	sortSymbols(filtered, input);

	// Truncate to limit
	return truncateResults(filtered, limit);
}

/**
 * Tool definition for pi.registerTool
 */
export const symFindToolDefinition = {
	name: "sym_find",
	label: "Symbol Find",
	description:
		"Search for symbol definitions (functions, classes, variables) from the ctags index. Supports pattern matching on name and filtering by kind.",
	parameters: null, // Will be set in index.ts
};
