import { splitSimpleCommand } from "./command.js";

const FORMAT_FLAGS = new Set(["-c", "--count", "-l", "--files-with-matches", "-L", "--files-without-match", "-o", "--only-matching", "-Z", "--null", "--json"]);

export interface GrepCompactOptions {
	maxResults: number;
	maxPerFile: number;
	maxLineLength: number;
}

export function isGrepLikeCommand(command: string): boolean {
	const parts = splitSimpleCommand(command);
	return !!parts && (parts[0] === "rg" || parts[0] === "grep");
}

export function normalizeGrepLikeCommand(command: string): string | null {
	const parts = splitSimpleCommand(command);
	if (!parts) return null;
	const [bin, ...args] = parts;
	if (bin !== "rg" && bin !== "grep") return null;
	if (args.some((a) => FORMAT_FLAGS.has(a))) return null;
	if (bin === "rg") {
		const add = [
			!args.some((a) => /^-.*n/.test(a) || a === "--line-number") ? "-n" : "",
			!args.some((a) => /^-.*H/.test(a) || a === "--with-filename") ? "-H" : "",
			!args.some((a) => /^-.*0/.test(a) || a === "--null") ? "-0" : "",
			!args.includes("--no-heading") ? "--no-heading" : "",
			!args.includes("--no-ignore-vcs") ? "--no-ignore-vcs" : "",
		].filter(Boolean);
		return add.length ? [bin, ...add, ...args].join(" ") : command;
	}
	const add = [
		!args.some((a) => /^-.*n/.test(a) || a === "--line-number") ? "-n" : "",
		!args.some((a) => /^-.*H/.test(a) || a === "--with-filename") ? "-H" : "",
		!args.some((a) => /^-.*Z/.test(a) || a === "--null") ? "-Z" : "",
	].filter(Boolean);
	return add.length ? [bin, ...add, ...args].join(" ") : command;
}

type Match = { file: string; line: number; content: string };

function parseLine(line: string): Match | null {
	const nul = line.indexOf("\0");
	if (nul >= 0) {
		const rest = line.slice(nul + 1);
		const m = rest.match(/^(\d+)[:\-](.*)$/);
		if (!m) return null;
		return { file: line.slice(0, nul), line: Number(m[1]), content: m[2] ?? "" };
	}
	const m = line.match(/^(.+?):(\d+)[:\-](.*)$/);
	if (!m) return null;
	return { file: m[1]!, line: Number(m[2]), content: m[3] ?? "" };
}

function compactContent(content: string, max: number, command: string): string {
	const trimmed = content.trim();
	if (trimmed.length <= max) return trimmed;
	const terms = command.split(/\s+/).filter((p) => p.length > 2 && !p.startsWith("-")).slice(1, 3);
	const lower = trimmed.toLowerCase();
	const pos = terms.map((t) => lower.indexOf(t.toLowerCase())).find((i) => i >= 0) ?? -1;
	if (pos >= 0) {
		const start = Math.max(0, pos - Math.floor(max / 3));
		return `${start > 0 ? "…" : ""}${trimmed.slice(start, start + max)}${start + max < trimmed.length ? "…" : ""}`;
	}
	return `${trimmed.slice(0, max)}…`;
}

export function compactGrepLikeOutput(raw: string, command: string, options: GrepCompactOptions): string | null {
	const matches = raw.split(/\r?\n/).map(parseLine).filter((m): m is Match => !!m);
	if (matches.length === 0) return null;

	const byFile = new Map<string, Match[]>();
	for (const match of matches) {
		const list = byFile.get(match.file) ?? [];
		list.push(match);
		byFile.set(match.file, list);
	}

	let shown = 0;
	const out: string[] = [`${matches.length} matches in ${byFile.size} files`, ""];
	for (const file of [...byFile.keys()].sort()) {
		if (shown >= options.maxResults) break;
		out.push(file);
		for (const match of (byFile.get(file) ?? []).slice(0, options.maxPerFile)) {
			if (shown >= options.maxResults) break;
			out.push(`  ${match.line}: ${compactContent(match.content, options.maxLineLength, command)}`);
			shown++;
		}
	}
	if (matches.length > shown) out.push(`[+${matches.length - shown} more]`);
	return out.join("\n") + "\n";
}
