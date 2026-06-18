import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import commandNormalization from "./index.js";
import { classifyBashCommand, normalizeBashCommand, splitSimpleCommand } from "./command.js";
import { normalizeGrepLikeCommand } from "./grep.js";
import { featureBooleanValue, isFeatureEnabled } from "../../settings/enabled.js";

let cwd: string | undefined;

afterEach(async () => {
	if (cwd) await rm(cwd, { recursive: true, force: true });
	cwd = undefined;
});

/** Build a handler registry that mimics the ExtensionAPI `on()` surface for unit tests. */
function registerExtension(): Record<string, Function> {
	const handlers: Record<string, Function> = {};
	commandNormalization({ on: (name: string, handler: Function) => { handlers[name] = handler; } } as any);
	return handlers;
}

/** Build a mock ExtensionContext with the session/cwd identifiers command-normalization keys on. */
function makeCtx(options: { sessionId?: string; cwd: string }): any {
	return {
		cwd: options.cwd,
		sessionManager: {
			getSessionId: () => options.sessionId ?? "session-test",
		},
	};
}

async function enableRecording(target: string): Promise<void> {
	await mkdir(join(target, ".pi"), { recursive: true });
	await writeFile(join(target, ".pi", "mekann.json"), JSON.stringify({
		version: 1,
		features: { "command-normalization": { recordNormalization: true } },
	}, null, 2));
}

async function logPath(target: string): Promise<string> {
	return join(target, ".mekann", "command-normalization", "normalization.jsonl");
}

async function logExists(target: string): Promise<boolean> {
	try {
		await stat(await logPath(target));
		return true;
	} catch {
		return false;
	}
}

describe("splitSimpleCommand operator rejection (IC-062)", () => {
	it.each([
		["ls foo;rm bar", "semicolon compound"],
		["ls foo | grep x", "pipe compound"],
		["echo $(whoami)", "command substitution"],
		["ls\nrm -rf /", "newline compound"],
		["ls foo\nbar", "embedded newline"],
		["echo a\r\nb", "CRLF"],
		["ls\\\nrm", "backslash-newline continuation"],
	])("rejects %s (%s) as non-simple", (cmd) => {
		expect(splitSimpleCommand(cmd)).toBeNull();
		expect(classifyBashCommand(cmd)).toBeNull();
	});

	it.each([
		["rg needle src", ["rg", "needle", "src"]],
		["ls ~/Documents", ["ls", "~/Documents"]],
		['ls "my dir"', ["ls", "my dir"]],
		["rg \u65e5\u672c\u8a9e src", ["rg", "\u65e5\u672c\u8a9e", "src"]],
	])("still splits %p into %p", (cmd, expected) => {
		expect(splitSimpleCommand(cmd)).toEqual(expected);
	});
});

describe("normalizeGrepLikeCommand flag detection (IC-061)", () => {
	it.each([
		["rg needle src", "rg -n -H -0 --no-heading needle src"],
		// Numeric / option-with-arg tokens must NOT be read as the short flag.
		["rg -10 pattern", "rg -n -H -0 --no-heading -10 pattern"],
		["rg -A2 needle", "rg -n -H -0 --no-heading -A2 needle"],
		["rg -B1 needle", "rg -n -H -0 --no-heading -B1 needle"],
		// Flag letter present but not terminating the cluster → not read as the flag.
		["rg -inferior x", "rg -n -H -0 --no-heading -inferior x"],
		["rg -Help x", "rg -n -H -0 --no-heading -Help x"],
		// Already-present standalone flags are preserved (no duplicates added).
		["rg -n needle", "rg -H -0 --no-heading -n needle"],
		["rg -H needle", "rg -n -0 --no-heading -H needle"],
		["rg -0 needle", "rg -n -H --no-heading -0 needle"],
		["rg --line-number --with-filename -0 --no-heading x", "rg --line-number --with-filename -0 --no-heading x"],
		// grep variant uses -Z for --null.
		["grep foo", "grep -n -H -Z foo"],
		["grep -n foo", "grep -H -Z -n foo"],
		["grep -A2 foo", "grep -n -H -Z -A2 foo"],
	])("normalizes %p -> %p", (input, expected) => {
		expect(normalizeGrepLikeCommand(input)).toBe(expected);
	});

	it.each([
		["rg --count foo"],
		["rg -c foo"],
		["grep -l foo"],
		["grep --null foo"],
	])("returns null for format-flag conflict %p", (input) => {
		expect(normalizeGrepLikeCommand(input)).toBeNull();
	});

	it("leaves the command unchanged when every flag is already present", () => {
		expect(normalizeGrepLikeCommand("rg -n -H -0 --no-heading needle")).toBe("rg -n -H -0 --no-heading needle");
	});
});

describe("normalizeBashCommand list rewrites", () => {
	const IGNORE = ".git|node_modules|vendor|target|dist|build|.next|coverage";

	it("preserves HOME tilde expansion for ls (IC-066)", () => {
		// `~` must stay unquoted so the shell expands `~/Documents`.
		expect(normalizeBashCommand("ls ~/Documents", "list")).toBe("ls -1 ~/Documents");
	});

	it("adds exactly one -I with the full ignore list when none present (IC-065)", () => {
		const out = normalizeBashCommand("tree", "list")!;
		expect(out).toBe(`tree -L 3 -I '${IGNORE}'`);
		expect(out.split(" ").filter((t) => t === "-I")).toHaveLength(1);
	});

	it("merges IGNORE_DIRS into an existing -I pattern instead of overwriting (IC-065)", () => {
		expect(normalizeBashCommand("tree -I tmp", "list")).toBe(`tree -I 'tmp|${IGNORE}' -L 3`);
	});

	it("merges while preserving the user pattern and deduping overlaps", () => {
		const out = normalizeBashCommand("tree -I node_modules src", "list")!;
		expect(out).toBe(`tree -I 'node_modules|.git|vendor|target|dist|build|.next|coverage' src -L 3`);
	});

	it("still normalizes find and ls", () => {
		expect(normalizeBashCommand("find .", "list")).toBe("find . -type f -maxdepth 4");
		expect(normalizeBashCommand("ls", "list")).toBe("ls -1");
	});
});

describe("command-normalization settings compatibility", () => {
	it("honors deprecated output-budget settings as aliases", async () => {
		cwd = await mkdtemp(join(tmpdir(), "mekann-command-normalization-alias-"));
		await mkdir(join(cwd, ".pi"), { recursive: true });
		await writeFile(join(cwd, ".pi", "mekann.json"), JSON.stringify({
			version: 1,
			features: { "output-budget": { enabled: false, bashEnabled: false, recordNormalization: true } },
		}, null, 2));

		expect(isFeatureEnabled("command-normalization", cwd)).toBe(false);
		expect(featureBooleanValue("command-normalization", "bashEnabled", true, cwd)).toBe(false);
		expect(featureBooleanValue("command-normalization", "recordNormalization", false, cwd)).toBe(true);
	});

	it("lets command-normalization settings override deprecated output-budget aliases", async () => {
		cwd = await mkdtemp(join(tmpdir(), "mekann-command-normalization-alias-"));
		await mkdir(join(cwd, ".pi"), { recursive: true });
		await writeFile(join(cwd, ".pi", "mekann.json"), JSON.stringify({
			version: 1,
			features: {
				"output-budget": { enabled: false, bashEnabled: false },
				"command-normalization": { enabled: true, bashEnabled: true },
			},
		}, null, 2));

		expect(isFeatureEnabled("command-normalization", cwd)).toBe(true);
		expect(featureBooleanValue("command-normalization", "bashEnabled", false, cwd)).toBe(true);
	});
});

describe("command-normalization recording", () => {
	it("records original command, normalized command, and result byte metrics only when enabled", async () => {
		cwd = await mkdtemp(join(tmpdir(), "mekann-command-normalization-"));
		await enableRecording(cwd);

		const handlers = registerExtension();
		const ctx = makeCtx({ sessionId: "rec-session", cwd });

		const call = { toolName: "bash", toolCallId: "tc_rec_1", input: { command: "rg needle src" } };
		await handlers.tool_call(call, ctx);
		expect(call.input.command).toBe("rg -n -H -0 --no-heading needle src");

		const raw = "src/a.ts\u000010:needle one\nsrc/b.ts\u000020:needle two\n";
		const result = await handlers.tool_result({ toolName: "bash", toolCallId: "tc_rec_1", content: [{ type: "text", text: raw }], isError: false }, ctx);
		expect(result).toBeUndefined();

		const log = await readFile(await logPath(cwd), "utf8");
		const record = JSON.parse(log.trim());
		expect(record).toMatchObject({
			version: 1,
			toolCallId: "tc_rec_1",
			kind: "grep",
			originalCommand: "rg needle src",
			normalizedCommand: "rg -n -H -0 --no-heading needle src",
			changed: true,
			result: { outputBytes: Buffer.byteLength(raw), isError: false },
		});
		expect(record.result).not.toHaveProperty("compacted");
		expect(record.result).not.toHaveProperty("compactBytes");
		expect(log).not.toContain("needle one");
	});

	it("drops the pending plan once the matching tool_result arrives", async () => {
		cwd = await mkdtemp(join(tmpdir(), "mekann-command-normalization-drop-"));
		await enableRecording(cwd);

		const handlers = registerExtension();
		const ctx = makeCtx({ sessionId: "drop-session", cwd });

		const call = { toolName: "bash", toolCallId: "tc_drop", input: { command: "rg alpha src" } };
		await handlers.tool_call(call, ctx);
		await handlers.tool_result({ toolName: "bash", toolCallId: "tc_drop", content: [{ type: "text", text: "hit" }] }, ctx);

		// A second tool_result for the same id must not write a second record.
		const before = await readFile(await logPath(cwd), "utf8");
		await handlers.tool_result({ toolName: "bash", toolCallId: "tc_drop", content: [{ type: "text", text: "hit again" }] }, ctx);
		const after = await readFile(await logPath(cwd), "utf8");
		expect(after).toBe(before);
	});

	it("keeps no pending plan when recording is disabled", async () => {
		cwd = await mkdtemp(join(tmpdir(), "mekann-command-normalization-disabled-"));
		await mkdir(join(cwd, ".pi"), { recursive: true });
		await writeFile(join(cwd, ".pi", "mekann.json"), JSON.stringify({
			version: 1,
			features: { "command-normalization": { recordNormalization: false } },
		}, null, 2));

		const handlers = registerExtension();
		const ctx = makeCtx({ sessionId: "disabled-session", cwd });

		// Normalization still rewrites the command even when recording is off...
		const call = { toolName: "bash", toolCallId: "tc_disabled", input: { command: "rg needle src" } };
		await handlers.tool_call(call, ctx);
		expect(call.input.command).toBe("rg -n -H -0 --no-heading needle src");

		// ...but no plan is retained, so the later tool_result writes nothing.
		await handlers.tool_result({ toolName: "bash", toolCallId: "tc_disabled", content: [{ type: "text", text: "hit" }] }, ctx);
		expect(await logExists(cwd)).toBe(false);
	});
});

describe("command-normalization session boundary", () => {
	it("cleans up pending plans on session_shutdown so they never reach the log", async () => {
		cwd = await mkdtemp(join(tmpdir(), "mekann-command-normalization-shutdown-"));
		await enableRecording(cwd);

		const handlers = registerExtension();
		const ctx = makeCtx({ sessionId: "shutdown-session", cwd });

		await handlers.tool_call({ toolName: "bash", toolCallId: "tc_shutdown", input: { command: "rg needle src" } }, ctx);
		await handlers.session_shutdown({ type: "session_shutdown", reason: "quit" }, ctx);

		// After shutdown the pending plan is gone, so a late tool_result writes nothing.
		await handlers.tool_result({ toolName: "bash", toolCallId: "tc_shutdown", content: [{ type: "text", text: "hit" }] }, ctx);
		expect(await logExists(cwd)).toBe(false);
	});

	it("isolates the same toolCallId across different sessions", async () => {
		cwd = await mkdtemp(join(tmpdir(), "mekann-command-normalization-isolation-"));
		await enableRecording(cwd);

		const handlers = registerExtension();
		const ctxA = makeCtx({ sessionId: "session-a", cwd });
		const ctxB = makeCtx({ sessionId: "session-b", cwd });

		// Two sessions use the same toolCallId with different commands.
		await handlers.tool_call({ toolName: "bash", toolCallId: "tc_shared", input: { command: "rg alpha src" } }, ctxA);
		await handlers.tool_call({ toolName: "bash", toolCallId: "tc_shared", input: { command: "rg beta src" } }, ctxB);

		// Session B resolves first: must write B's command, never A's.
		await handlers.tool_result({ toolName: "bash", toolCallId: "tc_shared", content: [{ type: "text", text: "b" }] }, ctxB);
		const first = (await readFile(await logPath(cwd), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
		expect(first).toHaveLength(1);
		expect(first[0]).toMatchObject({ toolCallId: "tc_shared", originalCommand: "rg beta src" });

		// Session A still has its own plan and records A's command afterwards.
		await handlers.tool_result({ toolName: "bash", toolCallId: "tc_shared", content: [{ type: "text", text: "a" }] }, ctxA);
		const both = (await readFile(await logPath(cwd), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
		expect(both).toHaveLength(2);
		expect(both[1]).toMatchObject({ toolCallId: "tc_shared", originalCommand: "rg alpha src" });
	});

	it("isolates the same toolCallId across different cwds", async () => {
		const cwdA = await mkdtemp(join(tmpdir(), "mekann-command-normalization-cwdA-"));
		const cwdB = await mkdtemp(join(tmpdir(), "mekann-command-normalization-cwdB-"));
		try {
			await enableRecording(cwdA);
			await enableRecording(cwdB);

			const handlers = registerExtension();
			// Same sessionId, different cwd → different log files, no cross-record.
			const ctxA = makeCtx({ sessionId: "same-session", cwd: cwdA });
			const ctxB = makeCtx({ sessionId: "same-session", cwd: cwdB });

			await handlers.tool_call({ toolName: "bash", toolCallId: "tc_cwd", input: { command: "rg alpha src" } }, ctxA);
			await handlers.tool_call({ toolName: "bash", toolCallId: "tc_cwd", input: { command: "rg beta src" } }, ctxB);

			await handlers.tool_result({ toolName: "bash", toolCallId: "tc_cwd", content: [{ type: "text", text: "b" }] }, ctxB);
			expect(await logExists(cwdB)).toBe(true);
			// cwdA has a pending plan but no result yet, so its log must stay empty.
			expect(await logExists(cwdA)).toBe(false);

			const recordB = JSON.parse((await readFile(await logPath(cwdB), "utf8")).trim());
			expect(recordB).toMatchObject({ toolCallId: "tc_cwd", originalCommand: "rg beta src", cwd: cwdB });
		} finally {
			await rm(cwdA, { recursive: true, force: true });
			await rm(cwdB, { recursive: true, force: true });
		}
	});

	it("never throws when session/cwd identifiers are unavailable", async () => {
		cwd = await mkdtemp(join(tmpdir(), "mekann-command-normalization-noscope-"));
		await enableRecording(cwd);

		const handlers = registerExtension();
		// ctx without sessionManager and without cwd — must still fail open and not throw.
		await expect(handlers.tool_call({ toolName: "bash", toolCallId: "tc_noscope", input: { command: "rg needle src" } }, {})).resolves.toBeUndefined();
		await expect(handlers.tool_result({ toolName: "bash", toolCallId: "tc_noscope", content: [{ type: "text", text: "hit" }] }, {})).resolves.toBeUndefined();
		await expect(handlers.session_shutdown({ type: "session_shutdown", reason: "quit" }, {})).resolves.toBeUndefined();
	});
});
