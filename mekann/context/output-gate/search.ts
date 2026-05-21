import { execFile } from "node:child_process";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { MEKANN_OUTPUT_GATE_DEFAULTS } from "../../config.js";
import { readManifest, resolveArtifactPath, type OutputGateManifestEntry } from "./store.js";

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
	return Buffer.from(text, "utf8").subarray(0, maxBytes).toString("utf8").replace(/�$/u, "") + "\n[output-gate search results truncated]";
}

function header(entry: OutputGateManifestEntry, line: number): string {
	return `### ${entry.id} ${entry.toolName} ${line}`;
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

interface PendingChunk {
	entry: OutputGateManifestEntry;
	matchLine: number;
	lines: string[];
	counted: boolean;
}

function flushChunk(chunk: PendingChunk): string {
	return header(chunk.entry, chunk.matchLine) + "\n" + chunk.lines.join("\n");
}

function parseRgOutput(stdout: string, files: SearchFile[], maxResults: number): string {
	const byPath = new Map(files.map((f) => [path.resolve(f.abs), f.entry]));
	const chunks: string[] = [];
	let pending: PendingChunk | null = null;
	let count = 0;
	const separatorRe = /^--$/;

	for (const rawLine of stdout.split(/\r?\n/)) {
		if (!rawLine) continue;

		// rg emits "--" between non-contiguous groups
		if (separatorRe.test(rawLine)) {
			if (pending) { chunks.push(flushChunk(pending)); pending = null; }
			continue;
		}

		const match = rawLine.match(/^(.+?)(?:[:-])(\d+)([:-])(.*)$/);
		if (!match) continue;
		const entry = byPath.get(path.resolve(match[1]));
		if (!entry) continue;
		const isMatch = match[3] === ":";
		const lineStr = `${match[2]}: ${match[4]}`;

		if (isMatch) {
			// Flush previous pending chunk if it belongs to a different match
			if (pending) {
				chunks.push(flushChunk(pending));
				pending = null;
			}
			if (count >= maxResults) break;
			count += 1;
			pending = { entry, matchLine: Number(match[2]), lines: [lineStr], counted: true };
		} else {
			// Context line — append to pending or start pending if none
			if (!pending) {
				pending = { entry, matchLine: Number(match[2]), lines: [lineStr], counted: false };
			} else {
				pending.lines.push(lineStr);
			}
		}
	}

	// Flush final pending chunk
	if (pending) chunks.push(flushChunk(pending));
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
	const queryForMatch = caseSensitive ? input.query : input.query.toLocaleLowerCase();
	const contextLines = nonNegativeInt(input.contextLines, MEKANN_OUTPUT_GATE_DEFAULTS.defaultContextLines);
	const maxResults = positiveInt(input.maxResults, MEKANN_OUTPUT_GATE_DEFAULTS.defaultMaxResults);
	const chunks: string[] = [];
	let count = 0;
	for (const file of files) {
		const raw = await fsp.readFile(file.abs, "utf8");
		const lines = raw.split(/\r?\n/);
		for (let i = 0; i < lines.length; i++) {
			const lineForMatch = caseSensitive ? lines[i] : lines[i].toLocaleLowerCase();
			if (!lineForMatch.includes(queryForMatch)) continue;
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
	const maxResults = positiveInt(input.maxResults, MEKANN_OUTPUT_GATE_DEFAULTS.defaultMaxResults);
	const contextLines = nonNegativeInt(input.contextLines, MEKANN_OUTPUT_GATE_DEFAULTS.defaultContextLines);
	const preferRg = input.preferRg !== false; // default true
	const literal = input.literal !== false; // default true
	const caseSensitive = input.caseSensitive === true;
	let result: string | undefined;
	if (preferRg) result = await searchWithRg(input.query, files, contextLines, maxResults, literal, caseSensitive);
	if (result === undefined) result = await fallbackLineScan({ ...input, caseSensitive });
	if (!result) result = "No matches.";
	return capText(result, input.maxSearchResultBytes ?? MEKANN_OUTPUT_GATE_DEFAULTS.maxSearchResultBytes);
}
