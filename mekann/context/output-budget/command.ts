import type { OutputBudgetKind } from "./formatters.js";

const SHELL_OPERATORS = /[|;&<>`$(){}]/;
const IGNORE_DIRS = [".git", "node_modules", "vendor", "target", "dist", "build", ".next", "coverage"];

export function splitSimpleCommand(command: string): string[] | null {
	const trimmed = command.trim();
	if (!trimmed || SHELL_OPERATORS.test(trimmed)) return null;
	const parts = trimmed.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
	return parts.map((p) => p.replace(/^(['"])(.*)\1$/, "$2"));
}

function quote(arg: string): string {
	return /^[A-Za-z0-9_./:=@%+,-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'"'"'`)}'`;
}

function hasShort(args: string[], flag: string): boolean {
	return args.some((a) => a === `-${flag}` || (a.startsWith("-") && !a.startsWith("--") && a.includes(flag)));
}

function normalizeList(bin: string, args: string[]): string | null {
	if (bin === "tree") {
		const out = [bin, ...args];
		if (!args.includes("-L") && !args.some((a) => a.startsWith("--max-depth"))) out.push("-L", "3");
		for (const dir of IGNORE_DIRS) if (!args.includes("-I") && !args.some((a) => a.includes(dir))) out.push("-I", IGNORE_DIRS.join("|"));
		return out.map(quote).join(" ");
	}
	if (bin === "find") {
		const out = [bin, ...args];
		if (!args.includes("-type")) out.push("-type", "f");
		if (!args.includes("-maxdepth")) out.push("-maxdepth", "4");
		return out.map(quote).join(" ");
	}
	if (bin === "ls") {
		const out = [bin, ...args];
		if (!hasShort(args, "1")) out.splice(1, 0, "-1");
		return out.map(quote).join(" ");
	}
	return null;
}

function normalizeGit(args: string[]): string | null {
	const sub = args[0];
	if (!sub) return null;
	if (sub === "status") return ["git", "status", "--porcelain=v1", "-b", ...args.slice(1).filter((a) => a !== "--porcelain" && !a.startsWith("--porcelain=") && a !== "-b")].map(quote).join(" ");
	if (sub === "log") {
		const hasPretty = args.some((a) => a === "--oneline" || a.startsWith("--pretty") || a.startsWith("--format"));
		return ["git", "log", ...(hasPretty ? [] : ["--oneline"]), ...args.slice(1)].map(quote).join(" ");
	}
	if (sub === "show") {
		const hasStat = args.includes("--stat") || args.includes("--name-status") || args.includes("--name-only");
		return hasStat ? null : ["git", "show", "--stat", ...args.slice(1)].map(quote).join(" ");
	}
	return null;
}

export function classifyBashCommand(command: string): OutputBudgetKind | null {
	const parts = splitSimpleCommand(command);
	if (!parts) return null;
	const bin = parts[0];
	if (bin === "rg" || bin === "grep") return "grep";
	if (bin === "ls" || bin === "tree" || bin === "find") return "list";
	if (bin === "cat" || bin === "head" || bin === "tail") return "read";
	if (bin === "git") return "git";
	return null;
}

export function normalizeBashCommand(command: string, kind: OutputBudgetKind): string | null {
	const parts = splitSimpleCommand(command);
	if (!parts) return null;
	const [bin, ...args] = parts;
	if (kind === "list") return normalizeList(bin, args);
	if (kind === "git" && bin === "git") return normalizeGit(args);
	return null;
}

export function kindForToolResult(toolName: string): OutputBudgetKind | null {
	if (toolName === "read") return "read";
	if (toolName === "grep") return "grep";
	return null;
}
