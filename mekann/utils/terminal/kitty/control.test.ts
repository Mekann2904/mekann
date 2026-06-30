import { execFile as execFileCb, spawn as spawnCb } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	AUTOPILOT_CHILD_ENV_MARKER,
	KittyControl,
	ORCHESTRATION_CHILD_ENV_MARKER,
	ISSUE_PI_ENV_MARKER,
	SUBAGENT_PANE_ENV_MARKER,
	chooseIssuePaneSplit,
	chooseIssuePaneSplitForIssue,
	chooseNonMainPaneSplit,
	collectKittyWindows,
	decideSplitLocation,
	isIssuePiEnvWindow,
	isNonMainPane,
	isSubagentPane,
	isWorkPiForIssue,
	issueChildNumberFromWindow,
	pickLargestIssuePiPane,
	pickLargestNonMainPane,
	pickWidestIssuePiPane,
	type KittyWindowLike,
} from "./control.js";
// Drift guard: the detection constants must match the launcher's marker names.
import { ISSUE_PI_ENV } from "../pi-session.js";
import { AUTOPILOT_CHILD_ENV } from "../../issue/orchestration/autopilot/markers.js";

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

// ---------------------------------------------------------------------------
// Drift guard: detection constants must match the launcher's marker names
// (terminal/pi-session.ts + orchestration/autopilot/markers.ts). If the
// launcher is renamed without updating detection, issue panes silently stop
// being recognized — the original /issue + /issue-autopilot regression.
// ---------------------------------------------------------------------------
describe("env marker constants (drift guard)", () => {
	it("ISSUE_PI_ENV_MARKER matches the launcher's ISSUE_PI_ENV", () => {
		expect(ISSUE_PI_ENV_MARKER).toBe(ISSUE_PI_ENV);
	});

	it("AUTOPILOT_CHILD_ENV_MARKER matches the launcher's AUTOPILOT_CHILD_ENV", () => {
		expect(AUTOPILOT_CHILD_ENV_MARKER).toBe(AUTOPILOT_CHILD_ENV);
	});

	it("ORCHESTRATION_CHILD_ENV_MARKER matches the orchestration env name", () => {
		// Orchestration markers are string literals in pi-session.ts (not a shared
		// constant), so this pins the literal the launcher writes.
		expect(ORCHESTRATION_CHILD_ENV_MARKER).toBe("MEKANN_ORCHESTRATION_CHILD");
	});
});

// ---------------------------------------------------------------------------
// Env-based detection helpers (primary signal; title is fallback)
// ---------------------------------------------------------------------------
describe("isIssuePiEnvWindow", () => {
	it("is true when MEKANN_ISSUE_PI=1 is present", () => {
		expect(isIssuePiEnvWindow({ id: 1, env: { MEKANN_ISSUE_PI: "1" }, columns: 80, lines: 24 })).toBe(true);
	});

	it("is false without the marker, regardless of title", () => {
		// A pane whose title contains Issue #N but lacks the env marker is NOT
		// identified by the env signal (the title fallback handles it elsewhere).
		expect(isIssuePiEnvWindow({ id: 1, title: "π - Issue #42 - issue-42", columns: 80, lines: 24 })).toBe(false);
		expect(isIssuePiEnvWindow({ id: 1, env: {}, columns: 80, lines: 24 })).toBe(false);
	});

	it("is false for a marker value other than 1", () => {
		expect(isIssuePiEnvWindow({ id: 1, env: { MEKANN_ISSUE_PI: "0" }, columns: 80, lines: 24 })).toBe(false);
	});
});

describe("issueChildNumberFromWindow", () => {
	it("reads the autopilot child marker", () => {
		expect(issueChildNumberFromWindow({ id: 1, env: { MEKANN_AUTOPILOT_CHILD: "77" }, columns: 80, lines: 24 })).toBe(77);
	});

	it("reads the orchestration child marker", () => {
		expect(issueChildNumberFromWindow({ id: 1, env: { MEKANN_ORCHESTRATION_CHILD: "9" }, columns: 80, lines: 24 })).toBe(9);
	});

	it("prefers autopilot when both are present", () => {
		expect(
			issueChildNumberFromWindow({ id: 1, env: { MEKANN_AUTOPILOT_CHILD: "5", MEKANN_ORCHESTRATION_CHILD: "6" }, columns: 80, lines: 24 }),
		).toBe(5);
	});

	it("returns null when absent or invalid", () => {
		expect(issueChildNumberFromWindow({ id: 1, env: {}, columns: 80, lines: 24 })).toBeNull();
		expect(issueChildNumberFromWindow({ id: 1, env: { MEKANN_AUTOPILOT_CHILD: "oops" }, columns: 80, lines: 24 })).toBeNull();
		expect(issueChildNumberFromWindow({ id: 1, env: { MEKANN_AUTOPILOT_CHILD: "0" }, columns: 80, lines: 24 })).toBeNull();
	});
});

describe("isWorkPiForIssue", () => {
	it("matches by env child marker even when the title is the pi-overridden form", () => {
		// The regression: pi rewrites the title only after init, so during the
		// supervisor's appear window the title may not yet contain Issue #N. The
		// env marker is set at launch and is the reliable signal.
		const pane = { id: 1, title: "π - mekann", env: { MEKANN_ISSUE_PI: "1", MEKANN_AUTOPILOT_CHILD: "42" }, columns: 80, lines: 24 };
		expect(isWorkPiForIssue(pane, 42)).toBe(true);
		expect(isWorkPiForIssue(pane, 43)).toBe(false);
	});

	it("matches by title fallback when no env marker is present", () => {
		expect(isWorkPiForIssue({ id: 1, title: "Issue #42", columns: 80, lines: 24 }, 42)).toBe(true);
		expect(isWorkPiForIssue({ id: 1, title: "π - Issue #42 - issue-42", columns: 80, lines: 24 }, 42)).toBe(true);
	});

	it("respects the digit boundary on the title fallback", () => {
		expect(isWorkPiForIssue({ id: 1, title: "Issue #421", columns: 80, lines: 24 }, 42)).toBe(false);
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

	it("matches the pi-overridden title format (π - Issue #N - <cwd>)", () => {
		// pi sets its own terminal title once interactive mode starts, overriding
		// kitty's --title. A Work Pi for #42 ends up titled `π - Issue #42 - issue-42`,
		// so detection must match `Issue #N` anywhere in the title, not only at the
		// start. This is the regression for /issue + /issue-autopilot pane detection.
		const pane = { id: 11, title: "π - Issue #42 - issue-42", columns: 80, lines: 24 };
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

	it("matches the pi-overridden title format (π - Issue #N - <cwd>)", () => {
		const pane = { id: 11, title: "π - Issue #42 - issue-42", columns: 80, lines: 24 };
		expect(pickLargestIssuePiPane([pane])).toEqual(pane);
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
// isSubagentPane / isNonMainPane (ADR-0021 extension: non-Main pane pool)
// ---------------------------------------------------------------------------

describe("isSubagentPane", () => {
	it("is true when the pane carries the PI_SUBAGENT_ID env marker", () => {
		expect(isSubagentPane({ id: 5, env: { PI_SUBAGENT_ID: "abc" } })).toBe(true);
	});

	it("is false when the marker is absent", () => {
		expect(isSubagentPane({ id: 5, env: {} })).toBe(false);
		expect(isSubagentPane({ id: 5 })).toBe(false);
	});
});

describe("isNonMainPane", () => {
	it("matches an Issue Pi pane (env marker)", () => {
		expect(isNonMainPane({ id: 1, env: { [ISSUE_PI_ENV_MARKER]: "1" } })).toBe(true);
	});

	it("matches a subagent pane", () => {
		expect(isNonMainPane({ id: 2, env: { [SUBAGENT_PANE_ENV_MARKER]: "abc" } })).toBe(true);
	});

	it("matches an Issue Pi pane by title fallback", () => {
		expect(isNonMainPane({ id: 3, title: "Issue #42" })).toBe(true);
	});

	it("is false for the Main Pi (no markers, plain title)", () => {
		expect(isNonMainPane({ id: 4, title: "pi", columns: 200, lines: 50 })).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// pickLargestNonMainPane / chooseNonMainPaneSplit (ADR-0021 extension)
// ---------------------------------------------------------------------------

describe("pickLargestNonMainPane", () => {
	it("returns undefined when only the Main Pi exists", () => {
		const windows: KittyWindowLike[] = [
			{ id: 1, title: "pi", columns: 200, lines: 50 },
		];
		expect(pickLargestNonMainPane(windows)).toBeUndefined();
	});

	it("picks the largest-area non-Main pane across subagent and Issue Pi panes", () => {
		const sub = { id: 10, env: { [SUBAGENT_PANE_ENV_MARKER]: "a" }, columns: 40, lines: 24 };
		const issue = { id: 11, env: { [ISSUE_PI_ENV_MARKER]: "1" }, columns: 120, lines: 24 };
		expect(pickLargestNonMainPane([sub, issue])).toEqual(issue);
	});

	it("prefers the subagent pane when it is larger than the Issue Pi pane", () => {
		const sub = { id: 10, env: { [SUBAGENT_PANE_ENV_MARKER]: "a" }, columns: 100, lines: 24 };
		const issue = { id: 11, env: { [ISSUE_PI_ENV_MARKER]: "1" }, columns: 40, lines: 24 };
		expect(pickLargestNonMainPane([sub, issue])).toEqual(sub);
	});
});

describe("chooseNonMainPaneSplit", () => {
	it("returns undefined when no non-Main pane exists (first subagent call)", () => {
		expect(chooseNonMainPaneSplit([{ id: 1, title: "pi", columns: 200, lines: 50 }])).toBeUndefined();
	});

	it("anchors to the largest non-Main pane with vsplit when wide enough", () => {
		const windows: KittyWindowLike[] = [
			{ id: 1, title: "pi", columns: 200, lines: 50 },
			{ id: 11, env: { [ISSUE_PI_ENV_MARKER]: "1" }, columns: 160, lines: 50 },
		];
		expect(chooseNonMainPaneSplit(windows)).toEqual({ windowId: 11, location: "vsplit" });
	});

	it("anchors to a subagent pane when it is the only non-Main pane", () => {
		const windows: KittyWindowLike[] = [
			{ id: 1, title: "pi", columns: 200, lines: 50 },
			{ id: 20, env: { [SUBAGENT_PANE_ENV_MARKER]: "a" }, columns: 160, lines: 50 },
		];
		expect(chooseNonMainPaneSplit(windows)).toEqual({ windowId: 20, location: "vsplit" });
	});
});

// ---------------------------------------------------------------------------
// chooseIssuePaneSplitForIssue (ADR-0021 extension: review-fixer per-issue)
// ---------------------------------------------------------------------------

describe("chooseIssuePaneSplitForIssue", () => {
	it("returns undefined when no pane matches the issue number", () => {
		expect(chooseIssuePaneSplitForIssue([{ id: 1, title: "pi", columns: 200, lines: 50 }], 42)).toBeUndefined();
	});

	it("anchors to the Work Pi pane matched by env child marker", () => {
		const windows: KittyWindowLike[] = [
			{ id: 1, title: "pi", columns: 200, lines: 50 },
			{ id: 11, env: { [ISSUE_PI_ENV_MARKER]: "1", [AUTOPILOT_CHILD_ENV_MARKER]: "42" }, columns: 160, lines: 50 },
			{ id: 12, env: { [ISSUE_PI_ENV_MARKER]: "1", [ORCHESTRATION_CHILD_ENV_MARKER]: "7" }, columns: 160, lines: 50 },
		];
		expect(chooseIssuePaneSplitForIssue(windows, 42)).toEqual({ windowId: 11, location: "vsplit" });
	});

	it("anchors to the Work Pi pane matched by title fallback", () => {
		const windows: KittyWindowLike[] = [
			{ id: 1, title: "pi", columns: 200, lines: 50 },
			{ id: 11, title: "π - Issue #42 - issue-42", columns: 160, lines: 50 },
		];
		expect(chooseIssuePaneSplitForIssue(windows, 42)).toEqual({ windowId: 11, location: "vsplit" });
	});

	it("does not match a different issue number", () => {
		const windows: KittyWindowLike[] = [
			{ id: 11, env: { [ISSUE_PI_ENV_MARKER]: "1", [AUTOPILOT_CHILD_ENV_MARKER]: "42" }, columns: 160, lines: 50 },
		];
		expect(chooseIssuePaneSplitForIssue(windows, 7)).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// findIssuePiAnchorWindowId (drives kitten @ ls)
// ---------------------------------------------------------------------------

// control.ts uses promisify(execFile) and expects { stdout, stderr }. A plain
// vi.fn would make generic promisify resolve to a single value, so we attach
// promisify.custom (well-known symbol) to mirror child_process.execFile.
// vi.hoisted keeps the shared map/factory reachable from the hoisted vi.mock.
const { execResults, mockExecFile, mockSpawn } = vi.hoisted(() => {
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
	// Minimal ChildProcess-like emitter for `spawn`: renderImage awaits "close",
	// so the mock emits it on the next microtask to mimic a child that exits.
	function buildMockSpawn() {
		return vi.fn(() => {
			const handlers = new Map<string, Array<(...args: unknown[]) => void>>();
			const emitter = {
				on(event: string, cb: (...args: unknown[]) => void) {
					const list = handlers.get(event) ?? [];
					list.push(cb);
					handlers.set(event, list);
					if (event === "close") queueMicrotask(() => list.forEach((h) => h(0)));
					return emitter;
				},
			};
			return emitter;
		});
	}
	return { execResults, mockExecFile: buildMockExecFile(), mockSpawn: buildMockSpawn() };
});

vi.mock("node:child_process", () => ({
	execFile: mockExecFile,
	spawn: mockSpawn,
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

	it("anchors on an existing Issue Pi pane identified by env marker, even when pi has rewritten its title to π - <cwd>", async () => {
		// The anchor must recognize a running Work Pi via its MEKANN_ISSUE_PI env
		// marker. After pi inits it rewrites the title to `π - <cwd>` (no Issue #N),
		// so title-only detection would miss it and the next /issue would wrongly
		// split the Main Pi (ADR-0021 violation). Env detection prevents that.
		setLsResult(
			JSON.stringify([
				{ id: 1, title: "π - mekann", columns: 100, lines: 50, is_focused: true },
				{ id: 11, title: "π - Issue #42 - issue-42", columns: 120, lines: 50, env: { MEKANN_ISSUE_PI: "1" } },
			]),
		);
		const kitty = new KittyControl();
		expect(await kitty.findIssuePaneSplitAnchor()).toEqual({ windowId: 11, location: "vsplit" });
	});
});

describe("KittyControl.findNonMainPaneSplit", () => {
	beforeEach(() => execResults.clear());
	afterEach(() => vi.mocked(execFileCb).mockClear());

	function setLsResult(stdout: string) {
		execResults.set("kitten @ ls", { stdout });
	}

	it("anchors to the largest non-Main pane (Issue Pi vs subagent by area)", async () => {
		setLsResult(
			JSON.stringify([
				{ id: 1, title: "pi", columns: 200, lines: 50, is_focused: true },
				{ id: 20, env: { PI_SUBAGENT_ID: "a" }, columns: 40, lines: 24 },
				{ id: 11, title: "Issue #42", columns: 120, lines: 50 },
			]),
		);
		const kitty = new KittyControl();
		// 120×50 (6000) > 40×24 (960) → Issue Pi pane wins; wide enough → vsplit
		expect(await kitty.findNonMainPaneSplit()).toEqual({ windowId: 11, location: "vsplit" });
	});

	it("prefers the subagent pane when it is larger than the Issue Pi pane", async () => {
		setLsResult(
			JSON.stringify([
				{ id: 1, title: "pi", columns: 200, lines: 50 },
				{ id: 20, env: { PI_SUBAGENT_ID: "a" }, columns: 120, lines: 50 },
				{ id: 11, env: { MEKANN_ISSUE_PI: "1" }, columns: 40, lines: 24 },
			]),
		);
		const kitty = new KittyControl();
		expect(await kitty.findNonMainPaneSplit()).toEqual({ windowId: 20, location: "vsplit" });
	});

	it("returns undefined when only the Main Pi exists (first subagent call)", async () => {
		setLsResult(
			JSON.stringify([{ id: 1, title: "pi", columns: 200, lines: 50, is_focused: true }]),
		);
		const kitty = new KittyControl();
		expect(await kitty.findNonMainPaneSplit()).toBeUndefined();
	});

	it("returns undefined when kitten @ ls fails", async () => {
		execResults.set("kitten @ ls", new Error("boom"));
		const kitty = new KittyControl();
		expect(await kitty.findNonMainPaneSplit()).toBeUndefined();
	});
});

describe("KittyControl.findIssuePiPaneSplitForIssue", () => {
	beforeEach(() => execResults.clear());
	afterEach(() => vi.mocked(execFileCb).mockClear());

	function setLsResult(stdout: string) {
		execResults.set("kitten @ ls", { stdout });
	}

	it("anchors to the Work Pi pane matched by env child marker", async () => {
		setLsResult(
			JSON.stringify([
				{ id: 1, title: "pi", columns: 200, lines: 50 },
				{ id: 11, title: "π - Issue #42 - issue-42", columns: 160, lines: 50, env: { MEKANN_ISSUE_PI: "1", MEKANN_AUTOPILOT_CHILD: "42" } },
				{ id: 12, title: "π - Issue #7 - issue-7", columns: 160, lines: 50, env: { MEKANN_ISSUE_PI: "1", MEKANN_ORCHESTRATION_CHILD: "7" } },
			]),
		);
		const kitty = new KittyControl();
		expect(await kitty.findIssuePiPaneSplitForIssue(42)).toEqual({ windowId: 11, location: "vsplit" });
	});

	it("returns undefined when no pane matches the issue number", async () => {
		setLsResult(
			JSON.stringify([
				{ id: 1, title: "pi", columns: 200, lines: 50 },
				{ id: 11, title: "Issue #42", columns: 160, lines: 50 },
			]),
		);
		const kitty = new KittyControl();
		expect(await kitty.findIssuePiPaneSplitForIssue(7)).toBeUndefined();
	});

	it("returns undefined when kitten @ ls fails", async () => {
		execResults.set("kitten @ ls", new Error("boom"));
		const kitty = new KittyControl();
		expect(await kitty.findIssuePiPaneSplitForIssue(42)).toBeUndefined();
	});
});

describe("KittyControl.launchWindow (source-window / env)", () => {
	beforeEach(() => execResults.clear());
	afterEach(() => {
		vi.mocked(execFileCb).mockClear();
		delete process.env.KITTY_WINDOW_ID;
	});

	it("emits --source-window id:<id> and suppresses --match when sourceWindowId is set", async () => {
		const kitty = new KittyControl();
		await kitty.launchWindow({ cwd: "/tmp", location: "vsplit", argv: ["sh"], sourceWindowId: 42 });
		const args = vi.mocked(execFileCb).mock.calls.at(-1)?.[1] as string[];
		expect(args).toContain("--source-window");
		expect(args).toContain("id:42");
		expect(args).not.toContain("--match");
	});

	it("emits --env NAME=VALUE for each env entry", async () => {
		const kitty = new KittyControl();
		await kitty.launchWindow({ cwd: "/tmp", location: "vsplit", argv: ["sh"], env: { PI_SUBAGENT_ID: "abc", PI_SUBAGENT_PATH: "/x" } });
		const args = vi.mocked(execFileCb).mock.calls.at(-1)?.[1] as string[];
		expect(args).toContain("--env");
		expect(args).toContain("PI_SUBAGENT_ID=abc");
		expect(args).toContain("PI_SUBAGENT_PATH=/x");
	});

	it("falls back to --match id:<KITTY_WINDOW_ID> when sourceWindowId is absent", async () => {
		process.env.KITTY_WINDOW_ID = "7";
		const kitty = new KittyControl();
		await kitty.launchWindow({ cwd: "/tmp", location: "vsplit", argv: ["sh"], matchCurrentWindow: true });
		const args = vi.mocked(execFileCb).mock.calls.at(-1)?.[1] as string[];
		expect(args).toContain("--match");
		expect(args).toContain("id:7");
		expect(args).not.toContain("--source-window");
	});
});

describe("KittyControl.hasIssuePiPane", () => {
	const prevKittyWindowId = process.env.KITTY_WINDOW_ID;

	beforeEach(() => {
		execResults.clear();
		// hasIssuePiPane short-circuits to false outside kitty; force the marker so
		// the title-matching path is exercised regardless of the host terminal.
		process.env.KITTY_WINDOW_ID = "1";
	});
	afterEach(() => {
		vi.mocked(execFileCb).mockClear();
		if (prevKittyWindowId === undefined) delete process.env.KITTY_WINDOW_ID;
		else process.env.KITTY_WINDOW_ID = prevKittyWindowId;
	});

	function setLsResult(stdout: string) {
		execResults.set("kitten @ ls", { stdout });
	}

	it("detects a Work Pi by its kitty title Issue #<n>", async () => {
		setLsResult(JSON.stringify([{ id: 11, title: "Issue #42", columns: 80, lines: 24 }]));
		expect(await new KittyControl().hasIssuePiPane(42)).toBe(true);
	});

	it("detects a Work Pi after pi overrides the title to π - Issue #N - <cwd>", async () => {
		// Regression: pi's interactive mode sets its own terminal title
		// (`updateTerminalTitle` → `π - <sessionName> - <cwdBasename>`), overriding
		// kitty's --title. Detection must match `Issue #N` anywhere in the title.
		setLsResult(JSON.stringify([{ id: 11, title: "π - Issue #42 - issue-42", columns: 80, lines: 24 }]));
		expect(await new KittyControl().hasIssuePiPane(42)).toBe(true);
	});

	it("detects a Work Pi via env marker before pi overrides the title (init race)", async () => {
		// The real regression: the autopilot supervisor's appear timeout can elapse
		// before pi finishes initializing and rewrites the title. The env marker is
		// set at launch time, so detection must succeed even while the title is
		// still the bare kitty --title (or anything else).
		setLsResult(
			JSON.stringify([
				{ id: 11, title: "Issue #42", columns: 80, lines: 24, env: { MEKANN_ISSUE_PI: "1", MEKANN_AUTOPILOT_CHILD: "42" } },
			]),
		);
		expect(await new KittyControl().hasIssuePiPane(42)).toBe(true);
	});

	it("detects by env marker when the title carries no Issue #N at all", async () => {
		setLsResult(
			JSON.stringify([
				{ id: 11, title: "π - mekann", columns: 80, lines: 24, env: { MEKANN_ISSUE_PI: "1", MEKANN_ORCHESTRATION_CHILD: "42" } },
			]),
		);
		expect(await new KittyControl().hasIssuePiPane(42)).toBe(true);
	});

	it("does not match the Issues list pane or a different issue number", async () => {
		setLsResult(
			JSON.stringify([
				{ id: 1, title: "Issues", columns: 80, lines: 24 },
				{ id: 12, title: "π - Issue #43 - issue-43", columns: 80, lines: 24 },
			]),
		);
		expect(await new KittyControl().hasIssuePiPane(42)).toBe(false);
	});

	it("respects the digit boundary so #42 does not match #421", async () => {
		setLsResult(JSON.stringify([{ id: 11, title: "π - Issue #421 - issue-421", columns: 80, lines: 24 }]));
		expect(await new KittyControl().hasIssuePiPane(42)).toBe(false);
		expect(await new KittyControl().hasIssuePiPane(421)).toBe(true);
	});

	it("returns false when kitten @ ls fails", async () => {
		execResults.set("kitten @ ls", new Error("remote control unavailable"));
		expect(await new KittyControl().hasIssuePiPane(42)).toBe(false);
	});
});

describe("KittyControl.renderImage (async, non-blocking — IC-088)", () => {
	beforeEach(() => execResults.clear());
	afterEach(() => vi.mocked(spawnCb).mockClear());

	it("invokes kitten icat via async spawn with an inherited TTY (not blocking spawnSync)", async () => {
		// renderImage must not block the event loop for the hundreds of ms icat can
		// take. The mock spawn emits "close" on the next microtask so the awaited
		// promise resolves; what matters is that it went through the async spawn
		// path (not spawnSync) with the right argv and stdio: "inherit".
		const kitty = new KittyControl();
		await kitty.renderImage({ path: "/tmp/img.png", columns: 10, rows: 5, x: 1, y: 2 });

		const call = vi.mocked(spawnCb).mock.calls.at(-1);
		expect(call?.[0]).toBe("kitten");
		const args = call?.[1] as string[];
		expect(args[0]).toBe("icat");
		expect(args).toContain("--place");
		expect(args).toContain("10x5@1x2");
		expect(args).toContain("/tmp/img.png");
		const opts = call?.[2] as { stdio?: string };
		expect(opts?.stdio).toBe("inherit");
	});
});
