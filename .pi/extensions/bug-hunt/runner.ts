// Path: .pi/extensions/bug-hunt/runner.ts
// What: bug-hunt のバックグラウンド実行ループ本体
// Why: ユーザが止めるまで bug report task を追加し続けるため
// Related: .pi/extensions/bug-hunt/index.ts, .pi/extensions/bug-hunt/reporting.ts, .pi/extensions/shared/pi-print-executor.ts

import { setTimeout as delay } from "node:timers/promises";

import { callModelViaPi } from "../shared/pi-print-executor.js";
import { buildBugHuntPrompt, parseBugHuntModelOutput } from "./reporting.js";
import {
  appendBugHuntReportTask,
  createBugHuntFingerprint,
  createDefaultBugHuntState,
  hasBugHuntFingerprint,
  listRecentBugHuntTitles,
  loadBugHuntState,
  saveBugHuntState,
} from "./storage.js";

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
    stoppedAt: new Date().toISOString(),
    lastHeartbeatAt: new Date().toISOString(),
    lastSummary: summary,
    lastError: lastError ?? (status === "failed" ? summary : null),
  }, cwd);
}

async function runIteration(): Promise<void> {
  const state = loadBugHuntState(cwd);
  if (state.runId !== runId) {
    throw new Error("bug-hunt run id no longer matches active state");
  }
  if (!state.model) {
    throw new Error("bug-hunt model config is missing");
  }

  const prompt = buildBugHuntPrompt({
    taskPrompt: state.taskPrompt,
    cwd,
    iteration: state.iterationCount + 1,
    knownFingerprints: state.reportedFingerprints,
    recentTitles: listRecentBugHuntTitles(cwd),
  });

  activeController = new AbortController();
  const raw = await callModelViaPi({
    model: state.model,
    prompt,
    timeoutMs: state.timeoutMs,
    signal: activeController.signal,
    entityLabel: "bug-hunt",
  });
  activeController = null;

  const parsed = parseBugHuntModelOutput(raw);
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
  };

  if (parsed.status === "no_bug") {
    saveBugHuntState({
      ...nextState,
      lastSummary: `no new bug: ${parsed.reason}`,
    }, cwd);
    return;
  }

  const fingerprint = createBugHuntFingerprint(parsed.report.dedupeKey);
  if (
    nextState.reportedFingerprints.includes(fingerprint)
    || hasBugHuntFingerprint(fingerprint, cwd)
  ) {
    saveBugHuntState({
      ...nextState,
      lastSummary: `duplicate skipped: ${parsed.report.title}`,
    }, cwd);
    return;
  }

  const task = appendBugHuntReportTask(parsed.report, {
    cwd,
    runId,
  });

  saveBugHuntState({
    ...nextState,
    reportedCount: nextState.reportedCount + 1,
    reportedFingerprints: [...nextState.reportedFingerprints, fingerprint],
    lastSummary: `reported ${task.id}: ${parsed.report.title}`,
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
