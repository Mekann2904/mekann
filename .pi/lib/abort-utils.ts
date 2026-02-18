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
  * 親シグナルに連動する複数の子コントローラを作成
  * @param count 作成するコントローラの数
  * @param parentSignal 親のAbortSignal（省略可）
  * @returns controllers: コントローラの配列, cleanup: 全てのコントローラを中止する関数
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
