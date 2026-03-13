/**
 * path: .pi/extensions/autoresearch-tbench.ts
 * role: /autoresearch-tbench と tool から terminal-bench 改善ループを実行できるようにする
 * why: pi の中で固定 task 集合に対する autoresearch を直接回し、agent 改善を閉じたループで進めるため
 * related: .pi/lib/autoresearch-tbench.ts, scripts/autoresearch-tbench.ts, scripts/run-terminal-bench.sh, tests/unit/extensions/autoresearch-tbench.test.ts
 */

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import {
  baselineAutoresearchTbench,
  formatAutoresearchTbenchScore,
  getAutoresearchTbenchStatus,
  initAutoresearchTbench,
  requestStopAutoresearchTbench,
  renderAutoresearchTbenchStatus,
  runAutoresearchTbench,
} from "../lib/autoresearch-tbench.js";
import {
  createAutoresearchTbenchLiveMonitor,
  type AutoresearchTbenchLiveSnapshot,
} from "../lib/autoresearch-tbench-live-monitor.js";
import type { LiveMonitorContext } from "../lib/tui-types.js";

let isInitialized = false;

interface ParsedCommand {
  action: "help" | "init" | "baseline" | "run" | "status" | "stop" | "error";
  options: Record<string, string>;
  error?: string;
}

function parseCommand(rawArgs: string): ParsedCommand {
  const trimmed = rawArgs.trim();
  if (!trimmed) {
    return { action: "help", options: {} };
  }

  const tokens = trimmed.split(/\s+/);
  const [actionToken, ...rest] = tokens;
  const action = actionToken.toLowerCase();
  if (!["init", "baseline", "run", "status", "stop", "help"].includes(action)) {
    return {
      action: "error",
      options: {},
      error: `unknown action: ${actionToken}`,
    };
  }

  const options: Record<string, string> = {};
  for (const token of rest) {
    const [key, ...valueParts] = token.split("=");
    if (!key || valueParts.length === 0) {
      return {
        action: "error",
        options: {},
        error: `invalid token: ${token}`,
      };
    }
    options[key.trim()] = valueParts.join("=").trim();
  }

  return {
    action: action as ParsedCommand["action"],
    options,
  };
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  if (value === "1" || value.toLowerCase() === "true") {
    return true;
  }
  if (value === "0" || value.toLowerCase() === "false") {
    return false;
  }
  return undefined;
}

function parseStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const items = value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean);
    return items.length > 0 ? items : undefined;
  }

  if (typeof value === "string") {
    const items = value.split(",").map((entry) => entry.trim()).filter(Boolean);
    return items.length > 0 ? items : undefined;
  }

  return undefined;
}

function parseNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return parsed;
}

function buildHelpText(): string {
  return [
    "Use /autoresearch-tbench init selection=easy=2,medium=2,hard=2 tag=mekann-tbench",
    "Use /autoresearch-tbench baseline label=baseline",
    "Use /autoresearch-tbench run label=try-adaptorch prefer_ms=1200000",
    "Use /autoresearch-tbench stop",
    "Use /autoresearch-tbench status",
    "You can also use /autoresearch as an alias.",
  ].join("\n");
}

function summarizeRun(action: "baseline" | "run", result: Awaited<ReturnType<typeof baselineAutoresearchTbench>>): string {
  return [
    `action=${action}`,
    `outcome=${result.outcome}`,
    `score=${result.score ? formatAutoresearchTbenchScore(result.score) : "no-score"}`,
    `commit=${result.commit}`,
    `job_dir=${result.run.jobDir ?? "-"}`,
    `result_path=${result.run.resultPath ?? "-"}`,
    `log_path=${result.run.artifacts.logPath}`,
  ].join("\n");
}

async function runWithMonitor<T>(
  ctx: ExtensionCommandContext,
  title: string,
  runner: (hooks: {
    onSnapshot: (snapshot: AutoresearchTbenchLiveSnapshot) => void;
    onTextUpdate: (text: string) => void;
  }) => Promise<T>,
): Promise<T> {
  const liveMonitor = createAutoresearchTbenchLiveMonitor(ctx as unknown as LiveMonitorContext, title);

  try {
    return await runner({
      onSnapshot: (snapshot) => {
        ctx.ui?.setStatus?.("autoresearch-tbench", snapshot.statusLine);
        liveMonitor?.update(snapshot);
      },
      onTextUpdate: (text) => {
        ctx.ui?.setStatus?.("autoresearch-tbench", text);
      },
    });
  } finally {
    ctx.ui?.setStatus?.("autoresearch-tbench", undefined);
    liveMonitor?.close();
  }
}

export default function registerAutoresearchTbench(pi: ExtensionAPI): void {
  if (isInitialized) {
    return;
  }
  isInitialized = true;

  const handler = async (args: string, ctx: ExtensionCommandContext) => {
    const parsed = parseCommand(args);
    if (parsed.action === "help") {
      ctx.ui?.notify?.(buildHelpText(), "info");
      return;
    }
    if (parsed.action === "error") {
      ctx.ui?.notify?.(`autoresearch-tbench argument error: ${parsed.error}`, "error");
      return;
    }

    if (parsed.action === "init") {
      const result = await initAutoresearchTbench(ctx.cwd, {
        selection: parsed.options.selection,
        taskNames: parseStringArray(parsed.options.tasks),
        tag: parsed.options.tag,
        git: parseBoolean(parsed.options.git),
        dataset: parsed.options.dataset,
        datasetPath: parsed.options.dataset_path,
        agent: parsed.options.agent,
        agentImportPath: parsed.options.agent_import_path,
        model: parsed.options.model,
        nConcurrent: parseNumber(parsed.options.n_concurrent),
        jobsDir: parsed.options.jobs_dir,
        agentSetupTimeoutMultiplier: parseNumber(parsed.options.agent_setup_timeout_multiplier),
        forceBuild: parseBoolean(parsed.options.force_build) ?? null,
        excludeTaskNames: parseStringArray(parsed.options.exclude_task_names),
      });
      ctx.ui?.notify?.(
        `autoresearch-tbench initialized branch=${result.branchName} tasks=${result.state.runConfig.taskNames.join(",")}`,
        "info",
      );
      return;
    }

    if (parsed.action === "baseline") {
      const result = await runWithMonitor(ctx, "baseline", (hooks) => baselineAutoresearchTbench(ctx.cwd, {
        label: parsed.options.label,
        timeoutMs: parseNumber(parsed.options.timeout_ms),
        preferMs: parseNumber(parsed.options.prefer_ms),
        onSnapshot: hooks.onSnapshot,
        onTextUpdate: hooks.onTextUpdate,
      }));
      ctx.ui?.notify?.(summarizeRun("baseline", result), "info");
      return;
    }

    if (parsed.action === "run") {
      const result = await runWithMonitor(ctx, parsed.options.label ?? "run", (hooks) => runAutoresearchTbench(ctx.cwd, {
        label: parsed.options.label,
        timeoutMs: parseNumber(parsed.options.timeout_ms),
        preferMs: parseNumber(parsed.options.prefer_ms),
        commitMessage: parsed.options.commit_message,
        onSnapshot: hooks.onSnapshot,
        onTextUpdate: hooks.onTextUpdate,
      }));
      ctx.ui?.notify?.(summarizeRun("run", result), "info");
      return;
    }

    if (parsed.action === "stop") {
      const result = requestStopAutoresearchTbench(ctx.cwd);
      ctx.ui?.notify?.(`requested=${result.requested}\nreason=${result.reason}`, "info");
      return;
    }

    const status = await getAutoresearchTbenchStatus(ctx.cwd);
    ctx.ui?.notify?.(renderAutoresearchTbenchStatus(status), "info");
  };

  pi.registerCommand("autoresearch-tbench", {
    description: "Manage terminal-bench autoresearch sessions (init|baseline|run|stop|status)",
    getArgumentCompletions: (prefix: string) => {
      const items = ["init", "baseline", "run", "stop", "status", "help"]
        .filter((entry) => entry.startsWith(prefix))
        .map((entry) => ({ value: entry, label: entry }));
      return items.length > 0 ? items : null;
    },
    handler,
  });

  pi.registerCommand("autoresearch", {
    description: "Alias for terminal-bench autoresearch (init|baseline|run|stop|status)",
    getArgumentCompletions: (prefix: string) => {
      const items = ["init", "baseline", "run", "stop", "status", "help"]
        .filter((entry) => entry.startsWith(prefix))
        .map((entry) => ({ value: entry, label: entry }));
      return items.length > 0 ? items : null;
    },
    handler,
  });

  pi.registerTool({
    name: "autoresearch_tbench",
    label: "Autoresearch Tbench",
    description: "Run terminal-bench autoresearch init/baseline/run/stop/status with a fixed task set per session.",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("init"),
        Type.Literal("baseline"),
        Type.Literal("run"),
        Type.Literal("stop"),
        Type.Literal("status"),
      ]),
      selection: Type.Optional(Type.String()),
      task_names: Type.Optional(Type.Array(Type.String())),
      tag: Type.Optional(Type.String()),
      git: Type.Optional(Type.Boolean()),
      label: Type.Optional(Type.String()),
      timeout_ms: Type.Optional(Type.Number()),
      prefer_ms: Type.Optional(Type.Number()),
      commit_message: Type.Optional(Type.String()),
      dataset: Type.Optional(Type.String()),
      dataset_path: Type.Optional(Type.String()),
      agent: Type.Optional(Type.String()),
      agent_import_path: Type.Optional(Type.String()),
      model: Type.Optional(Type.String()),
      n_concurrent: Type.Optional(Type.Number()),
      jobs_dir: Type.Optional(Type.String()),
      agent_setup_timeout_multiplier: Type.Optional(Type.Number()),
      force_build: Type.Optional(Type.Boolean()),
      exclude_task_names: Type.Optional(Type.Array(Type.String())),
    }),
    async execute(_toolCallId, params, _signal, onUpdate, ctx) {
      const action = String(params.action);

      if (action === "init") {
        const result = await initAutoresearchTbench(ctx.cwd, {
          selection: typeof params.selection === "string" ? params.selection : undefined,
          taskNames: parseStringArray(params.task_names),
          tag: typeof params.tag === "string" ? params.tag : undefined,
          git: typeof params.git === "boolean" ? params.git : undefined,
          dataset: typeof params.dataset === "string" ? params.dataset : undefined,
          datasetPath: typeof params.dataset_path === "string" ? params.dataset_path : undefined,
          agent: typeof params.agent === "string" ? params.agent : undefined,
          agentImportPath: typeof params.agent_import_path === "string" ? params.agent_import_path : undefined,
          model: typeof params.model === "string" ? params.model : undefined,
          nConcurrent: typeof params.n_concurrent === "number" ? params.n_concurrent : undefined,
          jobsDir: typeof params.jobs_dir === "string" ? params.jobs_dir : undefined,
          agentSetupTimeoutMultiplier: typeof params.agent_setup_timeout_multiplier === "number" ? params.agent_setup_timeout_multiplier : undefined,
          forceBuild: typeof params.force_build === "boolean" ? params.force_build : undefined,
          excludeTaskNames: parseStringArray(params.exclude_task_names),
        });

        return {
          content: [{
            type: "text",
            text: `initialized branch=${result.branchName} tasks=${result.state.runConfig.taskNames.join(",")}`,
          }],
          details: result,
        };
      }

      if (action === "baseline") {
        const result = await baselineAutoresearchTbench(ctx.cwd, {
          label: typeof params.label === "string" ? params.label : undefined,
          timeoutMs: typeof params.timeout_ms === "number" ? params.timeout_ms : undefined,
          preferMs: typeof params.prefer_ms === "number" ? params.prefer_ms : undefined,
          onSnapshot: (snapshot) => {
            onUpdate?.({
              content: [{
                type: "text",
                text: `${snapshot.statusLine}\n${snapshot.trials
                  .slice(0, 6)
                  .map((trial) => `${trial.taskName}: ${trial.phase} - ${trial.activity}`)
                  .join("\n")}`,
              }],
              details: snapshot,
            });
          },
        });

        return {
          content: [{ type: "text", text: summarizeRun("baseline", result) }],
          details: result,
        };
      }

      if (action === "run") {
        const result = await runAutoresearchTbench(ctx.cwd, {
          label: typeof params.label === "string" ? params.label : undefined,
          timeoutMs: typeof params.timeout_ms === "number" ? params.timeout_ms : undefined,
          preferMs: typeof params.prefer_ms === "number" ? params.prefer_ms : undefined,
          commitMessage: typeof params.commit_message === "string" ? params.commit_message : undefined,
          onSnapshot: (snapshot) => {
            onUpdate?.({
              content: [{
                type: "text",
                text: `${snapshot.statusLine}\n${snapshot.trials
                  .slice(0, 6)
                  .map((trial) => `${trial.taskName}: ${trial.phase} - ${trial.activity}`)
                  .join("\n")}`,
              }],
              details: snapshot,
            });
          },
        });

        return {
          content: [{ type: "text", text: summarizeRun("run", result) }],
          details: result,
        };
      }

      if (action === "stop") {
        const result = requestStopAutoresearchTbench(ctx.cwd);
        return {
          content: [{ type: "text", text: `requested=${result.requested}\nreason=${result.reason}` }],
          details: result,
        };
      }

      const status = await getAutoresearchTbenchStatus(ctx.cwd);
      return {
        content: [{ type: "text", text: renderAutoresearchTbenchStatus(status) }],
        details: status,
      };
    },
  });

  pi.on("session_shutdown", async () => {
    isInitialized = false;
  });
}
