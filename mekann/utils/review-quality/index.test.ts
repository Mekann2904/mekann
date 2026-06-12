import { execFile } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import reviewQualityExtension, { parseNumstat } from "./index.js";

const execResults = new Map<string, { stdout?: string; stderr?: string } | Error>();
vi.mock("node:child_process", () => ({
	execFile: vi.fn((cmd: string, args: string[], opts: unknown, cb: Function) => {
		const result = execResults.get(`${cmd} ${args.join(" ")}`) ?? { stdout: "" };
		if (result instanceof Error) cb(result, "", result.message);
		else cb(null, result.stdout ?? "", result.stderr ?? "");
	}),
}));

function createMockPi() {
	const commands: Record<string, { handler: Function }> = {};
	const handlers: Record<string, Function> = {};
	return {
		registerCommand: vi.fn((name: string, config: { handler: Function }) => { commands[name] = config; }),
		on: vi.fn((event: string, handler: Function) => { handlers[event] = handler; }),
		commands,
		handlers,
	};
}

function ctx() { return { cwd: "/repo", ui: { notify: vi.fn() } }; }

describe("review-quality", () => {
	beforeEach(() => { execResults.clear(); vi.mocked(execFile).mockClear(); });

	it("parses git numstat", () => {
		expect(parseNumstat("10\t2\ta.ts\n-\t-\timage.png\n")).toMatchObject({ files: 2, added: 10, deleted: 2, total: 12 });
	});

	it("registers /review-quality and reports small diffs", async () => {
		const pi = createMockPi();
		reviewQualityExtension(pi as any);
		execResults.set("git merge-base HEAD origin/HEAD", { stdout: "base\n" });
		execResults.set("git diff --numstat base...HEAD", { stdout: "10\t2\ta.ts\n" });
		execResults.set("git diff --numstat HEAD", { stdout: "" });
		const c = ctx();

		await pi.commands["review-quality"].handler("", c);

		expect(c.ui.notify).toHaveBeenCalledWith(expect.stringContaining("+10/-2"), "info");
	});

	it("suggests strict review once per diff signature on agent_end", async () => {
		const pi = createMockPi();
		reviewQualityExtension(pi as any);
		execResults.set("git merge-base HEAD origin/HEAD", { stdout: "base\n" });
		execResults.set("git diff --numstat base...HEAD", { stdout: "500\t1\ta.ts\n" });
		execResults.set("git diff --numstat HEAD", { stdout: "" });
		const c = ctx();

		await pi.handlers.agent_end({}, c);
		await pi.handlers.agent_end({}, c);

		expect(c.ui.notify).toHaveBeenCalledTimes(1);
		expect(c.ui.notify).toHaveBeenCalledWith(expect.stringContaining("thermo-nuclear-code-quality-review"), "warning");
	});
});
