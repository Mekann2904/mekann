import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { computeContractHash, type AutoresearchContractV1, type LockFile } from "./contractV1.js";
import { filterInternalPaths, matchesAnyPattern } from "./contractV1.js";
import { SubagentResultStore } from "../subagent/resultStore.js";
import { extractTouchedPathsFromPatchStrict, isNewFilePatch } from "../subagent/fingerprint.js";
import { getChangedFiles } from "./runner.js";
import { getPlanDir, readState } from "./layout.js";

export type CandidateStatus = "pending" | "leased" | "trial_applied" | "evaluating" | "kept" | "discarded" | "stale_base" | "rejected_policy" | "paused_dirty";

export interface AutoresearchCandidateV1 {
	schema: "autoresearch.candidate.v1";
	candidate_id: string;
	source: { kind: "subagent_result"; result_id: string; agent_path: string };
	contract_hash: string;
	base_git_commit: string;
	patch_sha256: string;
	hypothesis: string;
	expected_metric: { name: string; direction: "lower" | "higher"; confidence?: number };
	touched_paths: string[];
	semantic_risk: "low" | "medium" | "high";
	status: CandidateStatus;
	created_at: number;
	updated_at: number;
	trial?: { mode: "main_worktree" | "isolated_worktree"; worktree_path?: string; created_at?: number; removed_at?: number; applied_diff_sha256?: string };
	materialization?: { replayed_to_main?: boolean; commit?: string };
	decision?: { run_id?: string; metric?: number | null; reason?: string; commit?: string };
}

export interface CandidateImportResult { imported: AutoresearchCandidateV1[]; skipped: Array<{ result_id?: string; reason: string; details?: unknown }>; }

let counter = 0;
function nextCandidateId(): string { return `arc_${Date.now().toString(36)}_${++counter}`; }
export function sha256Text(s: string): string { return "sha256:" + crypto.createHash("sha256").update(s, "utf8").digest("hex"); }
function sha256Buffer(b: Buffer): string { return "sha256:" + crypto.createHash("sha256").update(b).digest("hex"); }
export function fullHead(cwd: string): string { return execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim(); }

export function currentPlanDir(cwd: string): string {
	const s = readState(cwd);
	if (!s.currentPlanId) throw new Error("current plan が見つかりません");
	return s.currentPlanDir ? path.resolve(cwd, s.currentPlanDir) : getPlanDir(cwd, s.currentPlanId);
}
export function candidatesDir(cwd: string): string { return path.join(currentPlanDir(cwd), "candidates"); }
export function candidateDir(cwd: string, id: string): string { assertCandidateId(id); return path.join(candidatesDir(cwd), id); }
export function candidatePath(cwd: string, id: string): string { return path.join(candidateDir(cwd, id), "candidate.json"); }
export function candidatePatchPath(cwd: string, id: string): string { return path.join(candidateDir(cwd, id), "patch.diff"); }
export function assertCandidateId(id: string): void { if (!/^arc_[a-z0-9]+_[0-9]+$/i.test(id)) throw new Error(`Invalid candidate_id: ${id}`); }

export function readCandidate(cwd: string, id: string): AutoresearchCandidateV1 { return JSON.parse(fs.readFileSync(candidatePath(cwd, id), "utf8")); }
export function writeCandidate(cwd: string, c: AutoresearchCandidateV1): void { fs.mkdirSync(candidateDir(cwd, c.candidate_id), { recursive: true }); fs.writeFileSync(candidatePath(cwd, c.candidate_id), JSON.stringify({ ...c, updated_at: Date.now() }, null, 2) + "\n", "utf8"); }
export function listCandidates(cwd: string): AutoresearchCandidateV1[] { const dir = candidatesDir(cwd); if (!fs.existsSync(dir)) return []; return fs.readdirSync(dir).flatMap((id) => { try { return [readCandidate(cwd, id)]; } catch { return []; } }).sort((a,b)=>a.created_at-b.created_at); }
export function candidateEventsPath(cwd: string, id: string): string { return path.join(candidateDir(cwd, id), "events.jsonl"); }
export function appendCandidateEvent(cwd: string, id: string, entry: { from?: CandidateStatus; to: CandidateStatus; reason?: string; details?: Record<string, unknown> }): void { fs.mkdirSync(candidateDir(cwd, id), { recursive: true }); fs.appendFileSync(candidateEventsPath(cwd, id), JSON.stringify({ timestamp: Date.now(), candidate_id: id, ...entry }) + "\n", "utf8"); }
const allowedTransitions: Partial<Record<CandidateStatus, CandidateStatus[]>> = {
	pending: ["leased", "trial_applied", "rejected_policy", "stale_base", "paused_dirty"],
	leased: ["trial_applied", "rejected_policy", "stale_base", "paused_dirty"],
	trial_applied: ["evaluating", "paused_dirty", "discarded"],
	evaluating: ["kept", "discarded", "paused_dirty", "stale_base"],
};
export function updateCandidateStatus(cwd: string, id: string, status: CandidateStatus, decision?: AutoresearchCandidateV1["decision"], details?: Record<string, unknown>): AutoresearchCandidateV1 { const c = readCandidate(cwd, id); const from = c.status; if (from !== status) { const allowed = allowedTransitions[from] ?? []; if (!allowed.includes(status)) throw new Error(`invalid candidate status transition: ${from} -> ${status}`); } c.status = status; if (decision) c.decision = { ...(c.decision ?? {}), ...decision }; writeCandidate(cwd, c); appendCandidateEvent(cwd, id, { from, to: status, reason: decision?.reason, details }); return readCandidate(cwd, id); }

export function extractTouchedPathsFromPatch(patch: string): string[] {
	const paths = new Set<string>();
	for (const line of patch.split(/\r?\n/)) {
		if (!line.startsWith("+++ ") && !line.startsWith("--- ")) continue;
		const raw = line.slice(4).trim().split(/\s+/)[0];
		if (raw === "/dev/null") continue;
		const p = raw.replace(/^a\//, "").replace(/^b\//, "");
		if (safeRepoRelativePath(p)) paths.add(p);
	}
	return [...paths].sort();
}
export function safeRepoRelativePath(p: string): string | null { const n = p.replace(/\\/g, "/"); if (!n || n.includes("\0") || n.startsWith("/") || /^[A-Za-z]:\//.test(n)) return null; const norm = path.posix.normalize(n); if (norm === "." || norm.startsWith("../") || norm === "..") return null; return norm; }
function matchesAny(file: string, scopes: string[]): boolean { return scopes.length === 0 || matchesAnyPattern(file, scopes); }
function isUnderDir(file: string, dir: string): boolean { const rel = path.relative(path.resolve(dir), path.resolve(file)); return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel); }
export function candidateChangedFiles(cwd: string): string[] {
	const out = new Set<string>();
	for (const f of filterInternalPaths(getChangedFiles(cwd))) {
		const abs = path.join(cwd, f);
		if (f.endsWith("/") || (fs.existsSync(abs) && fs.statSync(abs).isDirectory())) {
			for (const child of walkFiles(abs)) out.add(path.relative(cwd, child).replace(/\\/g, "/"));
		} else out.add(f.replace(/\\/g, "/"));
	}
	return [...out].sort();
}
function walkFiles(dir: string): string[] { const out: string[] = []; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) out.push(...walkFiles(p)); else out.push(p); } return out; }
export function candidateDiffIdentityHash(cwd: string): string {
	const entries = candidateChangedFiles(cwd).map((p) => {
		const fp = path.join(cwd, p);
		return { path: p, exists: fs.existsSync(fp), hash: fs.existsSync(fp) && fs.statSync(fp).isFile() ? sha256Buffer(fs.readFileSync(fp)) : null };
	});
	return sha256Text(JSON.stringify(entries));
}
function validateBaseFileHashesSync(cwd: string, files: Array<{ path: string; hash: string }>): { ok: true } | { ok: false; path: string; expected: string; actual?: string } {
	for (const f of files) {
		const safe = safeRepoRelativePath(f.path); if (!safe) return { ok: false, path: f.path, expected: f.hash };
		try { const actual = sha256Buffer(fs.readFileSync(path.join(cwd, safe))); if (actual !== f.hash) return { ok: false, path: f.path, expected: f.hash, actual }; }
		catch { return { ok: false, path: f.path, expected: f.hash }; }
	}
	return { ok: true };
}

export function validateTouchedAgainstContract(paths: string[], contract: AutoresearchContractV1): { ok: true } | { ok: false; reason: string; details?: unknown } {
	for (const p of paths) {
		const safe = safeRepoRelativePath(p); if (!safe) return { ok: false, reason: "unsafe_path", details: p };
		if (!matchesAny(safe, contract.scope.allowedWritePaths)) return { ok: false, reason: "outside_allowed_write_paths", details: { path: safe, allowedWritePaths: contract.scope.allowedWritePaths } };
		if (matchesAnyPattern(safe, contract.scope.forbiddenWritePaths)) return { ok: false, reason: "forbidden_write_path", details: safe };
		if (matchesAnyPattern(safe, contract.scope.immutableReadPaths)) return { ok: false, reason: "immutable_read_path", details: safe };
	}
	return { ok: true };
}

export function importSubagentResultsAsCandidates(cwd: string, contract: AutoresearchContractV1, lock: LockFile, params: { source?: "pending" | "result_ids"; result_ids?: string[]; max_results?: number }): CandidateImportResult {
	const result: CandidateImportResult = { imported: [], skipped: [] };
	const storeDir = path.join(cwd, ".pi", "subagent-results");
	if (!fs.existsSync(storeDir)) return result;
	const ids = params.source === "result_ids" ? (params.result_ids ?? []) : fs.readdirSync(storeDir).filter((f)=>/^sar_.*\.json$/.test(f)).map((f)=>f.slice(0,-5));
	const existing = listCandidates(cwd);
	const contractHash = computeContractHash(contract);
	if (contractHash !== lock.contractHash) throw new Error("current contract hash does not match lock");
	const store = new SubagentResultStore(cwd);
	for (const id of ids.slice(0, params.max_results ?? Infinity)) {
		try {
			const stored = store.load(id);
			if (stored.status !== "pending") { result.skipped.push({ result_id: id, reason: `status:${stored.status}` }); continue; }
			if (stored.workspace_cwd && path.resolve(stored.workspace_cwd) !== path.resolve(cwd)) { result.skipped.push({ result_id: id, reason: "workspace_cwd_mismatch", details: stored.workspace_cwd }); continue; }
			if (stored.authority_enforced === false) { result.skipped.push({ result_id: id, reason: "authority_not_enforced" }); continue; }
			if (stored.result?.outcome !== "patch") { result.skipped.push({ result_id: id, reason: `outcome:${stored.result?.outcome}` }); continue; }
			const ref = stored.result.patch?.ref;
			if (typeof ref !== "string" || !isUnderDir(ref, storeDir)) { result.skipped.push({ result_id: id, reason: "invalid_patch_ref" }); continue; }
			const patchText = fs.readFileSync(ref, "utf8");
			const patchBytes = stored.result.patch.bytes ?? Buffer.byteLength(patchText, "utf8");
			const maxBytes = stored.authority?.max_patch_bytes ?? 50_000;
			if (patchBytes > maxBytes) { result.skipped.push({ result_id: id, reason: "patch_too_large", details: { bytes: patchBytes, maxBytes } }); continue; }
			if (stored.result.semantic.risk.level === "high") { result.skipped.push({ result_id: id, reason: "high_risk_requires_review" }); continue; }
			const base = validateBaseFileHashesSync(cwd, stored.result.base.files);
			if (!base.ok) { result.skipped.push({ result_id: id, reason: "base_hash_mismatch", details: base }); continue; }
			const patchSha = sha256Text(patchText);
			const extractedTouched = extractTouchedPathsFromPatchStrict(patchText);
			if (!extractedTouched.ok) { result.skipped.push({ result_id: id, reason: "unsafe_patch_path", details: extractedTouched }); continue; }
			const extracted = extractedTouched.paths;
			const declared = (stored.result.scope?.touched_paths ?? []).map(safeRepoRelativePath).filter(Boolean).sort();
			if (JSON.stringify(extracted) !== JSON.stringify(declared)) { result.skipped.push({ result_id: id, reason: "declared_touched_paths_mismatch", details: { declared, extracted } }); continue; }
			if (stored.authority?.require_base_hash !== false) {
				const basePaths = new Set(stored.result.base.files.map((f) => f.path));
				const missingBase = extracted.find((p) => !basePaths.has(p) && !isNewFilePatch(p, patchText));
				if (missingBase) { result.skipped.push({ result_id: id, reason: "base_hash_mismatch", details: { path: missingBase, reason: "missing_base_hash" } }); continue; }
			}
			const scope = validateTouchedAgainstContract(extracted, contract);
			if (scope.ok === false) { result.skipped.push({ result_id: id, reason: scope.reason, details: scope.details }); continue; }
			const duplicate = existing.find((c)=>c.source.result_id === id && c.patch_sha256 === patchSha && c.contract_hash === contractHash);
			if (duplicate) { result.skipped.push({ result_id: id, reason: "duplicate", details: duplicate.candidate_id }); continue; }
			const now = Date.now();
			const c: AutoresearchCandidateV1 = { schema: "autoresearch.candidate.v1", candidate_id: nextCandidateId(), source: { kind: "subagent_result", result_id: id, agent_path: stored.agent_path }, contract_hash: contractHash, base_git_commit: fullHead(cwd), patch_sha256: patchSha, hypothesis: stored.result.summary, expected_metric: { name: contract.evaluation.primaryMetric.name, direction: contract.evaluation.primaryMetric.direction }, touched_paths: extracted, semantic_risk: stored.result.semantic?.risk?.level ?? "medium", status: "pending", created_at: now, updated_at: now };
			fs.mkdirSync(candidateDir(cwd, c.candidate_id), { recursive: true });
			fs.writeFileSync(candidatePatchPath(cwd, c.candidate_id), patchText, "utf8");
			fs.writeFileSync(path.join(candidateDir(cwd, c.candidate_id), "source-result.json"), JSON.stringify(stored, null, 2) + "\n", "utf8");
			writeCandidate(cwd, c);
			store.markEscrowed(id, { system: "autoresearch", candidate_id: c.candidate_id, contract_hash: contractHash, escrowed_at: now });
			appendCandidateEvent(cwd, c.candidate_id, { to: "pending", reason: "candidate escrow", details: { result_id: id } });
			result.imported.push(readCandidate(cwd, c.candidate_id)); existing.push(c);
		} catch (e) { result.skipped.push({ result_id: id, reason: "error", details: e instanceof Error ? e.message : String(e) }); }
	}
	return result;
}

export function applyCandidate(cwd: string, contract: AutoresearchContractV1, lock: LockFile, candidateId: string): AutoresearchCandidateV1 {
	let c = readCandidate(cwd, candidateId);
	if (c.status !== "pending") throw new Error(`candidate status must be pending: ${c.status}`);
	c = updateCandidateStatus(cwd, candidateId, "leased");
	try {
		if (c.contract_hash !== lock.contractHash || computeContractHash(contract) !== c.contract_hash) { updateCandidateStatus(cwd, candidateId, "rejected_policy"); throw new Error("candidate contract hash mismatch"); }
		if (fullHead(cwd) !== c.base_git_commit) { updateCandidateStatus(cwd, candidateId, "stale_base"); throw new Error("candidate base git commit is stale"); }
		const dirty = candidateChangedFiles(cwd);
		if (dirty.length) { updateCandidateStatus(cwd, candidateId, "paused_dirty"); throw new Error(`working tree is dirty: ${dirty.join(", ")}`); }
		const patchPath = candidatePatchPath(cwd, candidateId);
		const patchText = fs.readFileSync(patchPath, "utf8");
		if (sha256Text(patchText) !== c.patch_sha256) { updateCandidateStatus(cwd, candidateId, "rejected_policy"); throw new Error("candidate patch hash mismatch"); }
		execFileSync("git", ["apply", "--check", patchPath], { cwd, stdio: ["ignore", "pipe", "pipe"] });
		execFileSync("git", ["apply", patchPath], { cwd, stdio: ["ignore", "pipe", "pipe"] });
		const changed = candidateChangedFiles(cwd);
		const expected = [...c.touched_paths].sort();
		const scope = validateTouchedAgainstContract(changed, contract);
		if (JSON.stringify(changed) !== JSON.stringify(expected) || !scope.ok) { updateCandidateStatus(cwd, candidateId, "paused_dirty"); throw new Error(`applied changed files mismatch: expected ${expected.join(",")}, actual ${changed.join(",")}`); }
		c.trial = { mode: "main_worktree", created_at: Date.now(), applied_diff_sha256: candidateDiffIdentityHash(cwd) };
		writeCandidate(cwd, c);
		return updateCandidateStatus(cwd, candidateId, "trial_applied");
	} catch (e) {
		const latest = readCandidate(cwd, candidateId);
		if (latest.status === "leased") updateCandidateStatus(cwd, candidateId, "paused_dirty", { reason: e instanceof Error ? e.message : String(e) }, { code: "apply_candidate_failed", message: e instanceof Error ? e.message : String(e) });
		throw e;
	}
}

export function candidateWorktreePath(cwd: string, candidateId: string): string { return path.join(cwd, ".pi", "autoresearch-worktrees", candidateId); }
export function createCandidateWorktree(cwd: string, c: AutoresearchCandidateV1): string {
	const wt = candidateWorktreePath(cwd, c.candidate_id);
	fs.mkdirSync(path.dirname(wt), { recursive: true });
	if (!fs.existsSync(wt)) execFileSync("git", ["worktree", "add", wt, c.base_git_commit], { cwd, stdio: ["ignore", "pipe", "pipe"] });
	return wt;
}
export function removeCandidateWorktree(cwd: string, c: AutoresearchCandidateV1): void {
	const wt = c.trial?.worktree_path ?? candidateWorktreePath(cwd, c.candidate_id);
	try { execFileSync("git", ["worktree", "remove", "--force", wt], { cwd, stdio: ["ignore", "pipe", "pipe"] }); } catch { if (fs.existsSync(wt)) fs.rmSync(wt, { recursive: true, force: true }); }
	c.trial = { ...(c.trial ?? { mode: "isolated_worktree" as const }), removed_at: Date.now() };
	writeCandidate(cwd, c);
}
export function applyCandidateIsolated(cwd: string, contract: AutoresearchContractV1, lock: LockFile, candidateId: string): AutoresearchCandidateV1 {
	let c = readCandidate(cwd, candidateId);
	if (c.status !== "pending") throw new Error(`candidate status must be pending: ${c.status}`);
	c = updateCandidateStatus(cwd, candidateId, "leased");
	try {
		if (c.contract_hash !== lock.contractHash || computeContractHash(contract) !== c.contract_hash) { updateCandidateStatus(cwd, candidateId, "rejected_policy"); throw new Error("candidate contract hash mismatch"); }
		if (fullHead(cwd) !== c.base_git_commit) { updateCandidateStatus(cwd, candidateId, "stale_base"); throw new Error("candidate base git commit is stale"); }
		const dirty = candidateChangedFiles(cwd); if (dirty.length) { updateCandidateStatus(cwd, candidateId, "paused_dirty"); throw new Error(`working tree is dirty: ${dirty.join(", ")}`); }
		const wt = createCandidateWorktree(cwd, c);
		c.trial = { mode: "isolated_worktree", worktree_path: wt, created_at: Date.now() };
		writeCandidate(cwd, c);
		const patchPath = candidatePatchPath(cwd, candidateId);
		execFileSync("git", ["apply", "--check", patchPath], { cwd: wt, stdio: ["ignore", "pipe", "pipe"] });
		execFileSync("git", ["apply", patchPath], { cwd: wt, stdio: ["ignore", "pipe", "pipe"] });
		const changed = candidateChangedFiles(wt); const expected = [...c.touched_paths].sort();
		const scope = validateTouchedAgainstContract(changed, contract);
		if (JSON.stringify(changed) !== JSON.stringify(expected) || !scope.ok) { updateCandidateStatus(cwd, candidateId, "paused_dirty"); throw new Error(`isolated changed files mismatch: expected ${expected.join(",")}, actual ${changed.join(",")}`); }
		c.trial = { mode: "isolated_worktree", worktree_path: wt, created_at: Date.now(), applied_diff_sha256: candidateDiffIdentityHash(wt) };
		writeCandidate(cwd, c);
		return updateCandidateStatus(cwd, candidateId, "trial_applied");
	} catch (e) {
		const latest = readCandidate(cwd, candidateId);
		if (latest.status === "leased") updateCandidateStatus(cwd, candidateId, "paused_dirty", { reason: e instanceof Error ? e.message : String(e) }, { code: "apply_candidate_isolated_failed", message: e instanceof Error ? e.message : String(e), worktree_path: latest.trial?.worktree_path });
		throw e;
	}
}
export function replayCandidateToMain(cwd: string, contract: AutoresearchContractV1, candidateId: string): AutoresearchCandidateV1 {
	const c = readCandidate(cwd, candidateId);
	if (fullHead(cwd) !== c.base_git_commit) { updateCandidateStatus(cwd, candidateId, "stale_base"); throw new Error("candidate base git commit is stale"); }
	const dirty = candidateChangedFiles(cwd); if (dirty.length) { updateCandidateStatus(cwd, candidateId, "paused_dirty"); throw new Error(`main working tree is dirty: ${dirty.join(", ")}`); }
	const patchPath = candidatePatchPath(cwd, candidateId);
	if (sha256Text(fs.readFileSync(patchPath, "utf8")) !== c.patch_sha256) { updateCandidateStatus(cwd, candidateId, "paused_dirty"); throw new Error("candidate patch hash mismatch before replay"); }
	execFileSync("git", ["apply", "--check", patchPath], { cwd, stdio: ["ignore", "pipe", "pipe"] });
	execFileSync("git", ["apply", patchPath], { cwd, stdio: ["ignore", "pipe", "pipe"] });
	const changed = candidateChangedFiles(cwd); const expected = [...c.touched_paths].sort(); const scope = validateTouchedAgainstContract(changed, contract);
	if (JSON.stringify(changed) !== JSON.stringify(expected) || !scope.ok) { updateCandidateStatus(cwd, candidateId, "paused_dirty"); throw new Error("replayed changed files mismatch"); }
	const replayedDiff = candidateDiffIdentityHash(cwd);
	if (c.trial?.applied_diff_sha256 && replayedDiff !== c.trial.applied_diff_sha256) { updateCandidateStatus(cwd, candidateId, "paused_dirty"); throw new Error("replayed diff identity mismatch"); }
	c.materialization = { ...(c.materialization ?? {}), replayed_to_main: true };
	writeCandidate(cwd, c);
	return readCandidate(cwd, candidateId);
}

export function candidateEvaluationCwd(cwd: string, c: AutoresearchCandidateV1): string {
	return c.trial?.mode === "isolated_worktree" && c.trial.worktree_path ? c.trial.worktree_path : cwd;
}
export function assertCandidateReadyForRun(cwd: string, contract: AutoresearchContractV1, lock: LockFile, candidateId: string): AutoresearchCandidateV1 {
	const c = readCandidate(cwd, candidateId);
	if (c.status !== "trial_applied" && c.status !== "evaluating") throw new Error(`candidate status must be trial_applied: ${c.status}`);
	if (c.contract_hash !== lock.contractHash || computeContractHash(contract) !== c.contract_hash) throw new Error("candidate contract hash mismatch");
	if (sha256Text(fs.readFileSync(candidatePatchPath(cwd, candidateId), "utf8")) !== c.patch_sha256) throw new Error("candidate patch hash mismatch");
	const evalCwd = candidateEvaluationCwd(cwd, c);
	const changed = candidateChangedFiles(evalCwd);
	const expected = [...c.touched_paths].sort();
	if (JSON.stringify(changed) !== JSON.stringify(expected)) throw new Error(`candidate changed files mismatch: expected ${expected.join(",")}, actual ${changed.join(",")}`);
	if (c.trial?.applied_diff_sha256 && candidateDiffIdentityHash(evalCwd) !== c.trial.applied_diff_sha256) throw new Error("candidate applied diff identity mismatch");
	return c;
}
