import { execFile as execFileCb } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import path from "node:path";
import type { ApplyAgentResultsParams, ApplyAgentResultsResult, ApplyRecord, PatchProposalResult, RejectReason, RequiredCheck, StoredSubagentResult, ValidationCommand, ValidationResult } from "./types.js";
import { SubagentResultStore } from "./resultStore.js";
import { checkBaseFileHashes, detectPublicSurfaceFromPatch, extractTouchedPathsFromPatchStrict, isNewFilePatch, normalizePublicSurfaceDeltas, safeRepoRelativePath } from "./fingerprint.js";
import { evaluateSemanticConflict } from "./semanticConflict.js";
import { keyOfTarget } from "./semantic.js";

const execFile = promisify(execFileCb);

export class ApplyQueue {
  constructor(private readonly store: SubagentResultStore, private readonly cwd = process.cwd(), private readonly shellAllowlist: Record<string, string> = {}) {}
  listAgentResults(filter?: Parameters<SubagentResultStore["list"]>[0]) { return this.store.list(filter); }
  showAgentResult(resultId: string, includePatch = false): StoredSubagentResult & { patch_body?: string } {
    const s = this.store.load(resultId) as StoredSubagentResult & { patch_body?: string };
    if (includePatch && s.result.outcome === "patch" && s.result.patch.ref) {
      if (!isUnderDir(s.result.patch.ref, this.store.dir)) throw new Error("invalid patch ref");
      s.patch_body = readFileSync(s.result.patch.ref, "utf8");
    }
    return s;
  }
  rejectAgentResult(resultId: string, reason: RejectReason = "manual_reject") { this.store.markRejected(resultId, reason); return { result_id: resultId, reason }; }
  async applyAgentResults(params: ApplyAgentResultsParams = {}): Promise<ApplyAgentResultsResult> {
    this.store.recoverStaleApplying();
    const result: ApplyAgentResultsResult = { applied: [], rejected: [], needs_review: [], skipped: [] };
    const items = (params.source === "result_ids" ? (params.result_ids ?? []).map((id) => this.store.load(id)) : this.store.list({ status: "pending" })).slice(0, params.max_results ?? Infinity);
    for (const stored of items) {
      if (stored.status !== "pending" && !(stored.status === "needs_review" && params.allow_high_risk)) { result.skipped.push({ result_id: stored.result_id, reason: `status:${stored.status}` }); continue; }
      await this.applyOne(stored, params, result);
    }
    return result;
  }
  private reject(out: ApplyAgentResultsResult, id: string, reason: RejectReason, details?: unknown) { this.store.markRejected(id, reason, details); out.rejected.push({ result_id: id, reason, details }); }
  private review(out: ApplyAgentResultsResult, id: string, reason: string, details?: unknown) { this.store.markNeedsReview(id, reason, details); out.needs_review.push({ result_id: id, reason, details }); }
  private async applyOne(stored: StoredSubagentResult, params: ApplyAgentResultsParams, out: ApplyAgentResultsResult): Promise<void> {
    const state: { patchApplied: boolean; ref?: string } = { patchApplied: false };
    try { return await this.applyOneInner(stored, params, out, state); }
    catch (err) {
      let rollbackAttempted = false; let rollbackOk: boolean | undefined;
      if (state.patchApplied && state.ref && params.rollback_on_failure !== false) {
        rollbackAttempted = true;
        try { await execFile("git", ["apply", "-R", state.ref], { cwd: this.cwd }); rollbackOk = true; } catch { rollbackOk = false; }
      }
      return this.review(out, stored.result_id, state.patchApplied ? "apply_engine_exception_after_patch_applied" : "apply_engine_exception", { error: err instanceof Error ? err.message : String(err), patch_applied: state.patchApplied, rollback_attempted: rollbackAttempted, rollback_ok: rollbackOk });
    }
  }
  private async applyOneInner(stored: StoredSubagentResult, params: ApplyAgentResultsParams, out: ApplyAgentResultsResult, state: { patchApplied: boolean; ref?: string }): Promise<void> {
    if (stored.workspace_cwd && path.resolve(stored.workspace_cwd) !== path.resolve(this.cwd)) return this.review(out, stored.result_id, "workspace_cwd_mismatch", { stored: stored.workspace_cwd, current: this.cwd });
    const r = stored.result;
    if (r.outcome === "no_change" || r.outcome === "observation") { this.store.markSuperseded(stored.result_id, r.outcome); out.skipped.push({ result_id: stored.result_id, reason: r.outcome }); return; }
    if (r.outcome === "needs_decision") return this.review(out, stored.result_id, r.question);
    if (r.outcome === "blocked") return this.reject(out, stored.result_id, "manual_reject", r.reason);
    this.store.markApplying(stored.result_id);
    const patch = r as PatchProposalResult;
    const ref = patch.patch.ref;
    state.ref = ref;
    if (!ref || !isUnderDir(ref, this.store.dir)) return this.reject(out, stored.result_id, "invalid_patch_ref");
    const patchText = readFileSync(ref, "utf8");
    const maxBytes = stored.authority?.max_patch_bytes ?? 50_000;
    const patchBytes = patch.patch.bytes ?? Buffer.byteLength(patchText, "utf8");
    if (patchBytes > maxBytes) return this.reject(out, stored.result_id, "patch_too_large", { bytes: patchBytes, maxBytes });

    const extractedTouched = extractTouchedPathsFromPatchStrict(patchText);
    if (!extractedTouched.ok) return this.reject(out, stored.result_id, "declared_touched_paths_mismatch", extractedTouched);
    const actualTouched = extractedTouched.paths;
    const declaredTouched = patch.scope.touched_paths.map((p) => safeRepoRelativePath(p)).filter((p): p is string => Boolean(p)).sort();
    if (declaredTouched.length !== patch.scope.touched_paths.length) return this.reject(out, stored.result_id, "declared_touched_paths_mismatch", { reason: "unsafe_declared_path", declared: patch.scope.touched_paths });
    for (const f of patch.base.files) if (!safeRepoRelativePath(f.path)) return this.reject(out, stored.result_id, "base_hash_mismatch", { path: f.path, reason: "unsafe_base_path" });
    if (JSON.stringify(actualTouched) !== JSON.stringify(declaredTouched)) return this.reject(out, stored.result_id, "declared_touched_paths_mismatch", { declared: declaredTouched, actual: actualTouched });
    const writeScope = stored.authority?.write_scope ?? [];
    const canonicalWriteScope = canonicalizeScopePatterns(writeScope);
    if (!canonicalWriteScope.ok) return this.review(out, stored.result_id, "write_scope contains unsafe path pattern", { writeScope, unsafe: canonicalWriteScope.unsafe });
    if (canonicalWriteScope.scopes.length === 0) return this.review(out, stored.result_id, "write_scope is not specified; auto apply requires explicit authority scope", { actualTouched });
    for (const p of actualTouched) if (isReviewOnlyPath(p)) return this.review(out, stored.result_id, "execution_sensitive_path_requires_review", { path: p });
    for (const p of actualTouched) if (!withinAny(p, canonicalWriteScope.scopes)) return this.reject(out, stored.result_id, "outside_path_scope", { path: p, write_scope: canonicalWriteScope.scopes });

    const authoritySem = new Set((stored.authority?.semantic_scope ?? []).map(keyOfTarget));
    if (authoritySem.size) for (const t of [...patch.semantic.reads, ...patch.semantic.writes]) if (!authoritySem.has(keyOfTarget(t))) return this.reject(out, stored.result_id, "outside_semantic_scope", t);

    if (stored.authority?.require_base_hash !== false) {
      const basePaths = new Set(patch.base.files.map((f) => f.path));
      for (const p of actualTouched) {
        if (!basePaths.has(p) && !isNewFilePatch(p, patchText)) return this.reject(out, stored.result_id, "base_hash_mismatch", { path: p, reason: "missing_base_hash" });
      }
    }
    const base = await checkBaseFileHashes(this.cwd, patch.base.files);
    if (!base.ok) return this.reject(out, stored.result_id, "base_hash_mismatch", base);

    const actualSurface = normalizePublicSurfaceDeltas(detectPublicSurfaceFromPatch(patchText));
    const declaredSurface = new Set(normalizePublicSurfaceDeltas(patch.semantic.public_surface_delta).map(surfaceKey));
    const undeclared = actualSurface.filter((d) => !declaredSurface.has(surfaceKey(d)));
    if (undeclared.length) return this.reject(out, stored.result_id, "undeclared_public_surface_delta", undeclared);

    if (stored.authority_enforced === false) return this.review(out, stored.result_id, "Authority was not enforced for external subagent", { authority_enforced: false });

    const conflict = evaluateSemanticConflict(patch, this.store.readSemanticLog(), { allowHighRisk: params.allow_high_risk });
    if (conflict.action === "require_regeneration") return this.reject(out, stored.result_id, "require_regeneration", conflict);
    if (conflict.action === "require_review") return this.review(out, stored.result_id, conflict.reason, conflict);
    if (patch.semantic.risk.level === "high" && !params.allow_high_risk) return this.review(out, stored.result_id, "High semantic risk requires review");

    const requiredResolution = this.resolveRequiredChecks(patch.validation.required ?? [], patch.validation.suggested);
    if (!requiredResolution.ok) return this.review(out, stored.result_id, "Required validation check has no command mapping", requiredResolution);
    const validationCommands = dedupeValidationCommands([...patch.validation.suggested, ...requiredResolution.commands]);
    const disallowed = validationCommands.find((cmd) => !this.isValidationAllowed(cmd, stored));
    if (disallowed) return this.reject(out, stored.result_id, "validation_command_not_allowed", disallowed);

    try { await execFile("git", ["apply", "--check", ref], { cwd: this.cwd }); } catch (err) { return this.reject(out, stored.result_id, "patch_check_failed", err instanceof Error ? err.message : String(err)); }
    try { await execFile("git", ["apply", ref], { cwd: this.cwd }); state.patchApplied = true; } catch (err) { return this.reject(out, stored.result_id, "patch_check_failed", err instanceof Error ? err.message : String(err)); }

    const validations: ValidationResult[] = [];
    for (const cmd of validationCommands) {
      const vr = await this.runValidation(cmd);
      validations.push(vr);
      if (!vr.ok) {
        if (params.rollback_on_failure !== false) { try { await execFile("git", ["apply", "-R", ref], { cwd: this.cwd }); state.patchApplied = false; } catch { /* best-effort */ } }
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
    return allowed.some((a) => commandKey(a) === commandKey(cmd));
  }
  private resolveRequiredChecks(required: RequiredCheck[], suggested: ValidationCommand[]): { ok: true; commands: ValidationCommand[] } | { ok: false; missing: RequiredCheck[] } {
    const commands: ValidationCommand[] = [];
    const missing: RequiredCheck[] = [];
    for (const check of required) {
      if (check.command) { commands.push(check.command); continue; }
      const byConvention = suggested.find((cmd) => cmd.kind === "npm_script" && cmd.script === check.kind);
      if (byConvention) commands.push(byConvention);
      else missing.push(check);
    }
    return missing.length ? { ok: false, missing } : { ok: true, commands };
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
function isReviewOnlyPath(file: string): boolean { return file === ".husky" || file.startsWith(".husky/"); }
function canonicalizeScopePatterns(scopes: string[]): { ok: true; scopes: string[] } | { ok: false; unsafe: string } {
  const out: string[] = [];
  for (const scope of scopes) {
    if (scope.includes("\0") || /^[A-Za-z]:[\\/]/.test(scope) || path.isAbsolute(scope)) return { ok: false, unsafe: scope };
    const placeholder = scope.replace(/\*+/g, "__STAR__");
    const safe = safeRepoRelativePath(placeholder);
    if (!safe) return { ok: false, unsafe: scope };
    out.push(safe.replace(/__STAR__/g, "*"));
  }
  return { ok: true, scopes: out };
}
function commandKey(cmd: ValidationCommand): string { return cmd.kind === "npm_script" ? JSON.stringify({ kind: "npm_script", script: cmd.script, args: cmd.args ?? [] }) : JSON.stringify({ kind: "shell_allowlisted", command_id: cmd.command_id, args: cmd.args ?? [] }); }
function dedupeValidationCommands(commands: ValidationCommand[]): ValidationCommand[] { const seen = new Set<string>(); const out: ValidationCommand[] = []; for (const c of commands) { const k = commandKey(c); if (!seen.has(k)) { seen.add(k); out.push(c); } } return out; }
function surfaceKey(d: { surface: string; name: string; change: string }): string { return `${d.surface}:${d.name}:${d.change}`; }
function withinAny(file: string, scopes: string[]): boolean { if (scopes.length === 0) return true; const norm = file.replace(/\\/g, "/"); return scopes.some((s) => { const scope = s.replace(/\\/g, "/").replace(/\/$/, ""); return norm === scope || norm.startsWith(scope + "/"); }); }
