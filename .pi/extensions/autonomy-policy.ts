// Path: .pi/extensions/autonomy-policy.ts
// What: 高度に自律的な実行 policy を pi に追加する拡張機能
// Why: permission bundle と mode と gatekeeper を使って、安全性を保ちながら無人実行に寄せるため
// Related: .pi/lib/autonomy-policy.ts, tests/unit/extensions/autonomy-policy.test.ts, README.md

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  type AutonomyMode,
  type AutonomyPolicyConfig,
  type AutonomyProfile,
  type PermissionDecision,
  type PermissionKey,
  PERMISSION_KEYS,
  applyModeToTools,
  createAutonomyPolicyConfig,
  loadAutonomyPolicyConfig,
  resolveAutonomyDecision,
  saveAutonomyPolicyConfig,
  summarizePolicy,
} from "../lib/autonomy-policy.js";
import {
  createLongRunningReplay,
  formatLongRunningPreflight,
  formatLongRunningReplay,
  loadLatestLongRunningSession,
  loadLongRunningJournal,
  recordLongRunningEvent,
  runLongRunningPreflight,
  runLongRunningSupervisorSweep,
} from "../lib/long-running-supervisor.js";

let isInitialized = false;
let currentConfig: AutonomyPolicyConfig = createAutonomyPolicyConfig();

function refreshStatus(ctx: ExtensionAPI["context"]): void {
  if (!ctx?.hasUI || !ctx.ui?.setStatus) {
    return;
  }

  ctx.ui.setStatus("autonomy-policy", `auto:${currentConfig.mode}/${currentConfig.profile}`);
}

function applyMode(pi: ExtensionAPI): void {
  try {
    const allTools = pi.getAllTools().map((tool) => tool.name);
    pi.setActiveTools(applyModeToTools(allTools, currentConfig.mode));
  } catch {
    // active tools を触れない環境でも tool_call で止める。
  }
}

function persistConfig(next: AutonomyPolicyConfig): AutonomyPolicyConfig {
  currentConfig = saveAutonomyPolicyConfig(next);
  return currentConfig;
}

function setProfile(profile: AutonomyProfile): void {
  const next = createAutonomyPolicyConfig(profile);
  next.mode = currentConfig.mode;
  next.gatekeeper = currentConfig.gatekeeper;
  persistConfig(next);
}

function parseMode(value: unknown): AutonomyMode {
  return value === "plan" ? "plan" : "build";
}

function parsePermissionDecision(value: unknown): PermissionDecision {
  if (value === "ask" || value === "deny") {
    return value;
  }
  return "allow";
}

export default function registerAutonomyPolicy(pi: ExtensionAPI) {
  if (isInitialized) {
    return;
  }
  isInitialized = true;

  pi.on("session_start", async (_event, ctx) => {
    currentConfig = loadAutonomyPolicyConfig(ctx.cwd);
    applyMode(pi);
    refreshStatus(ctx);
    ctx.ui?.notify?.("Autonomy policy loaded", "info");
  });

  pi.on("tool_call", async (event, ctx) => {
    const toolName = typeof event?.toolName === "string" ? event.toolName : "unknown";
    const toolCallId = typeof event === "object" && event !== null && "toolCallId" in event
      ? String((event as { toolCallId?: unknown }).toolCallId ?? "")
      : "";
    const decision = resolveAutonomyDecision(currentConfig, event, ctx.cwd);

    if (decision.finalDecision === "allow") {
      return;
    }

    const reason = decision.matchedPath
      ? `${decision.reason}, path=${decision.matchedPath}`
      : decision.reason;

    recordLongRunningEvent(ctx.cwd, {
      type: "tool_call",
      toolName,
      summary: `autonomy policy blocked tool call: ${toolName}`,
      success: false,
      details: {
        toolCallId,
        finalDecision: decision.finalDecision,
        reason,
      },
    });

    if (decision.finalDecision === "deny") {
      return { block: true, reason };
    }

    if (!ctx.hasUI || !ctx.ui?.confirm) {
      return { block: true, reason: `${reason}, non-interactive session cannot approve ask policy` };
    }

    const approved = await ctx.ui.confirm(
      "Autonomy Policy",
      `${reason}\n\nAllow this tool call?`
    );

    if (!approved) {
      return { block: true, reason: `${reason}, user rejected approval` };
    }

    return;
  });
  pi.on("session_shutdown", async () => {
    isInitialized = false;
  });

  pi.registerCommand("autonomy-policy", {
    description: "Show or change autonomous execution policy",
    handler: async (args, ctx) => {
      const command = (args ?? "").trim().toLowerCase();
      if (!command || command === "show") {
        ctx.ui?.notify?.(summarizePolicy(currentConfig), "info");
        return;
      }

      if (command === "manual" || command === "balanced" || command === "high" || command === "yolo") {
        setProfile(command);
        applyMode(pi);
        refreshStatus(ctx);
        ctx.ui?.notify?.(`Autonomy profile switched to ${command}`, command === "yolo" ? "warning" : "info");
        return;
      }

      if (command === "plan" || command === "build") {
        persistConfig({
          ...currentConfig,
          mode: command,
        });
        applyMode(pi);
        refreshStatus(ctx);
        ctx.ui?.notify?.(`Autonomy mode switched to ${command}`, "info");
        return;
      }

      if (command === "gatekeeper on") {
        persistConfig({
          ...currentConfig,
          gatekeeper: "deterministic",
        });
        refreshStatus(ctx);
        ctx.ui?.notify?.("Gatekeeper enabled", "info");
        return;
      }

      if (command === "gatekeeper off") {
        persistConfig({
          ...currentConfig,
          gatekeeper: "off",
        });
        refreshStatus(ctx);
        ctx.ui?.notify?.("Gatekeeper disabled", "warning");
        return;
      }

      ctx.ui?.notify?.(
        "Usage: /autonomy-policy [show|manual|balanced|high|yolo|build|plan|gatekeeper on|gatekeeper off]",
        "warning"
      );
    },
  });

  pi.registerTool({
    name: "autonomy_policy",
    label: "Autonomy Policy",
    description: "Inspect or update the autonomous execution policy",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("show"),
        Type.Literal("set_profile"),
        Type.Literal("set_mode"),
        Type.Literal("set_permission"),
        Type.Literal("set_gatekeeper"),
        Type.Literal("reset"),
      ]),
      profile: Type.Optional(
        Type.Union([
          Type.Literal("manual"),
          Type.Literal("balanced"),
          Type.Literal("high"),
          Type.Literal("yolo"),
        ])
      ),
      mode: Type.Optional(Type.Union([Type.Literal("build"), Type.Literal("plan")])),
      key: Type.Optional(Type.Union(PERMISSION_KEYS.map((key) => Type.Literal(key)))),
      value: Type.Optional(
        Type.Union([Type.Literal("allow"), Type.Literal("ask"), Type.Literal("deny")])
      ),
      gatekeeper: Type.Optional(Type.Union([Type.Literal("off"), Type.Literal("deterministic")])),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const action = String(params.action);

      if (action === "show") {
        return {
          content: [{ type: "text", text: summarizePolicy(currentConfig) }],
          details: currentConfig,
        };
      }

      if (action === "reset") {
        persistConfig(createAutonomyPolicyConfig());
      } else if (action === "set_profile") {
        const profile = (params.profile ?? "balanced") as AutonomyProfile;
        setProfile(profile);
      } else if (action === "set_mode") {
        persistConfig({
          ...currentConfig,
          mode: parseMode(params.mode),
        });
      } else if (action === "set_gatekeeper") {
        persistConfig({
          ...currentConfig,
          gatekeeper: params.gatekeeper === "off" ? "off" : "deterministic",
        });
      } else if (action === "set_permission") {
        const key = String(params.key) as PermissionKey;
        if (!PERMISSION_KEYS.includes(key)) {
          throw new Error(`Unknown permission key: ${key}`);
        }

        persistConfig({
          ...currentConfig,
          permissions: {
            ...currentConfig.permissions,
            [key]: parsePermissionDecision(params.value),
          },
        });
      }

      applyMode(pi);
      refreshStatus(ctx);

      return {
        content: [{ type: "text", text: summarizePolicy(currentConfig) }],
        details: currentConfig,
      };
    },
  });

  pi.registerTool({
    name: "autonomy_preflight",
    label: "Autonomy Preflight",
    description: "Check whether an unattended run can finish under the current autonomy policy and verification gates.",
    parameters: Type.Object({
      task: Type.Optional(Type.String({ description: "Optional root task summary" })),
      requestedTools: Type.Optional(Type.Array(Type.String({ description: "Optional tool names expected during the run" }))),
      nonInteractive: Type.Optional(Type.Boolean({ description: "Treat ask decisions as blockers" })),
      requireVerification: Type.Optional(Type.Boolean({ description: "Include workspace verification gates" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const report = runLongRunningPreflight({
        cwd: ctx.cwd,
        task: params.task,
        requestedTools: params.requestedTools,
        nonInteractive: params.nonInteractive,
        requireVerification: params.requireVerification,
      });
      return {
        content: [{ type: "text", text: formatLongRunningPreflight(report) }],
        details: report,
      };
    },
  });

  pi.registerTool({
    name: "autonomy_resume",
    label: "Autonomy Resume",
    description: "Show the latest crash-resume state across session journal, checkpoints, verification, and background processes.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const report = createLongRunningReplay(ctx.cwd);
      return {
        content: [{ type: "text", text: formatLongRunningReplay(report) }],
        details: report,
      };
    },
  });

  pi.registerTool({
    name: "autonomy_journal",
    label: "Autonomy Journal",
    description: "Read the latest long-running execution journal entries.",
    parameters: Type.Object({
      maxEntries: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const latest = loadLatestLongRunningSession(ctx.cwd);
      const entries = latest
        ? loadLongRunningJournal(ctx.cwd, latest.id).slice(-(params.maxEntries ?? 20))
        : [];
      const text = entries.length === 0
        ? "No long-running journal entries."
        : entries.map((entry) => `${entry.timestamp} [${entry.type}] ${entry.summary}`).join("\n");
      return {
        content: [{ type: "text", text }],
        details: { count: entries.length, entries },
      };
    },
  });

  pi.registerTool({
    name: "autonomy_supervisor",
    label: "Autonomy Supervisor",
    description: "Inspect or run supervisor recovery for long-running unattended sessions.",
    parameters: Type.Object({
      action: Type.Optional(Type.Union([Type.Literal("status"), Type.Literal("recover")])),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const action = params.action === "recover" ? "recover" : "status";
      const recovery = await runLongRunningSupervisorSweep({
        cwd: ctx.cwd,
        reclaimBackgroundOrphans: action === "recover",
      });
      const lines = [
        `action=${action}`,
        `recovered_session=${recovery.recoveredSessionId ?? "-"}`,
        `background_orphans=${recovery.background.orphanedCount}`,
        `background_reclaimed=${recovery.background.reclaimedCount}`,
        `active_subagent_runs=${recovery.subagents.activeCount}`,
        `recovered_subagent_runs=${recovery.subagents.recoveredCount}`,
      ];
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: recovery,
      };
    },
  });
}
