import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { ROOT_PATH } from "./types.js";
import type { AgentDisplayRef, AgentRuntime, AgentStatus } from "./types.js";
import { extractTextFromContent, truncateText } from "./contextFork.js";
import { Mailbox } from "./mailbox.js";
import { AgentRegistry } from "./registry.js";
import { tryParseSubagentResult } from "./resultSchema.js";
import { resultSummary, SubagentResultStore } from "./resultStore.js";
import type { ChildToParent, SubagentHub } from "./ipc.js";
import { KittyController, type LaunchPiWindowParams } from "./kittyControl.js";

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

export interface RegisterExternalPiRuntimeInput {
  agentId: string;
  agentPath: string;
  callerPath: string;
  socketPath: string;
  display: AgentDisplayRef;
  hub: SubagentHub;
  kitty: KittyController;
  launchParams: LaunchPiWindowParams;
  displayMode: "kitty-pi" | "kitty-split";
  helloTimeoutMs: number;
  onClosed?: (agentId: string) => void;
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

  async registerExternalPiRuntime(input: RegisterExternalPiRuntimeInput): Promise<void> {
    this.setHub(input.agentId, input.hub);
    input.hub.onMessage((m) => this.handleExternalChildMessage(input.callerPath, input.agentPath, m, input.kitty, input.onClosed));
    await input.hub.start();
    this.setRuntime(input.agentPath, { mode: "external_pi", agentId: input.agentId, agentPath: input.agentPath, socketPath: input.socketPath, display: input.display, connected: false });
    try {
      const opened = input.displayMode === "kitty-split"
        ? await input.kitty.launchPiSplit(input.launchParams)
        : await input.kitty.launchPiWindow(input.launchParams);
      this.registry.updateAgent(input.agentPath, { display: opened });
      const rt = this.getRuntime(input.agentPath); if (rt?.mode === "external_pi") rt.display = opened;
      const hello = await input.hub.waitForHello(input.agentId, input.helloTimeoutMs);
      const nextDisplay = { ...this.registry.get(input.agentPath)?.display ?? opened, status: "open" as const, pid: hello.pid };
      this.registry.updateStatus(input.agentPath, "running", { display: nextDisplay });
      const rt2 = this.getRuntime(input.agentPath); if (rt2?.mode === "external_pi") { rt2.connected = true; rt2.pid = hello.pid; rt2.capabilities = hello.capabilities; rt2.display = nextDisplay; }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const failed = { ...this.registry.get(input.agentPath)?.display ?? input.display, status: "failed" as const, error };
      this.registry.updateStatus(input.agentPath, "errored", { display: failed });
      this.registry.close(input.agentPath, "errored");
      try { await input.kitty.close(failed); } catch {}
      try { await input.hub.stop(); } catch {}
      this.deleteHub(input.agentId);
      this.deleteRuntime(input.agentPath);
      input.onClosed?.(input.agentId);
      throw err;
    }
  }

  handleExternalChildMessage(callerPath: string, agentPath: string, msg: ChildToParent, kitty: KittyController, onClosed?: (agentId: string) => void): void {
    const agent = this.registry.get(agentPath); if (!agent) return;
    if (msg.type === "status") {
      this.registry.updateStatus(agentPath, msg.status);
    } else if (msg.type === "final") {
      this.handleFinalText({ agentId: msg.agentId, agentPath, callerPath, finalText: msg.message, status: msg.status, cwd: agent.workspaceCwd ?? process.cwd() });
      void this.autoCloseExternal(agentPath, kitty, onClosed);
    } else if (msg.type === "error") {
      this.registry.updateStatus(agentPath, "errored");
      this.enqueueToMailbox(msg.agentId ?? agent.agentId, agentPath, callerPath, `Agent error: ${msg.message}`, "final_result");
      void this.autoCloseExternal(agentPath, kitty, onClosed);
    } else if (msg.type === "log") {
      this.logDisplay(agent.display, msg.line, kitty);
    }
  }

  async autoCloseExternal(agentPath: string, kitty: KittyController, onClosed?: (agentId: string) => void): Promise<void> {
    const rt = this.getRuntime(agentPath);
    if (rt?.mode !== "external_pi") return;
    const agent = this.registry.get(agentPath);
    const display = agent?.display;
    if (display) {
      try { await kitty.close(display); } catch { /* best-effort */ }
      this.registry.updateAgent(agentPath, { display: { ...display, status: "closed" } });
    }
    try { await this.getHub(rt.agentId)?.stop(); } catch { /* best-effort */ }
    this.deleteHub(rt.agentId);
    onClosed?.(rt.agentId);
    this.deleteRuntime(agentPath);
    this.registry.close(agentPath, agent?.status === "errored" ? "errored" : "completed");
    this.mailbox.appendEvent({ type: "agent_close_end", agentId: rt.agentId, agentPath, timestamp: Date.now() });
  }

  private logDisplay(display: AgentDisplayRef | undefined, line: string, kitty: KittyController): void {
    if (!display || display.status === "closed") return;
    if (display.logPath) void kitty.appendLog(display, line).catch(() => undefined);
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
