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

// ── ANSI escape stripping ─────────────────────────────────────────────

/**
 * ECMA-48 / xterm-style escape sequences, matched in priority order:
 *   CSI  : ESC [ <params 0x30-0x3F> <intermediates 0x20-0x2F> <final 0x40-0x7E>
 *   OSC  : ESC ] <string> terminated by BEL (0x07) or ST (ESC \)   — title, hyperlink, kitty query
 *   DCS/SOS/PM/APC : ESC P / X / ^ / _ <string> terminated by ST or BEL  — kitty graphics lives here (_G)
 *   2-byte C1 : ESC <final 0x40-0x5F>                               — ESC c, ESC M, ESC D, ESC E, ESC H, ...
 * OSC/DCS/PM/APC bodies stop at the first BEL or ESC so the ST terminator (ESC \) is consumed.
 */
const ANSI_ESCAPE =
	/\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[PX^_][^\x07\x1b]*(?:\x07|\x1b\\)|[\x40-\x5f])/g;

/** Strip ANSI escape sequences (CSI, OSC, DCS, PM, APC, SOS, and 2-byte C1). */
export function stripAnsi(s: string): string {
	return s.replace(ANSI_ESCAPE, "");
}

// ── string width utilities ────────────────────────────────────────────

let segmenter: Intl.Segmenter | undefined;

/** Lazily-created, reused grapheme cluster segmenter (locale-independent per UTS #51). */
function getSegmenter(): Intl.Segmenter {
	if (!segmenter) segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
	return segmenter;
}

/** Return the visible (cell) width of a string, ignoring ANSI escapes. */
export function visibleWidth(s: string): number {
	const stripped = stripAnsi(s);
	let w = 0;
	for (const { segment } of getSegmenter().segment(stripped)) {
		w += graphemeWidth(segment);
	}
	return w;
}

/**
 * Truncate an ANSI-colored string to `maxWidth` visible cells without splitting
 * grapheme clusters or surrogate pairs. ANSI escapes are preserved verbatim and
 * RESET is appended when truncation occurs.
 */
export function truncateToWidth(s: string, maxWidth: number): string {
	let visible = 0;
	let result = "";
	for (const token of iterateDisplayTokens(s)) {
		if (token.type === "escape") {
			result += token.text;
			continue;
		}
		if (visible + token.width > maxWidth) {
			return result + RESET;
		}
		visible += token.width;
		result += token.text;
	}
	return result;
}

/**
 * Truncate a plain string to `width` visible cells without splitting grapheme
 * clusters or surrogate pairs. Appends "…" when truncated.
 */
export function truncatePlain(value: string, width: number): string {
	if (visibleWidth(value) <= width) return value;
	let out = "";
	let used = 0;
	for (const { segment } of getSegmenter().segment(value)) {
		const w = graphemeWidth(segment);
		// Reserve one cell for the trailing ellipsis (U+2026 = 1 cell).
		if (used + w + 1 > width) break;
		out += segment;
		used += w;
	}
	return `${out}…`;
}

// ── width primitives ──────────────────────────────────────────────────

type DisplayToken = { type: "escape"; text: string } | { type: "text"; text: string; width: number };

/** Split a string into ANSI escape runs and grapheme-cluster text tokens (with widths). */
function* iterateDisplayTokens(s: string): Generator<DisplayToken> {
	let cursor = 0;
	// matchAll clones the regex internally, so the shared `g` flag never leaks lastIndex.
	for (const match of s.matchAll(ANSI_ESCAPE)) {
		const escape = match[0];
		if (match.index > cursor) {
			yield* textToGraphemeTokens(s.slice(cursor, match.index));
		}
		yield { type: "escape", text: escape };
		cursor = match.index + escape.length;
	}
	if (cursor < s.length) {
		yield* textToGraphemeTokens(s.slice(cursor));
	}
}

function* textToGraphemeTokens(text: string): Generator<DisplayToken> {
	if (!text) return;
	for (const { segment } of getSegmenter().segment(text)) {
		yield { type: "text", text: segment, width: graphemeWidth(segment) };
	}
}

/**
 * Cell width of a single grapheme cluster. A cluster renders in 1 or 2 cells
 * (or 0 for a lone modifier). Zero-width joiners, combining marks, variation
 * selectors, and emoji modifiers contribute no width of their own; an emoji
 * presentation selector (U+FE0F) forces the cluster to 2 cells.
 */
function graphemeWidth(cluster: string): number {
	let base = 0;
	let emojiPresentation = false;
	for (const ch of cluster) {
		const cp = ch.codePointAt(0) ?? 0;
		if (cp === 0xfe0f) {
			emojiPresentation = true;
			continue;
		}
		if (isZeroWidth(cp)) continue;
		base = Math.max(base, isWide(cp) ? 2 : 1);
	}
	if (base === 0) return 0;
	if (emojiPresentation) return 2;
	return base;
}

/** Code points that combine with an adjacent base and contribute no advance width. */
function isZeroWidth(code: number): boolean {
	return code === 0x200d                         // zero-width joiner (ZWJ)
		|| code === 0xfe0e                         // text presentation selector (VS15)
		|| (code >= 0x0300 && code <= 0x036f)      // combining diacritical marks
		|| (code >= 0x1ab0 && code <= 0x1aff)      // combining diacritical marks extended
		|| (code >= 0x1dc0 && code <= 0x1dff)      // combining diacritical marks supplemental
		|| (code >= 0x20d0 && code <= 0x20ff)      // combining marks for symbols
		|| (code >= 0xfe20 && code <= 0xfe2f)      // combining half marks
		|| (code >= 0x200b && code <= 0x200f)      // zero-width space + LTR/RTL marks
		|| (code >= 0xe0020 && code <= 0xe007f)    // tag characters (tagged flag sequences)
		|| (code >= 0xe0100 && code <= 0xe01ef)    // variation selectors supplement
		|| (code >= 0x1f3fb && code <= 0x1f3ff);   // emoji modifier (fitzpatrick skin tones)
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
		(code >= 0x1f1e6 && code <= 0x1f1ff) ||    // regional indicator symbols (flag pairs)
		(code >= 0x1f300 && code <= 0x1faff) ||
		(code >= 0x20000 && code <= 0x2fffd) ||
		(code >= 0x30000 && code <= 0x3fffd);
}
