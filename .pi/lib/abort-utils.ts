/**
 * @abdd.meta
 * path: .pi/lib/abort-utils.ts
 * role: AbortSignal階層管理ユーティリティ
 * why: 複数の非同期処理が同一AbortSignalを共有する際のMaxListenersExceededWarningを防止
 * related: .pi/lib/concurrency.ts, .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts
 * public_api: createChildAbortController, createChildAbortControllers
 * invariants:
 *   - 親シグナルがabort済みの場合、子コントローラは即座にabortされる
 *   - cleanup呼び出し後は親シグナルへのイベントリスナーが削除される
 * side_effects: 親シグナルへabortイベントリスナーを追加する
 * failure_modes:
 *   - cleanup未呼び出しによるリスナー蓄積
 *   - parentSignal(undefined)時はリスナー登録されず独立動作
 * @abdd.explain
 * overview: AbortControllerの階層構造を作成し、親の中断を子へ伝播させるユーティリティ
 * what_it_does:
 *   - 親AbortSignalに連動する子AbortControllerを生成
 *   - 各子コントローラは独自のシグナルを持ち、親へのリスナー蓄積を回避
 *   - 親abort時に子へ伝播、cleanupでリスナー削除
 *   - 複数の子コントローラを一括生成する関数を提供
 * why_it_exists:
 *   - 複数非同期処理が同一AbortSignalを使用するとリスナー過多警告が発生
 *   - 子コントローラパターンでリスナーを分散させ警告を回避
 * scope:
 *   in: AbortSignal(省略可)、生成するコントローラ数
 *   out: 子AbortController配列、cleanup関数
 */

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
