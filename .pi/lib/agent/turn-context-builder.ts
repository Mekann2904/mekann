/*
 * .pi/lib/agent/turn-context-builder.ts
 * ターン単位の実行コンテキストを構築し、prompt に載せる短い要約へ変換する。
 * 実行判断を session の暗黙状態から切り離し、毎ターン再構築できるようにするために存在する。
 * 関連ファイル: .pi/lib/agent/turn-context.ts, .pi/extensions/startup-context.ts, .pi/lib/autonomy-policy.ts, .pi/lib/tool-telemetry-store.ts
 */

import {
  applyModeToTools,
  loadAutonomyPolicyConfig,
} from "../autonomy-policy.js";
import { DynamicToolRegistry } from "../dynamic-tools/registry.js";
import { getRuntimeEnvironmentCache } from "../runtime-environment-cache.js";
import { getToolTelemetryStore } from "../tool-telemetry-store.js";
import type {
  BuildTurnExecutionContextOptions,
  TurnExecutionContext,
  TurnExecutionDecisions,
} from "./turn-context.js";

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function limitList(values: string[], maxItems = 8): string {
  const items = values.slice(0, maxItems);
  const remaining = values.length - items.length;
  if (remaining <= 0) {
    return items.join(", ");
  }
  return `${items.join(", ")}, +${remaining} more`;
}

function safeCollectDynamicToolNames(): string[] {
  try {
    return uniqueSorted(new DynamicToolRegistry().getAll().map((tool) => tool.name));
  } catch {
    return [];
  }
}

function buildRuntimeHints(): string[] {
  const telemetryHints = getToolTelemetryStore().buildPromptHints({ maxHints: 4 });
  return uniqueSorted(telemetryHints);
}

const SEARCH_TOOL_NAMES = new Set([
  "file_candidates",
  "code_search",
  "sym_find",
  "sym_index",
  "grep",
  "glob",
  "read",
  "enhanced_read",
]);

function hasSearchTools(context: TurnExecutionContext): boolean {
  return context.tools.activeToolNames.some((toolName) => SEARCH_TOOL_NAMES.has(toolName));
}

function inferPreferredSubagentIds(
  taskKind: "research" | "implementation" | "loop" | "planning" | "review",
  taskText?: string,
  allowCommandExecution = false,
): string[] {
  const normalizedTask = (taskText ?? "").toLowerCase();
  const preferred = new Set<string>();

  if (taskKind === "planning") {
    preferred.add("architect");
    preferred.add("researcher");
  } else if (taskKind === "review") {
    preferred.add("reviewer");
    preferred.add("tester");
    preferred.add("challenger");
  } else if (taskKind === "research") {
    preferred.add("researcher");
    preferred.add("architect");
    preferred.add("reviewer");
  } else if (taskKind === "loop") {
    if (allowCommandExecution) {
      preferred.add("implementer");
      preferred.add("tester");
      preferred.add("reviewer");
    } else {
      preferred.add("researcher");
      preferred.add("architect");
      preferred.add("reviewer");
    }
  } else {
    preferred.add("implementer");
    preferred.add("tester");
    preferred.add("reviewer");
  }

  if (/\b(test|verify|validation|spec|assert|repro)\b/.test(normalizedTask)) {
    preferred.add("tester");
  }
  if (/\b(review|risk|audit|inspect)\b/.test(normalizedTask)) {
    preferred.add("reviewer");
    preferred.add("challenger");
  }
  if (/\b(plan|design|migration|architecture)\b/.test(normalizedTask)) {
    preferred.add("architect");
  }
  if (/\b(research|investigate|analyze|search|read)\b/.test(normalizedTask)) {
    preferred.add("researcher");
  }

  return [...preferred];
}

function resolveMaxLoopIterations(context: TurnExecutionContext): number {
  if (context.policy.mode === "plan") {
    return 2;
  }
  if (context.policy.profile === "manual") {
    return 2;
  }
  if (context.policy.profile === "balanced") {
    return 4;
  }
  if (context.policy.profile === "high") {
    return 6;
  }
  return 8;
}

function resolveMaxParallelSubagents(context: TurnExecutionContext): number {
  if (context.policy.mode === "plan") {
    return 1;
  }
  if (context.policy.permissions.subtasks !== "allow") {
    return 1;
  }
  if (context.policy.profile === "manual") {
    return 1;
  }
  if (context.policy.profile === "balanced") {
    return 2;
  }
  if (context.policy.profile === "high") {
    return 4;
  }
  return 6;
}

/**
 * TurnExecutionContext を構築する。
 * @summary ターン実行コンテキスト構築
 * @param options 構築入力
 * @returns 解決済みコンテキスト
 */
export function buildTurnExecutionContext(
  options: BuildTurnExecutionContextOptions,
): TurnExecutionContext {
  const cwd = options.cwd ?? process.cwd();
  const runtimeEnvironment = getRuntimeEnvironmentCache().getSnapshot();
  const workspaceRoot = runtimeEnvironment.repoRoot || cwd;
  const policy = loadAutonomyPolicyConfig(workspaceRoot);
  const availableToolNames = uniqueSorted(options.availableToolNames ?? []);
  const activeToolNames = uniqueSorted(
    options.activeToolNames ?? applyModeToTools(availableToolNames, policy.mode),
  );
  const dynamicToolNames = uniqueSorted(options.dynamicToolNames ?? safeCollectDynamicToolNames());

  return {
    capturedAt: new Date().toISOString(),
    collaborationMode: options.collaborationMode ?? "default",
    sandboxPolicy: options.sandboxPolicy ?? "unknown",
    networkPolicy: options.networkPolicy ?? "unknown",
    workspace: {
      cwd,
      workspaceRoot,
    },
    policy: {
      profile: policy.profile,
      mode: policy.mode,
      gatekeeper: policy.gatekeeper,
      permissions: { ...policy.permissions },
      updatedAt: policy.updatedAt,
    },
    tools: {
      availableToolNames,
      activeToolNames,
      dynamicToolNames,
    },
    continuation: {
      isFirstTurn: options.isFirstTurn,
      startupKind: options.startupKind,
      previousContextAvailable: options.previousContextAvailable,
      sessionElapsedMs: options.sessionElapsedMs,
    },
    runtimeEnvironment,
    runtimeHints: buildRuntimeHints(),
  };
}

/**
 * TurnExecutionContext から実行判断を導出する。
 * @summary ターン判断導出
 * @param context 対象コンテキスト
 * @param input 判定補助入力
 * @returns 実行判断
 */
export function deriveTurnExecutionDecisions(
  context: TurnExecutionContext,
  input: {
    taskKind: "research" | "implementation" | "loop" | "planning" | "review";
    wantsCommandExecution?: boolean;
    taskText?: string;
  },
): TurnExecutionDecisions {
  const allowCommandExecution =
    context.policy.mode !== "plan" &&
    context.policy.permissions.command !== "deny";
  const allowSearchExtensions =
    input.taskKind === "research" &&
    context.policy.mode !== "plan" &&
    hasSearchTools(context);
  const allowSubtaskDelegation =
    context.policy.mode !== "plan" &&
    context.policy.permissions.subtasks === "allow";
  const preferredSubagentIds = inferPreferredSubagentIds(
    input.taskKind,
    input.taskText,
    allowCommandExecution,
  );
  const maxLoopIterations = resolveMaxLoopIterations(context);
  const maxParallelSubagents = resolveMaxParallelSubagents(context);

  let retryOverrides: TurnExecutionDecisions["retryOverrides"];
  if (context.policy.mode === "plan") {
    retryOverrides = {
      maxRetries: 1,
      initialDelayMs: 300,
      maxDelayMs: 1_200,
    };
  } else if (context.policy.profile === "manual" || context.policy.profile === "balanced") {
    retryOverrides = {
      maxRetries: 2,
      initialDelayMs: 500,
      maxDelayMs: 2_500,
    };
  } else {
    retryOverrides = {
      maxRetries: 3,
      initialDelayMs: 800,
      maxDelayMs: 4_000,
    };
  }

  if (context.continuation.previousContextAvailable && context.policy.mode !== "plan") {
    retryOverrides = {
      ...retryOverrides,
      maxRetries: Math.min((retryOverrides.maxRetries ?? 0) + 1, 4),
    };
  }

  if (input.wantsCommandExecution && !allowCommandExecution) {
    retryOverrides = {
      maxRetries: 0,
      initialDelayMs: retryOverrides.initialDelayMs,
      maxDelayMs: retryOverrides.maxDelayMs,
    };
  }

  return {
    allowCommandExecution,
    allowSearchExtensions,
    allowSubtaskDelegation,
    preferredSubagentIds,
    maxLoopIterations,
    maxParallelSubagents,
    retryOverrides,
  };
}

/**
 * TurnExecutionContext を短い block に整形する。
 * @summary ターン実行コンテキスト整形
 * @param context 整形対象
 * @returns prompt 向け block
 */
export function formatTurnExecutionContextBlock(context: TurnExecutionContext): string {
  const lines = [
    "# Turn Execution Context",
    `captured_at=${context.capturedAt}`,
    `cwd=${context.workspace.cwd}`,
    `workspace_root=${context.workspace.workspaceRoot}`,
    `collaboration_mode=${context.collaborationMode}`,
    `sandbox_policy=${context.sandboxPolicy}`,
    `network_policy=${context.networkPolicy}`,
    `startup_kind=${context.continuation.startupKind}`,
    `is_first_turn=${context.continuation.isFirstTurn}`,
    `previous_context_available=${context.continuation.previousContextAvailable}`,
    `session_elapsed_ms=${context.continuation.sessionElapsedMs}`,
    `autonomy_profile=${context.policy.profile}`,
    `autonomy_mode=${context.policy.mode}`,
    `autonomy_gatekeeper=${context.policy.gatekeeper}`,
    `available_tools_count=${context.tools.availableToolNames.length}`,
    `active_tools_count=${context.tools.activeToolNames.length}`,
    `dynamic_tools_count=${context.tools.dynamicToolNames.length}`,
  ];

  if (context.tools.activeToolNames.length > 0) {
    lines.push(`active_tools=${limitList(context.tools.activeToolNames)}`);
  }
  if (context.tools.dynamicToolNames.length > 0) {
    lines.push(`dynamic_tools=${limitList(context.tools.dynamicToolNames)}`);
  }

  return lines.join("\n");
}

/**
 * TurnExecutionContext から runtime notification 向けの短い section を作る。
 * @summary runtime section 構築
 * @param context 対象コンテキスト
 * @returns runtime notification 向けテキスト
 */
export function buildTurnExecutionRuntimeSection(context: TurnExecutionContext): string {
  const decisions = deriveTurnExecutionDecisions(context, {
    taskKind: "implementation",
  });
  const lines = [
    "prefer_cheap_probe_first=true",
    "avoid_duplicate_tool_calls=true",
    "narrow_large_outputs_before_reading=true",
    "respect_cwd_as_workspace_anchor=true",
    "resolve_policy_from_workspace_root=true",
    getRuntimeEnvironmentCache().formatForPrompt(),
    "# Turn Signals",
    `collaboration_mode=${context.collaborationMode}`,
    `autonomy_mode=${context.policy.mode}`,
    `allow_command_execution=${decisions.allowCommandExecution}`,
    `allow_search_extensions=${decisions.allowSearchExtensions}`,
    `allow_subtask_delegation=${decisions.allowSubtaskDelegation}`,
    `preferred_subagents=${decisions.preferredSubagentIds.join(",") || "(none)"}`,
    `max_loop_iterations=${decisions.maxLoopIterations}`,
    `max_parallel_subagents=${decisions.maxParallelSubagents}`,
    `retry_max_retries=${decisions.retryOverrides.maxRetries ?? 0}`,
    `active_tools_count=${context.tools.activeToolNames.length}`,
    `dynamic_tools_count=${context.tools.dynamicToolNames.length}`,
  ];

  if (context.runtimeHints.length > 0) {
    lines.push("# Recent Runtime Hints");
    for (const hint of context.runtimeHints) {
      lines.push(`- ${hint}`);
    }
  }

  return lines.join("\n");
}
