import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import verifyExtension, { selectVerifyScripts } from "./index.js";

const execResults = new Map<string, { stdout?: string; stderr?: string } | Error>();

vi.mock("node:child_process", () => ({
	execFile: vi.fn((cmd: string, args: string[], opts: unknown, cb: Function) => {
		if (typeof opts === "function") cb = opts as Function;
		const key = `${cmd} ${args.join(" ")}`;
		const result = execResults.get(key) ?? { stdout: "ok\n" };
		if (result instanceof Error) cb(result, "", "");
		else cb(null, result.stdout ?? "", result.stderr ?? "");
	}),
}));

function createMockPi() {
	const commands: Record<string, { handler: Function }> = {};
	return {
		registerCommand: vi.fn((name: string, config: { handler: Function }) => { commands[name] = config; }),
		commands,
	};
}

function createProject(scripts: Record<string, string>): string {
	const dir = mkdtempSync(path.join(tmpdir(), "mekann-verify-"));
	writeFileSync(path.join(dir, "package.json"), JSON.stringify({ scripts }));
	return dir;
}

describe("verify", () => {
	beforeEach(() => {
		execResults.clear();
		vi.mocked(execFile).mockClear();
	});

	it("selects the cheapest standard quick script", () => {
		expect(selectVerifyScripts({ test: "vitest", typecheck: "tsc", "typecheck:prod": "tsc -p tsconfig.prod.json" }, "quick")).toEqual({ selected: ["typecheck:prod"], missing: [] });
		expect(selectVerifyScripts({ test: "vitest" }, "quick")).toEqual({ selected: ["test"], missing: [] });
	});

	it("reports missing standard scripts in full mode, symmetric with explicit mode", () => {
		expect(selectVerifyScripts({ test: "vitest" }, "full")).toEqual({ selected: ["test"], missing: ["typecheck:prod", "typecheck"] });
		expect(selectVerifyScripts({ test: "vitest", typecheck: "tsc", "typecheck:prod": "tsc -p tsconfig.prod.json" }, "full")).toEqual({ selected: ["typecheck:prod", "typecheck", "test"], missing: [] });
	});

	it("reports missing explicitly requested scripts", async () => {
		const dir = createProject({ test: "vitest" });
		try {
			const pi = createMockPi();
			verifyExtension(pi as any);
			const ctx = { cwd: dir, ui: { notify: vi.fn() } };

			await pi.commands.verify.handler("test lint", ctx);

			expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("MISSING: lint"), "error");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("reports missing standard scripts during full mode partial runs", async () => {
		const dir = createProject({ test: "vitest" });
		try {
			const pi = createMockPi();
			verifyExtension(pi as any);
			const ctx = { cwd: dir, ui: { notify: vi.fn() } };

			await pi.commands.verify.handler("full", ctx);

			expect(execFile).toHaveBeenCalledWith("npm", ["run", "test"], expect.objectContaining({ cwd: dir }), expect.any(Function));
			expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("MISSING: typecheck:prod"), "error");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("registers /verify and reports passing commands", async () => {
		const dir = createProject({ "typecheck:prod": "tsc -p tsconfig.prod.json" });
		try {
			const pi = createMockPi();
			verifyExtension(pi as any);
			const ctx = { cwd: dir, ui: { notify: vi.fn() } };

			await pi.commands.verify.handler("", ctx);

			expect(execFile).toHaveBeenCalledWith("npm", ["run", "typecheck:prod"], expect.objectContaining({ cwd: dir }), expect.any(Function));
			expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("PASS: npm run typecheck:prod"), "info");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("reports failing commands", async () => {
		const dir = createProject({ test: "vitest" });
		try {
			execResults.set("npm run test", Object.assign(new Error("boom"), { output: "failed" }));
			const pi = createMockPi();
			verifyExtension(pi as any);
			const ctx = { cwd: dir, ui: { notify: vi.fn() } };

			await pi.commands.verify.handler("test", ctx);

			expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("FAIL: npm run test"), "error");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
