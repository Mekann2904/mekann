import { describe, expect, it } from "vitest";
import { CodexUsageState, type CodexUsageReport } from "./usage.js";

describe("CodexUsageState", () => {
	const report: CodexUsageReport = {
		source: "codex-app-server",
		capturedAt: 1000,
		snapshots: [{ limitId: "codex", primary: { usedPercent: 10 } }],
	};

	it("keeps cache freshness behind one interface", () => {
		const state = new CodexUsageState(100);
		expect(state.getFreshCachedReport(1000)).toBeUndefined();

		state.storeReport(report, 1000);
		expect(state.getFreshCachedReport(1099)?.report).toBe(report);
		expect(state.getFreshCachedReport(1100)).toBeUndefined();
	});

	it("tracks current request identity", () => {
		const state = new CodexUsageState(100);
		const first = state.nextRequestId();
		expect(state.isCurrentRequest(first)).toBe(true);

		state.invalidateRequests();
		expect(state.isCurrentRequest(first)).toBe(false);
	});
});
