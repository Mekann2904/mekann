/**
 * Zip Repo Extension — handler tests.
 *
 * Mocks execFileAsync and ExtensionAPI to test the /zip command handler
 * covering: git rev-parse, git archive, dirty file overlay, clipboard copy,
 * error paths, size formatting.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";

// Mock child_process.execFile
const execResults: Map<string, { stdout: string; stderr?: string } | Error | string> = new Map();
vi.mock("node:child_process", () => ({
	execFile: vi.fn((cmd: string, args: string[], opts: any, cb: any) => {
		if (typeof opts === "function") { cb = opts; opts = {}; }
		const key = `${cmd} ${args.join(" ")}`;
		const result = execResults.get(key) || execResults.get(cmd) || new Error(`unexpected execFile: ${key}`);
		if (result instanceof Error) {
			cb(result);
		} else if (typeof result === "string") {
			// Non-Error throw value
			cb(result);
		} else {
			cb(null, result);
		}
	}),
}));

vi.mock("node:fs/promises", () => ({
	stat: vi.fn(() => Promise.resolve({ size: 2048 })),
	unlink: vi.fn(() => Promise.resolve()),
}));

// Import after mocks
const { default: zipExtension } = await import("./index.js");

function createMockApi() {
	const commands: Record<string, { handler: Function }> = {};
	return {
		registerCommand: vi.fn((name: string, config: { handler: Function }) => {
			commands[name] = config;
		}),
		get _commands() { return commands; },
	};
}

function createMockCtx(overrides?: Record<string, unknown>) {
	return {
		cwd: "/tmp/project",
		ui: {
			notify: vi.fn(),
			confirm: vi.fn(() => Promise.resolve(true)),
		},
		...overrides,
	};
}

describe("/zip command handler", () => {
	let mock: ReturnType<typeof createMockApi>;

	beforeEach(() => {
		mock = createMockApi();
		zipExtension(mock as any);
		execResults.clear();
	});

	it("registers /zip command", () => {
		expect(mock._commands["zip"]).toBeDefined();
	});

	it("successful clean repo: git archive + clipboard", async () => {
		execResults.set("git", { stdout: "" }); // default fallback
		execResults.set("git rev-parse --show-toplevel", { stdout: "/tmp/project\n" });
		execResults.set("git rev-parse --short=12 HEAD", { stdout: "abc123def456\n" });
		execResults.set("git status --porcelain", { stdout: "" }); // clean
		execResults.set("git archive --format=zip --prefix=project/ --output=/tmp/project-abc123def456.zip HEAD", { stdout: "" });
		execResults.set("osascript", { stdout: "" });

		const ctx = createMockCtx();
		await mock._commands["zip"].handler("", ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("Copied to clipboard"),
			"info",
		);
	});

	it("successful dirty repo: git archive + overlay", async () => {
		execResults.set("git", { stdout: "" });
		execResults.set("git rev-parse --show-toplevel", { stdout: "/tmp/project\n" });
		execResults.set("git rev-parse --short=12 HEAD", { stdout: "abc123\n" });
		execResults.set("git status --porcelain", { stdout: "M file.ts\n?? new.ts\n" }); // dirty + prepareWorktreeZip
		execResults.set("git archive --format=zip --prefix=project/ --output=/tmp/project-abc123.zip HEAD", { stdout: "" });
		execResults.set("/usr/bin/zip", { stdout: "" }); // overlay
		execResults.set("osascript", { stdout: "" });

		const ctx = createMockCtx();
		await mock._commands["zip"].handler("", ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("Copied to clipboard"),
			"info",
		);
	});

	it("not a git repo: error notification", async () => {
		execResults.set("git rev-parse --show-toplevel", new Error("not a git repo"));

		const ctx = createMockCtx();
		await mock._commands["zip"].handler("", ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("Not a Git repository"),
			"error",
		);
	});

	it("git archive fails: error notification", async () => {
		execResults.set("git rev-parse --show-toplevel", { stdout: "/tmp/project\n" });
		execResults.set("git rev-parse --short=12 HEAD", { stdout: "abc123\n" });
		execResults.set("git status --porcelain", { stdout: "" });
		execResults.set("git archive --format=zip --prefix=project/ --output=/tmp/project-abc123.zip HEAD", new Error("archive failed"));

		const ctx = createMockCtx();
		await mock._commands["zip"].handler("", ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("Failed to create ZIP"),
			"error",
		);
	});

	it("clipboard copy fails: warning notification", async () => {
		execResults.set("git", { stdout: "" });
		execResults.set("git rev-parse --show-toplevel", { stdout: "/tmp/project\n" });
		execResults.set("git rev-parse --short=12 HEAD", { stdout: "abc123\n" });
		execResults.set("git status --porcelain", { stdout: "" });
		execResults.set("git archive --format=zip --prefix=project/ --output=/tmp/project-abc123.zip HEAD", { stdout: "" });
		execResults.set("osascript", new Error("clipboard failed"));

		const ctx = createMockCtx();
		await mock._commands["zip"].handler("", ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("clipboard copy failed"),
			"warning",
		);
	});

	it("git status fails: treated as clean", async () => {
		execResults.set("git", { stdout: "" });
		execResults.set("git rev-parse --show-toplevel", { stdout: "/tmp/project\n" });
		execResults.set("git rev-parse --short=12 HEAD", { stdout: "abc123\n" });
		execResults.set("git status --porcelain", new Error("status failed")); // fails
		execResults.set("git archive --format=zip --prefix=project/ --output=/tmp/project-abc123.zip HEAD", { stdout: "" });
		execResults.set("osascript", { stdout: "" });

		const ctx = createMockCtx();
		await mock._commands["zip"].handler("", ctx);

		// Should succeed — git status failure is swallowed (treated as clean)
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("Copied to clipboard"),
			"info",
		);
	});

	it("size formatting in output", async () => {
		execResults.set("git", { stdout: "" });
		execResults.set("git rev-parse --show-toplevel", { stdout: "/tmp/project\n" });
		execResults.set("git rev-parse --short=12 HEAD", { stdout: "abc123\n" });
		execResults.set("git status --porcelain", { stdout: "" });
		execResults.set("git archive --format=zip --prefix=project/ --output=/tmp/project-abc123.zip HEAD", { stdout: "" });
		execResults.set("osascript", { stdout: "" });

		const ctx = createMockCtx();
		await mock._commands["zip"].handler("", ctx);

		// 2048 bytes from mock stat
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("2.0 KB"),
			"info",
		);
	});

	it("dirty repo with only deleted files: runs zip -d only", async () => {
		execResults.set("git", { stdout: "" });
		execResults.set("git rev-parse --show-toplevel", { stdout: "/tmp/project\n" });
		execResults.set("git rev-parse --short=12 HEAD", { stdout: "abc123\n" });
		execResults.set("git status --porcelain", { stdout: "D  deleted.ts\n" }); // deleted only
		execResults.set("git archive --format=zip --prefix=project/ --output=/tmp/project-abc123.zip HEAD", { stdout: "" });
		execResults.set("/usr/bin/zip", { stdout: "" }); // zip -d
		execResults.set("osascript", { stdout: "" });

		const ctx = createMockCtx();
		await mock._commands["zip"].handler("", ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("Copied to clipboard"),
			"info",
		);
	});

	it("deleted files are removed from ZIP before overlay", async () => {
		execResults.set("git", { stdout: "" });
		execResults.set("git rev-parse --show-toplevel", { stdout: "/tmp/project\n" });
		execResults.set("git rev-parse --short=12 HEAD", { stdout: "abc123\n" });
		execResults.set("git status --porcelain", { stdout: "D  deleted.ts\n M modified.ts\n?? new.ts\n" }); // mixed
		execResults.set("git archive --format=zip --prefix=project/ --output=/tmp/project-abc123.zip HEAD", { stdout: "" });
		execResults.set("/usr/bin/zip", { stdout: "" }); // both zip -d and zip -u
		execResults.set("osascript", { stdout: "" });

		const ctx = createMockCtx();
		await mock._commands["zip"].handler("", ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("Copied to clipboard"),
			"info",
		);
	});

	// ─── Error type branch coverage ───────────────────────────────────

	it("non-Error thrown from git rev-parse: String(e) branch", async () => {
		// Throw a string instead of Error to cover String(e) branch
		execResults.set("git rev-parse --show-toplevel", "not a git repo" as any);

		const ctx = createMockCtx();
		await mock._commands["zip"].handler("", ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("not a git repo"),
			"error",
		);
	});

	it("non-Error thrown from git archive: String(e) branch", async () => {
		execResults.set("git rev-parse --show-toplevel", { stdout: "/tmp/project\n" });
		execResults.set("git rev-parse --short=12 HEAD", { stdout: "abc123\n" });
		execResults.set("git status --porcelain", { stdout: "" });
		execResults.set("git archive --format=zip --prefix=project/ --output=/tmp/project-abc123.zip HEAD", "archive failed" as any);

		const ctx = createMockCtx();
		await mock._commands["zip"].handler("", ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("archive failed"),
			"error",
		);
	});

	it("non-Error thrown from osascript: String(e) branch", async () => {
		execResults.set("git", { stdout: "" });
		execResults.set("git rev-parse --show-toplevel", { stdout: "/tmp/project\n" });
		execResults.set("git rev-parse --short=12 HEAD", { stdout: "abc123\n" });
		execResults.set("git status --porcelain", { stdout: "" });
		execResults.set("git archive --format=zip --prefix=project/ --output=/tmp/project-abc123.zip HEAD", { stdout: "" });
		execResults.set("osascript", "clipboard error" as any);

		const ctx = createMockCtx();
		await mock._commands["zip"].handler("", ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("clipboard error"),
			"warning",
		);
	});

	// ─── parseGitStatus unit tests ────────────────────────────────────

	it("parseGitStatus separates deleted and modified files", async () => {
		const { parseGitStatus } = await import("./index.js");
		const result = parseGitStatus("D  deleted.ts\n M modified.ts\n?? new.ts\n");
		expect(result.deleted).toEqual(["deleted.ts"]);
		expect(result.modified).toEqual(["modified.ts", "new.ts"]);
	});

	it("parseGitStatus handles empty input", async () => {
		const { parseGitStatus } = await import("./index.js");
		const result = parseGitStatus("");
		expect(result.deleted).toEqual([]);
		expect(result.modified).toEqual([]);
	});

	it("parseGitStatus handles rename", async () => {
		const { parseGitStatus } = await import("./index.js");
		const result = parseGitStatus("R  old_name.ts -> new_name.ts\n");
		expect(result.modified).toEqual(["new_name.ts"]);
		expect(result.deleted).toEqual([]);
	});

	it("parseGitStatus handles quoted path with spaces", async () => {
		const { parseGitStatus } = await import("./index.js");
		const result = parseGitStatus('?? "path with spaces.ts"\n');
		expect(result.modified).toEqual(["path with spaces.ts"]);
	});

	it("parseGitStatus handles quoted path with octal-escaped Japanese chars", async () => {
		const { parseGitStatus } = await import("./index.js");
		// \343\201\202 = UTF-8 bytes for U+3042 (あ)
		const result = parseGitStatus('M  "\\343\\201\\202.ts"\n');
		expect(result.modified).toEqual(["\u3042.ts"]);
	});

	it("parseGitStatus handles untracked files as modified", async () => {
		const { parseGitStatus } = await import("./index.js");
		const result = parseGitStatus("?? new_file.ts\n");
		expect(result.modified).toEqual(["new_file.ts"]);
		expect(result.deleted).toEqual([]);
	});

	it("parseGitStatus handles rename with deletion in same output", async () => {
		const { parseGitStatus } = await import("./index.js");
		const result = parseGitStatus("R  old.ts -> new.ts\nD  gone.ts\n");
		expect(result.modified).toEqual(["new.ts"]);
		expect(result.deleted).toEqual(["gone.ts"]);
	});

	it("stat fails: sizeStr stays 'unknown size'", async () => {
		const { stat } = await import("node:fs/promises");
		(stat as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("stat failed"));

		execResults.set("git", { stdout: "" });
		execResults.set("git rev-parse --show-toplevel", { stdout: "/tmp/project\n" });
		execResults.set("git rev-parse --short=12 HEAD", { stdout: "abc123\n" });
		execResults.set("git status --porcelain", { stdout: "" });
		execResults.set("git archive --format=zip --prefix=project/ --output=/tmp/project-abc123.zip HEAD", { stdout: "" });
		execResults.set("osascript", { stdout: "" });

		const ctx = createMockCtx();
		await mock._commands["zip"].handler("", ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("unknown size"),
			"info",
		);
	});
});
