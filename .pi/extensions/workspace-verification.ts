/**
 * path: .pi/extensions/workspace-verification.ts
 * role: 書き込み後の自動検証、runbook解決、証跡保存、完了ゲートをワークスペース全体へ追加する
 * why: Droid / Kilo に近い検証運用を標準ループへ載せ、実装だけで終わる流れを止めるため
 * related: .pi/lib/workspace-verification.ts, .pi/extensions/background-process.ts, .pi/extensions/playwright-cli.ts, tests/unit/extensions/workspace-verification.test.ts
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  listBackgroundProcesses,
  loadBackgroundProcessConfig,
  saveBackgroundProcessConfig,
  startBackgroundProcess,
  waitForBackgroundProcessReady,
} from "../lib/background-processes.js";
import {
  acknowledgeReplanDecision,
  acknowledgeReviewArtifact,
  acknowledgeVerificationArtifacts,
  appendWorkspaceVerificationTrajectoryEvent,
  createWorkspaceVerificationConfig,
  createWorkspaceVerificationReplayInput,
  finalizeVerificationRun,
  formatWorkspaceVerificationTrajectory,
  formatWorkspaceVerificationStatus,
  getResolvedCommandForStep,
  isCompletionBlocked,
  loadWorkspaceVerificationConfig,
  loadWorkspaceVerificationState,
  markVerificationRunning,
  markWorkspaceDirty,
  parseWorkspaceCommand,
  persistWorkspaceVerificationArtifacts,
  persistWorkspaceVerificationContinuityPack,
  persistWorkspaceReviewArtifact,
  resolveEnabledSteps,
  resolveWorkspaceVerificationResumePlan,
  resolveWorkspaceVerificationPlan,
  saveWorkspaceVerificationState,
  saveWorkspaceVerificationConfig,
  shouldRequireReviewArtifact,
  shouldAutoRunVerification,
  type WorkspaceVerificationConfig,
  type WorkspaceVerificationResolvedPlan,
  type WorkspaceVerificationRunRecord,
  type WorkspaceVerificationState,
  type WorkspaceVerificationStep,
  type WorkspaceVerificationStepResult,
  type WorkspaceVerificationTrigger,
  runWorkspaceCommand,
} from "../lib/workspace-verification.js";
import { getCheckpointManager } from "../lib/checkpoint-manager.js";
import { buildPlaywrightCliArgs } from "./playwright-cli.js";

const execFileAsync = promisify(execFile);
const WRITE_TOOLS = new Set(["edit", "write", "patch"]);
const COMMAND_STEPS: WorkspaceVerificationStep[] = ["lint", "typecheck", "test", "build"];
let isInitialized = false;
let autoRunInFlight: Promise<void> | null = null;

type WorkspaceVerificationNotifyLevel = "info" | "warning" | "error" | "success";

interface WorkspaceVerificationContext {
  cwd: string;
  signal?: AbortSignal;
  ui?: {
    notify?: (message: string, level?: WorkspaceVerificationNotifyLevel) => void;
  };
}

function buildVerificationMarker(): string {
  return "<!-- WORKSPACE_VERIFICATION_STATUS -->";
}

async function saveWorkspaceCheckpoint(
  cwd: string,
  kind: "mutation" | "verification-failure",
  payload: Record<string, unknown>,
): Promise<string | undefined> {
  try {
    const manager = getCheckpointManager();
    const result = await manager.save({
      taskId: `workspace-verification:${cwd}`,
      source: "subagent_run",
      provider: "internal",
      model: "workspace-verification",
      priority: kind === "verification-failure" ? "high" : "normal",
      state: payload,
      progress: kind === "verification-failure" ? 0.9 : 0.25,
      metadata: {
        kind,
        cwd,
      },
      ttlMs: 7 * 24 * 60 * 60 * 1000,
    });
    return result.success ? result.checkpointId : undefined;
  } catch {
    return undefined;
  }
}

function buildStatusBlock(
  config: WorkspaceVerificationConfig,
  state: WorkspaceVerificationState,
  resolvedPlan: WorkspaceVerificationResolvedPlan,
): string {
  const reviewArtifactRequired = shouldRequireReviewArtifact(config, resolvedPlan);
  const lines = [
    "## Workspace Verification",
    "",
    "コードを書いた後は、検証成功前に完了扱いへ進まないこと。",
    "runbook と acceptance criteria を見て、必要な validation commands を全部回すこと。",
    "",
    `configured_profile: ${config.profile}`,
    `resolved_profile: ${resolvedPlan.profile}`,
    `gate_mode: ${config.gateMode}`,
    `dirty: ${state.dirty}`,
    `running: ${state.running}`,
    `last_write_at: ${state.lastWriteAt ?? "-"}`,
    `last_verified_at: ${state.lastVerifiedAt ?? "-"}`,
  ];

  if (resolvedPlan.acceptanceCriteria.length > 0) {
    lines.push("", "Acceptance Criteria:");
    for (const item of resolvedPlan.acceptanceCriteria.slice(0, 6)) {
      lines.push(`- ${item}`);
    }
  }

  if (resolvedPlan.validationCommands.length > 0) {
    lines.push("", "Validation Commands:");
    for (const command of resolvedPlan.validationCommands.slice(0, 6)) {
      lines.push(`- ${command}`);
    }
  }

  if (resolvedPlan.recommendedSteps.length > 0) {
    lines.push("", `Recommended Steps: ${resolvedPlan.recommendedSteps.join(", ")}`);
  }

  if (resolvedPlan.proofArtifacts.length > 0) {
    lines.push("", "Required Proof Artifacts:");
    for (const item of resolvedPlan.proofArtifacts.slice(0, 6)) {
      lines.push(`- ${item}`);
    }
  }

  if (state.lastRun && !state.lastRun.success) {
    lines.push("", "直近の検証は失敗している。artifact を読んで直してから進むこと。");
    if (state.lastRun.artifactDir) {
      lines.push(`artifact_dir: ${state.lastRun.artifactDir}`);
    }
  }

  if (state.dirty) {
    lines.push("", "未検証の変更が残っている。`workspace_verify` または自動検証の成功まで完了を止めること。");
  }

  if (config.requireProofReview && state.pendingProofReview) {
    lines.push("", "直近の成功検証は未レビュー。artifact を見たら `workspace_verify_ack` を実行すること。");
  }

  if (reviewArtifactRequired && state.pendingReviewArtifact) {
    lines.push("", "review artifact が未承認。`workspace_verify_review` と `workspace_verify_review_ack` を完了させること。");
    lines.push("高リスク review では decision と rationale を明示すること。");
  }

  if (config.requireReplanOnRepeatedFailure && state.replanRequired) {
    lines.push("", `同じ失敗が繰り返されている。plan を更新し、新しい修復方針を ` + "`workspace_verify_replan`" + " で記録すること。");
    if (state.replanReason) {
      lines.push(`replan_reason: ${state.replanReason}`);
    }
  }

  return lines.join("\n");
}

function shouldBlockTool(
  event: { toolName?: unknown; input?: unknown },
  config: WorkspaceVerificationConfig,
  state: WorkspaceVerificationState,
  resolvedPlan: WorkspaceVerificationResolvedPlan,
): string | null {
  if (!isCompletionBlocked(config, state, resolvedPlan)) {
    return null;
  }

  const toolName = typeof event.toolName === "string" ? event.toolName : "";
  const reviewArtifactRequired = shouldRequireReviewArtifact(config, resolvedPlan);
  const reasonCore = config.requireReplanOnRepeatedFailure && state.replanRequired
    ? `Repeated verification failures require a new repair strategy. Update the plan and run workspace_verify_replan. ${state.replanReason ?? ""}`.trim()
    : reviewArtifactRequired && state.pendingReviewArtifact
      ? "A review artifact is required before completion. Run workspace_verify_review and acknowledge it with workspace_verify_review_ack."
    : config.requireProofReview && state.pendingProofReview
      ? "A successful verification exists, but its proof artifacts have not been acknowledged. Run workspace_verify_ack after inspecting the latest artifacts."
      : "Workspace verification is stale. Run workspace_verify and inspect the latest artifacts.";
  if (toolName === "task_complete") {
    return `${reasonCore} before task_complete.`;
  }

  if (toolName === "plan_update_step") {
    const input = typeof event.input === "object" && event.input !== null
      ? event.input as Record<string, unknown>
      : {};
    if (input.status === "completed") {
      return `${reasonCore} before marking a plan step completed.`;
    }
  }

  if ((toolName === "edit" || toolName === "write" || toolName === "patch" || toolName === "bash")
    && config.requireReplanOnRepeatedFailure
    && state.replanRequired) {
    return `${reasonCore} before further workspace mutations.`;
  }

  return null;
}

function makeSkippedStep(step: WorkspaceVerificationStep, reason: string): WorkspaceVerificationStepResult {
  return {
    step,
    success: false,
    skipped: true,
    durationMs: 0,
    error: reason,
  };
}

async function runRuntimeVerification(
  resolvedPlan: WorkspaceVerificationResolvedPlan,
  cwd: string,
): Promise<WorkspaceVerificationStepResult> {
  const startedAt = Date.now();
  const runtimeConfig = resolvedPlan.runtime;

  if (!runtimeConfig.enabled) {
    return makeSkippedStep("runtime", "runtime verification is disabled");
  }

  if (!runtimeConfig.command.trim()) {
    return makeSkippedStep("runtime", "runtime command is empty");
  }

  const backgroundConfig = loadBackgroundProcessConfig(cwd);
  if (!backgroundConfig.enabled) {
    saveBackgroundProcessConfig(cwd, { enabled: true });
  }

  const existing = listBackgroundProcesses({ cwd, includeExited: false }).find((record) => {
    return record.label === runtimeConfig.label || record.command === runtimeConfig.command;
  });

  try {
    if (existing) {
      const readiness = await waitForBackgroundProcessReady({
        cwd,
        id: existing.id,
        timeoutMs: runtimeConfig.startupTimeoutMs,
      });

      return {
        step: "runtime",
        success: Boolean(readiness?.ready),
        skipped: false,
        durationMs: Date.now() - startedAt,
        command: existing.command,
        metadata: {
          reused: true,
          processId: existing.id,
          pid: existing.pid,
          readiness: readiness?.record.readinessStatus ?? existing.readinessStatus,
        },
        error: readiness?.ready ? undefined : "background process did not become ready",
      };
    }

    const result = await startBackgroundProcess({
      command: runtimeConfig.command,
      cwd: runtimeConfig.cwd ?? cwd,
      label: runtimeConfig.label,
      readyPort: runtimeConfig.readyPort,
      readyPattern: runtimeConfig.readyPattern,
      startupTimeoutMs: runtimeConfig.startupTimeoutMs,
      keepAliveOnShutdown: runtimeConfig.keepAliveOnShutdown,
    });

    return {
      step: "runtime",
      success: result.ready,
      skipped: false,
      durationMs: Date.now() - startedAt,
      command: runtimeConfig.command,
      metadata: {
        reused: false,
        processId: result.record.id,
        pid: result.record.pid,
        readiness: result.record.readinessStatus,
      },
      error: result.ready ? undefined : "background process started but readiness was not confirmed",
    };
  } catch (error) {
    return {
      step: "runtime",
      success: false,
      skipped: false,
      durationMs: Date.now() - startedAt,
      command: runtimeConfig.command,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function resolveUiCommands(resolvedPlan: WorkspaceVerificationResolvedPlan): string[] {
  if (resolvedPlan.ui.commands.length > 0) {
    return resolvedPlan.ui.commands;
  }

  if (!resolvedPlan.ui.baseUrl) {
    return [];
  }

  return ["open ${baseUrl}", "snapshot"];
}

async function runPlaywrightCommand(
  resolvedPlan: WorkspaceVerificationResolvedPlan,
  cwd: string,
  commandLine: string,
): Promise<{ success: boolean; stdout: string; stderr: string; error?: string; durationMs: number; args: string[] }> {
  const startedAt = Date.now();
  const hydrated = resolvedPlan.ui.baseUrl
    ? commandLine.replaceAll("${baseUrl}", resolvedPlan.ui.baseUrl)
    : commandLine;
  const parsed = parseWorkspaceCommand(hydrated);

  if (parsed.error) {
    return {
      success: false,
      stdout: "",
      stderr: "",
      error: parsed.error,
      durationMs: Date.now() - startedAt,
      args: [],
    };
  }

  const args = buildPlaywrightCliArgs({
    command: parsed.executable,
    args: parsed.args,
    session: resolvedPlan.ui.session,
    config: resolvedPlan.ui.config,
  });

  try {
    const { stdout, stderr } = await execFileAsync("playwright-cli", args, {
      cwd,
      timeout: resolvedPlan.ui.timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    });
    return {
      success: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      durationMs: Date.now() - startedAt,
      args,
    };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    return {
      success: false,
      stdout: (err.stdout ?? "").trim(),
      stderr: (err.stderr ?? "").trim(),
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
      args,
    };
  }
}

async function runUiVerification(
  resolvedPlan: WorkspaceVerificationResolvedPlan,
  cwd: string,
): Promise<WorkspaceVerificationStepResult> {
  const startedAt = Date.now();

  if (!resolvedPlan.ui.enabled) {
    return makeSkippedStep("ui", "ui verification is disabled");
  }

  const commands = resolveUiCommands(resolvedPlan);
  if (commands.length === 0) {
    return makeSkippedStep("ui", "ui commands are empty");
  }

  const summaries: string[] = [];
  for (const commandLine of commands) {
    const result = await runPlaywrightCommand(resolvedPlan, cwd, commandLine);
    summaries.push(`${commandLine}: ${result.success ? "ok" : "failed"}`);
    if (!result.success) {
      return {
        step: "ui",
        success: false,
        skipped: false,
        durationMs: Date.now() - startedAt,
        command: commandLine,
        stdout: result.stdout,
        stderr: result.stderr,
        error: result.error,
        metadata: { args: result.args, baseUrl: resolvedPlan.ui.baseUrl },
      };
    }
  }

  return {
    step: "ui",
    success: true,
    skipped: false,
    durationMs: Date.now() - startedAt,
    command: summaries.join(" | "),
  };
}

export async function runWorkspaceVerification(
  config: WorkspaceVerificationConfig,
  ctx: WorkspaceVerificationContext,
  trigger: WorkspaceVerificationTrigger,
  requestedSteps?: string[],
): Promise<WorkspaceVerificationRunRecord> {
  const cwd = ctx.cwd;
  const resolvedPlan = resolveWorkspaceVerificationPlan(config, cwd);
  markVerificationRunning({ cwd });
  const startedAt = new Date().toISOString();
  const stepResults: WorkspaceVerificationStepResult[] = [];
  let shouldSkipRemaining = false;

  for (const step of resolveEnabledSteps(config, resolvedPlan, requestedSteps)) {
    if (shouldSkipRemaining) {
      stepResults.push(makeSkippedStep(step, "skipped after previous verification failure"));
      continue;
    }

    if (COMMAND_STEPS.includes(step)) {
      const command = getResolvedCommandForStep(
        resolvedPlan,
        step as "lint" | "typecheck" | "test" | "build",
      );

      if (!command) {
        stepResults.push(makeSkippedStep(step, "no command resolved for this step"));
        continue;
      }

      const commandResult = await runWorkspaceCommand({
        command,
        cwd,
        timeoutMs: config.commandTimeoutMs,
        signal: ctx.signal,
      });

      const stepResult: WorkspaceVerificationStepResult = {
        step,
        success: commandResult.success,
        skipped: false,
        durationMs: commandResult.durationMs,
        command,
        stdout: commandResult.stdout,
        stderr: commandResult.stderr,
        error: commandResult.error,
      };
      stepResults.push(stepResult);
      if (!stepResult.success) {
        shouldSkipRemaining = true;
      }
      continue;
    }

    if (step === "runtime") {
      const stepResult = await runRuntimeVerification(resolvedPlan, cwd);
      stepResults.push(stepResult);
      if (!stepResult.success && !stepResult.skipped) {
        shouldSkipRemaining = true;
      }
      continue;
    }

    if (step === "ui") {
      const stepResult = await runUiVerification(resolvedPlan, cwd);
      stepResults.push(stepResult);
      if (!stepResult.success && !stepResult.skipped) {
        shouldSkipRemaining = true;
      }
    }
  }

  const bareRun: WorkspaceVerificationRunRecord = {
    trigger,
    startedAt,
    finishedAt: new Date().toISOString(),
    success: stepResults.every((item) => item.success || item.skipped),
    stepResults,
    resolvedPlan,
  };

  const persistedRun = persistWorkspaceVerificationArtifacts(cwd, config, bareRun);
  const finalizedState = finalizeVerificationRun({ cwd, run: persistedRun });
  if (shouldRequireReviewArtifact(config, persistedRun.resolvedPlan) && persistedRun.success) {
    const reviewArtifact = persistWorkspaceReviewArtifact({
      cwd,
      run: persistedRun,
    });
    saveWorkspaceVerificationState(cwd, {
      ...finalizedState,
      pendingReviewArtifact: true,
      lastReviewArtifactPath: reviewArtifact.path,
      lastReviewArtifactAt: undefined,
    });
  }

  if (!persistedRun.success && config.checkpointOnFailure) {
    const checkpointId = await saveWorkspaceCheckpoint(cwd, "verification-failure", {
      artifactDir: persistedRun.artifactDir,
      trigger: persistedRun.trigger,
      profile: persistedRun.resolvedPlan.profile,
      stepResults: persistedRun.stepResults.map((item) => ({
        step: item.step,
        success: item.success,
        skipped: item.skipped,
        command: item.command,
        error: item.error,
        artifactPath: item.artifactPath,
      })),
    });

    if (checkpointId) {
      const state = loadWorkspaceVerificationState(cwd);
      saveWorkspaceVerificationState(cwd, {
        ...state,
        lastFailureCheckpointId: checkpointId,
      });
    }
  }

  const latestState = loadWorkspaceVerificationState(cwd);
  const continuityPath = persistWorkspaceVerificationContinuityPack(cwd, latestState, persistedRun.resolvedPlan);
  saveWorkspaceVerificationState(cwd, {
    ...latestState,
    continuityPath,
  });
  appendWorkspaceVerificationTrajectoryEvent({
    cwd,
    entry: {
      kind: "verification_run",
      summary: persistedRun.success
        ? `verification passed (${persistedRun.stepResults.map((item) => item.step).join(", ")})`
        : `verification failed (${persistedRun.stepResults.find((item) => !item.success && !item.skipped)?.step ?? "unknown"})`,
      state: {
        dirty: latestState.dirty,
        pendingProofReview: latestState.pendingProofReview,
        pendingReviewArtifact: latestState.pendingReviewArtifact,
        replanRequired: latestState.replanRequired,
        repeatedFailureCount: latestState.repeatedFailureCount,
      },
      details: {
        artifactDir: persistedRun.artifactDir,
        success: persistedRun.success,
        continuityPath,
      },
    },
  });

  if (ctx.ui?.notify) {
    ctx.ui.notify(
      persistedRun.success
        ? `Workspace verification passed. Artifacts: ${persistedRun.artifactDir ?? "-"}`
        : `Workspace verification failed. Artifacts: ${persistedRun.artifactDir ?? "-"}`,
      persistedRun.success ? "success" : "warning",
    );
  }

  return persistedRun;
}

function summarizeRun(runRecord: WorkspaceVerificationRunRecord): string {
  const lines = [
    `trigger=${runRecord.trigger}`,
    `success=${runRecord.success}`,
    `started_at=${runRecord.startedAt}`,
    `finished_at=${runRecord.finishedAt}`,
    `profile=${runRecord.resolvedPlan.profile}`,
    `artifact_dir=${runRecord.artifactDir ?? "-"}`,
  ];

  if (runRecord.resolvedPlan.sources.length > 0) {
    lines.push(`runbook_sources=${runRecord.resolvedPlan.sources.join(", ")}`);
  }

  if (runRecord.resolvedPlan.acceptanceCriteria.length > 0) {
    lines.push("acceptance_criteria:");
    for (const item of runRecord.resolvedPlan.acceptanceCriteria) {
      lines.push(`- ${item}`);
    }
  }

  for (const step of runRecord.stepResults) {
    lines.push(
      `[${step.step}] success=${step.success} skipped=${step.skipped} duration_ms=${step.durationMs}${step.error ? ` error=${step.error}` : ""}${step.artifactPath ? ` artifact=${step.artifactPath}` : ""}`,
    );
  }

  return lines.join("\n");
}

async function maybeRunAutoVerification(ctx: ExtensionAPI["context"]): Promise<void> {
  const config = loadWorkspaceVerificationConfig(ctx.cwd);
  const state = loadWorkspaceVerificationState(ctx.cwd);

  if (!shouldAutoRunVerification(config, state)) {
    return;
  }

  if (autoRunInFlight) {
    return;
  }

  autoRunInFlight = runWorkspaceVerification(config, ctx, "auto")
    .then(() => undefined)
    .finally(() => {
      autoRunInFlight = null;
    });

  await autoRunInFlight;
}

export default function registerWorkspaceVerification(pi: ExtensionAPI) {
  if (isInitialized) {
    return;
  }
  isInitialized = true;

  pi.on("before_agent_start", async (event, ctx) => {
    const config = loadWorkspaceVerificationConfig(ctx.cwd);
    if (!config.enabled) {
      return;
    }
    const state = loadWorkspaceVerificationState(ctx.cwd);
    const resolvedPlan = resolveWorkspaceVerificationPlan(config, ctx.cwd);
    const marker = buildVerificationMarker();
    const currentPrompt = event.systemPrompt ?? "";

    if (currentPrompt.includes(marker)) {
      return;
    }

    return {
      systemPrompt: `${currentPrompt}\n\n${marker}\n${buildStatusBlock(config, state, resolvedPlan)}`.trim(),
    };
  });

  pi.on("tool_result", async (event, ctx) => {
    const toolName = typeof event.toolName === "string" ? event.toolName : "";
    const isError = event && typeof event === "object" && "isError" in event
      ? Boolean((event as { isError?: unknown }).isError)
      : false;

    if (WRITE_TOOLS.has(toolName) && !isError) {
      const config = loadWorkspaceVerificationConfig(ctx.cwd);
      if (!config.enabled) {
        return;
      }
      const dirtyState = markWorkspaceDirty({ cwd: ctx.cwd, toolName });
      if (config.checkpointOnMutation) {
        const checkpointId = await saveWorkspaceCheckpoint(ctx.cwd, "mutation", {
          toolName,
          writeCount: dirtyState.writeCount,
          lastWriteAt: dirtyState.lastWriteAt,
        });
        if (checkpointId) {
          saveWorkspaceVerificationState(ctx.cwd, {
            ...dirtyState,
            lastMutationCheckpointId: checkpointId,
          });
        }
      }
      const latestState = loadWorkspaceVerificationState(ctx.cwd);
      const continuityPath = persistWorkspaceVerificationContinuityPack(ctx.cwd, latestState, resolveWorkspaceVerificationPlan(config, ctx.cwd));
      saveWorkspaceVerificationState(ctx.cwd, {
        ...latestState,
        continuityPath,
      });
      appendWorkspaceVerificationTrajectoryEvent({
        cwd: ctx.cwd,
        entry: {
          kind: "mutation",
          summary: `${toolName} marked the workspace dirty`,
          state: {
            dirty: latestState.dirty,
            pendingProofReview: latestState.pendingProofReview,
            pendingReviewArtifact: latestState.pendingReviewArtifact,
            replanRequired: latestState.replanRequired,
            repeatedFailureCount: latestState.repeatedFailureCount,
          },
          details: {
            toolName,
            continuityPath,
          },
        },
      });
      ctx.ui?.notify?.("Workspace marked dirty. Verification is now required.", "info");
    }
  });

  pi.on("tool_call", async (event, ctx) => {
    const config = loadWorkspaceVerificationConfig(ctx.cwd);
    if (!config.enabled) {
      return;
    }
    const state = loadWorkspaceVerificationState(ctx.cwd);
    const resolvedPlan = resolveWorkspaceVerificationPlan(config, ctx.cwd);
    const reason = shouldBlockTool(event, config, state, resolvedPlan);
    if (!reason) {
      return;
    }

    return { block: true, reason };
  });

  pi.on("turn_end", async (_event, ctx) => {
    if (!loadWorkspaceVerificationConfig(ctx.cwd).enabled) {
      return;
    }
    await maybeRunAutoVerification(ctx);
  });

  pi.on("session_start", async (_event, ctx) => {
    const config = loadWorkspaceVerificationConfig(ctx.cwd);
    if (!config.enabled) {
      return;
    }
    const state = loadWorkspaceVerificationState(ctx.cwd);
    const resolvedPlan = resolveWorkspaceVerificationPlan(config, ctx.cwd);

    if (state.dirty) {
      ctx.ui?.notify?.(
        "Unverified workspace changes detected. Completion is gated until verification passes.",
        "warning",
      );
      return;
    }

    if (config.requireProofReview && state.pendingProofReview) {
      ctx.ui?.notify?.(
        "Successful verification artifacts are waiting for review. Run workspace_verify_ack after inspection.",
        "warning",
      );
    }

    if (config.requireReplanOnRepeatedFailure && state.replanRequired) {
      ctx.ui?.notify?.(
        "Repeated verification failures require replanning. Update the plan and run workspace_verify_replan.",
        "warning",
      );
    }

    if (config.enabled) {
      const continuityPath = persistWorkspaceVerificationContinuityPack(ctx.cwd, state, resolvedPlan);
      saveWorkspaceVerificationState(ctx.cwd, {
        ...state,
        continuityPath,
      });
      ctx.ui?.notify?.(
        `Workspace verification loaded (${resolvedPlan.profile}). Runtime=${resolvedPlan.runtime.enabled} UI=${resolvedPlan.ui.enabled}`,
        "info",
      );
    }
  });

  pi.on("session_shutdown", async () => {
    isInitialized = false;
    autoRunInFlight = null;
  });

  pi.registerTool({
    name: "workspace_verify",
    label: "Workspace Verify",
    description: "Run the resolved workspace verification pipeline with artifact capture.",
    parameters: Type.Object({
      trigger: Type.Optional(Type.Union([Type.Literal("manual"), Type.Literal("auto")])),
      steps: Type.Optional(Type.Array(Type.String({ description: "subset of steps: lint,typecheck,test,build,runtime,ui" }))),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const config = loadWorkspaceVerificationConfig(ctx.cwd);
      const runRecord = await runWorkspaceVerification(
        config,
        { ...ctx, signal },
        params.trigger === "auto" ? "auto" : "manual",
        params.steps,
      );

      return {
        content: [{ type: "text", text: summarizeRun(runRecord) }],
        details: runRecord,
      };
    },
  });

  pi.registerTool({
    name: "workspace_verify_status",
    label: "Workspace Verify Status",
    description: "Show current workspace verification state and resolved runbook.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const config = loadWorkspaceVerificationConfig(ctx.cwd);
      const state = loadWorkspaceVerificationState(ctx.cwd);
      const resolvedPlan = resolveWorkspaceVerificationPlan(config, ctx.cwd);
      return {
        content: [{ type: "text", text: formatWorkspaceVerificationStatus(config, state, resolvedPlan) }],
        details: { config, state, resolvedPlan },
      };
    },
  });

  pi.registerTool({
    name: "workspace_verify_trajectory",
    label: "Workspace Verify Trajectory",
    description: "Show the latest workspace verification trajectory and replay input.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const config = loadWorkspaceVerificationConfig(ctx.cwd);
      const state = loadWorkspaceVerificationState(ctx.cwd);
      const resolvedPlan = resolveWorkspaceVerificationPlan(config, ctx.cwd);
      const replay = createWorkspaceVerificationReplayInput(ctx.cwd, state, resolvedPlan);
      return {
        content: [{ type: "text", text: formatWorkspaceVerificationTrajectory(replay) }],
        details: replay,
      };
    },
  });

  pi.registerTool({
    name: "workspace_verify_replay",
    label: "Workspace Verify Replay",
    description: "Resume workspace verification from the last durable replay point.",
    parameters: Type.Object({
      execute: Type.Optional(Type.Boolean()),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const config = loadWorkspaceVerificationConfig(ctx.cwd);
      const state = loadWorkspaceVerificationState(ctx.cwd);
      const resolvedPlan = resolveWorkspaceVerificationPlan(config, ctx.cwd);
      const resume = resolveWorkspaceVerificationResumePlan(state, resolvedPlan);
      const replay = createWorkspaceVerificationReplayInput(ctx.cwd, state, resolvedPlan);

      if (params.execute === false || resume.phase !== "verification" || resume.requestedSteps.length === 0) {
        return {
          content: [{
            type: "text",
            text: `${formatWorkspaceVerificationTrajectory(replay)}\nresume_reason: ${resume.reason}\nrequested_steps: ${resume.requestedSteps.join(", ") || "-"}`,
          }],
          details: {
            replay,
            resume,
          },
        };
      }

      const runRecord = await runWorkspaceVerification(
        config,
        { ...ctx, signal },
        "manual",
        resume.requestedSteps,
      );

      return {
        content: [{
          type: "text",
          text: `${summarizeRun(runRecord)}\n\nresume_reason: ${resume.reason}`,
        }],
        details: {
          replay,
          resume,
          runRecord,
        },
      };
    },
  });

  pi.registerTool({
    name: "workspace_verify_plan",
    label: "Workspace Verify Plan",
    description: "Show the resolved verification runbook extracted from the workspace.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const config = loadWorkspaceVerificationConfig(ctx.cwd);
      const resolvedPlan = resolveWorkspaceVerificationPlan(config, ctx.cwd);
      return {
        content: [{ type: "text", text: JSON.stringify(resolvedPlan, null, 2) }],
        details: resolvedPlan,
      };
    },
  });

  pi.registerTool({
    name: "workspace_verify_ack",
    label: "Workspace Verify Ack",
    description: "Acknowledge that the latest verification artifacts have been inspected.",
    parameters: Type.Object({
      artifactDir: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = acknowledgeVerificationArtifacts({
        cwd: ctx.cwd,
        artifactDir: params.artifactDir,
      });
      const config = loadWorkspaceVerificationConfig(ctx.cwd);
      const resolvedPlan = resolveWorkspaceVerificationPlan(config, ctx.cwd);
      const continuityPath = persistWorkspaceVerificationContinuityPack(ctx.cwd, state, resolvedPlan);
      saveWorkspaceVerificationState(ctx.cwd, {
        ...state,
        continuityPath,
      });
      appendWorkspaceVerificationTrajectoryEvent({
        cwd: ctx.cwd,
        entry: {
          kind: "proof_ack",
          summary: "proof artifacts acknowledged",
          state: {
            dirty: state.dirty,
            pendingProofReview: state.pendingProofReview,
            pendingReviewArtifact: state.pendingReviewArtifact,
            replanRequired: state.replanRequired,
            repeatedFailureCount: state.repeatedFailureCount,
          },
          details: {
            artifactDir: state.lastReviewedArtifactDir,
            continuityPath,
          },
        },
      });

      return {
        content: [{ type: "text", text: `Proof artifacts acknowledged: ${state.lastReviewedArtifactDir ?? "-"}` }],
        details: {
          ...state,
          continuityPath,
        },
      };
    },
  });

  pi.registerTool({
    name: "workspace_verify_review",
    label: "Workspace Verify Review",
    description: "Generate a structured review artifact for bugs, security, regression, test gaps, and rollback risk.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const state = loadWorkspaceVerificationState(ctx.cwd);
      const run = state.lastRun;
      if (!run) {
        throw new Error("no verification run available");
      }

      const config = loadWorkspaceVerificationConfig(ctx.cwd);
      if (!shouldRequireReviewArtifact(config, run.resolvedPlan)) {
        throw new Error("review artifact is not required for the latest verification run");
      }

      const artifact = persistWorkspaceReviewArtifact({
        cwd: ctx.cwd,
        run,
      });
      const nextState = saveWorkspaceVerificationState(ctx.cwd, {
        ...state,
        pendingReviewArtifact: true,
        lastReviewArtifactPath: artifact.path,
      });
      const resolvedPlan = resolveWorkspaceVerificationPlan(config, ctx.cwd);
      const continuityPath = persistWorkspaceVerificationContinuityPack(ctx.cwd, nextState, resolvedPlan);
      saveWorkspaceVerificationState(ctx.cwd, {
        ...nextState,
        continuityPath,
      });
      appendWorkspaceVerificationTrajectoryEvent({
        cwd: ctx.cwd,
        entry: {
          kind: "verification_run",
          summary: "review artifact generated from latest verification run",
          state: {
            dirty: nextState.dirty,
            pendingProofReview: nextState.pendingProofReview,
            pendingReviewArtifact: nextState.pendingReviewArtifact,
            replanRequired: nextState.replanRequired,
            repeatedFailureCount: nextState.repeatedFailureCount,
          },
          details: {
            reviewArtifactPath: artifact.path,
            continuityPath,
          },
        },
      });

      return {
        content: [{ type: "text", text: `Review artifact generated: ${artifact.path}` }],
        details: {
          ...artifact,
          continuityPath,
        },
      };
    },
  });

  pi.registerTool({
    name: "workspace_verify_review_ack",
    label: "Workspace Verify Review Ack",
    description: "Acknowledge that the latest review artifact has been inspected.",
    parameters: Type.Object({
      path: Type.Optional(Type.String()),
      decision: Type.Optional(Type.Union([Type.Literal("accept"), Type.Literal("mitigate")])),
      rationale: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = acknowledgeReviewArtifact({
        cwd: ctx.cwd,
        path: params.path,
        decision: params.decision,
        rationale: params.rationale,
      });
      const config = loadWorkspaceVerificationConfig(ctx.cwd);
      const resolvedPlan = resolveWorkspaceVerificationPlan(config, ctx.cwd);
      const continuityPath = persistWorkspaceVerificationContinuityPack(ctx.cwd, state, resolvedPlan);
      saveWorkspaceVerificationState(ctx.cwd, {
        ...state,
        continuityPath,
      });
      appendWorkspaceVerificationTrajectoryEvent({
        cwd: ctx.cwd,
        entry: {
          kind: "review_ack",
          summary: "review artifact acknowledged",
          state: {
            dirty: state.dirty,
            pendingProofReview: state.pendingProofReview,
            pendingReviewArtifact: state.pendingReviewArtifact,
            replanRequired: state.replanRequired,
            repeatedFailureCount: state.repeatedFailureCount,
          },
          details: {
            reviewArtifactPath: state.lastReviewArtifactPath,
            decision: state.lastReviewDecision,
            continuityPath,
          },
        },
      });

      return {
        content: [{ type: "text", text: `Review artifact acknowledged: ${state.lastReviewArtifactPath ?? "-"}` }],
        details: {
          ...state,
          continuityPath,
        },
      };
    },
  });

  pi.registerTool({
    name: "workspace_verify_replan",
    label: "Workspace Verify Replan",
    description: "Record a new repair strategy after repeated verification failures and release the replan gate.",
    parameters: Type.Object({
      strategy: Type.String({ description: "Concrete repair strategy to try next" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = acknowledgeReplanDecision({
        cwd: ctx.cwd,
        strategy: params.strategy,
      });
      const config = loadWorkspaceVerificationConfig(ctx.cwd);
      const resolvedPlan = resolveWorkspaceVerificationPlan(config, ctx.cwd);
      const continuityPath = persistWorkspaceVerificationContinuityPack(ctx.cwd, state, resolvedPlan);
      saveWorkspaceVerificationState(ctx.cwd, {
        ...state,
        continuityPath,
      });
      appendWorkspaceVerificationTrajectoryEvent({
        cwd: ctx.cwd,
        entry: {
          kind: "replan_ack",
          summary: "replan strategy acknowledged",
          state: {
            dirty: state.dirty,
            pendingProofReview: state.pendingProofReview,
            pendingReviewArtifact: state.pendingReviewArtifact,
            replanRequired: state.replanRequired,
            repeatedFailureCount: state.repeatedFailureCount,
          },
          details: {
            strategy: state.lastRepairStrategy,
            continuityPath,
          },
        },
      });

      return {
        content: [{ type: "text", text: `Replan acknowledged: ${params.strategy}` }],
        details: {
          ...state,
          continuityPath,
        },
      };
    },
  });

  pi.registerTool({
    name: "workspace_verification_config",
    label: "Workspace Verification Config",
    description: "Show or update workspace verification settings.",
    parameters: Type.Object({
      action: Type.Union([Type.Literal("show"), Type.Literal("update"), Type.Literal("reset")]),
      enabled: Type.Optional(Type.Boolean()),
      profile: Type.Optional(Type.Union([
        Type.Literal("auto"),
        Type.Literal("web-app"),
        Type.Literal("library"),
        Type.Literal("backend"),
        Type.Literal("cli"),
      ])),
      autoDetectRunbook: Type.Optional(Type.Boolean()),
      autoRunOnTurnEnd: Type.Optional(Type.Boolean()),
      requireProofReview: Type.Optional(Type.Boolean()),
      requireReviewArtifact: Type.Optional(Type.Boolean()),
      autoRequireReviewArtifact: Type.Optional(Type.Boolean()),
      requireReplanOnRepeatedFailure: Type.Optional(Type.Boolean()),
      enableEvalCorpus: Type.Optional(Type.Boolean()),
      checkpointOnMutation: Type.Optional(Type.Boolean()),
      checkpointOnFailure: Type.Optional(Type.Boolean()),
      antiLoopThreshold: Type.Optional(Type.Integer({ minimum: 2, maximum: 10 })),
      gateMode: Type.Optional(Type.Union([
        Type.Literal("soft"),
        Type.Literal("strict"),
        Type.Literal("release"),
      ])),
      commandTimeoutMs: Type.Optional(Type.Integer({ minimum: 1000, maximum: 600000 })),
      artifactRetentionRuns: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
      enableLint: Type.Optional(Type.Boolean()),
      enableTypecheck: Type.Optional(Type.Boolean()),
      enableTest: Type.Optional(Type.Boolean()),
      enableBuild: Type.Optional(Type.Boolean()),
      enableRuntime: Type.Optional(Type.Boolean()),
      enableUi: Type.Optional(Type.Boolean()),
      lintCommand: Type.Optional(Type.String()),
      typecheckCommand: Type.Optional(Type.String()),
      testCommand: Type.Optional(Type.String()),
      buildCommand: Type.Optional(Type.String()),
      runtimeCommand: Type.Optional(Type.String()),
      runtimeLabel: Type.Optional(Type.String()),
      runtimeReadyPort: Type.Optional(Type.Integer({ minimum: 1, maximum: 65535 })),
      runtimeReadyPattern: Type.Optional(Type.String()),
      runtimeStartupTimeoutMs: Type.Optional(Type.Integer({ minimum: 0, maximum: 300000 })),
      runtimeKeepAliveOnShutdown: Type.Optional(Type.Boolean()),
      uiSession: Type.Optional(Type.String()),
      uiConfig: Type.Optional(Type.String()),
      uiBaseUrl: Type.Optional(Type.String()),
      uiTimeoutMs: Type.Optional(Type.Integer({ minimum: 1000, maximum: 300000 })),
      uiCommands: Type.Optional(Type.Array(Type.String())),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (params.action === "reset") {
        const reset = saveWorkspaceVerificationConfig(ctx.cwd, createWorkspaceVerificationConfig());
        return {
          content: [{ type: "text", text: JSON.stringify(reset, null, 2) }],
          details: reset,
        };
      }

      if (params.action === "update") {
        const updated = saveWorkspaceVerificationConfig(ctx.cwd, {
          enabled: params.enabled,
          profile: params.profile,
          autoDetectRunbook: params.autoDetectRunbook,
          autoRunOnTurnEnd: params.autoRunOnTurnEnd,
          requireProofReview: params.requireProofReview,
          requireReviewArtifact: params.requireReviewArtifact,
          autoRequireReviewArtifact: params.autoRequireReviewArtifact,
          requireReplanOnRepeatedFailure: params.requireReplanOnRepeatedFailure,
          enableEvalCorpus: params.enableEvalCorpus,
          checkpointOnMutation: params.checkpointOnMutation,
          checkpointOnFailure: params.checkpointOnFailure,
          antiLoopThreshold: params.antiLoopThreshold,
          gateMode: params.gateMode,
          commandTimeoutMs: params.commandTimeoutMs,
          artifactRetentionRuns: params.artifactRetentionRuns,
          enabledSteps: {
            lint: params.enableLint,
            typecheck: params.enableTypecheck,
            test: params.enableTest,
            build: params.enableBuild,
            runtime: params.enableRuntime,
            ui: params.enableUi,
          },
          commands: {
            lint: params.lintCommand,
            typecheck: params.typecheckCommand,
            test: params.testCommand,
            build: params.buildCommand,
          },
          runtime: {
            enabled: params.enableRuntime,
            command: params.runtimeCommand,
            label: params.runtimeLabel,
            readyPort: params.runtimeReadyPort,
            readyPattern: params.runtimeReadyPattern,
            startupTimeoutMs: params.runtimeStartupTimeoutMs,
            keepAliveOnShutdown: params.runtimeKeepAliveOnShutdown,
          },
          ui: {
            enabled: params.enableUi,
            session: params.uiSession,
            config: params.uiConfig,
            baseUrl: params.uiBaseUrl,
            timeoutMs: params.uiTimeoutMs,
            commands: params.uiCommands,
          },
        });

        return {
          content: [{ type: "text", text: JSON.stringify(updated, null, 2) }],
          details: updated,
        };
      }

      const current = loadWorkspaceVerificationConfig(ctx.cwd);
      return {
        content: [{ type: "text", text: JSON.stringify(current, null, 2) }],
        details: current,
      };
    },
  });
}
