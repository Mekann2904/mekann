/**
 * file_candidates Tool
 *
 * Fast file enumeration using fd with fallback support
 */

import { execute, buildFdArgs, checkToolAvailability } from "../utils/cli.js";
import type { FileCandidatesInput, FileCandidatesOutput, FileCandidate } from "../types.js";
import { truncateResults, parseFdOutput, createErrorResponse, relativePath } from "../utils/output.js";

// ============================================
// Native Fallback Implementation
// ============================================

/**
 * Pure Node.js file enumeration fallback
 */
async function nativeFileCandidates(
	input: FileCandidatesInput,
	cwd: string
): Promise<FileCandidatesOutput> {
	const { readdir, stat } = await import("node:fs/promises");
	const { join } = await import("node:path");

	const results: FileCandidate[] = [];
	const limit = input.limit ?? 100;
	const maxDepth = input.maxDepth;

	async function scan(dirPath: string, depth: number): Promise<void> {
		if (results.length >= limit * 2) return; // Collect more than needed for filtering
		if (maxDepth !== undefined && depth > maxDepth) return;

		try {
			const entries = await readdir(dirPath, { withFileTypes: true });

			for (const entry of entries) {
				if (results.length >= limit * 2) break;

				// Skip hidden files
				if (entry.name.startsWith(".")) continue;

				// Skip excluded patterns
				if (input.exclude) {
					if (input.exclude.some((exc) => entry.name === exc || entry.name.includes(exc))) {
						continue;
					}
				}

				const fullPath = join(dirPath, entry.name);
				const relative = relativePath(fullPath, cwd);

				if (entry.isFile()) {
					// Apply type filter
					if (input.type && input.type !== "file") continue;

					// Apply extension filter
					if (input.extension && input.extension.length > 0) {
						const ext = entry.name.split(".").pop()?.toLowerCase();
						if (!ext || !input.extension.map((e) => e.toLowerCase()).includes(ext)) {
							continue;
						}
					}

					// Apply pattern filter
					if (input.pattern) {
						const regex = new RegExp(
							input.pattern.replace(/\./g, "\\.").replace(/\*/g, ".*").replace(/\?/g, ".")
						);
						if (!regex.test(entry.name)) continue;
					}

					results.push({ path: relative, type: "file" });
				} else if (entry.isDirectory()) {
					if (input.type === "file") {
						// Still scan directories for files
						await scan(fullPath, depth + 1);
					} else if (input.type === "dir") {
						results.push({ path: relative, type: "dir" });
						await scan(fullPath, depth + 1);
					} else {
						// No type filter, scan for both
						await scan(fullPath, depth + 1);
					}
				}
			}
		} catch {
			// Skip inaccessible directories
		}
	}

	await scan(cwd, 0);
	return truncateResults(results, limit);
}

// ============================================
// fd Command Implementation
// ============================================

/**
 * Use fd command for file enumeration
 */
async function useFdCommand(
	input: FileCandidatesInput,
	cwd: string
): Promise<FileCandidatesOutput> {
	const args = buildFdArgs(input);
	const limit = input.limit ?? 100;

	// Use input.cwd as search directory, fallback to cwd parameter
	const searchDir = input.cwd || cwd;

	const result = await execute("fd", args, { cwd: searchDir });

	if (result.code !== 0) {
		throw new Error(`fd command failed: ${result.stderr}`);
	}

	const candidates = parseFdOutput(result.stdout, input.type ?? "file");
	return truncateResults(candidates, limit);
}

// ============================================
// Main Entry Point
// ============================================

/**
 * Enumerate file candidates with fd or fallback
 */
export async function fileCandidates(
	input: FileCandidatesInput,
	cwd: string
): Promise<FileCandidatesOutput> {
	try {
		const availability = await checkToolAvailability();

		if (availability.fd) {
			return await useFdCommand({ ...input, cwd }, cwd);
		} else {
			return await nativeFileCandidates(input, cwd);
		}
	} catch (error) {
		// Fallback to native on error
		try {
			return await nativeFileCandidates(input, cwd);
		} catch (nativeError) {
			const message = nativeError instanceof Error ? nativeError.message : String(nativeError);
			return createErrorResponse<FileCandidate>(message);
		}
	}
}

/**
 * Tool definition for pi.registerTool
 */
export const fileCandidatesToolDefinition = {
	name: "file_candidates",
	label: "File Candidates",
	description:
		"Enumerate files and directories using fd with fast glob and extension filtering. Returns up to 100 results by default.",
	parameters: null, // Will be set in index.ts
};
