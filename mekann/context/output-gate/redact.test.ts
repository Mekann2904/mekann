import { describe, expect, it } from "vitest";
import { redactSecrets } from "./redact.js";

describe("redactSecrets", () => {
	it("redacts Authorization Bearer", () => {
		expect(redactSecrets("Authorization: Bearer abc.def.ghi").text).toBe("Authorization: Bearer [REDACTED]");
	});

	it("redacts OPENAI_API_KEY style env vars", () => {
		expect(redactSecrets("OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz").text).toBe("OPENAI_API_KEY=[REDACTED]");
	});

	it("redacts token/password/secret query style values", () => {
		const out = redactSecrets("url?token=abc&password=hunter2 secret=value").text;
		expect(out).toContain("token=[REDACTED]");
		expect(out).toContain("password=[REDACTED]");
		expect(out).toContain("secret=[REDACTED]");
	});

	it("preserves non-secret normal text", () => {
		expect(redactSecrets("hello world api docs")).toEqual({ text: "hello world api docs", redacted: false });
	});
});
