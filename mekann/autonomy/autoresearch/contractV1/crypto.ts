/**
 * autoresearch/contractV1/crypto.ts — Canonical JSON, hashing, JSONC parsing, plan extraction, environment fingerprint.
 */

import * as crypto from "node:crypto";
import * as path from "node:path";
import * as fs from "node:fs";
import { execFileSync } from "node:child_process";
import { glob as tinyglobby } from "tinyglobby";

// ---------------------------------------------------------------------------
// Canonical JSON + hash
// ---------------------------------------------------------------------------

/**
 * Recursively sort object keys and produce canonical JSON string.
 * JSON.stringify with a replacer that sorts keys at every level.
 */
export function canonicalJsonStringify(value: unknown): string {
	if (value === null || value === undefined) return "null";
	if (typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) {
		return "[" + value.map(canonicalJsonStringify).join(",") + "]";
	}
	const obj = value as Record<string, unknown>;
	const sortedKeys = Object.keys(obj).sort();
	return (
		"{" +
		sortedKeys.map((k) => JSON.stringify(k) + ":" + canonicalJsonStringify(obj[k])).join(",") +
		"}"
	);
}

/**
 * Canonical JSON with pretty printing.
 */
export function canonicalJsonPretty(value: unknown): string {
	const canonical = canonicalJsonStringify(value);
	// Re-parse and pretty print
	return JSON.stringify(JSON.parse(canonical), null, 2);
}

/**
 * Compute SHA-256 hash of canonical JSON.
 */
export function computeContractHash(value: unknown): string {
	const canonical = canonicalJsonStringify(value);
	return "sha256:" + crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Plan block extractor
// ---------------------------------------------------------------------------

const CONTRACT_BLOCK_LANG = "autoresearch-contract jsonc";

/**
 * Extract contract block from plan markdown.
 * Returns the raw JSONC string from the fenced block.
 * Exactly one block is required.
 */
export function extractContractBlockFromPlan(markdown: string): {
	jsonc: string;
	startLine: number;
	endLine: number;
} {
	const lines = markdown.split("\n");
	const blocks: { jsonc: string; startLine: number; endLine: number }[] = [];

	let inBlock = false;
	let blockLang = "";
	let blockStart = -1;
	let blockContent: string[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!inBlock) {
			// Look for opening fence
			const match = line.match(new RegExp(String.fromCharCode(96,96,96) + "\\s*(.+)$"));
			if (match) {
				const lang = match[1].trim();
				if (lang === CONTRACT_BLOCK_LANG) {
					inBlock = true;
					blockLang = lang;
					blockStart = i;
					blockContent = [];
				}
			}
		} else {
			// Look for closing fence
			if (line.match(new RegExp(String.fromCharCode(96,96,96) + "\\s*$"))) {
				blocks.push({
					jsonc: blockContent.join("\n"),
					startLine: blockStart,
					endLine: i,
				});
				inBlock = false;
			} else {
				blockContent.push(line);
			}
		}
	}

	if (blocks.length === 0) {
		throw new Error(
			"plan has no contract block.\n" +
			"exactly one " + CONTRACT_BLOCK_LANG + " fenced code block is required.",
		);
	}

	if (blocks.length > 1) {
		throw new Error(
			"plan has " + blocks.length + " contract blocks.\n" +
			"exactly one " + CONTRACT_BLOCK_LANG + " block is required.",
		);
	}

	return blocks[0];
}

// ---------------------------------------------------------------------------
// JSONC parser (safe, minimal)
// ---------------------------------------------------------------------------

/**
 * Strip JSONC comments (single-line // and multi-line block comments) and trailing commas.
 * This is a simple, safe implementation that handles common JSONC patterns.
 */
export function stripJsonc(input: string): string {
	let result = "";
	let i = 0;
	let inString = false;

	while (i < input.length) {
		const ch = input[i];

		if (inString) {
			result += ch;
			if (ch === "\\" && i + 1 < input.length) {
				// Escaped character - consume next char too
				i++;
				result += input[i];
			} else if (ch === '"') {
				inString = false;
			}
			i++;
			continue;
		}

		if (ch === '"') {
			inString = true;
			result += ch;
			i++;
			continue;
		}

		// Single-line comment
		if (ch === "/" && i + 1 < input.length && input[i + 1] === "/") {
			// Skip until end of line
			while (i < input.length && input[i] !== "\n") {
				i++;
			}
			continue;
		}

		// Multi-line comment
		if (ch === "/" && i + 1 < input.length && input[i + 1] === "*") {
			i += 2;
			while (i < input.length && !(input[i] === "*" && i + 1 < input.length && input[i + 1] === "/")) {
				i++;
			}
			i += 2; // skip */
			continue;
		}

		result += ch;
		i++;
	}

	// Remove trailing commas before } or ]
	result = result.replace(/,\s*([}\]])/g, "$1");

	return result;
}

/**
 * Parse JSONC string to JSON object.
 */
export function parseJsonc(input: string): unknown {
	const stripped = stripJsonc(input);
	return JSON.parse(stripped);
}

// ---------------------------------------------------------------------------
// Immutable read set hash
// ---------------------------------------------------------------------------

/**
 * Compute hash of all files matching immutableReadPaths patterns.
 * Returns { hash, files, warnings }.
 */
export async function computeImmutableReadSetHash(
	cwd: string,
	patterns: string[],
): Promise<{ hash: string; files: string[]; warnings: string[] }> {
	if (patterns.length === 0) {
		return { hash: "sha256:empty", files: [], warnings: [] };
	}

	const warnings: string[] = [];
	const allFiles: string[] = [];

	for (const pattern of patterns) {
		try {
			// Use tinyglobby for glob matching
			const matches = await tinyglobby(pattern, {
				cwd,
				absolute: false,
				dot: true,
				onlyFiles: true,
			});
			if (matches.length === 0) {
				warnings.push('immutableReadPaths pattern "' + pattern + '" matched no files');
			}
			allFiles.push(...matches);
		} catch (e) {
			warnings.push(
				'immutableReadPaths pattern "' + pattern + '" expansion failed: ' + (e instanceof Error ? e.message : String(e)),
			);
		}
	}

	// Deduplicate and sort
	const uniqueFiles = [...new Set(allFiles)].sort();

	if (uniqueFiles.length === 0) {
		return { hash: "sha256:no-files", files: [], warnings };
	}

	// Hash each file: relative path + file content hash
	const fileHashes: string[] = [];
	for (const relPath of uniqueFiles) {
		const absPath = path.join(cwd, relPath);
		try {
			const content = fs.readFileSync(absPath);
			const hash = crypto.createHash("sha256").update(relPath).update(":").update(content).digest("hex");
			fileHashes.push(relPath + ':' + hash);
		} catch {
			warnings.push('immutableReadPaths file "' + relPath + '" read failed');
		}
	}

	// Sort and compute aggregate hash
	fileHashes.sort();
	const aggregate = crypto
		.createHash("sha256")
		.update(fileHashes.join("\n"))
		.digest("hex");

	return { hash: "sha256:" + aggregate, files: uniqueFiles, warnings };
}

// ---------------------------------------------------------------------------
// Environment fingerprint
// ---------------------------------------------------------------------------

export interface EnvironmentFingerprint {
	platform: string;
	arch: string;
	nodeVersion: string;
	npmVersion: string;
	timezone: string;
	packageJsonHash: string;
	packageLockHash: string;
	immutableReadSetHash: string;
}

/**
 * Collect environment fingerprint.
 */
export async function collectEnvironmentFingerprint(
	cwd: string,
	immutableReadSetHash: string,
): Promise<EnvironmentFingerprint> {
	let npmVersion = "unknown";
	try {
		npmVersion = execFileSync("npm", ["--version"], {
			cwd,
			encoding: "utf8",
			timeout: 5_000,
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {}

	const packageJsonPath = path.join(cwd, "package.json");
	let packageJsonHash = "sha256:none";
	try {
		if (fs.existsSync(packageJsonPath)) {
			const content = fs.readFileSync(packageJsonPath);
			packageJsonHash = "sha256:" + crypto.createHash("sha256").update(content).digest("hex");
		}
	} catch {}

	const packageLockPath = path.join(cwd, "package-lock.json");
	let packageLockHash = "sha256:none";
	try {
		if (fs.existsSync(packageLockPath)) {
			const content = fs.readFileSync(packageLockPath);
			packageLockHash = "sha256:" + crypto.createHash("sha256").update(content).digest("hex");
		}
	} catch {}

	return {
		platform: process.platform,
		arch: process.arch,
		nodeVersion: process.version,
		npmVersion,
		timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		packageJsonHash,
		packageLockHash,
		immutableReadSetHash,
	};
}

// ---------------------------------------------------------------------------
// Baseline noise summary
// ---------------------------------------------------------------------------

export interface BaselineNoiseSummary {
	samples: number[];
	aggregate: number;
	min: number;
	max: number;
	mean: number;
	stddev: number;
	relativeRange: number;
}

/**
 * Compute baseline noise summary from samples.
 */
export function computeBaselineNoise(
	samples: number[],
	aggregateMethod: "median" | "mean" | "min" | "max",
): BaselineNoiseSummary {
	if (samples.length === 0) {
		throw new Error("baseline samples が空です");
	}

	const sorted = [...samples].sort((a, b) => a - b);

	let aggregate: number;
	switch (aggregateMethod) {
		case "median": {
			const mid = Math.floor(sorted.length / 2);
			aggregate =
				sorted.length % 2 === 0
					? (sorted[mid - 1] + sorted[mid]) / 2
					: sorted[mid];
			break;
		}
		case "mean":
			aggregate = samples.reduce((s, v) => s + v, 0) / samples.length;
			break;
		case "min":
			aggregate = sorted[0];
			break;
		case "max":
			aggregate = sorted[sorted.length - 1];
			break;
	}

	const min = sorted[0];
	const max = sorted[sorted.length - 1];
	const mean = samples.reduce((s, v) => s + v, 0) / samples.length;

	const variance =
		samples.reduce((s, v) => s + (v - mean) ** 2, 0) / samples.length;
	const stddev = Math.sqrt(variance);

	const absAggregate = Math.abs(aggregate);
	const relativeRange = absAggregate === 0 ? (max === min ? 0 : Infinity) : (max - min) / absAggregate;

	return {
		samples,
		aggregate,
		min,
		max,
		mean,
		stddev,
		relativeRange,
	};
}
