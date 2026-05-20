import * as fs from "node:fs";
import * as path from "node:path";
import { readCurrentContract, readLockFile } from "../contractV1.js";
import { applyCandidate, candidateDir, candidatePatchPath, importSubagentResultsAsCandidates, listCandidates, readCandidate, updateCandidateStatus } from "../candidate.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ToolResponse, SessionStore } from "./sessionStore.js";

export type CandidateEscrowParams = { source?: "pending" | "result_ids"; result_ids?: string[]; max_results?: number };
export type ShowCandidateParams = { candidate_id: string; include_patch?: boolean; include_source?: boolean };
export type RejectCandidateParams = { candidate_id: string; reason?: string };
export type ApplyCandidateParams = { candidate_id: string };

export function executeCandidateEscrow(store: SessionStore, params: CandidateEscrowParams, ctx: ExtensionContext): ToolResponse {
	const contract = readCurrentContract(ctx.cwd); const lock = readLockFile(ctx.cwd);
	if (!contract || !lock) return store.textResponse("[ERROR] current contract / lock file が見つかりません。先に autoresearch_approve を実行してください。");
	try {
		const result = importSubagentResultsAsCandidates(ctx.cwd, contract, lock, params);
		return store.textDetails(JSON.stringify(result, null, 2), result as unknown as Record<string, unknown>);
	} catch (e) { return store.textResponse(`[ERROR] candidate escrow failed: ${e instanceof Error ? e.message : String(e)}`); }
}

export function executeListCandidates(store: SessionStore, _params: Record<string, never>, ctx: ExtensionContext): ToolResponse {
	try { const result = listCandidates(ctx.cwd); return store.textDetails(JSON.stringify(result, null, 2), { candidates: result }); }
	catch (e) { return store.textResponse(`[ERROR] list candidates failed: ${e instanceof Error ? e.message : String(e)}`); }
}

export function executeShowCandidate(store: SessionStore, params: ShowCandidateParams, ctx: ExtensionContext): ToolResponse {
	try {
		const c: any = readCandidate(ctx.cwd, params.candidate_id);
		if (params.include_patch) c.patch_body = fs.readFileSync(candidatePatchPath(ctx.cwd, params.candidate_id), "utf8");
		if (params.include_source) c.source_result = JSON.parse(fs.readFileSync(path.join(candidateDir(ctx.cwd, params.candidate_id), "source-result.json"), "utf8"));
		return store.textDetails(JSON.stringify(c, null, 2), c);
	} catch (e) { return store.textResponse(`[ERROR] show candidate failed: ${e instanceof Error ? e.message : String(e)}`); }
}

export function executeRejectCandidate(store: SessionStore, params: RejectCandidateParams, ctx: ExtensionContext): ToolResponse {
	try { const c = updateCandidateStatus(ctx.cwd, params.candidate_id, "rejected_policy", { reason: params.reason ?? "manual reject" }); return store.textDetails(JSON.stringify(c, null, 2), c as unknown as Record<string, unknown>); }
	catch (e) { return store.textResponse(`[ERROR] reject candidate failed: ${e instanceof Error ? e.message : String(e)}`); }
}

export function executeApplyCandidate(store: SessionStore, params: ApplyCandidateParams, ctx: ExtensionContext): ToolResponse {
	const contract = readCurrentContract(ctx.cwd); const lock = readLockFile(ctx.cwd);
	if (!contract || !lock) return store.textResponse("[ERROR] current contract / lock file が見つかりません。先に autoresearch_approve を実行してください。");
	try { const c = applyCandidate(ctx.cwd, contract, lock, params.candidate_id); return store.textDetails(JSON.stringify(c, null, 2), c as unknown as Record<string, unknown>); }
	catch (e) { return store.textResponse(`[ERROR] apply candidate failed: ${e instanceof Error ? e.message : String(e)}`); }
}
