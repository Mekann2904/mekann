import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import type { AgentMetadata, ApplyRecord, RejectReason, ResultFilter, SemanticApplyLogEntry, StoredSubagentResult, SubagentResultV1 } from "./types.js";

let counter = 0;
function nextId(): string { return `sar_${Date.now().toString(36)}_${++counter}`; }

export function resultSummary(stored: StoredSubagentResult): string {
  const r: any = stored.result;
  return JSON.stringify({ kind: "subagent_result_available", result_id: stored.result_id, agent_path: stored.agent_path, outcome: r.outcome, summary: r.summary ?? r.reason ?? r.question ?? "", touched_paths: r.scope?.touched_paths ?? [], semantic_risk: r.semantic?.risk?.level });
}

export class SubagentResultStore {
  readonly dir: string;
  constructor(baseDir = process.cwd()) { this.dir = baseDir.endsWith("subagent-results") ? baseDir : path.join(baseDir, ".pi", "subagent-results"); mkdirSync(this.dir, { recursive: true }); }
  private jsonPath(id: string): string { return path.join(this.dir, `${id}.json`); }
  private patchPath(id: string): string { return path.join(this.dir, `${id}.patch`); }
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
    const stored: StoredSubagentResult = { result_id: id, agent_id: agent.agentId, agent_path: agent.agentPath, created_at: Date.now(), status: "pending", result: canonical };
    writeFileSync(this.jsonPath(id), JSON.stringify(stored, null, 2), "utf8");
    return stored;
  }
  load(resultId: string): StoredSubagentResult { return JSON.parse(readFileSync(this.jsonPath(resultId), "utf8")) as StoredSubagentResult; }
  list(filter: ResultFilter = {}): StoredSubagentResult[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir).filter((f) => /^sar_.*\.json$/.test(f)).map((f) => JSON.parse(readFileSync(path.join(this.dir, f), "utf8")) as StoredSubagentResult).filter((s) => (!filter.status || s.status === filter.status) && (!filter.outcome || s.result.outcome === filter.outcome) && (!filter.agent_path || s.agent_path === filter.agent_path)).sort((a,b)=>a.created_at-b.created_at);
  }
  private saveStored(stored: StoredSubagentResult): void { writeFileSync(this.jsonPath(stored.result_id), JSON.stringify(stored, null, 2), "utf8"); }
  markApplied(resultId: string, applyRecord: ApplyRecord): void { const s = this.load(resultId); s.status = "applied"; s.apply_record = applyRecord; this.saveStored(s); }
  markRejected(resultId: string, reason: RejectReason): void { const s = this.load(resultId); s.status = "rejected"; s.reject_reason = reason; this.saveStored(s); }
  markNeedsReview(resultId: string, reason: string, details?: unknown): void { const s = this.load(resultId); s.status = "needs_review"; s.review_record = { result_id: resultId, reason, details }; this.saveStored(s); }
  appendSemanticLog(entry: SemanticApplyLogEntry): void { appendFileSync(path.join(this.dir, "semantic-log.jsonl"), `${JSON.stringify(entry)}\n`, "utf8"); }
  readSemanticLog(): SemanticApplyLogEntry[] { const p = path.join(this.dir, "semantic-log.jsonl"); if (!existsSync(p)) return []; return readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l) as SemanticApplyLogEntry); }
}
