import type { PromptFragment, PromptInspectionWarning, RenderedPrompt } from "./types.js";
import { canonicalizeText, normalizeFragment, sortFragments } from "./canonicalize.js";
import { hashFragment, sha256 } from "./hash.js";
import { inspectFragments, inspectStablePrefix } from "./inspect.js";
const DYNAMIC_TOTAL_MAX_CHARS = 24_000;

function limitDynamicFragments(fragments: PromptFragment[]): { fragments: PromptFragment[]; warnings: PromptInspectionWarning[] } {
  let used = 0;
  const warnings: PromptInspectionWarning[] = [];
  const limited = fragments.map((f) => {
    if (f.stability !== "dynamic") return f;
    const remaining = DYNAMIC_TOTAL_MAX_CHARS - used;
    if (remaining <= 0) {
      warnings.push({ severity: "warning", code: "DYNAMIC_CONTEXT_TRUNCATED", message: `Dynamic fragment omitted after size limit: ${f.id}`, fragmentId: f.id, source: f.source });
      return { ...f, content: `[omitted: dynamic context exceeded ${DYNAMIC_TOTAL_MAX_CHARS} chars]` };
    }
    if (f.content.length > remaining) {
      warnings.push({ severity: "warning", code: "DYNAMIC_CONTEXT_TRUNCATED", message: `Dynamic fragment truncated to reduce context: ${f.id}`, fragmentId: f.id, source: f.source });
      used = DYNAMIC_TOTAL_MAX_CHARS;
      return { ...f, content: `${f.content.slice(0, Math.max(0, remaining - 80))}\n[omitted: dynamic context truncated to ${DYNAMIC_TOTAL_MAX_CHARS} chars]` };
    }
    used += f.content.length;
    return f;
  });
  return { fragments: limited, warnings };
}

export function renderSection(title: string, fragments: PromptFragment[]): string {
  if (fragments.length === 0) return "";
  const body = fragments.map((f) => `<!-- fragment:${f.source}:${f.id}:${f.kind}:${f.stability}:${f.version} -->\n${f.content}`).join("\n");
  return `<!-- prompt-fragments:${title} -->\n## ${title}\n\n${body}`.trimEnd() + "\n";
}
export function renderDynamicTailMessage(fragments: PromptFragment[]): string { return renderSection("Dynamic turn context", fragments); }
export function renderPromptFragments(fragments: PromptFragment[]): RenderedPrompt {
  const limited = limitDynamicFragments(fragments.filter((f) => f.enabled !== false).map(normalizeFragment));
  const rendered = sortFragments(limited.fragments);
  const stable = rendered.filter((f) => f.stability === "stable");
  const semi = rendered.filter((f) => f.stability === "semi_stable");
  const dynamic = rendered.filter((f) => f.stability === "dynamic");
  const stableText = renderSection("Stable extension instructions", stable);
  const semiStableText = renderSection("Semi-stable session context", semi);
  const dynamicText = renderSection("Dynamic turn context", dynamic);
  return { stableText, semiStableText, dynamicText, stablePrefixText: stableText, stablePrefixHash: sha256(canonicalizeText(stableText)), stableFragments: stable, semiStableFragments: semi, dynamicFragments: dynamic, fragmentHashes: rendered.map(hashFragment), warnings: [...limited.warnings, ...inspectFragments(rendered), ...inspectStablePrefix(stableText)] };
}
