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
    currentConfig = loadAutonomyPolicyConfig();
    applyMode(pi);
    refreshStatus(ctx);
    ctx.ui?.notify?.("Autonomy policy loaded", "info");
  });

  pi.on("tool_call", async (event, ctx) => {
    const decision = resolveAutonomyDecision(currentConfig, event);
    if (decision.finalDecision === "allow") {
      return;
    }

    const reason = decision.matchedPath
      ? `${decision.reason}, path=${decision.matchedPath}`
      : decision.reason;

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
}
