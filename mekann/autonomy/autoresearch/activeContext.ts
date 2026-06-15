import * as fs from "node:fs";
import * as path from "node:path";
import type { AutoresearchContractV1 } from "./contractV1.js";
import { readState as readStateV2 } from "./layout.js";
import type { SessionStore } from "./tools/sessionStore.js";

// ---------------------------------------------------------------------------
// Dynamic active context builder
// ---------------------------------------------------------------------------

const DYNAMIC_CONTEXT_MAX_CHARS = 4_000;
const JOURNAL_SUMMARY_MAX_ENTRIES = 12;

function summarizeRecentJournal(cwd: string): string[] {
	const jp = journalPathV2(cwd);
	if (!fs.existsSync(jp)) return [];
	try {
		const lines = fs.readFileSync(jp, "utf8").trim().split("\n").filter(Boolean);
		const recent = lines.slice(-JOURNAL_SUMMARY_MAX_ENTRIES);
		return recent.map((l) => {
			try {
				const e = JSON.parse(l);
				const ts = typeof e.createdAt === "string" ? e.createdAt.slice(11, 19) : "";
				const type = e.type ?? "?";
				if (type === "decision") return `${ts} decision=${e.decision} metric=${e.metric ?? "?"} reason=${(e.reason ?? "").slice(0, 60)}`;
				if (type === "run_started") return `${ts} run_started runId=${(e.runId ?? "?").slice(0, 16)}`;
				if (type === "plan_created" || type === "plan_selected") return `${ts} ${type} planId=${(e.planId ?? "?").slice(0, 20)}`;
				return `${ts} ${type}`;
			} catch { return ""; }
		}).filter(Boolean);
	} catch { return []; }
}

function journalPathV2(cwd: string): string {
	return path.join(cwd, ".autoresearch", "journal.jsonl");
}

export function buildActiveContext(cwd: string, store: SessionStore, readCurrentPlanContract: (cwd: string) => AutoresearchContractV1 | null): string {
	const s2 = readStateV2(cwd);
	const lines: string[] = ["", "### autoresearch 現在状態", ""];

	// loop state
	const loop = store.loopInfo();
	lines.push(`loop: ${loop.enabled ? "ON" : "OFF"} iteration=${loop.iteration}/${loop.maxIterations ?? "∞"} noProgress=${loop.noProgress}/${loop.noProgressLimit}`);

	// plan
	if (s2.currentPlanId) {
		lines.push(`planId: ${s2.currentPlanId}`);
		if (s2.currentPlanDir) lines.push(`planDir: ${s2.currentPlanDir}`);
	}

	// metric / objective
	const st = store.state;
	lines.push(`objective: ${st.name ?? "未設定"}`);
	lines.push(`metric: ${st.metricName}(${st.direction})${st.metricUnit ? " " + st.metricUnit : ""}`);
	lines.push(`runCount: ${st.runCount}`);
	if (st.bestMetric !== null) lines.push(`bestMetric: ${st.bestMetric}`);

	// latest / best run
	if (s2.latestRunId) lines.push(`latestRunId: ${s2.latestRunId}`);
	if (s2.bestRunId) lines.push(`bestRunId: ${s2.bestRunId}`);

	// contract summary (V1 shape)
	const planContract = readCurrentPlanContract(cwd);
	if (planContract) {
		const pm = planContract.evaluation.primaryMetric;
		lines.push(`contract.metric: ${pm.name}(${pm.direction})`);
		const benchArgv = planContract.evaluation.benchmark.command.argv;
		lines.push(`benchmark: ${benchArgv.join(" ")}`);
		const checks = planContract.evaluation.checks;
		if (checks.length > 0) {
			lines.push(`checks: ${checks.length} 個`);
		}
		lines.push(`acceptance.mode: ${planContract.acceptance.mode}`);
	}

	// recent journal
	const journalEntries = summarizeRecentJournal(cwd);
	if (journalEntries.length > 0) {
		lines.push("");
		lines.push(`recent journal (last ${journalEntries.length}):`);
		for (const entry of journalEntries) lines.push(`  ${entry}`);
	}

	// files to check
	lines.push("");
	lines.push("確認すべきファイル:");
	lines.push("  - autoresearch.md");
	lines.push("  - .autoresearch/state.json");
	if (s2.currentPlanDir) {
		lines.push(`  - ${s2.currentPlanDir}/plan.md`);
		lines.push(`  - ${s2.currentPlanDir}/contract.json`);
	}
	lines.push("  - .autoresearch/journal.jsonl");

	const result = lines.join("\n");
	if (result.length > DYNAMIC_CONTEXT_MAX_CHARS) {
		return result.slice(0, DYNAMIC_CONTEXT_MAX_CHARS) + "\n  ... (truncated)";
	}
	return result;
}

