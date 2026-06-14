/**
 * decision.ts — Terminal UI placement decision module.
 *
 * Encodes the ADR-0012 placement rules as a single pure decision function.
 * Given feature safety constraints (feature kind + supported placements),
 * terminal-emulator capability, user launch preference, and Pi idle state,
 * it returns the effective placement and TUI framework a caller should use.
 *
 * The module intentionally has no terminal-emulator or Pi imports so it stays
 * unit-testable and keeps feature code from learning Kitty or framework
 * selection details. Callers derive the capability boolean from terminal
 * adapters and act on the decision; they do not re-derive placement rules.
 *
 * Precedence (see docs/terminal-ui.md §5):
 *   1. feature safety constraints
 *   2. feature supported placements
 *   3. terminal-emulator capability
 *   4. user launch preference
 */

import {
	assertExternalUiDoesNotUsePassThrough,
	canUsePassThroughFallback,
	type SupportedTuiPlacements,
	type TuiPlacement,
} from "./placement.js";
import { selectTuiFramework, type TuiFramework } from "./framework.js";

/** User-facing, terminal-emulator-independent launch preference. */
export type UserLaunchPreference =
	| "pass-through"
	| "split-longer-side"
	| "split-horizontal"
	| "split-vertical";

/**
 * Terminal-emulator capability relevant to placement. Callers derive this from
 * the detected terminal adapters rather than passing the adapters themselves,
 * keeping this module free of terminal-adapter imports.
 */
export interface TerminalPlacementCapability {
	/** Whether the emulator can create an isolated pane/window for External split UI. */
	split: boolean;
}

export type TuiPlacementStatus = "ok" | "unsupported";

export interface TuiPlacementDecision {
	placement: TuiPlacement;
	framework: TuiFramework;
	status: TuiPlacementStatus;
	/** Why this placement was chosen, or why the request is unsupported. */
	reason: string;
}

export interface TuiPlacementRequest {
	feature: SupportedTuiPlacements;
	capability: TerminalPlacementCapability;
	preference: UserLaunchPreference;
	/**
	 * Whether Pi is idle. Terminal pass-through suspends Pi's TTY, so idle is a
	 * safety precondition for pass-through. External split launches do not take
	 * over Pi's TTY and do not require idle.
	 */
	isIdle: boolean;
}

function candidatePlacementForPreference(
	preference: UserLaunchPreference,
): TuiPlacement {
	if (preference === "pass-through") return "terminal-pass-through";
	// Every split-* preference resolves to External split UI; the terminal
	// adapter decides the concrete direction.
	return "external-split";
}

/**
 * Resolve the effective Terminal UI placement for a launch request.
 *
 * Never routes an External UI feature to terminal-pass-through, even when
 * External split UI is unavailable: such a request resolves to
 * `status: "unsupported"` instead. Terminal actions may fall back from split
 * to idle pass-through per ADR-0012.
 */
export function decideTuiPlacement(
	request: TuiPlacementRequest,
): TuiPlacementDecision {
	const { feature, capability, preference, isIdle } = request;

	// (1) Safety config validation: an External UI feature must never declare
	//     terminal-pass-through support. Throws on programmer misconfiguration.
	assertExternalUiDoesNotUsePassThrough(feature);

	const supported = new Set(feature.placements);
	const candidate = candidatePlacementForPreference(preference);

	// (2) Capability + safety constraints per placement.
	const constraintsMet = (placement: TuiPlacement): boolean => {
		if (placement === "external-split") return capability.split;
		if (placement === "terminal-pass-through") {
			// Pass-through suspends Pi's TTY: idle is a safety precondition and
			// only terminal-action features may use it.
			return isIdle && feature.kind === "terminal-action";
		}
		// pi-tui-overlay renders in-process; it has no external constraint here.
		return true;
	};

	// (3) Honour the user launch preference when its placement is supported and
	//     its constraints are met.
	if (supported.has(candidate) && constraintsMet(candidate)) {
		return {
			placement: candidate,
			framework: selectTuiFramework(candidate),
			status: "ok",
			reason: `user launch preference "${preference}" is supported and constraints are met`,
		};
	}

	// (4) Fallback resolution when the preferred placement is not satisfiable.
	//     Safety takes precedence: External UI features must NOT fall back to
	//     terminal-pass-through when External split UI is unavailable.
	if (candidate === "external-split") {
		const canFallBackToPassThrough =
			feature.kind === "terminal-action" &&
			canUsePassThroughFallback(feature) &&
			isIdle &&
			supported.has("terminal-pass-through");
		if (canFallBackToPassThrough) {
			return {
				placement: "terminal-pass-through",
				framework: selectTuiFramework("terminal-pass-through"),
				status: "ok",
				reason: "external split unavailable; terminal-action fell back to idle pass-through",
			};
		}
		return {
			placement: "external-split",
			framework: selectTuiFramework("external-split"),
			status: "unsupported",
			reason:
				feature.kind === "external-ui-feature"
					? "external split UI capability is unavailable and External UI features must not fall back to terminal pass-through"
					: "external split unavailable and no idle pass-through fallback is permitted",
		};
	}

	// candidate === "terminal-pass-through": not supported by the feature or Pi
	// not idle. Try External split UI before giving up.
	if (supported.has("external-split") && capability.split) {
		return {
			placement: "external-split",
			framework: selectTuiFramework("external-split"),
			status: "ok",
			reason: "pass-through unavailable; fell back to external split",
		};
	}

	// Unsupported. Report the placement the caller was aiming for, but never
	// surface terminal-pass-through for an External UI feature — even as a
	// placeholder — so no downstream code can misread it as an allowed path.
	const reportedPlacement =
		candidate === "terminal-pass-through" && feature.kind === "external-ui-feature"
			? (feature.placements.find((p) => p !== "terminal-pass-through") ?? "external-split")
			: candidate;

	return {
		placement: reportedPlacement,
		framework: selectTuiFramework(reportedPlacement),
		status: "unsupported",
		reason: isIdle
			? "terminal pass-through is not supported by this feature and no external split capability is available"
			: "Pi is not idle and no external split capability is available",
	};
}
