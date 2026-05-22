import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { ROOT_PATH } from "./types.js";
import type { AgentRuntime, AgentStatus } from "./types.js";
import { extractTextFromContent, truncateText } from "./contextFork.js";
import { Mailbox } from "./mailbox.js";
import { AgentRegistry } from "./registry.js";
import { tryParseSubagentResult } from "./resultSchema.js";
import { resultSummary, SubagentResultStore } from "./resultStore.js";
import type { SubagentHub } from "./ipc.js";

const MAILBOX_CONTENT_MAX_CHARS = 2_000;

export interface FinalizeSubagentInput {
  agentId: string;
  agentPath: string;
  callerPath: string;
  finalText?: string;
  status: AgentStatus;
  cwd?: string;
}

export interface RegisterInProcessRuntimeInput {
  agentId: string;
  agentPath: string;
  callerPath: string;
  session: AgentSession;
  initialMessage: string;
  cwd: string;
  onSettled?: () => void;
}

export class SubagentLifecycle {
  readonly resultStore: SubagentResultStore;
  private storesByCwd = new Map<string, SubagentResultStore>();
  readonly runtimes = new Map<string, AgentRuntime>();
  readonly childSessions = new Map<string, AgentSession>();
  readonly hubs = new Map<string, SubagentHub>();

  constructor(private readonly registry: AgentRegistry, private readonly mailbox: Mailbox, cwd = process.cwd()) {
    this.resultStore = this.resultStoreFor(cwd);
  }

  resultStoreFor(cwd: string): SubagentResultStore {
    const key = cwd;
    let store = this.storesByCwd.get(key);
    if (!store) { store = new SubagentResultStore(key); this.storesByCwd.set(key, store); }
    return store;
  }

  getRuntime(agentPath: string): AgentRuntime | undefined { return this.runtimes.get(agentPath); }
  setRuntime(agentPath: string, runtime: AgentRuntime): void { this.runtimes.set(agentPath, runtime); }
  deleteRuntime(agentPath: string): void { this.runtimes.delete(agentPath); }
  runtimePaths(): string[] { return [...this.runtimes.keys()]; }
  getRuntimeByAgentId(agentId: string): AgentRuntime | undefined { for (const rt of this.runtimes.values()) if (rt.agentId === agentId) return rt; }

  getChildSession(agentPath: string): AgentSession | undefined { return this.childSessions.get(agentPath); }
  setChildSession(agentPath: string, session: AgentSession): void { this.childSessions.set(agentPath, session); }
  deleteChildSession(agentPath: string): void { this.childSessions.delete(agentPath); }
  childSessionPaths(): string[] { return [...this.childSessions.keys()]; }

  setHub(agentId: string, hub: SubagentHub): void { this.hubs.set(agentId, hub); }
  getHub(agentId: string): SubagentHub | undefined { return this.hubs.get(agentId); }
  deleteHub(agentId: string): void { this.hubs.delete(agentId); }

  registerInProcessRuntime(input: RegisterInProcessRuntimeInput): void {
    const unsubscribe = input.session.subscribe((event) => {
      if (event.type === "agent_start") {
        this.registry.updateStatus(input.agentPath, "running");
      } else if (event.type === "agent_end") {
        const msgs = (event as any).messages as AgentMessage[] | undefined;
        const lastAssistant = msgs?.filter((m) => m.role === "assistant").pop();
        const finalText = lastAssistant ? extractTextFromContent(lastAssistant.content) ?? undefined : undefined;

        this.handleFinalText({ agentId: input.agentId, agentPath: input.agentPath, callerPath: input.callerPath, finalText, status: "completed", cwd: input.cwd });

        this.deleteRuntime(input.agentPath);
        this.deleteChildSession(input.agentPath);
        this.registry.close(input.agentPath, "completed");
        input.onSettled?.();
        unsubscribe();
      }
    });

    this.setRuntime(input.agentPath, { mode: "in_process", agentId: input.agentId, agentPath: input.agentPath, session: input.session });
    this.setChildSession(input.agentPath, input.session);

    void input.session.prompt(input.initialMessage).catch((err: unknown) => {
      this.finalizeWithError(input.agentId, input.agentPath, input.callerPath, err);
      input.onSettled?.();
    });
  }

  finalizeWithError(agentId: string, agentPath: string, callerPath: string, err: unknown): void {
    const errorMessage = err instanceof Error ? err.message : String(err);
    this.registry.updateStatus(agentPath, "errored");
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
    this.deleteRuntime(agentPath);
    this.deleteChildSession(agentPath);
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
