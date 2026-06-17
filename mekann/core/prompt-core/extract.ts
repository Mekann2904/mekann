const preferred = new Set(["content", "text", "system", "prompt", "instructions", "messages", "input", "parts", "developer"]);
function isBinary(value: unknown): boolean { return typeof Buffer !== "undefined" && Buffer.isBuffer(value) || value instanceof ArrayBuffer || ArrayBuffer.isView(value as any); }
/**
 * Extract a best-effort text approximation from a provider request payload for
 * diagnostics (prompt-cache prefix tracking, size trend charts).
 *
 * Walks preferred string-bearing keys (content, text, system, prompt,
 * instructions, messages, input, parts, developer) and concatenates their
 * string values. Non-preferred keys are visited too, but only string values
 * under preferred keys are emitted.
 *
 * IMPORTANT — this is a TEXT-ONLY estimate, not a token count:
 * - Tool/function JSON schemas are dropped (they live under non-preferred keys
 *   like `tools`/`functions`; nested structure is not stringified).
 * - Numeric/boolean/structured JSON fields are not stringified.
 * - Conversation history is only partially captured (the `content`/`text` of
 *   each message), so large tool_result blobs may be underrepresented.
 * The derived `totalPromptTokenEstimate` is therefore systematically smaller
 * than the provider-reported `inputTotalTokens`. Use `inputTotalTokens`
 * (actual usage log) for billing / cache-hit math.
 *
 * Output is capped at 500k chars to bound memory on pathological payloads.
 */
export function extractTextFromProviderPayload(payload: unknown): string {
  const max = 500_000;
  const seen = new WeakSet<object>();
  const chunks: string[] = [];
  let length = 0;
  function add(s: string) { if (length >= max) return; const room = max - length; const part = s.slice(0, room); chunks.push(part); length += part.length; }
  function visit(value: unknown, key?: string): void {
    if (length >= max || value == null || isBinary(value)) return;
    if (typeof value === "string") { if (!key || preferred.has(key)) add(value); return; }
    if (typeof value !== "object") return;
    if (seen.has(value)) return; seen.add(value);
    if (Array.isArray(value)) { for (const v of value) visit(v, key); return; }
    const obj = value as Record<string, unknown>;
    for (const k of Object.keys(obj).filter((k) => preferred.has(k))) visit(obj[k], k);
    for (const k of Object.keys(obj).filter((k) => !preferred.has(k))) visit(obj[k], k);
  }
  try { visit(payload); return chunks.join("\n"); } catch (e) { return `[extract-error] ${e instanceof Error ? e.message : String(e)}`; }
}
