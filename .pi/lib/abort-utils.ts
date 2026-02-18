/**
 * @abdd.meta
 * path: .pi/lib/abort-utils.ts
 * role: AbortSignalの階層管理とリスナー累積の防止ユーティリティ
 * why: 複数の非同期操作が同一のAbortSignalを共有する際に、Node.jsのMaxListenersExceededWarningを回避するため
 * related: .pi/lib/concurrency.ts, .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts
 * public_api: createChildAbortController, createChildAbortControllers
 * invariants:
 * - 返されるcleanup関数を実行すると、親シグナルへのイベントリスナー登録が解除される
 * - 親シグナルが中止状態の場合、生成される子コントローラも即座に中止状態になる
 * side_effects:
 * - 親シグナルに'abort'イベントリスナーを一時的に追加する
 * failure_modes:
 * - cleanup呼び出し忘れによる親シグナルへのリスナー残留（メモリリーク）
 * @abdd.explain
 * overview: 親AbortSignalに連動する子AbortControllerを生成し、リスナーの集中を防ぐモジュール
 * what_it_does:
 * - 親シグナルに連動して中止する単一の子AbortControllerを作成する
 * - 親シグナルに連動する複数の子AbortControllerを一括作成する
 * - 親子間のイベントリスナー接続を解除するcleanup関数を提供する
 * why_it_exists:
 * - 同一のAbortSignalに多数のリスナーを登録すると、MaxListenersExceededWarningが発生するため
 * - 並列実行やサブエージェント管理など、複数の非同期タスクで安全に中止制御を行うため
 * scope:
 * in: 親AbortSignal（省略可）、作成数（createChildAbortControllers）
 * out: AbortControllerインスタンス（または配列）とcleanup関数を持つオブジェクト
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
