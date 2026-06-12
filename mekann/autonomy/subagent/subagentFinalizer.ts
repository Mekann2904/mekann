/**
 * SubagentFinalizer — result parsing, storage, and mailbox enqueue.
 *
 * Hides tryParseSubagentResult, truncation limits, and result store
 * lookup behind a small interface.
 */

import type { AgentMetadata } from "./types.js";
import type { Mailbox } from "./mailbox.js";
import type { AgentRegistry } from "./registry.js";
import { SubagentResultStore } from "./resultStore.js";
import { resultSummary } from "./resultStore.js";
import { tryParseSubagentResult } from "./resultSchema.js";
import { extractTextFromContent, truncateText } from "./contextFork.js";
import type { FinalizeSubagentInput } from "./subagentLifecycle.js";
import { ROOT_PATH } from "./types.js";

const MAILBOX_CONTENT_MAX_CHARS = 1_200;
const STRUCTURED_REVIEW_FIXER_MAX_CHARS = 64_000;

export class SubagentFinalizer {
  private storesByCwd = new Map<string, SubagentResultStore>();
  readonly resultStore: SubagentResultStore;
  /** Maps retry agent path → original result_id for chain linking. */
  private pendingRetryLinks = new Map<string, string>();

  constructor(
    private readonly registry: AgentRegistry,
    private readonly mailbox: Mailbox,
    cwd = process.cwd(),
  ) {
    this.resultStore = this.resultStoreFor(cwd);
  }

  resultStoreFor(cwd: string): SubagentResultStore {
    const key = cwd;
    let store = this.storesByCwd.get(key);
    if (!store) {
      store = new SubagentResultStore(key);
      this.storesByCwd.set(key, store);
    }
    return store;
  }

  handleFinalText(input: FinalizeSubagentInput): string {
    const text = input.finalText ?? "(agent completed)";
    const parsed = tryParseSubagentResult(text);
    const agent = this.registry.get(input.agentPath);
    const mailboxLimit = agent?.role === "review-fixer" ? STRUCTURED_REVIEW_FIXER_MAX_CHARS : MAILBOX_CONTENT_MAX_CHARS;
    let message = truncateText(text, mailboxLimit);
    if (parsed.ok && agent) {
      const store = this.resultStoreFor(input.cwd ?? process.cwd());
      const stored = store.save(agent, parsed.result);
      // Link retry chain if this agent was spawned as a retry
      const originalId = this.pendingRetryLinks.get(input.agentPath);
      if (originalId) {
        this.pendingRetryLinks.delete(input.agentPath);
        try { store.linkRetry(originalId, stored.result_id); } catch { /* best-effort */ }
      }
      message = resultSummary(stored);
    }
    this.registry.updateStatus(input.agentPath, input.status, { lastTaskMessage: message });
    this.enqueueToMailbox(input.agentId, input.agentPath, input.callerPath, message, "final_result");
    this.mailbox.appendEvent({
      type: "agent_final_message",
      agentId: input.agentId,
      agentPath: input.agentPath,
      timestamp: Date.now(),
      parentAgentId: input.callerPath === ROOT_PATH ? undefined : "root",
      message,
      status: input.status,
    });
    return message;
  }

  finalizeWithError(agentId: string, agentPath: string, callerPath: string, err: unknown): void {
    const errorMessage = err instanceof Error ? err.message : String(err);
    this.registry.updateStatus(agentPath, "errored");
    this.registry.close(agentPath, "errored");
    this.mailbox.appendEvent({
      type: "agent_final_message",
      agentId,
      agentPath,
      timestamp: Date.now(),
      parentAgentId: callerPath === ROOT_PATH ? undefined : "root",
      message: `Agent error: ${errorMessage}`,
      status: "errored",
    });
    this.enqueueToMailbox(agentId, agentPath, callerPath, `Agent error: ${errorMessage}`, "final_result");
  }

  enqueueToMailbox(fromAgentId: string, fromPath: string, toPath: string, content: string, kind: "message" | "followup" | "final_result"): void {
    const agent = this.registry.get(fromPath);
    const mailboxLimit = agent?.role === "review-fixer" ? STRUCTURED_REVIEW_FIXER_MAX_CHARS : MAILBOX_CONTENT_MAX_CHARS;
    this.mailbox.enqueue({
      fromAgentId,
      fromAgentPath: fromPath,
      toAgentPath: toPath,
      content: truncateText(content, mailboxLimit),
      timestamp: Date.now(),
      kind,
    });
  }

  /** Register a pending retry link: when agentPath finishes, its result will be linked to originalResultId. */
  registerRetryLink(agentPath: string, originalResultId: string): void {
    this.pendingRetryLinks.set(agentPath, originalResultId);
  }
}
