import { describe, expect, it } from "vitest";
import { isBashCommandAllowed, normalizeBashCommand, parseBashAllowlist } from "../bashPolicy.js";

describe("bash policy helpers", () => {
	it("parses newline allowlist", () => {
		expect(parseBashAllowlist("npm test\n\n npm run typecheck ")).toEqual(["npm test", "npm run typecheck"]);
	});

	it("normalizes whitespace", () => {
		expect(normalizeBashCommand(" npm   test\n")).toBe("npm test");
	});

	it("allows exact commands after normalization", () => {
		expect(isBashCommandAllowed("npm   test", ["npm test"])).toBe(true);
		expect(isBashCommandAllowed("npm test -- --watch", ["npm test"])).toBe(false);
	});

});
