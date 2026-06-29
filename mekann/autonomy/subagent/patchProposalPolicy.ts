import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import type { FileFingerprint, PatchProposalResult, PublicSurfaceDelta, SemanticTarget, SubagentAuthority } from "./types.js";
import { detectPublicSurfaceFromPatch, extractTouchedPathsFromPatchStrict, isNewFilePatch, normalizePublicSurfaceDeltas, safeRepoRelativePath } from "./fingerprint.js";
import { keyOfTarget } from "./semantic.js";
import { isPatchRefUnderDir } from "./pathSafety.js";
import { MEKANN_SUBAGENT_DEFAULTS } from "../../config.js";

export type PatchProposalUse = "candidate" | "apply";

export type PatchProposalFindingKind =
  | "invalid_patch_ref"
  | "patch_too_large"
  | "authority_not_enforced"
  | "missing_authority_write_scope"
  | "base_hash_mismatch"
  | "unsafe_patch_path"
  | "declared_touched_paths_mismatch"
  | "outside_authority_write_scope"
  | "outside_authority_semantic_scope"
  | "undeclared_public_surface_delta"
  | "high_risk_requires_review";

export interface PatchProposalFinding {
  kind: PatchProposalFindingKind;
  details?: unknown;
}

export type PatchProposalDecision =
  | { kind: "allow"; findings: PatchProposalFinding[]; patchText: string; touchedPaths: string[] }
  | { kind: "review"; findings: PatchProposalFinding[]; patchText?: string; touchedPaths?: string[] }
  | { kind: "reject"; findings: PatchProposalFinding[]; patchText?: string; touchedPaths?: string[] };

export interface PatchProposalPolicyInput {
  cwd: string;
  proposal: PatchProposalResult;
  authority?: SubagentAuthority;
  authorityEnforced?: boolean;
  patchRefRootDir: string;
  writeScopeMatcher?: (file: string, writeScope: string[]) => boolean;
  requireAuthorityEnforced?: boolean;
  requireWriteScope?: boolean;
  highRiskDecision?: "allow" | "review" | "reject";
}

export function evaluatePatchProposalForCandidate(input: PatchProposalPolicyInput): PatchProposalDecision {
  return evaluatePatchProposal({
    ...input,
    requireAuthorityEnforced: input.requireAuthorityEnforced ?? true,
    requireWriteScope: input.requireWriteScope ?? true,
    highRiskDecision: input.highRiskDecision ?? "reject",
  });
}

export function evaluatePatchProposalForApply(input: PatchProposalPolicyInput): PatchProposalDecision {
  return evaluatePatchProposal({
    ...input,
    requireAuthorityEnforced: input.requireAuthorityEnforced ?? true,
    requireWriteScope: input.requireWriteScope ?? true,
    highRiskDecision: input.highRiskDecision ?? "allow",
  });
}

function evaluatePatchProposal(input: PatchProposalPolicyInput): PatchProposalDecision {
  const findings: PatchProposalFinding[] = [];
  const ref = input.proposal.patch?.ref;
  if (typeof ref !== "string" || !isPatchRefUnderDir(ref, input.patchRefRootDir)) {
    findings.push({ kind: "invalid_patch_ref" });
    return decide(findings);
  }

  let patchText: string;
  try { patchText = fs.readFileSync(ref, "utf8"); }
  catch (error) {
    findings.push({ kind: "invalid_patch_ref", details: error instanceof Error ? error.message : String(error) });
    return decide(findings);
  }

  const patchBytes = input.proposal.patch.bytes ?? Buffer.byteLength(patchText, "utf8");
  const maxBytes = input.authority?.max_patch_bytes ?? MEKANN_SUBAGENT_DEFAULTS.maxPatchBytes;
  if (patchBytes > maxBytes) findings.push({ kind: "patch_too_large", details: { bytes: patchBytes, maxBytes } });

  if (input.requireAuthorityEnforced !== false && input.authorityEnforced === false) findings.push({ kind: "authority_not_enforced" });

  const extractedTouched = extractTouchedPathsFromPatchStrict(patchText);
  let touchedPaths: string[] | undefined;
  if (!extractedTouched.ok) findings.push({ kind: "unsafe_patch_path", details: extractedTouched });
  else {
    touchedPaths = extractedTouched.paths;
    const declared = input.proposal.scope.touched_paths.map(safeRepoRelativePath).filter((p): p is string => Boolean(p)).sort();
    if (declared.length !== input.proposal.scope.touched_paths.length || JSON.stringify(touchedPaths) !== JSON.stringify(declared)) {
      findings.push({ kind: "declared_touched_paths_mismatch", details: { declared, extracted: touchedPaths } });
    }

    const writeScope = input.authority?.write_scope ?? [];
    if (input.requireWriteScope !== false && writeScope.length === 0) findings.push({ kind: "missing_authority_write_scope" });
    const matchesWriteScope = input.writeScopeMatcher ?? defaultWriteScopeMatcher;
    const outsideAuthorityPath = writeScope.length > 0 ? touchedPaths.find((p) => !matchesWriteScope(p, writeScope)) : undefined;
    if (outsideAuthorityPath) findings.push({ kind: "outside_authority_write_scope", details: { path: outsideAuthorityPath, write_scope: writeScope } });

    if (input.authority?.require_base_hash !== false) {
      const basePaths = new Set(input.proposal.base.files.map((f) => safeRepoRelativePath(f.path)).filter((p): p is string => Boolean(p)));
      const missingBase = touchedPaths.find((p) => !basePaths.has(p) && !isNewFilePatch(p, patchText));
      if (missingBase) findings.push({ kind: "base_hash_mismatch", details: { path: missingBase, reason: "missing_base_hash" } });
    }
  }

  const base = validateBaseFileHashesSync(input.cwd, input.proposal.base.files);
  if (!base.ok) findings.push({ kind: "base_hash_mismatch", details: base });

  const authoritySem = new Set((input.authority?.semantic_scope ?? []).map(keyOfTarget));
  if (authoritySem.size) {
    const outsideSemantic = [...input.proposal.semantic.reads, ...input.proposal.semantic.writes].find((t) => !authoritySem.has(keyOfTarget(t)));
    if (outsideSemantic) findings.push({ kind: "outside_authority_semantic_scope", details: outsideSemantic });
  }

  const actualSurface = normalizePublicSurfaceDeltas(detectPublicSurfaceFromPatch(patchText));
  const declaredSurface = new Set(normalizePublicSurfaceDeltas(input.proposal.semantic.public_surface_delta).map(surfaceKey));
  const undeclaredSurface = actualSurface.filter((delta) => !declaredSurface.has(surfaceKey(delta)));
  if (undeclaredSurface.length) findings.push({ kind: "undeclared_public_surface_delta", details: undeclaredSurface });

  if (input.proposal.semantic.risk.level === "high" && input.highRiskDecision && input.highRiskDecision !== "allow") {
    findings.push({ kind: "high_risk_requires_review" });
  }

  return decide(findings, patchText, touchedPaths, input.highRiskDecision);
}

function decide(findings: PatchProposalFinding[], patchText?: string, touchedPaths?: string[], highRiskDecision: "allow" | "review" | "reject" = "allow"): PatchProposalDecision {
  if (findings.length === 0 && patchText && touchedPaths) return { kind: "allow", findings, patchText, touchedPaths };
  const reviewKinds = new Set<PatchProposalFindingKind>(["authority_not_enforced"]);
  if (highRiskDecision === "review") reviewKinds.add("high_risk_requires_review");
  if (findings.every((f) => reviewKinds.has(f.kind))) return { kind: "review", findings, patchText, touchedPaths };
  return { kind: "reject", findings, patchText, touchedPaths };
}

function validateBaseFileHashesSync(cwd: string, files: FileFingerprint[]): { ok: true } | { ok: false; path: string; expected: string; actual?: string } {
  for (const f of files) {
    const safe = safeRepoRelativePath(f.path);
    if (!safe) return { ok: false, path: f.path, expected: f.hash };
    try {
      const actual = sha256Buffer(fs.readFileSync(path.join(cwd, safe)));
      if (actual !== f.hash) return { ok: false, path: f.path, expected: f.hash, actual };
    } catch {
      return { ok: false, path: f.path, expected: f.hash };
    }
  }
  return { ok: true };
}

function sha256Buffer(buffer: Buffer): string { return "sha256:" + createHash("sha256").update(buffer).digest("hex"); }
function surfaceKey(delta: Pick<PublicSurfaceDelta, "surface" | "name" | "change">): string { return `${delta.surface}:${delta.name}:${delta.change}`; }
function defaultWriteScopeMatcher(file: string, writeScope: string[]): boolean { return writeScope.some((scope) => file === scope.replace(/\/$/, "") || file.startsWith(scope.replace(/\/$/, "") + "/")); }

export function firstFinding(findings: PatchProposalFinding[]): PatchProposalFinding | undefined { return findings[0]; }
