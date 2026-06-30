import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as crypto from "node:crypto";
import * as path from "node:path";
import * as readline from "node:readline";
import { MEKANN_OUTPUT_GATE_DEFAULTS } from "../../config.js";
import { featureConfig } from "../../settings/featureConfig.js";

/** Spread optional session metadata fields into an object. */
export function spreadSessionMeta(input: { sessionId?: string; turnId?: string; toolCallId?: string; branchId?: string }): Record<string, string> {
	const out: Record<string, string> = {};
	if (input.sessionId) out.sessionId = input.sessionId;
	if (input.turnId) out.turnId = input.turnId;
	if (input.toolCallId) out.toolCallId = input.toolCallId;
	if (input.branchId) out.branchId = input.branchId;
	return out;
}
import { redactSecrets } from "../tool-output/redact.js";
import { isOutputGateBypassTool } from "./bypass.js";
import { buildStructuredPreview, type OutputContentType } from "./preview.js";
import { appendJsonlLine, atomicReplaceFile, withAppendLock } from "../../utils/atomic-append.js";

export interface OutputGateManifestEntry {
	schemaVersion?: "output-gate/v1";
	id: string;
	toolName: string;
	createdAt: number;
	cwd: string;
	bytes: number;
	lines: number;
	originalBytes?: number;
	originalLines?: number;
	sha256: string;
	path: string;
	redacted: boolean;
	redactionVersion?: number;
	sessionId?: string;
	turnId?: string;
	toolCallId?: string;
	branchId?: string;
	commandHash?: string;
	source?: unknown;
	contentType?: OutputContentType;
	structuredPreview?: string;
	retrievalHints?: string[];
	omittedBytes?: number;
}

export interface SaveArtifactInput {
	cwd: string;
	toolName: string;
	text: string;
	source?: unknown;
	redacted?: boolean;
	idGenerator?: (createdAt: number) => string;
	now?: () => number;
	sessionId?: string;
	turnId?: string;
	toolCallId?: string;
	branchId?: string;
	commandHash?: string;
}

export interface GateTextOptions {
	cwd: string;
	toolName: string;
	text: string;
	source?: unknown;
	maxInlineBytes?: number;
	previewBytes?: number;
	sessionId?: string;
	turnId?: string;
	toolCallId?: string;
	branchId?: string;
	commandHash?: string;
	/**
	 * When set (> 0), artifacts are auto-retained to this many newest entries
	 * right after a successful save. Keeps manifest.jsonl + artifacts/ bounded
	 * across long sessions without requiring a manual `/output-gate purge`.
	 */
	retentionMaxFiles?: number;
}

export interface RetainArtifactsResult {
	/** Entries remaining in the manifest after retention (newest first when compacted). */
	kept: OutputGateManifestEntry[];
	/** Number of old artifacts whose files were unlinked. */
	removed: number;
}

export interface GatedTextResult {
	text: string;
	gated: boolean;
	handled: boolean;
	artifactId?: string;
	originalBytes: number;
	originalLines: number;
	/** UTF-8 byte length of the inline `text` stub. Set when `gated` is true. */
	stubBytes?: number;
	sha256?: string;
	redacted?: boolean;
	storageError?: string;
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
	let count = 1;
	for (let i = 0; i < text.length; i++) {
		const ch = text.charCodeAt(i);
		if (ch === 0x0A /* LF */) count++;
		else if (ch === 0x0D /* CR */) { count++; if (i + 1 < text.length && text.charCodeAt(i + 1) === 0x0A) i++; }
	}
	return count;
}

export function sha256(text: string): string {
	return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

export function sanitizeManifestSource(source: unknown, maxStringBytes = 2000): unknown {
	if (source === undefined) return undefined;
	if (source === null || typeof source !== "object") return source;
	const seen = new WeakSet<object>();
	function sanitize(value: unknown): unknown {
		if (value === undefined || value === null) return value;
		if (typeof value === "bigint") return value.toString();
		if (typeof value === "string") return safeUtf8Slice(redactSecrets(value).text, maxStringBytes);
		if (typeof value !== "object") return value;
		if (seen.has(value as object)) return "[Circular]";
		seen.add(value as object);
		if (Array.isArray(value)) return value.map(sanitize);
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) {
			try { out[k] = sanitize(v); }
			catch { out[k] = "[Unserializable]"; }
		}
		return out;
	}
	try { return sanitize(source); }
	catch { return "[Unserializable source]"; }
}

export async function ensureOutputGateDirs(cwd: string): Promise<void> {
	await fsp.mkdir(artifactsDir(cwd), { recursive: true });
}

export function safeUtf8Slice(text: string, maxBytes: number, fromEnd = false): string {
	const buf = Buffer.from(text, "utf8");
	if (buf.byteLength <= maxBytes) return text;
	if (maxBytes <= 0) return "";

	if (fromEnd) {
		let start = Math.max(0, buf.byteLength - maxBytes);
		while (start < buf.byteLength) {
			const out = buf.subarray(start).toString("utf8");
			if (!out.startsWith("�")) return out;
			start += 1;
		}
		return "";
	}

	let end = Math.min(maxBytes, buf.byteLength);
	while (end > 0) {
		const out = buf.subarray(0, end).toString("utf8");
		if (!out.endsWith("�")) return out;
		end -= 1;
	}
	return "";
}

export function buildPreview(text: string, previewBytes?: number): string {
	previewBytes = previewBytes ?? (Number(featureConfig("output-gate").previewBytes) || MEKANN_OUTPUT_GATE_DEFAULTS.previewBytes);
	const total = Buffer.byteLength(text, "utf8");
	if (total <= previewBytes) return text;
	const half = Math.max(1, Math.floor((previewBytes - 80) / 2));
	const head = safeUtf8Slice(text, half, false);
	const tail = safeUtf8Slice(text, half, true);
	return `${head}\n\n[...output-gate preview omitted ${total - Buffer.byteLength(head, "utf8") - Buffer.byteLength(tail, "utf8")} bytes...]\n\n${tail}`;
}

export function buildStoredOutputStub(entry: OutputGateManifestEntry, preview: string): string {
	const hints = (entry.retrievalHints ?? []).slice(0, 5);
	return [
		`[output-gate] Large ${entry.toolName} output stored.`,
		"",
		`artifact: ${entry.id}`,
		`tool: ${entry.toolName}`,
		...(entry.contentType ? [`contentType: ${entry.contentType}`] : []),
		`bytes: ${entry.bytes}`,
		`lines: ${entry.lines}`,
		`sha256: ${entry.sha256.slice(0, 8)}`,
		"",
		entry.structuredPreview ? "structured preview:" : "preview:",
		entry.structuredPreview ?? preview,
		...(hints.length ? ["", "retrieval hints:", ...hints.map((h) => `- ${h}`)] : []),
		"",
		`Use search_tool_outputs({ "query": "...", "artifact": "${entry.id}" }) to retrieve relevant snippets.`,
	].join("\n");
}

export function shouldGateOutput(text: string, opts: { toolName?: string; maxInlineBytes?: number } = {}): boolean {
	if (!text) return false;
	// IC-273: tools that aggregate/retrieve already-stored context opt out via
	// the bypass registry (declared at their own registration site) instead of a
	// hard-coded name list here. See ./bypass.js.
	if (isOutputGateBypassTool(opts.toolName)) return false;
	// IC-274: self-generated stubs are detected via the tool-result metadata
	// (details.outputGate.stored, see OutputGateController) rather than a fragile
	// "[output-gate]" text prefix, so legitimately large output that happens to
	// start with that prefix is still gated.
	return Buffer.byteLength(text, "utf8") > (opts.maxInlineBytes ?? (Number(featureConfig("output-gate").maxInlineBytes) || MEKANN_OUTPUT_GATE_DEFAULTS.maxInlineBytes));
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
	const originalBytes = Buffer.byteLength(input.text, "utf8");
	const originalLines = countLines(input.text);
	const structured = buildStructuredPreview(redacted.text, { toolName: input.toolName, maxBytes: 3000 });
	const entry: OutputGateManifestEntry = {
		schemaVersion: "output-gate/v1",
		id,
		toolName: input.toolName,
		createdAt,
		cwd: input.cwd,
		bytes: Buffer.byteLength(redacted.text, "utf8"),
		lines: countLines(redacted.text),
		...(originalBytes !== Buffer.byteLength(redacted.text, "utf8") ? { originalBytes } : {}),
		...(originalLines !== countLines(redacted.text) ? { originalLines } : {}),
		sha256: sha256(redacted.text),
		path: relPath,
		redacted: true,
		redactionVersion: 1,
		contentType: structured.contentType,
		structuredPreview: structured.preview,
		...(structured.retrievalHints.length ? { retrievalHints: structured.retrievalHints } : {}),
		omittedBytes: structured.omittedBytes,
		...spreadSessionMeta(input),
		...(input.commandHash ? { commandHash: input.commandHash } : {}),
		...(input.source === undefined ? {} : { source: sanitizeManifestSource(input.source) }),
	};
	await appendJsonlLine(manifestPath(input.cwd), `${JSON.stringify(entry)}\n`);
	return { entry, text: redacted.text };
}

export async function readManifest(cwd: string): Promise<OutputGateManifestEntry[]> {
	const file = manifestPath(cwd);
	try { await fsp.access(file); } catch (error: any) { if (error?.code === "ENOENT") return []; throw error; }
	const out: OutputGateManifestEntry[] = [];
	const lines = readline.createInterface({
		input: fs.createReadStream(file, { encoding: "utf8" }),
		crlfDelay: Infinity,
	});
	for await (const line of lines) {
		if (!line.trim()) continue;
		try {
			const entry = JSON.parse(line) as OutputGateManifestEntry;
			if (entry?.id && entry?.path && /^og_[a-z0-9]+_[a-z0-9]+$/.test(entry.id)) out.push(entry);
		} catch { /* skip corrupt jsonl */ }
	}
	return out;
}

/**
 * Compact manifest.jsonl to the `keepCount` newest entries and unlink the
 * older artifact files. No-op when the manifest is already within the limit.
 *
 * Shared by the manual `/output-gate purge` command and the automatic
 * retention that fires after `saveArtifact`, so both paths stay bounded and
 * never diverge (no orphan artifacts / no dangling manifest rows).
 */
export async function retainArtifacts(cwd: string, keepCount: number): Promise<RetainArtifactsResult> {
	const normalizedKeepCount = Math.max(0, Math.floor(keepCount));
	const manifest = manifestPath(cwd);
	// Read, drop, and rewrite the manifest under the same append lock used by
	// saveArtifact, so a concurrent save cannot append a line into a manifest
	// we are mid-rewrite (which would silently lose that artifact's entry).
	return withAppendLock(manifest, async () => {
		const entries = await readManifest(cwd);
		if (entries.length <= normalizedKeepCount) return { kept: entries, removed: 0 };
		const sorted = [...entries].sort((a, b) => b.createdAt - a.createdAt);
		const toRemove = sorted.slice(normalizedKeepCount);
		const kept = sorted.slice(0, normalizedKeepCount);
		// Replace the manifest FIRST (atomic tmp+rename), then unlink the dropped
		// artifact files. This ordering is crash-safe: a kill mid-flight leaves
		// either the old manifest (all entries) or the new compacted one — never a
		// torn manifest, and never a manifest row pointing at an already-deleted
		// file (dangling reference). At worst a crash before the unlinks leaves a
		// few orphaned artifact files on disk, which are harmless and unreferenced.
		await atomicReplaceFile(
			manifest,
			kept.length ? `${kept.map((e) => JSON.stringify(e)).join("\n")}\n` : "",
		);
		let removed = 0;
		for (const entry of toRemove) {
			const abs = resolveArtifactPath(cwd, entry);
			if (abs) {
				try {
					await fsp.unlink(abs);
					removed++;
				} catch { /* ignore missing/unlinkable file */ }
			}
		}
		return { kept, removed };
	});
}

export function resolveArtifactPath(cwd: string, entry: OutputGateManifestEntry): string | undefined {
	const abs = path.resolve(cwd, entry.path);
	const root = path.resolve(artifactsDir(cwd));
	// Lexical containment: rejects obvious "../" traversal and any path that
	// does not live under the artifacts directory, without touching the fs.
	if (abs !== root && !abs.startsWith(root + path.sep)) return undefined;
	if (!fs.existsSync(abs)) return undefined;
	// IC-275: a corrupted/tampered manifest could store a `path` that is
	// lexically under artifacts/ but resolves through a symlinked file or
	// directory to somewhere outside the workspace (unlink/read would then touch
	// a file we do not own). Resolve both the target and the artifacts root to
	// their real paths and re-assert containment before handing the path back.
	// The manifest `path` field is never trusted on its own.
	let realAbs: string;
	let realRoot: string;
	try {
		realAbs = fs.realpathSync(abs);
		realRoot = fs.realpathSync(root);
	} catch {
		return undefined; // broken symlink or inaccessible — refuse to touch.
	}
	if (realAbs !== realRoot && !realAbs.startsWith(realRoot + path.sep)) return undefined;
	return abs;
}

export async function gateTextForLlm(options: GateTextOptions): Promise<GatedTextResult> {
	const originalBytes = Buffer.byteLength(options.text, "utf8");
	const originalLines = countLines(options.text);
	if (!shouldGateOutput(options.text, { toolName: options.toolName, maxInlineBytes: options.maxInlineBytes })) return { text: options.text, gated: false, handled: false, originalBytes, originalLines };
	try {
		const saved = await saveArtifact({ cwd: options.cwd, toolName: options.toolName, text: options.text, source: options.source, sessionId: options.sessionId, turnId: options.turnId, toolCallId: options.toolCallId, branchId: options.branchId, commandHash: options.commandHash });
		// Best-effort retention: keep manifest.jsonl + artifacts/ bounded across
		// long sessions. The just-saved entry is the newest, so it is always kept.
		if (options.retentionMaxFiles && options.retentionMaxFiles > 0) {
			try { await retainArtifacts(options.cwd, options.retentionMaxFiles); } catch { /* retention must not break gating */ }
		}
		const preview = buildPreview(saved.text, options.previewBytes ?? (Number(featureConfig("output-gate").previewBytes) || MEKANN_OUTPUT_GATE_DEFAULTS.previewBytes));
		const stub = buildStoredOutputStub(saved.entry, preview);
		return { text: stub, gated: true, handled: true, artifactId: saved.entry.id, originalBytes, originalLines, stubBytes: Buffer.byteLength(stub, "utf8"), sha256: saved.entry.sha256, redacted: true };
	} catch (error: any) {
		const message = error?.message ?? String(error);
		const preview = buildPreview(redactSecrets(options.text).text, options.previewBytes ?? (Number(featureConfig("output-gate").previewBytes) || MEKANN_OUTPUT_GATE_DEFAULTS.previewBytes));
		return { text: `[output-gate] Failed to store large ${options.toolName} output; showing redacted preview only: ${message}\n\n${preview}`, gated: false, handled: true, originalBytes, originalLines, redacted: true, storageError: message };
	}
}
