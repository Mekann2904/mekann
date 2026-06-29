/**
 * truncateForLlm (LLM 向け出力切り詰め) のテスト。
 */

import { describe, it, expect } from "vitest";

import {
	truncateForLlm,
	DEFAULT_LLM_OUTPUT_MAX_BYTES,
	DEFAULT_LLM_OUTPUT_MAX_LINES,
} from "../index.js";

describe("truncateForLlm", () => {
	it("短いテキストはそのまま返す", () => {
		const result = truncateForLlm("hello");
		expect(result.text).toBe("hello");
		expect(result.truncated).toBe(false);
		expect(result.originalBytes).toBe(5);
		expect(result.originalLines).toBe(1);
	});

	it("\r\n を含むテキストの行数も正確にカウントされる", () => {
		const result = truncateForLlm("line1\r\nline2\r\nline3");
		expect(result.originalLines).toBe(3);
		expect(result.truncated).toBe(false);
	});

	it("単一行の長いテキストがバイト制限のみで切り詰められる", () => {
		const text = "x".repeat(60 * 1024); // 60KB
		const result = truncateForLlm(text, { maxBytes: 10 * 1024, maxLines: 100 });
		expect(result.truncated).toBe(true);
		expect(result.originalBytes).toBe(60 * 1024);
		expect(result.originalLines).toBe(1);
	});

	it("空文字列はそのまま返す", () => {
		const result = truncateForLlm("");
		expect(result.text).toBe("");
		expect(result.truncated).toBe(false);
		expect(result.originalBytes).toBe(0);
		expect(result.originalLines).toBe(0);
	});

	it("100KB 以上の stdout は 50KB 程度に短縮される", () => {
		// 100KB of 'a' repeated
		const largeText = "a".repeat(100 * 1024);
		const result = truncateForLlm(largeText);
		expect(result.truncated).toBe(true);
		expect(result.originalBytes).toBe(100 * 1024);
		expect(result.originalLines).toBe(1);
		// The output should be at most ~50KB + truncation notice
		expect(Buffer.byteLength(result.text, "utf8")).toBeLessThan(60 * 1024);
		expect(result.text).toContain("切り詰められました");
	});

	it("3000 行の stdout は 2000 行程度に短縮される", () => {
		const lines = Array.from({ length: 3000 }, (_, i) => `line ${i}`);
		const text = lines.join("\n");
		const result = truncateForLlm(text);
		expect(result.truncated).toBe(true);
		expect(result.originalLines).toBe(3000);
		// The result should have at most 2000 lines + truncation notice
		const resultLines = result.text.split("\n").length;
		expect(resultLines).toBeLessThanOrEqual(2010); // some slack for the notice
		expect(result.text).toContain("切り詰められました");
	});

	it("非 ASCII 文字でも正確にバイト制限される", () => {
		// 'あ' is 3 bytes in UTF-8
		const text = "あ".repeat(20000); // 60000 bytes
		const result = truncateForLlm(text, { maxBytes: 5000, maxLines: 50000 });
		expect(result.truncated).toBe(true);
		expect(result.originalBytes).toBe(60000);
		// Should not end with a replacement character
		expect(result.text.endsWith("\uFFFD")).toBe(false);
	});

	it("custom opts を渡せる", () => {
		const text = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
		const result = truncateForLlm(text, { maxBytes: 100000, maxLines: 10 });
		expect(result.truncated).toBe(true);
		expect(result.text).toContain("切り詰められました");
	});

	it("truncation notice に元のサイズ情報が含まれる", () => {
		const largeText = "x".repeat(60 * 1024);
		const result = truncateForLlm(largeText);
		expect(result.text).toContain(`元の ${60 * 1024} バイト`);
		expect(result.text).toContain("1 行");
		expect(result.text).toContain(`${DEFAULT_LLM_OUTPUT_MAX_BYTES} バイト`);
		expect(result.text).toContain(`${DEFAULT_LLM_OUTPUT_MAX_LINES} 行`);
	});
});

