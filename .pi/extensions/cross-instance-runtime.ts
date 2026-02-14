// File: .pi/extensions/cross-instance-runtime.ts
// Description: Integrates cross-instance coordinator with pi lifecycle.
// Why: Enables automatic parallelism adjustment based on active pi instance count.
// Related: .pi/lib/cross-instance-coordinator.ts, .pi/extensions/agent-runtime.ts

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  registerInstance,
  unregisterInstance,
  getCoordinatorStatus,
  getActiveInstanceCount,
  getMyParallelLimit,
  getEnvOverrides,
} from "../lib/cross-instance-coordinator";
import { getRuntimeSnapshot, notifyRuntimeCapacityChanged } from "./agent-runtime";

export default function registerCrossInstanceRuntimeExtension(pi: ExtensionAPI) {
  // Command: Show cross-instance coordinator status
  pi.registerCommand("pi-instances", {
    description: "Show active pi instances and parallelism allocation",
    handler: async (_args, ctx) => {
      const status = getCoordinatorStatus();

      if (!status.registered) {
        ctx.ui.notify("Cross-instance coordinator not initialized.", "warning");
        return;
      }

      const lines: string[] = [
        `Active pi instances: ${status.activeInstanceCount}`,
        `My instance ID: ${status.myInstanceId}`,
        `My parallel limit: ${status.myParallelLimit}`,
        `Total max LLM: ${status.config?.totalMaxLlm ?? "N/A"}`,
        "",
        "Active instances:",
      ];

      for (const inst of status.instances) {
        const isSelf = inst.instanceId === status.myInstanceId;
        const marker = isSelf ? " (self)" : "";
        const age = Math.round((Date.now() - new Date(inst.startedAt).getTime()) / 1000);
        lines.push(`  ${inst.instanceId.slice(0, 20)}... - age: ${age}s${marker}`);
      }

      pi.sendMessage({
        customType: "pi-instances-status",
        content: lines.join("\n"),
        display: true,
        details: status,
      });
    },
  });

  // Tool: Get cross-instance status
  pi.registerTool({
    name: "pi_instance_status",
    label: "PI Instance Status",
    description: "Get current cross-instance coordinator status and parallelism allocation.",
    parameters: {},
    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const status = getCoordinatorStatus();
      const runtime = getRuntimeSnapshot();

      const text = [
        `Cross-Instance Coordinator Status`,
        `================================`,
        ``,
        `Registered: ${status.registered}`,
        `My Instance ID: ${status.myInstanceId ?? "N/A"}`,
        `Active Instances: ${status.activeInstanceCount}`,
        `My Parallel Limit: ${status.myParallelLimit}`,
        ``,
        `Configuration:`,
        `  Total Max LLM: ${status.config?.totalMaxLlm ?? "N/A"}`,
        `  Heartbeat Interval: ${status.config?.heartbeatIntervalMs ?? "N/A"}ms`,
        `  Heartbeat Timeout: ${status.config?.heartbeatTimeoutMs ?? "N/A"}ms`,
        ``,
        `Runtime Snapshot:`,
        `  Max Parallel Subagents: ${runtime.limits.maxParallelSubagentsPerRun}`,
        `  Max Total Active LLM: ${runtime.limits.maxTotalActiveLlm}`,
        `  Current Active Agents: ${runtime.subagentActiveAgents}`,
        `  Current Active Teams: ${runtime.teamActiveRuns}`,
        ``,
        `Environment:`,
        `  PI_TOTAL_MAX_LLM: ${process.env.PI_TOTAL_MAX_LLM ?? "(not set)"}`,
        `  PI_AGENT_MAX_PARALLEL_SUBAGENTS: ${process.env.PI_AGENT_MAX_PARALLEL_SUBAGENTS ?? "(not set)"}`,
      ].join("\n");

      return {
        content: [{ type: "text" as const, text }],
        details: {
          coordinator: status,
          runtime: {
            limits: runtime.limits,
            active: {
              subagentAgents: runtime.subagentActiveAgents,
              teamRuns: runtime.teamActiveRuns,
            },
          },
        },
      };
    },
    renderCall(_args, theme) {
      return new (require("@mariozechner/pi-tui").Text)(
        theme.bold("pi_instance_status"),
        0,
        0
      );
    },
    renderResult(result, _options, theme) {
      const status = result?.details?.coordinator;
      if (!status) {
        return new (require("@mariozechner/pi-tui").Text)(
          theme.fg("warning", "coordinator status unavailable"),
          0,
          0
        );
      }
      const head = status.registered
        ? theme.fg("success", "coordinator active ")
        : theme.fg("warning", "coordinator not initialized ");
      const body = theme.fg(
        "accent",
        `${status.activeInstanceCount} instances, limit: ${status.myParallelLimit}`
      );
      return new (require("@mariozechner/pi-tui").Text)(head + body, 0, 0);
    },
  });

  // Event: Register instance on session start
  pi.on("session_start", async (event, ctx) => {
    const sessionId = event.sessionId ?? ctx.sessionId ?? "unknown";
    const envOverrides = getEnvOverrides();

    registerInstance(sessionId, ctx.cwd, envOverrides);

    const status = getCoordinatorStatus();
    if (status.registered) {
      ctx.ui.notify(
        `Cross-instance coordinator: ${status.activeInstanceCount} pi instance(s), my limit: ${status.myParallelLimit}`,
        "info"
      );
    }

    // Trigger runtime limits refresh
    notifyRuntimeCapacityChanged();
  });

  // Event: Unregister instance on session end (graceful shutdown)
  pi.on("session_end", async (_event, _ctx) => {
    unregisterInstance();
  });

  // Event: Handle process signals for cleanup
  // Note: pi extension API doesn't expose process signal handlers directly,
  // but we can try to cleanup on agent_end as a fallback
  pi.on("agent_end", async (_event, _ctx) => {
    // Update heartbeat periodically
    // The coordinator handles this internally, but we can trigger refresh here
  });

  // Log initialization
  console.error("[cross-instance-runtime] Extension loaded. Use /pi-instances to check status.");
}
