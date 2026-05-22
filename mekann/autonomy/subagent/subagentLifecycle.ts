import { ROOT_PATH } from "./types.js";
import type { AgentStatus } from "./types.js";
import { truncateText } from "./contextFork.js";
import { Mailbox } from "./mailbox.js";
import { AgentRegistry } from "./registry.js";
import { tryParseSubagentResult } from "./resultSchema.js";
import { resultSummary, SubagentResultStore } from "./resultStore.js";

const MAILBOX_CONTENT_MAX_CHARS = 2_000;

export interface FinalizeSubagentInput {
  agentId: string;
  agentPath: string;
  callerPath: string;
  finalText?: string;
  status: AgentStatus;
  cwd?: string;
}

export class SubagentLifecycle {
  readonly resultStore: SubagentResultStore;
  private storesByCwd = new Map<string, SubagentResultStore>();

  constructor(private readonly registry: AgentRegistry, private readonly mailbox: Mailbox, cwd = process.cwd()) {
    this.resultStore = this.resultStoreFor(cwd);
  }

  resultStoreFor(cwd: string): SubagentResultStore {
    const key = cwd;
    let store = this.storesByCwd.get(key);
    if (!store) { store = new SubagentResultStore(key); this.storesByCwd.set(key, store); }
    return store;
  }

  handleFinalText(input: FinalizeSubagentInput): string {
    const text = input.finalText ?? "(agent completed)";
    const parsed = tryParseSubagentResult(text);
    let message = truncateText(text, MAILBOX_CONTENT_MAX_CHARS);
    const agent = this.registry.get(input.agentPath);
    if (parsed.ok && agent) {
      const stored = this.resultStoreFor(input.cwd ?? process.cwd()).save(agent, parsed.result);
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

  enqueueToMailbox(fromAgentId: string, fromPath: string, toPath: string, content: string, kind: "message" | "followup" | "final_result"): void {
    this.mailbox.enqueue({ fromAgentId, fromAgentPath: fromPath, toAgentPath: toPath, content: truncateText(content, MAILBOX_CONTENT_MAX_CHARS), timestamp: Date.now(), kind });
  }
}
