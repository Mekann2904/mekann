/*
 * .pi/lib/agent/turn-context-inspector.ts
 * 永続化された TurnExecutionContext snapshot を読み出し、inspect 向けに整形する。
 * 失敗した実行の条件を後から確認し、再現入力へつなげるために存在する。
 * 関連ファイル: .pi/lib/agent/turn-context-snapshot.ts, .pi/extensions/subagents/task-execution.ts, .pi/extensions/loop.ts, .pi/extensions/subagents.ts
 */

import { existsSync, readFileSync } from "node:fs";

import type { TurnExecutionSnapshot } from "./turn-context-snapshot.js";

export interface LoopTurnContextEntry {
  iteration: number;
  snapshot: TurnExecutionSnapshot;
}

export interface SubagentReplayInput {
  run: {
    runId?: string;
    agentId?: string;
    task?: string;
  };
  prompt?: string;
  output?: string;
  snapshot: TurnExecutionSnapshot;
}

export interface LoopReplayInput {
  summary: {
    runId?: string;
    task?: string;
    goal?: string;
    verificationCommand?: string;
    config?: Record<string, unknown>;
  };
  references: Array<{
    id?: string;
    title?: string;
    source?: string;
  }>;
  snapshots: LoopTurnContextEntry[];
}

function readJsonFile(path: string): unknown {
  if (!existsSync(path)) {
    throw new Error(`snapshot file not found: ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf-8"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSnapshot(value: unknown): value is TurnExecutionSnapshot {
  return isRecord(value) &&
    isRecord(value.workspace) &&
    typeof value.workspace.cwd === "string" &&
    typeof value.workspace.workspaceRoot === "string" &&
    isRecord(value.policy) &&
    typeof value.policy.mode === "string";
}

export function loadSubagentTurnContextSnapshot(outputFile: string): TurnExecutionSnapshot {
  const parsed = readJsonFile(outputFile);
  if (!isRecord(parsed) || !isSnapshot(parsed.turnContext)) {
    throw new Error(`turnContext snapshot not found in subagent artifact: ${outputFile}`);
  }
  return parsed.turnContext;
}

export function loadLoopTurnContextSnapshots(summaryFile: string): LoopTurnContextEntry[] {
  const parsed = readJsonFile(summaryFile);
  if (!isRecord(parsed) || !Array.isArray(parsed.turnContexts)) {
    throw new Error(`turnContexts not found in loop summary: ${summaryFile}`);
  }

  const entries: LoopTurnContextEntry[] = [];
  for (const item of parsed.turnContexts) {
    if (!isRecord(item) || typeof item.iteration !== "number" || !isSnapshot(item.snapshot)) {
      continue;
    }
    entries.push({
      iteration: item.iteration,
      snapshot: item.snapshot,
    });
  }

  if (entries.length === 0) {
    throw new Error(`no valid turnContexts found in loop summary: ${summaryFile}`);
  }

  entries.sort((left, right) => left.iteration - right.iteration);
  return entries;
}

export function loadSubagentReplayInput(outputFile: string): SubagentReplayInput {
  const parsed = readJsonFile(outputFile);
  if (!isRecord(parsed) || !isSnapshot(parsed.turnContext)) {
    throw new Error(`turnContext snapshot not found in subagent artifact: ${outputFile}`);
  }

  const run = isRecord(parsed.run) ? parsed.run : {};
  return {
    run: {
      runId: typeof run.runId === "string" ? run.runId : undefined,
      agentId: typeof run.agentId === "string" ? run.agentId : undefined,
      task: typeof run.task === "string" ? run.task : undefined,
    },
    prompt: typeof parsed.prompt === "string" ? parsed.prompt : undefined,
    output: typeof parsed.output === "string" ? parsed.output : undefined,
    snapshot: parsed.turnContext,
  };
}

export function loadLoopReplayInput(summaryFile: string): LoopReplayInput {
  const parsed = readJsonFile(summaryFile);
  if (!isRecord(parsed) || !isRecord(parsed.summary)) {
    throw new Error(`summary not found in loop artifact: ${summaryFile}`);
  }

  const summary = parsed.summary;
  const references = Array.isArray(parsed.references)
    ? parsed.references.filter(isRecord).map((item) => ({
        id: typeof item.id === "string" ? item.id : undefined,
        title: typeof item.title === "string" ? item.title : undefined,
        source: typeof item.source === "string" ? item.source : undefined,
      }))
    : [];

  return {
    summary: {
      runId: typeof summary.runId === "string" ? summary.runId : undefined,
      task: typeof summary.task === "string" ? summary.task : undefined,
      goal: typeof summary.goal === "string" ? summary.goal : undefined,
      verificationCommand: typeof summary.verificationCommand === "string" ? summary.verificationCommand : undefined,
      config: isRecord(summary.config) ? summary.config : undefined,
    },
    references,
    snapshots: loadLoopTurnContextSnapshots(summaryFile),
  };
}

export function formatTurnExecutionSnapshot(snapshot: TurnExecutionSnapshot): string {
  const lines = [
    "Turn Execution Snapshot:",
    `Captured: ${snapshot.capturedAt}`,
    `CWD: ${snapshot.workspace.cwd}`,
    `Workspace root: ${snapshot.workspace.workspaceRoot}`,
    `Autonomy: ${snapshot.policy.profile}/${snapshot.policy.mode} (gatekeeper=${snapshot.policy.gatekeeper})`,
    `Startup: ${snapshot.continuation.startupKind} | first=${snapshot.continuation.isFirstTurn} | previous_context=${snapshot.continuation.previousContextAvailable}`,
    `Repo root: ${snapshot.runtimeEnvironment.repoRoot}`,
    `Language: ${snapshot.runtimeEnvironment.mainLanguage ?? "unknown"}`,
    `Package manager: ${snapshot.runtimeEnvironment.packageManager ?? "unknown"}`,
    `Test framework: ${snapshot.runtimeEnvironment.testFramework ?? "unknown"}`,
    `Active tools: ${snapshot.tools.activeToolNames.join(", ") || "(none)"}`,
    `Dynamic tools: ${snapshot.tools.dynamicToolNames.join(", ") || "(none)"}`,
  ];

  if (snapshot.decisions) {
    lines.push(
      `Decisions: commands=${snapshot.decisions.allowCommandExecution ? "allow" : "block"}, search_extensions=${snapshot.decisions.allowSearchExtensions ? "allow" : "block"}, subtasks=${snapshot.decisions.allowSubtaskDelegation ? "allow" : "block"}, retry_max=${snapshot.decisions.retryOverrides.maxRetries ?? 0}, loop_cap=${snapshot.decisions.maxLoopIterations}, parallel_cap=${snapshot.decisions.maxParallelSubagents}`,
    );
    lines.push(`Preferred subagents: ${snapshot.decisions.preferredSubagentIds.join(", ") || "(none)"}`);
  }

  if (snapshot.runtimeHints.length > 0) {
    lines.push("Runtime hints:");
    for (const hint of snapshot.runtimeHints) {
      lines.push(`- ${hint}`);
    }
  }

  return lines.join("\n");
}
