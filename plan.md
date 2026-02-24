# Implementation Plan: M1-Parallel Integration

## Purpose

Integrate M1-Parallel paper concepts (early-stop, aggregation strategies, global failure memory) into mekann's agent-teams system while preserving stable profile defaults and backward compatibility.

---

## Changes Overview

| Priority | Feature | Files Changed | Risk |
|----------|---------|---------------|------|
| 1 | Early-stop mechanism | `concurrency.ts`, `extension.ts` | Low |
| 2 | Aggregation strategies | `judge.ts`, `result-aggregation.ts`, `extension.ts` | Low |
| 3 | Global failure memory | `team-orchestrator.ts`, `agent-runtime.ts`, new `failure-memory.ts` | Medium |
| 4 | Diverse planning | New `plan-generator.ts`, `extension.ts` | High |

---

## Detailed Changes

### 1. Early-Stop Mechanism (Priority 1)

#### 1.1 Add `runWithEarlyStop` to concurrency.ts

```typescript
// .pi/lib/concurrency.ts

export interface EarlyStopOptions<TInput, TResult> extends ConcurrencyRunOptions {
  /** Callback to check if we should stop early */
  shouldStop?: (completed: TResult[], totalCompleted: number, totalItems: number) => boolean;
  /** Callback when early stop is triggered */
  onEarlyStop?: (reason: string, completedResults: TResult[]) => void;
}

/**
 * Parallel execution with early-stop support
 * @summary Early-stop並列実行
 */
export async function runWithEarlyStop<TInput, TResult>(
  items: TInput[],
  limit: number,
  worker: (item: TInput, index: number, signal?: AbortSignal) => Promise<TResult>,
  options: EarlyStopOptions<TInput, TResult> = {},
): Promise<TResult[]> {
  if (items.length === 0) return [];

  const { shouldStop, onEarlyStop, signal, abortOnError = true } = options;
  const normalizedLimit = toPositiveLimit(limit, items.length);
  const results: (TResult | undefined)[] = new Array(items.length);
  let cursor = 0;
  let completedCount = 0;
  let earlyStopped = false;
  let firstError: unknown;
  
  const { controller: poolAbortController, cleanup } = createChildAbortController(signal);
  const effectiveSignal = poolAbortController.signal;

  const runWorker = async (): Promise<void> => {
    while (!earlyStopped) {
      ensureNotAborted(effectiveSignal);
      
      const currentIndex = cursor++;
      if (currentIndex >= items.length) return;

      try {
        const result = await worker(items[currentIndex], currentIndex, effectiveSignal);
        results[currentIndex] = result;
        completedCount++;

        // Check early-stop condition after each completion
        if (shouldStop && shouldStop(results.filter(Boolean) as TResult[], completedCount, items.length)) {
          earlyStopped = true;
          poolAbortController.abort();
          onEarlyStop?.('stop_condition_met', results.filter(Boolean) as TResult[]);
          return;
        }
      } catch (error) {
        if (firstError === undefined) {
          firstError = error;
          if (abortOnError) poolAbortController.abort();
        }
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: normalizedLimit }, () => runWorker()));
  } finally {
    cleanup();
  }

  if (firstError !== undefined && !earlyStopped) throw firstError;
  ensureNotAborted(effectiveSignal);

  return results.filter(Boolean) as TResult[];
}
```

#### 1.2 Add early-stop parameter to agent_team_run_parallel

```typescript
// .pi/extensions/agent-teams/extension.ts

// Add to tool parameters schema
earlyStop: Type.Optional(Type.Union([
  Type.Boolean({ description: "Enable early-stop on first success (default: false)" }),
  Type.Object({
    enabled: Type.Boolean(),
    confidenceThreshold: Type.Optional(Type.Number({ 
      description: "Minimum confidence to trigger stop (default: 0.85)" 
    })),
    stopOnTrusted: Type.Optional(Type.Boolean({ 
      description: "Stop when any team achieves 'trusted' verdict (default: true)" 
    })),
  }),
])),

// In execute function:
const earlyStopConfig = normalizeEarlyStopConfig(params.earlyStop, STABLE_AGENT_TEAM_RUNTIME);

// Replace runWithConcurrencyLimit with:
const teamResults = earlyStopConfig.enabled
  ? await runWithEarlyStop(enabledTeams, appliedTeamParallelism, runTeamWorker, {
      signal,
      shouldStop: (completed, completedCount, totalCount) => {
        if (earlyStopConfig.stopOnTrusted) {
          return completed.some(r => r.finalJudge?.verdict === 'trusted');
        }
        if (earlyStopConfig.confidenceThreshold) {
          return completed.some(r => 
            (r.finalJudge?.confidence ?? 0) >= earlyStopConfig.confidenceThreshold!
          );
        }
        return false;
      },
      onEarlyStop: (reason, results) => {
        logger.info("team_run.early_stop", { reason, stoppedTeams: results.length });
      },
    })
  : await runWithConcurrencyLimit(enabledTeams, appliedTeamParallelism, runTeamWorker, { signal });
```

#### 1.3 Helper function for config normalization

```typescript
// .pi/extensions/agent-teams/extension.ts

interface EarlyStopConfig {
  enabled: boolean;
  confidenceThreshold?: number;
  stopOnTrusted: boolean;
}

function normalizeEarlyStopConfig(
  param: unknown,
  stableProfile: string
): EarlyStopConfig {
  // Stable profile: always disabled (backward compatible)
  if (stableProfile === STABLE_RUNTIME_PROFILE) {
    return { enabled: false, stopOnTrusted: true };
  }
  
  if (typeof param === 'boolean') {
    return { enabled: param, stopOnTrusted: true };
  }
  if (typeof param === 'object' && param !== null) {
    const p = param as Record<string, unknown>;
    return {
      enabled: Boolean(p.enabled),
      confidenceThreshold: typeof p.confidenceThreshold === 'number' 
        ? Math.max(0, Math.min(1, p.confidenceThreshold)) 
        : undefined,
      stopOnTrusted: p.stopOnTrusted !== false,
    };
  }
  return { enabled: false, stopOnTrusted: true };
}
```

---

### 2. Aggregation Strategies (Priority 2)

#### 2.1 Define aggregation types in judge.ts

```typescript
// .pi/extensions/agent-teams/judge.ts

export type AggregationStrategy = 
  | 'rule-based'      // Current behavior (deterministic)
  | 'majority-vote'   // Most common verdict wins
  | 'best-confidence' // Highest confidence wins
  | 'llm-aggregate';  // LLM synthesizes final result

export interface AggregationInput {
  teamResults: Array<{
    teamId: string;
    memberResults: TeamMemberResult[];
    finalJudge: TeamFinalJudge;
  }>;
  strategy: AggregationStrategy;
  task: string;
}

export interface AggregationResult {
  verdict: 'trusted' | 'partial' | 'untrusted';
  confidence: number;
  selectedTeamId?: string;
  aggregatedContent?: string;
  explanation: string;
}
```

#### 2.2 Implement aggregation functions

```typescript
// .pi/extensions/agent-teams/result-aggregation.ts

import { runWithRetry } from "../../lib/retry-with-backoff.js";

/**
 * Aggregate results from multiple teams using specified strategy
 * @summary チーム結果集約
 */
export async function aggregateTeamResults(
  input: AggregationInput,
  ctx?: { model?: { id: string }; provider?: string }
): Promise<AggregationResult> {
  const { teamResults, strategy, task } = input;

  switch (strategy) {
    case 'rule-based':
      return aggregateRuleBased(teamResults);
    
    case 'majority-vote':
      return aggregateMajorityVote(teamResults);
    
    case 'best-confidence':
      return aggregateBestConfidence(teamResults);
    
    case 'llm-aggregate':
      return aggregateWithLLM(teamResults, task, ctx);
    
    default:
      return aggregateRuleBased(teamResults);
  }
}

function aggregateRuleBased(
  results: AggregationInput['teamResults']
): AggregationResult {
  // Current behavior: return first trusted, or first partial, or untrusted
  const trusted = results.find(r => r.finalJudge.verdict === 'trusted');
  if (trusted) {
    return {
      verdict: 'trusted',
      confidence: trusted.finalJudge.confidence,
      selectedTeamId: trusted.teamId,
      explanation: 'First trusted result selected (rule-based)',
    };
  }

  const partial = results.find(r => r.finalJudge.verdict === 'partial');
  if (partial) {
    return {
      verdict: 'partial',
      confidence: partial.finalJudge.confidence,
      selectedTeamId: partial.teamId,
      explanation: 'First partial result selected (rule-based)',
    };
  }

  const untrusted = results[0];
  return {
    verdict: 'untrusted',
    confidence: untrusted?.finalJudge.confidence ?? 0,
    selectedTeamId: untrusted?.teamId,
    explanation: 'No trusted/partial results, returning first (rule-based)',
  };
}

function aggregateMajorityVote(
  results: AggregationInput['teamResults']
): AggregationResult {
  const verdictCounts = { trusted: 0, partial: 0, untrusted: 0 };
  let totalConfidence = 0;

  for (const r of results) {
    verdictCounts[r.finalJudge.verdict]++;
    totalConfidence += r.finalJudge.confidence;
  }

  // Find majority verdict
  let majorityVerdict: 'trusted' | 'partial' | 'untrusted' = 'untrusted';
  let maxCount = verdictCounts.untrusted;
  
  if (verdictCounts.trusted > maxCount) {
    majorityVerdict = 'trusted';
    maxCount = verdictCounts.trusted;
  }
  if (verdictCounts.partial > maxCount) {
    majorityVerdict = 'partial';
    maxCount = verdictCounts.partial;
  }

  // Select highest confidence team with majority verdict
  const majorityTeams = results.filter(r => r.finalJudge.verdict === majorityVerdict);
  const selected = majorityTeams.reduce((best, curr) => 
    curr.finalJudge.confidence > (best?.finalJudge.confidence ?? 0) ? curr : best
  , majorityTeams[0]);

  return {
    verdict: majorityVerdict,
    confidence: totalConfidence / results.length,
    selectedTeamId: selected?.teamId,
    explanation: `Majority vote: ${verdictCounts.trusted} trusted, ${verdictCounts.partial} partial, ${verdictCounts.untrusted} untrusted`,
  };
}

function aggregateBestConfidence(
  results: AggregationInput['teamResults']
): AggregationResult {
  const best = results.reduce((best, curr) => 
    curr.finalJudge.confidence > best.finalJudge.confidence ? curr : best
  );

  return {
    verdict: best.finalJudge.verdict,
    confidence: best.finalJudge.confidence,
    selectedTeamId: best.teamId,
    explanation: `Selected highest confidence (${best.finalJudge.confidence.toFixed(2)})`,
  };
}

async function aggregateWithLLM(
  results: AggregationInput['teamResults'],
  task: string,
  ctx?: { model?: { id: string }; provider?: string }
): Promise<AggregationResult> {
  // Build summary of all team results
  const summaries = results.map(r => ({
    teamId: r.teamId,
    verdict: r.finalJudge.verdict,
    confidence: r.finalJudge.confidence,
    keyPoints: extractKeyPoints(r.memberResults),
  }));

  const prompt = `Given the following team results for task: "${task}"

${summaries.map((s, i) => `
Team ${i + 1} (${s.teamId}):
- Verdict: ${s.verdict}
- Confidence: ${s.confidence}
- Key Points: ${s.keyPoints.join(', ')}
`).join('\n')}

Synthesize a final aggregated result. Respond with:
VERDICT: [trusted|partial|untrusted]
CONFIDENCE: [0.0-1.0]
EXPLANATION: [brief explanation]`;

  // Use LLM to aggregate (requires ctx with model)
  // This is a simplified version - real implementation would use pi SDK
  // For now, fall back to majority vote
  // TODO: Implement actual LLM call when SDK integration is available
  
  return {
    ...aggregateMajorityVote(results),
    explanation: 'LLM aggregation not yet implemented, using majority vote fallback',
  };
}

function extractKeyPoints(memberResults: TeamMemberResult[]): string[] {
  const points: string[] = [];
  for (const r of memberResults) {
    if (r.status === 'success' && r.result?.content) {
      // Extract first 100 chars of each successful result
      const content = typeof r.result.content === 'string' 
        ? r.result.content 
        : JSON.stringify(r.result.content);
      points.push(content.slice(0, 100));
    }
  }
  return points;
}
```

#### 2.3 Add aggregation parameter to extension

```typescript
// .pi/extensions/agent-teams/extension.ts

aggregationStrategy: Type.Optional(Type.Union([
  Type.Literal('rule-based', { description: "Current deterministic behavior (default)" }),
  Type.Literal('majority-vote', { description: "Most common verdict wins" }),
  Type.Literal('best-confidence', { description: "Highest confidence result wins" }),
  Type.Literal('llm-aggregate', { description: "LLM synthesizes final result" }),
], { description: "Aggregation strategy for parallel team results" })),
```

---

### 3. Global Failure Memory (Priority 3)

#### 3.1 Create failure-memory.ts

```typescript
// .pi/extensions/agent-teams/failure-memory.ts

/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/failure-memory.ts
 * role: チーム間で失敗情報を共有するグローバルメモリ
 * why: M1-Parallel論文のGlobal Failure Memory概念を実装し、再計画時に失敗情報を活用するため
 * related: .pi/extensions/agent-teams/team-orchestrator.ts, .pi/extensions/agent-runtime.ts
 * public_api: GlobalFailureMemory, FailureRecord, getGlobalFailureMemory, clearGlobalFailureMemory
 * invariants: メモリはプロセス内で単一のインスタンス、レコードは最大100件まで
 * side_effects: なし（メモリ内ストレージのみ）
 * failure_modes: メモリリーク（長時間実行プロセス）、大量レコードによるパフォーマンス低下
 * @abdd.explain
 * overview: 並列実行されるチーム間で失敗情報を共有し、後続の再試行や再計画で活用するためのインメモリストア
 */

import type { TeamMemberResult } from "./storage.js";

export interface FailureRecord {
  id: string;
  teamId: string;
  memberId: string;
  timestamp: number;
  errorType: 'timeout' | 'rate-limit' | 'capacity' | 'validation' | 'unknown';
  errorMessage: string;
  taskSignature: string; // Hash of task for deduplication
  retryAttempt: number;
  recovered: boolean;
}

export interface FailureMemoryStats {
  totalRecords: number;
  uniqueErrorTypes: Record<string, number>;
  recoveryRate: number;
  recentFailures: number; // Last 5 minutes
}

const MAX_RECORDS = 100;
const RETENTION_MS = 5 * 60 * 1000; // 5 minutes

class GlobalFailureMemoryImpl {
  private records: FailureRecord[] = [];
  private recordId = 0;

  recordFailure(
    teamId: string,
    memberId: string,
    error: unknown,
    taskSignature: string,
    retryAttempt: number
  ): FailureRecord {
    const record: FailureRecord = {
      id: `fail-${++this.recordId}`,
      teamId,
      memberId,
      timestamp: Date.now(),
      errorType: this.classifyError(error),
      errorMessage: this.toErrorMessage(error),
      taskSignature,
      retryAttempt,
      recovered: false,
    };

    this.records.push(record);
    this.pruneOldRecords();
    
    return record;
  }

  markRecovered(recordId: string): void {
    const record = this.records.find(r => r.id === recordId);
    if (record) {
      record.recovered = true;
    }
  }

  getFailuresForTask(taskSignature: string): FailureRecord[] {
    return this.records.filter(r => r.taskSignature === taskSignature);
  }

  getFailuresByType(errorType: FailureRecord['errorType']): FailureRecord[] {
    return this.records.filter(r => r.errorType === errorType);
  }

  shouldSkipRetry(
    taskSignature: string,
    errorType: FailureRecord['errorType']
  ): boolean {
    const recentFailures = this.records.filter(
      r => r.taskSignature === taskSignature && 
           r.errorType === errorType &&
           !r.recovered &&
           Date.now() - r.timestamp < 60000 // Last 1 minute
    );
    
    // Skip if 3+ recent failures of same type
    return recentFailures.length >= 3;
  }

  getStats(): FailureMemoryStats {
    const now = Date.now();
    const recentCutoff = now - RETENTION_MS;
    const recentFailures = this.records.filter(r => r.timestamp > recentCutoff);
    
    const errorTypeCounts: Record<string, number> = {};
    for (const r of this.records) {
      errorTypeCounts[r.errorType] = (errorTypeCounts[r.errorType] || 0) + 1;
    }

    const recovered = this.records.filter(r => r.recovered).length;

    return {
      totalRecords: this.records.length,
      uniqueErrorTypes: errorTypeCounts,
      recoveryRate: this.records.length > 0 ? recovered / this.records.length : 0,
      recentFailures: recentFailures.length,
    };
  }

  clear(): void {
    this.records = [];
    this.recordId = 0;
  }

  private pruneOldRecords(): void {
    const cutoff = Date.now() - RETENTION_MS;
    this.records = this.records.filter(r => r.timestamp > cutoff);
    
    // Also enforce max records
    if (this.records.length > MAX_RECORDS) {
      this.records = this.records.slice(-MAX_RECORDS);
    }
  }

  private classifyError(error: unknown): FailureRecord['errorType'] {
    const msg = this.toErrorMessage(error).toLowerCase();
    if (msg.includes('timeout')) return 'timeout';
    if (msg.includes('rate') || msg.includes('limit') || msg.includes('429')) return 'rate-limit';
    if (msg.includes('capacity')) return 'capacity';
    if (msg.includes('validation') || msg.includes('invalid')) return 'validation';
    return 'unknown';
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return JSON.stringify(error);
  }
}

// Singleton instance
let globalMemory: GlobalFailureMemoryImpl | undefined;

export function getGlobalFailureMemory(): GlobalFailureMemoryImpl {
  if (!globalMemory) {
    globalMemory = new GlobalFailureMemoryImpl();
  }
  return globalMemory;
}

export function clearGlobalFailureMemory(): void {
  globalMemory?.clear();
}

export type GlobalFailureMemory = GlobalFailureMemoryImpl;
```

#### 3.2 Integrate with team-orchestrator.ts

```typescript
// .pi/extensions/agent-teams/team-orchestrator.ts

import { 
  getGlobalFailureMemory, 
  type FailureRecord 
} from "./failure-memory.js";

// In executeFailedMemberRetries function:
async function executeFailedMemberRetries(
  input: TeamTaskInput,
  failedMembers: TeamMember[],
  initialResults: TeamMemberResult[],
  // ... other params
): Promise<TeamMemberResult[]> {
  const memory = getGlobalFailureMemory();
  const taskSignature = hashTask(input.task);
  const retryResults: TeamMemberResult[] = [];

  for (const member of failedMembers) {
    // Check global memory for recent failures
    if (memory.shouldSkipRetry(taskSignature, 'rate-limit')) {
      logger.warn("team.retry.skipped", { 
        memberId: member.id, 
        reason: "global_memory_rate_limit_pattern" 
      });
      continue;
    }

    // Record failure attempt
    const failureRecord = memory.recordFailure(
      input.team.id,
      member.id,
      'retry_attempt',
      taskSignature,
      input.failedMemberRetryRounds || 1
    );

    try {
      const result = await runMember({ ...input, member });
      if (result.status === 'success') {
        memory.markRecovered(failureRecord.id);
      }
      retryResults.push(result);
    } catch (error) {
      memory.recordFailure(
        input.team.id,
        member.id,
        error,
        taskSignature,
        input.failedMemberRetryRounds || 1
      );
      throw error;
    }
  }

  return retryResults;
}

function hashTask(task: string): string {
  // Simple hash for task deduplication
  let hash = 0;
  for (let i = 0; i < task.length; i++) {
    const char = task.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `task-${hash.toString(16)}`;
}
```

---

### 4. Diverse Planning (Priority 4 - Optional)

> **Note**: This is marked as high risk and optional. Consider implementing after P1-P3 are stable.

#### 4.1 Create plan-generator.ts

```typescript
// .pi/extensions/agent-teams/plan-generator.ts

/**
 * Generate diverse execution plans for parallel teams
 * Each plan has different approach/temperature for variation
 */

export interface DiversePlan {
  planId: string;
  approach: 'systematic' | 'creative' | 'conservative' | 'exploratory';
  temperature: number;
  modifiedTask: string;
  additionalContext?: string;
}

export interface DiversePlanningConfig {
  enabled: boolean;
  numPlans: number;
  temperatureRange: [number, number]; // [min, max]
  approaches: DiversePlan['approach'][];
}

const APPROACH_PROMPTS: Record<DiversePlan['approach'], string> = {
  systematic: 'Approach this task methodically, step by step.',
  creative: 'Think outside the box and consider unconventional solutions.',
  conservative: 'Focus on the most reliable, proven approaches.',
  exploratory: 'Explore multiple possibilities and alternatives.',
};

export function generateDiversePlans(
  baseTask: string,
  config: DiversePlanningConfig
): DiversePlan[] {
  if (!config.enabled) {
    return [{
      planId: 'default',
      approach: 'systematic',
      temperature: 0.7,
      modifiedTask: baseTask,
    }];
  }

  const plans: DiversePlan[] = [];
  const [minTemp, maxTemp] = config.temperatureRange;
  const tempStep = (maxTemp - minTemp) / (config.numPlans - 1 || 1);

  for (let i = 0; i < config.numPlans; i++) {
    const approach = config.approaches[i % config.approaches.length];
    const temperature = minTemp + tempStep * i;

    plans.push({
      planId: `plan-${i + 1}`,
      approach,
      temperature,
      modifiedTask: `${baseTask}\n\n${APPROACH_PROMPTS[approach]}`,
      additionalContext: `Using ${approach} approach with temperature ${temperature.toFixed(2)}`,
    });
  }

  return plans;
}
```

---

## Implementation Steps

### Phase 1: Early-Stop (Week 1)

1. [ ] Add `runWithEarlyStop` to `.pi/lib/concurrency.ts`
2. [ ] Add `earlyStop` parameter to `agent_team_run_parallel` schema
3. [ ] Implement `normalizeEarlyStopConfig` helper
4. [ ] Add unit tests for early-stop logic
5. [ ] Update documentation

### Phase 2: Aggregation (Week 2)

1. [ ] Add `AggregationStrategy` type to `judge.ts`
2. [ ] Implement aggregation functions in `result-aggregation.ts`
3. [ ] Add `aggregationStrategy` parameter to extension
4. [ ] Add unit tests for each strategy
5. [ ] Update documentation

### Phase 3: Global Failure Memory (Week 3)

1. [ ] Create `.pi/extensions/agent-teams/failure-memory.ts`
2. [ ] Integrate with `team-orchestrator.ts` retry logic
3. [ ] Add memory stats to run output
4. [ ] Add unit tests for memory operations
5. [ ] Update documentation

### Phase 4: Diverse Planning (Optional, Week 4+)

1. [ ] Create `.pi/extensions/agent-teams/plan-generator.ts`
2. [ ] Add `diversePlanning` parameter to extension
3. [ ] Integrate with team execution
4. [ ] Add integration tests
5. [ ] Update documentation

---

## Considerations

### Backward Compatibility

- All new features default to OFF in stable profile
- `earlyStop: false` by default (current behavior)
- `aggregationStrategy: 'rule-based'` by default (current behavior)
- Global failure memory starts empty each run

### Runtime Load Guard Integration

- Early-stop must release capacity reservations properly
- Aborted teams should not count against parallelism limits
- Global memory should track capacity-related failures

### Performance

- Early-stop reduces latency for simple tasks
- Aggregation adds minimal overhead (O(n) for n teams)
- Global memory bounded to 100 records, 5-minute retention
- Diverse planning increases total compute but improves quality

### Testing Strategy

- Unit tests for each new function
- Integration tests with mock teams
- Manual testing with real LLM calls
- Performance benchmarks for early-stop

---

## Todo Checklist

### Phase 1: Early-Stop
- [ ] Implement `runWithEarlyStop` in concurrency.ts
- [ ] Add early-stop schema to extension.ts
- [ ] Implement normalizeEarlyStopConfig helper
- [ ] Write unit tests for early-stop
- [ ] Update docs/02-user-guide/08-agent-teams.md

### Phase 2: Aggregation
- [ ] Add AggregationStrategy types to judge.ts
- [ ] Implement aggregateTeamResults in result-aggregation.ts
- [ ] Add aggregationStrategy parameter to extension
- [ ] Write unit tests for aggregation strategies
- [ ] Update documentation

### Phase 3: Global Failure Memory
- [ ] Create failure-memory.ts module
- [ ] Integrate with team-orchestrator.ts
- [ ] Add failure memory stats to output
- [ ] Write unit tests for memory operations
- [ ] Update documentation

### Phase 4: Diverse Planning (Optional)
- [ ] Create plan-generator.ts
- [ ] Add diversePlanning parameter
- [ ] Integrate with team execution
- [ ] Write integration tests
- [ ] Update documentation

---

## References

- Research document: `research.md`
- M1-Parallel paper concepts
- Current architecture: `.pi/extensions/agent-teams/`
- Concurrency utility: `.pi/lib/concurrency.ts`
