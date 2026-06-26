import type { PublicSurfaceDelta, SemanticRisk, SemanticTarget } from "./types.js";

/**
 * Stable identity key for a semantic target. Includes the optional `module` /
 * `filePath` disambiguator when present so that same-named symbols in
 * different modules/files are not treated as the same target (issue #152 /
 * IC-158, IC-161). Falls back to `kind:name` when no locator is supplied.
 */
export function keyOfTarget(target: SemanticTarget): string {
  const loc = target.module ?? target.filePath;
  return loc ? `${target.kind}:${loc}:${target.name}` : `${target.kind}:${target.name}`;
}

/**
 * Extract the trailing name segment from a {@link keyOfTarget} result so the
 * public-surface match can compare names exactly instead of via substring
 * (`r.includes(delta.name)`), which over-matched `parse` against `parseFile`
 * (issue #152 / IC-161).
 */
export function nameOfKey(key: string): string {
  const idx = key.lastIndexOf(":");
  return idx >= 0 ? key.slice(idx + 1) : key;
}

export function intersects<T>(a: Set<T>, b: Set<T>): T[] { const out: T[] = []; for (const x of a) if (b.has(x)) out.push(x); return out; }
export function isHighRisk(risk?: SemanticRisk): boolean { return risk?.level === "high"; }
export function isBreakingOrUnknown(delta: PublicSurfaceDelta): boolean { return delta.compatibility !== "compatible"; }
