import { execFile as execFileCb } from "node:child_process";
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

function collectKittyWindows(value: unknown, windows: KittyWindowLike[] = []): KittyWindowLike[] {
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
