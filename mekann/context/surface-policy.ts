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

/**
 * Normalize a configured `promptSurface` value to the active surface.
 *
 * `full` is deprecated: it injected the generated AGENTS.md/domain-docs
 * fragments even though the base system already embeds AGENTS.md (and often
 * domain docs) via <project_context>, causing double injection. It now falls
 * back to `locator`, which exposes only the small retrieval locator.
 */
export function normalizePromptSurface(value: string): "off" | "locator" {
	return value === "off" ? "off" : "locator";
}
