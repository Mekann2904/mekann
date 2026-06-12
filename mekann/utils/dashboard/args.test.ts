import { describe, expect, it } from "vitest";
import { parseDashboardArgs } from "./args.js";

describe("parseDashboardArgs", () => {
	it("uses cwd from PWD and text mode by default", () => {
		expect(parseDashboardArgs([], { PWD: "/repo" } as NodeJS.ProcessEnv)).toEqual({ ok: true, value: { cwd: "/repo", refresh: false, avatar: true, images: true, interactive: false } });
	});

	it("parses supported options", () => {
		expect(parseDashboardArgs(["--cwd", "/tmp/project", "--refresh", "--no-avatar", "--no-images"], {} as NodeJS.ProcessEnv)).toEqual({ ok: true, value: { cwd: "/tmp/project", refresh: true, avatar: false, images: false, interactive: false } });
	});

	it("can disable images from the environment", () => {
		expect(parseDashboardArgs([], { MEKANN_DASHBOARD_IMAGES: "0" } as NodeJS.ProcessEnv)).toEqual({ ok: true, value: { cwd: process.cwd(), refresh: false, avatar: true, images: false, interactive: false } });
	});

	it("can force text mode", () => {
		expect(parseDashboardArgs(["--text"], { MEKANN_DASHBOARD_INTERACTIVE: "1" } as NodeJS.ProcessEnv)).toEqual({ ok: true, value: { cwd: process.cwd(), refresh: false, avatar: false, images: false, interactive: false } });
	});

	it("rejects removed interactive mode", () => {
		expect(parseDashboardArgs(["--interactive"], {} as NodeJS.ProcessEnv)).toEqual({ ok: false, error: "Interactive mode has been removed. Use /dashboard in Pi, or run mekann-dashboard for text output." });
	});

	it("rejects unknown options", () => {
		expect(parseDashboardArgs(["--tab", "overview"], {} as NodeJS.ProcessEnv).ok).toBe(false);
	});
});
