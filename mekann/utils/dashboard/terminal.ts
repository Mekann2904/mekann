/**
 * Shared ANSI color constants and string-width utilities for the dashboard.
 * Used by both pi-component.ts (Pi TUI overlay) and render.ts (CLI text output).
 */

// ── ANSI color constants ──────────────────────────────────────────────
export const GREEN = "\x1b[38;2;121;242;143m";
export const MUTED = "\x1b[38;2;156;163;175m";
export const WHITE = "\x1b[38;2;229;255;233m";
export const BLUE = "\x1b[38;2;139;213;255m";
export const YELLOW = "\x1b[38;2;244;211;94m";
export const BOLD = "\x1b[1m";
export const RESET = "\x1b[0m";

// CSS color for render.ts compatibility
export const dashboardTextColor = "#4ade80";

// ── string width utilities ────────────────────────────────────────────

/** Strip ANSI escape sequences (CSI, OSC, APC/Kitty). */
export function stripAnsi(s: string): string {
	return s.replace(/\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*\x07|_G[^\x1b]*\x1b\\)/gs, "");
}

/** Return the visible (cell) width of a string, ignoring ANSI escapes. */
export function visibleWidth(s: string): number {
	const stripped = stripAnsi(s);
	let w = 0;
	for (const ch of stripped) {
		const cp = ch.codePointAt(0) ?? 0;
		w += isWide(cp) ? 2 : 1;
	}
	return w;
}

/**
 * Truncate an ANSI-colored string to `maxWidth` visible cells.
 * Appends RESET when truncated.
 */
export function truncateToWidth(s: string, maxWidth: number): string {
	let visible = 0;
	let inEscape = false;
	let result = "";
	for (let i = 0; i < s.length; i++) {
		const ch = s[i]!;
		if (ch === "\x1b") { inEscape = true; result += ch; continue; }
		if (inEscape) {
			result += ch;
			if (/[A-Za-z]/.test(ch) || ch === "\\" || ch === "\x07") inEscape = false;
			continue;
		}
		const cp = ch.codePointAt(0)!;
		const cw = isWide(cp) ? 2 : 1;
		if (visible + cw > maxWidth) {
			return result + RESET;
		}
		visible += cw;
		result += ch;
	}
	return result;
}

/**
 * Truncate a plain string to `maxWidth` visible cells.
 * Appends "…" when truncated.
 */
export function truncatePlain(value: string, width: number): string {
	if (visibleWidth(value) <= width) return value;
	let out = "";
	for (const char of [...value]) {
		if (visibleWidth(`${out}${char}…`) > width) break;
		out += char;
	}
	return `${out}…`;
}

function isWide(code: number): boolean {
	return (code >= 0x1100 && code <= 0x115f) ||
		code === 0x2329 || code === 0x232a ||
		(code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
		(code >= 0xac00 && code <= 0xd7a3) ||
		(code >= 0xf900 && code <= 0xfaff) ||
		(code >= 0xfe10 && code <= 0xfe19) ||
		(code >= 0xfe30 && code <= 0xfe6f) ||
		(code >= 0xff01 && code <= 0xff60) ||
		(code >= 0xffe0 && code <= 0xffe6) ||
		(code >= 0x1f300 && code <= 0x1faff) ||
		(code >= 0x20000 && code <= 0x2fffd) ||
		(code >= 0x30000 && code <= 0x3fffd);
}
