import { describe, expect, it } from "vitest";
import {
	formatCodexUsageReport,
	formatCodexUsageStatusline,
	normalizeAppServerResponse,
	placeUsageLines,
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
			source: "codex-app-server",
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

	it("splits multiple compact limit lines between sandbox status and footer", () => {
		expect(placeUsageLines(["5h 75%", "wk 20%"])).toEqual({
			sandboxLine: "5h 75%",
			footerLine: "wk 20%",
		});
	});

	it("keeps a single compact limit line in the footer without duplicating it into sandbox status", () => {
		expect(placeUsageLines(["5h 75%"])).toEqual({
			sandboxLine: undefined,
			footerLine: "5h 75%",
		});
	});

	it("keeps both 5h and weekly limits in compact status text", () => {
		const status = formatCodexUsageStatusline({
			source: "codex-app-server",
			capturedAt,
			snapshots: [{
				limitId: "codex",
				primary: { usedPercent: 25 },
				secondary: { usedPercent: 80 },
			}],
		}, { provider: "openai-codex", id: "gpt-5", name: "GPT-5" });

		expect(status).toContain("5h");
		expect(status).toContain("75%");
		expect(status).toContain("wk");
		expect(status).toContain("20%");
	});

	it("formats a readable report", () => {
		const report = formatCodexUsageReport({
			source: "codex-app-server",
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
