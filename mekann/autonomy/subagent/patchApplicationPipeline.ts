/**
 * PatchApplicationPipeline — trust transition decision steps for patch application.
 *
 * Owns the decision logic from intake through git apply, validation, and rollback.
 * Returns a decision; store mutation stays in ApplyQueue.
 * No direct store mutation — only reads semantic log via adapter.
 */

import path from "node:path";
import type {
	ApplyAgentResultsParams,
	ApplyRecord,
	PatchProposalResult,
	RejectReason,
	SemanticApplyLogEntry,
	StoredSubagentResult,
	ValidationResult,
} from "./types.js";
import type { GitPatchAdapter, RollbackResult } from "./gitPatchAdapter.js";
import type { ValidationRunner } from "./validationRunner.js";
import type { SemanticConflictLogReader } from "./resultStoreAdapter.js";
import { admitPatchProposal } from "./patchProposalIntake.js";
import { evaluateSemanticConflict } from "./semanticConflict.js";
import { isPatchRefUnderDir } from "./pathSafety.js";

// ---------------------------------------------------------------------------
// Decision types
// ---------------------------------------------------------------------------

export type PatchApplicationDecision =
	| { kind: "applied"; record: ApplyRecord; semanticLog: SemanticApplyLogEntry }
	| { kind: "rejected"; result_id: string; reason: RejectReason; details?: unknown }
	| { kind: "needs_review"; result_id: string; reason: string; details?: unknown }
	| { kind: "skipped"; result_id: string; reason: string };

export interface PatchApplicationPipelineInput {
	stored: StoredSubagentResult;
	params: ApplyAgentResultsParams;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isReviewOnlyPath(file: string): boolean {
	return file === ".husky" || file.startsWith(".husky/");
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export class PatchApplicationPipeline {
	constructor(private readonly deps: {
		cwd: string;
		patchRefRootDir: string;
		git: GitPatchAdapter;
		validator: ValidationRunner;
		semanticLog: SemanticConflictLogReader;
	}) {}

	async apply(input: PatchApplicationPipelineInput): Promise<PatchApplicationDecision> {
		const { stored, params } = input;
		const state: { patchApplied: boolean; ref?: string; touchedPaths?: string[] } = { patchApplied: false };

		try {
			return await this.applyInner(stored, params, state);
		} catch (err) {
		// Unexpected exception — attempt rollback if patch was applied
		let rollbackAttempted = false;
		let rollback: RollbackResult | undefined;
		if (state.patchApplied && state.ref && params.rollback_on_failure !== false) {
			rollbackAttempted = true;
			try {
				rollback = await this.deps.git.rollback(state.ref, state.touchedPaths);
			} catch {
				rollback = { fullyReverted: false, residual: [], method: "none" };
			}
		}
		return {
			kind: "needs_review",
			result_id: stored.result_id,
			reason: state.patchApplied
				? "apply_engine_exception_after_patch_applied"
				: "apply_engine_exception",
			details: {
				error: err instanceof Error ? err.message : String(err),
				patch_applied: state.patchApplied,
				rollback_attempted: rollbackAttempted,
				rollback_fully_reverted: rollback?.fullyReverted,
				rollback_method: rollback?.method,
				rollback_residual: rollback?.residual,
			},
		};
		}
	}

	private async applyInner(
		stored: StoredSubagentResult,
		params: ApplyAgentResultsParams,
		state: { patchApplied: boolean; ref?: string; touchedPaths?: string[] },
	): Promise<PatchApplicationDecision> {
		const id = stored.result_id;

		// 1. workspace_cwd mismatch
		if (stored.workspace_cwd && path.resolve(stored.workspace_cwd) !== path.resolve(this.deps.cwd)) {
			return { kind: "needs_review", result_id: id, reason: "workspace_cwd_mismatch", details: { stored: stored.workspace_cwd, current: this.deps.cwd } };
		}

		const r = stored.result;

		// 2. no_change / observation → skip
		if (r.outcome === "no_change" || r.outcome === "observation") {
			return { kind: "skipped", result_id: id, reason: r.outcome };
		}

		// 3. needs_decision → review
		if (r.outcome === "needs_decision") {
			return { kind: "needs_review", result_id: id, reason: (r as any).question };
		}

		// 4. blocked → reject
		if (r.outcome === "blocked") {
			return { kind: "rejected", result_id: id, reason: "manual_reject", details: (r as any).reason };
		}

		// 5. patch ref validation
		const patch = r as PatchProposalResult;
		const ref = patch.patch.ref;
		state.ref = ref;
		if (!ref || !isPatchRefUnderDir(ref, this.deps.patchRefRootDir)) {
			return { kind: "rejected", result_id: id, reason: "invalid_patch_ref" };
		}

		// 6. Patch proposal intake (policy)
		const intake = admitPatchProposal({
			cwd: this.deps.cwd,
			proposal: patch,
			authority: stored.authority,
			authorityEnforced: stored.authority_enforced,
			patchRefRootDir: this.deps.patchRefRootDir,
			profile: "subagent_apply",
		});
		if (intake.kind === "review") {
			return { kind: "needs_review", result_id: id, reason: intake.reason, details: intake.details };
		}
		if (intake.kind === "reject") {
			return { kind: "rejected", result_id: id, reason: intake.reason as RejectReason, details: intake.details };
		}

		// 7. empty write_scope
		const actualTouched = intake.touchedPaths;
		state.touchedPaths = actualTouched;
		if (intake.canonicalWriteScope.length === 0) {
			return { kind: "needs_review", result_id: id, reason: "write_scope is not specified; auto apply requires explicit authority scope", details: { actualTouched } };
		}

		// 8. review-only paths (.husky)
		for (const p of actualTouched) {
			if (isReviewOnlyPath(p)) {
				return { kind: "needs_review", result_id: id, reason: "execution_sensitive_path_requires_review", details: { path: p } };
			}
		}

		// 9. Semantic conflict evaluation
		const conflict = evaluateSemanticConflict(
			patch,
			this.deps.semanticLog.readSemanticLog(),
			{ allowHighRisk: params.allow_high_risk },
		);
		if (conflict.action === "require_regeneration") {
			return { kind: "rejected", result_id: id, reason: "require_regeneration", details: conflict };
		}
		if (conflict.action === "require_review") {
			return { kind: "needs_review", result_id: id, reason: conflict.reason, details: conflict };
		}

		// 10. High semantic risk
		if (patch.semantic.risk.level === "high" && !params.allow_high_risk) {
			return { kind: "needs_review", result_id: id, reason: "High semantic risk requires review" };
		}

		// 11. Required validation mapping
		const requiredResolution = this.deps.validator.resolveRequiredChecks(
			patch.validation.required ?? [],
			patch.validation.suggested,
		);
		if (!requiredResolution.ok) {
			return { kind: "needs_review", result_id: id, reason: "Required validation check has no command mapping", details: requiredResolution };
		}

		// 12. Validation allowlist
		const validationCommands = this.deps.validator.dedupe([
			...patch.validation.suggested,
			...requiredResolution.commands,
		]);
		const disallowed = validationCommands.find((cmd) => !this.deps.validator.isAllowed(cmd, stored));
		if (disallowed) {
			return { kind: "rejected", result_id: id, reason: "validation_command_not_allowed", details: disallowed };
		}

		// 13. git apply --check
		try {
			await this.deps.git.check(ref);
		} catch (err) {
			return { kind: "rejected", result_id: id, reason: "patch_check_failed", details: err instanceof Error ? err.message : String(err) };
		}

		// 14. git apply
		try {
			await this.deps.git.apply(ref);
			state.patchApplied = true;
		} catch (err) {
			return { kind: "rejected", result_id: id, reason: "patch_check_failed", details: err instanceof Error ? err.message : String(err) };
		}

		// 15. Run validation commands in parallel
		const validations = await this.deps.validator.runAll(validationCommands);
		const firstFailure = validations.find((v) => !v.ok);
		if (firstFailure) {
			let rollback: RollbackResult | undefined;
			if (params.rollback_on_failure !== false) {
				try {
					rollback = await this.deps.git.rollback(ref, actualTouched);
					if (rollback?.fullyReverted) state.patchApplied = false;
				} catch {
					/* best-effort */
				}
			}
			return { kind: "rejected", result_id: id, reason: "validation_failed", details: { ...firstFailure, all_validations: validations, rollback_fully_reverted: rollback?.fullyReverted, rollback_residual: rollback?.residual } };
		}

		// 16. Success
		const validationResult: ValidationResult =
			validations.find((v) => !v.ok) ??
			{ ok: true, output: validations.map((v) => v.output).filter(Boolean).join("\n") };
		const appliedAt = Date.now();
		const applyRecord: ApplyRecord = {
			result_id: id,
			agent_path: stored.agent_path,
			applied_at: appliedAt,
			patch_ref: ref,
			validation_result: validationResult,
		};
		const semanticLog: SemanticApplyLogEntry = {
			result_id: id,
			agent_path: stored.agent_path,
			applied_at: appliedAt,
			reads: patch.semantic.reads,
			writes: patch.semantic.writes,
			assumptions: patch.semantic.assumptions,
			effects: patch.semantic.effects,
			public_surface_delta: patch.semantic.public_surface_delta,
			validation_result: validationResult,
		};
		return { kind: "applied", record: applyRecord, semanticLog };
	}
}
