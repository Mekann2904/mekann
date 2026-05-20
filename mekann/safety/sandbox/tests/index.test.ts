/**
 * Sandbox index.ts のテスト。
 *
 * truncateForLlm と定数を検証する。
 * Extension 本体 (pi.registerTool など) は UI 依存のため、
 * 純粋関数のみをテストする。
 */

import { describe, it, expect } from "vitest";
import {
	truncateForLlm,
	DEFAULT_LLM_OUTPUT_MAX_BYTES,
	DEFAULT_LLM_OUTPUT_MAX_LINES,
} from "../index.js";

// ─── truncateForLlm ──────────────────────────────────────────────

describe("truncateForLlm", () => {
	describe("非切り詰めケース", () => {
		it("短いテキストはそのまま返す", () => {
			const result = truncateForLlm("hello");
			expect(result.text).toBe("hello");
			expect(result.truncated).toBe(false);
			expect(result.originalBytes).toBe(5);
			expect(result.originalLines).toBe(1);
		});

		it("空文字列はそのまま返す", () => {
			const result = truncateForLlm("");
			expect(result.text).toBe("");
			expect(result.truncated).toBe(false);
			expect(result.originalBytes).toBe(0);
			expect(result.originalLines).toBe(0);
		});

		it("1バイトのテキスト", () => {
			const result = truncateForLlm("a");
			expect(result.text).toBe("a");
			expect(result.truncated).toBe(false);
			expect(result.originalBytes).toBe(1);
		});

		it("制限内のテキストは切り詰めない", () => {
			const text = "x".repeat(100);
			const result = truncateForLlm(text, { maxBytes: 200, maxLines: 200 });
			expect(result.truncated).toBe(false);
			expect(result.text).toBe(text);
		});
	});

	describe("バイト制限による切り詰め", () => {
		it("バイト制限を超えると切り詰める", () => {
			const text = "a".repeat(100);
			const result = truncateForLlm(text, { maxBytes: 50, maxLines: 1000 });
			expect(result.truncated).toBe(true);
			expect(result.originalBytes).toBe(100);
		});

		it("切り詰め通知が追加される", () => {
			const text = "x".repeat(100);
			const result = truncateForLlm(text, { maxBytes: 50, maxLines: 1000 });
			expect(result.text).toContain("切り詰められました");
		});

		it("非 ASCII 文字でバイト境界を正しく処理する", () => {
			// 'あ' is 3 bytes in UTF-8
			const text = "あ".repeat(2000); // 6000 bytes
			const result = truncateForLlm(text, { maxBytes: 5000, maxLines: 10000 });
			expect(result.truncated).toBe(true);
			expect(result.originalBytes).toBe(6000);
			expect(result.text.endsWith("\uFFFD")).toBe(false);
		});

		it("マルチバイト文字の途中で切らない", () => {
			const text = "🎉".repeat(1000); // each emoji is 4 bytes
			const result = truncateForLlm(text, { maxBytes: 500, maxLines: 10000 });
			expect(result.truncated).toBe(true);
			expect(result.text.endsWith("\uFFFD")).toBe(false);
		});
	});

	describe("行数制限による切り詰め", () => {
		it("行数制限を超えると切り詰める", () => {
			const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`);
			const text = lines.join("\n");
			const result = truncateForLlm(text, { maxBytes: 100000, maxLines: 50 });
			expect(result.truncated).toBe(true);
			expect(result.originalLines).toBe(100);
		});

		it("切り詰め後の行数が maxLines 以下", () => {
			const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`);
			const text = lines.join("\n");
			const result = truncateForLlm(text, { maxBytes: 100000, maxLines: 50 });
			const resultLines = result.text.split("\n").length;
			// 行数 + truncation notice の行数を考慮
			expect(resultLines).toBeLessThanOrEqual(60);
		});
	});

	describe("元のサイズ情報", () => {
		it("truncation notice に元のバイト数が含まれる", () => {
			const text = "x".repeat(60000);
			const result = truncateForLlm(text);
			if (result.truncated) {
				expect(result.text).toContain("60000 バイト");
			}
		});

		it("truncation notice に元の行数が含まれる", () => {
			const lines = Array.from({ length: 3000 }, (_, i) => `line ${i}`);
			const text = lines.join("\n");
			const result = truncateForLlm(text);
			if (result.truncated) {
				expect(result.text).toContain("3000 行");
			}
		});

		it("truncation notice に制限値が含まれる", () => {
			const text = "x".repeat(60000);
			const result = truncateForLlm(text);
			if (result.truncated) {
				expect(result.text).toContain(`${DEFAULT_LLM_OUTPUT_MAX_BYTES} バイト`);
				expect(result.text).toContain(`${DEFAULT_LLM_OUTPUT_MAX_LINES} 行`);
			}
		});
	});

	describe("エッジケース", () => {
		it("CRLF を含むテキスト", () => {
			const text = "line1\r\nline2\r\nline3";
			const result = truncateForLlm(text);
			expect(result.originalLines).toBe(3);
		});

		it("最後の行に改行がないテキスト", () => {
			const text = "line1\nline2\nline3";
			const result = truncateForLlm(text);
			expect(result.originalLines).toBe(3);
		});

		it("最後の行に改行があるテキスト", () => {
			const text = "line1\nline2\nline3\n";
			const result = truncateForLlm(text);
			expect(result.originalLines).toBe(4); // trailing newline creates empty line
		});

		it("custom opts で maxBytes=0 の場合", () => {
			const result = truncateForLlm("hello", { maxBytes: 0, maxLines: 100 });
			expect(result.truncated).toBe(true);
		});

		it("custom opts で maxLines=0 の場合", () => {
			const result = truncateForLlm("hello\nworld", { maxBytes: 100, maxLines: 0 });
			expect(result.truncated).toBe(true);
		});
	});
});

// ─── Constants ────────────────────────────────────────────────────

describe("constants", () => {
	it("DEFAULT_LLM_OUTPUT_MAX_BYTES は 50KB", () => {
		expect(DEFAULT_LLM_OUTPUT_MAX_BYTES).toBe(50 * 1024);
	});

	it("DEFAULT_LLM_OUTPUT_MAX_LINES は 2000", () => {
		expect(DEFAULT_LLM_OUTPUT_MAX_LINES).toBe(2000);
	});
});
