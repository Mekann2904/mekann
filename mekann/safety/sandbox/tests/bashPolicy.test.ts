import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appendWorkspaceBashAllowlistCommand, getBashAllowlist, getBashMode, isBashCommandAllowed, normalizeBashCommand, parseBashAllowlist, setWorkspaceBashMode } from "../bashPolicy.js";
import { getWorkspaceMekannSettingsPath, invalidateSettingsCache } from "../../../settings/store.js";

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

	it("returns configured bash mode and falls back for invalid values", () => {
		const cwd = mkdtempSync(join(tmpdir(), "bash-policy-"));
		setWorkspaceBashMode(cwd, "ask");
		expect(getBashMode(cwd)).toBe("ask");

		writeFileSync(join(cwd, ".pi", "mekann.json"), JSON.stringify({ version: 1, features: { sandbox: { bashMode: "invalid" } } }));
		// The settings store caches reads for the process. This raw write bypasses
		// saveSettingsChecked, so drop the cached entry to make the next read pick
		// up the out-of-band "invalid" value (mirrors a manual edit + reload).
		invalidateSettingsCache(getWorkspaceMekannSettingsPath(cwd));
		expect(getBashMode(cwd)).toBe("sandboxed");
	});

	it("persists unique normalized allowlist commands", () => {
		const cwd = mkdtempSync(join(tmpdir(), "bash-allowlist-"));
		appendWorkspaceBashAllowlistCommand(cwd, " npm   test ");
		appendWorkspaceBashAllowlistCommand(cwd, "npm test");

		expect(getBashAllowlist(cwd)).toEqual(["npm test"]);
		expect(readFileSync(join(cwd, ".pi", "mekann.json"), "utf8")).toContain("npm test");
	});
});
