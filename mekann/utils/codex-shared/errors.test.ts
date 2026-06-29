import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
	CodexError,
	classifyError,
	classifyHttpStatus,
	classifyEventErrorMessage,
	isAuthError,
	isModelAvailabilityError,
	isOverloadedError,
	redactCodexErrorBody,
} from "./errors.js";

describe("CodexError", () => {
	it("sets kind, message, and status", () => {
		const err = new CodexError("auth", "bad token", 401);
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(CodexError);
		expect(err.name).toBe("CodexError");
		expect(err.kind).toBe("auth");
		expect(err.message).toBe("bad token");
		expect(err.status).toBe(401);
	});

	it("status is undefined when omitted", () => {
		const err = new CodexError("unknown", "oops");
		expect(err.status).toBeUndefined();
	});
});

describe("classifyError", () => {
	it("returns kind for CodexError", () => {
		const err = new CodexError("rate_limit", "slow down", 429);
		expect(classifyError(err)).toBe("rate_limit");
	});

	it("AbortError → timeout", () => {
		const abortErr = new Error("aborted");
		abortErr.name = "AbortError";
		expect(classifyError(abortErr)).toBe("timeout");
	});

	it("TimeoutError → timeout", () => {
		const timeoutErr = new Error("timed out");
		timeoutErr.name = "TimeoutError";
		expect(classifyError(timeoutErr)).toBe("timeout");
	});

	it("other errors → unknown", () => {
		expect(classifyError(new Error("random"))).toBe("unknown");
		expect(classifyError("string")).toBe("unknown");
		expect(classifyError(null)).toBe("unknown");
	});
});

describe("classifyHttpStatus", () => {
	it("401 → auth", () => expect(classifyHttpStatus(401)).toBe("auth"));
	it("403 → auth", () => expect(classifyHttpStatus(403)).toBe("auth"));
	it("429 → rate_limit", () => expect(classifyHttpStatus(429)).toBe("rate_limit"));
	it("500 → transport", () => expect(classifyHttpStatus(500)).toBe("transport"));
	it("404 → transport", () => expect(classifyHttpStatus(404)).toBe("transport"));
	it("503 → overloaded", () => expect(classifyHttpStatus(503)).toBe("overloaded"));
});

describe("classifyEventErrorMessage", () => {
	it("rate limit patterns", () => {
		expect(classifyEventErrorMessage("Rate limit exceeded")).toBe("rate_limit");
		expect(classifyEventErrorMessage("rate-limit hit")).toBe("rate_limit");
		expect(classifyEventErrorMessage("Too many requests")).toBe("rate_limit");
		expect(classifyEventErrorMessage("Quota exceeded")).toBe("rate_limit");
		expect(classifyEventErrorMessage("Error 429")).toBe("rate_limit");
	});

	it("auth patterns", () => {
		expect(classifyEventErrorMessage("Unauthorized access")).toBe("auth");
		expect(classifyEventErrorMessage("unauthorised")).toBe("auth");
		expect(classifyEventErrorMessage("Forbidden")).toBe("auth");
		expect(classifyEventErrorMessage("authentication failed")).toBe("auth");
		expect(classifyEventErrorMessage("Error 401")).toBe("auth");
		expect(classifyEventErrorMessage("Error 403")).toBe("auth");
	});

	it("timeout patterns", () => {
		expect(classifyEventErrorMessage("Request timeout")).toBe("timeout");
		expect(classifyEventErrorMessage("timed out")).toBe("timeout");
	});

	it("transport patterns", () => {
		expect(classifyEventErrorMessage("network error")).toBe("transport");
		expect(classifyEventErrorMessage("connection lost")).toBe("transport");
		expect(classifyEventErrorMessage("disconnected")).toBe("transport");
		expect(classifyEventErrorMessage("transport failure")).toBe("transport");
		expect(classifyEventErrorMessage("fetch failed")).toBe("transport");
	});

	it("unrecognized → unknown", () => {
		expect(classifyEventErrorMessage("something else")).toBe("unknown");
	});

	it("overloaded patterns", () => {
		expect(classifyEventErrorMessage("server_is_overloaded")).toBe("overloaded");
		expect(classifyEventErrorMessage("Server is overloaded")).toBe("overloaded");
		expect(classifyEventErrorMessage("service_unavailable_error")).toBe("overloaded");
		expect(classifyEventErrorMessage("Service Unavailable")).toBe("overloaded");
		expect(classifyEventErrorMessage("Our servers are currently overloaded")).toBe("overloaded");
		expect(classifyEventErrorMessage("slow_down")).toBe("overloaded");
	});
});

describe("isAuthError", () => {
	it("returns true for auth CodexError", () => {
		expect(isAuthError(new CodexError("auth", "bad", 401))).toBe(true);
	});

	it("returns false for non-auth CodexError", () => {
		expect(isAuthError(new CodexError("transport", "fail", 500))).toBe(false);
	});

	it("returns false for non-CodexError", () => {
		expect(isAuthError(new Error("auth"))).toBe(false);
		expect(isAuthError(null)).toBe(false);
	});
});

describe("isModelAvailabilityError", () => {
	it("returns true for model_not_found (underscore)", () => {
		expect(isModelAvailabilityError(new CodexError("unknown", "model_not_found"))).toBe(true);
	});

	it("returns true for unsupported_model (underscore)", () => {
		expect(isModelAvailabilityError(new CodexError("unknown", "unsupported_model"))).toBe(true);
	});

	it("returns true for 'model not found' (space)", () => {
		expect(isModelAvailabilityError(new CodexError("unknown", "model not found"))).toBe(true);
	});

	it("returns true for 'unsupported model' (space)", () => {
		expect(isModelAvailabilityError(new CodexError("unknown", "unsupported model"))).toBe(true);
	});

	it("returns false for unrelated CodexError", () => {
		expect(isModelAvailabilityError(new CodexError("auth", "bad token"))).toBe(false);
	});

	it("returns false for non-CodexError", () => {
		expect(isModelAvailabilityError(new Error("model_not_found"))).toBe(false);
	});
});

describe("isOverloadedError", () => {
	it("returns true for overloaded CodexError", () => {
		expect(isOverloadedError(new CodexError("overloaded", "server_is_overloaded"))).toBe(true);
	});

	it("returns false for non-overloaded CodexError", () => {
		expect(isOverloadedError(new CodexError("transport", "fail", 500))).toBe(false);
		expect(isOverloadedError(new CodexError("rate_limit", "slow", 429))).toBe(false);
	});

	it("returns false for non-CodexError", () => {
		expect(isOverloadedError(new Error("overloaded"))).toBe(false);
		expect(isOverloadedError(null)).toBe(false);
	});
});

describe("CodexError.debugBody (IC-225)", () => {
	it("debugBody is undefined when omitted", () => {
		const err = new CodexError("auth", "bad token", 401);
		expect(err.debugBody).toBeUndefined();
	});

	it("preserves debugBody when provided", () => {
		const err = new CodexError("transport", "fail", 502, "full body");
		expect(err.debugBody).toBe("full body");
	});
});

describe("redactCodexErrorBody (IC-225 / IC-218)", () => {
	const ORIGINAL_PI_CODEX_DEBUG = process.env.PI_CODEX_DEBUG;
	const ORIGINAL_CODEX_DEBUG = process.env.CODEX_DEBUG;

	beforeEach(() => {
		delete process.env.PI_CODEX_DEBUG;
		delete process.env.CODEX_DEBUG;
	});

	afterEach(() => {
		if (ORIGINAL_PI_CODEX_DEBUG !== undefined) process.env.PI_CODEX_DEBUG = ORIGINAL_PI_CODEX_DEBUG;
		else delete process.env.PI_CODEX_DEBUG;
		if (ORIGINAL_CODEX_DEBUG !== undefined) process.env.CODEX_DEBUG = ORIGINAL_CODEX_DEBUG;
		else delete process.env.CODEX_DEBUG;
	});

	it("masks Authorization Bearer tokens in the preview", () => {
		const body = "Authorization: Bearer eyJhbGc.secret.jwt echoed back";
		const { message } = redactCodexErrorBody(body);
		expect(message).toContain("[REDACTED]");
		expect(message).not.toContain("eyJhbGc.secret.jwt");
	});

	it("masks the specific accountId value when provided", () => {
		const accountId = "acct-1234-5678";
		const body = `chatgpt-account-id ${accountId} was rejected`;
		const { message } = redactCodexErrorBody(body, { accountId });
		expect(message).not.toContain(accountId);
		expect(message).toContain("[REDACTED_ACCOUNT_ID]");
	});

	it("masks API keys and OpenAI keys", () => {
		const body = "error: sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456 invalid";
		const { message } = redactCodexErrorBody(body);
		expect(message).not.toContain("sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456");
		expect(message).toContain("[REDACTED_OPENAI_KEY]");
	});

	it("truncates the preview but preserves model_not_found detection substrings", () => {
		const body = `{"error":{"code":"model_not_found","message":"The model does not exist","type":"invalid_request_error"}}`;
		const { message } = redactCodexErrorBody(body);
		expect(message.length).toBeLessThanOrEqual(300);
		expect(message).toContain("model_not_found");
	});

	it("discards the full body unless PI_CODEX_DEBUG is set", () => {
		const body = "x".repeat(500);
		expect(redactCodexErrorBody(body).debugBody).toBeUndefined();
		process.env.PI_CODEX_DEBUG = "1";
		expect(redactCodexErrorBody(body).debugBody).toBe(body);
	});

	it("debugBody is also redacted, not raw", () => {
		process.env.CODEX_DEBUG = "1";
		const body = "Authorization: Bearer secret.jwt.value";
		const { debugBody } = redactCodexErrorBody(body);
		expect(debugBody).toContain("[REDACTED]");
		expect(debugBody).not.toContain("secret.jwt.value");
	});
});
