import { MEKANN_OUTPUT_GATE_DEFAULTS } from "../../config.js";
import { featureConfig } from "../../settings/featureConfig.js";

export type OutputContentType = "json" | "diff" | "search-results" | "test-output" | "log" | "text" | "unknown";

export interface OutputPreview {
	contentType: OutputContentType;
	preview: string;
	retrievalHints: string[];
	omittedBytes: number;
}

const ERROR_RE = /\b(error|failed|failure|exception|traceback|assertion(?:error)?|fatal|panic)\b/i;
const TEST_RE = /\b(test|spec|suite)s?\b.*\b(fail|failed|failure|pass|passed)\b|\bFAIL\b|\bAssertionError\b/i;
const DIFF_RE = /^(diff --git|@@\s+-\d|\+\+\+\s|---\s)/m;
const RG_RE = /^(?:[^\n:]+):(\d+):/m;
const LOG_RE = /^\[?\d{4}[-/]\d{2}[-/]\d{2}|\b(INFO|WARN|WARNING|ERROR|DEBUG|TRACE|FATAL)\b/m;

function resolveDefaultContextLines(): number {
	const n = Number(featureConfig("output-gate").defaultContextLines);
	return Number.isFinite(n) && n >= 0 ? Math.floor(n) : MEKANN_OUTPUT_GATE_DEFAULTS.defaultContextLines;
}

function byteLength(text: string): number { return Buffer.byteLength(text, "utf8"); }

function truncateLines(lines: string[], maxLines: number): string[] {
	if (lines.length <= maxLines) return lines;
	const head = lines.slice(0, Math.ceil(maxLines / 2));
	const tail = lines.slice(-Math.floor(maxLines / 2));
	return [...head, `[...${lines.length - head.length - tail.length} lines omitted...]`, ...tail];
}

export function detectOutputContentType(text: string, toolName?: string): OutputContentType {
	const trimmed = text.trim();
	if (!trimmed) return "unknown";
	if (/^(read|bash|node|python)$/i.test(toolName ?? "") && DIFF_RE.test(text)) return "diff";
	if (toolName === "bash" && RG_RE.test(text)) return "search-results";
	if (TEST_RE.test(text)) return "test-output";
	if (DIFF_RE.test(text)) return "diff";
	if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
		try { JSON.parse(trimmed); return "json"; } catch { /* not json */ }
	}
	if (LOG_RE.test(text) || ERROR_RE.test(text)) return "log";
	return "text";
}

function jsonPreview(text: string): { preview: string; hints: string[] } | undefined {
	try {
		const value = JSON.parse(text.trim());
		if (Array.isArray(value)) {
			const first = value[0];
			const keys = first && typeof first === "object" && !Array.isArray(first) ? Object.keys(first).slice(0, 20) : [];
			const sample = JSON.stringify(value.slice(0, 3), null, 2);
			return { preview: [`JSON array`, `items: ${value.length}`, ...(keys.length ? [`keys: ${keys.join(", ")}`] : []), `sample:`, sample].join("\n"), hints: keys.slice(0, 5) };
		}
		if (value && typeof value === "object") {
			const keys = Object.keys(value as Record<string, unknown>).slice(0, 30);
			return { preview: [`JSON object`, `keys: ${keys.join(", ")}`, `sample:`, JSON.stringify(value, null, 2).slice(0, 2000)].join("\n"), hints: keys.slice(0, 5) };
		}
	} catch { return undefined; }
	return undefined;
}

function lineFocusedPreview(text: string, matcher: RegExp, maxLines = 80, contextLines = resolveDefaultContextLines()): { preview: string; hints: string[] } {
	const lines = text.split(/\r?\n/);
	const hits: number[] = [];
	for (let i = 0; i < lines.length; i++) if (matcher.test(lines[i])) hits.push(i);
	if (!hits.length) return { preview: truncateLines(lines, maxLines).join("\n"), hints: [] };
	const kept = new Set<number>();
	// Symmetric window around each hit (issue #166 / IC-196). Previously this was
	// an asymmetric `hit - 2 .. hit + 3` with no documented intent and a value
	// unrelated to the search_tool_outputs `contextLines` default. It now uses a
	// single `contextLines` knob shared with search_tool_outputs.
	for (const hit of hits.slice(0, 12)) {
		for (let i = Math.max(0, hit - contextLines); i <= Math.min(lines.length - 1, hit + contextLines); i++) kept.add(i);
	}
	const out = [...kept].sort((a, b) => a - b).map((i) => `${i + 1}: ${lines[i]}`);
	return { preview: out.join("\n"), hints: [...new Set(hits.slice(0, 8).map((i) => lines[i].trim().slice(0, 80)).filter(Boolean))] };
}

function diffPreview(text: string): { preview: string; hints: string[] } {
	const files = [...text.matchAll(/^(?:diff --git a\/([^\s]+)|\+\+\+ b\/([^\s]+))/gm)].map((m) => m[1] ?? m[2]).filter(Boolean);
	const hunks = [...text.matchAll(/^@@\s+(.+)$/gm)].map((m) => m[0]);
	return { preview: [`diff summary`, `files: ${[...new Set(files)].slice(0, 30).join(", ") || "unknown"}`, `hunks: ${hunks.length}`, ...hunks.slice(0, 20)].join("\n"), hints: [...new Set(files)].slice(0, 8) };
}

function searchResultsPreview(text: string): { preview: string; hints: string[] } {
	const lines = text.split(/\r?\n/).filter(Boolean);
	const files = new Map<string, number>();
	for (const line of lines) {
		const m = line.match(/^(.+?):\d+:/);
		if (m) files.set(m[1], (files.get(m[1]) ?? 0) + 1);
	}
	const top = [...files.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
	return { preview: [`search result summary`, `matches: ${lines.length}`, `files: ${files.size}`, ...top.map(([file, count]) => `- ${file}: ${count}`), ``, ...truncateLines(lines, 40)].join("\n"), hints: top.slice(0, 8).map(([file]) => file) };
}

export function buildStructuredPreview(text: string, opts: { toolName?: string; maxBytes: number }): OutputPreview {
	const contentType = detectOutputContentType(text, opts.toolName);
	const contextLines = resolveDefaultContextLines();
	let built: { preview: string; hints: string[] } | undefined;
	if (contentType === "json") built = jsonPreview(text);
	else if (contentType === "diff") built = diffPreview(text);
	else if (contentType === "search-results") built = searchResultsPreview(text);
	else if (contentType === "test-output") built = lineFocusedPreview(text, ERROR_RE, 100, contextLines);
	else if (contentType === "log") built = lineFocusedPreview(text, ERROR_RE, 100, contextLines);
	if (!built) built = { preview: truncateLines(text.split(/\r?\n/), 80).join("\n"), hints: [] };
	let preview = built.preview;
	if (byteLength(preview) > opts.maxBytes) preview = Buffer.from(preview, "utf8").subarray(0, opts.maxBytes).toString("utf8").replace(/�$/u, "") + "\n[structured preview truncated]";
	return { contentType, preview, retrievalHints: built.hints, omittedBytes: Math.max(0, byteLength(text) - byteLength(preview)) };
}
