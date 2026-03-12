// Path: .pi/extensions/bug-hunt/runner.ts
// What: bug-hunt のバックグラウンド実行ループ本体
// Why: ユーザが止めるまで bug report task を追加し続けるため
// Related: .pi/extensions/bug-hunt/index.ts, .pi/extensions/bug-hunt/reporting.ts, .pi/extensions/shared/pi-print-executor.ts

import { setTimeout as delay } from "node:timers/promises";

import {
  allocateBugHuntStageTimeout,
  hasBudgetForBugHuntStage,
  type BugHuntModelStage,
} from "./budget.js";
import { callModelViaPi } from "../shared/pi-print-executor.js";
import {
  buildBugHuntHypothesisPrompt,
  buildBugHuntInvestigationPrompt,
  buildBugHuntObserverPrompt,
  buildBugHuntQueryPrompt,
  parseBugHuntHypothesisOutput,
  parseBugHuntInvestigationOutput,
  parseBugHuntModelOutput,
  parseBugHuntQueryOutput,
  resolveBugHuntCandidateReference,
} from "./reporting.js";
import {
  buildBugHuntInvestigationContext,
  collectBugHuntCandidates,
  summarizeCandidatesForState,
  validateBugHuntReportEvidence,
} from "./localization.js";
import {
  appendBugHuntReportTask,
  buildBugHuntSemanticDedupeKey,
  createBugHuntFingerprint,
  createDefaultBugHuntState,
  hasBugHuntFingerprint,
  listRecentBugHuntDedupeKeys,
  listRecentBugHuntTitles,
  loadBugHuntState,
  saveBugHuntState,
} from "./storage.js";
import type { BugHuntStage, BugHuntState } from "./types.js";

function readArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = value;
    index += 1;
  }
  return args;
}

const args = readArgs(process.argv.slice(2));
const cwd = args.cwd ?? process.cwd();
const runId = args["run-id"] ?? "";

let activeController: AbortController | null = null;
let stopping = false;

function stopRequested(): boolean {
  const state = loadBugHuntState(cwd);
  return stopping || state.runId !== runId || state.stopRequested || state.status === "stopping";
}

function saveHeartbeat(summary?: string): void {
  const current = loadBugHuntState(cwd);
  if (current.runId !== runId) {
    return;
  }

  saveBugHuntState({
    ...current,
    lastHeartbeatAt: new Date().toISOString(),
    lastSummary: summary ?? current.lastSummary,
  }, cwd);
}

function saveStage(stage: BugHuntStage, summary?: string, patch: Partial<BugHuntState> = {}): void {
  const current = loadBugHuntState(cwd);
  if (current.runId !== runId) {
    return;
  }

  saveBugHuntState({
    ...current,
    ...patch,
    currentStage: stage,
    lastHeartbeatAt: new Date().toISOString(),
    lastSummary: summary ?? current.lastSummary,
  }, cwd);
}

function requestStop(reason: string): void {
  stopping = true;
  activeController?.abort();

  const current = loadBugHuntState(cwd);
  if (current.runId !== runId) {
    return;
  }

  saveBugHuntState({
    ...current,
    status: "stopping",
    stopRequested: true,
    lastError: reason,
    lastHeartbeatAt: new Date().toISOString(),
  }, cwd);
}

async function waitForNextIteration(intervalMs: number): Promise<boolean> {
  const deadline = Date.now() + Math.max(0, intervalMs);
  while (Date.now() < deadline) {
    if (stopRequested()) {
      return false;
    }
    await delay(Math.min(1_000, Math.max(50, deadline - Date.now())));
  }
  return !stopRequested();
}

function finalizeState(status: "stopped" | "failed", summary: string, lastError?: string): void {
  const current = loadBugHuntState(cwd);
  if (current.runId !== runId) {
    return;
  }

  saveBugHuntState({
    ...current,
    status,
    stopRequested: status !== "failed",
    currentStage: "idle",
    stoppedAt: new Date().toISOString(),
    lastHeartbeatAt: new Date().toISOString(),
    lastSummary: summary,
    lastError: lastError ?? (status === "failed" ? summary : null),
  }, cwd);
}

function ensureRemainingBudget(deadline: number, stage: string): number {
  const remaining = deadline - Date.now();
  if (remaining < 5_000) {
    throw new Error(`iteration budget exhausted before ${stage}`);
  }
  return remaining;
}

async function callStageModel(
  state: BugHuntState,
  prompt: string,
  deadline: number,
  stage: BugHuntModelStage,
  entityLabel: string,
): Promise<string> {
  if (!state.model) {
    throw new Error("bug-hunt model config is missing");
  }
  const timeoutMs = Math.min(
    state.timeoutMs,
    allocateBugHuntStageTimeout(stage, ensureRemainingBudget(deadline, entityLabel)),
  );
  activeController = new AbortController();
  try {
    return await callModelViaPi({
      model: state.model,
      prompt,
      timeoutMs,
      signal: activeController.signal,
      entityLabel,
    });
  } finally {
    activeController = null;
  }
}

async function runIteration(): Promise<void> {
  const state = loadBugHuntState(cwd);
  if (state.runId !== runId) {
    throw new Error("bug-hunt run id no longer matches active state");
  }
  if (!state.model) {
    throw new Error("bug-hunt model config is missing");
  }

  const deadline = Date.now() + state.timeoutMs;
  const knownDedupeKeys = Array.from(new Set([
    ...state.reportedDedupeKeys,
    ...listRecentBugHuntDedupeKeys(cwd),
  ])).slice(-20);
  const recentTitles = listRecentBugHuntTitles(cwd);

  saveStage("retrieve", "planning bug-hunt query");
  const queryPrompt = buildBugHuntQueryPrompt({
    taskPrompt: state.taskPrompt,
    cwd,
    iteration: state.iterationCount + 1,
    knownDedupeKeys,
    recentTitles,
    seenFiles: state.seenFiles,
  });
  const rawQuery = await callStageModel(state, queryPrompt, deadline, "query", "bug-hunt-query");
  const queryPlan = parseBugHuntQueryOutput(rawQuery);

  saveStage("retrieve", `retrieving candidates for: ${queryPlan.query}`);
  const candidates = await collectBugHuntCandidates({
    cwd,
    query: queryPlan.query,
    keywords: queryPlan.keywords,
    limit: 12,
  });

  const latest = loadBugHuntState(cwd);
  if (latest.runId !== runId) {
    return;
  }

  const nextState = {
    ...latest,
    iterationCount: latest.iterationCount + 1,
    lastHeartbeatAt: new Date().toISOString(),
    lastIterationAt: new Date().toISOString(),
    lastError: null,
    seenFiles: Array.from(new Set([...latest.seenFiles, ...candidates.map((candidate) => candidate.file)])).slice(-256),
    lastCandidates: summarizeCandidatesForState(candidates),
  };

  if (candidates.length === 0) {
    saveBugHuntState({
      ...nextState,
      currentStage: "sleeping",
      lastObserverDecision: "no candidates found",
      lastSummary: `no new bug: no localization candidates for "${queryPlan.query}"`,
    }, cwd);
    return;
  }

  saveStage("hypothesis", `scoring ${candidates.length} candidates`, {
    ...nextState,
  });
  const rawHypotheses = await callStageModel(state, buildBugHuntHypothesisPrompt({
    queryPlan,
    candidates,
  }), deadline, "hypothesis", "bug-hunt-hypothesis");
  const hypotheses = parseBugHuntHypothesisOutput(rawHypotheses)
    .map((hypothesis) => {
      const resolvedCandidateId = resolveBugHuntCandidateReference(hypothesis.candidateId, candidates);
      if (!resolvedCandidateId) {
        return null;
      }
      return {
        ...hypothesis,
        candidateId: resolvedCandidateId,
      };
    })
    .filter((hypothesis): hypothesis is NonNullable<typeof hypothesis> => Boolean(hypothesis))
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 4);

  if (hypotheses.length === 0) {
    saveBugHuntState({
      ...nextState,
      currentStage: "sleeping",
      lastObserverDecision: "observer skipped because no hypothesis survived",
      lastSummary: "no new bug: hypothesis stage rejected all candidates",
    }, cwd);
    return;
  }

  const investigations = [];
  const rejectedHypotheses = [...nextState.rejectedHypotheses];

  for (const hypothesis of hypotheses) {
    if (!hasBudgetForBugHuntStage("investigation", deadline - Date.now())) {
      break;
    }

    const candidate = candidates.find((entry) => entry.id === hypothesis.candidateId);
    if (!candidate) {
      continue;
    }

    saveStage("investigate", `investigating ${candidate.file}${candidate.line ? `:${candidate.line}` : ""}`);
    const context = await buildBugHuntInvestigationContext({
      cwd,
      candidate,
    });
    const rawInvestigation = await callStageModel(state, buildBugHuntInvestigationPrompt({
      queryPlan,
      candidate,
      hypothesis,
      context,
      rejectedHypotheses,
    }), deadline, "investigation", "bug-hunt-investigation");
    const investigation = parseBugHuntInvestigationOutput(rawInvestigation);
    investigations.push({
      ...investigation,
      hypothesisId: hypothesis.id,
      candidateId: candidate.id,
    });

    if (investigation.status === "rejected") {
      rejectedHypotheses.push(hypothesis.hypothesis);
    }
  }

  if (investigations.length === 0) {
    saveBugHuntState({
      ...nextState,
      rejectedHypotheses: rejectedHypotheses.slice(-256),
      currentStage: "sleeping",
      lastObserverDecision: "investigation produced no usable result",
      lastSummary: "no new bug: investigations did not complete",
    }, cwd);
    return;
  }

  saveStage("observe", "observer reranking investigation results", {
    rejectedHypotheses: rejectedHypotheses.slice(-256),
  });
  const rawObserver = await callStageModel(state, buildBugHuntObserverPrompt({
    taskPrompt: state.taskPrompt,
    queryPlan,
    investigations,
    knownDedupeKeys,
    recentTitles,
  }), deadline, "observer", "bug-hunt-observer");
  const parsed = parseBugHuntModelOutput(rawObserver);

  if (parsed.status === "no_bug") {
    saveBugHuntState({
      ...nextState,
      currentStage: "sleeping",
      rejectedHypotheses: rejectedHypotheses.slice(-256),
      lastObserverDecision: parsed.reason,
      lastSummary: `no new bug: ${parsed.reason}`,
    }, cwd);
    return;
  }

  saveStage("report", `validating report: ${parsed.report.title}`);
  const validation = await validateBugHuntReportEvidence(parsed.report, cwd);
  if (!validation.valid || !validation.report) {
    saveBugHuntState({
      ...nextState,
      currentStage: "sleeping",
      rejectedHypotheses: rejectedHypotheses.slice(-256),
      lastObserverDecision: validation.issues.join("; "),
      lastSummary: `observer rejected invalid evidence: ${validation.issues.join("; ")}`,
    }, cwd);
    return;
  }

  const semanticKey = buildBugHuntSemanticDedupeKey(validation.report);
  const fingerprint = createBugHuntFingerprint(semanticKey);
  if (
    nextState.reportedFingerprints.includes(fingerprint)
    || hasBugHuntFingerprint(fingerprint, cwd)
  ) {
    saveBugHuntState({
      ...nextState,
      currentStage: "sleeping",
      reportedDedupeKeys: Array.from(new Set([...nextState.reportedDedupeKeys, validation.report.dedupeKey])).slice(-256),
      lastObserverDecision: `duplicate skipped: ${validation.report.title}`,
      lastSummary: `duplicate skipped: ${validation.report.title}`,
    }, cwd);
    return;
  }

  const task = appendBugHuntReportTask(validation.report, {
    cwd,
    runId,
  });

  saveBugHuntState({
    ...nextState,
    currentStage: "sleeping",
    reportedCount: nextState.reportedCount + 1,
    reportedFingerprints: [...nextState.reportedFingerprints, fingerprint],
    reportedDedupeKeys: Array.from(new Set([...nextState.reportedDedupeKeys, validation.report.dedupeKey])).slice(-256),
    rejectedHypotheses: rejectedHypotheses.slice(-256),
    lastObserverDecision: `reported ${validation.report.title}`,
    lastSummary: `reported ${task.id}: ${validation.report.title}`,
  }, cwd);
}

async function main(): Promise<void> {
  const initial = loadBugHuntState(cwd);
  const normalized = {
    ...createDefaultBugHuntState(),
    ...initial,
  };

  if (!runId || normalized.runId !== runId) {
    throw new Error("bug-hunt runner started without matching run id");
  }
  if (!normalized.model) {
    throw new Error("bug-hunt runner requires a model config");
  }

  saveBugHuntState({
    ...normalized,
    status: "running",
    currentStage: "booting",
    stopRequested: false,
    stoppedAt: null,
    lastHeartbeatAt: new Date().toISOString(),
    lastSummary: "runner booted",
  }, cwd);

  console.log(`BUG_HUNT_READY runId=${runId}`);

  while (!stopRequested()) {
    try {
      saveHeartbeat("running iteration");
      await runIteration();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (stopRequested() || /aborted/i.test(message)) {
        break;
      }

      const current = loadBugHuntState(cwd);
      if (current.runId === runId) {
        saveBugHuntState({
          ...current,
          lastHeartbeatAt: new Date().toISOString(),
          lastError: message,
          lastSummary: `iteration failed: ${message}`,
        }, cwd);
      }

      if (/model config is missing|run id no longer matches/i.test(message)) {
        throw error;
      }
    }

    const state = loadBugHuntState(cwd);
    if (state.runId !== runId || state.stopRequested || state.status === "stopping") {
      break;
    }

    const keepRunning = await waitForNextIteration(state.intervalMs);
    if (!keepRunning) {
      break;
    }
  }

  finalizeState("stopped", "bug-hunt stopped");
}

process.on("SIGTERM", () => requestStop("received SIGTERM"));
process.on("SIGINT", () => requestStop("received SIGINT"));

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  finalizeState("failed", `bug-hunt failed: ${message}`, message);
  console.error(message);
  process.exitCode = 1;
});
