/**
 * path: .pi/extensions/ralph-loop.ts
 * role: Ralph loop を pi-mono ツールとして公開する
 * why: fresh process を反復起動する最小オーケストレーションを repo 内で扱えるようにするため
 * related: .pi/lib/ralph-loop.ts, tests/unit/extensions/ralph-loop.test.ts, package.json, WORKFLOW.md
 */

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  inspectRalphLoop,
  runRalphLoop,
  type RalphLoopRuntime,
} from "../lib/ralph-loop.js";

let isInitialized = false;

function formatStatusLines(result: ReturnType<typeof inspectRalphLoop>): string {
  return [
    `runtime: ${result.runtime}`,
    `branch: ${result.activeBranch}`,
    `state_dir: ${result.paths.rootDir}`,
    `prd: ${result.paths.prdPath}`,
    `progress: ${result.paths.progressPath}`,
    `prompt: ${result.paths.promptPath}`,
    `archive: ${result.paths.archiveDir}`,
    `previous_branch: ${result.previousBranch ?? "-"}`,
    `archived_to: ${result.archivedTo ?? "-"}`,
    `prompt_exists: ${result.promptExists}`,
    `prd_exists: ${result.prdExists}`,
    `progress_exists: ${result.progressExists}`,
  ].join("\n");
}

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

function toRuntime(value: unknown): RalphLoopRuntime {
  if (value === "amp" || value === "claude") {
    return value;
  }
  return "pi";
}

export default function registerRalphLoop(pi: ExtensionAPI): void {
  if (isInitialized) {
    return;
  }
  isInitialized = true;

  pi.registerTool({
    name: "ralph_loop_status",
    label: "Ralph Loop Status",
    description: "Inspect Ralph loop state files and branch/archive status",
    parameters: Type.Object({
      runtime: Type.Optional(Type.Union([
        Type.Literal("pi"),
        Type.Literal("amp"),
        Type.Literal("claude"),
      ])),
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

  pi.registerTool({
    name: "ralph_loop_run",
    label: "Ralph Loop Run",
    description: "Run a Ralph-style fresh-process loop using prd.json, progress.txt, and a runtime-specific prompt file",
    parameters: Type.Object({
      runtime: Type.Optional(Type.Union([
        Type.Literal("pi"),
        Type.Literal("amp"),
        Type.Literal("claude"),
      ])),
      max_iterations: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
      sleep_ms: Type.Optional(Type.Integer({ minimum: 0, maximum: 60000 })),
      state_dir: Type.Optional(Type.String()),
      prompt_path: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await runRalphLoop({
        cwd: ctx.cwd,
        runtime: toRuntime(params.runtime),
        maxIterations: typeof params.max_iterations === "number" ? params.max_iterations : undefined,
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
