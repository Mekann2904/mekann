import { createHash } from "node:crypto";
import path from "node:path";
import { safeRepoRelativePath } from "./fingerprint.js";
import { evaluatePatchProposalForApply, evaluatePatchProposalForCandidate, firstFinding, type PatchProposalFinding } from "./patchProposalPolicy.js";
import type { PatchProposalResult, RejectReason, SubagentAuthority } from "./types.js";

export type PatchProposalIntakeProfile = "candidate_escrow" | "subagent_apply";

export type PatchProposalIntakeDecision =
  | { kind: "allow"; profile: PatchProposalIntakeProfile; patchText: string; patchSha256: string; touchedPaths: string[]; canonicalWriteScope: string[]; findings: PatchProposalFinding[]; audit: PatchProposalIntakeAudit }
  | { kind: "review"; profile: PatchProposalIntakeProfile; reason: string; details?: unknown; patchText?: string; touchedPaths?: string[]; canonicalWriteScope: string[]; findings: PatchProposalFinding[]; audit: PatchProposalIntakeAudit }
  | { kind: "reject"; profile: PatchProposalIntakeProfile; reason: string; details?: unknown; patchText?: string; touchedPaths?: string[]; canonicalWriteScope: string[]; findings: PatchProposalFinding[]; audit: PatchProposalIntakeAudit };

export interface PatchProposalIntakeAudit {
  profile: PatchProposalIntakeProfile;
  firstFinding?: PatchProposalFinding;
  findings: PatchProposalFinding[];
}

export interface PatchProposalIntakeInput {
  cwd: string;
  proposal: PatchProposalResult;
  authority?: SubagentAuthority;
  authorityEnforced?: boolean;
  patchRefRootDir: string;
  profile: PatchProposalIntakeProfile;
  writeScopeMatcher?: (file: string, writeScope: string[]) => boolean;
}

export function admitPatchProposal(input: PatchProposalIntakeInput): PatchProposalIntakeDecision {
  const canonical = canonicalizeScopePatterns(input.authority?.write_scope ?? []);
  const auditBase = (findings: PatchProposalFinding[]): PatchProposalIntakeAudit => ({ profile: input.profile, firstFinding: firstFinding(findings), findings });
  if (!canonical.ok) {
    const findings: PatchProposalFinding[] = [{ kind: "outside_authority_write_scope", details: { write_scope: input.authority?.write_scope ?? [], unsafe: canonical.unsafe } }];
    return { kind: "review", profile: input.profile, reason: "write_scope contains unsafe path pattern", details: findings[0].details, canonicalWriteScope: [], findings, audit: auditBase(findings) };
  }

  const authority = input.authority ? { ...input.authority, write_scope: canonical.scopes } : undefined;
  const policyInput = {
    cwd: input.cwd,
    proposal: input.proposal,
    authority,
    authorityEnforced: input.authorityEnforced,
    patchRefRootDir: input.patchRefRootDir,
    writeScopeMatcher: input.writeScopeMatcher ?? (input.profile === "subagent_apply" ? withinAny : undefined),
  };
  const policy = input.profile === "candidate_escrow"
    ? evaluatePatchProposalForCandidate(policyInput)
    : evaluatePatchProposalForApply({ ...policyInput, requireWriteScope: false });
  const audit = auditBase(policy.findings);

  if (policy.kind === "allow") {
    return {
      kind: "allow",
      profile: input.profile,
      patchText: policy.patchText,
      patchSha256: sha256Text(policy.patchText),
      touchedPaths: policy.touchedPaths,
      canonicalWriteScope: canonical.scopes,
      findings: policy.findings,
      audit,
    };
  }

  const finding = firstFinding(policy.findings);
  const details = finding?.details ?? policy.findings;
  if (policy.kind === "review" && input.profile === "subagent_apply") {
    return {
      kind: "review",
      profile: input.profile,
      reason: intakeReviewReason(input.profile, finding),
      details,
      patchText: policy.patchText,
      touchedPaths: policy.touchedPaths,
      canonicalWriteScope: canonical.scopes,
      findings: policy.findings,
      audit,
    };
  }

  return {
    kind: "reject",
    profile: input.profile,
    reason: intakeRejectReason(input.profile, finding),
    details,
    patchText: policy.patchText,
    touchedPaths: policy.touchedPaths,
    canonicalWriteScope: canonical.scopes,
    findings: policy.findings,
    audit,
  };
}

export function sha256Text(text: string): string {
  return "sha256:" + createHash("sha256").update(text, "utf8").digest("hex");
}

function intakeRejectReason(profile: PatchProposalIntakeProfile, finding?: PatchProposalFinding): RejectReason | string {
  if (profile === "candidate_escrow") return candidateFindingReason(finding);
  return applyFindingRejectReason(finding);
}

function intakeReviewReason(profile: PatchProposalIntakeProfile, finding?: PatchProposalFinding): string {
  if (profile === "candidate_escrow") return candidateFindingReason(finding);
  if (finding?.kind === "authority_not_enforced") return "Authority was not enforced for external subagent";
  return finding?.kind ?? "patch proposal requires review";
}

function candidateFindingReason(finding?: PatchProposalFinding): string {
  if (!finding) return "patch_proposal_policy_rejected";
  if (finding.kind === "authority_not_enforced") return "authority_not_enforced";
  return finding.kind;
}

function applyFindingRejectReason(finding?: PatchProposalFinding): RejectReason {
  switch (finding?.kind) {
    case "invalid_patch_ref": return "invalid_patch_ref";
    case "patch_too_large": return "patch_too_large";
    case "base_hash_mismatch": return "base_hash_mismatch";
    case "outside_authority_write_scope": return "outside_path_scope";
    case "outside_authority_semantic_scope": return "outside_semantic_scope";
    case "undeclared_public_surface_delta": return "undeclared_public_surface_delta";
    case "high_risk_requires_review": return "high_risk_requires_review";
    case "unsafe_patch_path":
    case "declared_touched_paths_mismatch": return "declared_touched_paths_mismatch";
    default: return "manual_reject";
  }
}

function canonicalizeScopePatterns(scopes: string[]): { ok: true; scopes: string[] } | { ok: false; unsafe: string } {
  const out: string[] = [];
  for (const scope of scopes) {
    if (scope.includes("\0") || /^[A-Za-z]:[\\/]/.test(scope) || path.isAbsolute(scope)) return { ok: false, unsafe: scope };
    const placeholder = scope.replace(/\*/g, "__STAR__");
    const safe = safeRepoRelativePath(placeholder);
    if (!safe) return { ok: false, unsafe: scope };
    out.push(safe.replace(/__STAR__/g, "*"));
  }
  return { ok: true, scopes: out };
}

function withinAny(file: string, scopes: string[]): boolean {
  if (scopes.length === 0) return true;
  const norm = file.replace(/\\/g, "/");
  return scopes.some((s) => {
    const scope = s.replace(/\\/g, "/").replace(/\/$/, "");
    return norm === scope || norm.startsWith(scope + "/");
  });
}
