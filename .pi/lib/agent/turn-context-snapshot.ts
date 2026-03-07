/*
 * .pi/lib/agent/turn-context-snapshot.ts
 * TurnExecutionContext を再現用の軽量 snapshot へ変換する。
 * 失敗したターンの実行条件を後から復元しやすくするために存在する。
 * 関連ファイル: .pi/lib/agent/turn-context.ts, .pi/lib/agent/turn-context-builder.ts, .pi/extensions/subagents/task-execution.ts, .pi/extensions/loop.ts
 */

import type { TurnExecutionContext, TurnExecutionDecisions } from "./turn-context.js";

/**
 * 永続化向けのターン snapshot。
 * @summary ターン snapshot
 */
export interface TurnExecutionSnapshot {
  capturedAt: string;
  workspace: {
    cwd: string;
    workspaceRoot: string;
  };
  policy: {
    profile: TurnExecutionContext["policy"]["profile"];
    mode: TurnExecutionContext["policy"]["mode"];
    gatekeeper: TurnExecutionContext["policy"]["gatekeeper"];
    updatedAt: string;
  };
  tools: {
    availableToolNames: string[];
    activeToolNames: string[];
    dynamicToolNames: string[];
  };
  continuation: TurnExecutionContext["continuation"];
  runtimeEnvironment: {
    repoRoot: string;
    gitBranch?: string;
    packageManager?: string;
    testFramework?: string;
    mainLanguage?: string;
    buildSystem?: string;
    frequentFiles: string[];
    largeDirectoriesToAvoid: string[];
  };
  runtimeHints: string[];
  decisions?: {
    allowCommandExecution: boolean;
    allowSearchExtensions: boolean;
    allowSubtaskDelegation: boolean;
    preferredSubagentIds: string[];
    maxLoopIterations: number;
    maxParallelSubagents: number;
    retryOverrides: TurnExecutionDecisions["retryOverrides"];
  };
}

function minOptionalNumber(left?: number, right?: number): number | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return Math.min(left, right);
}

function intersectToolNames(current: string[], replay: string[]): string[] {
  if (replay.length === 0) {
    return [];
  }
  const replaySet = new Set(replay);
  return current.filter((toolName) => replaySet.has(toolName));
}

/**
 * replay 時に snapshot 側の tool exposure を現在 context に反映する。
 * @summary replay tool 制約適用
 * @param context 現在ターンの context
 * @param replaySnapshot 保存済み snapshot
 * @returns 制約後の context
 */
export function applyReplayToolConstraints(
  context: TurnExecutionContext,
  replaySnapshot?: TurnExecutionSnapshot,
): TurnExecutionContext {
  if (!replaySnapshot) {
    return context;
  }

  return {
    ...context,
    tools: {
      availableToolNames: intersectToolNames(
        context.tools.availableToolNames,
        replaySnapshot.tools.availableToolNames,
      ),
      activeToolNames: intersectToolNames(
        context.tools.activeToolNames,
        replaySnapshot.tools.activeToolNames,
      ),
      dynamicToolNames: intersectToolNames(
        context.tools.dynamicToolNames,
        replaySnapshot.tools.dynamicToolNames,
      ),
    },
  };
}

/**
 * replay 時に snapshot 側の decision を上限として現在の decision を締める。
 * @summary replay decision 制約適用
 * @param current 現在ターンの decision
 * @param replaySnapshot 保存済み snapshot
 * @returns より厳しい replay 用 decision
 */
export function applyReplayDecisionConstraints(
  current: TurnExecutionDecisions,
  replaySnapshot?: TurnExecutionSnapshot,
): TurnExecutionDecisions {
  const replay = replaySnapshot?.decisions;
  if (!replay) {
    return current;
  }

  const constrainedPreferred = replay.preferredSubagentIds.length > 0
    ? replay.preferredSubagentIds.filter((agentId) => current.preferredSubagentIds.includes(agentId))
    : current.preferredSubagentIds;

  return {
    allowCommandExecution: current.allowCommandExecution && replay.allowCommandExecution,
    allowSearchExtensions: current.allowSearchExtensions && replay.allowSearchExtensions,
    allowSubtaskDelegation: current.allowSubtaskDelegation && replay.allowSubtaskDelegation,
    preferredSubagentIds: constrainedPreferred.length > 0
      ? constrainedPreferred
      : replay.preferredSubagentIds.length > 0
        ? [...replay.preferredSubagentIds]
        : [...current.preferredSubagentIds],
    maxLoopIterations: Math.max(1, Math.min(current.maxLoopIterations, replay.maxLoopIterations)),
    maxParallelSubagents: Math.max(1, Math.min(current.maxParallelSubagents, replay.maxParallelSubagents)),
    retryOverrides: {
      maxRetries: minOptionalNumber(current.retryOverrides.maxRetries, replay.retryOverrides.maxRetries),
      initialDelayMs: minOptionalNumber(current.retryOverrides.initialDelayMs, replay.retryOverrides.initialDelayMs),
      maxDelayMs: minOptionalNumber(current.retryOverrides.maxDelayMs, replay.retryOverrides.maxDelayMs),
      multiplier: minOptionalNumber(current.retryOverrides.multiplier, replay.retryOverrides.multiplier),
      jitter: replay.retryOverrides.jitter ?? current.retryOverrides.jitter,
    },
  };
}

/**
 * TurnExecutionContext を snapshot に変換する。
 * @summary ターン snapshot 作成
 * @param context 元のコンテキスト
 * @param decisions 派生した実行判断
 * @returns 永続化向け snapshot
 */
export function createTurnExecutionSnapshot(
  context: TurnExecutionContext,
  decisions?: TurnExecutionDecisions,
): TurnExecutionSnapshot {
  return {
    capturedAt: context.capturedAt,
    workspace: {
      cwd: context.workspace.cwd,
      workspaceRoot: context.workspace.workspaceRoot,
    },
    policy: {
      profile: context.policy.profile,
      mode: context.policy.mode,
      gatekeeper: context.policy.gatekeeper,
      updatedAt: context.policy.updatedAt,
    },
    tools: {
      availableToolNames: [...context.tools.availableToolNames],
      activeToolNames: [...context.tools.activeToolNames],
      dynamicToolNames: [...context.tools.dynamicToolNames],
    },
    continuation: { ...context.continuation },
    runtimeEnvironment: {
      repoRoot: context.runtimeEnvironment.repoRoot,
      gitBranch: context.runtimeEnvironment.gitBranch,
      packageManager: context.runtimeEnvironment.packageManager,
      testFramework: context.runtimeEnvironment.testFramework,
      mainLanguage: context.runtimeEnvironment.mainLanguage,
      buildSystem: context.runtimeEnvironment.buildSystem,
      frequentFiles: [...context.runtimeEnvironment.frequentFiles],
      largeDirectoriesToAvoid: [...context.runtimeEnvironment.largeDirectoriesToAvoid],
    },
    runtimeHints: [...context.runtimeHints],
    decisions: decisions
      ? {
          allowCommandExecution: decisions.allowCommandExecution,
          allowSearchExtensions: decisions.allowSearchExtensions,
          allowSubtaskDelegation: decisions.allowSubtaskDelegation,
          preferredSubagentIds: [...decisions.preferredSubagentIds],
          maxLoopIterations: decisions.maxLoopIterations,
          maxParallelSubagents: decisions.maxParallelSubagents,
          retryOverrides: { ...decisions.retryOverrides },
        }
      : undefined,
  };
}
