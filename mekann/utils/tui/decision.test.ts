import { describe, expect, it } from "vitest";
import {
	decideTuiPlacement,
	type TerminalPlacementCapability,
	type TuiPlacementRequest,
	type UserLaunchPreference,
} from "./decision.js";
import type { SupportedTuiPlacements } from "./placement.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const externalSplitOnly: SupportedTuiPlacements = {
	kind: "external-ui-feature",
	placements: ["external-split"],
};

const terminalActionSplitAndPassThrough: SupportedTuiPlacements = {
	kind: "terminal-action",
	placements: ["external-split", "terminal-pass-through"],
};

const terminalActionPassThroughOnly: SupportedTuiPlacements = {
	kind: "terminal-action",
	placements: ["terminal-pass-through"],
};

function request(
	feature: SupportedTuiPlacements,
	preference: UserLaunchPreference,
	capability: TerminalPlacementCapability,
	isIdle = true,
): TuiPlacementRequest {
	return { feature, preference, capability, isIdle };
}

const splitCap = { split: true };
const noSplitCap = { split: false };

// ---------------------------------------------------------------------------
// External UI feature
// ---------------------------------------------------------------------------

describe("decideTuiPlacement — External UI feature", () => {
	it("returns external-split with opentui framework when split capability is available", () => {
		const decision = decideTuiPlacement(
			request(externalSplitOnly, "split-longer-side", splitCap),
		);
		expect(decision).toMatchObject({
			placement: "external-split",
			framework: "opentui",
			status: "ok",
		});
	});

	it("returns unsupported (never pass-through) when split capability is unavailable", () => {
		const decision = decideTuiPlacement(
			request(externalSplitOnly, "split-longer-side", noSplitCap),
		);
		expect(decision.status).toBe("unsupported");
		expect(decision.placement).toBe("external-split");
		expect(decision.framework).toBe("opentui");
		expect(decision.reason).toMatch(/must not fall back to terminal pass-through/);
	});

	it("never routes to terminal-pass-through regardless of preference or idle state", () => {
		for (const preference of [
			"split-longer-side",
			"split-horizontal",
			"split-vertical",
			"pass-through",
		] as UserLaunchPreference[]) {
			for (const isIdle of [true, false]) {
				const decision = decideTuiPlacement(
					request(externalSplitOnly, preference, noSplitCap, isIdle),
				);
				expect(decision.placement).not.toBe("terminal-pass-through");
				expect(decision.status).toBe("unsupported");
			}
		}
	});

	it("throws when an External UI feature misconfigures pass-through as supported", () => {
		const misconfigured: SupportedTuiPlacements = {
			kind: "external-ui-feature",
			placements: ["external-split", "terminal-pass-through"],
		};
		expect(() =>
			decideTuiPlacement(request(misconfigured, "split-longer-side", splitCap)),
		).toThrow(/must not support terminal-pass-through/);
	});
});

// ---------------------------------------------------------------------------
// Terminal action
// ---------------------------------------------------------------------------

describe("decideTuiPlacement — terminal action", () => {
	it("honours pass-through preference for an idle terminal-action", () => {
		const decision = decideTuiPlacement(
			request(terminalActionSplitAndPassThrough, "pass-through", noSplitCap, true),
		);
		expect(decision).toMatchObject({
			placement: "terminal-pass-through",
			framework: "none",
			status: "ok",
		});
	});

	it("rejects pass-through when Pi is not idle", () => {
		const decision = decideTuiPlacement(
			request(terminalActionSplitAndPassThrough, "pass-through", splitCap, false),
		);
		// pass-through unavailable (not idle) → falls back to external-split when capable
		expect(decision).toMatchObject({
			placement: "external-split",
			framework: "opentui",
			status: "ok",
		});
	});

	it("falls back from split to idle pass-through when split capability is unavailable", () => {
		const decision = decideTuiPlacement(
			request(terminalActionSplitAndPassThrough, "split-longer-side", noSplitCap, true),
		);
		expect(decision).toMatchObject({
			placement: "terminal-pass-through",
			framework: "none",
			status: "ok",
		});
		expect(decision.reason).toMatch(/fell back to idle pass-through/);
	});

	it("does not fall back to pass-through when Pi is not idle", () => {
		const decision = decideTuiPlacement(
			request(terminalActionSplitAndPassThrough, "split-longer-side", noSplitCap, false),
		);
		expect(decision.status).toBe("unsupported");
		expect(decision.placement).toBe("external-split");
	});

	it("respects split-longer-side preference and selects external-split", () => {
		const decision = decideTuiPlacement(
			request(terminalActionSplitAndPassThrough, "split-longer-side", splitCap, false),
		);
		expect(decision).toMatchObject({
			placement: "external-split",
			framework: "opentui",
			status: "ok",
		});
	});

	it("returns unsupported when a pass-through-only action runs while not idle and no split exists", () => {
		const decision = decideTuiPlacement(
			request(terminalActionPassThroughOnly, "pass-through", noSplitCap, false),
		);
		expect(decision.status).toBe("unsupported");
	});
});
