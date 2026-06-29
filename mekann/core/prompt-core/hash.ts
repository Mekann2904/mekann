import { createHash } from "node:crypto";
import type { PromptFragment, PromptFragmentHash } from "./types.js";
import { canonicalizeJson, canonicalizeText, estimateTokens } from "./canonicalize.js";
export function sha256(text: string): string { return createHash("sha256").update(text).digest("hex"); }
export function hashFragment(fragment: PromptFragment): PromptFragmentHash {
  const stable = { id: fragment.id, source: fragment.source, kind: fragment.kind, stability: fragment.stability, scope: fragment.scope, priority: fragment.priority, version: fragment.version, content: canonicalizeText(fragment.content) };
  return { id: fragment.id, source: fragment.source, kind: fragment.kind, stability: fragment.stability, hash: sha256(canonicalizeJson(stable)), chars: fragment.content.length, tokenEstimate: estimateTokens(fragment.content) };
}
