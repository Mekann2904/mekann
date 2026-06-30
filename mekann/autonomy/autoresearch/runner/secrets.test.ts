/**
 * runner/secrets.test.ts — redactText (秘密情報マスク) の focused test。
 * {@link "./secrets.js"} を直接 import して単体検証する。
 */
import { describe, expect, it } from "vitest";
import { redactText } from "./secrets.js";

describe("redactText", () => {
	it("leaves benign text unchanged", () => {
		const text = "build started, exit code 0";
		expect(redactText(text)).toBe(text);
	});

	it("redacts AWS access key ids", () => {
		const out = redactText("creds: AKIA" + "IOSFODNN7EXAMPLE");
		expect(out).toContain("[REDACTED_AWS_ACCESS_KEY]");
		expect(out).not.toContain("AKIAIOSFODNN7EXAMPLE");
	});

	it("redacts OpenAI-style keys", () => {
		const out = redactText("key=sk-" + "abcdefghijklmnopqrstuvwxyz123456");
		expect(out).toContain("[REDACTED_OPENAI_KEY]");
	});

	it("redacts GitHub tokens", () => {
		const out = redactText("token ghp_" + "01234567890123456789abc");
		expect(out).toContain("[REDACTED_GITHUB_TOKEN]");
	});

	it("always returns a string", () => {
		expect(typeof redactText("")).toBe("string");
	});
});
