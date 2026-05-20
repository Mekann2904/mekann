import { execFile as execFileCb } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import path from "node:path";
import type { ApplyAgentResultsParams, ApplyAgentResultsResult, ApplyRecord, PatchProposalResult, RejectReason, StoredSubagentResult } from "./types.js";
import { SubagentResultStore } from "./resultStore.js";
import { checkBaseFileHashes } from "./fingerprint.js";
import { evaluateSemanticConflict } from "./semanticConflict.js";
import { keyOfTarget } from "./semantic.js";

const execFile = promisify(execFileCb);

export class ApplyQueue {
  constructor(private readonly store: SubagentResultStore, private readonly cwd = process.cwd(), private readonly shellAllowlist: Record<string, string> = {}) {}
  listAgentResults(filter?: Parameters<SubagentResultStore["list"]>[0]) { return this.store.list(filter); }
  showAgentResult(resultId: string, includePatch = false): StoredSubagentResult & { patch_body?: string } {
    const s = this.store.load(resultId) as StoredSubagentResult & { patch_body?: string };
    if (includePatch && s.result.outcome === "patch" && s.result.patch.ref) s.patch_body = readFileSync(s.result.patch.ref, "utf8");
    return s;
  }
  rejectAgentResult(resultId: string, reason: RejectReason = "manual_reject") { this.store.markRejected(resultId, reason); return { result_id: resultId, reason }; }
  async applyAgentResults(params: ApplyAgentResultsParams = {}): Promise<ApplyAgentResultsResult> {
    const result: ApplyAgentResultsResult = { applied: [], rejected: [], needs_review: [], skipped: [] };
    const items = (params.source === "result_ids" ? (params.result_ids ?? []).map((id) => this.store.load(id)) : this.store.list({ status: "pending" })).slice(0, params.max_results ?? Infinity);
    for (const stored of items) await this.applyOne(stored, params, result);
    return result;
  }
  private reject(out: ApplyAgentResultsResult, id: string, reason: RejectReason, details?: unknown) { this.store.markRejected(id, reason); out.rejected.push({ result_id: id, reason, details }); }
  private review(out: ApplyAgentResultsResult, id: string, reason: string, details?: unknown) { this.store.markNeedsReview(id, reason, details); out.needs_review.push({ result_id: id, reason, details }); }
  private async applyOne(stored: StoredSubagentResult, params: ApplyAgentResultsParams, out: ApplyAgentResultsResult): Promise<void> {
    const r = stored.result;
    if (r.outcome === "no_change" || r.outcome === "observation") { out.skipped.push({ result_id: stored.result_id, reason: r.outcome }); return; }
    if (r.outcome === "needs_decision") return this.review(out, stored.result_id, r.question);
    if (r.outcome === "blocked") return this.reject(out, stored.result_id, "manual_reject", r.reason);
    const patch = r as PatchProposalResult;
    const ref = patch.patch.ref;
    if (!ref) return this.reject(out, stored.result_id, "invalid_patch_ref");
    const patchBytes = patch.patch.bytes ?? Buffer.byteLength(readFileSync(ref), "utf8");
    if (patchBytes > 50_000) return this.reject(out, stored.result_id, "patch_too_large", { bytes: patchBytes });
    for (const p of patch.scope.touched_paths) if (!withinAny(p, patch.scope.allowed_paths)) return this.reject(out, stored.result_id, "outside_path_scope", { path: p });
    const base = await checkBaseFileHashes(this.cwd, patch.base.files);
    if (!base.ok) return this.reject(out, stored.result_id, "base_hash_mismatch", base);
    const allowedSem = new Set((patch.scope.semantic_scope ?? []).map(keyOfTarget));
    if (allowedSem.size) for (const t of [...patch.semantic.reads, ...patch.semantic.writes]) if (!allowedSem.has(keyOfTarget(t))) return this.reject(out, stored.result_id, "outside_semantic_scope", t);
    const conflict = evaluateSemanticConflict(patch, this.store.readSemanticLog());
    if (conflict.action === "require_regeneration") return this.reject(out, stored.result_id, "require_regeneration", conflict);
    if (conflict.action === "require_review") return this.review(out, stored.result_id, conflict.reason, conflict);
    if (patch.semantic.risk.level === "high" && !params.allow_high_risk) return this.review(out, stored.result_id, "High semantic risk requires review");
    try { await execFile("git", ["apply", "--check", ref], { cwd: this.cwd }); } catch (err) { return this.reject(out, stored.result_id, "patch_check_failed", err instanceof Error ? err.message : String(err)); }
    try { await execFile("git", ["apply", ref], { cwd: this.cwd }); } catch (err) { return this.reject(out, stored.result_id, "patch_check_failed", err instanceof Error ? err.message : String(err)); }
    const required = patch.validation.required ?? [];
    if (required.length && patch.validation.suggested.length === 0) return this.reject(out, stored.result_id, "validation_command_not_allowed");
    const applyRecord: ApplyRecord = { result_id: stored.result_id, agent_path: stored.agent_path, applied_at: Date.now(), patch_ref: ref, validation_result: { ok: true } };
    this.store.markApplied(stored.result_id, applyRecord);
    this.store.appendSemanticLog({ result_id: stored.result_id, agent_path: stored.agent_path, applied_at: applyRecord.applied_at, reads: patch.semantic.reads, writes: patch.semantic.writes, assumptions: patch.semantic.assumptions, effects: patch.semantic.effects, public_surface_delta: patch.semantic.public_surface_delta, validation_result: { ok: true } });
    out.applied.push(applyRecord);
  }
}

function withinAny(file: string, scopes: string[]): boolean { if (scopes.length === 0) return true; const norm = file.replace(/\\/g, "/"); return scopes.some((s) => { const scope = s.replace(/\\/g, "/").replace(/\/$/, ""); return norm === scope || norm.startsWith(scope + "/") || (scope.includes("*") && new RegExp("^" + scope.split("*").map(escapeRe).join(".*") + "$" ).test(norm)); }); }
function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
