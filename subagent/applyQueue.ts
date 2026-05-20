import { execFile as execFileCb } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import path from "node:path";
import type { ApplyAgentResultsParams, ApplyAgentResultsResult, ApplyRecord, PatchProposalResult, RejectReason, StoredSubagentResult, ValidationCommand, ValidationResult } from "./types.js";
import { SubagentResultStore } from "./resultStore.js";
import { checkBaseFileHashes, detectPublicSurfaceFromPatch, extractTouchedPathsFromPatch } from "./fingerprint.js";
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
    if (r.outcome === "no_change" || r.outcome === "observation") { this.store.markSuperseded(stored.result_id, r.outcome); out.skipped.push({ result_id: stored.result_id, reason: r.outcome }); return; }
    if (r.outcome === "needs_decision") return this.review(out, stored.result_id, r.question);
    if (r.outcome === "blocked") return this.reject(out, stored.result_id, "manual_reject", r.reason);
    const patch = r as PatchProposalResult;
    const ref = patch.patch.ref;
    if (!ref || !isUnderDir(ref, this.store.dir)) return this.reject(out, stored.result_id, "invalid_patch_ref");
    const patchText = readFileSync(ref, "utf8");
    const maxBytes = stored.authority?.max_patch_bytes ?? 50_000;
    const patchBytes = patch.patch.bytes ?? Buffer.byteLength(patchText, "utf8");
    if (patchBytes > maxBytes) return this.reject(out, stored.result_id, "patch_too_large", { bytes: patchBytes, maxBytes });

    const actualTouched = extractTouchedPathsFromPatch(patchText);
    const declaredTouched = [...patch.scope.touched_paths].sort();
    if (JSON.stringify(actualTouched) !== JSON.stringify(declaredTouched)) return this.reject(out, stored.result_id, "declared_touched_paths_mismatch", { declared: declaredTouched, actual: actualTouched });
    const writeScope = stored.authority?.write_scope ?? [];
    for (const p of actualTouched) if (!withinAny(p, writeScope)) return this.reject(out, stored.result_id, "outside_path_scope", { path: p, write_scope: writeScope });

    const authoritySem = new Set((stored.authority?.semantic_scope ?? []).map(keyOfTarget));
    if (authoritySem.size) for (const t of [...patch.semantic.reads, ...patch.semantic.writes]) if (!authoritySem.has(keyOfTarget(t))) return this.reject(out, stored.result_id, "outside_semantic_scope", t);

    const base = await checkBaseFileHashes(this.cwd, patch.base.files);
    if (!base.ok) return this.reject(out, stored.result_id, "base_hash_mismatch", base);

    const actualSurface = detectPublicSurfaceFromPatch(patchText);
    const declaredSurface = new Set(patch.semantic.public_surface_delta.map(surfaceKey));
    const undeclared = actualSurface.filter((d) => !declaredSurface.has(surfaceKey(d)));
    if (undeclared.length) return this.reject(out, stored.result_id, "undeclared_public_surface_delta", undeclared);

    if (stored.authority_enforced === false && (patch.semantic.risk.level !== "low" || patch.semantic.public_surface_delta.length > 0)) return this.review(out, stored.result_id, "Authority was not enforced for external subagent", { authority_enforced: false });

    const conflict = evaluateSemanticConflict(patch, this.store.readSemanticLog());
    if (conflict.action === "require_regeneration") return this.reject(out, stored.result_id, "require_regeneration", conflict);
    if (conflict.action === "require_review") return this.review(out, stored.result_id, conflict.reason, conflict);
    if (patch.semantic.risk.level === "high" && !params.allow_high_risk) return this.review(out, stored.result_id, "High semantic risk requires review");

    const validationCommands = [...patch.validation.suggested];
    const disallowed = validationCommands.find((cmd) => !this.isValidationAllowed(cmd, stored));
    if (disallowed) return this.reject(out, stored.result_id, "validation_command_not_allowed", disallowed);

    try { await execFile("git", ["apply", "--check", ref], { cwd: this.cwd }); } catch (err) { return this.reject(out, stored.result_id, "patch_check_failed", err instanceof Error ? err.message : String(err)); }
    try { await execFile("git", ["apply", ref], { cwd: this.cwd }); } catch (err) { return this.reject(out, stored.result_id, "patch_check_failed", err instanceof Error ? err.message : String(err)); }

    const validations: ValidationResult[] = [];
    for (const cmd of validationCommands) {
      const vr = await this.runValidation(cmd);
      validations.push(vr);
      if (!vr.ok) {
        if (params.rollback_on_failure !== false) { try { await execFile("git", ["apply", "-R", ref], { cwd: this.cwd }); } catch { /* best-effort */ } }
        return this.reject(out, stored.result_id, "validation_failed", vr);
      }
    }
    const validationResult: ValidationResult = validations.find((v) => !v.ok) ?? { ok: true, output: validations.map((v) => v.output).filter(Boolean).join("\n") };
    const applyRecord: ApplyRecord = { result_id: stored.result_id, agent_path: stored.agent_path, applied_at: Date.now(), patch_ref: ref, validation_result: validationResult };
    this.store.markApplied(stored.result_id, applyRecord);
    this.store.appendSemanticLog({ result_id: stored.result_id, agent_path: stored.agent_path, applied_at: applyRecord.applied_at, reads: patch.semantic.reads, writes: patch.semantic.writes, assumptions: patch.semantic.assumptions, effects: patch.semantic.effects, public_surface_delta: patch.semantic.public_surface_delta, validation_result: validationResult });
    out.applied.push(applyRecord);
  }
  private isValidationAllowed(cmd: ValidationCommand, stored: StoredSubagentResult): boolean {
    const allowed = stored.authority?.allowed_commands ?? [];
    return allowed.some((a) => JSON.stringify(a) === JSON.stringify(cmd) || (a.kind === "npm_script" && cmd.kind === "npm_script" && a.script === cmd.script) || (a.kind === "shell_allowlisted" && cmd.kind === "shell_allowlisted" && a.command_id === cmd.command_id));
  }
  private async runValidation(cmd: ValidationCommand): Promise<ValidationResult> {
    try {
      if (cmd.kind === "npm_script") { const r = await execFile("npm", ["run", cmd.script, "--", ...(cmd.args ?? [])], { cwd: this.cwd }); return { ok: true, command: cmd, output: `${r.stdout}${r.stderr}` }; }
      const bin = this.shellAllowlist[cmd.command_id];
      if (!bin) return { ok: false, command: cmd, error: "command_id not configured" };
      const r = await execFile(bin, cmd.args ?? [], { cwd: this.cwd }); return { ok: true, command: cmd, output: `${r.stdout}${r.stderr}` };
    } catch (err) { return { ok: false, command: cmd, error: err instanceof Error ? err.message : String(err) }; }
  }
}

function isUnderDir(file: string, dir: string): boolean { const rel = path.relative(path.resolve(dir), path.resolve(file)); return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel); }
function surfaceKey(d: { surface: string; name: string; change: string }): string { return `${d.surface}:${d.name}:${d.change}`; }
function withinAny(file: string, scopes: string[]): boolean { if (scopes.length === 0) return true; const norm = file.replace(/\\/g, "/"); return scopes.some((s) => { const scope = s.replace(/\\/g, "/").replace(/\/$/, ""); return norm === scope || norm.startsWith(scope + "/") || (scope.includes("*") && new RegExp("^" + scope.split("*").map(escapeRe).join(".*") + "$" ).test(norm)); }); }
function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
