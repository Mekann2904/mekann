import { describe, it, expect } from "vitest";
import { extractAccountIdFromToken } from "./auth.js";

const CLAIM = "https://api.openai.com/auth";

function makeToken(payload: object): string {
	const header = Buffer.from(JSON.stringify({}), "utf8").toString("base64url");
	const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
	const sig = Buffer.from("sig", "utf8").toString("base64url");
	return `${header}.${body}.${sig}`;
}

describe("extractAccountIdFromToken", () => {
	it("extracts accountId from a valid JWT", () => {
		const token = makeToken({
			[CLAIM]: { chatgpt_account_id: "acct-123" },
		});
		expect(extractAccountIdFromToken(token)).toBe("acct-123");
	});

	it("returns undefined when claim is missing from payload", () => {
		const token = makeToken({ sub: "user-1" });
		expect(extractAccountIdFromToken(token)).toBeUndefined();
	});

	it("returns undefined when accountId is empty string", () => {
		const token = makeToken({
			[CLAIM]: { chatgpt_account_id: "" },
		});
		expect(extractAccountIdFromToken(token)).toBeUndefined();
	});

	it("returns undefined for malformed JWT (not valid base64url)", () => {
		expect(extractAccountIdFromToken("not.a.jwt")).toBeUndefined();
	});

	it("returns undefined for token that is not 3 parts", () => {
		expect(extractAccountIdFromToken("only.one")).toBeUndefined();
		expect(extractAccountIdFromToken("a.b.c.d")).toBeUndefined();
		expect(extractAccountIdFromToken("")).toBeUndefined();
	});

	it("returns undefined when accountId is not a string", () => {
		const token = makeToken({
			[CLAIM]: { chatgpt_account_id: 12345 },
		});
		expect(extractAccountIdFromToken(token)).toBeUndefined();
	});
});
