import { splitSimpleCommand } from "./command.js";

const FORMAT_FLAGS = new Set(["-c", "--count", "-l", "--files-with-matches", "-L", "--files-without-match", "-o", "--only-matching", "-Z", "--null", "--json"]);

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
