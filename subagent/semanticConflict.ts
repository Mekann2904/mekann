import type { PatchProposalResult, RejectReason, SemanticApplyLogEntry } from "./types.js";
import { isBreakingOrUnknown, keyOfTarget } from "./semantic.js";

export type SemanticConflictDecision =
  | { action: "allow" }
  | { action: "warn"; reason: string }
  | { action: "reject"; reason: RejectReason; details?: unknown }
  | { action: "require_review"; reason: string; details?: unknown }
  | { action: "require_regeneration"; reason: string; invalidated_by: string[] };

export function evaluateSemanticConflict(incoming: PatchProposalResult, appliedLog: SemanticApplyLogEntry[]): SemanticConflictDecision {
  const incomingReads = new Set(incoming.semantic.reads.map(keyOfTarget));
  const incomingWrites = new Set(incoming.semantic.writes.map(keyOfTarget));
  for (const entry of appliedLog) {
    for (const written of entry.writes) {
      const key = keyOfTarget(written);
      if (incomingReads.has(key)) return { action: "require_regeneration", reason: `Incoming proposal read semantic target modified by an already applied patch: ${key}`, invalidated_by: [entry.result_id] };
      if (incomingWrites.has(key)) return { action: "require_review", reason: `Both proposals write the same semantic target: ${key}` };
    }
    for (const delta of entry.public_surface_delta) {
      if (isBreakingOrUnknown(delta) && [...incomingReads].some((r) => r.includes(delta.name))) return { action: "require_regeneration", reason: `Incoming proposal depends on changed public surface: ${delta.name}`, invalidated_by: [entry.result_id] };
    }
  }
  if (incoming.semantic.risk.level === "high") return { action: "require_review", reason: "High semantic risk requires review." };
  if (incoming.semantic.public_surface_delta.some(isBreakingOrUnknown)) return { action: "require_review", reason: "Breaking or unknown public surface delta requires review." };
  return { action: "allow" };
}
