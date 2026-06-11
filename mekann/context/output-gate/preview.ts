export type OutputContentType = "json" | "diff" | "search-results" | "test-output" | "log" | "text" | "unknown";
export type BashOutputPolicyName = "listing" | "search" | "git-status" | "git-diff" | "git-log" | "git-mutation" | "test" | "lint" | "docker";

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

function byteLength(text: string): number { return Buffer.byteLength(text, "utf8"); }

function normalizeCommand(command: string): string {
	return command.trim().replace(/\s+/g, " ");
}

export function classifyBashOutputPolicy(command: string | undefined): BashOutputPolicyName | undefined {
	if (!command) return undefined;
	const c = normalizeCommand(command);
	if (/^(ls|tree|find)\b/.test(c)) return "listing";
	if (/(^|[;&|()\s])(rg|grep)\b/.test(c)) return "search";
	if (/^git\s+status\b/.test(c)) return "git-status";
	if (/^git\s+(?:diff|show)\b/.test(c)) return "git-diff";
	if (/^git\s+log\b/.test(c)) return "git-log";
	if (/^git\s+(?:add|commit|push|pull|merge|checkout|switch|restore|reset|stash|tag|branch)\b/.test(c)) return "git-mutation";
	if (/(^|[;&|()\s])(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|check|ci)\b|(^|[;&|()\s])(?:pytest|cargo\s+test|go\s+test)\b/.test(c)) return "test";
	if (/(^|[;&|()\s])(?:ruff\s+check|eslint|tsc|mypy|clippy)\b/.test(c)) return "lint";
	if (/^docker\s+(?:ps|compose\s+ps)\b/.test(c)) return "docker";
	return undefined;
}

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

function lineFocusedPreview(text: string, matcher: RegExp, maxLines = 80): { preview: string; hints: string[] } {
	const lines = text.split(/\r?\n/);
	const hits: number[] = [];
	for (let i = 0; i < lines.length; i++) if (matcher.test(lines[i])) hits.push(i);
	if (!hits.length) return { preview: truncateLines(lines, maxLines).join("\n"), hints: [] };
	const kept = new Set<number>();
	for (const hit of hits.slice(0, 12)) {
		for (let i = Math.max(0, hit - 2); i <= Math.min(lines.length - 1, hit + 3); i++) kept.add(i);
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

function commandAwarePreview(text: string, command: string): { preview: string; hints: string[] } | undefined {
	const policy = classifyBashOutputPolicy(command);
	if (!policy) return undefined;
	const lines = text.split(/\r?\n/).filter((line, index, arr) => line !== "" || index < arr.length - 1);
	const header = [`bash output policy: ${policy}`, `command: ${normalizeCommand(command).slice(0, 300)}`, `lines: ${lines.length}`, `bytes: ${byteLength(text)}`];
	if (policy === "search") {
		const built = searchResultsPreview(text);
		return { preview: [...header, "", built.preview].join("\n"), hints: built.hints };
	}
	if (policy === "git-diff") {
		const built = diffPreview(text);
		return { preview: [...header, "", built.preview].join("\n"), hints: built.hints };
	}
	if (policy === "test") {
		const built = lineFocusedPreview(text, ERROR_RE, 80);
		return { preview: [...header, "", built.preview].join("\n"), hints: built.hints };
	}
	if (policy === "lint") {
		const built = lineFocusedPreview(text, ERROR_RE, 80);
		return { preview: [...header, "", built.preview || truncateLines(lines, 80).join("\n")].join("\n"), hints: built.hints };
	}
	const limits: Record<BashOutputPolicyName, number> = {
		listing: 80,
		search: 80,
		"git-status": 120,
		"git-diff": 80,
		"git-log": 60,
		"git-mutation": 40,
		test: 80,
		lint: 80,
		docker: 80,
	};
	const kept = truncateLines(lines, limits[policy]);
	return { preview: [...header, "", ...kept].join("\n"), hints: [] };
}

export function buildStructuredPreview(text: string, opts: { toolName?: string; maxBytes: number; command?: string }): OutputPreview {
	const contentType = detectOutputContentType(text, opts.toolName);
	let built: { preview: string; hints: string[] } | undefined;
	if (opts.toolName === "bash") built = commandAwarePreview(text, opts.command ?? "");
	if (!built && contentType === "json") built = jsonPreview(text);
	else if (!built && contentType === "diff") built = diffPreview(text);
	else if (!built && contentType === "search-results") built = searchResultsPreview(text);
	else if (!built && contentType === "test-output") built = lineFocusedPreview(text, ERROR_RE, 100);
	else if (!built && contentType === "log") built = lineFocusedPreview(text, ERROR_RE, 100);
	if (!built) built = { preview: truncateLines(text.split(/\r?\n/), 80).join("\n"), hints: [] };
	let preview = built.preview;
	if (byteLength(preview) > opts.maxBytes) preview = Buffer.from(preview, "utf8").subarray(0, opts.maxBytes).toString("utf8").replace(/�$/u, "") + "\n[structured preview truncated]";
	return { contentType, preview, retrievalHints: built.hints, omittedBytes: Math.max(0, byteLength(text) - byteLength(preview)) };
}
