import { execFile, execFileSync } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";

const execResults = new Map<string, { stdout: string; stderr?: string } | Error>();

function execFileMock(cmd: string, args: string[], opts: unknown, cb: Function) {
	if (typeof opts === "function") cb = opts as Function;
	const key = `${cmd} ${args.join(" ")}`;
	const result = execResults.get(key) ?? new Error(`unexpected execFile: ${key}`);
	if (result instanceof Error) cb(result);
	else cb(null, result.stdout, result.stderr ?? "");
}

vi.mock("node:child_process", () => ({
	execFileSync: vi.fn((cmd: string, args: string[]) => {
		const key = `${cmd} ${args.join(" ")}`;
		if (key === "git rev-parse --show-toplevel") return "/repo\n";
		if (key === "git remote get-url origin") return "git@github.com:Mekann2904/mekann.git\n";
		if (key === "gh --version") return "gh version 2.0.0\n";
		return "";
	}),
	execFile: vi.fn(execFileMock),
}));

const { default: issueExtension } = await import("./extension.js");

function createMockPi() {
	const commands: Record<string, { handler: Function }> = {};
	return {
		registerCommand: vi.fn((name: string, config: { handler: Function }) => { commands[name] = config; }),
		commands,
	};
}

function createMockCtx(confirmResult = true) {
	return {
		cwd: "/repo",
		ui: {
			notify: vi.fn(),
			confirm: vi.fn(() => Promise.resolve(confirmResult)),
		},
	};
}

describe("issue extension", () => {
	beforeEach(() => {
		execResults.clear();
		vi.mocked(execFile).mockClear();
		vi.mocked(execFileSync).mockClear();
	});

	it("registers issue workflow commands", () => {
		const pi = createMockPi();
		issueExtension(pi as any);
		expect(pi.commands.issue).toBeDefined();
		expect(pi.commands["issue-create"]).toBeDefined();
		expect(pi.commands["clean-issue-worktrees"]).toBeDefined();
	});

	it("searches duplicates before creating an issue", async () => {
		const pi = createMockPi();
		issueExtension(pi as any);
		execResults.set("gh issue list --repo Mekann2904/mekann --state open --search New runtime flow --limit 10 --json number,title,labels,url,body", { stdout: "[]" });
		execResults.set("gh issue create --repo Mekann2904/mekann --title New runtime flow --body Body text --json number,title,url", { stdout: JSON.stringify({ number: 99, title: "New runtime flow", url: "https://github.com/Mekann2904/mekann/issues/99" }) });

		const ctx = createMockCtx(true);
		await pi.commands["issue-create"].handler("New runtime flow\n\nBody text", ctx);

		expect(ctx.ui.confirm).toHaveBeenCalledWith("Create GitHub issue?", expect.stringContaining("No open duplicate issues"));
		expect(ctx.ui.notify).toHaveBeenCalledWith("Created issue: https://github.com/Mekann2904/mekann/issues/99", "info");
	});

	it("does not create when duplicate confirmation is declined", async () => {
		const pi = createMockPi();
		issueExtension(pi as any);
		execResults.set("gh issue list --repo Mekann2904/mekann --state open --search Duplicate title --limit 10 --json number,title,labels,url,body", { stdout: JSON.stringify([{ number: 1, title: "Duplicate title", labels: [], url: "https://github.com/Mekann2904/mekann/issues/1", body: "" }]) });

		const ctx = createMockCtx(false);
		await pi.commands["issue-create"].handler("Duplicate title", ctx);

		expect(ctx.ui.confirm).toHaveBeenCalledWith("Potential duplicate issues found", expect.stringContaining("https://github.com/Mekann2904/mekann/issues/1"));
		expect(execFile).not.toHaveBeenCalledWith("gh", expect.arrayContaining(["create"]), expect.anything(), expect.any(Function));
		expect(ctx.ui.notify).toHaveBeenCalledWith("Issue creation canceled.", "info");
	});
});
