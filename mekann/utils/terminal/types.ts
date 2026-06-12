export type TerminalAction =
	| {
		mode: "argv";
		argv: string[];
	}
	| {
		mode: "shell";
		command: string;
	};

export type LaunchPreference = "pass-through" | "split-longer-side" | "split-horizontal" | "split-vertical";

export type TerminalSplitDirection = "horizontal" | "vertical";

export interface TerminalLaunchRequest {
	cwd: string;
	action: TerminalAction;
	preference: LaunchPreference;
	title?: string;
	copyEnv?: boolean;
	hold?: boolean;
	matchCurrentWindow?: boolean;
}

export interface TerminalLaunchResult {
	ok: boolean;
	windowId?: string;
	reason?: "unsupported" | "failed" | "invalid-action";
}

export interface TerminalEmulatorCapabilities {
	remoteControl: boolean;
	split: boolean;
	image: boolean;
	windowSize: boolean;
	environmentPropagation: boolean;
}

export interface TerminalImagePlacement {
	path: string;
	columns: number;
	rows: number;
	x: number;
	y: number;
}

export interface TerminalEmulatorAdapter {
	readonly id: string;
	capabilities(): TerminalEmulatorCapabilities;
	isAvailable(): boolean;
	launch(request: TerminalLaunchRequest): Promise<TerminalLaunchResult>;
	renderImage?(placement: TerminalImagePlacement): Promise<void>;
	clearImages?(): Promise<void>;
}
