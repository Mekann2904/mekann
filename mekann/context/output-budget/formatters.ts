export type OutputBudgetKind = "grep" | "list" | "read" | "git";

export interface CompactOptions {
	maxResults: number;
	maxPerFile: number;
	maxLineLength: number;
	maxLines: number;
}

export function compactLine(line: string, max: number): string {
	const trimmed = line.replace(/\s+$/g, "");
	return trimmed.length <= max ? trimmed : `${trimmed.slice(0, Math.max(1, max - 1))}…`;
}

function capLines(lines: string[], maxLines: number, maxLineLength: number): string {
	const shown = lines.slice(0, maxLines).map((l) => compactLine(l, maxLineLength));
	if (lines.length > shown.length) shown.push(`[+${lines.length - shown.length} more lines]`);
	return shown.join("\n") + (shown.length ? "\n" : "");
}

export function compactListOutput(raw: string, _command: string, options: CompactOptions): string | null {
	const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
	if (lines.length <= options.maxLines && raw.length <= options.maxLines * options.maxLineLength) return null;
	const dirs = new Map<string, number>();
	for (const line of lines) {
		const clean = line.trim();
		const path = clean.match(/(?:^|\s)([^\s]+\/$)/)?.[1] ?? clean.split(/\s+/).at(-1) ?? clean;
		const dir = path.includes("/") ? path.split("/").slice(0, -1).join("/") || "." : ".";
		dirs.set(dir, (dirs.get(dir) ?? 0) + 1);
	}
	const summary = [...dirs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([d, n]) => `  ${d}: ${n}`);
	return [`${lines.length} entries`, ...summary, "", capLines(lines, options.maxLines, options.maxLineLength).trimEnd()].join("\n") + "\n";
}

export function compactReadOutput(raw: string, command: string, options: CompactOptions): string | null {
	const lines = raw.split(/\r?\n/);
	if (lines.length <= options.maxLines && raw.length <= options.maxLines * options.maxLineLength) return null;
	const important = lines.filter((l) => /^(export\s+|import\s+|type\s+|interface\s+|class\s+|function\s+|const\s+\w+\s*=\s*(async\s*)?\(|def\s+|pub\s+|fn\s+)/.test(l.trim()) || /TODO|FIXME|throw new|panic!|describe\(|it\(/.test(l));
	const body = important.length >= 8 ? important : lines;
	return [`compact read: ${command}`, `${lines.length} lines`, "", capLines(body, options.maxLines, options.maxLineLength).trimEnd()].join("\n") + "\n";
}

export function compactGitOutput(raw: string, command: string, options: CompactOptions): string | null {
	const lines = raw.split(/\r?\n/).filter((l) => !/^\s*(hint:|Counting objects:|Compressing objects:|Writing objects:|remote: Resolving deltas)/.test(l));
	const sub = command.match(/\bgit\s+(\w+)/)?.[1] ?? "git";
	if (sub === "status") {
		const changed = lines.filter((l) => /^\s*(modified:|new file:|deleted:|renamed:|both modified:|\w\w\s+)/.test(l));
		if (changed.length) return [`git status: ${changed.length} changed`, ...changed.slice(0, options.maxLines).map((l) => compactLine(l.trim(), options.maxLineLength)), changed.length > options.maxLines ? `[+${changed.length - options.maxLines} more]` : ""].filter(Boolean).join("\n") + "\n";
	}
	if (sub === "diff") {
		const files = lines.filter((l) => /^diff --git /.test(l)).length;
		const stats = lines.filter((l) => /^[-+]{3} |^@@ /.test(l) || /^diff --git /.test(l));
		if (stats.length) return [`git diff: ${files} files`, ...capLines(stats, options.maxLines, options.maxLineLength).trimEnd().split("\n")].join("\n") + "\n";
	}
	if (sub === "log") return capLines(lines, Math.min(options.maxLines, 80), options.maxLineLength);
	if (lines.length > options.maxLines || raw.length > options.maxLines * options.maxLineLength) return capLines(lines, options.maxLines, options.maxLineLength);
	return null;
}
