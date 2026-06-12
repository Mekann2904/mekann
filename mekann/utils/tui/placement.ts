export type TuiPlacement = "pi-tui-overlay" | "terminal-pass-through" | "external-split";

export type UiFeatureKind = "terminal-action" | "external-ui-feature";

export interface SupportedTuiPlacements {
	kind: UiFeatureKind;
	placements: readonly TuiPlacement[];
}

export function isExternalSplitPlacement(placement: TuiPlacement): boolean {
	return placement === "external-split";
}

export function canUsePassThroughFallback(feature: SupportedTuiPlacements): boolean {
	return feature.kind === "terminal-action" && feature.placements.includes("terminal-pass-through");
}

export function assertExternalUiDoesNotUsePassThrough(feature: SupportedTuiPlacements): void {
	if (feature.kind === "external-ui-feature" && feature.placements.includes("terminal-pass-through")) {
		throw new Error("External UI features must not support terminal-pass-through fallback");
	}
}
