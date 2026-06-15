import { execFile } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const { default: prWorkflowExtension, classifyStatus, isCheckRunning, nextInterval } = await import("./index.js");

const PR_VIEW_FIELDS = "mergeStateStatus,mergeable,url,baseRefName,headRefName,statusCheckRollup";

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
		statusCheckRollup: [],
		...overrides,
	});
}

const URL = "https://github.com/Mekann2904/mekann/pull/123";

describe("classifyStatus (pure)", () => {
	it("returns pending when mergeStateStatus is UNKNOWN", () => {
		expect(classifyStatus({ url: URL, mergeStateStatus: "UNKNOWN", mergeable: "UNKNOWN" })).toBe("pending");
	});

	it("returns pending when mergeable is null/undefined", () => {
		expect(classifyStatus({ url: URL, mergeStateStatus: "CLEAN", mergeable: null })).toBe("pending");
	});

	it("returns pending when a check is still in progress", () => {
		expect(
			classifyStatus({
				url: URL,
				mergeStateStatus: "UNSTABLE",
				mergeable: "MERGEABLE",
				statusCheckRollup: [{ __typename: "CheckRun", status: "IN_PROGRESS", conclusion: null }],
			}),
		).toBe("pending");
	});

	it("returns pending when a StatusContext is PENDING", () => {
		expect(
			classifyStatus({
				url: URL,
				mergeStateStatus: "UNSTABLE",
				mergeable: "MERGEABLE",
				statusCheckRollup: [{ __typename: "StatusContext", state: "PENDING" }],
			}),
		).toBe("pending");
	});

	it("returns mergeableUnstable when mergeable but UNSTABLE after checks complete", () => {
		expect(
			classifyStatus({
				url: URL,
				mergeStateStatus: "UNSTABLE",
				mergeable: "MERGEABLE",
				statusCheckRollup: [{ __typename: "CheckRun", status: "COMPLETED", conclusion: "FAILURE" }],
			}),
		).toBe("mergeableUnstable");
	});

	it("returns clean when mergeable and mergeStateStatus is CLEAN", () => {
		expect(classifyStatus({ url: URL, mergeStateStatus: "CLEAN", mergeable: "MERGEABLE", statusCheckRollup: [] })).toBe("clean");
	});

	it("returns blocked when mergeable is false", () => {
		expect(classifyStatus({ url: URL, mergeStateStatus: "CONFLICTING", mergeable: "CONFLICTING" })).toBe("blocked");
	});

	it("returns blocked when mergeStateStatus is DIRTY despite mergeable true", () => {
		expect(classifyStatus({ url: URL, mergeStateStatus: "DIRTY", mergeable: "MERGEABLE", statusCheckRollup: [] })).toBe("blocked");
	});
});

describe("isCheckRunning (pure)", () => {
	it("treats QUEUED/IN_PROGRESS CheckRun as running", () => {
		expect(isCheckRunning({ __typename: "CheckRun", status: "QUEUED", conclusion: null })).toBe(true);
		expect(isCheckRunning({ __typename: "CheckRun", status: "in_progress" })).toBe(true);
	});

	it("treats COMPLETED CheckRun as not running", () => {
		expect(isCheckRunning({ __typename: "CheckRun", status: "COMPLETED", conclusion: "FAILURE" })).toBe(false);
	});

	it("treats PENDING StatusContext as running", () => {
		expect(isCheckRunning({ __typename: "StatusContext", state: "PENDING" })).toBe(true);
		expect(isCheckRunning({ __typename: "StatusContext", state: "SUCCESS" })).toBe(false);
	});
});

describe("nextInterval (pure)", () => {
	it("applies exponential backoff up to the cap", () => {
		expect(nextInterval(15_000, 1.4, 60_000)).toBe(21_000);
		expect(nextInterval(21_000, 1.4, 60_000)).toBe(29_400);
		expect(nextInterval(50_000, 1.4, 60_000)).toBe(60_000);
	});
});

describe("pr-workflow", () => {
	beforeEach(() => {
		execResults.clear();
		vi.mocked(execFile).mockClear();
		vi.useRealTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("registers /pr-check and checks the current branch PR", async () => {
		const pi = createMockPi();
		prWorkflowExtension(pi as any);
		execResults.set(`gh pr view --json ${PR_VIEW_FIELDS}`, { stdout: prJson() });

		const ctx = createMockCtx();
		await pi.commands["pr-check"].handler("", ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("mergeStateStatus=CLEAN"), "info");
	});

	it("checks an explicit PR target", async () => {
		const pi = createMockPi();
		prWorkflowExtension(pi as any);
		execResults.set(`gh pr view 123 --json ${PR_VIEW_FIELDS}`, { stdout: prJson() });

		await pi.commands["pr-check"].handler("123", createMockCtx());

		expect(execFile).toHaveBeenCalledWith("gh", ["pr", "view", "123", "--json", PR_VIEW_FIELDS], { cwd: "/repo" }, expect.any(Function));
	});

	it("reports pending as info (not blocked) when checks are still running", async () => {
		const pi = createMockPi();
		prWorkflowExtension(pi as any);
		execResults.set(
			`gh pr view --json ${PR_VIEW_FIELDS}`,
			{ stdout: prJson({ mergeStateStatus: "UNSTABLE", statusCheckRollup: [{ __typename: "CheckRun", status: "IN_PROGRESS", conclusion: null }] }) },
		);

		const ctx = createMockCtx();
		await pi.commands["pr-check"].handler("", ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("checks still running"), "info");
	});

	it("does not warn or queue a follow-up when UNSTABLE but mergeable after checks complete", async () => {
		const pi = createMockPi();
		prWorkflowExtension(pi as any);
		execResults.set(
			`gh pr view ${URL} --json ${PR_VIEW_FIELDS}`,
			{
				stdout: prJson({
					url: URL,
					mergeStateStatus: "UNSTABLE",
					mergeable: "MERGEABLE",
					statusCheckRollup: [{ __typename: "CheckRun", status: "COMPLETED", conclusion: "FAILURE" }],
				}),
			},
		);

		await pi.handlers["agent_end"]({ messages: [{ content: `Created ${URL}` }] }, createMockCtx());
		await vi.waitFor(() => expect(pi.sendUserMessage).not.toHaveBeenCalled());

		expect(pi.sendUserMessage).not.toHaveBeenCalled();
	});

	it("polls until checks settle to CLEAN, then notifies once as info (no follow-up)", async () => {
		// Real timers with a tiny interval: robust against microtask/timer interleaving.
		vi.stubEnv("MEKANN_PR_WORKFLOW_INITIAL_INTERVAL_MS", "1");
		vi.stubEnv("MEKANN_PR_WORKFLOW_MAX_INTERVAL_MS", "1");
		vi.stubEnv("MEKANN_PR_WORKFLOW_MAX_POLLS", "50");

		const pi = createMockPi();
		prWorkflowExtension(pi as any);

		const running = prJson({
			url: URL,
			mergeStateStatus: "UNSTABLE",
			mergeable: "MERGEABLE",
			statusCheckRollup: [{ __typename: "CheckRun", status: "IN_PROGRESS", conclusion: null }],
		});
		const settled = prJson({ url: URL, mergeStateStatus: "CLEAN", mergeable: "MERGEABLE", statusCheckRollup: [] });
		execResults.set(`gh pr view ${URL} --json ${PR_VIEW_FIELDS}`, { stdout: running });

		const ctx = createMockCtx();
		await pi.handlers["agent_end"]({ messages: [{ content: `Created ${URL}` }] }, ctx);

		// Checks settle to CLEAN on a later poll.
		execResults.set(`gh pr view ${URL} --json ${PR_VIEW_FIELDS}`, { stdout: settled });

		await vi.waitFor(() => expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("mergeStateStatus=CLEAN"), "info"));
		expect(pi.sendUserMessage).not.toHaveBeenCalled();

		vi.unstubAllEnvs();
	});

	it("polls through UNKNOWN then settles to CLEAN without warning", async () => {
		vi.stubEnv("MEKANN_PR_WORKFLOW_INITIAL_INTERVAL_MS", "1");
		vi.stubEnv("MEKANN_PR_WORKFLOW_MAX_INTERVAL_MS", "1");
		vi.stubEnv("MEKANN_PR_WORKFLOW_MAX_POLLS", "50");

		const pi = createMockPi();
		prWorkflowExtension(pi as any);

		execResults.set(`gh pr view ${URL} --json ${PR_VIEW_FIELDS}`, {
			stdout: prJson({ url: URL, mergeStateStatus: "UNKNOWN", mergeable: "UNKNOWN" }),
		});

		const ctx = createMockCtx();
		await pi.handlers["agent_end"]({ messages: [{ content: `Created ${URL}` }] }, ctx);

		execResults.set(`gh pr view ${URL} --json ${PR_VIEW_FIELDS}`, {
			stdout: prJson({ url: URL, mergeStateStatus: "CLEAN", mergeable: "MERGEABLE" }),
		});

		await vi.waitFor(() => expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("mergeStateStatus=CLEAN"), "info"));
		expect(pi.sendUserMessage).not.toHaveBeenCalled();

		vi.unstubAllEnvs();
	});

	it("queues a safe follow-up once when agent_end sees a truly blocked PR URL", async () => {
		const pi = createMockPi();
		prWorkflowExtension(pi as any);
		execResults.set(`gh pr view ${URL} --json ${PR_VIEW_FIELDS}`, {
			stdout: prJson({ url: URL, mergeStateStatus: "CONFLICTING", mergeable: "CONFLICTING" }),
		});

		await pi.handlers["agent_end"]({ messages: [{ content: `Created ${URL}` }] }, createMockCtx());
		await vi.waitFor(() => expect(pi.sendUserMessage).toHaveBeenCalled());

		// Re-mentioning the same URL does not re-trigger (settled).
		await pi.handlers["agent_end"]({ messages: [{ content: `Follow-up mentioned ${URL}` }] }, createMockCtx());

		expect(pi.sendUserMessage).toHaveBeenCalledTimes(1);
		expect(pi.sendUserMessage).toHaveBeenCalledWith(expect.stringContaining("blocked PR merge state"), { deliverAs: "followUp" });
	});

	it("reports info (not warning) when the poll budget is exhausted while still pending", async () => {
		vi.stubEnv("MEKANN_PR_WORKFLOW_INITIAL_INTERVAL_MS", "1");
		vi.stubEnv("MEKANN_PR_WORKFLOW_MAX_INTERVAL_MS", "1");
		vi.stubEnv("MEKANN_PR_WORKFLOW_MAX_POLLS", "3");

		const pi = createMockPi();
		prWorkflowExtension(pi as any);
		execResults.set(`gh pr view ${URL} --json ${PR_VIEW_FIELDS}`, {
			stdout: prJson({ url: URL, mergeStateStatus: "UNSTABLE", mergeable: "MERGEABLE", statusCheckRollup: [{ __typename: "CheckRun", status: "IN_PROGRESS", conclusion: null }] }),
		});

		const ctx = createMockCtx();
		await pi.handlers["agent_end"]({ messages: [{ content: `Created ${URL}` }] }, ctx);

		await vi.waitFor(() => expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("checks still running"), "info"));
		expect(pi.sendUserMessage).not.toHaveBeenCalled();

		vi.unstubAllEnvs();
	});

	it("does not start a duplicate poll for a URL already being polled", async () => {
		// Long interval so a single in-flight poll makes exactly one gh call within the test window.
		vi.stubEnv("MEKANN_PR_WORKFLOW_INITIAL_INTERVAL_MS", "5000");
		vi.stubEnv("MEKANN_PR_WORKFLOW_MAX_INTERVAL_MS", "5000");
		vi.stubEnv("MEKANN_PR_WORKFLOW_MAX_POLLS", "50");

		const pi = createMockPi();
		prWorkflowExtension(pi as any);
		execResults.set(`gh pr view ${URL} --json ${PR_VIEW_FIELDS}`, {
			stdout: prJson({ url: URL, mergeStateStatus: "UNSTABLE", mergeable: "MERGEABLE", statusCheckRollup: [{ __typename: "CheckRun", status: "IN_PROGRESS", conclusion: null }] }),
		});

		const ctx = createMockCtx();
		await pi.handlers["agent_end"]({ messages: [{ content: `Created ${URL}` }] }, ctx);
		// Second mention while the first poll is still in flight (sleeping before its next attempt).
		await pi.handlers["agent_end"]({ messages: [{ content: `Another ${URL}` }] }, ctx);
		// Wait long enough that a duplicate poll, if started, would have fired its own gh call.
		await new Promise((resolve) => setTimeout(resolve, 20));

		// Exactly one gh invocation for this URL: the second agent_end was deduped.
		const urlCalls = vi.mocked(execFile).mock.calls.filter((c) => String(c[1]?.join(" ") ?? "").includes(URL)).length;
		expect(urlCalls).toBe(1);

		vi.unstubAllEnvs();
	});
});
