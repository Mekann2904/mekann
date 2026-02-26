/**
 * Extension関連の型定義
 * @module lib/extension-types
 */
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

// Module augmentation to add runSubagent to ExtensionContext
declare module "@mariozechner/pi-coding-agent" {
  interface ExtensionContext {
    /**
     * サブエージェントを実行
     * @param params - サブエージェント実行パラメータ
     * @returns 実行結果
     */
    runSubagent?(params: {
      subagentId: string;
      task: string;
      extraContext?: string;
    }): Promise<{
      status: string;
      summary: string;
      data?: unknown;
      content?: Array<{ type: string; text: string }>;
    }>;
  }
}

export type { ExtensionContext };
/**
 * 実行パラメータ
 * @summary 実行パラメータ定義
 * @param subagentId サブエージェントID
 * @param task タスク内容
 * @param extraContext 追加コンテキスト
 */
export interface ExecuteParams {
  [key: string]: unknown;
}

/**
 * Execute Handlerの更新コールバック
 */
export type ExecuteOnUpdate = (update: string) => void;

/**
 * Execute Handlerの完全なパラメータ
 */
export interface ExecuteHandlerArgs<TParams = ExecuteParams> {
  params: TParams;
  onUpdate: ExecuteOnUpdate;
  ctx: ExtensionContext;
}

/**
 * Execute Handlerの戻り値型
 */
export interface ExecuteResult<T = unknown> {
  status: "success" | "error";
  message?: string;
  data?: T;
}

/**
 * 型安全なExecute Handler型
 */
export type ExecuteHandler<TParams = ExecuteParams, TResult = unknown> = (
  args: ExecuteHandlerArgs<TParams>
) => Promise<ExecuteResult<TResult>> | ExecuteResult<TResult>;
