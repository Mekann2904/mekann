/**
 * RuntimeStore — CRUD for in-memory runtime state: agents, sessions, hubs.
 *
 * Pure data store with no business logic. Hides the three internal Maps
 * behind a typed interface.
 */

import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { AgentRuntime } from "./types.js";
import type { SubagentHub } from "./ipc.js";

export interface RuntimeStoreMaps {
  runtimes: Map<string, AgentRuntime>;
  childSessions: Map<string, AgentSession>;
  hubs: Map<string, SubagentHub>;
}

export class RuntimeStore {
  readonly runtimes = new Map<string, AgentRuntime>();
  readonly childSessions = new Map<string, AgentSession>();
  readonly hubs = new Map<string, SubagentHub>();

  // runtime

  getRuntime(agentPath: string): AgentRuntime | undefined {
    return this.runtimes.get(agentPath);
  }

  setRuntime(agentPath: string, runtime: AgentRuntime): void {
    this.runtimes.set(agentPath, runtime);
  }

  deleteRuntime(agentPath: string): void {
    this.runtimes.delete(agentPath);
  }

  runtimePaths(): string[] {
    return [...this.runtimes.keys()];
  }

  mapsForCompatibility(): RuntimeStoreMaps {
    return {
      runtimes: this.runtimes,
      childSessions: this.childSessions,
      hubs: this.hubs,
    };
  }

  getRuntimeByAgentId(agentId: string): AgentRuntime | undefined {
    for (const rt of this.runtimes.values()) {
      if (rt.agentId === agentId) return rt;
    }
    return undefined;
  }

  // child sessions

  getChildSession(agentPath: string): AgentSession | undefined {
    return this.childSessions.get(agentPath);
  }

  setChildSession(agentPath: string, session: AgentSession): void {
    this.childSessions.set(agentPath, session);
  }

  deleteChildSession(agentPath: string): void {
    this.childSessions.delete(agentPath);
  }

  childSessionPaths(): string[] {
    return [...this.childSessions.keys()];
  }

  // hubs

  setHub(agentId: string, hub: SubagentHub): void {
    this.hubs.set(agentId, hub);
  }

  getHub(agentId: string): SubagentHub | undefined {
    return this.hubs.get(agentId);
  }

  deleteHub(agentId: string): void {
    this.hubs.delete(agentId);
  }
}
