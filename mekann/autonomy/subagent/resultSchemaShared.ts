/**
 * Shared JSON extraction utilities for structured LLM output.
 *
 * Extracted from resultSchema.ts so that review-fixer and subagent
 * can both use the same balanced-brace JSON extraction without duplication.
 */

/**
 * Scan text for balanced-brace JSON objects.
 * Returns each top-level `{…}` substring in order of appearance.
 */
export function balancedJsonObjects(text: string): string[] {
  const out: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}" && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) out.push(text.slice(start, i + 1));
    }
  }
  return out;
}

function looksLikeSchema(candidate: string, schemaId: string): boolean {
  try {
    const raw = JSON.parse(candidate) as unknown;
    return typeof raw === "object" && raw !== null && !Array.isArray(raw) && (raw as Record<string, unknown>).schema === schemaId;
  } catch { return false; }
}

/**
 * Extract a JSON string from text that may be wrapped in markdown code blocks
 * or surrounded by prose, targeting a specific `schema` identifier.
 *
 * Strategy:
 * 1. Direct parse if text starts with `{` and matches the schema.
 * 2. Scan markdown code blocks for a match.
 * 3. Scan balanced-brace JSON objects for a match.
 * 4. Return trimmed text as fallback.
 */
export function extractJSONWithSchema(text: string, schemaId: string): string | null {
  const trimmed = text.trim();

  // Fast path: direct parse
  if (trimmed.startsWith("{") && looksLikeSchema(trimmed, schemaId)) return trimmed;

  // Markdown code blocks
  const codeBlocks = [...trimmed.matchAll(/```(?:\w*)\s*\n([\s\S]*?)\n?```/g)].map((m) => m[1].trim());
  for (const block of codeBlocks) {
    if (block.startsWith("{") && looksLikeSchema(block, schemaId)) return block;
    const nested = balancedJsonObjects(block).find((c) => looksLikeSchema(c, schemaId));
    if (nested) return nested;
  }

  // Balanced-brace scan
  const candidate = balancedJsonObjects(trimmed).find((c) => looksLikeSchema(c, schemaId));
  if (candidate) return candidate;

  return null;
}
