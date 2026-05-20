import type { PromptFragment, RenderedPrompt } from "./types.js";
import { normalizeFragment, sortFragments } from "./canonicalize.js";
import { hashFragment, sha256 } from "./hash.js";
import { inspectFragments, inspectStablePrefix } from "./inspect.js";
export function renderSection(title: string, fragments: PromptFragment[]): string {
  if (fragments.length === 0) return "";
  const body = fragments.map((f) => `<!-- fragment:${f.source}:${f.id}:${f.kind}:${f.stability}:${f.version} -->\n${f.content}`).join("\n");
  return `<!-- prompt-fragments:${title} -->\n## ${title}\n\n${body}`.trimEnd() + "\n";
}
export function renderDynamicTailMessage(fragments: PromptFragment[]): string { return renderSection("Dynamic turn context", fragments); }
export function renderPromptFragments(fragments: PromptFragment[]): RenderedPrompt {
  const rendered = sortFragments(fragments.filter((f) => f.enabled !== false).map(normalizeFragment));
  const stable = rendered.filter((f) => f.stability === "stable");
  const semi = rendered.filter((f) => f.stability === "semi_stable");
  const dynamic = rendered.filter((f) => f.stability === "dynamic");
  const stableText = renderSection("Stable extension instructions", stable);
  const semiStableText = renderSection("Semi-stable session context", semi);
  const dynamicText = renderSection("Dynamic turn context", dynamic);
  return { stableText, semiStableText, dynamicText, stablePrefixText: stableText, stablePrefixHash: sha256(stableText), fragmentHashes: rendered.map(hashFragment), warnings: [...inspectFragments(rendered), ...inspectStablePrefix(stableText)] };
}
