/**
 * Tests for launchPiSessionInKittySplit — specifically the env markers it injects
 * into the `kitten @ launch` args. git/gh are not involved; we capture the args
 * passed to execFile by mocking node:child_process and the Kitty control lookup.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecFileCb, mockAnchor } = vi.hoisted(() => ({
	mockExecFileCb: vi.fn(),
	// Mutable so individual tests can simulate an existing Issue Pi pane without
	// re-declaring the module mock. `undefined` models the first /issue call.
	mockAnchor: { value: undefined as { windowId: number; location: "vsplit" | "hsplit" } | undefined },
}));

vi.mock("node:child_process", () => ({ execFile: mockExecFileCb }));

vi.mock("./kitty/control.js", () => ({
	// No existing Issue Pi pane → no --source-window anchor (first-launch path),
	// unless a test sets mockAnchor.value to simulate a later /issue call.
	KittyControl: class MockKittyControl {
		findIssuePaneSplitAnchor() {
			return Promise.resolve(mockAnchor.value);
		}
	},
}));

let kittenLaunchArgs: string[] | null = null;

function defaultExecFile(cmd: string, args: string[], _opts: unknown, cb: (err: unknown, r: { stdout: string; stderr: string }) => void): void {
	if (cmd === "which") {
		cb(null, { stdout: `/usr/bin/${args[0]}\n`, stderr: "" });
		return;
	}
	if (cmd === "kitten" && args[0] === "@" && args[1] === "launch") {
		kittenLaunchArgs = args;
		cb(null, { stdout: "window-42\n", stderr: "" });
		return;
	}
	cb(null, { stdout: "", stderr: "" });
}

beforeEach(() => {
	kittenLaunchArgs = null;
	mockAnchor.value = undefined;
	mockExecFileCb.mockImplementation(defaultExecFile as never);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("launchPiSessionInKittySplit issue-work Pi marker", () => {
	it("marks every launched session with ISSUE_PI_ENV=1 (ADR-0023)", async () => {
		const { launchPiSessionInKittySplit, ISSUE_PI_ENV } = await import("./pi-session.js");
		await launchPiSessionInKittySplit({ cwd: "/repo", title: "Issue #42" });
		expect(kittenLaunchArgs).not.toBeNull();
		expect(ISSUE_PI_ENV).toBe("MEKANN_ISSUE_PI");
		expect(kittenLaunchArgs).toContain(`MEKANN_ISSUE_PI=1`);
		// The value is pushed via kitty's --env flag, not just present as a stray token.
		const envIdx = kittenLaunchArgs!.indexOf("--env");
		expect(envIdx).toBeGreaterThanOrEqual(0);
		expect(kittenLaunchArgs![envIdx + 1]).toBe("MEKANN_ISSUE_PI=1");
	});

	it("still propagates orchestration markers when provided", async () => {
		const { launchPiSessionInKittySplit } = await import("./pi-session.js");
		await launchPiSessionInKittySplit({
			cwd: "/repo",
			title: "Issue #7",
			orchestrationParent: 1,
			orchestrationChild: 7,
		});
		expect(kittenLaunchArgs).toContain("MEKANN_ISSUE_PI=1");
		expect(kittenLaunchArgs).toContain("MEKANN_ORCHESTRATION_PARENT=1");
		expect(kittenLaunchArgs).toContain("MEKANN_ORCHESTRATION_CHILD=7");
	});
});

describe("launchPiSessionInKittySplit argv construction (no shell re-parse)", () => {
	it("passes node + pi argv as separate tokens after the kitty flags, with no `sh -lc` wrapper", async () => {
		// Regression: the launcher used to build one `sh -lc "..."` command string
		// from JSON.stringify-quoted tokens. JSON.stringify's double quotes do NOT
		// escape backticks, so a system prompt containing markdown code-fence
		// examples like `demote_to_ready_for_human` was re-parsed by the shell as a
		// command substitution, aborted with `command not found` / `unmatched '`,
		// and pi never started. The fix passes every content token as its own argv
		// entry so `kitten @ launch` execs node directly with no shell in between.
		const { launchPiSessionInKittySplit } = await import("./pi-session.js");
		await launchPiSessionInKittySplit({
			cwd: "/repo",
			title: "Issue #42",
			nodeBin: "/usr/bin/node",
			appendSystemPrompt: "You are working in an issue worktree for #42.",
			initialMessage: "issue-42に対応してください",
		});
		expect(kittenLaunchArgs).not.toBeNull();
		const args = kittenLaunchArgs!;
		// No shell wrapper: kitten must exec node + pi argv directly.
		expect(args).not.toContain("-lc");
		expect(args.filter((a) => /sh$/.test(a))).toEqual([]);
		// Trailing tokens are the pi command argv, in order.
		const nodeIdx = args.indexOf("/usr/bin/node");
		expect(nodeIdx).toBeGreaterThan(0);
		expect(args.slice(nodeIdx)).toEqual([
			"/usr/bin/node",
			"/usr/bin/pi", // resolveBin("pi") via mocked `which`
			"--name",
			"Issue #42",
			"--append-system-prompt",
			"You are working in an issue worktree for #42.",
			"issue-42に対応してください",
		]);
	});

	it("preserves shell-hostile content verbatim (backticks, single quotes, $, newlines)", async () => {
		// The content must reach pi byte-for-byte. If anything joined it into a
		// shell command string, backticks would trigger command substitution and
		// single quotes would unbalance the quoting. Separate argv entries are safe.
		const hostile = "line 1\n`demote_to_ready_for_human` let's $HOME 'q'";
		const { launchPiSessionInKittySplit } = await import("./pi-session.js");
		await launchPiSessionInKittySplit({
			cwd: "/repo",
			title: "Issue #7",
			nodeBin: "/usr/bin/node",
			appendSystemPrompt: hostile,
			initialMessage: hostile,
		});
		expect(kittenLaunchArgs).toContain(hostile);
		// appears exactly twice (once as system prompt value, once as initial msg)
		expect(kittenLaunchArgs!.filter((a) => a === hostile).length).toBe(2);
	});
});

describe("launchPiSessionInKittySplit split-anchor direction (issue #102)", () => {
	it("uses vsplit and no source-window on the first call (no anchor)", async () => {
		const { launchPiSessionInKittySplit } = await import("./pi-session.js");
		await launchPiSessionInKittySplit({ cwd: "/repo", title: "Issue #42" });
		expect(kittenLaunchArgs).not.toBeNull();
		const locIdx = kittenLaunchArgs!.indexOf("--location");
		expect(locIdx).toBeGreaterThanOrEqual(0);
		expect(kittenLaunchArgs![locIdx + 1]).toBe("vsplit");
		expect(kittenLaunchArgs).not.toContain("--source-window");
	});

	it("splits the largest pane top/bottom (hsplit) when it is too narrow", async () => {
		mockAnchor.value = { windowId: 12, location: "hsplit" };
		const { launchPiSessionInKittySplit } = await import("./pi-session.js");
		await launchPiSessionInKittySplit({ cwd: "/repo", title: "Issue #43" });
		expect(kittenLaunchArgs).not.toBeNull();
		const locIdx = kittenLaunchArgs!.indexOf("--location");
		expect(kittenLaunchArgs![locIdx + 1]).toBe("hsplit");
		const srcIdx = kittenLaunchArgs!.indexOf("--source-window");
		expect(srcIdx).toBeGreaterThanOrEqual(0);
		expect(kittenLaunchArgs![srcIdx + 1]).toBe("id:12");
	});

	it("splits the largest pane left/right (vsplit) when it is wide", async () => {
		mockAnchor.value = { windowId: 11, location: "vsplit" };
		const { launchPiSessionInKittySplit } = await import("./pi-session.js");
		await launchPiSessionInKittySplit({ cwd: "/repo", title: "Issue #44" });
		expect(kittenLaunchArgs).not.toBeNull();
		const locIdx = kittenLaunchArgs!.indexOf("--location");
		expect(kittenLaunchArgs![locIdx + 1]).toBe("vsplit");
		const srcIdx = kittenLaunchArgs!.indexOf("--source-window");
		expect(srcIdx).toBeGreaterThanOrEqual(0);
		expect(kittenLaunchArgs![srcIdx + 1]).toBe("id:11");
	});
});
