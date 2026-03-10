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
  type RalphLoopMode,
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
    `mode: ${result.mode}`,
    `branch: ${result.activeBranch}`,
    `state_dir: ${result.paths.rootDir}`,
    `prd: ${result.paths.prdPath}`,
    `progress: ${result.paths.progressPath}`,
    `prompt: ${result.paths.promptPath}`,
    `prompt_plan: ${result.paths.promptPlanPath}`,
    `prompt_build: ${result.paths.promptBuildPath}`,
    `prompt_plan_work: ${result.paths.promptPlanWorkPath}`,
    `implementation_plan: ${result.paths.implementationPlanPath}`,
    `specs: ${result.paths.specsDir}`,
    `agents_md: ${result.paths.agentMdPath}`,
    `archive: ${result.paths.archiveDir}`,
    `previous_branch: ${result.previousBranch ?? "-"}`,
    `archived_to: ${result.archivedTo ?? "-"}`,
    `prompt_exists: ${result.promptExists}`,
    `prompt_plan_exists: ${result.promptPlanExists}`,
    `prompt_build_exists: ${result.promptBuildExists}`,
    `prompt_plan_work_exists: ${result.promptPlanWorkExists}`,
    `prd_exists: ${result.prdExists}`,
    `progress_exists: ${result.progressExists}`,
    `implementation_plan_exists: ${result.implementationPlanExists}`,
    `agents_md_exists: ${result.agentMdExists}`,
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
    `run_mode: ${result.mode}`,
    `prompt_used: ${result.promptPathUsed}`,
    `work_scope: ${result.workScope ?? "-"}`,
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
    `prompt_plan: ${result.paths.promptPlanPath} (${result.created.promptPlan ? "作成済み" : "既存"})`,
    `prompt_build: ${result.paths.promptBuildPath} (${result.created.promptBuild ? "作成済み" : "既存"})`,
    `prompt_plan_work: ${result.paths.promptPlanWorkPath} (${result.created.promptPlanWork ? "作成済み" : "既存"})`,
    `progress: ${result.paths.progressPath} (${result.created.progress ? "作成済み" : "既存"})`,
    `implementation_plan: ${result.paths.implementationPlanPath} (${result.created.implementationPlan ? "作成済み" : "既存"})`,
    `agents_md: ${result.paths.agentMdPath} (${result.created.agentMd ? "作成済み" : "既存"})`,
    `specs: ${result.paths.specsDir} (${result.created.specs ? "作成済み" : "既存"})`,
    "",
    result.message,
    "",
    "次のステップ:",
    "1. .pi/ralph/specs/ に仕様書を置いてください",
    "2. PROMPT_plan.md で計画を作ってください",
    "3. IMPLEMENTATION_PLAN.md を確認してください",
    "4. PROMPT_build.md で実装ループを回してください",
    "5. 必要なら plan-work で scoped planning を使ってください",
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

function toMode(value: unknown): RalphLoopMode {
  if (value === "plan" || value === "plan-work") {
    return value;
  }
  return "build";
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
      "Initialize Ralph Loop by creating prd.json, PROMPT_plan/build files, IMPLEMENTATION_PLAN.md, AGENTS.md, and progress.txt. Use this before ralph_loop_run.",
    parameters: Type.Object({
      runtime: Type.Optional(
        Type.Union([Type.Literal("pi"), Type.Literal("amp"), Type.Literal("claude")])
      ),
      mode: Type.Optional(
        Type.Union([Type.Literal("build"), Type.Literal("plan"), Type.Literal("plan-work")])
      ),
      state_dir: Type.Optional(Type.String()),
      prompt_path: Type.Optional(Type.String()),
      force: Type.Optional(Type.Boolean()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = initRalphLoop({
        cwd: ctx.cwd,
        runtime: toRuntime(params.runtime),
        mode: toMode(params.mode),
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
      mode: Type.Optional(
        Type.Union([Type.Literal("build"), Type.Literal("plan"), Type.Literal("plan-work")])
      ),
      state_dir: Type.Optional(Type.String()),
      prompt_path: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const status = inspectRalphLoop({
        cwd: ctx.cwd,
        runtime: toRuntime(params.runtime),
        mode: toMode(params.mode),
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
      "Run a Ralph-style fresh-process loop using prd.json, PROMPT_plan/build files, IMPLEMENTATION_PLAN.md, and progress.txt. Requires initialization first (ralph_loop_init).",
    parameters: Type.Object({
      runtime: Type.Optional(
        Type.Union([Type.Literal("pi"), Type.Literal("amp"), Type.Literal("claude")])
      ),
      mode: Type.Optional(
        Type.Union([Type.Literal("build"), Type.Literal("plan"), Type.Literal("plan-work")])
      ),
      work_scope: Type.Optional(Type.String()),
      max_iterations: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
      sleep_ms: Type.Optional(Type.Integer({ minimum: 0, maximum: 60000 })),
      state_dir: Type.Optional(Type.String()),
      prompt_path: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await runRalphLoop({
        cwd: ctx.cwd,
        runtime: toRuntime(params.runtime),
        mode: toMode(params.mode),
        workScope: typeof params.work_scope === "string" ? params.work_scope : undefined,
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
