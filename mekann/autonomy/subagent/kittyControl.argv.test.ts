/**
 * Argv-construction regression tests for KittyController.launchPiWindow /
 * launchPiSplit — the security fix that mirrors terminal/pi-session.ts.
 *
 * The old `buildChildScript` inlined every value (model id, thinking level,
 * agent path, initial message) into ONE `sh -lc "..."` command string using
 * POSIX single-quote escaping. That quoting is correct but fragile, and the
 * design is exactly the "shell-string state construction" pattern pi-session
 * abandoned after backticks in a system prompt fired command substitution and
 * aborted the launch. These tests pin the new design: every value is a separate
 * argv token (forwarded by the content-free wrapper via `"$@"`), so shell
 * metacharacters can never be re-parsed.
 *
 * We mock `node:child_process` execFile to capture the exact argv handed to
 * `kitten @ launch` (both the direct launchPiWindow call and the
 * KittyControl.launchWindow call used by launchPiSplit funnel through it).
 */

import { execFile as execFileCb } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { captured, mockExecFile } = vi.hoisted(() => {
	const PROMISIFY_CUSTOM = Symbol.for("nodejs.util.promisify.custom");
	// Captured argv for the most recent `kitten @ launch` call.
	const captured: { args: string[] | null } = { args: null };
	const fn = vi.fn(
		(cmd: string, args: string[], _opts: unknown, cb: (err: Error | null, stdout: string, stderr: string) => void) => {
			// kitty @ ls lookups (anchor resolution / size detection) return empty so
			// launchPiSplit falls back to the focused window with vsplit.
			if (cmd === "kitten" && args[0] === "@" && args[1] === "ls") {
				cb(null, "", "");
				return;
			}
			if (cmd === "kitten" && args[0] === "@" && args[1] === "launch") {
				captured.args = args;
				cb(null, "win-1\n", "");
				return;
			}
			cb(null, "", "");
		},
	);
	(fn as unknown as Record<symbol, unknown>)[PROMISIFY_CUSTOM] = (cmd: string, args: string[], opts: unknown) =>
		new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
			fn(cmd, args, opts, (err, stdout, stderr) => {
				if (err) reject(err);
				else resolve({ stdout, stderr });
			});
		});
	return { captured, mockExecFile: fn };
});

vi.mock("node:child_process", () => ({ execFile: mockExecFile }));

beforeEach(() => {
	captured.args = null;
});
afterEach(() => {
	vi.mocked(execFileCb).mockClear();
});

const baseParams = {
	agentId: "agent-1",
	agentPath: "/root/task1",
	cwd: "/tmp/test",
	socketPath: "/tmp/test.sock",
	initialMessage: "hello",
};

/** Locate the content-free wrapper token within a `kitten @ launch` argv
 * (`... "sh" "-c" <wrapper> "pi-subagent" <pi tokens>`). */
function findWrapper(args: string[]): string {
	for (let i = 0; i < args.length - 1; i++) {
		if (args[i] === "sh" && args[i + 1] === "-c") return args[i + 2];
	}
	throw new Error("no `sh -c <wrapper>` segment found in argv");
}

describe("KittyController argv construction (no shell re-parse)", () => {
	it("launches the child via `sh -c <wrapper> pi-subagent <pi tokens>` with no `sh -lc`", async () => {
		const { KittyController } = await import("./kittyControl.js");
		const controller = new KittyController("kitten");
		await controller.launchPiWindow({ ...baseParams, piCommand: "pi" });

		const args = captured.args!;
		expect(args).toContain("sh");
		expect(args).toContain("-c");
		// No login-shell wrapper (the old design was `sh -lc`).
		expect(args).not.toContain("-lc");
	});

	it("forwards model id and thinking level as separate argv tokens", async () => {
		const { KittyController } = await import("./kittyControl.js");
		const controller = new KittyController("kitten");
		await controller.launchPiWindow({ ...baseParams, modelId: "gpt-4", thinkingLevel: "low" });

		const args = captured.args!;
		expect(args).toContain("--model");
		expect(args[args.indexOf("--model") + 1]).toBe("gpt-4");
		expect(args).toContain("--thinking");
		expect(args[args.indexOf("--thinking") + 1]).toBe("low");
	});

	it("passes PI_SUBAGENT_* markers via kitty --env (not shell exports)", async () => {
		const { KittyController } = await import("./kittyControl.js");
		const controller = new KittyController("kitten");
		await controller.launchPiWindow({ ...baseParams, nonce: "n-1" });

		const args = captured.args!;
		expect(args).toContain("--env");
		expect(args).toContain("PI_SUBAGENT_ROLE=child");
		expect(args).toContain("PI_SUBAGENT_ID=agent-1");
		expect(args).toContain("PI_SUBAGENT_PATH=/root/task1");
		expect(args).toContain("PI_SUBAGENT_PARENT_SOCKET=/tmp/test.sock");
		expect(args).toContain("PI_SUBAGENT_NONCE=n-1");
	});

	it("keeps the wrapper content-free: model id / message never appear in the wrapper token", async () => {
		// The actual vulnerability being fixed: if any content were inlined into
		// the wrapper script, a backtick / `$` / quote could be re-parsed by sh.
		const { KittyController } = await import("./kittyControl.js");
		const controller = new KittyController("kitten");
		await controller.launchPiWindow({
			...baseParams,
			modelId: "mo`whoami`del",
			thinkingLevel: "hi$HOME",
			initialMessage: "do not inject `rm -rf` or $EVIL 'q'",
		});

		const args = captured.args!;
		const wrapper = findWrapper(args);
		// The wrapper is static: it must not contain any of the content values.
		expect(wrapper).not.toContain("whoami");
		expect(wrapper).not.toContain("$HOME");
		expect(wrapper).not.toContain("rm -rf");
		expect(wrapper).not.toContain("$EVIL");
		// ... and the content is delivered as its own argv tokens instead.
		expect(args).toContain("mo`whoami`del");
		expect(args).toContain("hi$HOME");
	});

	it("holds the pane open via --hold instead of exec $SHELL (IC-112)", async () => {
		const { KittyController } = await import("./kittyControl.js");
		const controller = new KittyController("kitten");
		await controller.launchPiWindow({ ...baseParams });

		const args = captured.args!;
		expect(args).toContain("--hold");
		// No PATH override and no exec-shell residual in the wrapper.
		const wrapper = findWrapper(args);
		expect(wrapper).not.toContain("exec");
		expect(wrapper).not.toContain("PATH=");
	});

	it("delivers the initial prompt as a @file argv token (never shell-quoted)", async () => {
		const { mkdtempSync, rmSync } = await import("node:fs");
		const { tmpdir } = await import("node:os");
		const path = await import("node:path");
		const tmp = mkdtempSync(path.join(tmpdir(), "kitty-argv-"));
		try {
			const { KittyController } = await import("./kittyControl.js");
			const controller = new KittyController("kitten");
			const logPath = path.join(tmp, "sub.log");
			await controller.launchPiWindow({ ...baseParams, initialMessage: "line\nwith `ticks`", logPath });

			const args = captured.args!;
			const promptToken = args.find((a) => a.startsWith("@") && a.endsWith("sub.prompt.md"));
			expect(promptToken, "expected a @<prompt.md> argv token").toBeTruthy();
			// INITIAL_MESSAGE is passed EMPTY via --env (the @file carries the body).
			const envIdx = args.lastIndexOf("PI_SUBAGENT_INITIAL_MESSAGE=");
			expect(envIdx).toBeGreaterThan(-1);
			expect(args[envIdx]).toBe("PI_SUBAGENT_INITIAL_MESSAGE=");
		} finally {
			try { rmSync(tmp, { recursive: true }); } catch { /* best effort */ }
		}
	});

	it("launchPiSplit builds the same content-free argv via KittyControl.launchWindow", async () => {
		const { KittyController } = await import("./kittyControl.js");
		const controller = new KittyController("kitten");
		await controller.launchPiSplit({ ...baseParams, modelId: "claude`x`3", splitDirection: "vertical" });

		const args = captured.args!;
		// Same structure as launchPiWindow: sh -c <wrapper> pi-subagent pi --sub ...
		expect(args).toContain("sh");
		expect(args).toContain("-c");
		const wrapper = findWrapper(args);
		expect(wrapper).not.toContain("claude");
		expect(wrapper).not.toContain("`x`");
		// The hostile model id is its own argv token.
		expect(args).toContain("claude`x`3");
		// Split holds the pane too.
		expect(args).toContain("--hold");
	});
});
