import type { CodexUsageReport } from "./usage.js";

export type CodexDashboardSummary = {
	capturedAt: number;
	planType?: string;
	primaryUsedPercent?: number;
	resetAt?: number;
	label: string;
};

export function summarizeCodexUsageForDashboard(report: CodexUsageReport): CodexDashboardSummary {
	const first = report.snapshots[0];
	const percent = first?.primary?.usedPercent;
	return {
		capturedAt: report.capturedAt,
		planType: report.planType,
		primaryUsedPercent: percent,
		resetAt: first?.primary?.resetsAt,
		label: typeof percent === "number" ? `${Math.round(percent)}% used` : "usage unavailable",
	};
}
