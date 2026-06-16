import { execFile as execFileCb } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	KittyControl,
	type KittyWindowLike,
	chooseIssuePaneSplit,
	collectKittyWindows,
	decideSplitLocation,
	pickLargestIssuePiPane,
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
// pickLargestIssuePiPane / decideSplitLocation / chooseIssuePaneSplit
// (issue #102: area-based anchor + direction-aware split)
// ---------------------------------------------------------------------------

describe("pickLargestIssuePiPane", () => {
	it("returns undefined when there are no Issue Pi panes", () => {
		const windows: KittyWindowLike[] = [
			{ id: 1, title: "pi", columns: 200, lines: 50 },
		];
		expect(pickLargestIssuePiPane(windows)).toBeUndefined();
	});

	it("does not match the Issues list pane (plural, no number)", () => {
		const windows: KittyWindowLike[] = [
			{ id: 1, title: "Issues", columns: 200, lines: 50 },
			{ id: 2, title: "Issue", columns: 100, lines: 50 },
		];
		expect(pickLargestIssuePiPane(windows)).toBeUndefined();
	});

	it("picks the pane with the largest area (columns × lines)", () => {
		// 60×60 (3600) is larger than 80×10 (800) even though it is narrower.
		const narrowTall = { id: 11, title: "Issue #41", columns: 80, lines: 10 };
		const wideShort = { id: 12, title: "Issue #42", columns: 60, lines: 60 };
		const windows: KittyWindowLike[] = [narrowTall, wideShort];
		expect(pickLargestIssuePiPane(windows)).toEqual(wideShort);
	});

	it("returns the first largest on a tie (stable)", () => {
		const a = { id: 11, title: "Issue #41", columns: 80, lines: 24 };
		const b = { id: 12, title: "Issue #42", columns: 80, lines: 24 };
		expect(pickLargestIssuePiPane([a, b])?.id).toBe(11);
	});
});

describe("decideSplitLocation", () => {
	it("splits left/right (vsplit) when meaningfully wider than tall and wide enough", () => {
		// 100 > 50 * 1.3 and 100/2 = 50 >= 40
		expect(decideSplitLocation(100, 50)).toBe("vsplit");
	});

	it("splits top/bottom (hsplit) when too narrow to vsplit but tall enough", () => {
		// 50/2 = 25 < 40 → cannot vsplit; 50/2 = 25 >= 15 → hsplit
		expect(decideSplitLocation(50, 50)).toBe("hsplit");
	});

	it("splits top/bottom when wide enough but not meaningfully wider than tall", () => {
		// 90/2 = 45 >= 40 but 90 > 80*1.3=104 is false → fall through to hsplit
		expect(decideSplitLocation(90, 80)).toBe("hsplit");
	});

	it("falls back to vsplit when too short to hsplit but wide enough", () => {
		// Force hsplit off via a large minHeight; 90 is not wider-than-tall at the
		// default ratio, so only the canVsplit branch can satisfy.
		expect(decideSplitLocation(90, 40, { ratio: 10, minHeight: 50 })).toBe("vsplit");
	});

	it("returns undefined when neither minimum can be met", () => {
		// Both directions would create panes below their post-split floors, so the
		// pane is not a valid split candidate.
		expect(decideSplitLocation(10, 5)).toBeUndefined();
		expect(decideSplitLocation(5, 10)).toBeUndefined();
	});

	it("honours overridden thresholds", () => {
		// Default: 50×50 is not wider-than-tall → hsplit.
		expect(decideSplitLocation(50, 50)).toBe("hsplit");
		// Loosen both thresholds: tiny minWidth + ratio<1 makes it vsplit.
		expect(decideSplitLocation(50, 50, { minWidth: 10, ratio: 0.9 })).toBe("vsplit");
	});
});

describe("chooseIssuePaneSplit", () => {
	it("returns undefined when there are no Issue Pi panes", () => {
		expect(chooseIssuePaneSplit([{ id: 1, title: "pi", columns: 200, lines: 50 }])).toBeUndefined();
	});

	it("returns the largest pane id with a vsplit location when wide", () => {
		const windows: KittyWindowLike[] = [
			{ id: 11, title: "Issue #41", columns: 100, lines: 50 },
			{ id: 12, title: "Issue #42", columns: 60, lines: 60 },
		];
		// 100×50 (5000) is the largest area; wide enough → vsplit
		expect(chooseIssuePaneSplit(windows)).toEqual({ windowId: 11, location: "vsplit" });
	});

	it("returns hsplit when the largest pane is too narrow to vsplit", () => {
		const windows: KittyWindowLike[] = [
			{ id: 11, title: "Issue #41", columns: 80, lines: 10 },
			{ id: 12, title: "Issue #42", columns: 50, lines: 50 },
		];
		// 50×50 (2500) > 80×10 (800); too narrow to vsplit → hsplit
		expect(chooseIssuePaneSplit(windows)).toEqual({ windowId: 12, location: "hsplit" });
	});

	it("returns undefined when the largest pane has no numeric id", () => {
		const windows: KittyWindowLike[] = [
			{ id: undefined, title: "Issue #41", columns: 100, lines: 50 },
		];
		expect(chooseIssuePaneSplit(windows)).toBeUndefined();
	});

	it("still anchors (longer side) when the largest pane cannot satisfy either minimum", () => {
		// 20×10 is below both post-split floors. We must still open the new pane
		// somewhere; anchoring to this Issue Pi pane (longer side = vsplit) protects
		// the Main Pi instead of falling back to splitting it (ADR-0021).
		const windows: KittyWindowLike[] = [
			{ id: 11, title: "Issue #41", columns: 20, lines: 10 },
		];
		expect(chooseIssuePaneSplit(windows)).toEqual({ windowId: 11, location: "vsplit" });
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

describe("KittyControl.findIssuePaneSplitAnchor", () => {
	beforeEach(() => execResults.clear());
	afterEach(() => vi.mocked(execFileCb).mockClear());

	function setLsResult(stdout: string) {
		execResults.set("kitten @ ls", { stdout });
	}

	it("returns the largest-area Issue Pi pane with vsplit when it is wide", async () => {
		setLsResult(
			JSON.stringify([
				{ id: 1, title: "pi", columns: 200, lines: 50, is_focused: true },
				{ id: 11, title: "Issue #41", columns: 100, lines: 50 },
				{ id: 12, title: "Issue #42", columns: 60, lines: 60 },
			]),
		);
		const kitty = new KittyControl();
		// 100×50 (5000) > 60×60 (3600); 100 > 50*1.3 and 50 >= 40 → vsplit
		expect(await kitty.findIssuePaneSplitAnchor()).toEqual({ windowId: 11, location: "vsplit" });
	});

	it("returns hsplit when the largest pane is too narrow to vsplit", async () => {
		setLsResult(
			JSON.stringify([
				{ id: 1, title: "pi", columns: 200, lines: 50 },
				{ id: 11, title: "Issue #41", columns: 50, lines: 50 },
			]),
		);
		const kitty = new KittyControl();
		// 50/2 = 25 < 40 → cannot vsplit; 50/2 = 25 >= 15 → hsplit
		expect(await kitty.findIssuePaneSplitAnchor()).toEqual({ windowId: 11, location: "hsplit" });
	});

	it("returns undefined when no Issue Pi pane exists (first /issue call)", async () => {
		setLsResult(
			JSON.stringify([
				{ id: 1, title: "pi", columns: 200, lines: 50, is_focused: true },
				{ id: 2, title: "Issues", columns: 80, lines: 24 },
			]),
		);
		const kitty = new KittyControl();
		expect(await kitty.findIssuePaneSplitAnchor()).toBeUndefined();
	});

	it("returns undefined when kitten @ ls fails", async () => {
		execResults.set("kitten @ ls", new Error("remote control unavailable"));
		const kitty = new KittyControl();
		expect(await kitty.findIssuePaneSplitAnchor()).toBeUndefined();
	});

	it("still anchors (longer side) when every pane is below both floors (ADR-0021)", async () => {
		// Simulates a terminal already full of small panes after several
		// expansions (e.g. 200×50 → four 50×25 panes). The largest pane (50×25)
		// cannot split within MIN_WIDTH=40 / MIN_HEIGHT=15 in either direction, so
		// we degrade to its longer side and keep anchoring — rather than returning
		// undefined and letting the caller re-split the Main Pi.
		setLsResult(
			JSON.stringify([
				{ id: 1, title: "pi", columns: 100, lines: 50, is_focused: true },
				{ id: 11, title: "Issue #41", columns: 50, lines: 25 },
			]),
		);
		const kitty = new KittyControl();
		// 50 >= 25 → longer side is vsplit; windowId 11 is anchored (not Main Pi 1).
		expect(await kitty.findIssuePaneSplitAnchor()).toEqual({ windowId: 11, location: "vsplit" });
	});
});
