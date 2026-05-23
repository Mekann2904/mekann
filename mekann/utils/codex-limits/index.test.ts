import { describe, expect, it } from "vitest";
import {
	formatCodexUsageReport,
	formatCodexUsageStatusline,
	normalizeAppServerResponse,
	normalizeBackendPayload,
	parseArgs,
} from "./index.js";

describe("codex usage", () => {
	const capturedAt = Date.UTC(2026, 0, 1, 0, 0, 0);

	it("parses command options", () => {
		expect(parseArgs("--refresh --no-statusline --timeout 30")).toEqual({
			ok: true,
			value: { clearStatusline: false, refresh: true, statusline: false, timeoutMs: 30_000 },
		});
		expect(parseArgs("--timeout 121")).toMatchObject({ ok: false });
	});

	it("normalizes backend usage payloads", () => {
		const report = normalizeBackendPayload({
			plan_type: "plus",
			rate_limit: {
				primary_window: { used_percent: 25, limit_window_seconds: 18_000, reset_at: 1_800_000_000 },
				secondary_window: { used_percent: "80", limit_window_seconds: 604_800, reset_at: "1_800_500_000" },
			},
			additional_rate_limits: [{
				limit_name: "GPT-5 Codex",
				metered_feature: "gpt_5_codex",
				rate_limit: { primary_window: { used_percent: 50 } },
			}],
		}, capturedAt, "pi-auth");

		expect(report).toMatchObject({ source: "pi-auth", planType: "plus" });
		expect(report.snapshots).toHaveLength(2);
		expect(report.snapshots[0].primary).toMatchObject({ usedPercent: 25, windowMinutes: 300 });
		expect(report.snapshots[0].secondary).toMatchObject({ usedPercent: 80, windowMinutes: 10080 });
	});

	it("normalizes codex app-server responses", () => {
		const report = normalizeAppServerResponse({
			rateLimits: {
				limitId: "codex",
				planType: "pro_lite",
				primary: { usedPercent: 20, windowDurationMins: 300, resetsAt: 1_800_000_000 },
			},
			rateLimitsByLimitId: {
				gpt_5_codex: {
					limitName: "GPT-5 Codex",
					secondary: { usedPercent: 70, windowDurationMins: 10080 },
				},
			},
		}, capturedAt);

		expect(report).toMatchObject({ source: "codex-app-server", planType: "pro_lite" });
		expect(report.snapshots).toHaveLength(2);
		expect(report.snapshots[1].secondary).toMatchObject({ usedPercent: 70 });
	});

	it("formats footer usage lines for the selected Codex model-specific limit", () => {
		const status = formatCodexUsageStatusline({
			source: "pi-auth",
			capturedAt,
			snapshots: [
				{ limitId: "codex", primary: { usedPercent: 10 }, secondary: { usedPercent: 40 } },
				{ limitId: "gpt_5_codex", limitName: "GPT-5 Codex", primary: { usedPercent: 25 } },
			],
		}, { provider: "openai-codex", id: "gpt-5-codex", name: "GPT-5 Codex" });

		expect(status).toContain("5h");
		expect(status).toContain("75%");
		expect(status).not.toContain("📊 codex");
	});

	it("formats a readable report", () => {
		const report = formatCodexUsageReport({
			source: "pi-auth",
			capturedAt,
			snapshots: [{
				limitId: "codex",
				primary: { usedPercent: 25, resetsAt: 1_800_000_000 },
				secondary: { usedPercent: 80, resetsAt: 1_800_500_000 },
			}],
		});

		expect(report).toContain("Codex 使用状況");
		expect(report).toContain("更新時刻:");
		expect(report).not.toContain(">_ OpenAI Codex Usage");
		expect(report).toContain("5時間制限:");
		expect(report).toContain("75%");
		expect(report).toContain("週制限:");
		expect(report).toContain("20%");
		expect(report).toContain("更新 ");
	});
});
