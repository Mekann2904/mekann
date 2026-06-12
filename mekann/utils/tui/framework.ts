import type { TuiPlacement } from "./placement.js";

export type TuiFramework = "pi-tui" | "opentui" | "none";

export function selectTuiFramework(placement: TuiPlacement): TuiFramework {
	if (placement === "pi-tui-overlay") return "pi-tui";
	if (placement === "external-split") return "opentui";
	return "none";
}
