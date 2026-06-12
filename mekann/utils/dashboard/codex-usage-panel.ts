import { summarizeCodexUsageForDashboard, type CodexDashboardSummary } from "../codex-limits/dashboard.js";
import { queryUsage, type CodexUsageReport, type UsageQueryError } from "../codex-limits/usage.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Panel } from "./view-model.js";

export type DashboardCodexUsagePanel = string;

export type CodexUsagePanelSource = {
	query(ctx?: ExtensionContext): Promise<
		| { ok: true; report: CodexUsageReport }
		| { ok: false; errors: UsageQueryError[] }
	>;
};

export const liveCodexUsagePanelSource: CodexUsagePanelSource = {
	query: (ctx?: ExtensionContext) => {
		if (!ctx) {
			return Promise.resolve({
				ok: false,
				errors: [{ source: "codex-app-server", message: "Codex usage requires Pi context" }],
			});
		}
		return queryUsage(ctx, { timeoutMs: 15_000 });
	},
};

export function formatCodexDashboardSummary(summary: CodexDashboardSummary): string {
	const reset = summary.resetAt ? ` · resets ${new Date(summary.resetAt).toLocaleString()}` : "";
	const plan = summary.planType ? `${summary.planType} · ` : "";
	return `${plan}${summary.label}${reset}`;
}

export async function buildCodexUsagePanel(
	source: CodexUsagePanelSource,
	ctx?: ExtensionContext,
): Promise<Panel<DashboardCodexUsagePanel>> {
	const result = await source.query(ctx);
	if (!result.ok) {
		return { status: "error", message: result.errors[0]?.message ?? "Codex usage unavailable" };
	}
	return { status: "ready", data: formatCodexDashboardSummary(summarizeCodexUsageForDashboard(result.report)) };
}
