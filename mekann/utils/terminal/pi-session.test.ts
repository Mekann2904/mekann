/**
 * Tests for launchPiSessionInKittySplit — specifically the env markers it injects
 * into the `kitten @ launch` args. git/gh are not involved; we capture the args
 * passed to execFile by mocking node:child_process and the Kitty control lookup.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecFileCb } = vi.hoisted(() => ({ mockExecFileCb: vi.fn() }));

vi.mock("node:child_process", () => ({ execFile: mockExecFileCb }));

vi.mock("./kitty/control.js", () => ({
	// No existing Issue Pi pane → no --source-window anchor (first-launch path).
	KittyControl: class MockKittyControl {
		findIssuePiAnchorWindowId() {
			return Promise.resolve(undefined);
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
