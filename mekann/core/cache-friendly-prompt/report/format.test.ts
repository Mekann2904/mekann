/**
 * report/format.test.ts — 共通 leaf フォーマッタの focused test。
 * {@link "./format.js"} を直接 import して単体検証する。
 */
import { describe, expect, it } from "vitest";
import { escapeHtml, formatBytes, formatPercentiles, formatPct, formatTimestamp, shortHash } from "./format.js";

describe("shortHash", () => {
	it("returns the first 8 chars of a hash", () => {
		expect(shortHash("abcdefgh1234567890")).toBe("abcdefgh");
	});
	it("returns the whole string when shorter than 8", () => {
		expect(shortHash("abc")).toBe("abc");
	});
	it("returns empty string for undefined", () => {
		expect(shortHash(undefined)).toBe("");
	});
});

describe("escapeHtml", () => {
	it("escapes &, <, >, \"", () => {
		expect(escapeHtml(`<a href="x">&copy;</a>`)).toBe(`&lt;a href=&quot;x&quot;&gt;&amp;copy;&lt;/a&gt;`);
	});
	it("leaves safe characters unchanged", () => {
		expect(escapeHtml("plain text 123")).toBe("plain text 123");
	});
});

describe("formatPct", () => {
	it("renders null as n/a", () => {
		expect(formatPct(null)).toBe("n/a");
	});
	it("renders a fraction as one-decimal percent", () => {
		expect(formatPct(0.5)).toBe("50.0%");
		expect(formatPct(0.123)).toBe("12.3%");
	});
});

describe("formatPercentiles", () => {
	it("formats p50/p90/p99 with n/a for nulls", () => {
		expect(formatPercentiles({ p50: 0.5, p90: null, p99: 0.99 })).toBe("p50 50.0% / p90 n/a / p99 99.0%");
	});
});

describe("formatBytes", () => {
	it("returns the raw value for non-positive numbers", () => {
		expect(formatBytes(0)).toBe("0");
		expect(formatBytes(-5)).toBe("-5");
	});
	it("formats KiB/MiB with the raw byte count in parentheses", () => {
		expect(formatBytes(2048)).toBe("2.0 KiB (2048 B)");
		expect(formatBytes(1048576)).toBe("1.0 MiB (1048576 B)");
	});
	it("keeps small values in bytes", () => {
		expect(formatBytes(512)).toBe("512 B");
	});
});

describe("formatTimestamp", () => {
	it("truncates to the first 16 chars (minutes precision)", () => {
		expect(formatTimestamp("2026-06-19T02:33:14.123Z")).toBe("2026-06-19T02:33");
	});
	it("returns n/a for null", () => {
		expect(formatTimestamp(null)).toBe("n/a");
	});
});
