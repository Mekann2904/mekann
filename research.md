# Research Report: Parallel Execution System and LLMCompiler Integration

**Date**: 2026-02-24
**Investigator**: Subagent (researcher)

---

## 1. Current System Analysis

### 1.1 Architecture Overview

The current parallel execution system consists of three main layers:

```
┌─────────────────────────────────────────────────────────────┐
│                    Extension Layer                          │
│  subagents.ts          │  agent-teams/extension.ts          │
│  - subagent_run        │  - agent_team_run                   │
│  - subagent_run_parallel│  - agent_team_run_parallel        │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    Orchestration Layer                      │
│  subagents/task-execution.ts  │  agent-teams/               │
│  - runSubagentTask            │  - team-orchestrator.ts      │
│                                │  - member-execution.ts      │
│                                │  - communication.ts         │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    Runtime Layer                            │
│  lib/concurrency.ts     │  agent-runtime.ts                 │
│  - runWithConcurrencyLimit│  - Capacity reservation         │
│  - AbortSignal handling  │  - Adaptive penalty              │
│                          │  - Priority scheduling           │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Subagent Parallel Execution

**File**: `.pi/extensions/subagents.ts`

**Key Functions**:
- `subagent_run`: Single subagent execution
- `subagent_run_parallel`: Multiple subagents in parallel

**Implementation Details**:

1. **Concurrency Control**:
   ```typescript
   // Uses runWithConcurrencyLimit from lib/concurrency.ts
   const results = await runWithConcurrencyLimit(
     activeAgents,
     Math.max(1, effectiveParallelism),
     async (agent) => { ... }
   );
   ```

2. **Adaptive Parallelism**:
   - Baseline parallelism calculated from config limits
   - Penalty-based reduction: `effectiveParallelism = adaptivePenalty.applyLimit(baselineParallelism)`
   - Penalty increases on rate_limit/capacity errors
   - Penalty decreases on successful operations

3. **Capacity Management**:
   ```typescript
   // Reserve capacity before execution
   const dispatchPermit = await acquireRuntimeDispatchPermit({
     toolName: "subagent_run_parallel",
     candidate: { additionalRequests: 1, additionalLlm: effectiveParallelism },
     ...
   });
   ```

4. **Current Constraints**:
   - All subagents receive the same task (no task decomposition)
   - No dependency tracking between subagents
   - Results are aggregated post-hoc, no inter-subagent communication
   - Parallelism is static per run (no dynamic adjustment)

### 1.3 Agent Team Parallel Execution

**Files**: 
- `.pi/extensions/agent-teams/extension.ts`
- `.pi/extensions/agent-teams/team-orchestrator.ts`
- `.pi/extensions/agent-teams/parallel-execution.ts`

**Key Functions**:
- `agent_team_run`: Single team execution (members in parallel)
- `agent_team_run_parallel`: Multiple teams in parallel

**Implementation Details**:

1. **Multi-Level Parallelism**:
   ```typescript
   // Team parallelism (across teams)
   const effectiveTeamParallelism = adaptivePenalty.applyLimit(baselineTeamParallelism);
   
   // Member parallelism (within team)
   const effectiveMemberParallelism = adaptivePenalty.applyLimit(baselineMemberParallelism);
   ```

2. **Communication Rounds**:
   ```typescript
   // Phase 1: Initial execution (parallel)
   memberResults = await runWithConcurrencyLimit(activeMembers, memberParallelLimit, ...);
   
   // Phase 2: Communication rounds (sequential)
   for (let round = 1; round <= communicationRounds; round++) {
     // Members receive context from partners
     const communicationContext = buildCommunicationContext({...});
     // Execute with partner context
   }
   ```

3. **Failed Member Retry**:
   - Separate retry mechanism for failed members
   - Retry rounds configurable via `failedMemberRetryRounds`
   - Retry only eligible failures (excludes rate_limit, capacity errors)

4. **Final Judge**:
   - Aggregates member results
   - Computes uncertainty proxy (uIntra, uInter, uSys)
   - Produces verdict (trusted/partial/uncertain)

5. **Current Constraints**:
   - Communication links are pre-defined (static topology)
   - All members execute same task with role-specific prompts
   - No DAG-based task decomposition
   - No dynamic replanning based on intermediate results

### 1.4 Core Concurrency Library

**File**: `.pi/lib/concurrency.ts`

**Key Function**: `runWithConcurrencyLimit`

**Implementation**:
```typescript
export async function runWithConcurrencyLimit<TInput, TResult>(
  items: TInput[],
  limit: number,
  worker: (item: TInput, index: number, signal?: AbortSignal) => Promise<TResult>,
  options: ConcurrencyRunOptions = {},
): Promise<TResult[]>
```

**Features**:
- Worker pool pattern with configurable parallelism
- AbortSignal propagation via child controllers
- Error handling: captures first error, continues workers to avoid dangling
- No dependency management (all items are independent)

### 1.5 Runtime Capacity Management

**File**: `.pi/extensions/agent-runtime.ts`

**Key Components**:

1. **Global State Management**:
   ```typescript
   interface AgentRuntimeState {
     subagents: { activeRunRequests, activeAgents, ... };
     teams: { activeTeamRuns, activeTeammates, ... };
     limits: AgentRuntimeLimits;
     reservations: RuntimeCapacityReservationRecord[];
   }
   ```

2. **Capacity Reservation**:
   - `tryReserveRuntimeCapacity`: Immediate attempt (no wait)
   - `reserveRuntimeCapacity`: Wait until capacity available
   - `acquireRuntimeDispatchPermit`: Full dispatch pipeline with queue

3. **Priority Scheduling**:
   - `PriorityTaskQueue` with 5 levels (critical to background)
   - Task metadata includes source, estimated duration, rounds

4. **Feature Flags**:
   - `PI_USE_SCHEDULER`: Enable scheduler-based capacity management
   - Multiple execution paths based on flags

### 1.6 Adaptive Penalty System

**File**: `.pi/lib/adaptive-penalty.ts`

**Modes**:
- `legacy`: Linear decay (+1/-1 steps)
- `enhanced`: Exponential decay + reason-based weights

**Penalty Reasons**:
```typescript
type PenaltyReason = "rate_limit" | "timeout" | "capacity" | "schema_violation";
```

**Default Weights** (enhanced mode):
- rate_limit: 2.0
- capacity: 1.5
- timeout: 1.0
- schema_violation: 0.5

---

## 2. LLMCompiler Core Concepts

### 2.1 Paper Summary: "An LLM Compiler for Parallel Function Calling"

**Authors**: Berkeley AI Research, LMSYS
**Key Contribution**: System for parallel function calling with dependency-aware execution

### 2.2 Core Components

#### 1. Function Calling Planner
- Generates Directed Acyclic Graph (DAG) of tasks
- Identifies dependencies between function calls
- Uses LLM to understand semantic dependencies

#### 2. Task Fetching Unit (TFU)
- Evaluates DAG to find ready-to-execute tasks
- Maintains frontier of executable tasks
- Dispatches tasks as dependencies resolve

#### 3. Executor
- Async parallel execution of independent tasks
- Maintains execution state and results
- Handles failures and retries

#### 4. Dynamic Replanning
- Re-evaluates plan based on intermediate results
- Adds new tasks or modifies dependencies
- Handles conditional execution paths

#### 5. Streamed Planner
- Generates plan incrementally
- Starts execution before full plan is complete
- Overlaps planning and execution

### 2.3 Key Innovations

1. **Dependency-Aware Scheduling**: Only executes tasks when dependencies are met
2. **Speculative Execution**: Starts tasks that might be needed
3. **Graceful Degradation**: Handles partial failures without blocking entire workflow
4. **Latency Reduction**: 3.4x speedup in benchmarks (HotpotQA, WebShop)

---

## 3. Applicability Assessment

### 3.1 Similarities with Current System

| LLMCompiler Component | Current System Equivalent | Match Level |
|-----------------------|---------------------------|-------------|
| Executor | `runWithConcurrencyLimit` | High |
| Capacity Management | `agent-runtime.ts` reservation system | High |
| Adaptive Control | `adaptive-penalty.ts` | Medium |
| Task Queue | `PriorityTaskQueue` in runtime | Medium |
| Communication | Team communication rounds | Low (different model) |
| Planner | **Missing** | None |
| TFU | **Missing** | None |
| Dynamic Replanning | **Missing** | None |
| Streamed Planner | **Missing** | None |

### 3.2 Differences

| Aspect | Current System | LLMCompiler |
|--------|----------------|-------------|
| Task Model | All agents receive same task | Tasks decomposed into DAG |
| Dependencies | None (independent execution) | DAG-based dependencies |
| Scheduling | Static parallelism per run | Dynamic based on DAG state |
| Replanning | None | Continuous based on results |
| Planning-Execution | Sequential (plan then execute) | Overlapped (streamed) |

### 3.3 Applicability by Component

#### Function Calling Planner: **HIGH**
- **Why**: Current system lacks task decomposition
- **Where**: New skill or extension: `.pi/skills/task-planner/`
- **Use Case**: Complex multi-step tasks with dependencies
- **Implementation**: LLM-based DAG generation from task description

#### Task Fetching Unit: **HIGH**
- **Why**: Current system has no dependency resolution
- **Where**: Enhance `lib/concurrency.ts` or new `lib/dag-executor.ts`
- **Use Case**: Execute tasks when dependencies are ready
- **Implementation**: Frontier-based task dispatch

#### Dynamic Replanning: **MEDIUM**
- **Why**: Current communication rounds are static
- **Where**: Enhance `team-orchestrator.ts`
- **Use Case**: Adjust plan based on member results
- **Implementation**: Post-round analysis and plan update

#### Streamed Planner: **LOW**
- **Why**: Requires significant architecture changes
- **Where**: Would need streaming LLM integration
- **Challenge**: Current pi architecture assumes complete tool calls
- **Alternative**: Focus on faster planning, not streamed execution

---

## 4. Integration Proposals (Priority Order)

### P0: Task Dependency Planner (New Skill)

**Location**: `.pi/skills/task-planner/SKILL.md`

**Purpose**: Generate DAG from task description

**Interface**:
```typescript
interface TaskPlan {
  tasks: TaskNode[];
  dependencies: Map<string, string[]>;
}

interface TaskNode {
  id: string;
  description: string;
  assignedAgent?: string;
  estimatedDuration?: number;
}
```

**Implementation**:
1. Create skill that invokes LLM to decompose task
2. Output structured DAG (JSON/YAML)
3. Store in `.pi/plans/{runId}.json`

**Effort**: 2-3 days

### P1: DAG Executor (Library Enhancement)

**Location**: `.pi/lib/dag-executor.ts`

**Purpose**: Execute tasks with dependency resolution

**Interface**:
```typescript
export async function executeDag<T>(
  plan: TaskPlan,
  executor: (task: TaskNode, signal?: AbortSignal) => Promise<T>,
  options: DagExecutorOptions
): Promise<DagResult<T>>
```

**Features**:
- Frontier-based dispatch
- Dependency resolution
- Parallel execution of independent tasks
- Failure handling (partial results)

**Effort**: 3-4 days

### P2: Enhanced Team Orchestrator

**Location**: `.pi/extensions/agent-teams/team-orchestrator.ts`

**Changes**:
1. Accept pre-generated DAG from planner
2. Execute members according to DAG dependencies
3. Support member-specific subtasks (not same task for all)
4. Dynamic replanning after each round

**Effort**: 4-5 days

### P3: Streaming Planner Integration

**Location**: New extension `.pi/extensions/streaming-planner.ts`

**Purpose**: Generate plan incrementally while starting execution

**Challenge**: Requires pi core support for streaming tool calls

**Alternative**: Fast planner + eager execution

**Effort**: 7-10 days (requires architecture changes)

---

## 5. Implementation Challenges and Solutions

### Challenge 1: Task Decomposition Quality

**Problem**: LLM may generate poor DAGs (cycles, missing dependencies)

**Solutions**:
1. Schema validation for DAG output
2. Cycle detection algorithm
3. Human-in-the-loop review for complex tasks
4. Template-based DAGs for common patterns

### Challenge 2: Error Handling in DAG Execution

**Problem**: Task failure may block dependent tasks

**Solutions**:
1. Partial result propagation
2. Fallback values for failed tasks
3. Retry at DAG level (not just task level)
4. Alternative path selection

### Challenge 3: Context Management

**Problem**: Dependent tasks need results from predecessors

**Solutions**:
1. Context injection into task prompts
2. Result summarization for large outputs
3. Lazy context loading (only when needed)
4. Context size limits with truncation

### Challenge 4: Integration with Existing System

**Problem**: Current system assumes same task for all agents

**Solutions**:
1. New tool: `agent_team_run_dag` (doesn't replace existing tools)
2. Backward compatible: existing tools work unchanged
3. Gradual migration: start with new skill, then integrate

### Challenge 5: Dynamic Replanning Complexity

**Problem**: Replanning may cause infinite loops or thrashing

**Solutions**:
1. Maximum replanning rounds limit
2. Convergence detection (plan stability)
3. Cost awareness (don't replan too often)
4. User confirmation for major plan changes

---

## 6. Expected Benefits

### Latency Reduction
- **Current**: Sequential execution of independent tasks
- **With DAG**: Parallel execution where possible
- **Expected**: 2-3x speedup for tasks with independent subtasks

### Cost Optimization
- **Current**: All agents execute even if earlier results are sufficient
- **With DAG**: Early termination when results meet criteria
- **Expected**: 20-40% cost reduction for conditional workflows

### Quality Improvement
- **Current**: No dependency tracking, results may conflict
- **With DAG**: Structured execution ensures proper ordering
- **Expected**: Higher success rate for complex multi-step tasks

---

## 7. Recommended Implementation Path

### Phase 1: Foundation (Week 1-2)
1. Create `task-planner` skill with DAG generation
2. Add DAG validation utilities (cycle detection, schema)
3. Unit tests for planner

### Phase 2: Core Execution (Week 3-4)
1. Implement `dag-executor.ts` library
2. Integrate with existing `runWithConcurrencyLimit`
3. Add dependency resolution logic

### Phase 3: Team Integration (Week 5-6)
1. Add `agent_team_run_dag` tool
2. Support member-specific subtasks
3. Basic dynamic replanning (1 round)

### Phase 4: Polish (Week 7-8)
1. Enhanced error handling
2. Context management optimization
3. Documentation and examples

---

## 8. Conclusion

The current parallel execution system is well-architected for **independent** task execution but lacks the **dependency-aware planning** that LLMCompiler introduces. The highest-value integration would be:

1. **P0: Task Planner** - Enable DAG-based task decomposition
2. **P1: DAG Executor** - Execute with dependency resolution

These two components would provide the core LLMCompiler benefits without requiring major architectural changes to the existing system. The communication rounds in agent-teams already provide a form of iterative refinement, which could be enhanced with dynamic replanning as a follow-up improvement.

**Confidence**: 0.85
**Recommendation**: Proceed with P0/P1 implementation
