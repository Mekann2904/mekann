/**
 * Subagent Extension — Shared content text extraction.
 *
 * Single implementation for extracting text from message content blocks.
 * Used by contextFork and agentControl.
 */

/**
 * Extract text from message content (string or content block array).
 * Returns null if no text found.
 */
export function extractTextFromContent(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const texts: string[] = [];
    for (const block of content) {
      if (
        block &&
        typeof block === "object" &&
        "type" in block &&
        block.type === "text" &&
        "text" in block &&
        typeof block.text === "string"
      ) {
        texts.push(block.text);
      }
    }
    return texts.length > 0 ? texts.join("\n") : null;
  }
  return null;
}
