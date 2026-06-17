/**
 * goal/goalLifecycle.ts — Session and agent lifecycle hook registration.
 *
 * Wires Pi lifecycle events (`session_start`, `session_shutdown`,
 * `agent_start`, `turn_start`, `message_end`, `tool_execution_end`,
 * `turn_end`, `agent_end`) to the `GoalRuntime`, and reconstructs the
 * `GoalStore` from persisted custom entries when a session starts.
 *
 * Shared `store` / `runtime` state is owned by the composition root; this
 * module observes and mutates it through the getters/setters in `deps`.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { GoalStore, type GoalStateEntry } from "./state.js";
import { GoalRuntime } from "./runtime.js";
import { recordGoalAction } from "./goalEvents.js";
import type { GoalAction } from "./context-events.js";

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface GoalLifecycleDeps {
  pi: ExtensionAPI;
  /** Live access to the shared store owned by the composition root. */
  getStore(): GoalStore | null;
  /** Live access to the shared runtime owned by the composition root. */
  getRuntime(): GoalRuntime | null;
  /** Replace the shared store (e.g. on session_start / shutdown). */
  setStore(store: GoalStore | null): void;
  /** Replace the shared runtime (e.g. on session_start / shutdown). */
  setRuntime(runtime: GoalRuntime | null): void;
  /** Whether the goal feature is enabled for the given context. */
  isEnabled(ctx: ExtensionContext): boolean;
  /** Persist a goal state entry (delegates to `pi.appendEntry`). */
  persist(entry: GoalStateEntry): void;
  /** Custom-entry type used for persisted goal state (e.g. "goal-state"). */
  customType: string;
  /** Recompute tool surface exposure without touching the UI. */
  syncToolSurface(): void;
  /** Refresh the TUI widget for the current goal. */
  updateWidget(ctx: ExtensionContext): void;
  /** Resolve the configured objective-length limit for the reconstructed store. */
  getMaxObjectiveLength(): number;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register all session/agent lifecycle hooks for the goal feature.
 *
 * On `session_start` the persisted goal entries are replayed (branch is
 * leaf→root, so it is reversed for chronological replay) into a fresh
 * `GoalStore`, and a `GoalRuntime` is constructed with a callback that records
 * runtime-emitted events (e.g. budget exhaustion) to the ledger.
 */
export function registerGoalLifecycle(deps: GoalLifecycleDeps): void {
  const { pi } = deps;

  // ─── Session lifecycle ────────────────────────────────────────

  pi.on("session_start", async (_event, ctx: ExtensionContext) => {
    if (!deps.isEnabled(ctx)) {
      deps.setStore(null);
      deps.setRuntime(null);
      ctx.ui.setWidget("goal", undefined);
      return;
    }

    // Reconstruct from session custom entries
    const branch = ctx.sessionManager.getBranch();
    const goalEntries: GoalStateEntry[] = [];
    // branch is leaf→root; reverse for chronological (root→leaf) replay
    for (let i = branch.length - 1; i >= 0; i--) {
      const entry = branch[i];
      if (entry.type === "custom" && entry.customType === deps.customType) {
        goalEntries.push(entry.data as GoalStateEntry);
      }
    }

    const store = GoalStore.fromEntries(goalEntries, deps.persist, deps.getMaxObjectiveLength());
    const runtime = new GoalRuntime(store, pi, (action, goal) => {
      recordGoalAction({
        action: action as GoalAction,
        goal,
        source: "runtime",
        ctx,
      });
    });
    deps.setStore(store);
    deps.setRuntime(runtime);

    runtime.onSessionStart(ctx);
    deps.updateWidget(ctx);
  });

  pi.on("session_shutdown", async () => {
    deps.getRuntime()?.onSessionShutdown();
    deps.setStore(null);
    deps.setRuntime(null);
    deps.syncToolSurface();
  });

  // ─── Agent lifecycle ──────────────────────────────────────────

  pi.on("agent_start", async () => {
    deps.getRuntime()?.onAgentStart();
  });

  pi.on("turn_start", async (event, ctx) => {
    deps.getRuntime()?.onTurnStart(event, ctx);
  });

  pi.on("message_end", async (event, ctx) => {
    deps.getRuntime()?.onMessageEnd(event, ctx);
    deps.updateWidget(ctx);
  });

  pi.on("tool_execution_end", async (event, ctx) => {
    deps.getRuntime()?.onToolExecutionEnd(event, ctx);
    deps.updateWidget(ctx);
  });

  pi.on("turn_end", async (event, ctx) => {
    deps.getRuntime()?.onTurnEnd(event, ctx);
    deps.updateWidget(ctx);
  });

  pi.on("agent_end", async (event, ctx) => {
    const runtime = deps.getRuntime();
    const store = deps.getStore();
    runtime?.onAgentEnd(event, ctx);
    deps.updateWidget(ctx);
    // Consider idle continuation after agent finishes
    if (runtime && store) {
      runtime.maybeContinueIfIdle(ctx);
    }
  });
}
