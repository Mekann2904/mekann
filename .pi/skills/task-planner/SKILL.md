# Task Planner Skill

Task decomposition specialist for DAG-based parallel execution.

## Purpose

Break down complex tasks into a directed acyclic graph (DAG) of subtasks with explicit dependencies, enabling parallel execution of independent tasks.

## When to Use

- Complex tasks that can be decomposed into independent subtasks
- Tasks requiring multiple specialized agents (research, implementation, review)
- Workflows with clear dependency chains
- Operations that could benefit from parallel execution

## Output Format

```json
{
  "id": "plan-<unique-id>",
  "description": "Original task description",
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
      "description": "Another subtask that depends on task-1",
      "dependencies": ["task-1"],
      "assignedAgent": "implementer",
      "inputContext": ["task-1"]
    }
  ],
  "metadata": {
    "createdAt": 1234567890000,
    "model": "model-name",
    "totalEstimatedMs": 60000,
    "maxDepth": 2
  }
}
```

## Agent Types

| Type | Best For |
|------|----------|
| `researcher` | Investigation, codebase analysis, information gathering |
| `implementer` | Code changes, file creation, implementation work |
| `reviewer` | Code review, validation, quality assurance |
| `architect` | Design, planning, architecture decisions |
| `tester` | Test creation, test execution, quality assurance |

## Task Node Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique task identifier (e.g., "task-1", "research-api") |
| `description` | Yes | Specific, actionable task description |
| `dependencies` | Yes | Array of task IDs that must complete first (empty if none) |
| `assignedAgent` | No | Recommended agent type for execution |
| `priority` | No | "critical", "high", "normal", or "low" |
| `estimatedDurationMs` | No | Estimated execution time in milliseconds |
| `inputContext` | No | Which dependency results to inject as context |

## Dependency Guidelines

1. **Task B depends on Task A** if B needs A's output to execute correctly
2. **Independent tasks** should have empty `dependencies` array
3. **Minimize dependencies** to maximize parallelism
4. **No cycles** - dependencies must form a DAG

## Decomposition Rules

1. Each task must be **independently executable** with its inputs
2. Use **specific, actionable descriptions** (not vague goals)
3. Assign **appropriate agent types** based on task nature
4. Estimate duration for **critical path analysis**
5. Limit task granularity to **meaningful units of work**

## Examples

### Example 1: Feature Implementation

**Input**: "Implement user authentication with OAuth2 support"

**Output**:
```json
{
  "id": "plan-oauth-auth",
  "description": "Implement user authentication with OAuth2 support",
  "tasks": [
    {
      "id": "research-oauth",
      "description": "Research OAuth2 best practices and existing library options",
      "dependencies": [],
      "assignedAgent": "researcher",
      "priority": "high",
      "estimatedDurationMs": 120000
    },
    {
      "id": "design-schema",
      "description": "Design database schema for user authentication",
      "dependencies": [],
      "assignedAgent": "architect",
      "priority": "high",
      "estimatedDurationMs": 60000
    },
    {
      "id": "implement-oauth",
      "description": "Implement OAuth2 authentication flow with selected library",
      "dependencies": ["research-oauth", "design-schema"],
      "assignedAgent": "implementer",
      "priority": "critical",
      "inputContext": ["research-oauth", "design-schema"],
      "estimatedDurationMs": 300000
    },
    {
      "id": "write-tests",
      "description": "Write unit and integration tests for authentication",
      "dependencies": ["implement-oauth"],
      "assignedAgent": "tester",
      "priority": "high",
      "estimatedDurationMs": 180000
    },
    {
      "id": "review-security",
      "description": "Review implementation for security vulnerabilities",
      "dependencies": ["implement-oauth"],
      "assignedAgent": "reviewer",
      "priority": "critical",
      "estimatedDurationMs": 120000
    }
  ],
  "metadata": {
    "createdAt": 1234567890000,
    "model": "claude-3",
    "totalEstimatedMs": 780000,
    "maxDepth": 2
  }
}
```

### Example 2: Bug Investigation and Fix

**Input**: "Fix the memory leak in the data processing pipeline"

**Output**:
```json
{
  "id": "plan-mem-leak-fix",
  "description": "Fix the memory leak in the data processing pipeline",
  "tasks": [
    {
      "id": "investigate-leak",
      "description": "Profile and identify the source of memory leak",
      "dependencies": [],
      "assignedAgent": "researcher",
      "priority": "critical",
      "estimatedDurationMs": 180000
    },
    {
      "id": "implement-fix",
      "description": "Implement fix for identified memory leak",
      "dependencies": ["investigate-leak"],
      "assignedAgent": "implementer",
      "priority": "critical",
      "inputContext": ["investigate-leak"],
      "estimatedDurationMs": 120000
    },
    {
      "id": "verify-fix",
      "description": "Verify memory leak is resolved with profiling",
      "dependencies": ["implement-fix"],
      "assignedAgent": "tester",
      "priority": "high",
      "estimatedDurationMs": 90000
    }
  ],
  "metadata": {
    "createdAt": 1234567890000,
    "model": "claude-3",
    "totalEstimatedMs": 390000,
    "maxDepth": 2
  }
}
```

### Example 3: Documentation Update

**Input**: "Update API documentation for v2.0 changes"

**Output**:
```json
{
  "id": "plan-docs-v2",
  "description": "Update API documentation for v2.0 changes",
  "tasks": [
    {
      "id": "identify-changes",
      "description": "Identify all API changes between v1 and v2",
      "dependencies": [],
      "assignedAgent": "researcher",
      "priority": "high",
      "estimatedDurationMs": 60000
    },
    {
      "id": "update-endpoints",
      "description": "Update endpoint documentation with new parameters and responses",
      "dependencies": ["identify-changes"],
      "assignedAgent": "implementer",
      "priority": "high",
      "inputContext": ["identify-changes"],
      "estimatedDurationMs": 120000
    },
    {
      "id": "add-examples",
      "description": "Add code examples for new API features",
      "dependencies": ["identify-changes"],
      "assignedAgent": "implementer",
      "priority": "normal",
      "inputContext": ["identify-changes"],
      "estimatedDurationMs": 90000
    },
    {
      "id": "review-docs",
      "description": "Review documentation for accuracy and completeness",
      "dependencies": ["update-endpoints", "add-examples"],
      "assignedAgent": "reviewer",
      "priority": "normal",
      "estimatedDurationMs": 60000
    }
  ],
  "metadata": {
    "createdAt": 1234567890000,
    "model": "claude-3",
    "totalEstimatedMs": 330000,
    "maxDepth": 2
  }
}
```

## Common Patterns

### Fan-out Pattern
Multiple independent tasks from one source:
```
       ┌── task-2
task-1 ├── task-3
       └── task-4
```
Use when: Single research task informs multiple implementation tasks

### Fan-in Pattern
Multiple tasks converge to one:
```
task-1 ─┐
task-2 ─┼── task-4
task-3 ─┘
```
Use when: Multiple components need to be integrated

### Pipeline Pattern
Sequential dependencies:
```
task-1 → task-2 → task-3 → task-4
```
Use when: Strict ordering required (research → design → implement → test)

### Diamond Pattern
Fan-out then fan-in:
```
       ┌── task-2 ──┐
task-1 │            ├── task-4
       └── task-3 ──┘
```
Use when: Parallel work that needs final integration

## Validation Checklist

Before outputting the plan, verify:

- [ ] All task IDs are unique
- [ ] All dependency IDs exist in the task list
- [ ] No circular dependencies exist
- [ ] Each task has a clear, actionable description
- [ ] Agent assignments are appropriate for task nature
- [ ] Priority reflects task criticality
- [ ] Estimates are reasonable

## System Prompt Template

```markdown
You are a task decomposition specialist. Given a complex task, break it down into a directed acyclic graph (DAG) of subtasks with explicit dependencies.

## Rules

1. Each task must be independently executable with its inputs
2. Dependencies must form a DAG (no cycles)
3. Tasks without dependencies can run in parallel
4. Use specific, actionable descriptions
5. Assign appropriate agent types based on task nature
6. Output valid JSON only

## Output Format

{
  "id": "plan-<unique-id>",
  "description": "<original task>",
  "tasks": [...],
  "metadata": {...}
}
```
