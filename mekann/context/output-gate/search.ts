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

function parseRgOutput(stdout: string, files: SearchFile[], maxResults: number): string {
	const byPath = new Map(files.map((f) => [path.resolve(f.abs), f.entry]));
	const chunks: string[] = [];
	let current = "";
	let currentCounted = false;
	let count = 0;
	for (const rawLine of stdout.split(/\r?\n/)) {
		if (!rawLine) continue;
		const match = rawLine.match(/^(.+?)(?:[:-])(\d+)([:-])(.*)$/);
		if (!match) continue;
		const entry = byPath.get(path.resolve(match[1]));
		if (!entry) continue;
		const isMatch = match[3] === ":";
		if (isMatch && !currentCounted) {
			if (count >= maxResults) break;
			count += 1;
			currentCounted = true;
		}
		if (!current) current = header(entry, Number(match[2]));
		current += `\n${match[2]}: ${match[4]}`;
		if (isMatch) { chunks.push(current); current = ""; currentCounted = false; }
	}
	if (current && count < maxResults) chunks.push(current);
	return chunks.join("\n\n");
}

async function searchWithRg(query: string, files: SearchFile[], contextLines: number, maxResults: number): Promise<string | undefined> {
	return new Promise((resolve) => {
		execFile("rg", ["-n", "-C", String(contextLines), "--", query, ...files.map((f) => f.abs)], { shell: false, maxBuffer: 10 * 1024 * 1024 }, (error, stdout) => {
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
	const query = input.query.toLocaleLowerCase();
	const contextLines = nonNegativeInt(input.contextLines, MEKANN_OUTPUT_GATE_DEFAULTS.defaultContextLines);
	const maxResults = positiveInt(input.maxResults, MEKANN_OUTPUT_GATE_DEFAULTS.defaultMaxResults);
	const chunks: string[] = [];
	let count = 0;
	for (const file of files) {
		const raw = await fsp.readFile(file.abs, "utf8");
		const lines = raw.split(/\r?\n/);
		for (let i = 0; i < lines.length; i++) {
			if (!lines[i].toLocaleLowerCase().includes(query)) continue;
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
	let result: string | undefined;
	if (input.preferRg === true) result = await searchWithRg(input.query, files, contextLines, maxResults);
	if (result === undefined) result = await fallbackLineScan(input);
	if (!result) result = "No matches.";
	return capText(result, input.maxSearchResultBytes ?? MEKANN_OUTPUT_GATE_DEFAULTS.maxSearchResultBytes);
}
