/**
 * runner/loop.test.ts — COMPLETE marker 検出と follow-up メッセージの focused test。
 * {@link "./loop.js"} を直接 import して単体検証する。
 */
import { describe, expect, it } from "vitest";
import { COMPLETE_MARKER, hasCompleteMarker, loopFollowUpMessage } from "./loop.js";

describe("hasCompleteMarker", () => {
	it("detects the marker in a plain string", () => {
		expect(hasCompleteMarker(`done ${COMPLETE_MARKER}`)).toBe(true);
	});

	it("returns false when the marker is absent", () => {
		expect(hasCompleteMarker("still working")).toBe(false);
	});

	it("recurses through nested text/content/messages fields", () => {
		expect(hasCompleteMarker({ messages: [{ content: [{ text: "x" }, { text: COMPLETE_MARKER }] }] })).toBe(true);
	});

	it("recurses through arrays of strings", () => {
		expect(hasCompleteMarker(["a", "b", `tail ${COMPLETE_MARKER}`])).toBe(true);
	});

	it("ignores non-string leaves", () => {
		expect(hasCompleteMarker({ n: 123, b: true })).toBe(false);
	});
});

describe("loopFollowUpMessage", () => {
	it("switches prefix based on noProgress", () => {
		const noProgress = loopFollowUpMessage(true);
		const progress = loopFollowUpMessage(false);
		expect(noProgress).toContain("進みませんでした");
		expect(progress).toContain("完了しました");
	});

	it("includes the single-experiment and COMPLETE guidance plus the marker", () => {
		const msg = loopFollowUpMessage(false);
		expect(msg).toContain("1ターンで1つの具体的な実験");
		expect(msg).toContain(COMPLETE_MARKER);
		expect(msg).toContain("ユーザーに継続確認せず進めてください");
	});
});

describe("COMPLETE_MARKER", () => {
	it("is the canonical autoresearch sentinel", () => {
		expect(COMPLETE_MARKER).toBe("<autoresearch>COMPLETE</autoresearch>");
	});
});
