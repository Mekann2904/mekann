/**
 * Subagent Extension — Context fork.
 *
 * Extracts user/assistant text turns from the parent session branch
 * for seeding a child agent's context.
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";

export type ForkTurns = number | "all" | "none";

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
    if (msg.role === "user") {
      const text = extractText(msg.content);
      if (text) pairs.push({ role: "user", text });
    } else if (msg.role === "assistant") {
      const text = extractAssistantText(msg.content);
      if (text) pairs.push({ role: "assistant", text });
    }
    // Skip toolResult, bashExecution, custom messages
  }

  if (forkTurns === "all") return pairs;

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
  return pairs.slice(userIndices[0]);
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

// ─── Helpers ─────────────────────────────────────────────────────

function extractText(content: unknown): string | null {
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

function extractAssistantText(content: unknown): string | null {
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
