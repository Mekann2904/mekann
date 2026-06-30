import { describe, expect, it } from "vitest";
import {
	RESET,
	stripAnsi,
	truncatePlain,
	truncateToWidth,
	visibleWidth,
} from "./terminal.js";

describe("stripAnsi", () => {
	it("strips CSI SGR sequences", () => {
		expect(stripAnsi("\x1b[31mhello\x1b[0m")).toBe("hello");
		expect(stripAnsi("\x1b[38;2;1;2;3m")).toBe("");
	});

	it("strips CSI cursor / mode sequences", () => {
		expect(stripAnsi("\x1b[2J\x1b[Htext")).toBe("text");
		expect(stripAnsi("\x1b[?25l\x1b[?25h")).toBe("");
	});

	it("strips OSC terminated by BEL", () => {
		expect(stripAnsi("\x1b]0;title\x07text")).toBe("text");
	});

	it("strips OSC terminated by ST (ESC backslash)", () => {
		// The old implementation only handled BEL-terminated OSC and leaked the title.
		expect(stripAnsi("\x1b]0;title\x1b\\text")).toBe("text");
	});

	it("strips OSC hyperlinks (ST-terminated)", () => {
		expect(stripAnsi("\x1b]8;;https://example.com\x1b\\link\x1b]8;;\x1b\\")).toBe("link");
	});

	it("strips DCS sequences (e.g. sixel)", () => {
		expect(stripAnsi("\x1bP1;2;3qpayload\x1b\\text")).toBe("text");
	});

	it("strips kitty graphics APC (_G) and generic APC", () => {
		expect(stripAnsi("\x1b_Ga=T,f=100;QUJD\x1b\\tail")).toBe("tail");
		expect(stripAnsi("\x1b_arbitrary\x1b\\tail")).toBe("tail");
	});

	it("strips PM and SOS", () => {
		expect(stripAnsi("\x1b^pm-payload\x1b\\tail")).toBe("tail");
		expect(stripAnsi("\x1bXsos-payload\x1b\\tail")).toBe("tail");
	});

	it("leaves plain text untouched", () => {
		expect(stripAnsi("plain text 日本語 😀")).toBe("plain text 日本語 😀");
	});

	it("handles a mix of escapes and text", () => {
		expect(stripAnsi("\x1b[31m\x1b]0;t\x07A\x1b[0m\x1b_Ga=T;QQ\x1b\\B")).toBe("AB");
	});
});

describe("visibleWidth", () => {
	it("measures ASCII as 1 cell per char", () => {
		expect(visibleWidth("hello")).toBe(5);
	});

	it("measures CJK as 2 cells per char", () => {
		expect(visibleWidth("日本語")).toBe(6);
	});

	it("ignores ANSI escapes", () => {
		expect(visibleWidth("\x1b[31m日本\x1b[0m")).toBe(4);
		expect(visibleWidth("\x1b]0;t\x07ab")).toBe(2);
	});

	it("counts a single emoji as 2 cells", () => {
		expect(visibleWidth("😀")).toBe(2);
	});

	it("counts a ZWJ family emoji as 2 cells (not per codepoint)", () => {
		// 👨‍👩‍👧 = man + ZWJ + woman + ZWJ + girl (5 codepoints, 1 grapheme, 2 cells).
		// The old codepoint loop returned 8 here.
		expect(visibleWidth("👨‍👩‍👧")).toBe(2);
	});

	it("counts a ZWJ rainbow flag as 2 cells", () => {
		// 🏳️‍🌈 = white flag + VS16 + ZWJ + rainbow.
		expect(visibleWidth("🏳️‍🌈")).toBe(2);
	});

	it("counts a regional-indicator flag pair as 2 cells", () => {
		// 🇯🇵 = two regional indicator symbols forming one grapheme cluster.
		expect(visibleWidth("🇯🇵")).toBe(2);
	});

	it("counts a skin-tone emoji modifier as 2 cells (not 4)", () => {
		// 👨🏻 = man + fitzpatrick modifier.
		expect(visibleWidth("👨🏻")).toBe(2);
	});

	it("does not count combining marks or variation selectors", () => {
		// e + combining acute should be 1 cell, not 2.
		expect(visibleWidth("e\u0301")).toBe(1);
		// ❤️ (heavy black heart + VS16) renders as a 2-cell emoji.
		expect(visibleWidth("❤️")).toBe(2);
	});

	it("measures mixed CJK + emoji + ascii", () => {
		// a(1) b(1) 日本(4) 😀(2) c(1) = 9
		expect(visibleWidth("ab日本😀c")).toBe(9);
	});
});

describe("truncateToWidth", () => {
	it("returns the input unchanged when it fits", () => {
		expect(truncateToWidth("abc", 10)).toBe("abc");
	});

	it("truncates plain ASCII and appends RESET", () => {
		expect(truncateToWidth("Hello", 3)).toBe(`Hel${RESET}`);
	});

	it("preserves leading color and appends RESET when truncating colored text", () => {
		expect(truncateToWidth("\x1b[31mHello\x1b[0m", 3)).toBe(`\x1b[31mHel${RESET}`);
	});

	it("does not split a surrogate pair", () => {
		// Three emoji (6 cells). Truncating to 3 cells keeps exactly one emoji.
		const out = truncateToWidth("😀😀😀", 3);
		expect(out).toBe(`😀${RESET}`);
		expect(visibleWidth(out)).toBe(2);
	});

	it("does not split a ZWJ emoji sequence", () => {
		// Truncating inside the family cluster must not break it into pieces.
		const out = truncateToWidth("a👨‍👩‍👧b", 3);
		expect(out).toBe(`a👨‍👩‍👧${RESET}`);
		expect(visibleWidth(out)).toBe(3);
	});

	it("truncates on a CJK boundary", () => {
		// "日本語" = 6 cells; width 3 keeps one CJK char (2 cells).
		const out = truncateToWidth("日本語", 3);
		expect(out).toBe(`日${RESET}`);
		expect(visibleWidth(out)).toBe(2);
	});
});

describe("truncatePlain", () => {
	it("returns the input unchanged when it fits", () => {
		expect(truncatePlain("abc", 10)).toBe("abc");
	});

	it("appends an ellipsis when truncating", () => {
		expect(truncatePlain("Hello", 4)).toBe("Hel…");
	});

	it("does not split a surrogate pair", () => {
		// "😀😀" is 4 cells; width 3 keeps one emoji + ellipsis.
		const out = truncatePlain("😀😀", 3);
		expect(out).toBe("😀…");
		expect(visibleWidth(out)).toBe(3);
	});

	it("does not split a ZWJ emoji sequence", () => {
		// The family cluster (2 cells) + ellipsis (1) fits in width 3; "ab" overflows.
		const out = truncatePlain("👨‍👩‍👧ab", 3);
		expect(out).toBe("👨‍👩‍👧…");
	});

	it("handles CJK truncation", () => {
		// "日本語" = 6 cells; width 4 keeps one CJK char (2) + ellipsis (1) = 3.
		expect(truncatePlain("日本語", 4)).toBe("日…");
	});
});
