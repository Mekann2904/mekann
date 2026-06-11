import { execFile } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";

const execResults = new Map<string, { stdout: string; stderr?: string } | Error>();

vi.mock("node:child_process", () => ({
	execFile: vi.fn((cmd: string, args: string[], opts: unknown, cb: Function) => {
		if (typeof opts === "function") cb = opts as Function;
		const key = `${cmd} ${args.join(" ")}`;
		const result = execResults.get(key) ?? new Error(`unexpected execFile: ${key}`);
		if (result instanceof Error) cb(result);
		else cb(null, result.stdout, result.stderr ?? "");
	}),
}));

const { default: prWorkflowExtension } = await import("./index.js");

function createMockPi() {
	const commands: Record<string, { handler: Function }> = {};
	const handlers: Record<string, Function> = {};
	return {
		registerCommand: vi.fn((name: string, config: { handler: Function }) => {
			commands[name] = config;
		}),
		on: vi.fn((event: string, handler: Function) => {
			handlers[event] = handler;
		}),
		sendUserMessage: vi.fn(),
		commands,
		handlers,
	};
}

function createMockCtx() {
	return {
		cwd: "/repo",
		ui: { notify: vi.fn() },
	};
}

function prJson(overrides: Record<string, unknown> = {}) {
	return JSON.stringify({
		url: "https://github.com/Mekann2904/mekann/pull/123",
		mergeStateStatus: "CLEAN",
		mergeable: "MERGEABLE",
		baseRefName: "main",
		headRefName: "issue-15",
		...overrides,
	});
}

describe("pr-workflow", () => {
	beforeEach(() => {
		execResults.clear();
		vi.mocked(execFile).mockClear();
	});

	it("registers /pr-check and checks the current branch PR", async () => {
		const pi = createMockPi();
		prWorkflowExtension(pi as any);
		execResults.set("gh pr view --json mergeStateStatus,mergeable,url,baseRefName,headRefName", { stdout: prJson() });

		const ctx = createMockCtx();
		await pi.commands["pr-check"].handler("", ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("mergeStateStatus=CLEAN"), "info");
	});

	it("checks an explicit PR target", async () => {
		const pi = createMockPi();
		prWorkflowExtension(pi as any);
		execResults.set("gh pr view 123 --json mergeStateStatus,mergeable,url,baseRefName,headRefName", { stdout: prJson() });

		await pi.commands["pr-check"].handler("123", createMockCtx());

		expect(execFile).toHaveBeenCalledWith("gh", ["pr", "view", "123", "--json", "mergeStateStatus,mergeable,url,baseRefName,headRefName"], { cwd: "/repo" }, expect.any(Function));
	});

	it("queues a safe follow-up once when agent_end sees a blocked PR URL", async () => {
		const pi = createMockPi();
		prWorkflowExtension(pi as any);
		const url = "https://github.com/Mekann2904/mekann/pull/123";
		execResults.set(`gh pr view ${url} --json mergeStateStatus,mergeable,url,baseRefName,headRefName`, { stdout: prJson({ mergeStateStatus: "CONFLICTING", mergeable: "CONFLICTING" }) });

		await pi.handlers["agent_end"]({ messages: [{ content: `Created ${url}` }] }, createMockCtx());
		await pi.handlers["agent_end"]({ messages: [{ content: `Follow-up mentioned ${url}` }] }, createMockCtx());

		expect(pi.sendUserMessage).toHaveBeenCalledTimes(1);
		expect(pi.sendUserMessage).toHaveBeenCalledWith(expect.stringContaining("blocked or inconclusive PR merge state"), { deliverAs: "followUp" });
	});
});
