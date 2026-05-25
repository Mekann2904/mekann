import { describe, expect, it } from "vitest";
import { parseDashboardArgs } from "./args.js";

describe("parseDashboardArgs", () => {
	it("uses cwd from PWD by default", () => {
		expect(parseDashboardArgs([], { PWD: "/repo" } as NodeJS.ProcessEnv)).toEqual({ ok: true, value: { cwd: "/repo", refresh: false, avatar: true } });
	});

	it("parses supported options", () => {
		expect(parseDashboardArgs(["--cwd", "/tmp/project", "--refresh", "--no-avatar"], {} as NodeJS.ProcessEnv)).toEqual({ ok: true, value: { cwd: "/tmp/project", refresh: true, avatar: false } });
	});

	it("rejects unknown options", () => {
		expect(parseDashboardArgs(["--tab", "overview"], {} as NodeJS.ProcessEnv).ok).toBe(false);
	});
});
