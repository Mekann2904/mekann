import { readFileSync } from "node:fs";
import path from "node:path";
import type { ApplyAgentResultsParams, ApplyAgentResultsResult, ApplyRecord, RejectReason, StoredSubagentResult } from "./types.js";
import { SubagentResultStore } from "./resultStore.js";
import { ExecFileGitPatchAdapter } from "./gitPatchAdapter.js";
import { ExecFileValidationRunner } from "./validationRunner.js";
import { ResultStoreSemanticLogReader } from "./resultStoreAdapter.js";
import { PatchApplicationPipeline, type PatchApplicationDecision } from "./patchApplicationPipeline.js";

function isUnderDir(file: string, dir: string): boolean {
	const rel = path.relative(path.resolve(dir), path.resolve(file));
	return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

export class ApplyQueue {
	private readonly pipeline: PatchApplicationPipeline;

	constructor(
		private readonly store: SubagentResultStore,
		private readonly cwd = process.cwd(),
		private readonly shellAllowlist: Record<string, string> = {},
	) {
		this.pipeline = new PatchApplicationPipeline({
			cwd: this.cwd,
			patchRefRootDir: this.store.dir,
			git: new ExecFileGitPatchAdapter(this.cwd),
			validator: new ExecFileValidationRunner(this.cwd, this.shellAllowlist),
			semanticLog: new ResultStoreSemanticLogReader(this.store),
		});
	}

	listAgentResults(filter?: Parameters<SubagentResultStore["list"]>[0]) {
		return this.store.list(filter);
	}

	showAgentResult(resultId: string, includePatch = false): StoredSubagentResult & { patch_body?: string } {
		const s = this.store.load(resultId) as StoredSubagentResult & { patch_body?: string };
		if (includePatch && s.result.outcome === "patch" && s.result.patch.ref) {
			if (!isUnderDir(s.result.patch.ref, this.store.dir)) throw new Error("invalid patch ref");
			s.patch_body = readFileSync(s.result.patch.ref, "utf8");
		}
		return s;
	}

	rejectAgentResult(resultId: string, reason: RejectReason = "manual_reject") {
		this.store.markRejected(resultId, reason);
		return { result_id: resultId, reason };
	}

	async applyAgentResults(params: ApplyAgentResultsParams = {}): Promise<ApplyAgentResultsResult> {
		this.store.recoverStaleApplying();
		const result: ApplyAgentResultsResult = { applied: [], rejected: [], needs_review: [], skipped: [] };
		const items = (params.source === "result_ids"
			? (params.result_ids ?? []).map((id) => this.store.load(id))
			: this.store.list({ status: "pending" })
		).slice(0, params.max_results ?? Infinity);

		for (const stored of items) {
			if (stored.status !== "pending" && !(stored.status === "needs_review" && params.allow_high_risk)) {
				result.skipped.push({ result_id: stored.result_id, reason: `status:${stored.status}` });
				continue;
			}
			await this.applyOne(stored, params, result);
		}
		return result;
	}

	private reject(out: ApplyAgentResultsResult, id: string, reason: RejectReason, details?: unknown) {
		this.store.markRejected(id, reason, details);
		out.rejected.push({ result_id: id, reason, details });
	}

	private review(out: ApplyAgentResultsResult, id: string, reason: string, details?: unknown) {
		this.store.markNeedsReview(id, reason, details);
		out.needs_review.push({ result_id: id, reason, details });
	}

	private async applyOne(
		stored: StoredSubagentResult,
		params: ApplyAgentResultsParams,
		out: ApplyAgentResultsResult,
	): Promise<void> {
		// Preserve the previous trust-transition state marker: only patch results
		// in the current workspace enter the transient applying state. Preliminary
		// outcomes (no_change/observation/needs_decision/blocked) and workspace
		// mismatches should not be marked applying.
		if (
			stored.result.outcome === "patch" &&
			(!stored.workspace_cwd || path.resolve(stored.workspace_cwd) === path.resolve(this.cwd))
		) {
			this.store.markApplying(stored.result_id);
		}
		const decision = await this.pipeline.apply({ stored, params });
		this.applyDecision(decision, stored, out);
	}

	private applyDecision(
		decision: PatchApplicationDecision,
		stored: StoredSubagentResult,
		out: ApplyAgentResultsResult,
	): void {
		switch (decision.kind) {
			case "applied":
				this.store.markApplied(stored.result_id, decision.record);
				this.store.appendSemanticLog(decision.semanticLog);
				out.applied.push(decision.record);
				break;
			case "rejected":
				this.reject(out, stored.result_id, decision.reason, decision.details);
				break;
			case "needs_review":
				this.review(out, stored.result_id, decision.reason, decision.details);
				break;
			case "skipped":
				this.store.markSuperseded(stored.result_id, decision.reason);
				out.skipped.push({ result_id: stored.result_id, reason: decision.reason });
				break;
		}
	}
}
