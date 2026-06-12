import { describe, expect, it } from "vitest";
import { redactSecrets, SECRET_REDACTION_PATTERNS } from "./redact.js";

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

	it("redacts x-api-key header", () => {
		expect(redactSecrets("x-api-key: mysecret123").text).toBe("x-api-key: [REDACTED]");
	});

	it("redacts api_key header with equals", () => {
		expect(redactSecrets("api_key=mysecret123").text).toBe("api_key=[REDACTED]");
	});

	it("redacts AWS access key id", () => {
		expect(redactSecrets("key=AKIAIOSFODNN7EXAMPLE").text).toBe("key=[REDACTED_AWS_ACCESS_KEY]");
	});

	it("redacts GitHub PAT (ghp_)", () => {
		expect(redactSecrets("token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcd").text).toBe("token [REDACTED_GITHUB_TOKEN]");
	});

	it("redacts GitHub fine-grained PAT", () => {
		expect(redactSecrets("github_pat_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij1234").text).toBe("[REDACTED_GITHUB_TOKEN]");
	});

	it("redacts OpenAI key", () => {
		expect(redactSecrets("sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456").text).toBe("[REDACTED_OPENAI_KEY]");
	});

	it("redacts Anthropic key", () => {
		// sk-ant- keys are matched by anthropic pattern since it runs after openai pattern replaces
		const result = redactSecrets("sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890xyz_longenough");
		expect(result.text).toMatch(/REDACTED/);
		expect(result.redacted).toBe(true);
	});

	it("redacts PASSWORD env var", () => {
		expect(redactSecrets("DATABASE_PASSWORD=supersecret").text).toBe("DATABASE_PASSWORD=[REDACTED]");
	});

	it("redacts SECRET env var", () => {
		expect(redactSecrets("APP_SECRET=mysecret").text).toBe("APP_SECRET=[REDACTED]");
	});

	it("redacts ACCESS_KEY env var", () => {
		expect(redactSecrets("AWS_ACCESS_KEY_ID=AKIA123").text).toBe("AWS_ACCESS_KEY_ID=[REDACTED]");
	});

	it("reports redacted=true when secrets are found", () => {
		expect(redactSecrets("Authorization: Bearer xyz").redacted).toBe(true);
	});

	it("SECRET_REDACTION_PATTERNS has expected entries", () => {
		expect(SECRET_REDACTION_PATTERNS.length).toBeGreaterThanOrEqual(8);
		const names = SECRET_REDACTION_PATTERNS.map((p) => p.name);
		expect(names).toContain("authorization-bearer");
		expect(names).toContain("aws-access-key-id");
		expect(names).toContain("github-token");
		expect(names).toContain("openai-key");
		expect(names).toContain("anthropic-key");
		expect(names).toContain("env-secret");
	});

	it("handles empty string", () => {
		expect(redactSecrets("")).toEqual({ text: "", redacted: false });
	});

	it("handles multiple secrets in one string", () => {
		const out = redactSecrets("Authorization: Bearer tok1\napi_key=key1\npassword=hunter2").text;
		expect(out).toContain("Bearer [REDACTED]");
		expect(out).toContain("api_key=[REDACTED]");
		expect(out).toContain("password=[REDACTED]");
	});
});
