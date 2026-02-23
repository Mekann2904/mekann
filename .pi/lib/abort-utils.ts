/**
 * @abdd.meta
 * path: .pi/lib/abort-utils.ts
 * role: AbortController階層管理ユーティリティ
 * why: 複数の非同期操作が同一のAbortSignalを共有する際、`MaxListenersExceededWarning`を防止するため
 * related: .pi/lib/concurrency.ts, .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts
 * public_api: createChildAbortController, createChildAbortControllers
 * invariants: 親シグナルが中止済みの場合、子コントローラは即座に中止状態となる
 * side_effects: 親AbortSignalへのイベントリスナー追加、コントローラの中止実行
 * failure_modes: リスナー解除漏れによるメモリリーク（cleanup未実行時）
 * @abdd.explain
 * overview: 親AbortSignalに連動する子AbortControllerを作成・管理し、イベントリスナー数の爆発を防ぐ
 * what_it_does:
 *   - 親シグナルに連動する単一または複数の子AbortControllerを作成する
 *   - 親シグナルが中止されると、連動する子コントローラを中止する
 *   - 親シグナルへのリスナー登録を解除するクリーンアップ関数を提供する
 *   - 親シグナルが既に中止済みの場合、子コントローラを即座に中止状態にする
 * why_it_exists:
 *   - 多数の非同期処理で親シグナルを直接監視すると、Node.jsのイベントリスナー上限に達するため
 *   - 中止ロジックを共通化し、リソースリークを防ぐため
 * scope:
 *   in: 親AbortSignal（省略可）、作成数（複数の場合）
 *   out: 子AbortController、全リスナー解除と子コントローラ中止を行う関数
 */

// File: .pi/lib/abort-utils.ts
// Description: AbortController utilities for managing abort signal hierarchy.
// Why: Prevents MaxListenersExceededWarning when multiple async operations share the same AbortSignal.
// Related: .pi/lib/concurrency.ts, .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts

/**
 * @summary 親に連動する中止制御
 * @param parentSignal - 親のAbortSignal。省略時は独立動作。
 * @returns 子AbortControllerとクリーンアップ関数
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
