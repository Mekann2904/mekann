const preferred = new Set(["content", "text", "system", "prompt", "instructions", "messages"]);
function isBinary(value: unknown): boolean { return typeof Buffer !== "undefined" && Buffer.isBuffer(value) || value instanceof ArrayBuffer || ArrayBuffer.isView(value as any); }
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
