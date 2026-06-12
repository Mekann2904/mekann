/**
 * Shared JSON extraction utilities for parsing structured output from LLMs.
 *
 * Genericised from resultSchema.ts so that non-subagent consumers
 * (e.g. review-fixer) can reuse the balanced-JSON / code-block extraction
 * logic with their own schema identifier.
 */

function isObj(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }

/**
 * Return all top-level balanced `{…}` substrings found in `text`,
 * respecting JSON string escaping so that braces inside string literals
 * are not counted.
 */
function balancedJsonObjects(text: string): string[] {
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
    return isObj(raw) && raw.schema === schemaId;
  } catch { return false; }
}

/**
 * Extract the raw JSON string whose `"schema"` field equals `schemaId`
 * from LLM output that may contain markdown code blocks or prose.
 *
 * Returns `null` when no matching JSON object is found.
 */
export function extractJSONWithSchema(text: string, schemaId: string): string | null {
  const trimmed = text.trim();

  // Fast path — entire text is the object
  if (trimmed.startsWith("{") && looksLikeSchema(trimmed, schemaId)) return trimmed;

  // Scan markdown code blocks
  const codeBlocks = [...trimmed.matchAll(/```(?:\w*)\s*\n([\s\S]*?)\n?```/g)].map((m) => m[1].trim());
  for (const block of codeBlocks) {
    if (block.startsWith("{") && looksLikeSchema(block, schemaId)) return block;
    const nested = balancedJsonObjects(block).find((c) => looksLikeSchema(c, schemaId));
    if (nested) return nested;
  }

  // Fallback: scan all balanced JSON objects in the raw text
  const candidate = balancedJsonObjects(trimmed).find((c) => looksLikeSchema(c, schemaId));
  if (candidate) return candidate;

  return null;
}
