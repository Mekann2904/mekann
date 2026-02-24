# Implementation Plan: LLMCompiler Integration

## Purpose

Integrate LLMCompiler concepts to enable **dependency-aware parallel task execution**:
- Decompose complex tasks into DAG-structured subtasks
- Execute independent subtasks in parallel
- Propagate results between dependent tasks
- Reduce latency 2-3x for tasks with independent subtasks

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                      Extension Layer                            │
│  subagent_run_dag / agent_team_run_dag                         │
└───────────────────────────┬────────────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────────────┐
│                     Skill Layer                                 │
│  .pi/skills/task-planner/SKILL.md                              │
│  - LLM-based task decomposition                                │
│  - DAG generation from natural language                        │
└───────────────────────────┬────────────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────────────┐
│                    Library Layer                                │
│  .pi/lib/dag-executor.ts                                       │
│  - Extends existing TaskDependencyGraph                        │
│  - Integrates with runWithConcurrencyLimit                     │
│  - Context propagation between tasks                           │
└─────────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────────────┐
│                    Runtime Layer                                │
│  .pi/lib/concurrency.ts (existing)                             │
│  .pi/lib/task-dependencies.ts (existing)                       │
└─────────────────────────────────────────────────────────────────┘
```

## Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `.pi/skills/task-planner/SKILL.md` | New | Task decomposition skill |
| `.pi/lib/dag-executor.ts` | New | DAG execution engine |
| `.pi/lib/task-dependencies.ts` | Extend | Add context/result storage |
| `.pi/extensions/subagents.ts` | Extend | Add `subagent_run_dag` tool |

---

## Detailed Design

### P0: Task Planner Skill

**Location:** `.pi/skills/task-planner/SKILL.md`

#### Interface Definitions

```typescript
// .pi/lib/dag-types.ts (new file)

/**
 * Task node in the DAG
 */
interface TaskNode {
  id: string;
  description: string;
  assignedAgent?: string;      // "researcher" | "implementer" | etc.
  dependencies: string[];      // IDs of prerequisite tasks
  priority?: "critical" | "high" | "normal" | "low";
  estimatedDurationMs?: number;
  inputContext?: string[];     // Which task results to inject
}

/**
 * Complete task plan (DAG)
 */
interface TaskPlan {
  id: string;                  // Plan identifier
  description: string;         // Original task description
  tasks: TaskNode[];
  metadata: {
    createdAt: number;
    model: string;
    totalEstimatedMs: number;
    maxDepth: number;
  };
}

/**
 * Result of task execution
 */
interface TaskResult<T = unknown> {
  taskId: string;
  status: "completed" | "failed" | "skipped";
  output?: T;
  error?: Error;
  durationMs: number;
}

/**
 * DAG execution result
 */
interface DagResult<T = unknown> {
  planId: string;
  taskResults: Map<string, TaskResult<T>>;
  overallStatus: "completed" | "partial" | "failed";
  totalDurationMs: number;
  completedTaskIds: string[];
  failedTaskIds: string[];
  skippedTaskIds: string[];
}
```

#### Prompt Design

```markdown
# Task Planner System Prompt

You are a task decomposition specialist. Given a complex task, you break it down
into a directed acyclic graph (DAG) of subtasks with explicit dependencies.

## Output Format (JSON)

{
  "tasks": [
    {
      "id": "task-1",
      "description": "Specific subtask description",
      "dependencies": [],
      "assignedAgent": "researcher",
      "priority": "high"
    },
    {
      "id": "task-2",
      "description": "Another subtask",
      "dependencies": ["task-1"],
      "assignedAgent": "implementer",
      "inputContext": ["task-1"]
    }
  ]
}

## Rules

1. Each task must be independently executable with its inputs
2. Dependencies must form a DAG (no cycles)
3. Tasks without dependencies can run in parallel
4. Use specific, actionable descriptions
5. Assign appropriate agent types based on task nature

## Agent Types

| Type | Best For |
|------|----------|
| researcher | Investigation, codebase analysis |
| implementer | Code changes, file creation |
| reviewer | Code review, validation |
| architect | Design, planning |

## Dependency Guidelines

- Task B depends on Task A if B needs A's output
- Independent tasks should have empty dependencies array
- Minimize dependencies to maximize parallelism
```

#### Validation Logic

```typescript
// .pi/lib/dag-validator.ts

import { TaskPlan, TaskNode } from "./dag-types";
import { TaskDependencyGraph } from "./task-dependencies";

/**
 * Validation result
 */
interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a task plan
 */
export function validateTaskPlan(plan: TaskPlan): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Check for duplicate IDs
  const ids = new Set<string>();
  for (const task of plan.tasks) {
    if (ids.has(task.id)) {
      errors.push(`Duplicate task ID: ${task.id}`);
    }
    ids.add(task.id);
  }

  // 2. Check for missing dependencies
  for (const task of plan.tasks) {
    for (const depId of task.dependencies) {
      if (!ids.has(depId)) {
        errors.push(`Task "${task.id}" depends on non-existent task "${depId}"`);
      }
    }
  }

  // 3. Check for cycles using existing TaskDependencyGraph
  const graph = new TaskDependencyGraph();

  // Add tasks in dependency order
  const added = new Set<string>();
  const pending = [...plan.tasks];

  while (pending.length > 0) {
    let addedAny = false;

    for (let i = pending.length - 1; i >= 0; i--) {
      const task = pending[i];
      if (task.dependencies.every((d) => added.has(d))) {
        graph.addTask(task.id, {
          name: task.description,
          dependencies: task.dependencies,
          priority: task.priority,
        });
        added.add(task.id);
        pending.splice(i, 1);
        addedAny = true;
      }
    }

    if (!addedAny && pending.length > 0) {
      const cycleResult = graph.detectCycle();
      if (cycleResult.hasCycle) {
        errors.push(`Cycle detected in task graph: ${cycleResult.cyclePath?.join(" -> ")}`);
      } else {
        errors.push(`Unable to add tasks due to missing dependencies`);
      }
      break;
    }
  }

  // 4. Warnings for potential issues
  if (plan.tasks.length === 0) {
    warnings.push("Task plan is empty");
  }

  if (plan.tasks.every((t) => t.dependencies.length > 0)) {
    warnings.push("All tasks have dependencies - no parallelism possible");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
```

---

### P1: DAG Executor Library

**Location:** `.pi/lib/dag-executor.ts`

#### Data Structure

```typescript
// .pi/lib/dag-executor.ts

import { TaskDependencyGraph, TaskDependencyNode } from "./task-dependencies";
import { runWithConcurrencyLimit, ConcurrencyRunOptions } from "./concurrency";
import { TaskPlan, TaskNode, TaskResult, DagResult } from "./dag-types";
import { createChildAbortController } from "./abort-utils";

/**
 * Executor options
 */
export interface DagExecutorOptions {
  signal?: AbortSignal;
  maxConcurrency?: number;
  abortOnFirstError?: boolean;
  contextInjector?: (task: TaskNode, results: Map<string, TaskResult>) => string;
  onTaskStart?: (taskId: string) => void;
  onTaskComplete?: (taskId: string, result: TaskResult) => void;
  onTaskError?: (taskId: string, error: Error) => void;
}

/**
 * Task executor function type
 */
export type TaskExecutor<T = unknown> = (
  task: TaskNode,
  context: string,
  signal?: AbortSignal
) => Promise<T>;

/**
 * DAG Executor - executes tasks with dependency resolution
 */
export class DagExecutor<T = unknown> {
  private graph: TaskDependencyGraph;
  private taskNodes: Map<string, TaskNode>;
  private results: Map<string, TaskResult<T>>;
  private plan: TaskPlan;
  private options: DagExecutorOptions;
  private startTime: number = 0;

  constructor(plan: TaskPlan, options: DagExecutorOptions = {}) {
    this.graph = new TaskDependencyGraph();
    this.taskNodes = new Map();
    this.results = new Map();
    this.plan = plan;
    this.options = {
      maxConcurrency: 4,
      abortOnFirstError: false,
      ...options,
    };

    this.initializeGraph();
  }

  /**
   * Initialize the dependency graph from plan
   */
  private initializeGraph(): void {
    const added = new Set<string>();
    const pending = [...this.plan.tasks];

    // Add tasks in dependency order
    while (pending.length > 0) {
      let addedAny = false;

      for (let i = pending.length - 1; i >= 0; i--) {
        const task = pending[i];
        if (task.dependencies.every((d) => added.has(d))) {
          this.graph.addTask(task.id, {
            name: task.description,
            dependencies: task.dependencies,
            priority: task.priority,
            estimatedDurationMs: task.estimatedDurationMs,
          });
          this.taskNodes.set(task.id, task);
          added.add(task.id);
          pending.splice(i, 1);
          addedAny = true;
        }
      }

      if (!addedAny && pending.length > 0) {
        throw new Error(`Cannot initialize graph: cycle or missing dependencies`);
      }
    }
  }

  /**
   * Execute the DAG
   */
  async execute(executor: TaskExecutor<T>): Promise<DagResult<T>> {
    this.startTime = Date.now();
    const { controller, cleanup } = createChildAbortController(this.options.signal);

    try {
      // Get initially ready tasks
      let readyTasks = this.graph.getReadyTasks();

      while (readyTasks.length > 0) {
        // Check for abort
        if (controller.signal.aborted) {
          break;
        }

        // Execute ready tasks in parallel
        await this.executeBatch(readyTasks, executor, controller.signal);

        // Get next batch of ready tasks
        readyTasks = this.graph.getReadyTasks();
      }

      return this.buildResult();
    } finally {
      cleanup();
    }
  }

  /**
   * Execute a batch of ready tasks
   */
  private async executeBatch(
    tasks: TaskDependencyNode[],
    executor: TaskExecutor<T>,
    signal?: AbortSignal
  ): Promise<void> {
    const taskItems = tasks.map((node) => {
      const taskNode = this.taskNodes.get(node.id)!;
      const context = this.buildContext(taskNode);

      // Mark as running
      this.graph.markRunning(node.id);
      this.options.onTaskStart?.(node.id);

      return { node, taskNode, context };
    });

    // Use existing runWithConcurrencyLimit
    const batchResults = await runWithConcurrencyLimit(
      taskItems,
      this.options.maxConcurrency!,
      async (item, index, signal) => {
        const startMs = Date.now();

        try {
          const output = await executor(item.taskNode, item.context, signal);
          const durationMs = Date.now() - startMs;

          return {
            taskId: item.node.id,
            status: "completed" as const,
            output,
            durationMs,
          };
        } catch (error) {
          const durationMs = Date.now() - startMs;
          return {
            taskId: item.node.id,
            status: "failed" as const,
            error: error instanceof Error ? error : new Error(String(error)),
            durationMs,
          };
        }
      },
      { signal, abortOnError: false }
    );

    // Process results
    for (const result of batchResults) {
      this.results.set(result.taskId, result);

      if (result.status === "completed") {
        this.graph.markCompleted(result.taskId);
        this.options.onTaskComplete?.(result.taskId, result);
      } else {
        this.graph.markFailed(result.taskId, result.error);
        this.options.onTaskError?.(result.taskId, result.error!);

        if (this.options.abortOnFirstError) {
          throw result.error;
        }
      }
    }
  }

  /**
   * Build context string from dependency results
   */
  private buildContext(task: TaskNode): string {
    const contexts: string[] = [];

    for (const depId of task.dependencies) {
      const result = this.results.get(depId);
      if (result?.status === "completed" && result.output) {
        contexts.push(`## Result from ${depId}\n${JSON.stringify(result.output, null, 2)}`);
      }
    }

    return contexts.join("\n\n");
  }

  /**
   * Build final result
   */
  private buildResult(): DagResult<T> {
    const completedTaskIds: string[] = [];
    const failedTaskIds: string[] = [];
    const skippedTaskIds: string[] = [];

    for (const [id, result] of this.results) {
      if (result.status === "completed") {
        completedTaskIds.push(id);
      } else if (result.status === "failed") {
        failedTaskIds.push(id);
      } else {
        skippedTaskIds.push(id);
      }
    }

    // Add skipped tasks (dependencies of failed tasks)
    for (const task of this.plan.tasks) {
      if (!this.results.has(task.id)) {
        skippedTaskIds.push(task.id);
      }
    }

    const overallStatus =
      failedTaskIds.length === 0
        ? "completed"
        : completedTaskIds.length > 0
          ? "partial"
          : "failed";

    return {
      planId: this.plan.id,
      taskResults: this.results,
      overallStatus,
      totalDurationMs: Date.now() - this.startTime,
      completedTaskIds,
      failedTaskIds,
      skippedTaskIds,
    };
  }
}

/**
 * Convenience function for one-shot execution
 */
export async function executeDag<T = unknown>(
  plan: TaskPlan,
  executor: TaskExecutor<T>,
  options: DagExecutorOptions = {}
): Promise<DagResult<T>> {
  const dagExecutor = new DagExecutor<T>(plan, options);
  return dagExecutor.execute(executor);
}
```

#### Integration with Existing Systems

```typescript
// Example: Integration with subagent system

import { executeDag } from "./dag-executor";
import { TaskPlan } from "./dag-types";

interface SubagentDagOptions {
  plan: TaskPlan;
  subagentConfig: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
}

async function executeSubagentDag(options: SubagentDagOptions): Promise<DagResult> {
  return executeDag(options.plan, async (task, context, signal) => {
    // Build prompt with context from dependencies
    const prompt = `
${task.description}

## Context from Previous Tasks
${context || "No previous context available."}
`;

    // Call subagent_run (would use actual tool in extension)
    const result = await runSubagentTask({
      agentId: task.assignedAgent || "implementer",
      task: prompt,
      signal,
      ...options.subagentConfig,
    });

    return result;
  }, {
    maxConcurrency: 3,
    abortOnFirstError: false,
  });
}
```

---

## Implementation Steps

### Phase 1: Foundation (P0 - Task Planner)

1. **Create type definitions**
   - [ ] Create `.pi/lib/dag-types.ts` with interfaces
   - [ ] Export types from `.pi/lib/index.ts`

2. **Create validator**
   - [ ] Create `.pi/lib/dag-validator.ts`
   - [ ] Implement cycle detection using existing `TaskDependencyGraph`
   - [ ] Add unit tests

3. **Create task-planner skill**
   - [ ] Create `.pi/skills/task-planner/SKILL.md`
   - [ ] Define prompt template for task decomposition
   - [ ] Add examples for common patterns

### Phase 2: Core Execution (P1 - DAG Executor)

1. **Create DAG executor**
   - [ ] Create `.pi/lib/dag-executor.ts`
   - [ ] Implement `DagExecutor` class
   - [ ] Integrate with `runWithConcurrencyLimit`
   - [ ] Add context propagation

2. **Add unit tests**
   - [ ] Test parallel execution
   - [ ] Test dependency resolution
   - [ ] Test error handling
   - [ ] Test cycle detection

### Phase 3: Extension Integration

1. **Add subagent_run_dag tool**
   - [ ] Extend `.pi/extensions/subagents.ts`
   - [ ] Add new tool definition
   - [ ] Integrate with task planner skill

2. **Add integration tests**
   - [ ] End-to-end DAG execution
   - [ ] Error recovery scenarios

---

## Error Handling

### Cycle Detection

```typescript
// Handled by TaskDependencyGraph.detectCycle()
// Called during validation and graph initialization

const cycleResult = graph.detectCycle();
if (cycleResult.hasCycle) {
  throw new DagExecutionError(
    `Cycle detected: ${cycleResult.cyclePath?.join(" -> ")}`,
    "CYCLE_DETECTED"
  );
}
```

### Partial Failure Handling

```typescript
// Strategies for handling partial failures

interface FailureHandlingOptions {
  strategy: "abort" | "continue" | "retry";
  maxRetries?: number;
  fallbackValue?: unknown;
}

// In executor:
if (result.status === "failed") {
  if (options.failureHandling.strategy === "abort") {
    throw result.error;
  }
  // Continue: mark failed, let dependents be skipped
  this.graph.markFailed(result.taskId, result.error);
}
```

### Error Types

```typescript
// .pi/lib/dag-errors.ts

class DagExecutionError extends Error {
  constructor(
    message: string,
    public code: "CYCLE_DETECTED" | "VALIDATION_FAILED" | "TASK_FAILED" | "ABORTED"
  ) {
    super(message);
    this.name = "DagExecutionError";
  }
}

class TaskValidationError extends Error {
  constructor(
    public taskId: string,
    public reason: string
  ) {
    super(`Task "${taskId}" validation failed: ${reason}`);
    this.name = "TaskValidationError";
  }
}
```

---

## Considerations

### Context Size Management

- Large task outputs may exceed context limits
- Implement result summarization for context injection
- Add `maxContextSize` option with truncation

### Dynamic Replanning (Future)

- Current design: static DAG
- Future: add `replan` callback after task completion
- Could add new tasks or modify dependencies

### Performance

- Benchmark with 10, 50, 100 task DAGs
- Measure overhead of graph operations
- Consider memoization for context building

### Backward Compatibility

- All new code in separate files
- Existing tools (`subagent_run`, `subagent_run_parallel`) unchanged
- `subagent_run_dag` is opt-in

---

## Todo

### P0: Task Planner Skill
- [ ] Create `.pi/lib/dag-types.ts`
- [ ] Create `.pi/lib/dag-validator.ts`
- [ ] Create `.pi/skills/task-planner/SKILL.md`
- [ ] Add unit tests for validator

### P1: DAG Executor Library
- [ ] Create `.pi/lib/dag-executor.ts`
- [ ] Create `.pi/lib/dag-errors.ts`
- [ ] Integrate with `runWithConcurrencyLimit`
- [ ] Add unit tests for executor

### P2: Extension Integration
- [ ] Add `subagent_run_dag` to `.pi/extensions/subagents.ts`
- [ ] Add integration tests
- [ ] Update documentation

### P3: RepoGraph Integration (COMPLETED)
- [x] Add web-tree-sitter dependency
- [x] Create tree-sitter loader module
- [x] Create AST parser with def/ref extraction
- [x] Add standard library filtering
- [x] Define RepoGraph types
- [x] Implement graph builder
- [x] Implement index persistence
- [x] Implement k-hop egograph extraction
- [x] Register repograph_index tool
- [x] Register repograph_query tool
- [x] Register repograph_localize tool
- [x] Create repograph-localization skill
- [x] Add repograph-localization to agent teams
- [x] Add subagent/agent_team hooks for auto-context
- [ ] Write integration tests

---

## Estimated Effort

| Phase | Tasks | Est. Time |
|-------|-------|-----------|
| P0 | Task Planner | 1-2 days |
| P1 | DAG Executor | 2-3 days |
| P2 | Integration | 1-2 days |
| **Total** | | **4-7 days** |

## Success Criteria

1. **Functionality**: Can decompose a task and execute subtasks in parallel with dependency resolution
2. **Performance**: 2x+ speedup for tasks with independent subtasks
3. **Reliability**: Proper error handling, no silent failures
4. **Usability**: Clear error messages for invalid DAGs
