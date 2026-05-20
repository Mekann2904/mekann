import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import type { AgentMetadata, ApplyRecord, RejectReason, ResultFilter, SemanticApplyLogEntry, StoredResultStatus, StoredSubagentResult, SubagentResultV1 } from "./types.js";
import { tryParseSubagentResult } from "./resultSchema.js";

let counter = 0;
function nextId(): string { return `sar_${Date.now().toString(36)}_${++counter}`; }

export function assertValidResultId(id: string): void {
  if (!/^sar_[a-z0-9]+_[0-9]+$/i.test(id)) throw new Error(`Invalid result_id: ${id}`);
}

const VALID_STATUSES = new Set<StoredResultStatus>(["pending", "applying", "applied", "rejected", "needs_review", "superseded"]);

function isUnderDir(file: string, dir: string): boolean { const rel = path.relative(path.resolve(dir), path.resolve(file)); return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel); }

export function resultSummary(stored: StoredSubagentResult): string {
  const r: any = stored.result;
  return JSON.stringify({ kind: "subagent_result_available", result_id: stored.result_id, agent_path: stored.agent_path, outcome: r.outcome, summary: r.summary ?? r.reason ?? r.question ?? "", touched_paths: r.scope?.touched_paths ?? [], semantic_risk: r.semantic?.risk?.level });
}

export class SubagentResultStore {
  readonly dir: string;
  constructor(baseDir = process.cwd()) { this.dir = baseDir.endsWith("subagent-results") ? baseDir : path.join(baseDir, ".pi", "subagent-results"); mkdirSync(this.dir, { recursive: true }); }
  private jsonPath(id: string): string { assertValidResultId(id); return path.join(this.dir, `${id}.json`); }
  private patchPath(id: string): string { assertValidResultId(id); return path.join(this.dir, `${id}.patch`); }
  save(agent: AgentMetadata, result: SubagentResultV1): StoredSubagentResult {
    const id = nextId();
    const canonical = structuredClone(result) as SubagentResultV1;
    if (canonical.outcome === "patch") {
      const body = canonical.patch.body;
      if (body !== undefined) {
        writeFileSync(this.patchPath(id), body, "utf8");
        delete canonical.patch.body;
        canonical.patch.ref = this.patchPath(id);
        canonical.patch.bytes = Buffer.byteLength(body, "utf8");
      }
    }
    const stored: StoredSubagentResult = { result_id: id, agent_id: agent.agentId, agent_path: agent.agentPath, created_at: Date.now(), status: "pending", result: canonical, authority: agent.authority, authority_enforced: agent.authorityEnforced, workspace_cwd: agent.workspaceCwd };
    writeFileSync(this.jsonPath(id), JSON.stringify(stored, null, 2), "utf8");
    return stored;
  }
  private validateStored(raw: unknown, expectedId?: string): StoredSubagentResult {
    if (!raw || typeof raw !== "object") throw new Error("Invalid stored result: not an object");
    const s = raw as StoredSubagentResult;
    assertValidResultId(s.result_id);
    if (expectedId && s.result_id !== expectedId) throw new Error(`Stored result id mismatch: ${expectedId} != ${s.result_id}`);
    if (!VALID_STATUSES.has(s.status)) throw new Error(`Invalid stored result status: ${String(s.status)}`);
    if (typeof s.created_at !== "number" || typeof s.agent_id !== "string" || typeof s.agent_path !== "string") throw new Error("Invalid stored result metadata");
    const resultForSchema = structuredClone(s.result) as any;
    if (resultForSchema?.outcome === "patch") {
      if (typeof resultForSchema.patch?.ref !== "string" || !isUnderDir(resultForSchema.patch.ref, this.dir)) throw new Error("Invalid stored patch ref");
      delete resultForSchema.patch.ref;
      resultForSchema.patch.body = "diff --git a/placeholder b/placeholder\n";
    }
    const parsed = tryParseSubagentResult(JSON.stringify(resultForSchema));
    if (!parsed.ok) throw new Error(`Invalid stored result schema: ${parsed.error}`);
    return s;
  }
  load(resultId: string): StoredSubagentResult { return this.validateStored(JSON.parse(readFileSync(this.jsonPath(resultId), "utf8")), resultId); }
  list(filter: ResultFilter = {}): StoredSubagentResult[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir).filter((f) => /^sar_.*\.json$/.test(f)).flatMap((f) => {
      const id = f.slice(0, -5);
      try { return [this.validateStored(JSON.parse(readFileSync(path.join(this.dir, f), "utf8")), id)]; } catch { return []; }
    }).filter((s) => (!filter.status || s.status === filter.status) && (!filter.outcome || s.result.outcome === filter.outcome) && (!filter.agent_path || s.agent_path === filter.agent_path)).sort((a,b)=>a.created_at-b.created_at);
  }
  private saveStored(stored: StoredSubagentResult): void { writeFileSync(this.jsonPath(stored.result_id), JSON.stringify(this.validateStored(stored, stored.result_id), null, 2), "utf8"); }
  markApplying(resultId: string): void { const s = this.load(resultId); s.status = "applying"; s.applying_at = Date.now(); this.saveStored(s); }
  markApplied(resultId: string, applyRecord: ApplyRecord): void { const s = this.load(resultId); s.status = "applied"; s.apply_record = applyRecord; delete s.applying_at; delete s.reject_reason; delete s.reject_details; delete s.review_record; delete s.superseded_reason; this.saveStored(s); }
  markRejected(resultId: string, reason: RejectReason, details?: unknown): void { const s = this.load(resultId); s.status = "rejected"; s.reject_reason = reason; s.reject_details = details; delete s.applying_at; delete s.apply_record; delete s.review_record; delete s.superseded_reason; this.saveStored(s); }
  markNeedsReview(resultId: string, reason: string, details?: unknown): void { const s = this.load(resultId); s.status = "needs_review"; s.review_record = { result_id: resultId, reason, details }; delete s.applying_at; delete s.apply_record; delete s.reject_reason; delete s.reject_details; delete s.superseded_reason; this.saveStored(s); }
  recoverStaleApplying(maxAgeMs = 10 * 60 * 1000): number { let count = 0; for (const s of this.list({ status: "applying" })) { if ((s.applying_at ?? s.created_at) + maxAgeMs < Date.now()) { this.markNeedsReview(s.result_id, "stale_applying", { applying_at: s.applying_at }); count++; } } return count; }
  markSuperseded(resultId: string, reason?: string): void { const s = this.load(resultId); s.status = "superseded"; s.superseded_reason = reason; delete s.applying_at; delete s.apply_record; delete s.reject_reason; delete s.reject_details; delete s.review_record; this.saveStored(s); }
  appendSemanticLog(entry: SemanticApplyLogEntry): void { appendFileSync(path.join(this.dir, "semantic-log.jsonl"), `${JSON.stringify(entry)}\n`, "utf8"); }
  readSemanticLog(): SemanticApplyLogEntry[] { const p = path.join(this.dir, "semantic-log.jsonl"); if (!existsSync(p)) return []; return readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean).flatMap((l) => { try { return [JSON.parse(l) as SemanticApplyLogEntry]; } catch { return []; } }); }
}
