# Implementation Plan: Multiple Pi Instance Conflict Fix

## Purpose
Fix race conditions when multiple pi instances operate on ul-workflow simultaneously by implementing file-based locking and instance ownership.

---

## Changes

### 1. Add ownerInstanceId to WorkflowState

**File:** `.pi/extensions/ul-workflow.ts`

```typescript
// Add import at top
import { withFileLock, atomicWriteTextFile } from "../lib/storage-lock";

// Update interface
interface WorkflowState {
  taskId: string;
  taskDescription: string;
  phase: WorkflowPhase;
  phases: WorkflowPhase[];
  phaseIndex: number;
  createdAt: string;
  updatedAt: string;
  approvedPhases: string[];
  annotationCount: number;
  ownerInstanceId: string;  // NEW: {sessionId}-{pid} format
}

// Add helper function
function getInstanceId(): string {
  // Match cross-instance coordinator format
  return `${process.env.PI_SESSION_ID || "default"}-${process.pid}`;
}

// Add constants
const ACTIVE_FILE = path.join(WORKFLOW_DIR, "active.json");

interface ActiveWorkflowRegistry {
  activeTaskId: string | null;
  ownerInstanceId: string | null;
  updatedAt: string;
}
```

### 2. Remove currentWorkflow Memory Variable

**File:** `.pi/extensions/ul-workflow.ts`

```typescript
// DELETE this line:
// let currentWorkflow: WorkflowState | null = null;

// REPLACE with file-based access:
function getCurrentWorkflow(): WorkflowState | null {
  const activePath = ACTIVE_FILE;
  try {
    const raw = readFileSync(activePath, "utf-8");
    const registry: ActiveWorkflowRegistry = JSON.parse(raw);
    if (!registry.activeTaskId) return null;
    return loadState(registry.activeTaskId);
  } catch {
    return null;
  }
}

function setCurrentWorkflow(state: WorkflowState | null): void {
  const activePath = ACTIVE_FILE;
  if (!fs.existsSync(WORKFLOW_DIR)) {
    fs.mkdirSync(WORKFLOW_DIR, { recursive: true });
  }
  
  const registry: ActiveWorkflowRegistry = state ? {
    activeTaskId: state.taskId,
    ownerInstanceId: state.ownerInstanceId,
    updatedAt: new Date().toISOString(),
  } : {
    activeTaskId: null,
    ownerInstanceId: null,
    updatedAt: new Date().toISOString(),
  };
  
  atomicWriteTextFile(activePath, JSON.stringify(registry, null, 2));
}
```

### 3. Add Ownership Check Helper

**File:** `.pi/extensions/ul-workflow.ts`

```typescript
function checkOwnership(state: WorkflowState | null): { owned: boolean; error?: string } {
  const instanceId = getInstanceId();
  if (!state) {
    return { owned: false, error: "no_active_workflow" };
  }
  if (state.ownerInstanceId !== instanceId) {
    return { 
      owned: false, 
      error: `workflow_owned_by_other: ${state.ownerInstanceId} (current: ${instanceId})` 
    };
  }
  return { owned: true };
}
```

### 4. Wrap saveState with File Lock

**File:** `.pi/extensions/ul-workflow.ts`

```typescript
function saveState(state: WorkflowState): void {
  const taskDir = getTaskDir(state.taskId);
  const statusPath = path.join(taskDir, "status.json");

  withFileLock(statusPath, () => {
    if (!fs.existsSync(taskDir)) {
      fs.mkdirSync(taskDir, { recursive: true });
    }
    atomicWriteTextFile(statusPath, JSON.stringify(state, null, 2));
  });
}
```

### 5. Update ul_workflow_start with Ownership

**File:** `.pi/extensions/ul-workflow.ts`

```typescript
// In ul_workflow_start execute:
const instanceId = getInstanceId();

// Check for existing active workflow (using file-based check)
const existingWorkflow = getCurrentWorkflow();
if (existingWorkflow && existingWorkflow.phase !== "completed" && existingWorkflow.phase !== "aborted") {
  const ownership = checkOwnership(existingWorkflow);
  if (!ownership.owned) {
    return makeResult(
      `エラー: 他のpiインスタンスがワークフローを実行中です。\n` +
      `所有者: ${existingWorkflow.ownerInstanceId}\n` +
      `Task ID: ${existingWorkflow.taskId}\n` +
      `現在のインスタンス: ${instanceId}`,
      { error: ownership.error }
    );
  }
}

currentWorkflow = {
  taskId,
  taskDescription: trimmedTask,
  phase: phases[0],
  phases,
  phaseIndex: 0,
  createdAt: now,
  updatedAt: now,
  approvedPhases: [],
  annotationCount: 0,
  ownerInstanceId: instanceId,  // NEW
};

createTaskFile(taskId, trimmedTask);
saveState(currentWorkflow);
setCurrentWorkflow(currentWorkflow);  // NEW: Update active registry
```

### 6. Update All Tool Handlers

**File:** `.pi/extensions/ul-workflow.ts`

Replace all `currentWorkflow` references with `getCurrentWorkflow()`:

```typescript
// Pattern: Replace direct variable access
// OLD: if (!currentWorkflow) { ... }
// NEW: const currentWorkflow = getCurrentWorkflow();
//      if (!currentWorkflow) { ... }

// Add ownership check after loading:
const currentWorkflow = getCurrentWorkflow();
if (!currentWorkflow) { ... }

const ownership = checkOwnership(currentWorkflow);
if (!ownership.owned) {
  return makeResult(`エラー: このワークフローは他のインスタンスが所有しています。`, { error: ownership.error });
}
```

### 7. Update ul_workflow_abort

**File:** `.pi/extensions/ul-workflow.ts`

```typescript
// In ul_workflow_abort execute:
const currentWorkflow = getCurrentWorkflow();
// ... existing validation ...

const taskId = currentWorkflow.taskId;
currentWorkflow.phase = "aborted";
currentWorkflow.updatedAt = new Date().toISOString();
saveState(currentWorkflow);
setCurrentWorkflow(null);  // Clear active registry

return makeResult(`ワークフローを中止しました。...`, { taskId, phase: "aborted" });
```

---

## Implementation Order

1. Add imports and interface updates (ownerInstanceId, ActiveWorkflowRegistry)
2. Add helper functions (getInstanceId, getCurrentWorkflow, setCurrentWorkflow, checkOwnership)
3. Wrap saveState with withFileLock
4. Update ul_workflow_start
5. Update ul_workflow_status
6. Update ul_workflow_approve
7. Update ul_workflow_annotate
8. Update ul_workflow_abort
9. Update ul_workflow_resume
10. Update ul_workflow_run
11. Update ul_workflow_confirm_plan
12. Update ul_workflow_execute_plan
13. Update ul_workflow_modify_plan
14. Update ul_workflow_research
15. Update ul_workflow_plan
16. Update ul_workflow_implement
17. Update slash command handlers

---

## Todo

- [x] Add imports: withFileLock, atomicWriteTextFile
- [x] Add ownerInstanceId to WorkflowState interface
- [x] Add ActiveWorkflowRegistry interface
- [x] Add getInstanceId() helper
- [x] Add getCurrentWorkflow() function
- [x] Add setCurrentWorkflow() function
- [x] Add checkOwnership() helper
- [x] Wrap saveState() with withFileLock
- [x] Update ul_workflow_start with ownership
- [x] Update ul_workflow_status with file-based load
- [x] Update ul_workflow_approve with ownership check
- [x] Update ul_workflow_annotate with ownership check
- [x] Update ul_workflow_abort to clear registry
- [x] Update ul_workflow_resume with ownership
- [x] Update ul_workflow_run with ownership
- [x] Update ul_workflow_confirm_plan with ownership
- [x] Update ul_workflow_execute_plan with ownership
- [x] Update ul_workflow_modify_plan with ownership
- [x] Update ul_workflow_research with ownership
- [x] Update ul_workflow_plan with ownership
- [x] Update ul_workflow_implement with ownership
- [x] Update slash commands with file-based access
- [ ] Test with multiple pi instances

---

## Considerations

- **Backward Compatibility**: Existing status.json files without ownerInstanceId should be handled gracefully
- **Stale Locks**: withFileLock handles stale locks via process death detection
- **Performance**: File-based access adds I/O overhead but ensures correctness
- **Error Messages**: Clear Japanese error messages for cross-instance conflicts
