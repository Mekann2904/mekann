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

import type {
  CustomEntry,
  ExtensionAPI,
  ExtensionContext,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
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
// Replay helpers
// ---------------------------------------------------------------------------

/**
 * Collect goal-state custom entries from a session branch in chronological
 * (oldest→newest) order, independent of the array order returned by
 * `SessionManager.getBranch()`.
 *
 * Order source: every `SessionEntry` carries a `timestamp` (ISO-8601 UTC via
 * `new Date().toISOString()`, stamped by the SDK at append time — see
 * `SessionEntryBase.timestamp`). That timestamp is an inherent property of the
 * persisted entry, so sorting on it reconstructs chronological order without
 * trusting the branch array's traversal direction. `toISOString()` output is
 * fixed-width (`YYYY-MM-DDTHH:mm:ss.sssZ`), so plain lexicographic comparison
 * equals chronological order. The entry `id` is a random UUID prefix from pi's
 * `generateId`, not monotonic, so it cannot establish order.
 *
 * Why not rely on the array order? `SessionManager.getBranch()` currently
 * returns the path in root→leaf (chronological) order, but that direction is
 * not part of its typed contract and the SDK could change it. The previous
 * replay code assumed a fixed direction and iterated in reverse, which would
 * silently replay in the wrong order if the assumption broke. Sorting by
 * `timestamp` removes that coupling entirely.
 *
 * Goal-state entries are appended at distinct times (user actions / message
 * boundaries), so equal timestamps are not expected in practice; the stable
 * sort keeps any equal-timestamp entries in their relative input order.
 *
 * Design: ADR-0028 (IC-216). Long-term SDK guarantee (documented branch
 * ordering or a dedicated chronological accessor):
 * https://github.com/Mekann2904/mekann/issues/180.
 */
export function collectGoalEntriesChronologically(
  branch: readonly SessionEntry[],
  customType: string,
): GoalStateEntry[] {
  const goalEntries = branch.filter(
    (entry): entry is CustomEntry =>
      entry.type === "custom" && entry.customType === customType,
  );
  // Sort oldest-first by ISO-8601 timestamp. `timestamp` is a required string
  // stamped at append time, and `toISOString()` is fixed-width, so lexical
  // compare equals chronological order. Stable sort preserves input order for
  // the (unexpected) case of equal timestamps.
  goalEntries.sort((a, b) =>
    a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0,
  );
  return goalEntries.map((entry) => entry.data as GoalStateEntry);
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register all session/agent lifecycle hooks for the goal feature.
 *
 * On `session_start` the persisted goal entries are replayed into a fresh
 * `GoalStore` in chronological order. Replay is order-independent: entries are
 * sorted by the pi-level entry `timestamp` rather than relying on the array
 * order returned by `SessionManager.getBranch()` (see
 * `collectGoalEntriesChronologically` and ADR-0028 / IC-216). A `GoalRuntime`
 * is then constructed with a callback that records runtime-emitted events
 * (e.g. budget exhaustion) to the ledger.
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

    // Reconstruct the goal store from persisted custom entries. Replay order
    // is derived from each entry's own pi-level `timestamp`, so it is correct
    // regardless of the array order returned by getBranch().
    const branch = ctx.sessionManager.getBranch();
    const goalEntries = collectGoalEntriesChronologically(branch, deps.customType);

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
