/**
 * Subagent Extension — Context fork.
 *
 * Extracts user/assistant text turns from the parent session branch
 * for seeding a child agent's context.
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";

export type ForkTurns = number | "all" | "none";

export const FORK_CONTEXT_MAX_CHARS = 12_000;
export const FORK_CONTEXT_MESSAGE_MAX_CHARS = 2_000;

export function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 80))}\n[omitted: ${text.length - Math.max(0, maxChars - 80)} chars truncated to reduce context]`;
}

/**
 * Extract forkable text from the parent branch.
 *
 * - `"none"`: returns empty array
 * - `"all"`: returns all user/assistant text pairs
 * - `N`: returns the last N user turns and their corresponding assistant responses
 *
 * Filters out: toolResult, toolCall, bashExecution, internal custom messages.
 */
export function extractForkContext(
  messages: AgentMessage[],
  forkTurns: ForkTurns,
): Array<{ role: "user" | "assistant"; text: string }> {
  if (forkTurns === "none" || forkTurns === 0) return [];

  // Extract user/assistant text pairs in order
  const pairs: Array<{ role: "user" | "assistant"; text: string }> = [];
  for (const msg of messages) {
    if (msg.role === "user" || msg.role === "assistant") {
      const text = extractTextFromContent(msg.content);
      if (text) pairs.push({ role: msg.role, text });
    }
    // Skip toolResult, bashExecution, custom messages
  }

  if (forkTurns === "all") return limitForkContext(pairs);

  // For numeric N, take the last N user turns + their assistant responses
  const n = typeof forkTurns === "number" ? forkTurns : 0;
  if (n <= 0) return [];

  // Find the indices of the last N user messages
  const userIndices: number[] = [];
  for (let i = pairs.length - 1; i >= 0; i--) {
    if (pairs[i].role === "user") {
      userIndices.unshift(i);
      if (userIndices.length >= n) break;
    }
  }

  if (userIndices.length === 0) return [];

  // Return from the first selected user message to the end
  return limitForkContext(pairs.slice(userIndices[0]));
}

function limitForkContext(pairs: Array<{ role: "user" | "assistant"; text: string }>): Array<{ role: "user" | "assistant"; text: string }> {
  const out: Array<{ role: "user" | "assistant"; text: string }> = [];
  let used = 0;
  for (let i = pairs.length - 1; i >= 0; i--) {
    const text = truncateText(pairs[i].text, FORK_CONTEXT_MESSAGE_MAX_CHARS);
    const cost = text.length + 32;
    if (out.length > 0 && used + cost > FORK_CONTEXT_MAX_CHARS) break;
    out.unshift({ role: pairs[i].role, text });
    used += cost;
    if (used >= FORK_CONTEXT_MAX_CHARS) break;
  }
  if (out.length < pairs.length) out.unshift({ role: "assistant", text: `[omitted: ${pairs.length - out.length} older forked messages to reduce context]` });
  return out;
}

/**
 * Build a context preamble message for the child agent.
 */
export function buildContextPreamble(opts: {
  agentPath: string;
  parentPath: string;
  role?: string;
  nickname?: string;
}): string {
  const lines: string[] = [
    "## Subagent Context",
    "",
    `You are a subagent at path: ${opts.agentPath}`,
    `Parent agent path: ${opts.parentPath}`,
  ];
  if (opts.role) lines.push(`Role: ${opts.role}`);
  if (opts.nickname) lines.push(`Nickname: ${opts.nickname}`);
  lines.push(
    "",
    "Communication: When you are done, provide your final result. The parent agent will receive it via wait_agent.",
    "Do not attempt to communicate with the parent agent directly.",
  );
  return lines.join("\n");
}

// ─── Content extraction ───────────────────────────────────────────────

/** Extract text from message content (string or content block array). */
export function extractTextFromContent(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const texts: string[] = [];
    for (const block of content) {
      if (block && typeof block === "object" && "type" in block && block.type === "text" && "text" in block && typeof block.text === "string") texts.push(block.text);
    }
    return texts.length > 0 ? texts.join("\n") : null;
  }
  return null;
}

