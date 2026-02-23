/**
 * @abdd.meta
 * path: .pi/extensions/cross-instance-runtime.ts
 * role: クロスインスタンス協調とレート制御のランタイム拡張
 * why: 複数のPIインスタンス間でリソースを競合させず、並列処理数とAPIレート制限を動的に調整するため
 * related: .pi/lib/cross-instance-coordinator.ts, .pi/lib/adaptive-rate-controller.ts, .pi/lib/provider-limits.ts
 * public_api: registerCrossInstanceRuntimeExtension
 * invariants: アダプティブコントローラーの初期化は初回セッション開始まで遅延される
 * side_effects: インスタンス登録解除、レート制限状態のファイル永続化、容量変更通知の発火
 * failure_modes: コーディネーター初期化失敗、ファイルI/Oロック、インスタンスID競合
 * @abdd.explain
 * overview: 複数のPIプロセスが同時に実行される環境において、インスタンス数と負荷に応じて並列性を制御し、API制限（429等）を回避する機能を拡張APIとして登録する。
 * what_it_does:
 *   - インスタンスの登録・登録解除と並列制限の配布管理
 *   - API呼び出し結果（成功/429）に基づく動的レート制御
 *   - 容量変動時のランタイム通知
 *   - 現在のインスタンス状態とモデル使用状況の表示
 * why_it_exists:
 *   - 複数インスタンスからのAPIアクセスがプロバイダ制限を超過することを防ぐため
 *   - システム全体のスループットを維持しつつプロバイダの制約を遵守するため
 *   - 起動時の同期I/Oを回避しパフォーマンスを向上させるため
 * scope:
 *   in: ExtensionAPI, ランタイムスナップショット, ユーザーコマンド
 *   out: UI通知, インスタンスステータス表示, アダプティブ制御パラメータの更新
 */

// File: .pi/extensions/cross-instance-runtime.ts
// Description: Integrates cross-instance coordinator with pi lifecycle.
// Why: Enables automatic parallelism adjustment based on active pi instance count.
// Related: .pi/lib/cross-instance-coordinator.ts, .pi/lib/provider-limits.ts, .pi/lib/adaptive-rate-controller.ts

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

import {
  initAdaptiveController,
  shutdownAdaptiveController,
  getEffectiveLimit,
  record429,
  recordSuccess,
  isRateLimitError,
  getLearnedLimit,
  resetLearnedLimit,
  resetAllLearnedLimits,
  formatAdaptiveSummary,
} from "../lib/adaptive-rate-controller";
import {
  registerInstance,
  unregisterInstance,
  getCoordinatorStatus,
  getActiveInstanceCount,
  getContendingInstanceCount,
  getMyParallelLimit,
  getEnvOverrides,
  setActiveModel,
  clearActiveModel,
  getModelParallelLimit,
  getModelUsageSummary,
} from "../lib/cross-instance-coordinator";
import {
  resolveLimits,
  getConcurrencyLimit,
  formatLimitsSummary,
  listProviders,
  detectTier,
} from "../lib/provider-limits";

import { getRuntimeSnapshot, notifyRuntimeCapacityChanged } from "./agent-runtime";
import { getAdaptiveTotalLimitSnapshot, resetAdaptiveTotalLimitState } from "../lib/adaptive-total-limit";

/**
 * クロスインスタンスランタイム拡張を登録
 * @summary ランタイム拡張登録
 * @param pi 拡張APIインスタンス
 */
// Lazy initialization flag for adaptive controller
let adaptiveControllerInitialized = false;

/**
 * Ensure adaptive controller is initialized (lazy on first session start).
 * This defers file I/O from extension load time to first actual use.
 */
function ensureAdaptiveControllerInitialized(): void {
  if (adaptiveControllerInitialized) return;
  adaptiveControllerInitialized = true;
  initAdaptiveController();
}

/**
 * 拡張機能を登録
 * @summary 機能登録
 * @param pi 拡張APIインスタンス
 */
export default function registerCrossInstanceRuntimeExtension(pi: ExtensionAPI) {
  // NOTE: Adaptive controller initialization is deferred to session_start event
  // to improve startup performance. Previously this was called synchronously
  // at extension load time, causing blocking file I/O.

  // Command: Show cross-instance coordinator status
  pi.registerCommand("pi-instances", {
    description: "Show active pi instances and parallelism allocation",
    handler: async (_args, ctx) => {
      const status = getCoordinatorStatus();
      const modelUsage = getModelUsageSummary();

      if (!status.registered) {
        ctx.ui.notify("Cross-instance coordinator not initialized.", "warning");
        return;
      }

      const lines: string[] = [
        `Active pi instances (sessions): ${status.activeInstanceCount}`,
        `Contending instances (with runtime load): ${status.contendingInstanceCount}`,
        `My instance ID: ${status.myInstanceId}`,
        `My parallel limit: ${status.myParallelLimit}`,
        `Total max LLM: ${status.config?.totalMaxLlm ?? "N/A"}`,
        "",
        "Notes:",
        "  - agent_team member child runs use --no-extensions and are NOT counted as pi instances.",
        "  - parallel limit is distributed by contending instances (active load), not all idle sessions.",
        "",
        "Model usage across instances:",
      ];

      if (modelUsage.models.length === 0) {
        lines.push("  (no models active)");
      } else {
        for (const m of modelUsage.models) {
          lines.push(`  ${m.provider}/${m.model}: ${m.instanceCount} instance(s)`);
        }
      }

      lines.push("");
      lines.push("Active instances:");
      for (const inst of status.instances) {
        const isSelf = inst.instanceId === status.myInstanceId;
        const marker = isSelf ? " (self)" : "";
        const age = Math.round((Date.now() - new Date(inst.startedAt).getTime()) / 1000);
        const models = inst.activeModels.map((m) => m.model).join(", ") || "(none)";
        const activeRequests = Math.max(0, Math.trunc(inst.activeRequestCount || 0));
        const activeLlm = Math.max(0, Math.trunc(inst.activeLlmCount || 0));
        const pending = Math.max(0, Math.trunc(inst.pendingTaskCount || 0));
        const contending = activeRequests > 0 || activeLlm > 0 || pending > 0 || inst.activeModels.length > 0;
        const stateLabel = contending ? "busy" : "idle";
        lines.push(
          `  ${inst.instanceId.slice(0, 20)}... - age: ${age}s, models: ${models}, runtime(req=${activeRequests}, llm=${activeLlm}, pending=${pending}), state=${stateLabel}${marker}`,
        );
      }

      pi.sendMessage({
        customType: "pi-instances-status",
        content: lines.join("\n"),
        display: true,
        details: { status, modelUsage },
      });
    },
  });

  // Command: Show provider limits
  pi.registerCommand("pi-limits", {
    description: "Show provider/model rate limits",
    handler: async (args, ctx) => {
      // Ensure adaptive controller is initialized before accessing its state
      ensureAdaptiveControllerInitialized();

      const providers = listProviders();
      const lines: string[] = ["Provider Limits", "===============", ""];

      const targetProvider = args?.trim().toLowerCase();
      const targetModel = process.env.PI_CURRENT_MODEL?.toLowerCase();

      for (const provider of providers) {
        if (targetProvider && provider !== targetProvider) continue;

        lines.push(`${provider}:`);

        const providerConfig = resolveLimits(provider, "*", undefined);
        if (providerConfig.source === "default") {
          lines.push("  (unknown models)");
          continue;
        }

        // Show resolved limit for current model if available
        if (targetModel) {
          const resolved = resolveLimits(provider, targetModel, detectTier(provider, targetModel));
          lines.push(`  Current (${targetModel}): ${formatLimitsSummary(resolved)}`);
        }

        lines.push("");
      }

      // Show adaptive state
      lines.push("Adaptive Learning");
      lines.push("=================");
      lines.push(formatAdaptiveSummary());
      const totalLimit = getAdaptiveTotalLimitSnapshot();
      lines.push("");
      lines.push("Adaptive Total Max LLM");
      lines.push("======================");
      lines.push(`enabled: ${totalLimit.enabled}`);
      lines.push(`base_limit: ${totalLimit.baseLimit}`);
      lines.push(`learned_limit: ${totalLimit.learnedLimit}`);
      lines.push(`sample_count: ${totalLimit.sampleCount}`);
      lines.push(`last_reason: ${totalLimit.lastReason}`);

      pi.sendMessage({
        customType: "pi-limits-info",
        content: lines.join("\n"),
        display: true,
      });
    },
  });

  // Command: Reset learned limits
  pi.registerCommand("pi-limits-reset", {
    description: "Reset learned rate limits (/pi-limits-reset <provider> <model> | /pi-limits-reset all)",
    handler: async (args, ctx) => {
      const parts = (args || "").trim().split(/\s+/);
      if (parts.length === 1 && parts[0] === "all") {
        resetAllLearnedLimits();
        const total = resetAdaptiveTotalLimitState();
        ctx.ui.notify(
          `Reset all learned limits (adaptive-total learned=${total.learnedLimit}, base=${total.baseLimit})`,
          "info",
        );
        return;
      }
      const provider = parts[0];
      const model = parts[1];

      if (provider && model) {
        resetLearnedLimit(provider, model);
        ctx.ui.notify(`Reset learned limits for ${provider}/${model}`, "info");
      } else {
        ctx.ui.notify("Usage: /pi-limits-reset <provider> <model> | /pi-limits-reset all", "warning");
      }
    },
  });

  // Tool: Get cross-instance status
  pi.registerTool({
    name: "pi_instance_status",
    label: "PI Instance Status",
    description: "Get current cross-instance coordinator status and parallelism allocation.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      // Ensure adaptive controller is initialized
      ensureAdaptiveControllerInitialized();

      const status = getCoordinatorStatus();
      const runtime = getRuntimeSnapshot();
      const modelUsage = getModelUsageSummary();
      const adaptiveSummary = formatAdaptiveSummary();

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
        `Model Usage:`,
        ...modelUsage.models.map((m) => `  ${m.provider}/${m.model}: ${m.instanceCount} instance(s)`),
        ``,
        `Environment:`,
        `  PI_TOTAL_MAX_LLM: ${process.env.PI_TOTAL_MAX_LLM ?? "(not set)"}`,
        `  PI_AGENT_MAX_PARALLEL_SUBAGENTS: ${process.env.PI_AGENT_MAX_PARALLEL_SUBAGENTS ?? "(not set)"}`,
        ``,
        adaptiveSummary,
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
          modelUsage,
        },
      };
    },
    renderCall(_args, theme) {
      return new Text(theme.bold("pi_instance_status"), 0, 0);
    },
    renderResult(result, _options, theme) {
      const status = (result as any)?.details?.coordinator;
      if (!status) {
        return new Text(theme.fg("warning", "coordinator status unavailable"), 0, 0);
      }
      const head = status.registered
        ? theme.fg("success", "coordinator active ")
        : theme.fg("warning", "coordinator not initialized ");
      const body = theme.fg(
        "accent",
        `${status.activeInstanceCount} instances, limit: ${status.myParallelLimit}`
      );
      return new Text(head + body, 0, 0);
    },
  });

  // Tool: Get model-specific limits
  pi.registerTool({
    name: "pi_model_limits",
    label: "PI Model Limits",
    description: "Get rate limits for a specific provider/model combination.",
    parameters: Type.Object({
      provider: Type.String({ description: "Provider name (e.g., anthropic, openai)" }),
      model: Type.String({ description: "Model name (e.g., claude-sonnet-4-20250514)" }),
      tier: Type.Optional(Type.String({ description: "Optional tier (e.g., pro, max, plus)" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      // Ensure adaptive controller is initialized
      ensureAdaptiveControllerInitialized();

      const parsedParams = (params ?? {}) as { provider?: string; model?: string; tier?: string };
      const provider = String(parsedParams.provider || "");
      const model = String(parsedParams.model || "");
      const tier = parsedParams.tier ? String(parsedParams.tier) : detectTier(provider, model);

      if (!provider || !model) {
        return {
          content: [{ type: "text" as const, text: "pi_model_limits: provider and model are required." }],
          details: { error: "missing_params" },
        };
      }

      const resolved = resolveLimits(provider, model, tier);
      const learned = getLearnedLimit(provider, model);
      const coordinatorStatus = getCoordinatorStatus();
      const activeInstanceCount = coordinatorStatus.registered ? getActiveInstanceCount() : 1;
      const contendingInstanceCount = coordinatorStatus.registered ? getContendingInstanceCount() : 1;
      const effectiveLimit = getEffectiveLimit(provider, model, resolved.concurrency);
      const modelInstanceLimit = getModelParallelLimit(provider, model, effectiveLimit);

      const lines = [
        `Model Limits: ${provider}/${model}`,
        `================================`,
        ``,
        `Preset Limits:`,
        `  Tier: ${resolved.tier}`,
        `  RPM: ${resolved.rpm}`,
        `  TPM: ${resolved.tpm ?? "N/A"}`,
        `  Concurrency: ${resolved.concurrency}`,
        `  Source: ${resolved.source}`,
        ``,
        `Learned Limits:`,
        learned
          ? `  Current: ${learned.concurrency} (original: ${learned.originalConcurrency})`
          : `  (using preset)`,
        ``,
        `Instance Distribution:`,
        `  Active Instances: ${activeInstanceCount}`,
        `  Contending Instances: ${contendingInstanceCount}`,
        `  My Effective Limit: ${effectiveLimit}`,
        `  My Model-Specific Limit: ${modelInstanceLimit}`,
      ];

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
        details: {
          resolved,
          learned,
          effectiveLimit,
          modelInstanceLimit,
          activeInstanceCount,
          contendingInstanceCount,
        },
      };
    },
    renderCall(args, theme) {
      const preview = `${args.provider || "?"}/${args.model || "?"}`;
      return new Text(theme.bold("pi_model_limits ") + theme.fg("muted", preview), 0, 0);
    },
    renderResult(result, _options, theme) {
      const resolved = (result as any)?.details?.resolved;
      if (!resolved) {
        return new Text(theme.fg("warning", "model limits unavailable"), 0, 0);
      }
      return new Text(
        theme.fg("success", `${resolved.provider}/${resolved.model}: `) +
          theme.fg("accent", `concurrency=${resolved.concurrency}`),
        0,
        0
      );
    },
  });

  // Event: Register instance on session start
  pi.on("session_start", async (event, ctx) => {
    // Lazy initialize adaptive controller on first session (not at extension load time)
    ensureAdaptiveControllerInitialized();

    const sessionId = (event as any)?.sessionId ?? "unknown";
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
    shutdownAdaptiveController();
    unregisterInstance();
  });

  // Event: Track model usage on tool calls
  pi.on("tool_call", async (event, ctx) => {
    if (!ctx.model) return;

    const toolName = String(event?.toolName || "").toLowerCase();
    const isLlmTool = [
      "subagent_run",
      "subagent_run_parallel",
      "agent_team_run",
      "agent_team_run_parallel",
    ].includes(toolName);

    if (isLlmTool) {
      setActiveModel(ctx.model.provider, ctx.model.id);
    }
  });

  // Event: Handle tool results for 429 detection
  pi.on("tool_result", async (event, ctx) => {
    if (!ctx.model) return;

    const eventPayload = event as any;
    const error =
      eventPayload?.error ||
      eventPayload?.result?.error ||
      (eventPayload?.isError ? eventPayload?.output ?? eventPayload?.message ?? "tool error" : undefined);
    if (error && isRateLimitError(error)) {
      record429(ctx.model.provider, ctx.model.id, String(error));
      ctx.ui.notify(
        `Rate limit detected for ${ctx.model.provider}/${ctx.model.id}, reducing concurrency`,
        "warning"
      );
    } else if (!error) {
      recordSuccess(ctx.model.provider, ctx.model.id);
    }

    // Clear active model when tool completes
    clearActiveModel(ctx.model.provider, ctx.model.id);
  });

  // Log initialization
  console.error("[cross-instance-runtime] Extension loaded.");
  console.error("[cross-instance-runtime] Commands: /pi-instances, /pi-limits, /pi-limits-reset");
  console.error("[cross-instance-runtime] Tools: pi_instance_status, pi_model_limits");
}
