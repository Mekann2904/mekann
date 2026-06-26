import { execFile } from "node:child_process";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { MEKANN_OUTPUT_GATE_DEFAULTS } from "../../config.js";
import { featureConfig } from "../../settings/featureConfig.js";
import { readManifest, resolveArtifactPath, safeUtf8Slice, type OutputGateManifestEntry } from "./store.js";

export interface SearchToolOutputsInput {
	cwd: string;
	query: string;
	artifact?: string;
	maxResults?: number;
	contextLines?: number;
	maxSearchResultBytes?: number;
	preferRg?: boolean;
	literal?: boolean;
	caseSensitive?: boolean;
}

function positiveInt(value: unknown, fallback: number): number {
	const n = Number(value);
	return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function nonNegativeInt(value: unknown, fallback: number): number {
	const n = Number(value);
	return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

interface SearchFile { entry: OutputGateManifestEntry; abs: string }

function capText(text: string, maxBytes: number): string {
	if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
	// Byte-safe head cut (robust for CJK/emoji, no stray U+FFFD) then append the
	// truncation marker. The marker is intentionally outside the byte budget.
	return safeUtf8Slice(text, maxBytes, false) + "\n[output-gate search results truncated]";
}

function header(entry: OutputGateManifestEntry, line: number): string {
	const type = entry.contentType ? ` ${entry.contentType}` : "";
	return `### ${entry.id} ${entry.toolName}${type} ${line}`;
}

function artifactContext(files: SearchFile[]): string {
	return files
		.filter((file) => file.entry.structuredPreview || file.entry.retrievalHints?.length)
		.slice(0, 3)
		.map((file) => [
			`### ${file.entry.id} artifact context`,
			...(file.entry.contentType ? [`contentType: ${file.entry.contentType}`] : []),
			...(file.entry.structuredPreview ? ["structured preview:", file.entry.structuredPreview] : []),
			...(file.entry.retrievalHints?.length ? ["retrieval hints:", ...file.entry.retrievalHints.slice(0, 8).map((h) => `- ${h}`)] : []),
		].join("\n"))
		.join("\n\n");
}

async function selectFiles(cwd: string, artifact?: string): Promise<SearchFile[] | undefined> {
	const manifest = await readManifest(cwd);
	if (manifest.length === 0) return undefined;
	const filtered = artifact ? manifest.filter((e) => e.id === artifact) : manifest;
	const files: SearchFile[] = [];
	for (const entry of filtered) {
		const abs = resolveArtifactPath(cwd, entry);
		if (abs) files.push({ entry, abs });
	}
	return files;
}

interface RgGroup {
	entry?: OutputGateManifestEntry;
	matchLine?: number;
	lines: string[];
	matchCount: number;
}

function flushRgGroup(group: RgGroup, chunks: string[], remainingResults: number): number {
	if (!group.entry || group.matchLine === undefined || group.matchCount === 0 || remainingResults <= 0) return 0;
	chunks.push(header(group.entry, group.matchLine) + "\n" + group.lines.join("\n"));
	return Math.min(group.matchCount, remainingResults);
}

function parseRgOutput(stdout: string, files: SearchFile[], maxResults: number): string {
	const byPath = new Map(files.map((f) => [path.resolve(f.abs), f.entry]));
	const chunks: string[] = [];
	let group: RgGroup = { lines: [], matchCount: 0 };
	let count = 0;
	const separatorRe = /^--$/;

	for (const rawLine of stdout.split(/\r?\n/)) {
		if (!rawLine) continue;

		// rg emits "--" between non-contiguous match groups. Keep before/after
		// context in the same group as its match instead of flushing context-only
		// chunks ahead of the actual hit.
		if (separatorRe.test(rawLine)) {
			count += flushRgGroup(group, chunks, maxResults - count);
			if (count >= maxResults) break;
			group = { lines: [], matchCount: 0 };
			continue;
		}

		const match = rawLine.match(/^(.+?)(?:[:-])(\d+)([:-])(.*)$/);
		if (!match) continue;
		const entry = byPath.get(path.resolve(match[1]));
		if (!entry) continue;
		const isMatch = match[3] === ":";
		const lineStr = `${match[2]}: ${match[4]}`;

		if (!group.entry) group.entry = entry;
		// A new file without an rg separator is still a new retrieval group.
		if (group.entry !== entry) {
			count += flushRgGroup(group, chunks, maxResults - count);
			if (count >= maxResults) break;
			group = { entry, lines: [], matchCount: 0 };
		}

		if (isMatch) {
			group.matchLine ??= Number(match[2]);
			group.matchCount += 1;
		}
		group.lines.push(lineStr);
	}

	if (count < maxResults) flushRgGroup(group, chunks, maxResults - count);
	return chunks.join("\n\n");
}

async function searchWithRg(query: string, files: SearchFile[], contextLines: number, maxResults: number, literal = true, caseSensitive = false): Promise<string | undefined> {
	return new Promise((resolve) => {
		const args = [
			"-n",
			"-H",
			"-C", String(contextLines),
			literal ? "-F" : undefined,
			caseSensitive ? undefined : "-i",
			"--",
			query,
			...files.map((f) => f.abs),
		].filter(Boolean) as string[];
		execFile("rg", args, { shell: false, maxBuffer: 10 * 1024 * 1024 }, (error, stdout) => {
			if (!error && stdout) return resolve(parseRgOutput(stdout, files, maxResults));
			const code = (error as any)?.code;
			if (code === 1) return resolve("");
			return resolve(undefined);
		});
	});
}

export async function fallbackLineScan(input: SearchToolOutputsInput): Promise<string> {
	const files = await selectFiles(input.cwd, input.artifact);
	if (files === undefined) return "No stored tool outputs.";
	if (files.length === 0) return "No matches.";
	const caseSensitive = input.caseSensitive === true;
	let matchesLine: (line: string) => boolean;
	if (input.literal === false) {
		try {
			const re = new RegExp(input.query, caseSensitive ? "" : "i");
			matchesLine = (line: string) => re.test(line);
		} catch {
			matchesLine = () => false;
		}
	} else {
		const queryForMatch = caseSensitive ? input.query : input.query.toLocaleLowerCase();
		matchesLine = (line: string) => (caseSensitive ? line : line.toLocaleLowerCase()).includes(queryForMatch);
	}
	const contextLines = nonNegativeInt(input.contextLines, Number(featureConfig("output-gate").defaultContextLines) || MEKANN_OUTPUT_GATE_DEFAULTS.defaultContextLines);
	const maxResults = positiveInt(input.maxResults, Number(featureConfig("output-gate").defaultMaxResults) || MEKANN_OUTPUT_GATE_DEFAULTS.defaultMaxResults);
	const chunks: string[] = [];
	let count = 0;
	for (const file of files) {
		const raw = await fsp.readFile(file.abs, "utf8");
		const lines = raw.split(/\r?\n/);
		for (let i = 0; i < lines.length; i++) {
			if (!matchesLine(lines[i])) continue;
			if (count >= maxResults) return chunks.join("\n\n") || "No matches.";
			count += 1;
			const start = Math.max(0, i - contextLines);
			const end = Math.min(lines.length - 1, i + contextLines);
			const part = [header(file.entry, i + 1)];
			for (let n = start; n <= end; n++) part.push(`${n + 1}: ${lines[n]}`);
			chunks.push(part.join("\n"));
		}
	}
	return chunks.join("\n\n") || "No matches.";
}

export async function searchToolOutputs(input: SearchToolOutputsInput): Promise<string> {
	if (!input.query.trim()) return "Query is required.";
	const files = await selectFiles(input.cwd, input.artifact);
	if (files === undefined) return "No stored tool outputs.";
	if (files.length === 0) return "No matches.";
	const maxResults = positiveInt(input.maxResults, Number(featureConfig("output-gate").defaultMaxResults) || MEKANN_OUTPUT_GATE_DEFAULTS.defaultMaxResults);
	const contextLines = nonNegativeInt(input.contextLines, Number(featureConfig("output-gate").defaultContextLines) || MEKANN_OUTPUT_GATE_DEFAULTS.defaultContextLines);
	const preferRg = input.preferRg !== false; // default true
	const literal = input.literal !== false; // default true
	const caseSensitive = input.caseSensitive === true;
	let result: string | undefined;
	if (preferRg) result = await searchWithRg(input.query, files, contextLines, maxResults, literal, caseSensitive);
	if (result === undefined || (result === "" && !literal)) result = await fallbackLineScan({ ...input, caseSensitive, literal });
	if (!result) result = "No matches.";
	if (result === "No matches." && input.artifact) {
		const context = artifactContext(files);
		if (context) result = `No matches.\n\n${context}`;
	}
	return capText(result, input.maxSearchResultBytes ?? (Number(featureConfig("output-gate").maxSearchResultBytes) || MEKANN_OUTPUT_GATE_DEFAULTS.maxSearchResultBytes));
}
