import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, unlinkSync, renameSync, statSync, openSync, closeSync } from "node:fs";
import * as fsp from "node:fs/promises";
import path from "node:path";
import type { AgentMetadata, ApplyRecord, EscrowRecord, RejectReason, ResultFilter, SemanticApplyLogEntry, StoredResultStatus, StoredSubagentResult, SubagentResultV1 } from "./types.js";
import { tryParseSubagentResult } from "./resultSchema.js";
import { isPatchRefUnderDir } from "./pathSafety.js";

let counter = 0;
function nextId(): string { return `sar_${Date.now().toString(36)}_${++counter}`; }

export function assertValidResultId(id: string): void {
  if (!/^sar_[a-z0-9]+_[0-9]+$/i.test(id)) throw new Error(`Invalid result_id: ${id}`);
}

const VALID_STATUSES = new Set<StoredResultStatus>(["pending", "escrowed", "applying", "applied", "rejected", "needs_review", "superseded"]);

/**
 * How long an apply lock file is considered owned before a later process may
 * steal it. The lock guards only the brief pending→applying read-modify-write
 * (milliseconds), so a lock older than this almost certainly belongs to a
 * crashed process and is safe to take over (issue #152 / IC-163).
 */
const APPLY_LOCK_STALE_MS = 60_000;

export function resultSummary(stored: StoredSubagentResult): string {
  const r: any = stored.result;
  return JSON.stringify({ kind: "subagent_result_available", result_id: stored.result_id, agent_path: stored.agent_path, outcome: r.outcome, summary: r.summary ?? r.reason ?? r.question ?? "", touched_paths: r.scope?.touched_paths ?? [], semantic_risk: r.semantic?.risk?.level });
}

/**
 * Resolved patch payload used by the pure validator. Decoupling the IO
 * (sync for `load`, async for `list`) from the validation logic keeps a
 * single source of truth for stored-result validation while letting each
 * entry point pick a blocking-free read strategy (issue #142).
 */
type GatheredPatch =
  | { kind: "not-patch" }     // outcome is not "patch"
  | { kind: "invalid-ref" }   // ref missing / not a string / outside the store dir
  | { kind: "missing" }       // ref valid but the patch file does not exist
  | { kind: "ok"; size: number; body: string };

export class SubagentResultStore {
  readonly dir: string;
  /**
   * In-memory cache of validated stored results keyed by result id.
   *
   * `load()` is on the apply / show hot path and used to re-read the same
   * JSON (and re-read its patch body just to validate the schema) on every
   * call. Caching the validated record and invalidating on every write removes
   * the repeated synchronous disk reads without changing the sync API
   * (issue #142). Coherence is intra-process: all mutations flow through this
   * store instance and call {@link invalidate}.
   */
  private readonly entryCache = new Map<string, StoredSubagentResult>();
  /**
   * Cached full (unfiltered) result list. `list()` is async and only re-scans
   * the directory on a cache miss; every write drops it via {@link invalidate}.
   */
  private listCache: StoredSubagentResult[] | null = null;
  /**
   * O(1) sync answer to "are there pending results?" for the tool-surface
   * projection. Maintained on every mutation and reconciled with disk by
   * {@link scanAll}, so it stays coherent without blocking the event loop
   * (issue #142).
   */
  private readonly pendingIds = new Set<string>();

  constructor(baseDir = process.cwd()) { this.dir = baseDir.endsWith("subagent-results") ? baseDir : path.join(baseDir, ".pi", "subagent-results"); mkdirSync(this.dir, { recursive: true }); }
  private jsonPath(id: string): string { assertValidResultId(id); return path.join(this.dir, `${id}.json`); }
  private patchPath(id: string): string { assertValidResultId(id); return path.join(this.dir, `${id}.patch`); }

  /** Drop a cached entry (or the whole cache) and force `list()` to re-scan. */
  private invalidate(resultId?: string): void {
    if (resultId !== undefined) this.entryCache.delete(resultId);
    else this.entryCache.clear();
    this.listCache = null;
  }

  save(agent: AgentMetadata, result: SubagentResultV1): StoredSubagentResult {
    const id = nextId();
    const canonical = structuredClone(result) as SubagentResultV1;
    if (canonical.outcome === "patch") {
      const body = canonical.patch.body;
      if (body !== undefined) {
        const patchPath = this.patchPath(id);
        const tmpPatchPath = `${patchPath}.tmp`;
        writeFileSync(tmpPatchPath, body, "utf8");
        renameSync(tmpPatchPath, patchPath);
        delete canonical.patch.body;
        canonical.patch.ref = patchPath;
        canonical.patch.bytes = Buffer.byteLength(body, "utf8");
      }
    }
    const stored: StoredSubagentResult = { result_id: id, agent_id: agent.agentId, agent_path: agent.agentPath, created_at: Date.now(), status: "pending", result: canonical, authority: agent.authority, authority_enforced: agent.authorityEnforced, workspace_cwd: agent.workspaceCwd };
    const jsonPath = this.jsonPath(id);
    const tmpJsonPath = `${jsonPath}.tmp`;
    writeFileSync(tmpJsonPath, JSON.stringify(stored, null, 2), "utf8");
    renameSync(tmpJsonPath, jsonPath);
    this.invalidate(id);
    this.pendingIds.add(id); // save() always stores status "pending"
    return stored;
  }

  // ─── Patch IO (sync + async variants) ────────────────────────────

  /** Pure: classify the patch ref from a result object, without touching disk. */
  private patchRefFromResult(result: any): { kind: "not-patch" } | { kind: "invalid-ref" } | { kind: "read"; ref: string } {
    if (result?.outcome !== "patch") return { kind: "not-patch" };
    const ref = result.patch?.ref;
    if (typeof ref !== "string" || !isPatchRefUnderDir(ref, this.dir)) return { kind: "invalid-ref" };
    return { kind: "read", ref };
  }

  private resolvePatchSync(result: any): GatheredPatch {
    const r = this.patchRefFromResult(result);
    if (r.kind !== "read") return r;
    if (!existsSync(r.ref)) return { kind: "missing" };
    const size = statSync(r.ref).size;
    return { kind: "ok", size, body: readFileSync(r.ref, "utf8") };
  }

  private async resolvePatchAsync(result: any): Promise<GatheredPatch> {
    const r = this.patchRefFromResult(result);
    if (r.kind !== "read") return r;
    try {
      const st = await fsp.stat(r.ref);
      return { kind: "ok", size: st.size, body: await fsp.readFile(r.ref, "utf8") };
    } catch (error: any) {
      if (error?.code === "ENOENT") return { kind: "missing" };
      throw error;
    }
  }

  /** Pure validator over already-parsed raw + pre-resolved patch payload. */
  private validateStoredResult(raw: unknown, expectedId: string | undefined, patch: GatheredPatch): StoredSubagentResult {
    if (!raw || typeof raw !== "object") throw new Error("Invalid stored result: not an object");
    const s = raw as StoredSubagentResult;
    assertValidResultId(s.result_id);
    if (expectedId && s.result_id !== expectedId) throw new Error(`Stored result id mismatch: ${expectedId} != ${s.result_id}`);
    if (!VALID_STATUSES.has(s.status)) throw new Error(`Invalid stored result status: ${String(s.status)}`);
    if (typeof s.created_at !== "number" || typeof s.agent_id !== "string" || typeof s.agent_path !== "string") throw new Error("Invalid stored result metadata");
    const resultForSchema = structuredClone(s.result) as any;
    if (resultForSchema?.outcome === "patch") {
      // patch must be "ok" for a patch outcome; anything else is a corruption
      // signal mapped to the same error messages the legacy validator emitted.
      if (patch.kind === "invalid-ref") throw new Error("Invalid stored patch ref");
      if (patch.kind === "missing") throw new Error("Stored patch ref is missing");
      if (patch.kind === "not-patch") throw new Error("Invalid stored patch ref");
      if (typeof resultForSchema.patch?.bytes === "number" && resultForSchema.patch.bytes !== patch.size) throw new Error("Stored patch byte size mismatch");
      delete resultForSchema.patch.ref;
      resultForSchema.patch.body = patch.body;
    }
    const parsed = tryParseSubagentResult(JSON.stringify(resultForSchema));
    if (!parsed.ok) throw new Error(`Invalid stored result schema: ${parsed.error}`);
    return s;
  }

  load(resultId: string): StoredSubagentResult {
    const cached = this.entryCache.get(resultId);
    // Return a defensive copy: callers mutate the returned object (e.g.
    // ApplyQueue.showAgentResult attaches `patch_body`, mark* methods rewrite
    // status). The cached entry is the canonical snapshot and must stay clean
    // so the mutation never leaks into the cache or the next persisted write.
    if (cached) return structuredClone(cached);
    const raw = JSON.parse(readFileSync(this.jsonPath(resultId), "utf8"));
    const stored = this.validateStoredResult(raw, resultId, this.resolvePatchSync((raw as any).result));
    this.entryCache.set(resultId, stored);
    return structuredClone(stored);
  }

  async list(filter: ResultFilter = {}): Promise<StoredSubagentResult[]> {
    const entries = this.listCache ?? await this.scanAll();
    return this.applyFilter(entries, filter);
  }

  /** Async full-directory scan; populates both {@link entryCache} and {@link listCache}. */
  private async scanAll(): Promise<StoredSubagentResult[]> {
    let names: string[];
    try {
      names = await fsp.readdir(this.dir);
    } catch (error: any) {
      if (error?.code === "ENOENT") return (this.listCache = []);
      throw error;
    }
    const entries: StoredSubagentResult[] = [];
    for (const name of names) {
      if (!/^sar_.*\.json$/.test(name)) continue;
      const id = name.slice(0, -5);
      const cached = this.entryCache.get(id);
      if (cached) { entries.push(cached); continue; }
      try {
        const raw = JSON.parse(await fsp.readFile(path.join(this.dir, name), "utf8"));
        const stored = this.validateStoredResult(raw, id, await this.resolvePatchAsync((raw as any).result));
        this.entryCache.set(id, stored);
        entries.push(stored);
      } catch { /* skip corrupt/unreadable entries */ }
    }
    entries.sort((a, b) => a.created_at - b.created_at);
    this.listCache = entries;
    // Reconcile the pending-id index with authoritative disk state so a fresh
    // store (or external edits) converge after the first scan.
    this.pendingIds.clear();
    for (const e of entries) if (e.status === "pending") this.pendingIds.add(e.result_id);
    return entries;
  }

  private applyFilter(entries: StoredSubagentResult[], filter: ResultFilter): StoredSubagentResult[] {
    return entries.filter((s) => (!filter.status || s.status === filter.status) && (!filter.outcome || s.result.outcome === filter.outcome) && (!filter.agent_path || s.agent_path === filter.agent_path));
  }

  private saveStored(stored: StoredSubagentResult): void {
    const jsonPath = this.jsonPath(stored.result_id);
    const tmpJsonPath = `${jsonPath}.tmp`;
    writeFileSync(tmpJsonPath, JSON.stringify(this.validateStoredResult(stored, stored.result_id, this.resolvePatchSync(stored.result)), null, 2), "utf8");
    renameSync(tmpJsonPath, jsonPath);
    this.invalidate(stored.result_id);
    if (stored.status === "pending") this.pendingIds.add(stored.result_id);
    else this.pendingIds.delete(stored.result_id);
  }

  /** O(1) sync check used by tool-surface projection (no disk IO). */
  hasPendingResults(): boolean { return this.pendingIds.size > 0; }

  /**
   * Atomic test-and-set for the pending→applying transition across parallel
   * pi processes. Holds a brief O_EXCL lock file around the
   * load-check-save so two processes loading the same "pending" result cannot
   * both flip it to applying and apply the patch twice. Returns true when this
   * caller won the transition; false means the result was no longer in an
   * eligible status (another process owns it) and must be skipped
   * (issue #152 / IC-163).
   */
  tryMarkApplying(resultId: string, eligibleStatuses: ReadonlySet<StoredResultStatus> = new Set<StoredResultStatus>(["pending"])): boolean {
    if (!this.acquireApplyLock(resultId)) return false;
    try {
      const s = this.load(resultId);
      if (!eligibleStatuses.has(s.status)) return false;
      s.status = "applying";
      s.applying_at = Date.now();
      this.saveStored(s);
      return true;
    } finally {
      this.releaseApplyLock(resultId);
    }
  }

  /** Compatibility wrapper: unconditional pending-or-not transition. Prefer
   * {@link tryMarkApplying} from apply paths. */
  markApplying(resultId: string): void { const s = this.load(resultId); s.status = "applying"; s.applying_at = Date.now(); this.saveStored(s); }
  markApplied(resultId: string, applyRecord: ApplyRecord): void { const s = this.load(resultId); s.status = "applied"; s.apply_record = applyRecord; delete s.applying_at; delete s.escrow_record; delete s.reject_reason; delete s.reject_details; delete s.review_record; delete s.superseded_reason; this.saveStored(s); }
  markEscrowed(resultId: string, escrowRecord: EscrowRecord): void { const s = this.load(resultId); s.status = "escrowed"; s.escrow_record = escrowRecord; delete s.applying_at; delete s.apply_record; delete s.reject_reason; delete s.reject_details; delete s.review_record; delete s.superseded_reason; this.saveStored(s); }
  markRejected(resultId: string, reason: RejectReason, details?: unknown): void { const s = this.load(resultId); s.status = "rejected"; s.reject_reason = reason; s.reject_details = details; delete s.applying_at; delete s.apply_record; delete s.review_record; delete s.superseded_reason; this.saveStored(s); }
  markNeedsReview(resultId: string, reason: string, details?: unknown): void { const s = this.load(resultId); s.status = "needs_review"; s.review_record = { result_id: resultId, reason, details }; delete s.applying_at; delete s.apply_record; delete s.reject_reason; delete s.reject_details; delete s.superseded_reason; this.saveStored(s); }
  async recoverStaleApplying(maxAgeMs = 10 * 60 * 1000): Promise<number> { let count = 0; for (const s of await this.list({ status: "applying" })) { if ((s.applying_at ?? s.created_at) + maxAgeMs < Date.now()) { this.markNeedsReview(s.result_id, "stale_applying", { applying_at: s.applying_at }); count++; } } return count; }
  markSuperseded(resultId: string, reason?: string): void { const s = this.load(resultId); s.status = "superseded"; s.superseded_reason = reason; delete s.applying_at; delete s.apply_record; delete s.reject_reason; delete s.reject_details; delete s.review_record; this.saveStored(s); }

  /**
   * Prune old results that have reached a terminal state beyond the given TTL.
   * Returns the number of pruned results.
   * Terminal states: applied, rejected, superseded, needs_review.
   */
  async pruneStaleResults(maxAgeMs = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    const cutoff = Date.now() - maxAgeMs;
    let pruned = 0;
    const terminalStatuses = new Set<StoredResultStatus>(["applied", "rejected", "superseded", "needs_review"]);
    for (const s of await this.list()) {
      if (terminalStatuses.has(s.status) && s.created_at < cutoff) {
        try {
          const jsonPath = this.jsonPath(s.result_id);
          const patchPath = this.patchPath(s.result_id);
          if (existsSync(jsonPath)) { unlinkSync(jsonPath); }
          if (existsSync(patchPath)) { unlinkSync(patchPath); }
          this.invalidate(s.result_id);
          this.pendingIds.delete(s.result_id);
          pruned++;
        } catch {
          // best-effort; skip on error
        }
      }
    }
    return pruned;
  }

  /** Prune results that have been in "pending" status for too long (stale orphans). */
  async pruneOrphanedPending(maxAgeMs = 24 * 60 * 60 * 1000): Promise<number> {
    const cutoff = Date.now() - maxAgeMs;
    let pruned = 0;
    for (const s of await this.list({ status: "pending" })) {
      if (s.created_at < cutoff) {
        this.markSuperseded(s.result_id, "orphaned_pending");
        pruned++;
      }
    }
    return pruned;
  }

  /**
   * Link a retry: update original result with superseded_by,
   * and return the retry_count for the chain.
   */
  linkRetry(originalId: string, retryId: string): number {
    const original = this.load(originalId);
    const retryCount = (original.retry_count ?? 0) + 1;
    // Update original to point to retry
    const updated = this.load(originalId);
    updated.superseded_by = retryId;
    updated.status = "superseded";
    updated.superseded_reason = "retry";
    this.saveStored(updated);
    // Stamp retry chain on the new result
    const retry = this.load(retryId);
    retry.retry_count = retryCount;
    retry.retry_of = original.retry_of ?? originalId;
    this.saveStored(retry);
    return retryCount;
  }

  /** Get the retry count for a result chain (follows retry_of links). */
  getRetryCount(resultId: string): number {
    try {
      const stored = this.load(resultId);
      return stored.retry_count ?? 0;
    } catch {
      return 0;
    }
  }
  appendSemanticLog(entry: SemanticApplyLogEntry): void { appendFileSync(path.join(this.dir, "semantic-log.jsonl"), `${JSON.stringify(entry)}\n`, "utf8"); }
  readSemanticLog(): SemanticApplyLogEntry[] { const p = path.join(this.dir, "semantic-log.jsonl"); if (!existsSync(p)) return []; return readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean).flatMap((l) => { try { return [JSON.parse(l) as SemanticApplyLogEntry]; } catch { return []; } }); }

  // ─── Apply serialization lock (issue #152 / IC-163) ────────────────

  private applyLockPath(resultId: string): string { return path.join(this.dir, `${resultId}.apply.lock`); }

  /** Acquire the per-result apply lock via O_EXCL, stealing stale locks. */
  private acquireApplyLock(resultId: string): boolean {
    const lockPath = this.applyLockPath(resultId);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const fd = openSync(lockPath, "wx");
        closeSync(fd);
        writeFileSync(lockPath, JSON.stringify({ pid: process.pid, startedAt: Date.now() }), "utf8");
        return true;
      } catch (e: any) {
        if (e?.code !== "EEXIST") throw e;
      }
      // Exists: steal it only if it is stale.
      try {
        const st = statSync(lockPath);
        if (Date.now() - st.mtimeMs > APPLY_LOCK_STALE_MS) { unlinkSync(lockPath); continue; }
      } catch {
        /* ignore stat errors; treat as held */
      }
      return false;
    }
    return false;
  }

  private releaseApplyLock(resultId: string): void {
    try { unlinkSync(this.applyLockPath(resultId)); } catch { /* already gone */ }
  }
}
