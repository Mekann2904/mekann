/**
 * path: .pi/extensions/ralph-loop.ts
 * role: Ralph loop を pi-mono ツールとして公開する
 * why: fresh process を反復起動する最小オーケストレーションを repo 内で扱えるようにするため
 * related: .pi/lib/ralph-loop.ts, tests/unit/extensions/ralph-loop.test.ts, package.json, WORKFLOW.md
 *
 * @summary Ralph Loop拡張機能のエントリポイント
 */

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  initRalphLoop,
  inspectRalphLoop,
  runRalphLoop,
  type RalphLoopRuntime,
} from "../lib/ralph-loop.js";

let isInitialized = false;

/**
 * ステータス結果をフォーマットする
 * @param result - inspectRalphLoopの結果
 * @returns フォーマットされた文字列
 */
function formatStatusLines(result: ReturnType<typeof inspectRalphLoop>): string {
  return [
    `runtime: ${result.runtime}`,
    `branch: ${result.activeBranch}`,
    `state_dir: ${result.paths.rootDir}`,
    `prd: ${result.paths.prdPath}`,
    `progress: ${result.paths.progressPath}`,
    `prompt: ${result.paths.promptPath}`,
    `fix_plan: ${result.paths.fixPlanPath}`,
    `specs: ${result.paths.specsDir}`,
    `archive: ${result.paths.archiveDir}`,
    `previous_branch: ${result.previousBranch ?? "-"}`,
    `archived_to: ${result.archivedTo ?? "-"}`,
    `prompt_exists: ${result.promptExists}`,
    `prd_exists: ${result.prdExists}`,
    `progress_exists: ${result.progressExists}`,
    `fix_plan_exists: ${result.fixPlanExists}`,
    `specs_exists: ${result.specsExists}`,
  ].join("\n");
}

/**
 * 実行結果を要約する
 * @param result - runRalphLoopの結果
 * @returns 要約された文字列
 */
function summarizeRun(result: Awaited<ReturnType<typeof runRalphLoop>>): string {
  const lastIteration = result.iterations[result.iterations.length - 1];

  return [
    formatStatusLines(result.status),
    "",
    `completed: ${result.completed}`,
    `stop_reason: ${result.stopReason}`,
    `iterations: ${result.iterations.length}`,
    `last_exit_code: ${lastIteration?.exitCode ?? 0}`,
  ].join("\n");
}

/**
 * 初期化結果をフォーマットする
 * @param result - initRalphLoopの結果
 * @returns フォーマットされた文字列
 */
function formatInitResult(result: ReturnType<typeof initRalphLoop>): string {
  const lines = [
    "Ralph Loop を初期化しました",
    "",
    `state_dir: ${result.paths.rootDir}`,
    `prd: ${result.paths.prdPath} (${result.created.prd ? "作成済み" : "既存"})`,
    `prompt: ${result.paths.promptPath} (${result.created.prompt ? "作成済み" : "既存"})`,
    `progress: ${result.paths.progressPath} (${result.created.progress ? "作成済み" : "既存"})`,
    `fix_plan: ${result.paths.fixPlanPath} (${result.created.fixPlan ? "作成済み" : "既存"})`,
    `specs: ${result.paths.specsDir} (${result.created.specs ? "作成済み" : "既存"})`,
    "",
    result.message,
    "",
    "次のステップ:",
    "1. prd.json を編集してタスクを定義してください",
    "2. fix_plan.md に優先度付きTODOリストを記載してください",
    "3. specs/ ディレクトリに仕様書を配置してください",
    "4. プロンプトファイルを必要に応じてカスタマイズしてください",
    "5. ralph_loop_run でループを開始してください",
  ];

  return lines.join("\n");
}

/**
 * パラメータをランタイム型に変換する
 * @param value - 不明な値
 * @returns RalphLoopRuntime
 */
function toRuntime(value: unknown): RalphLoopRuntime {
  if (value === "amp" || value === "claude") {
    return value;
  }
  return "pi";
}

/**
 * Ralph Loop拡張機能を登録する
 * @param pi - ExtensionAPI
 */
export default function registerRalphLoop(pi: ExtensionAPI): void {
  if (isInitialized) {
    return;
  }
  isInitialized = true;

  // 初期化ツール
  pi.registerTool({
    name: "ralph_loop_init",
    label: "Ralph Loop Initialize",
    description:
      "Initialize Ralph Loop by creating prd.json, prompt file, and progress.txt. Use this before ralph_loop_run.",
    parameters: Type.Object({
      runtime: Type.Optional(
        Type.Union([Type.Literal("pi"), Type.Literal("amp"), Type.Literal("claude")])
      ),
      state_dir: Type.Optional(Type.String()),
      prompt_path: Type.Optional(Type.String()),
      force: Type.Optional(Type.Boolean()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = initRalphLoop({
        cwd: ctx.cwd,
        runtime: toRuntime(params.runtime),
        stateDir: typeof params.state_dir === "string" ? params.state_dir : undefined,
        promptPath: typeof params.prompt_path === "string" ? params.prompt_path : undefined,
        force: params.force === true,
      });

      return {
        content: [{ type: "text", text: formatInitResult(result) }],
        details: result,
      };
    },
  });

  // ステータス確認ツール
  pi.registerTool({
    name: "ralph_loop_status",
    label: "Ralph Loop Status",
    description: "Inspect Ralph loop state files and branch/archive status",
    parameters: Type.Object({
      runtime: Type.Optional(
        Type.Union([Type.Literal("pi"), Type.Literal("amp"), Type.Literal("claude")])
      ),
      state_dir: Type.Optional(Type.String()),
      prompt_path: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const status = inspectRalphLoop({
        cwd: ctx.cwd,
        runtime: toRuntime(params.runtime),
        stateDir: typeof params.state_dir === "string" ? params.state_dir : undefined,
        promptPath: typeof params.prompt_path === "string" ? params.prompt_path : undefined,
      });

      return {
        content: [{ type: "text", text: formatStatusLines(status) }],
        details: status,
      };
    },
  });

  // 実行ツール
  pi.registerTool({
    name: "ralph_loop_run",
    label: "Ralph Loop Run",
    description:
      "Run a Ralph-style fresh-process loop using prd.json, progress.txt, and a runtime-specific prompt file. Requires initialization first (ralph_loop_init).",
    parameters: Type.Object({
      runtime: Type.Optional(
        Type.Union([Type.Literal("pi"), Type.Literal("amp"), Type.Literal("claude")])
      ),
      max_iterations: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
      sleep_ms: Type.Optional(Type.Integer({ minimum: 0, maximum: 60000 })),
      state_dir: Type.Optional(Type.String()),
      prompt_path: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await runRalphLoop({
        cwd: ctx.cwd,
        runtime: toRuntime(params.runtime),
        maxIterations:
          typeof params.max_iterations === "number" ? params.max_iterations : undefined,
        sleepMs: typeof params.sleep_ms === "number" ? params.sleep_ms : undefined,
        stateDir: typeof params.state_dir === "string" ? params.state_dir : undefined,
        promptPath: typeof params.prompt_path === "string" ? params.prompt_path : undefined,
      });

      return {
        content: [{ type: "text", text: summarizeRun(result) }],
        details: result,
      };
    },
  });

  pi.on("session_shutdown", async () => {
    isInitialized = false;
  });
}
