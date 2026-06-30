/**
 * runner/spawn.test.ts — 出力切り詰め (truncateTail) の focused test。
 * {@link "./spawn.js"} を直接 import して単体検証する。
 * runCommand / runArgvCommand の統計テストは ../runner.test.ts に残す。
 */
import { describe, expect, it } from "vitest";
import { truncateTail } from "./spawn.js";

describe("truncateTail", () => {
	it("returns short text unchanged", () => {
		expect(truncateTail("hello", 10, 1024)).toBe("hello");
	});

	it("keeps the tail when exceeding maxLines", () => {
		const text = ["a", "b", "c", "d", "e"].join("\n");
		const out = truncateTail(text, 2, 4096);
		expect(out.split("\n")).toEqual(["d", "e"]);
	});

	it("keeps the tail when exceeding maxBytes", () => {
		const text = "x".repeat(100);
		const out = truncateTail(text, 100, 10);
		expect(Buffer.byteLength(out, "utf8")).toBeLessThanOrEqual(10);
		expect(out).toBe(text.slice(-10));
	});

	it("handles empty input", () => {
		expect(truncateTail("", 10, 1024)).toBe("");
	});
});
