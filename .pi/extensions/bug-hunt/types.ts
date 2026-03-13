// Path: .pi/extensions/bug-hunt/types.ts
// What: bug-hunt 拡張で共有する型を定義する
// Why: state / report / runner の契約を 1 箇所に集めるため
// Related: .pi/extensions/bug-hunt/index.ts, .pi/extensions/bug-hunt/storage.ts, .pi/extensions/bug-hunt/reporting.ts

export type BugHuntSeverity = "low" | "medium" | "high" | "critical";
export type BugHuntStage =
  | "idle"
  | "booting"
  | "retrieve"
  | "hypothesis"
  | "investigate"
  | "observe"
  | "report"
  | "sleeping";
export type BugHuntCandidateSource = "locagent" | "repograph" | "fallback";
export type BugHuntInvestigationStatus = "supported" | "rejected" | "inconclusive";

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

export interface BugHuntQueryPlan {
  query: string;
  keywords: string[];
  bugSignals: string[];
  areasToAvoid: string[];
  confidence: number;
}

export interface BugHuntMissionBrief {
  focusFiles: string[];
  runtimeClaims: string[];
  verificationTarget: string | null;
}

export interface BugHuntCandidate {
  id: string;
  sources: BugHuntCandidateSource[];
  file: string;
  line?: number;
  endLine?: number;
  symbolName?: string;
  nodeType?: string;
  score: number;
  summary: string;
  snippet?: string;
  locagentNodeId?: string;
}

export interface BugHuntHypothesis {
  id: string;
  candidateId: string;
  titleHint: string;
  hypothesis: string;
  severity: BugHuntSeverity;
  confidence: number;
  focus: string[];
}

export interface BugHuntInvestigationResult {
  hypothesisId: string;
  candidateId: string;
  status: BugHuntInvestigationStatus;
  confidence: number;
  title: string;
  summary: string;
  why: string;
  evidence: BugHuntEvidence[];
  chain: string[];
  reproduction?: string;
  suggestedFix?: string;
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
  version: 2;
  runId: string | null;
  status: "idle" | "running" | "stopping" | "stopped" | "failed";
  currentStage: BugHuntStage;
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
  investigationParallelism: number;
  taskPrompt: string;
  model: BugHuntModelConfig | null;
  reportedFingerprints: string[];
  reportedDedupeKeys: string[];
  seenFiles: string[];
  rejectedHypotheses: string[];
  lastCandidates: string[];
  lastObserverDecision: string | null;
  missionVerificationSummary: string | null;
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
