import { execFile as execFileCb, spawnSync } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

export type KittySplitLocation = "vsplit" | "hsplit";

export interface KittyWindowLike {
	id?: number;
	is_focused?: boolean;
	columns?: number;
	lines?: number;
	[key: string]: unknown;
}

export interface KittyLaunchOptions {
	cwd: string;
	argv: string[];
	title?: string;
	vars?: Record<string, string>;
	copyEnv?: boolean;
	hold?: boolean;
	allowRemoteControl?: boolean;
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
 * Title prefix that identifies an Issue Pi pane (ADR-0021). The issue list
 * pane is titled `Issues` (plural, no number) and intentionally does NOT match,
 * so it is never chosen as a split anchor.
 */
export const ISSUE_PANE_TITLE_PATTERN = /^Issue #\d+/;

/**
 * Pick the widest Issue Pi pane by `columns` (maximin) to use as the split
 * anchor. Returns `undefined` when no Issue Pi pane exists — callers should
 * then fall back to splitting the focused window (Main Pi).
 */
export function pickWidestIssuePiPane(windows: KittyWindowLike[]): KittyWindowLike | undefined {
	const issuePanes = windows.filter((window) => typeof window.title === "string" && ISSUE_PANE_TITLE_PATTERN.test(window.title));
	if (issuePanes.length === 0) return undefined;
	return issuePanes.reduce((widest, pane) => ((pane.columns ?? 0) > (widest.columns ?? 0) ? pane : widest));
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
			const pane = pickWidestIssuePiPane(windows);
			return typeof pane?.id === "number" ? pane.id : undefined;
		} catch {
			return undefined;
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
		spawnSync(this.kittenBin, ["icat", "--silent", "--transfer-mode=file", "--align=left", "--scale-up=yes", "--place", `${options.columns}x${options.rows}@${options.x}x${options.y}`, options.path], { stdio: "inherit" });
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
		if (options.matchCurrentWindow && process.env.KITTY_WINDOW_ID) {
			args.push("--match", `id:${process.env.KITTY_WINDOW_ID}`);
		}
		args.push(...options.argv);

		const { stdout } = await execFile(this.kittenBin, args, { timeout: options.timeoutMs ?? 5000 });
		return { windowId: stdout.trim() || undefined };
	}
}
