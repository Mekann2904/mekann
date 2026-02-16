// File: .pi/lib/abort-utils.ts
// Description: AbortController utilities for managing abort signal hierarchy.
// Why: Prevents MaxListenersExceededWarning when multiple async operations share the same AbortSignal.
// Related: .pi/lib/concurrency.ts, .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts

/**
 * Creates a child AbortController that aborts when the parent signal aborts.
 * Each child has its own signal, preventing listener accumulation on the parent.
 *
 * @param parentSignal - Optional parent signal to link to
 * @returns Child AbortController and cleanup function
 *
 * @example
 * ```typescript
 * const { controller, cleanup } = createChildAbortController(parentSignal);
 * try {
 *   await doWork(controller.signal);
 * } finally {
 *   cleanup();
 * }
 * ```
 */
export function createChildAbortController(
  parentSignal?: AbortSignal,
): { controller: AbortController; cleanup: () => void } {
  const controller = new AbortController();

  if (!parentSignal) {
    return { controller, cleanup: () => {} };
  }

  // Already aborted - abort child immediately
  if (parentSignal.aborted) {
    controller.abort();
    return { controller, cleanup: () => {} };
  }

  // Link parent abort to child
  const onParentAbort = () => controller.abort();
  parentSignal.addEventListener("abort", onParentAbort, { once: true });

  const cleanup = () => {
    parentSignal.removeEventListener("abort", onParentAbort);
  };

  return { controller, cleanup };
}

/**
 * Creates multiple child AbortControllers from a single parent signal.
 * Useful for parallel execution where each worker needs its own signal.
 *
 * @param count - Number of child controllers to create
 * @param parentSignal - Optional parent signal to link to
 * @returns Array of child controllers and a single cleanup function
 *
 * @example
 * ```typescript
 * const { controllers, cleanup } = createChildAbortControllers(10, parentSignal);
 * try {
 *   await Promise.all(controllers.map((c, i) => doWork(c.signal, i)));
 * } finally {
 *   cleanup();
 * }
 * ```
 */
export function createChildAbortControllers(
  count: number,
  parentSignal?: AbortSignal,
): { controllers: AbortController[]; cleanup: () => void } {
  const controllers: AbortController[] = [];
  const cleanups: (() => void)[] = [];

  for (let i = 0; i < count; i++) {
    const { controller, cleanup } = createChildAbortController(parentSignal);
    controllers.push(controller);
    cleanups.push(cleanup);
  }

  return {
    controllers,
    cleanup: () => {
      for (const fn of cleanups) fn();
    },
  };
}
