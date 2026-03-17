/**
 * observability-data.tsのユニットテスト
 * BaseEvent全フィールド検証と統計計算の正常動作を検証
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseLogFileWithStats, calculateStats } from "../../extensions/observability-data";

// テスト用の一時ディレクトリ
let testLogDir: string;

beforeEach(() => {
	testLogDir = join(tmpdir(), `observability-test-${Date.now()}`);
	mkdirSync(testLogDir, { recursive: true });
});

afterEach(() => {
	if (existsSync(testLogDir)) {
		rmSync(testLogDir, { recursive: true, force: true });
	}
});

describe("parseLogFileWithStats - timestamp validation", () => {
	it("should skip events without timestamp field", () => {
		// テスト用ログファイル作成（timestampなし）
		const logFile = join(testLogDir, "events-2026-03-16.jsonl");
		const malformedEvent = JSON.stringify({
			eventType: "tool_call",
			eventId: "test-1",
			sessionId: "s1",
			taskId: "t1",
			operationId: "o1",
			component: { type: "extension", name: "test" },
		});
		const validEvent = JSON.stringify({
			eventType: "tool_call",
			eventId: "test-2",
			timestamp: "2026-03-16T12:00:00.000Z",
			sessionId: "s1",
			taskId: "t1",
			operationId: "o1",
			component: { type: "extension", name: "test" },
		});
		writeFileSync(logFile, `${malformedEvent}\n${validEvent}\n`);

		const result = parseLogFileWithStats(logFile);

		expect(result.events.length).toBe(1); // validEventのみ
		expect(result.events[0].eventId).toBe("test-2");
		expect(result.parseErrors).toBe(1); // malformedEventはスキップ
	});

	it("should accept events with empty timestamp string", () => {
		// 空文字列のtimestampは型チェックを通る
		const logFile = join(testLogDir, "events-2026-03-16.jsonl");
		const emptyTimestampEvent = JSON.stringify({
			eventType: "tool_call",
			eventId: "test-3",
			timestamp: "",
			sessionId: "s1",
			taskId: "t1",
			operationId: "o1",
			component: { type: "extension", name: "test" },
		});
		writeFileSync(logFile, `${emptyTimestampEvent}\n`);

		const result = parseLogFileWithStats(logFile);

		// 空文字は typeof === "string" を満たすため有効
		expect(result.events.length).toBe(1);
	});

	it("should skip events with non-string timestamp", () => {
		const logFile = join(testLogDir, "events-2026-03-16.jsonl");
		const numberTimestampEvent = JSON.stringify({
			eventType: "tool_call",
			eventId: "test-4",
			timestamp: 123456789,
			sessionId: "s1",
			taskId: "t1",
			operationId: "o1",
			component: { type: "extension", name: "test" },
		});
		writeFileSync(logFile, `${numberTimestampEvent}\n`);

		const result = parseLogFileWithStats(logFile);

		// 数値は検証で弾かれる
		expect(result.events.length).toBe(0);
		expect(result.parseErrors).toBe(1);
	});
});

describe("parseLogFileWithStats - BaseEvent full validation", () => {
	it("should skip events without eventType field", () => {
		const logFile = join(testLogDir, "events-2026-03-16.jsonl");
		const missingEventType = JSON.stringify({
			eventId: "test-5",
			// eventType missing
			timestamp: "2026-03-16T12:00:00.000Z",
			sessionId: "s1",
			taskId: "t1",
			operationId: "o1",
			component: { type: "extension", name: "test" },
		});
		writeFileSync(logFile, `${missingEventType}\n`);

		const result = parseLogFileWithStats(logFile);

		expect(result.events.length).toBe(0);
		expect(result.parseErrors).toBe(1);
	});

	it("should skip events without eventId field", () => {
		const logFile = join(testLogDir, "events-2026-03-16.jsonl");
		const missingEventId = JSON.stringify({
			// eventId missing
			eventType: "tool_call",
			timestamp: "2026-03-16T12:00:00.000Z",
			sessionId: "s1",
			taskId: "t1",
			operationId: "o1",
			component: { type: "extension", name: "test" },
		});
		writeFileSync(logFile, `${missingEventId}\n`);

		const result = parseLogFileWithStats(logFile);

		expect(result.events.length).toBe(0);
		expect(result.parseErrors).toBe(1);
	});

	it("should skip events without sessionId field", () => {
		const logFile = join(testLogDir, "events-2026-03-16.jsonl");
		const missingSessionId = JSON.stringify({
			eventId: "test-6",
			eventType: "tool_call",
			timestamp: "2026-03-16T12:00:00.000Z",
			// sessionId missing
			taskId: "t1",
			operationId: "o1",
			component: { type: "extension", name: "test" },
		});
		writeFileSync(logFile, `${missingSessionId}\n`);

		const result = parseLogFileWithStats(logFile);

		expect(result.events.length).toBe(0);
		expect(result.parseErrors).toBe(1);
	});

	it("should skip events without taskId field", () => {
		const logFile = join(testLogDir, "events-2026-03-16.jsonl");
		const missingTaskId = JSON.stringify({
			eventId: "test-7",
			eventType: "tool_call",
			timestamp: "2026-03-16T12:00:00.000Z",
			sessionId: "s1",
			// taskId missing
			operationId: "o1",
			component: { type: "extension", name: "test" },
		});
		writeFileSync(logFile, `${missingTaskId}\n`);

		const result = parseLogFileWithStats(logFile);

		expect(result.events.length).toBe(0);
		expect(result.parseErrors).toBe(1);
	});

	it("should skip events without operationId field", () => {
		const logFile = join(testLogDir, "events-2026-03-16.jsonl");
		const missingOperationId = JSON.stringify({
			eventId: "test-8",
			eventType: "tool_call",
			timestamp: "2026-03-16T12:00:00.000Z",
			sessionId: "s1",
			taskId: "t1",
			// operationId missing
			component: { type: "extension", name: "test" },
		});
		writeFileSync(logFile, `${missingOperationId}\n`);

		const result = parseLogFileWithStats(logFile);

		expect(result.events.length).toBe(0);
		expect(result.parseErrors).toBe(1);
	});

	it("should skip events without component field", () => {
		const logFile = join(testLogDir, "events-2026-03-16.jsonl");
		const missingComponent = JSON.stringify({
			eventId: "test-9",
			eventType: "tool_call",
			timestamp: "2026-03-16T12:00:00.000Z",
			sessionId: "s1",
			taskId: "t1",
			operationId: "o1",
			// component missing
		});
		writeFileSync(logFile, `${missingComponent}\n`);

		const result = parseLogFileWithStats(logFile);

		expect(result.events.length).toBe(0);
		expect(result.parseErrors).toBe(1);
	});

	it("should skip events with malformed component (missing type)", () => {
		const logFile = join(testLogDir, "events-2026-03-16.jsonl");
		const malformedComponent = JSON.stringify({
			eventId: "test-10",
			eventType: "tool_call",
			timestamp: "2026-03-16T12:00:00.000Z",
			sessionId: "s1",
			taskId: "t1",
			operationId: "o1",
			component: { name: "test" }, // type missing
		});
		writeFileSync(logFile, `${malformedComponent}\n`);

		const result = parseLogFileWithStats(logFile);

		expect(result.events.length).toBe(0);
		expect(result.parseErrors).toBe(1);
	});

	it("should skip events with malformed component (missing name)", () => {
		const logFile = join(testLogDir, "events-2026-03-16.jsonl");
		const malformedComponent = JSON.stringify({
			eventId: "test-11",
			eventType: "tool_call",
			timestamp: "2026-03-16T12:00:00.000Z",
			sessionId: "s1",
			taskId: "t1",
			operationId: "o1",
			component: { type: "extension" }, // name missing
		});
		writeFileSync(logFile, `${malformedComponent}\n`);

		const result = parseLogFileWithStats(logFile);

		expect(result.events.length).toBe(0);
		expect(result.parseErrors).toBe(1);
	});

	it("should accept valid events with all required fields", () => {
		const logFile = join(testLogDir, "events-2026-03-16.jsonl");
		const validEvent = JSON.stringify({
			eventId: "test-12",
			eventType: "tool_call",
			timestamp: "2026-03-16T12:00:00.000Z",
			sessionId: "s1",
			taskId: "t1",
			operationId: "o1",
			component: { type: "extension", name: "test" },
		});
		writeFileSync(logFile, `${validEvent}\n`);

		const result = parseLogFileWithStats(logFile);

		expect(result.events.length).toBe(1);
		expect(result.events[0].eventId).toBe("test-12");
		expect(result.parseErrors).toBe(0);
	});
});

describe("calculateStats - eventsByType handling", () => {
	it("should correctly count events by type", () => {
		const events = [
			{
				eventType: "tool_call" as const,
				eventId: "1",
				timestamp: "2026-03-16T10:00:00.000Z",
				sessionId: "s1",
				taskId: "t1",
				operationId: "o1",
				component: { type: "extension" as const, name: "test" },
			},
			{
				eventType: "tool_call" as const,
				eventId: "2",
				timestamp: "2026-03-16T12:00:00.000Z",
				sessionId: "s1",
				taskId: "t1",
				operationId: "o1",
				component: { type: "extension" as const, name: "test" },
			},
			{
				eventType: "llm_request" as const,
				eventId: "3",
				timestamp: "2026-03-16T11:00:00.000Z",
				sessionId: "s1",
				taskId: "t1",
				operationId: "o1",
				component: { type: "extension" as const, name: "test" },
			},
		];

		const stats = calculateStats(events);

		expect(stats.totalEvents).toBe(3);
		expect(stats.eventsByType["tool_call"]).toBe(2);
		expect(stats.eventsByType["llm_request"]).toBe(1);
		expect(stats.eventsByType[undefined as unknown as string]).toBeUndefined();
	});

	it("should handle events with valid timestamps for firstEventAt/lastEventAt", () => {
		const events = [
			{
				eventType: "tool_call" as const,
				eventId: "1",
				timestamp: "2026-03-16T10:00:00.000Z",
				sessionId: "s1",
				taskId: "t1",
				operationId: "o1",
				component: { type: "extension" as const, name: "test" },
			},
			{
				eventType: "tool_call" as const,
				eventId: "2",
				timestamp: "2026-03-16T12:00:00.000Z",
				sessionId: "s1",
				taskId: "t1",
				operationId: "o1",
				component: { type: "extension" as const, name: "test" },
			},
		];

		const stats = calculateStats(events);

		expect(stats.firstEventAt).toBe("2026-03-16T10:00:00.000Z");
		expect(stats.lastEventAt).toBe("2026-03-16T12:00:00.000Z");
	});
});

describe("TUI display - null safety", () => {
	it("should safely handle missing timestamp in slice operation", () => {
		const event = {
			eventType: "tool_call" as const,
			eventId: "1",
			// timestamp missing
		};

		// TUI display関数のロジックをシミュレート
		const ts = (event as { timestamp?: string }).timestamp?.slice(11, 23) ?? "??:??:??.??";
		expect(ts).toBe("??:??:??.??");
	});

	it("should extract time from valid timestamp", () => {
		const event = {
			timestamp: "2026-03-16T12:34:56.789Z",
		};

		const ts = event.timestamp?.slice(11, 23) ?? "??:??:??.??";
		expect(ts).toBe("12:34:56.789");
	});
});

describe("calculateStats - experiment event aggregation", () => {
	it("should aggregate experiment_baseline events", () => {
		const events = [
			{
				eventType: "experiment_baseline" as const,
				eventId: "exp-1",
				timestamp: "2026-03-16T10:00:00.000Z",
				sessionId: "s1",
				taskId: "t1",
				operationId: "o1",
				component: { type: "extension" as const, name: "autoresearch" },
				data: {
					experimentType: "e2e" as const,
					label: "test-run",
					score: { failed: 2, passed: 8, total: 10, durationMs: 5000 },
					commit: "abc123",
				},
			},
		];

		const stats = calculateStats(events);

		expect(stats.experimentCount).toBe(1);
		expect(stats.improvementCount).toBe(0);
		expect(stats.regressionCount).toBe(0);
		expect(stats.experimentScores?.e2e).toBeDefined();
		expect(stats.experimentScores?.e2e?.failed).toBe(2);
		expect(stats.experimentScores?.e2e?.passed).toBe(8);
		expect(stats.experimentScores?.e2e?.total).toBe(10);
		expect(stats.experimentScores?.e2e?.durationMs).toBe(5000);
		expect(stats.experimentScores?.e2e?.commit).toBe("abc123");
	});

	it("should track experiment_improved events", () => {
		const events = [
			{
				eventType: "experiment_baseline" as const,
				eventId: "exp-1",
				timestamp: "2026-03-16T10:00:00.000Z",
				sessionId: "s1",
				taskId: "t1",
				operationId: "o1",
				component: { type: "extension" as const, name: "autoresearch" },
				data: {
					experimentType: "tbench" as const,
					label: "bench-run",
					score: { failed: 5, passed: 5, total: 10, durationMs: 3000 },
				},
			},
			{
				eventType: "experiment_improved" as const,
				eventId: "exp-2",
				timestamp: "2026-03-16T11:00:00.000Z",
				sessionId: "s1",
				taskId: "t1",
				operationId: "o1",
				component: { type: "extension" as const, name: "autoresearch" },
				data: {
					experimentType: "tbench" as const,
					label: "bench-run",
					previousScore: { failed: 5, passed: 5, total: 10, durationMs: 3000 },
					newScore: { failed: 2, passed: 8, total: 10, durationMs: 2800 },
					improvementType: "fewer_failures",
					commit: "def456",
				},
			},
		];

		const stats = calculateStats(events);

		expect(stats.experimentCount).toBe(2);
		expect(stats.improvementCount).toBe(1);
		expect(stats.regressionCount).toBe(0);
		// 最新スコア（improved）が反映されている
		expect(stats.experimentScores?.tbench?.failed).toBe(2);
		expect(stats.experimentScores?.tbench?.passed).toBe(8);
		expect(stats.experimentScores?.tbench?.commit).toBe("def456");
	});

	it("should track experiment_regressed events", () => {
		const events = [
			{
				eventType: "experiment_baseline" as const,
				eventId: "exp-1",
				timestamp: "2026-03-16T10:00:00.000Z",
				sessionId: "s1",
				taskId: "t1",
				operationId: "o1",
				component: { type: "extension" as const, name: "autoresearch" },
				data: {
					experimentType: "e2e" as const,
					label: "test-run",
					score: { failed: 1, passed: 9, total: 10, durationMs: 4000 },
				},
			},
			{
				eventType: "experiment_regressed" as const,
				eventId: "exp-2",
				timestamp: "2026-03-16T11:00:00.000Z",
				sessionId: "s1",
				taskId: "t1",
				operationId: "o1",
				component: { type: "extension" as const, name: "autoresearch" },
				data: {
					experimentType: "e2e" as const,
					label: "test-run",
					previousScore: { failed: 1, passed: 9, total: 10, durationMs: 4000 },
					newScore: { failed: 4, passed: 6, total: 10, durationMs: 4500 },
					regressionType: "more_failures",
				},
			},
		];

		const stats = calculateStats(events);

		expect(stats.experimentCount).toBe(2);
		expect(stats.improvementCount).toBe(0);
		expect(stats.regressionCount).toBe(1);
		// 退行後のスコアが反映されている
		expect(stats.experimentScores?.e2e?.failed).toBe(4);
		expect(stats.experimentScores?.e2e?.passed).toBe(6);
	});

	it("should handle partial scores from experiment_timeout/stop/crash", () => {
		const events = [
			{
				eventType: "experiment_timeout" as const,
				eventId: "exp-1",
				timestamp: "2026-03-16T10:00:00.000Z",
				sessionId: "s1",
				taskId: "t1",
				operationId: "o1",
				component: { type: "extension" as const, name: "autoresearch" },
				data: {
					experimentType: "e2e" as const,
					label: "test-run",
					iteration: 3,
					timeoutMs: 300000,
					partialScore: { failed: 3, passed: 5, total: 8, durationMs: 290000 },
				},
			},
		];

		const stats = calculateStats(events);

		expect(stats.experimentCount).toBe(1);
		expect(stats.experimentScores?.e2e?.failed).toBe(3);
		expect(stats.experimentScores?.e2e?.passed).toBe(5);
		expect(stats.experimentScores?.e2e?.total).toBe(8);
	});

	it("should track both e2e and tbench experiment types separately", () => {
		const events = [
			{
				eventType: "experiment_baseline" as const,
				eventId: "exp-1",
				timestamp: "2026-03-16T10:00:00.000Z",
				sessionId: "s1",
				taskId: "t1",
				operationId: "o1",
				component: { type: "extension" as const, name: "autoresearch" },
				data: {
					experimentType: "e2e" as const,
					label: "e2e-run",
					score: { failed: 1, passed: 9, total: 10, durationMs: 1000 },
				},
			},
			{
				eventType: "experiment_baseline" as const,
				eventId: "exp-2",
				timestamp: "2026-03-16T11:00:00.000Z",
				sessionId: "s1",
				taskId: "t1",
				operationId: "o1",
				component: { type: "extension" as const, name: "autoresearch" },
				data: {
					experimentType: "tbench" as const,
					label: "bench-run",
					score: { failed: 2, passed: 8, total: 10, durationMs: 2000 },
				},
			},
		];

		const stats = calculateStats(events);

		expect(stats.experimentCount).toBe(2);
		expect(stats.experimentScores?.e2e).toBeDefined();
		expect(stats.experimentScores?.tbench).toBeDefined();
		expect(stats.experimentScores?.e2e?.failed).toBe(1);
		expect(stats.experimentScores?.tbench?.failed).toBe(2);
	});
});
