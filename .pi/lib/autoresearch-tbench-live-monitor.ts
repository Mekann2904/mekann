/**
 * path: .pi/lib/autoresearch-tbench-live-monitor.ts
 * role: autoresearch-tbench 実行中の job / trial / activity を live monitor 形式で可視化する
 * why: baseline や run の最中に、今どの task が setup 中か、何を考えているかを pi 画面で追えるようにするため
 * related: .pi/lib/autoresearch-tbench.ts, .pi/extensions/autoresearch-tbench.ts, .pi/lib/tui-types.ts, tests/unit/lib/autoresearch-tbench-live-monitor.test.ts
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { matchesKey, Key, truncateToWidth } from "@mariozechner/pi-tui";

import type { LiveMonitorContext, Theme, TuiInstance, KeybindingMap } from "./tui-types.js";

export type AutoresearchTbenchTrialPhase =
  | "pending"
  | "setup"
  | "running"
  | "verifying"
  | "completed"
  | "failed";

export interface AutoresearchTbenchTrialSnapshot {
  trialName: string;
  taskName: string;
  phase: AutoresearchTbenchTrialPhase;
  reward: number | null;
  elapsedMs: number;
  activity: string;
}

export interface AutoresearchTbenchLiveSnapshot {
  label: string;
  startedAtMs: number;
  elapsedMs: number;
  jobsDir: string;
  jobDir: string | null;
  totalTrials: number;
  completedTrials: number;
  successCount: number;
  failedCount: number;
  runningCount: number;
  setupCount: number;
  pendingCount: number;
  statusLine: string;
  trials: AutoresearchTbenchTrialSnapshot[];
}

export interface AutoresearchTbenchLiveMonitorController {
  update: (snapshot: AutoresearchTbenchLiveSnapshot) => void;
  close: () => void;
  wait: () => Promise<void>;
}

interface ParsedEventInsight {
  activity: string;
}

interface ResultLike {
  trial_name?: unknown;
  task_name?: unknown;
  started_at?: unknown;
  finished_at?: unknown;
  verifier_result?: {
    rewards?: {
      reward?: unknown;
    };
  };
  exception_info?: unknown;
}

function nowMs(): number {
  return Date.now();
}

function toNumberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function parseDurationMs(startedAt: unknown, finishedAt: unknown): number {
  if (typeof startedAt !== "string") {
    return 0;
  }
  const startedMs = Date.parse(startedAt);
  if (!Number.isFinite(startedMs)) {
    return 0;
  }
  if (typeof finishedAt !== "string") {
    return Math.max(0, nowMs() - startedMs);
  }
  const finishedMs = Date.parse(finishedAt);
  if (!Number.isFinite(finishedMs) || finishedMs < startedMs) {
    return 0;
  }
  return finishedMs - startedMs;
}

function formatElapsedMs(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function cropSingleLine(value: string, maxLength: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function tailText(path: string, maxChars: number): string {
  if (!existsSync(path)) {
    return "";
  }
  const text = readFileSync(path, "utf-8");
  if (text.length <= maxChars) {
    return text;
  }
  return text.slice(-maxChars);
}

function pickLastNonEmptyLine(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.at(-1) ?? "";
}

function parseEventInsight(line: string): ParsedEventInsight | null {
  if (!line.startsWith("{")) {
    return null;
  }

  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    const type = typeof parsed.type === "string" ? parsed.type : "";

    if (type === "message_update") {
      const event = parsed.assistantMessageEvent as Record<string, unknown> | undefined;
      if (!event) {
        return null;
      }

      const eventType = typeof event.type === "string" ? event.type : "";
      const partial = event.partial as Record<string, unknown> | undefined;
      const content = Array.isArray(partial?.content) ? partial?.content as Array<Record<string, unknown>> : [];
      const firstContent = content[0];
      const thinking = typeof firstContent?.thinking === "string" ? firstContent.thinking : "";
      const text = typeof firstContent?.text === "string" ? firstContent.text : "";
      const excerpt = cropSingleLine(thinking || text, 80);

      if (eventType.startsWith("thinking")) {
        return { activity: excerpt ? `thinking: ${excerpt}` : "thinking" };
      }
      if (eventType.includes("text")) {
        return { activity: excerpt ? `answer: ${excerpt}` : "answering" };
      }
    }

    if (type === "message_start") {
      const message = parsed.message as Record<string, unknown> | undefined;
      if (!message) {
        return null;
      }
      const role = typeof message.role === "string" ? message.role : "";
      if (role === "user") {
        return { activity: "task prompt received" };
      }
      if (role === "assistant") {
        return { activity: "assistant response started" };
      }
    }

    if (type === "agent_start") {
      return { activity: "agent started" };
    }
    if (type === "turn_start") {
      return { activity: "new turn" };
    }

    return { activity: cropSingleLine(type || "event", 80) };
  } catch {
    return null;
  }
}

function readLastEventActivity(eventsPath: string): string {
  const tail = tailText(eventsPath, 20_000);
  const lines = tail.split(/\r?\n/).filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const parsed = parseEventInsight(lines[index] ?? "");
    if (parsed?.activity) {
      return parsed.activity;
    }
  }

  return "running";
}

function pickPhaseGlyph(phase: AutoresearchTbenchTrialPhase): string {
  switch (phase) {
    case "completed":
      return "●";
    case "failed":
      return "✕";
    case "running":
      return "▶";
    case "verifying":
      return "◐";
    case "setup":
      return "◌";
    default:
      return "○";
  }
}

function pickPhaseColor(phase: AutoresearchTbenchTrialPhase): "accent" | "success" | "warning" | "error" | "dim" {
  switch (phase) {
    case "completed":
      return "success";
    case "failed":
      return "error";
    case "running":
      return "accent";
    case "verifying":
      return "warning";
    case "setup":
      return "warning";
    default:
      return "dim";
  }
}

function readTrialResult(resultPath: string): ResultLike | null {
  if (!existsSync(resultPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(resultPath, "utf-8")) as ResultLike;
  } catch {
    return null;
  }
}

function listTrialDirectories(jobDir: string): string[] {
  if (!existsSync(jobDir)) {
    return [];
  }

  return readdirSync(jobDir)
    .map((entry) => join(jobDir, entry))
    .filter((entry) => {
      try {
        return statSync(entry).isDirectory();
      } catch {
        return false;
      }
    });
}

function deriveTrialSnapshot(trialDir: string, startedAtMs: number): AutoresearchTbenchTrialSnapshot {
  const trialName = trialDir.split("/").at(-1) ?? "unknown";
  const taskName = trialName.split("__")[0] ?? trialName;
  const resultPath = join(trialDir, "result.json");
  const setupStdoutPath = join(trialDir, "agent", "setup-stdout.txt");
  const eventsPath = join(trialDir, "agent", "pi-events.jsonl");
  const verifierDir = join(trialDir, "verifier");

  const result = readTrialResult(resultPath);
  if (result) {
    const reward = toNumberOrNull(result.verifier_result?.rewards?.reward);
    const failed = result.exception_info !== null && result.exception_info !== undefined;
    return {
      trialName,
      taskName: typeof result.task_name === "string" ? result.task_name : taskName,
      phase: failed ? "failed" : "completed",
      reward,
      elapsedMs: parseDurationMs(result.started_at, result.finished_at),
      activity: failed
        ? "trial failed"
        : `reward=${reward ?? 0}`,
    };
  }

  const hasVerifier = existsSync(verifierDir) && readdirSync(verifierDir).length > 0;
  if (hasVerifier) {
    return {
      trialName,
      taskName,
      phase: "verifying",
      reward: null,
      elapsedMs: Math.max(0, nowMs() - startedAtMs),
      activity: "verifier running",
    };
  }

  if (existsSync(eventsPath)) {
    return {
      trialName,
      taskName,
      phase: "running",
      reward: null,
      elapsedMs: Math.max(0, nowMs() - startedAtMs),
      activity: readLastEventActivity(eventsPath),
    };
  }

  if (existsSync(setupStdoutPath) || existsSync(join(trialDir, "agent", "pi-setup-info.json"))) {
    return {
      trialName,
      taskName,
      phase: "setup",
      reward: null,
      elapsedMs: Math.max(0, nowMs() - startedAtMs),
      activity: cropSingleLine(pickLastNonEmptyLine(tailText(setupStdoutPath, 6_000)) || "agent setup", 80),
    };
  }

  return {
    trialName,
    taskName,
    phase: "pending",
    reward: null,
    elapsedMs: Math.max(0, nowMs() - startedAtMs),
    activity: "waiting",
  };
}

function findActiveJobDir(jobsDir: string, startedAtMs: number): string | null {
  if (!existsSync(jobsDir)) {
    return null;
  }

  const candidates = readdirSync(jobsDir)
    .map((entry) => join(jobsDir, entry))
    .filter((entry) => {
      try {
        return statSync(entry).isDirectory();
      } catch {
        return false;
      }
    })
    .map((entry) => {
      const mtimeMs = statSync(entry).mtimeMs;
      return { path: entry, mtimeMs };
    })
    .filter((entry) => entry.mtimeMs >= startedAtMs - 2_000)
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  return candidates[0]?.path ?? null;
}

function buildStatusLine(snapshot: Omit<AutoresearchTbenchLiveSnapshot, "statusLine">): string {
  if (!snapshot.jobDir) {
    return "job is starting";
  }
  return [
    `job=${snapshot.jobDir.split("/").at(-1) ?? "-"}`,
    `done=${snapshot.completedTrials}/${snapshot.totalTrials}`,
    `ok=${snapshot.successCount}`,
    `fail=${snapshot.failedCount}`,
    `run=${snapshot.runningCount}`,
    `setup=${snapshot.setupCount}`,
  ].join("  ");
}

export function collectAutoresearchTbenchLiveSnapshot(input: {
  label: string;
  jobsDir: string;
  taskNames: string[];
  startedAtMs: number;
}): AutoresearchTbenchLiveSnapshot {
  const jobDir = findActiveJobDir(resolve(input.jobsDir), input.startedAtMs);
  const trials = jobDir
    ? listTrialDirectories(jobDir).map((trialDir) => deriveTrialSnapshot(trialDir, input.startedAtMs))
    : [];

  const totalTrials = input.taskNames.length;
  const completedTrials = trials.filter((trial) => trial.phase === "completed" || trial.phase === "failed").length;
  const successCount = trials.filter((trial) => trial.phase === "completed" && (trial.reward ?? 0) >= 1).length;
  const failedCount = trials.filter((trial) => trial.phase === "failed").length;
  const runningCount = trials.filter((trial) => trial.phase === "running" || trial.phase === "verifying").length;
  const setupCount = trials.filter((trial) => trial.phase === "setup").length;
  const pendingCount = Math.max(0, totalTrials - trials.length) + trials.filter((trial) => trial.phase === "pending").length;

  const sortedTrials = [...trials].sort((left, right) => {
    const phaseOrder: Record<AutoresearchTbenchTrialPhase, number> = {
      running: 0,
      setup: 1,
      verifying: 2,
      pending: 3,
      failed: 4,
      completed: 5,
    };
    return phaseOrder[left.phase] - phaseOrder[right.phase] || left.taskName.localeCompare(right.taskName);
  });

  const snapshotWithoutStatus: Omit<AutoresearchTbenchLiveSnapshot, "statusLine"> = {
    label: input.label,
    startedAtMs: input.startedAtMs,
    elapsedMs: Math.max(0, nowMs() - input.startedAtMs),
    jobsDir: resolve(input.jobsDir),
    jobDir,
    totalTrials,
    completedTrials,
    successCount,
    failedCount,
    runningCount,
    setupCount,
    pendingCount,
    trials: sortedTrials,
  };

  return {
    ...snapshotWithoutStatus,
    statusLine: buildStatusLine(snapshotWithoutStatus),
  };
}

export function renderAutoresearchTbenchLiveView(
  theme: Theme,
  snapshot: AutoresearchTbenchLiveSnapshot,
  width: number,
  height?: number,
): string[] {
  const lines: string[] = [];
  const add = (line = "") => lines.push(truncateToWidth(line, width));

  add(theme.bold(theme.fg("accent", `Autoresearch Tbench [${snapshot.label}]`)));
  add(theme.fg("dim", `${snapshot.statusLine}  elapsed=${formatElapsedMs(snapshot.elapsedMs)}`));
  add(theme.fg("dim", `[q] close  jobs_dir=${snapshot.jobsDir}`));
  add("");

  if (snapshot.trials.length === 0) {
    add(theme.fg("dim", "trial directories are not visible yet"));
    return lines.slice(0, Math.max(1, height ?? lines.length));
  }

  add(theme.fg("dim", "trial                          phase       activity"));
  for (const trial of snapshot.trials) {
    const glyph = theme.fg(pickPhaseColor(trial.phase), pickPhaseGlyph(trial.phase));
    const taskText = truncateToWidth(`${glyph} ${trial.taskName}`, 30);
    const phaseText = theme.fg(pickPhaseColor(trial.phase), trial.phase.padEnd(10));
    const activity = trial.activity || "-";
    add(`${taskText.padEnd(30)}  ${phaseText}  ${activity}`);
  }

  return lines.slice(0, Math.max(1, height ?? lines.length));
}

export function createAutoresearchTbenchLiveMonitor(
  ctx: LiveMonitorContext,
  title: string,
): AutoresearchTbenchLiveMonitorController | undefined {
  if (!ctx?.hasUI || !ctx?.ui?.custom) {
    return undefined;
  }

  let snapshot: AutoresearchTbenchLiveSnapshot = {
    label: title,
    startedAtMs: nowMs(),
    elapsedMs: 0,
    jobsDir: "",
    jobDir: null,
    totalTrials: 0,
    completedTrials: 0,
    successCount: 0,
    failedCount: 0,
    runningCount: 0,
    setupCount: 0,
    pendingCount: 0,
    statusLine: "waiting for job",
    trials: [],
  };
  let requestRender: (() => void) | undefined;
  let doneUi: (() => void) | undefined;
  let closed = false;

  const uiPromise = ctx.ui.custom((tui: TuiInstance, theme: Theme, _kb: KeybindingMap, done: () => void) => {
    doneUi = done;
    requestRender = () => {
      if (!closed) {
        tui.requestRender();
      }
    };

    return {
      render: (w: number) => renderAutoresearchTbenchLiveView(theme, snapshot, w, tui.terminal.rows),
      invalidate: () => {},
      handleInput: (input: string) => {
        if (input === "q" || matchesKey(input, Key.escape)) {
          closed = true;
          done();
        }
      },
    };
  }, {
    overlay: true,
    overlayOptions: () => ({
      width: "100%",
      maxHeight: "100%",
      row: 0,
      col: 0,
      margin: 0,
    }),
  }).catch(() => undefined);

  return {
    update: (nextSnapshot: AutoresearchTbenchLiveSnapshot) => {
      snapshot = nextSnapshot;
      requestRender?.();
    },
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
      doneUi?.();
    },
    wait: async () => {
      await uiPromise;
    },
  };
}
