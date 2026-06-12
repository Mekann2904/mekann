export type SessionStartReason = "resume" | "reload" | "fork" | string | undefined;

export function shouldRestoreSessionContextSurface(input: {
	reason: SessionStartReason;
	hasLatestSnapshot: boolean;
}): boolean {
	return (input.reason === "resume" || input.reason === "reload" || input.reason === "fork") && input.hasLatestSnapshot;
}

export function shouldExposeManualOrAlwaysSurface(input: {
	configuredSurface: string;
	manualActive: boolean;
}): boolean {
	return input.configuredSurface === "always" || input.manualActive;
}

export function normalizePromptSurface(value: string): "off" | "locator" | "full" {
	return value === "off" || value === "full" ? value : "locator";
}
