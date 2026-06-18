import { splitSimpleCommand } from "./command.js";

const FORMAT_FLAGS = new Set(["-c", "--count", "-l", "--files-with-matches", "-L", "--files-without-match", "-o", "--only-matching", "-Z", "--null", "--json"]);

export function isGrepLikeCommand(command: string): boolean {
	const parts = splitSimpleCommand(command);
	return !!parts && (parts[0] === "rg" || parts[0] === "grep");
}

/**
 * Detect whether a single-character short flag (e.g. "n", "H", "0", "Z") is
 * already present. A short flag may be standalone (`-n`) or the trailing letter
 * of an all-letter combined cluster (`-in`, `-nH`). The flag must TERMINATE the
 * cluster so that values are not misread as containing the flag:
 *   `-10`        (numeric, grep `-NUM` context)        → not `-0`
 *   `-A2`        (`-A` consumes the numeric arg)        → not `-n`
 *   `-inferior` / `-Help` (flag letter not last)        → not `-n` / `-H`
 * Being conservative only ever adds a redundant flag, which grep/rg ignore; the
 * previous loose `/^-.*X/` regex silently skipped required flags. (IC-061)
 */
function hasShortFlag(args: string[], flag: string): boolean {
	const escaped = flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const pattern = new RegExp(`^-[a-zA-Z]*${escaped}$`);
	return args.some((a) => pattern.test(a));
}

export function normalizeGrepLikeCommand(command: string): string | null {
	const parts = splitSimpleCommand(command);
	if (!parts) return null;
	const [bin, ...args] = parts;
	if (bin !== "rg" && bin !== "grep") return null;
	if (args.some((a) => FORMAT_FLAGS.has(a))) return null;
	if (bin === "rg") {
		const add = [
			!(hasShortFlag(args, "n") || args.includes("--line-number")) ? "-n" : "",
			!(hasShortFlag(args, "H") || args.includes("--with-filename")) ? "-H" : "",
			!(hasShortFlag(args, "0") || args.includes("--null")) ? "-0" : "",
			!args.includes("--no-heading") ? "--no-heading" : "",
		].filter(Boolean);
		return add.length ? [bin, ...add, ...args].join(" ") : command;
	}
	const add = [
		!(hasShortFlag(args, "n") || args.includes("--line-number")) ? "-n" : "",
		!(hasShortFlag(args, "H") || args.includes("--with-filename")) ? "-H" : "",
		!(hasShortFlag(args, "Z") || args.includes("--null")) ? "-Z" : "",
	].filter(Boolean);
	return add.length ? [bin, ...add, ...args].join(" ") : command;
}
