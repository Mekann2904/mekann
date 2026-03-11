// Path: .pi/extensions/bug-hunt/types.ts
// What: bug-hunt 拡張で共有する型を定義する
// Why: state / report / runner の契約を 1 箇所に集めるため
// Related: .pi/extensions/bug-hunt/index.ts, .pi/extensions/bug-hunt/storage.ts, .pi/extensions/bug-hunt/reporting.ts

export type BugHuntSeverity = "low" | "medium" | "high" | "critical";

export interface BugHuntModelConfig {
  provider: string;
  id: string;
  thinkingLevel?: string;
}

export interface BugHuntEvidence {
  file: string;
  line?: number;
  reason: string;
}

export interface BugHuntReport {
  title: string;
  summary: string;
  severity: BugHuntSeverity;
  confidence: number;
  why: string;
  reproduction?: string;
  suggestedFix?: string;
  evidence: BugHuntEvidence[];
  dedupeKey: string;
}

export interface BugHuntState {
  version: 1;
  runId: string | null;
  status: "idle" | "running" | "stopping" | "stopped" | "failed";
  backgroundProcessId: string | null;
  startedAt: string | null;
  stoppedAt: string | null;
  lastHeartbeatAt: string | null;
  lastIterationAt: string | null;
  lastSummary: string | null;
  lastError: string | null;
  stopRequested: boolean;
  iterationCount: number;
  reportedCount: number;
  intervalMs: number;
  timeoutMs: number;
  taskPrompt: string;
  model: BugHuntModelConfig | null;
  reportedFingerprints: string[];
}

export type BugHuntModelResult =
  | {
      status: "bug_found";
      report: BugHuntReport;
    }
  | {
      status: "no_bug";
      reason: string;
    };
