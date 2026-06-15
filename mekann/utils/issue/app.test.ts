import { describe, expect, it } from "vitest";

import { computeIssueLayout, statusKeyHintsTier } from "./app.js";

// Overhead the row spends before the title: ROW_LEFT_FIXED(9) + ROW_SPACER(1).
// Kept in sync with the constants documented in app.ts.
const ROW_OVERHEAD = 10;
const DEP_RESERVED = 18;
const LABELS_MIN = 10;

describe("computeIssueLayout", () => {
	describe("invariant: reserved widths never exceed available", () => {
		// The core guarantee for issue #65: no column may be clipped at any width.
		for (const tw of [0, 1, 8, 10, 15, 20, 28, 29, 30, 37, 38, 39, 40, 44, 49, 50, 51, 55, 59, 60, 61, 80, 100, 200]) {
			it(`keeps dynamic columns within budget at tw=${tw}`, () => {
				const layout = computeIssueLayout(tw);
				// Dynamic columns (title + deps + labels) must always fit.
				expect(layout.titleWidth + layout.depWidth + layout.labelsWidth).toBeLessThanOrEqual(layout.available);
				// When the pane can hold the left-fixed block, the whole row fits —
				// i.e. nothing is pushed past the right edge (the #65 symptom).
				if (layout.available >= ROW_OVERHEAD) {
					const total = ROW_OVERHEAD + layout.titleWidth + layout.depWidth + layout.labelsWidth;
					expect(total).toBeLessThanOrEqual(layout.available);
				}
			});
		}
	});

	it("title width is never negative", () => {
		for (const tw of [0, 1, 5, 9, 10, 13, 20, 40, 80]) {
			expect(computeIssueLayout(tw).titleWidth).toBeGreaterThanOrEqual(0);
		}
	});

	it("defaults to 80 columns when terminalWidth is undefined", () => {
		const layout = computeIssueLayout(undefined);
		const wide = computeIssueLayout(80);
		expect(layout).toEqual(wide);
	});

	it("shows every column on a wide pane (tw=80)", () => {
		const layout = computeIssueLayout(80);
		expect(layout.showDeps).toBe(true);
		expect(layout.showLabels).toBe(true);
		expect(layout.depWidth).toBe(DEP_RESERVED);
		expect(layout.labelsWidth).toBeGreaterThanOrEqual(LABELS_MIN);
	});

	it("still shows every column at tw=60", () => {
		const layout = computeIssueLayout(60);
		expect(layout.showDeps).toBe(true);
		expect(layout.showLabels).toBe(true);
	});

	it("hides labels below the labels threshold (available < 50, tw < 54)", () => {
		// available = tw - 4; available >= 50 means tw >= 54
		expect(computeIssueLayout(53).showLabels).toBe(false);
		expect(computeIssueLayout(54).showLabels).toBe(true);
	});

	it("hides deps below the deps threshold (available < 38, tw < 42)", () => {
		expect(computeIssueLayout(41).showDeps).toBe(false);
		expect(computeIssueLayout(42).showDeps).toBe(true);
	});

	it("clears reserved widths for hidden columns", () => {
		const onlyDeps = computeIssueLayout(46); // labels hidden, deps shown
		expect(onlyDeps.showLabels).toBe(false);
		expect(onlyDeps.labelsWidth).toBe(0);
		expect(onlyDeps.showDeps).toBe(true);

		const onlyTitle = computeIssueLayout(34); // both hidden
		expect(onlyTitle.showLabels).toBe(false);
		expect(onlyTitle.showDeps).toBe(false);
		expect(onlyTitle.depWidth).toBe(0);
		expect(onlyTitle.labelsWidth).toBe(0);
	});

	it("falls back to title-only on very narrow panes", () => {
		const layout = computeIssueLayout(20);
		expect(layout.showDeps).toBe(false);
		expect(layout.showLabels).toBe(false);
		expect(layout.titleWidth).toBeGreaterThan(0);
	});

	it("keeps the title column width stable across the header/row boundary", () => {
		// Header and rows both call computeIssueLayout, so the same tw must
		// produce identical title widths (regression for the mismatch fixed in #65).
		const tw = 72;
		const a = computeIssueLayout(tw);
		const b = computeIssueLayout(tw);
		expect(a.titleWidth).toBe(b.titleWidth);
	});
});

describe("statusKeyHintsTier", () => {
	it("returns 'full' at >= 60 columns", () => {
		expect(statusKeyHintsTier(60)).toBe("full");
		expect(statusKeyHintsTier(80)).toBe("full");
	});

	it("returns 'mid' between 44 and 59 columns", () => {
		expect(statusKeyHintsTier(44)).toBe("mid");
		expect(statusKeyHintsTier(59)).toBe("mid");
	});

	it("returns 'short' below 44 columns", () => {
		expect(statusKeyHintsTier(43)).toBe("short");
		expect(statusKeyHintsTier(30)).toBe("short");
	});

	it("defaults to 'full' when undefined", () => {
		expect(statusKeyHintsTier(undefined)).toBe("full");
	});
});
