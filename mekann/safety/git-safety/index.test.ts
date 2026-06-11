import { beforeEach, describe, expect, it, vi } from "vitest";
import gitSafetyExtension, { classifyGitSafetyCommand } from "./index.js";

function createMockPi() {
	const handlers: Record<string, Function> = {};
	return {
		on: vi.fn((event: string, handler: Function) => {
			handlers[event] = handler;
		}),
		handlers,
	};
}

function createToolCall(command: string) {
	return { toolName: "bash", input: { command } };
}

describe("git-safety", () => {
	beforeEach(() => vi.clearAllMocks());

	it.each([
		"git push origin issue-15",
		"git push --force-with-lease",
		"git reset --hard HEAD",
		"git clean -fd",
		"git branch -D old-branch",
		"git rebase main",
		"gh pr merge 1",
		"gh pr close 1",
		"gh issue close 15",
		"gh pr create --title x",
		"gh issue create --title x",
	])("classifies mutating command: %s", (command) => {
		expect(classifyGitSafetyCommand(command)).toBeDefined();
	});

	it.each([
		"git status --short",
		"git log --oneline -5",
		"gh pr view 1 --json mergeStateStatus",
		"gh issue view 15 --json title",
	])("does not classify read-only command: %s", (command) => {
		expect(classifyGitSafetyCommand(command)).toBeUndefined();
	});

	it("blocks a mutating command when confirmation is denied", async () => {
		const pi = createMockPi();
		gitSafetyExtension(pi as any);
		const ctx = { ui: { confirm: vi.fn(() => Promise.resolve(false)) } };

		const result = await pi.handlers["tool_call"](createToolCall("git push origin issue-15"), ctx);

		expect(ctx.ui.confirm).toHaveBeenCalledWith("Git safety confirmation", expect.stringContaining("git push"));
		expect(result).toMatchObject({ block: true });
	});

	it("allows a mutating command when confirmation is granted", async () => {
		const pi = createMockPi();
		gitSafetyExtension(pi as any);
		const ctx = { ui: { confirm: vi.fn(() => Promise.resolve(true)) } };

		const result = await pi.handlers["tool_call"](createToolCall("gh pr create --title x"), ctx);

		expect(result).toBeUndefined();
	});
});
