import { describe, expect, it } from "vitest";
import {
	OUTPUT_GATE_DEFAULT_THRESHOLD_BYTES,
	parseOutputGateEvent,
	readOutputGateEvents,
	summarizeOutputGateSavings,
	type OutputGateLedgerEvent,
} from "./outputGateSavings.js";

function ledgerEvent(overrides: Partial<OutputGateLedgerEvent> = {}): OutputGateLedgerEvent {
	return {
		kind: "tool_result",
		summary: "Large bash output stored as og_aaaaaa_1 (100000 bytes, 1200 lines)",
		createdAt: 1_700_000_000_000,
		...overrides,
	};
}

describe("outputGateSavings.parseOutputGateEvent", () => {
	it("parses a well-formed output-gate tool_result event", () => {
		expect(parseOutputGateEvent(ledgerEvent())).toEqual({
			toolName: "bash",
			artifactId: "og_aaaaaa_1",
			bytes: 100000,
			lines: 1200,
		});
	});

	it("ignores events that are not tool_result", () => {
		expect(parseOutputGateEvent(ledgerEvent({ kind: "file_change" }))).toBeNull();
	});

	it("ignores tool_result events whose summary does not match the output-gate shape", () => {
		expect(parseOutputGateEvent(ledgerEvent({ summary: "some other tool result" }))).toBeNull();
		expect(parseOutputGateEvent(ledgerEvent({ summary: undefined }))).toBeNull();
	});

	it("ignores summaries with non-numeric byte counts", () => {
		expect(
			parseOutputGateEvent(
				ledgerEvent({ summary: "Large bash output stored as og_aaaaaa_1 (lots bytes, 1 lines)" }),
			),
		).toBeNull();
	});

	it("parses different tool names and artifact ids", () => {
		const parsed = parseOutputGateEvent(
			ledgerEvent({ summary: "Large read output stored as og_bb12cd_42 (5120 bytes, 30 lines)" }),
		);
		expect(parsed).toEqual({ toolName: "read", artifactId: "og_bb12cd_42", bytes: 5120, lines: 30 });
	});
});

describe("outputGateSavings.summarizeOutputGateSavings", () => {
	it("returns an empty summary when there are no events", () => {
		const summary = summarizeOutputGateSavings([]);
		expect(summary.count).toBe(0);
		expect(summary.totalBytes).toBe(0);
		expect(summary.avgBytes).toBeNull();
		expect(summary.stubRate).toBeNull();
		expect(summary.latestTimestamp).toBeNull();
		expect(summary.byTool).toEqual({});
		expect(summary.savingsBeyondThresholdBytes).toBe(0);
	});

	it("aggregates count, bytes, and per-tool breakdown for a single event", () => {
		const summary = summarizeOutputGateSavings([ledgerEvent()], 1000);
		expect(summary.count).toBe(1);
		expect(summary.totalBytes).toBe(100000);
		expect(summary.avgBytes).toBe(100000);
		expect(summary.byTool).toEqual({ bash: { count: 1, bytes: 100000 } });
	});

	it("aggregates multiple events and groups by tool", () => {
		const events = [
			ledgerEvent({ summary: "Large bash output stored as og_a_1 (2000 bytes, 10 lines)" }),
			ledgerEvent({ summary: "Large read output stored as og_b_1 (4000 bytes, 20 lines)" }),
			ledgerEvent({ summary: "Large bash output stored as og_a_2 (6000 bytes, 30 lines)" }),
		];
		const summary = summarizeOutputGateSavings(events, 1000);
		expect(summary.count).toBe(3);
		expect(summary.totalBytes).toBe(12000);
		expect(summary.avgBytes).toBe(4000);
		expect(summary.byTool).toEqual({
			bash: { count: 2, bytes: 8000 },
			read: { count: 1, bytes: 4000 },
		});
	});

	it("computes stub rate relative to the threshold baseline", () => {
		// threshold = 1000, two events totalling 6000 bytes.
		// baseline = 1000 * 2 = 2000, savings = 4000, rate = 4000 / 6000.
		const events = [
			ledgerEvent({ summary: "Large bash output stored as og_a_1 (2000 bytes, 10 lines)" }),
			ledgerEvent({ summary: "Large read output stored as og_b_1 (4000 bytes, 20 lines)" }),
		];
		const summary = summarizeOutputGateSavings(events, 1000);
		expect(summary.thresholdBytes).toBe(1000);
		expect(summary.savingsBeyondThresholdBytes).toBe(4000);
		expect(summary.stubRate).toBeCloseTo(4000 / 6000, 10);
	});

	it("reports 0 stub rate when externalized bytes do not exceed the threshold baseline", () => {
		// Defensive: output-gate only stores outputs strictly larger than the
		// threshold, but aggregation must not produce negative rates.
		const summary = summarizeOutputGateSavings(
			[ledgerEvent({ summary: "Large bash output stored as og_a_1 (500 bytes, 1 lines)" })],
			1000,
		);
		expect(summary.savingsBeyondThresholdBytes).toBe(0);
		expect(summary.stubRate).toBe(0);
	});

	it("uses the default 48 KiB threshold when none is passed", () => {
		expect(summarizeOutputGateSavings([]).thresholdBytes).toBe(OUTPUT_GATE_DEFAULT_THRESHOLD_BYTES);
		expect(OUTPUT_GATE_DEFAULT_THRESHOLD_BYTES).toBe(48 * 1024);
	});

	it("derives latestTimestamp from the newest createdAt", () => {
		const events = [
			ledgerEvent({ summary: "Large bash output stored as og_a_1 (2000 bytes, 10 lines)", createdAt: 1_700_000_000_000 }),
			ledgerEvent({ summary: "Large bash output stored as og_a_2 (3000 bytes, 20 lines)", createdAt: 1_700_000_005_000 }),
			ledgerEvent({ summary: "Large bash output stored as og_a_3 (4000 bytes, 30 lines)", createdAt: 1_699_999_999_000 }),
		];
		const summary = summarizeOutputGateSavings(events);
		expect(summary.latestTimestamp).toBe(new Date(1_700_000_005_000).toISOString());
	});

	it("ignores non output-gate events mixed into the stream", () => {
		const events: OutputGateLedgerEvent[] = [
			{ kind: "file_change", summary: "unrelated", createdAt: 1 },
			{ kind: "tool_result", summary: "Large bash output stored as og_a_1 (2000 bytes, 10 lines)", createdAt: 2 },
			{ kind: "tool_result", summary: "not an output-gate event", createdAt: 3 },
			{ kind: "error", summary: "boom", createdAt: 4 },
		];
		const summary = summarizeOutputGateSavings(events);
		expect(summary.count).toBe(1);
		expect(summary.totalBytes).toBe(2000);
	});
});

describe("outputGateSavings.readOutputGateEvents", () => {
	it("parses jsonl lines into the minimal event shape", () => {
		const text = [
			JSON.stringify({ kind: "tool_result", summary: "Large bash output stored as og_a_1 (100 bytes, 1 lines)", createdAt: 5 }),
			"",
			JSON.stringify({ kind: "file_change", title: "x", createdAt: 6 }),
		].join("\n");
		const events = readOutputGateEvents(text);
		expect(events).toHaveLength(2);
		expect(events[0]).toEqual({ kind: "tool_result", title: undefined, summary: "Large bash output stored as og_a_1 (100 bytes, 1 lines)", createdAt: 5 });
		expect(events[1].kind).toBe("file_change");
	});

	it("skips blank lines and broken JSON", () => {
		const text = ["not json at all", "", "{ broken", JSON.stringify({ kind: "tool_result", summary: "x" })].join("\n");
		expect(readOutputGateEvents(text)).toEqual([{ kind: "tool_result", title: undefined, summary: "x", createdAt: undefined }]);
	});

	it("returns an empty array for empty input", () => {
		expect(readOutputGateEvents("")).toEqual([]);
	});

	it("ignores objects whose kind is not a string", () => {
		const text = [JSON.stringify({ kind: 42 }), JSON.stringify({ noKind: true }), JSON.stringify({ kind: "tool_result" })].join("\n");
		expect(readOutputGateEvents(text)).toEqual([{ kind: "tool_result", title: undefined, summary: undefined, createdAt: undefined }]);
	});
});
