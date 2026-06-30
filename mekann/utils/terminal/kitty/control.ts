import { execFile as execFileCb, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

export type KittySplitLocation = "vsplit" | "hsplit";

export interface KittyWindowLike {
	id?: number;
	is_focused?: boolean;
	columns?: number;
	lines?: number;
	/** Per-window environment exposed by `kitty @ ls` (only vars differing from kitty's process). */
	env?: Record<string, string>;
	[key: string]: unknown;
}

export interface KittyLaunchOptions {
	cwd: string;
	argv: string[];
	title?: string;
	vars?: Record<string, string>;
	/** Per-window environment variables set via `--env NAME=VALUE`.
	 *
	 * Unlike `vars` (kitty variables), `--env` variables are reported in the
	 * window's `env` field by `kitty @ ls`, so they are the reliable signal for
	 * pane identification (e.g. `PI_SUBAGENT_ID` for subagent panes). */
	env?: Record<string, string>;
	copyEnv?: boolean;
	hold?: boolean;
	allowRemoteControl?: boolean;
	/** Explicit kitty window id to split from (`--source-window id:<id>`).
	 *
	 * Takes precedence over `matchCurrentWindow`. Used by subagent/review-fixer
	 * split anchoring (ADR-0021 extension) so a child pane opens next to a
	 * chosen parent pane rather than the focused window. */
	sourceWindowId?: number;
	matchCurrentWindow?: boolean;
	timeoutMs?: number;
}

export interface KittyLaunchResult {
	windowId?: string;
}

export function collectKittyWindows(value: unknown, windows: KittyWindowLike[] = []): KittyWindowLike[] {
	if (!value || typeof value !== "object") return windows;
	if (Array.isArray(value)) {
		for (const item of value) collectKittyWindows(item, windows);
		return windows;
	}

	const object = value as KittyWindowLike;
	if (typeof object.id === "number" && (typeof object.columns === "number" || typeof object.lines === "number")) {
		windows.push(object);
	}
	for (const child of Object.values(object)) {
		collectKittyWindows(child, windows);
	}
	return windows;
}

/**
 * Title substring that identifies an Issue Pi pane (ADR-0021).
 *
 * NOTE: pi's interactive mode sets its own terminal title via OSC
 * (`updateTerminalTitle` → `π - <sessionName> - <cwdBasename>`), which
 * OVERRIDES the `--title "Issue #<n>"` we pass to `kitten @ launch`. The Work
 * Pi therefore ends up titled e.g. `π - Issue #42 - issue-42`. To stay robust
 * against that prefix, we match `Issue #<n>` anywhere in the title rather
 * than only at the start. The issue list pane is titled `Issues` (plural, no
 * number) and intentionally does NOT match, so it is never chosen as a split
 * anchor nor detected as an active Work Pi.
 */
export const ISSUE_PANE_TITLE_PATTERN = /Issue #\d+/;

/**
 * Env markers that identify an Issue Work Pi pane. `launchPiSessionInKittySplit`
 * (terminal/pi-session.ts) sets `MEKANN_ISSUE_PI=1` on EVERY issue Pi launch,
 * plus a child-number marker — `MEKANN_AUTOPILOT_CHILD` for the autopilot
 * supervisor (#112) or `MEKANN_ORCHESTRATION_CHILD` for parent/child
 * orchestration (#71).
 *
 * These are the PRIMARY detection signal. Unlike the kitty window title —
 * which pi rewrites to `π - <name> - <cwd>` only AFTER interactive mode
 * finishes initializing (heavy on extension-rich repos, racing the
 * supervisor's appear timeout) — env markers are set at launch time and pi
 * never overrides them. The title pattern remains as a fallback. A
 * drift-guard test asserts these strings match the launcher's constants.
 */
export const ISSUE_PI_ENV_MARKER = "MEKANN_ISSUE_PI";
export const AUTOPILOT_CHILD_ENV_MARKER = "MEKANN_AUTOPILOT_CHILD";
export const ORCHESTRATION_CHILD_ENV_MARKER = "MEKANN_ORCHESTRATION_CHILD";

/** Env marker identifying a subagent pane. `KittyController.launchPiSplit` /
 * `launchPiWindow` set `PI_SUBAGENT_ID` via `--env` on every subagent launch so
 * `kitty @ ls` reliably reports it in the window `env` field (kitty variables
 * set via `--var` are the match signal; `--env` is the identification signal).
 * Used to group subagent splits onto existing non-Main panes (ADR-0021
 * extension) instead of re-splitting the Main Pi. */
export const SUBAGENT_PANE_ENV_MARKER = "PI_SUBAGENT_ID";

/** True when the pane carries the Issue Pi env marker (`MEKANN_ISSUE_PI=1`). */
export function isIssuePiEnvWindow(window: KittyWindowLike): boolean {
	return window.env?.[ISSUE_PI_ENV_MARKER] === "1";
}

/** True when the pane carries a subagent env marker (`PI_SUBAGENT_ID`). */
export function isSubagentPane(window: KittyWindowLike): boolean {
	return window.env?.[SUBAGENT_PANE_ENV_MARKER] !== undefined;
}

/**
 * The issue number a Work Pi pane was started for, read from its child env
 * marker (autopilot or orchestration), or null when absent/invalid. Drives
 * exact per-issue detection in {@link isWorkPiForIssue} / `hasIssuePiPane`.
 */
export function issueChildNumberFromWindow(window: KittyWindowLike): number | null {
	const raw = window.env?.[AUTOPILOT_CHILD_ENV_MARKER] ?? window.env?.[ORCHESTRATION_CHILD_ENV_MARKER];
	const num = Number(raw);
	return Number.isFinite(num) && num > 0 ? num : null;
}

/**
 * Post-split floors and aspect ratio used to choose an Issue Pi pane's split
 * direction (issue #102 / ADR-0024). A direction is only taken when each
 * resulting half still meets its minimum, so consecutive expansions never
 * collapse panes into thin slivers. `RATIO` is how many times wider than tall a
 * pane must be to prefer a left/right (`vsplit`) split.
 */
export const ISSUE_PANE_SPLIT_MIN_WIDTH = 40;
export const ISSUE_PANE_SPLIT_MIN_HEIGHT = 15;
export const ISSUE_PANE_SPLIT_RATIO = 1.3;

export interface IssuePaneSplitOptions {
	minWidth?: number;
	minHeight?: number;
	ratio?: number;
}

export interface IssuePaneSplit {
	windowId: number;
	location: KittySplitLocation;
}

function isIssuePiPane(window: KittyWindowLike): boolean {
	// Primary: env marker set at launch, never overridden by pi. Fallback: title
	// pattern (for panes launched before env markers existed, and as a defensive
	// backstop once pi rewrites the title to `π - Issue #N - <cwd>`).
	if (isIssuePiEnvWindow(window)) return true;
	return typeof window.title === "string" && ISSUE_PANE_TITLE_PATTERN.test(window.title);
}

/** True when the pane is anything other than the Main Pi: an Issue Work Pi
 * pane or a subagent pane. These are eligible split anchors so child panes
 * (subagents, review-fixer children) open next to an existing non-Main pane
 * instead of re-splitting (and shrinking) the Main Pi (ADR-0021 extension). */
export function isNonMainPane(window: KittyWindowLike): boolean {
	return isIssuePiPane(window) || isSubagentPane(window);
}

/**
 * True when a window is the Work Pi for a specific issue number. Primary: the
 * env child marker (exact, set at launch). Fallback: the title `Issue #<n>`
 * (matched anywhere, since pi rewrites the kitty title once it initializes).
 * The `(\\D|$)` boundary keeps `#42` from matching `#421`.
 */
export function isWorkPiForIssue(window: KittyWindowLike, issueNumber: number): boolean {
	if (issueChildNumberFromWindow(window) === issueNumber) return true;
	const pattern = new RegExp(`Issue #${issueNumber}(\\D|$)`);
	return typeof window.title === "string" && pattern.test(window.title);
}

function issuePaneArea(pane: KittyWindowLike): number {
	return (pane.columns ?? 0) * (pane.lines ?? 0);
}

/** Longer-side split direction for a pane of the given size (`vsplit` when at least as wide as tall, else `hsplit`). */
function longerSideLocation(width: number, height: number): KittySplitLocation {
	return width >= height ? "vsplit" : "hsplit";
}

/**
 * Pick the widest Issue Pi pane by `columns` (maximin) to use as the split
 * anchor. Returns `undefined` when no Issue Pi pane exists — callers should
 * then fall back to splitting the focused window (Main Pi).
 */
export function pickWidestIssuePiPane(windows: KittyWindowLike[]): KittyWindowLike | undefined {
	const issuePanes = windows.filter(isIssuePiPane);
	if (issuePanes.length === 0) return undefined;
	return issuePanes.reduce((widest, pane) => ((pane.columns ?? 0) > (widest.columns ?? 0) ? pane : widest));
}

/**
 * Pick the largest-area Issue Pi pane (`columns × lines`) to use as the split
 * anchor (issue #102 / ADR-0024). Area generalizes the columns-only "widest"
 * rule: the pane with the most room is the best candidate to halve. Panes
 * missing size info contribute area 0. Returns `undefined` when no Issue Pi
 * pane exists — callers then fall back to splitting the focused window.
 */
export function pickLargestIssuePiPane(windows: KittyWindowLike[]): KittyWindowLike | undefined {
	const issuePanes = windows.filter(isIssuePiPane);
	if (issuePanes.length === 0) return undefined;
	return issuePanes.reduce((largest, pane) => (issuePaneArea(pane) > issuePaneArea(largest) ? pane : largest));
}

/**
 * Choose which way to split a pane of the given size (issue #102 / ADR-0024).
 *
 * Kitty's `vsplit` splits a pane left/right (each half keeps the full height
 * but half the width); `hsplit` splits top/bottom. We prefer `vsplit` only when
 * the pane is meaningfully wider than tall AND halving the width still leaves
 * each half at least `minWidth` columns. Otherwise we prefer `hsplit` when
 * height allows it, then fall back to left/right only when width still fits.
 * Returns `undefined` when neither direction can satisfy its post-split floor;
 * `chooseIssuePaneSplit` then degrades to the longer side so it still anchors to
 * an existing pane (see its doc for why).
 */
export function decideSplitLocation(width: number, height: number, options: IssuePaneSplitOptions = {}): KittySplitLocation | undefined {
	const minWidth = options.minWidth ?? ISSUE_PANE_SPLIT_MIN_WIDTH;
	const minHeight = options.minHeight ?? ISSUE_PANE_SPLIT_MIN_HEIGHT;
	const ratio = options.ratio ?? ISSUE_PANE_SPLIT_RATIO;

	const canVsplit = width / 2 >= minWidth;
	const canHsplit = height / 2 >= minHeight;
	const widerThanTall = width > height * ratio;

	if (canVsplit && widerThanTall) return "vsplit";
	if (canHsplit) return "hsplit";
	if (canVsplit) return "vsplit";
	return undefined;
}

/**
 * Pick the largest-area Issue Pi pane and decide which way to split it
 * (issue #102 / ADR-0024). Returns the anchor window id and kitty split
 * location, or `undefined` only when no Issue Pi pane exists (first /issue
 * call), in which case the caller splits the focused window instead.
 *
 * When the largest pane cannot be split within `MIN_WIDTH`/`MIN_HEIGHT` in
 * either direction (a terminal already crowded with small panes after several
 * expansions), we still anchor to that pane and split it along its longer side.
 * Reporting "no anchor" instead would make the caller split the focused window,
 * which on the Nth /issue call is the Main Pi and would re-shrink it — breaking
 * ADR-0021. Protecting Main Pi outranks the post-split floors in this
 * inherently unsatisfiable case.
 */
export function chooseIssuePaneSplit(windows: KittyWindowLike[], options: IssuePaneSplitOptions = {}): IssuePaneSplit | undefined {
	const pane = pickLargestIssuePiPane(windows);
	if (!pane || typeof pane.id !== "number") return undefined;
	const width = typeof pane.columns === "number" ? pane.columns : 0;
	const height = typeof pane.lines === "number" ? pane.lines : 0;
	// Degrade to the longer side when no direction keeps both halves above their
	// floor — see the function doc for why we still anchor instead of giving up.
	const location = decideSplitLocation(width, height, options) ?? longerSideLocation(width, height);
	return { windowId: pane.id, location };
}

/** Pick the largest-area non-Main pane (`columns × lines`) to use as the split
 * anchor for a generic subagent (ADR-0021 extension). Subagent panes and Issue
 * Pi panes are both eligible so consecutive subagents stack next to each other
 * (or next to an Issue Pi) rather than re-splitting the Main Pi. Panes missing
 * size info contribute area 0. Returns `undefined` when no non-Main pane exists
 * (first subagent call), in which case the caller splits the focused window. */
export function pickLargestNonMainPane(windows: KittyWindowLike[]): KittyWindowLike | undefined {
	const panes = windows.filter(isNonMainPane);
	if (panes.length === 0) return undefined;
	return panes.reduce((largest, pane) => (issuePaneArea(pane) > issuePaneArea(largest) ? pane : largest));
}

/** Choose the largest non-Main pane and which way to split it (ADR-0021
 * extension). Mirrors {@link chooseIssuePaneSplit}: post-split floors from
 * ADR-0024 are honoured, degrading to the longer side when neither direction
 * keeps both halves above its floor. Returns `undefined` only when no non-Main
 * pane exists (first subagent call), so the caller falls back to the focused
 * window (Main Pi) — exactly the ADR-0021 "first split only" rule. */
export function chooseNonMainPaneSplit(windows: KittyWindowLike[], options: IssuePaneSplitOptions = {}): IssuePaneSplit | undefined {
	const pane = pickLargestNonMainPane(windows);
	if (!pane || typeof pane.id !== "number") return undefined;
	const width = typeof pane.columns === "number" ? pane.columns : 0;
	const height = typeof pane.lines === "number" ? pane.lines : 0;
	const location = decideSplitLocation(width, height, options) ?? longerSideLocation(width, height);
	return { windowId: pane.id, location };
}

/** Choose the Work Pi pane for a specific issue number and which way to split
 * it (ADR-0021 extension, review-fixer). Used by `review_fixer` so its child
 * pane opens next to the parent Issue Pi rather than the focused window.
 * Per-issue identification reuses {@link isWorkPiForIssue} (env child marker,
 * title fallback). Returns `undefined` when no pane for that issue exists. */
export function chooseIssuePaneSplitForIssue(windows: KittyWindowLike[], issueNumber: number, options: IssuePaneSplitOptions = {}): IssuePaneSplit | undefined {
	const pane = windows.find((window) => isWorkPiForIssue(window, issueNumber));
	if (!pane || typeof pane.id !== "number") return undefined;
	const width = typeof pane.columns === "number" ? pane.columns : 0;
	const height = typeof pane.lines === "number" ? pane.lines : 0;
	const location = decideSplitLocation(width, height, options) ?? longerSideLocation(width, height);
	return { windowId: pane.id, location };
}

export class KittyControl {
	constructor(private readonly kittenBin = "kitten") {}

	isKittyEnvironment(): boolean {
		return Boolean(process.env.KITTY_WINDOW_ID);
	}

	async currentWindowSize(): Promise<{ columns: number; lines: number } | undefined> {
		let stdout = "";
		try {
			const result = await execFile(this.kittenBin, ["@", "ls"], { timeout: 2000 });
			stdout = result.stdout;
		} catch {
			return undefined;
		}
		if (!stdout) return undefined;

		try {
			const windows = collectKittyWindows(JSON.parse(stdout));
			const currentWindowId = Number(process.env.KITTY_WINDOW_ID);
			const current = Number.isFinite(currentWindowId) ? windows.find((window) => window.id === currentWindowId) : undefined;
			const focused = windows.find((window) => window.is_focused);
			const window = current ?? focused;
			if (typeof window?.columns === "number" && typeof window.lines === "number") {
				return { columns: window.columns, lines: window.lines };
			}
		} catch {
			return undefined;
		}
		return undefined;
	}

	async findIssuePiAnchorWindowId(): Promise<number | undefined> {
		const windows = await this.listAllWindows();
		const pane = pickWidestIssuePiPane(windows);
		return typeof pane?.id === "number" ? pane.id : undefined;
	}

	/**
	 * Resolve the Issue Pi pane to split next and which direction to split it
	 * (issue #102 / ADR-0024). Returns `undefined` on the first /issue call (no
	 * Issue Pi pane yet) or when the `kitten @ ls` lookup fails, so the caller
	 * falls back to splitting the focused window.
	 */
	async findIssuePaneSplitAnchor(options?: IssuePaneSplitOptions): Promise<IssuePaneSplit | undefined> {
		const windows = await this.listAllWindows();
		return chooseIssuePaneSplit(windows, options);
	}

	/** Resolve the largest non-Main pane to split next and which direction
	 * (ADR-0021 extension for generic subagents). Returns `undefined` on the
	 * first subagent call (no non-Main pane yet) or when `kitten @ ls` fails, so
	 * the caller falls back to splitting the focused window (Main Pi). */
	async findNonMainPaneSplit(options?: IssuePaneSplitOptions): Promise<IssuePaneSplit | undefined> {
		const windows = await this.listAllWindows();
		return chooseNonMainPaneSplit(windows, options);
	}

	/** Resolve the Work Pi pane for `issueNumber` and which direction to split it
	 * (ADR-0021 extension for review-fixer). Returns `undefined` when no pane for
	 * that issue exists or `kitten @ ls` fails, so the caller falls back to
	 * splitting the focused window. */
	async findIssuePiPaneSplitForIssue(issueNumber: number, options?: IssuePaneSplitOptions): Promise<IssuePaneSplit | undefined> {
		const windows = await this.listAllWindows();
		return chooseIssuePaneSplitForIssue(windows, issueNumber, options);
	}

	/**
	 * True when a Kitty pane for `issueNumber`'s Work Pi is currently open.
	 * Used by autopilot + orchestration for double-launch prevention. Detects via
	 * the env child marker (primary, set at launch) with the title as a fallback.
	 * Returns false when not in Kitty or the lookup fails (safe side).
	 */
	async hasIssuePiPane(issueNumber: number): Promise<boolean> {
		if (!this.isKittyEnvironment()) return false;
		const windows = await this.listAllWindows();
		return windows.some((window) => isWorkPiForIssue(window, issueNumber));
	}

	/** Fetch and parse all windows from `kitty @ ls`. Empty on failure. */
	private async listAllWindows(): Promise<KittyWindowLike[]> {
		let stdout = "";
		try {
			const result = await execFile(this.kittenBin, ["@", "ls"], { timeout: 2000 });
			stdout = result.stdout;
		} catch {
			return [];
		}
		if (!stdout) return [];
		try {
			return collectKittyWindows(JSON.parse(stdout));
		} catch {
			return [];
		}
	}

	async longerSideSplitLocation(): Promise<KittySplitLocation> {
		const size = await this.currentWindowSize();
		if (!size) return "vsplit";

		// Terminal cells are usually taller than they are wide, so compare columns
		// against roughly two times the line count to approximate the visually longer side.
		return size.columns >= size.lines * 2 ? "vsplit" : "hsplit";
	}

	async launchSplitLongerSide(options: KittyLaunchOptions): Promise<KittyLaunchResult> {
		const location = await this.longerSideSplitLocation();
		return await this.launchWindow({ ...options, location });
	}

	async renderImage(options: { path: string; columns: number; rows: number; x: number; y: number }): Promise<void> {
		// spawn (async) with an inherited TTY instead of the blocking spawnSync:
		// image rendering must not block the event loop for the hundreds of ms
		// `kitten icat` can take (IC-088). stdio: "inherit" lets icat place the image
		// on the real TTY — its graphics-protocol escapes must reach the terminal,
		// not a pipe buffer — and we await "close" so the image is fully drawn
		// before the caller proceeds (same ordering as the old blocking call, but
		// non-blocking).
		await new Promise<void>((resolve, reject) => {
			const child = spawn(this.kittenBin, ["icat", "--silent", "--transfer-mode=file", "--align=left", "--scale-up=yes", "--place", `${options.columns}x${options.rows}@${options.x}x${options.y}`, options.path], { stdio: "inherit" });
			child.on("error", reject);
			child.on("close", () => resolve());
		});
	}

	async launchWindow(options: KittyLaunchOptions & { location: KittySplitLocation }): Promise<KittyLaunchResult> {
		if (options.argv.length === 0) throw new Error("kitty launch requires argv");

		const args = ["@", "launch", "--type=window", "--location", options.location, "--cwd", options.cwd];
		if (options.title) args.push("--title", options.title);
		for (const [key, value] of Object.entries(options.vars ?? {})) {
			args.push("--var", `${key}=${value}`);
		}
		if (options.copyEnv) args.push("--copy-env");
		if (options.hold) args.push("--hold");
		if (options.allowRemoteControl) args.push("--allow-remote-control");
		for (const [key, value] of Object.entries(options.env ?? {})) {
			args.push("--env", `${key}=${value}`);
		}
		// --source-window (explicit anchor) takes precedence over --match (focused).
		if (typeof options.sourceWindowId === "number") {
			args.push("--source-window", `id:${options.sourceWindowId}`);
		} else if (options.matchCurrentWindow && process.env.KITTY_WINDOW_ID) {
			args.push("--match", `id:${process.env.KITTY_WINDOW_ID}`);
		}
		args.push(...options.argv);

		const { stdout } = await execFile(this.kittenBin, args, { timeout: options.timeoutMs ?? 5000 });
		return { windowId: stdout.trim() || undefined };
	}
}
