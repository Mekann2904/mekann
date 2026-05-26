import { terminalActionArgv } from "../actions.js";
import type { TerminalEmulatorAdapter, TerminalEmulatorCapabilities, TerminalLaunchRequest, TerminalLaunchResult } from "../types.js";
import { KittyControl, type KittySplitLocation } from "./control.js";

function splitLocationForPreference(preference: TerminalLaunchRequest["preference"]): KittySplitLocation | undefined {
	if (preference === "split-horizontal") return "hsplit";
	if (preference === "split-vertical") return "vsplit";
	return undefined;
}

export class KittyTerminalAdapter implements TerminalEmulatorAdapter {
	readonly id = "kitty";

	constructor(private readonly control = new KittyControl()) {}

	capabilities(): TerminalEmulatorCapabilities {
		return {
			remoteControl: true,
			split: true,
			image: true,
			windowSize: true,
			environmentPropagation: true,
		};
	}

	isAvailable(): boolean {
		return this.control.isKittyEnvironment();
	}

	async launch(request: TerminalLaunchRequest): Promise<TerminalLaunchResult> {
		if (!this.isAvailable()) return { ok: false, reason: "unsupported" };
		if (request.preference === "pass-through") return { ok: false, reason: "unsupported" };

		const argv = terminalActionArgv(request.action);
		if (argv.length === 0) return { ok: false, reason: "invalid-action" };

		try {
			const fixedLocation = splitLocationForPreference(request.preference);
			const result = fixedLocation
				? await this.control.launchWindow({
						cwd: request.cwd,
						argv,
						location: fixedLocation,
						title: request.title,
						copyEnv: request.copyEnv,
						hold: request.hold,
						matchCurrentWindow: request.matchCurrentWindow,
					})
				: await this.control.launchSplitLongerSide({
						cwd: request.cwd,
						argv,
						title: request.title,
						copyEnv: request.copyEnv,
						hold: request.hold,
						matchCurrentWindow: request.matchCurrentWindow,
					});
			return { ok: true, windowId: result.windowId };
		} catch {
			return { ok: false, reason: "failed" };
		}
	}
}
