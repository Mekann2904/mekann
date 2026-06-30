import { describe, expect, it } from "vitest";
import { evaluateGate, isGatePolicy, type GateStatus } from "./gate.js";

function status(overrides: Partial<GateStatus> = {}): GateStatus {
	return { merged: false, closed: false, isDraft: false, exists: true, ...overrides };
}

describe("isGatePolicy", () => {
	it("accepts the three canonical policies", () => {
		expect(isGatePolicy("merged")).toBe(true);
		expect(isGatePolicy("on-closed-skip")).toBe(true);
		expect(isGatePolicy("on-draft-wait")).toBe(true);
	});

	it("rejects unknown / mistyped values", () => {
		expect(isGatePolicy("closed")).toBe(false);
		expect(isGatePolicy(undefined)).toBe(false);
		expect(isGatePolicy(1)).toBe(false);
	});
});

describe("evaluateGate — common base (all policies agree)", () => {
	it("continues when the PR is merged under every policy", () => {
		const merged = status({ merged: true });
		for (const policy of ["merged", "on-closed-skip", "on-draft-wait"] as const) {
			expect(evaluateGate(merged, policy).kind).toBe("continue");
		}
	});

	it("stops with not-merged when no PR exists (under every policy)", () => {
		const noPr = status({ exists: false });
		for (const policy of ["merged", "on-closed-skip", "on-draft-wait"] as const) {
			const outcome = evaluateGate(noPr, policy);
			expect(outcome.kind).toBe("stop");
			if (outcome.kind !== "stop") return;
			expect(outcome.reason).toBe("not-merged");
		}
	});
});

describe("evaluateGate — policy 'merged' (default)", () => {
	const policy = "merged";
	it("stops not-merged on an open PR", () => {
		const outcome = evaluateGate(status({}), policy);
		expect(outcome.kind).toBe("stop");
		if (outcome.kind !== "stop") return;
		expect(outcome.reason).toBe("not-merged");
	});

	it("stops not-merged on a closed PR", () => {
		const outcome = evaluateGate(status({ closed: true }), policy);
		expect(outcome.kind).toBe("stop");
		if (outcome.kind !== "stop") return;
		expect(outcome.reason).toBe("not-merged");
	});

	it("stops not-merged on a draft PR", () => {
		const outcome = evaluateGate(status({ isDraft: true }), policy);
		expect(outcome).toMatchObject({ kind: "stop", reason: "not-merged" });
	});
});

describe("evaluateGate — policy 'on-closed-skip'", () => {
	const policy = "on-closed-skip";
	it("stops closed on a closed-without-merge PR", () => {
		const outcome = evaluateGate(status({ closed: true }), policy);
		expect(outcome).toMatchObject({ kind: "stop", reason: "closed" });
	});

	it("waits (open) on an open non-draft PR", () => {
		const outcome = evaluateGate(status({}), policy);
		expect(outcome).toMatchObject({ kind: "wait", reason: "open" });
	});

	it("waits (open) on an open draft PR (drafts are a subset of open)", () => {
		const outcome = evaluateGate(status({ isDraft: true }), policy);
		expect(outcome).toMatchObject({ kind: "wait", reason: "open" });
	});
});

describe("evaluateGate — policy 'on-draft-wait'", () => {
	const policy = "on-draft-wait";
	it("continues on an open non-draft PR (treats it as approved)", () => {
		const outcome = evaluateGate(status({}), policy);
		expect(outcome.kind).toBe("continue");
	});

	it("waits (draft) on an open draft PR", () => {
		const outcome = evaluateGate(status({ isDraft: true }), policy);
		expect(outcome).toMatchObject({ kind: "wait", reason: "draft" });
	});

	it("stops closed on a closed-without-merge PR", () => {
		const outcome = evaluateGate(status({ closed: true }), policy);
		expect(outcome).toMatchObject({ kind: "stop", reason: "closed" });
	});
});
