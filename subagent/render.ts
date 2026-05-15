/**
 * Subagent Extension — TUI rendering helpers.
 */

import type { AgentMetadata, MailboxItem } from "./types.js";

/**
 * Format a list of agents for display in the /agents command.
 */
export function formatAgentList(agents: AgentMetadata[]): string[] {
  if (agents.length === 0) return ["(no agents)"];

  const lines: string[] = [];
  for (const agent of agents) {
    const statusIcon = agent.open ? "●" : "○";
    const nickname = agent.nickname ? ` (${agent.nickname})` : "";
    const role = agent.role ? ` [${agent.role}]` : "";
    const task = agent.lastTaskMessage
      ? ` — ${truncate(agent.lastTaskMessage, 60)}`
      : "";
    lines.push(
      `${statusIcon} ${agent.agentPath}${nickname}${role} — ${agent.status}${task}`,
    );
  }
  return lines;
}

/**
 * Format a wait result for display.
 */
export function formatWaitResult(
  events: import("./types.js").LifecycleEvent[],
  mailbox: MailboxItem[],
  timedOut: boolean,
): string[] {
  const lines: string[] = [];
  if (timedOut) {
    lines.push("(timed out — no updates in the given period)");
  }

  if (mailbox.length > 0) {
    lines.push(`Mailbox (${mailbox.length} messages):`);
    for (const item of mailbox) {
      lines.push(`  [${item.kind}] from ${item.fromAgentPath}: ${truncate(item.content, 100)}`);
    }
  }

  const statusEvents = events.filter(
    (e) =>
      e.type === "agent_status_changed" || e.type === "agent_final_message",
  );
  if (statusEvents.length > 0) {
    lines.push("Events:");
    for (const evt of statusEvents) {
      if (evt.type === "agent_status_changed") {
        lines.push(`  ${evt.agentPath}: ${evt.previousStatus} → ${evt.newStatus}`);
      } else if (evt.type === "agent_final_message") {
        lines.push(`  ${evt.agentPath}: ${truncate(evt.message, 100)}`);
      }
    }
  }

  if (lines.length === 0) {
    lines.push("(no updates)");
  }
  return lines;
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + "…";
}
