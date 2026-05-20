import type { PublicSurfaceDelta, SemanticRisk, SemanticTarget } from "./types.js";

export function keyOfTarget(target: SemanticTarget): string { return `${target.kind}:${target.name}`; }
export function intersects<T>(a: Set<T>, b: Set<T>): T[] { const out: T[] = []; for (const x of a) if (b.has(x)) out.push(x); return out; }
export function isHighRisk(risk?: SemanticRisk): boolean { return risk?.level === "high"; }
export function isBreakingOrUnknown(delta: PublicSurfaceDelta): boolean { return delta.compatibility !== "compatible"; }
