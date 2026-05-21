import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as crypto from "node:crypto";
import * as path from "node:path";
import { MEKANN_OUTPUT_GATE_DEFAULTS } from "../../config.js";
import { redactSecrets } from "./redact.js";

export interface OutputGateManifestEntry {
	id: string;
	toolName: string;
	createdAt: number;
	cwd: string;
	bytes: number;
	lines: number;
	sha256: string;
	path: string;
	redacted: boolean;
	source?: unknown;
}

export interface SaveArtifactInput {
	cwd: string;
	toolName: string;
	text: string;
	source?: unknown;
	redacted?: boolean;
	idGenerator?: (createdAt: number) => string;
	now?: () => number;
}

export interface GateTextOptions {
	cwd: string;
	toolName: string;
	text: string;
	source?: unknown;
	maxInlineBytes?: number;
	previewBytes?: number;
}

export interface GatedTextResult {
	text: string;
	gated: boolean;
	artifactId?: string;
	originalBytes: number;
	originalLines: number;
	sha256?: string;
	redacted?: boolean;
}

let artifactCounter = 0;

export function outputGateDir(cwd: string): string { return path.join(cwd, ".pi", "output-gate"); }
export function artifactsDir(cwd: string): string { return path.join(outputGateDir(cwd), "artifacts"); }
export function manifestPath(cwd: string): string { return path.join(outputGateDir(cwd), "manifest.jsonl"); }

export function createArtifactId(createdAt: number, counter: number): string {
	return `og_${createdAt.toString(36)}_${counter.toString(36)}`;
}

export function nextArtifactId(createdAt: number): string {
	artifactCounter += 1;
	return createArtifactId(createdAt, artifactCounter);
}

export function countLines(text: string): number {
	if (text.length === 0) return 0;
	return text.split(/\r?\n/).length;
}

export function sha256(text: string): string {
	return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

export async function ensureOutputGateDirs(cwd: string): Promise<void> {
	await fsp.mkdir(artifactsDir(cwd), { recursive: true });
}

export function safeUtf8Slice(text: string, maxBytes: number, fromEnd = false): string {
	const buf = Buffer.from(text, "utf8");
	if (buf.byteLength <= maxBytes) return text;
	const slice = fromEnd ? buf.subarray(Math.max(0, buf.byteLength - maxBytes)) : buf.subarray(0, maxBytes);
	let out = slice.toString("utf8");
	while (out.includes("�") && Buffer.byteLength(out, "utf8") > 0) {
		out = fromEnd ? slice.subarray(1).toString("utf8") : Buffer.from(out, "utf8").subarray(0, Buffer.byteLength(out, "utf8") - 1).toString("utf8");
		if (!fromEnd) break;
	}
	return out.replace(/^�|�$/gu, "");
}

export function buildPreview(text: string, previewBytes = MEKANN_OUTPUT_GATE_DEFAULTS.previewBytes): string {
	const total = Buffer.byteLength(text, "utf8");
	if (total <= previewBytes) return text;
	const half = Math.max(1, Math.floor((previewBytes - 80) / 2));
	const head = safeUtf8Slice(text, half, false);
	const tail = safeUtf8Slice(text, half, true);
	return `${head}\n\n[...output-gate preview omitted ${total - Buffer.byteLength(head, "utf8") - Buffer.byteLength(tail, "utf8")} bytes...]\n\n${tail}`;
}

export function buildStoredOutputStub(entry: OutputGateManifestEntry, preview: string): string {
	return [
		`[output-gate] Large ${entry.toolName} output stored.`,
		"",
		`artifact: ${entry.id}`,
		`tool: ${entry.toolName}`,
		`bytes: ${entry.bytes}`,
		`lines: ${entry.lines}`,
		`sha256: ${entry.sha256.slice(0, 8)}`,
		"",
		"preview:",
		preview,
		"",
		`Use search_tool_outputs({ "query": "...", "artifact": "${entry.id}" }) to retrieve relevant snippets.`,
	].join("\n");
}

export function shouldGateOutput(text: string, opts: { toolName?: string; maxInlineBytes?: number } = {}): boolean {
	if (!text) return false;
	if (opts.toolName === "search_tool_outputs") return false;
	if (text.startsWith("[output-gate]")) return false;
	return Buffer.byteLength(text, "utf8") > (opts.maxInlineBytes ?? MEKANN_OUTPUT_GATE_DEFAULTS.maxInlineBytes);
}

export async function saveArtifact(input: SaveArtifactInput): Promise<{ entry: OutputGateManifestEntry; text: string }> {
	await ensureOutputGateDirs(input.cwd);
	const createdAt = input.now?.() ?? Date.now();
	const id = input.idGenerator?.(createdAt) ?? nextArtifactId(createdAt);
	if (!/^og_[a-z0-9]+_[a-z0-9]+$/.test(id)) throw new Error(`Invalid output-gate artifact id: ${id}`);
	const redacted = input.redacted ? { text: input.text, redacted: true } : redactSecrets(input.text);
	const artifactAbs = path.join(artifactsDir(input.cwd), `${id}.txt`);
	const relPath = path.relative(input.cwd, artifactAbs);
	if (relPath.startsWith("..") || path.isAbsolute(relPath)) throw new Error("Artifact path escaped cwd");
	await fsp.writeFile(artifactAbs, redacted.text, "utf8");
	const entry: OutputGateManifestEntry = {
		id,
		toolName: input.toolName,
		createdAt,
		cwd: input.cwd,
		bytes: Buffer.byteLength(redacted.text, "utf8"),
		lines: countLines(redacted.text),
		sha256: sha256(redacted.text),
		path: relPath,
		redacted: true,
		...(input.source === undefined ? {} : { source: input.source }),
	};
	await fsp.appendFile(manifestPath(input.cwd), `${JSON.stringify(entry)}\n`, "utf8");
	return { entry, text: redacted.text };
}

export async function readManifest(cwd: string): Promise<OutputGateManifestEntry[]> {
	const file = manifestPath(cwd);
	let raw = "";
	try { raw = await fsp.readFile(file, "utf8"); } catch (error: any) { if (error?.code === "ENOENT") return []; throw error; }
	const out: OutputGateManifestEntry[] = [];
	for (const line of raw.split(/\r?\n/)) {
		if (!line.trim()) continue;
		try {
			const entry = JSON.parse(line) as OutputGateManifestEntry;
			if (entry?.id && entry?.path && /^og_[a-z0-9]+_[a-z0-9]+$/.test(entry.id)) out.push(entry);
		} catch { /* skip corrupt jsonl */ }
	}
	return out;
}

export function resolveArtifactPath(cwd: string, entry: OutputGateManifestEntry): string | undefined {
	const abs = path.resolve(cwd, entry.path);
	const root = path.resolve(artifactsDir(cwd));
	if (abs !== root && !abs.startsWith(root + path.sep)) return undefined;
	if (!fs.existsSync(abs)) return undefined;
	return abs;
}

export async function gateTextForLlm(options: GateTextOptions): Promise<GatedTextResult> {
	const originalBytes = Buffer.byteLength(options.text, "utf8");
	const originalLines = countLines(options.text);
	if (!shouldGateOutput(options.text, { toolName: options.toolName, maxInlineBytes: options.maxInlineBytes })) return { text: options.text, gated: false, originalBytes, originalLines };
	try {
		const saved = await saveArtifact({ cwd: options.cwd, toolName: options.toolName, text: options.text, source: options.source });
		const preview = buildPreview(saved.text, options.previewBytes ?? MEKANN_OUTPUT_GATE_DEFAULTS.previewBytes);
		return { text: buildStoredOutputStub(saved.entry, preview), gated: true, artifactId: saved.entry.id, originalBytes, originalLines, sha256: saved.entry.sha256, redacted: true };
	} catch (error: any) {
		const preview = buildPreview(redactSecrets(options.text).text, options.previewBytes ?? MEKANN_OUTPUT_GATE_DEFAULTS.previewBytes);
		return { text: `[output-gate] Failed to store large ${options.toolName} output: ${error?.message ?? String(error)}\n\n${preview}`, gated: false, originalBytes, originalLines };
	}
}
