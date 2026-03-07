/*
 * .pi/lib/agent/turn-context.ts
 * ターン単位の実行条件を明示するデータ契約を定義する。
 * セッション暗黙状態ではなく、そのターンで必要な判断材料を束ねるために存在する。
 * 関連ファイル: .pi/lib/agent/turn-context-builder.ts, .pi/extensions/startup-context.ts, .pi/lib/autonomy-policy.ts, .pi/lib/runtime-environment-cache.ts
 */

import type { AutonomyMode, AutonomyProfile, PermissionBundle, SafetyGatekeeperMode } from "../autonomy-policy.js";
import type { RuntimeEnvironmentSnapshot } from "../runtime-environment-cache.js";
import type { RetryWithBackoffOverrides } from "../retry-with-backoff.js";

/**
 * ターン継続状態。
 * @summary 直近ターンとの関係
 */
export interface TurnExecutionContinuation {
  isFirstTurn: boolean;
  startupKind: "baseline" | "delta";
  previousContextAvailable: boolean;
  sessionElapsedMs: number;
}

/**
 * ターンのワークスペース境界。
 * @summary 基準座標
 */
export interface TurnExecutionWorkspace {
  cwd: string;
  workspaceRoot: string;
}

/**
 * 自律実行 policy のスナップショット。
 * @summary policy 状態
 */
export interface TurnExecutionPolicySnapshot {
  profile: AutonomyProfile;
  mode: AutonomyMode;
  gatekeeper: SafetyGatekeeperMode;
  permissions: PermissionBundle;
  updatedAt: string;
}

/**
 * そのターンで解決済みのツール可用性。
 * @summary ツール可用性
 */
export interface TurnExecutionToolAvailability {
  availableToolNames: string[];
  activeToolNames: string[];
  dynamicToolNames: string[];
}

/**
 * ターン単位の実行コンテキスト。
 * @summary ターンの判断基盤
 */
export interface TurnExecutionContext {
  capturedAt: string;
  collaborationMode: string;
  sandboxPolicy: string;
  networkPolicy: string;
  workspace: TurnExecutionWorkspace;
  policy: TurnExecutionPolicySnapshot;
  tools: TurnExecutionToolAvailability;
  continuation: TurnExecutionContinuation;
  runtimeEnvironment: RuntimeEnvironmentSnapshot;
  runtimeHints: string[];
}

/**
 * ターンコンテキストから導かれる実行判断。
 * @summary 実行判断
 */
export interface TurnExecutionDecisions {
  allowCommandExecution: boolean;
  allowSearchExtensions: boolean;
  allowSubtaskDelegation: boolean;
  preferredSubagentIds: string[];
  maxLoopIterations: number;
  maxParallelSubagents: number;
  retryOverrides: RetryWithBackoffOverrides;
}

/**
 * TurnExecutionContext の構築入力。
 * @summary builder 入力
 */
export interface BuildTurnExecutionContextOptions {
  cwd?: string;
  collaborationMode?: string;
  sandboxPolicy?: string;
  networkPolicy?: string;
  availableToolNames?: string[];
  activeToolNames?: string[];
  dynamicToolNames?: string[];
  startupKind: "baseline" | "delta";
  isFirstTurn: boolean;
  previousContextAvailable: boolean;
  sessionElapsedMs: number;
}
