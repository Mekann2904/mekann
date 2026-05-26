import { KittyTerminalAdapter } from "./kitty/adapter.js";
import type { TerminalEmulatorAdapter, TerminalLaunchRequest, TerminalLaunchResult } from "./types.js";

export function detectTerminalEmulatorAdapters(): TerminalEmulatorAdapter[] {
	return [new KittyTerminalAdapter()].filter((adapter) => adapter.isAvailable());
}

export async function launchWithTerminalEmulator(
	request: TerminalLaunchRequest,
	adapters = detectTerminalEmulatorAdapters(),
): Promise<TerminalLaunchResult> {
	if (request.preference === "pass-through") return { ok: false, reason: "unsupported" };

	for (const adapter of adapters) {
		if (!adapter.capabilities().split) continue;
		const result = await adapter.launch(request);
		if (result.ok) return result;
	}
	return { ok: false, reason: "unsupported" };
}

export async function launchExternalUi(request: Omit<TerminalLaunchRequest, "preference"> & { preference?: Exclude<TerminalLaunchRequest["preference"], "pass-through"> }): Promise<TerminalLaunchResult> {
	return await launchWithTerminalEmulator({ ...request, preference: request.preference ?? "split-longer-side" });
}
