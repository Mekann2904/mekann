/**
 * SubagentSurfaceSync — reactive tool surface visibility.
 *
 * Observes AgentRegistry events and updates Pi's active tool set so
 * that management/result tools appear when subagents are interactive
 * and disappear when all subagents are settled.
 *
 * Previously this logic lived in index.ts's syncSubagentToolSurface().
 * Moving it here keeps tool surface updates in the same locality as
 * lifecycle state changes.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AgentMetadata } from "./types.js";
import type { AgentRegistry } from "./registry.js";
import type { SubagentResultStore } from "./resultStore.js";
import { projectFeatureToolSurface } from "../../settings/toolSurfaceProjection.js";

const DELEGATE_TOOL_NAMES = ["delegate_agent"] as const;
const MANAGEMENT_TOOL_NAMES = ["spawn_agent", "message_agent", "wait_agent", "list_agents", "close_agent"] as const;
const RESULT_TOOL_NAMES = ["agent_results"] as const;

// ─── Pure query functions ────────────────────────────────────────

/**
 * Query whether any agent is in an interactive state (open, queued,
 * pending_init, or running).
 */
export function hasInteractiveSubagentState(agents: AgentMetadata[]): boolean {
  return agents.some(
    (a) =>
      a.agentPath !== "/root" &&
      (a.open ||
        a.status === "queued" ||
        a.status === "pending_init" ||
        a.status === "running"),
  );
}

/**
 * Query whether there are pending structured results in the store.
 */
export function hasPendingResults(resultStore: SubagentResultStore): boolean {
  try {
    return resultStore.list({ status: "pending" }).length > 0;
  } catch {
    return false;
  }
}

// ─── Surface sync ────────────────────────────────────────────────

interface SurfaceSyncSnapshot {
  hasInteractiveState: boolean;
  hasPendingResults: boolean;
}

/**
 * Sync tool surface visibility based on current lifecycle state.
 *
 * This is a pure function of registry state + result store state.
 * It can be called reactively after any state change.
 */
export function syncSubagentToolSurface(
  pi: ExtensionAPI,
  agents: AgentMetadata[],
  resultStore: SubagentResultStore | undefined,
): SurfaceSyncSnapshot {
  const interactive = hasInteractiveSubagentState(agents);
  const pending = resultStore ? hasPendingResults(resultStore) : false;

  projectFeatureToolSurface(pi, "subagent", DELEGATE_TOOL_NAMES, "always", () => true);
  projectFeatureToolSurface(pi, "subagent", MANAGEMENT_TOOL_NAMES, "active", () => interactive);
  projectFeatureToolSurface(pi, "subagent", RESULT_TOOL_NAMES, "active", () => pending);

  return { hasInteractiveState: interactive, hasPendingResults: pending };
}

/**
 * Create a registry subscriber that re-syncs tool surface on every
 * lifecycle event. Returns the unsubscribe function.
 */
export function createSurfaceSyncSubscriber(
  pi: ExtensionAPI,
  registry: AgentRegistry,
  resultStoreForCwd: (cwd: string) => SubagentResultStore,
  getCwd: () => string,
): () => void {
  return registry.subscribe(() => {
    const cwd = getCwd();
    const store = resultStoreForCwd(cwd);
    syncSubagentToolSurface(pi, registry.list(), store);
  });
}
