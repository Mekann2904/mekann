# Research Report: M1-Parallel Paper Integration Analysis

## Executive Summary

The current agent-teams system already implements several core concepts from the M1-Parallel paper, but lacks key advanced features like **early-stop**, **diverse planning**, and **LLM-based aggregation**.

---

## 1. Existing Parallel Execution Functionality

### 1.1 agent_team_run_parallel Implementation

**Location**: `.pi/extensions/agent-teams/extension.ts` (lines 1216-1800)

**Current Behavior**:
- Executes multiple teams concurrently using `runWithConcurrencyLimit()`
- Uses **adaptive parallelism** controlled by `adaptivePenalty` controller
- Respects runtime capacity limits via `acquireRuntimeDispatchPermit()`
- All teams run to completion - **NO early-stop mechanism**

**Key Code Pattern**:
```typescript
const results = await runWithConcurrencyLimit(
  enabledTeams,
  appliedTeamParallelism,  // Concurrent team limit
  async (team) => { ... }
);
```

### 1.2 subagent_run_parallel Implementation

**Location**: `.pi/extensions/subagents.ts` (lines 824-1140)

**Current Behavior**:
- Similar pattern to agent_team_run_parallel
- Uses `runWithConcurrencyLimit()` for parallel execution
- All subagents run to completion - **NO early-stop mechanism**

### 1.3 Runtime Load Guard (Parallelism Control)

**Location**: `.pi/extensions/agent-runtime.ts`

**Mechanism**:
1. **Reservation-based capacity management**:
   - `tryReserveRuntimeCapacity()` - immediate capacity check
   - `reserveRuntimeCapacity()` - wait with backoff for capacity
   - `acquireRuntimeDispatchPermit()` - unified admission control

2. **Dynamic limits**:
   - `maxTotalActiveLlm` - total concurrent LLM calls
   - `maxParallelTeamsPerRun` - concurrent teams per run
   - `maxParallelTeammatesPerTeam` - concurrent members per team
   - Cross-instance coordination via `getMyParallelLimit()`

3. **Adaptive penalty controller**:
   - Raises penalty on rate-limit/capacity errors
   - Lowers penalty on success
   - Reduces effective parallelism dynamically

---

## 2. Early-Stop Functionality

### 2.1 Current State: **NOT IMPLEMENTED**

**Finding**: Neither `agent_team_run_parallel` nor `subagent_run_parallel` implements early-stop.

**Evidence**:
- Both use `runWithConcurrencyLimit()` which waits for ALL tasks
- No `Promise.race()` or abort-on-first-success pattern
- No configurable termination conditions

### 2.2 Related: Abort-on-Error in DAG Execution

**Location**: `.pi/extensions/subagents.ts` - `subagent_run_dag`

```typescript
abortOnFirstError: Type.Optional(Type.Boolean({ 
  description: "Stop on first task failure (default: false)" 
})),
```

This is the **closest existing feature** but only handles failures, not early-success.

### 2.3 Gap Analysis for M1-Parallel Early-Stop

| Feature | Current Status | M1-Parallel Requirement |
|---------|---------------|------------------------|
| First-success stop | Missing | Required |
| Success criteria check | Partial (in finalJudge) | Required at runtime |
| Abort signal propagation | Implemented | Available |
| Per-team completion callback | Implemented | Available |

---

## 3. Aggregation Functionality

### 3.1 runFinalJudge Implementation

**Location**: `.pi/extensions/agent-teams/judge.ts`

**Current Behavior**:
- **Deterministic rule-based judge** (no LLM call for final verdict)
- Computes uncertainty proxy: `uIntra`, `uInter`, `uSys`
- Returns verdict: `trusted`, `partial`, or `untrusted`

```typescript
export async function runFinalJudge(input: {
  team: TeamDefinition;
  task: string;
  strategy: TeamStrategy;
  memberResults: TeamMemberResult[];
  proxy: TeamUncertaintyProxy;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<TeamFinalJudge>
```

### 3.2 Uncertainty Computation

**Mechanism**:
- **uIntra**: Internal consistency (failed ratio, low confidence, no evidence, contradiction)
- **uInter**: Inter-member agreement (conflict ratio, confidence spread)
- **uSys**: System uncertainty (weighted combination)

**Collapse Signals**:
- `high_intra_uncertainty` (threshold: 0.55)
- `high_inter_disagreement` (threshold: 0.55)
- `high_system_uncertainty` (threshold: 0.60)
- `teammate_failures` (threshold: 30%)
- `insufficient_evidence` (threshold: 50%)

### 3.3 Aggregation Strategies: **NOT IMPLEMENTED**

| Strategy | M1-Parallel | Current System |
|----------|-------------|----------------|
| Majority voting | Yes | **No** |
| LLM-based aggregation | Yes | **No** (rule-based only) |
| Best-of-k selection | Yes | **No** |
| Weighted confidence merge | Possible | **Partial** (via uncertainty proxy) |

### 3.4 Result Aggregation (Parallel Teams)

**Location**: `.pi/extensions/agent-teams/result-aggregation.ts`

```typescript
export function resolveTeamParallelRunOutcome(
  results: Array<{
    team: TeamDefinition;
    runRecord: TeamRunRecord;
    memberResults: TeamMemberResult[];
  }>,
): RunOutcomeSignal & {
  failedTeamIds: string[];
  partialTeamIds: string[];
  failedMemberIdsByTeam: Record<string, string[]>;
}
```

**Current behavior**: Collects all results, categorizes success/partial/failure - **no selection strategy**.

---

## 4. Failed Member Retry Functionality

### 4.1 failedMemberRetryRounds Implementation

**Location**: `.pi/extensions/agent-teams/team-orchestrator.ts`

**Current Behavior**:
```typescript
const failedMemberRetryRounds = normalizeFailedMemberRetryRounds(
  input.failedMemberRetryRounds,
  DEFAULT_FAILED_MEMBER_RETRY_ROUNDS,  // 0 in stable profile
  STABLE_AGENT_TEAM_RUNTIME,
);
```

**Retry Logic** (in `executeFailedMemberRetries`):
1. Identify failed members after initial phase
2. Filter by `shouldRetryFailedMemberResult()`:
   - Excludes rate-limit/capacity errors
   - Allows timeout and transient errors
3. Retry up to `failedMemberRetryRounds` times
4. Track `recoveredMembers` set

### 4.2 Inter-Team Failure Sharing: **NOT IMPLEMENTED**

**Finding**: No global memory for sharing failure information between teams.

**Current State**:
- Each team has its own `communicationAudit` log
- No cross-team memory or shared state
- Retry decisions are **per-team local**

### 4.3 Gap Analysis for M1-Parallel Global Memory

| Feature | Current Status | M1-Parallel Requirement |
|---------|---------------|------------------------|
| Intra-team failure sharing | Implemented via communication | Team-local |
| Cross-team failure memory | Missing | Required |
| Error type classification | Implemented | Available |
| Adaptive retry policy | Partial | Enhanced |

---

## 5. Plan Generation Functionality

### 5.1 Current State: **SINGLE PLAN ONLY**

**Finding**: The system executes a single fixed plan per team - no diverse/repeated planning.

**Evidence**:
- `agent_team_run_parallel` uses static team definitions
- No plan generation or mutation
- No temperature-based diversity

### 5.2 Communication Context as "Discussion"

**Current Behavior**:
- Teams communicate via `communicationRounds`
- Each round shares partner outputs
- Final judge evaluates consensus

This is closer to **discussion-based refinement** than diverse planning.

### 5.3 Gap Analysis for M1-Parallel Planning

| Feature | Current Status | M1-Parallel Requirement |
|---------|---------------|------------------------|
| Diverse planning | Missing | k different plans |
| Repeated planning | Missing | k independent runs |
| Temperature variation | Missing | Diversity control |
| Plan selection | N/A | Aggregation after |

---

## 6. Integration Opportunities

### 6.1 Early-Stop Integration Points

**Minimal Change**:
```typescript
// In agent_team_run_parallel
const results = await runWithEarlyStop({
  teams: enabledTeams,
  parallelism: appliedTeamParallelism,
  stopCondition: (completed, total) => {
    // Check if any team achieved high confidence
    return completed.some(r => r.finalJudge?.confidence > 0.9);
  },
  signal,
});
```

**Required Changes**:
1. Add `earlyStop` option to tool parameters
2. Implement `runWithEarlyStop()` utility (Promise.race pattern)
3. Add runtime success criteria checking

### 6.2 Aggregation Strategy Integration

**Minimal Change**:
```typescript
// Add to runFinalJudge or new function
type AggregationStrategy = 
  | 'rule-based'  // Current behavior
  | 'majority-vote'
  | 'llm-aggregate'
  | 'best-of-k';

async function aggregateTeamResults(
  results: TeamResult[],
  strategy: AggregationStrategy
): Promise<AggregatedResult>
```

### 6.3 Diverse Planning Integration

**Larger Change**:
- Requires plan generation capability
- Could integrate with Task Planner Skill
- Temperature control for LLM diversity

---

## 7. Architecture Compatibility

### 7.1 Compatible Patterns

| M1-Parallel Concept | Compatible With | Changes Needed |
|---------------------|-----------------|----------------|
| Early-stop | `runWithConcurrencyLimit` | Replace with race-aware version |
| Aggregation | `runFinalJudge` | Add strategy parameter |
| Retry with memory | `failedMemberRetryRounds` | Add global memory store |
| Diverse planning | Team definitions | Plan generation layer |

### 7.2 Incompatible/Risky Areas

1. **Stable profile constraint**: Current system prioritizes determinism over optimization
2. **Capacity management**: Early-stop may strand reservations
3. **Cross-team coordination**: Global memory requires careful synchronization

---

## 8. Recommendations

### 8.1 Quick Wins (Low Risk)

1. **Add early-stop option** to `agent_team_run_parallel`:
   - Default: `false` (preserve current behavior)
   - Optional: `stopOnFirstSuccess: true`

2. **Add aggregation strategy parameter**:
   - Default: `rule-based` (current behavior)
   - Optional: `majority-vote`, `best-confidence`

### 8.2 Medium Investment

1. **Global failure memory**:
   - Shared `failureRegistry` in runtime state
   - Per-error-type retry policies

2. **Enhanced finalJudge**:
   - LLM-based aggregation option
   - Configurable aggregation strategies

### 8.3 Large Investment

1. **Diverse planning system**:
   - Plan generation module
   - Temperature-based diversity
   - Plan evaluation and selection

---

## 9. Conclusion

**Integration Feasibility**: **HIGH**

The existing architecture is well-structured for M1-Parallel integration:
- Modular design allows incremental changes
- Runtime capacity management supports early-stop
- Judge system provides aggregation foundation

**Priority Order**:
1. Early-stop (highest value, lowest risk)
2. Aggregation strategies (medium value, low risk)
3. Global failure memory (medium value, medium risk)
4. Diverse planning (high value, high risk)

---

## Appendix: Key Files

| File | Purpose |
|------|---------|
| `.pi/extensions/agent-teams/extension.ts` | Main team orchestration |
| `.pi/extensions/agent-teams/team-orchestrator.ts` | Task execution flow |
| `.pi/extensions/agent-teams/judge.ts` | Final judge and uncertainty |
| `.pi/extensions/agent-teams/result-aggregation.ts` | Result collection |
| `.pi/extensions/agent-teams/parallel-execution.ts` | Capacity resolution |
| `.pi/extensions/agent-runtime.ts` | Runtime capacity management |
| `.pi/extensions/subagents.ts` | Subagent parallel execution |
| `.pi/lib/concurrency.ts` | `runWithConcurrencyLimit` utility |
