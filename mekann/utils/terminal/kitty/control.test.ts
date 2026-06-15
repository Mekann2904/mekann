import { execFile as execFileCb } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	KittyControl,
	type KittyWindowLike,
	collectKittyWindows,
	pickWidestIssuePiPane,
} from "./control.js";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("collectKittyWindows", () => {
	it("extracts windows from a flat kitty @ ls payload", () => {
		const payload = [{ id: 1, title: "pi", columns: 200, lines: 50 }];
		expect(collectKittyWindows(payload)).toEqual(payload);
	});

	it("recurses into nested os-window / tab structures", () => {
		const issuePane = { id: 11, title: "Issue #42", columns: 80, lines: 24 };
		const mainPane = { id: 1, title: "pi", columns: 200, lines: 50 };
		const payload = [
			{
				id: "os1",
				tabs: [
					{ id: "tab1", windows: [mainPane, issuePane] },
				],
			},
		];
		expect(collectKittyWindows(payload)).toEqual([mainPane, issuePane]);
	});

	it("ignores objects without an id or size fields", () => {
		const payload = [{ foo: "bar" }, { id: 3 }, { id: 4, title: "x" }];
		// id without columns/lines is not a window
		expect(collectKittyWindows(payload)).toEqual([]);
	});

	it("returns empty array for non-object input", () => {
		expect(collectKittyWindows(null)).toEqual([]);
		expect(collectKittyWindows("not-json")).toEqual([]);
	});
});

describe("pickWidestIssuePiPane", () => {
	it("returns undefined when there are no Issue Pi panes", () => {
		const windows: KittyWindowLike[] = [
			{ id: 1, title: "pi", columns: 200, lines: 50 },
		];
		expect(pickWidestIssuePiPane(windows)).toBeUndefined();
	});

	it("does not match the Issues list pane (plural, no number)", () => {
		const windows: KittyWindowLike[] = [
			{ id: 1, title: "Issues", columns: 200, lines: 50 },
			{ id: 2, title: "Issue", columns: 100, lines: 50 },
		];
		expect(pickWidestIssuePiPane(windows)).toBeUndefined();
	});

	it("returns the single Issue Pi pane when one exists", () => {
		const pane = { id: 11, title: "Issue #42", columns: 80, lines: 24 };
		const windows: KittyWindowLike[] = [
			{ id: 1, title: "pi", columns: 200, lines: 50 },
			pane,
		];
		expect(pickWidestIssuePiPane(windows)).toEqual(pane);
	});

	it("picks the widest Issue Pi pane by columns (maximin)", () => {
		const narrow = { id: 11, title: "Issue #41", columns: 40, lines: 24 };
		const wide = { id: 12, title: "Issue #42", columns: 120, lines: 24 };
		const mid = { id: 13, title: "Issue #43", columns: 80, lines: 24 };
		const windows: KittyWindowLike[] = [
			{ id: 1, title: "pi", columns: 200, lines: 50 },
			narrow,
			wide,
			mid,
		];
		expect(pickWidestIssuePiPane(windows)).toEqual(wide);
	});

	it("matches any issue number, not just a specific one", () => {
		const windows: KittyWindowLike[] = [
			{ id: 11, title: "Issue #7", columns: 50, lines: 24 },
			{ id: 12, title: "Issue #999", columns: 90, lines: 24 },
		];
		expect(pickWidestIssuePiPane(windows)?.id).toBe(12);
	});

	it("matches titles that have content after the number", () => {
		const pane = { id: 11, title: "Issue #42 — review", columns: 80, lines: 24 };
		expect(pickWidestIssuePiPane([pane])).toEqual(pane);
	});

	it("returns the first widest on a tie (stable)", () => {
		const a = { id: 11, title: "Issue #41", columns: 80, lines: 24 };
		const b = { id: 12, title: "Issue #42", columns: 80, lines: 24 };
		expect(pickWidestIssuePiPane([a, b])?.id).toBe(11);
	});
});

// ---------------------------------------------------------------------------
// findIssuePiAnchorWindowId (drives kitten @ ls)
// ---------------------------------------------------------------------------

// control.ts uses promisify(execFile) and expects { stdout, stderr }. A plain
// vi.fn would make generic promisify resolve to a single value, so we attach
// promisify.custom (well-known symbol) to mirror child_process.execFile.
// vi.hoisted keeps the shared map/factory reachable from the hoisted vi.mock.
const { execResults, mockExecFile } = vi.hoisted(() => {
	const PROMISIFY_CUSTOM = Symbol.for("nodejs.util.promisify.custom");
	const execResults = new Map<string, { stdout?: string } | Error>();
	function buildMockExecFile() {
		const fn = vi.fn((cmd: string, args: string[], _opts: unknown, cb: (err: Error | null, stdout: string, stderr: string) => void) => {
			const key = `${cmd} ${args.join(" ")}`;
			const result = execResults.get(key);
			if (result instanceof Error) cb(result, "", "");
			else cb(null, result?.stdout ?? "", "");
		});
		(fn as unknown as Record<symbol, unknown>)[PROMISIFY_CUSTOM] = (cmd: string, args: string[], opts: unknown) =>
			new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
				fn(cmd, args, opts, (err, stdout, stderr) => {
					if (err) reject(err);
					else resolve({ stdout, stderr });
				});
			});
		return fn;
	}
	return { execResults, mockExecFile: buildMockExecFile() };
});

vi.mock("node:child_process", () => ({
	execFile: mockExecFile,
	spawnSync: vi.fn(() => ({ stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), status: 0 })),
}));

describe("KittyControl.findIssuePiAnchorWindowId", () => {
	beforeEach(() => execResults.clear());
	afterEach(() => vi.mocked(execFileCb).mockClear());

	function setLsResult(stdout: string) {
		execResults.set("kitten @ ls", { stdout });
	}

	it("returns the widest Issue Pi pane id from kitten @ ls", async () => {
		setLsResult(
			JSON.stringify([
				{ id: 1, title: "pi", columns: 200, lines: 50, is_focused: true },
				{ id: 11, title: "Issue #41", columns: 40, lines: 24 },
				{ id: 12, title: "Issue #42", columns: 120, lines: 24 },
			]),
		);
		const kitty = new KittyControl();
		expect(await kitty.findIssuePiAnchorWindowId()).toBe(12);
	});

	it("returns undefined when no Issue Pi pane exists (first /issue call)", async () => {
		setLsResult(
			JSON.stringify([
				{ id: 1, title: "pi", columns: 200, lines: 50, is_focused: true },
				{ id: 2, title: "Issues", columns: 80, lines: 24 },
			]),
		);
		const kitty = new KittyControl();
		expect(await kitty.findIssuePiAnchorWindowId()).toBeUndefined();
	});

	it("returns undefined when kitten @ ls fails (falls back to focused window)", async () => {
		execResults.set("kitten @ ls", new Error("remote control unavailable"));
		const kitty = new KittyControl();
		expect(await kitty.findIssuePiAnchorWindowId()).toBeUndefined();
	});

	it("returns undefined for invalid JSON output", async () => {
		setLsResult("not-json");
		const kitty = new KittyControl();
		expect(await kitty.findIssuePiAnchorWindowId()).toBeUndefined();
	});
});
