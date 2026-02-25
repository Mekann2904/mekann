# Research Report: Agent Parallel Management System

## Overview

This document details the investigation of the parallel agent management code in this project, covering mechanisms, functionality, and all specifications with a focus on **safety properties** (what must be guaranteed).

---

## 1. Architecture Overview

The parallel management system consists of 5 core components:

| Component | File | Role |
|-----------|------|------|
| **Runtime Controller** | `.pi/extensions/agent-runtime.ts` | Central runtime state, capacity management, queue orchestration |
| **Concurrency Pool** | `.pi/lib/concurrency.ts` | Worker pool with parallelism limits |
| **Cross-Instance Coordinator** | `.pi/lib/cross-instance-coordinator.ts` | Multi-instance coordination via file-based locks |
| **Subagent Execution** | `.pi/extensions/subagents.ts` | Subagent lifecycle and parallel execution |
| **Team Orchestrator** | `.pi/extensions/agent-teams/team-orchestrator.ts` | Team-based parallel execution |

---

## 2. Parallelism Control Mechanisms

### 2.1 Runtime Capacity Limits (`agent-runtime.ts`)

The `AgentRuntimeLimits` interface defines all limits:

```typescript
interface AgentRuntimeLimits {
  maxTotalActiveLlm: number;           // Global LLM worker limit
  maxTotalActiveRequests: number;      // Global request limit
  maxParallelSubagentsPerRun: number;  // Per-run subagent parallelism
  maxParallelTeamsPerRun: number;      // Per-run team parallelism
  maxParallelTeammatesPerTeam: number; // Per-team member parallelism
  maxConcurrentOrchestrations: number; // Global orchestration limit
  capacityWaitMs: number;              // Max wait for capacity
  capacityPollMs: number;              // Polling interval
}
```

**Priority Sources:**
1. Environment variables (highest)
2. Cross-instance coordinator (dynamic)
3. Runtime config defaults (lowest)

### 2.2 Concurrency Pool (`concurrency.ts`)

```typescript
runWithConcurrencyLimit<TInput, TResult>(
  items: TInput[],
  limit: number,
  worker: (item, index, signal) => Promise<TResult>,
  options: ConcurrencyRunOptions
): Promise<TResult[]>
```

**Key Features:**
- **Normalized limit**: Always `1 <= limit <= itemCount`
- **AbortSignal propagation**: Child controllers with proper cleanup
- **Priority scheduling**: DynTaskMAS integration via `itemWeights`
- **Error isolation**: First error captured, workers continue to avoid dangling

### 2.3 Cross-Instance Coordination (`cross-instance-coordinator.ts`)

**Directory Structure:**
```
~/.pi/runtime/
├── instances/
│   ├── {sessionId}-{pid}.lock    # Per-instance lock files
│   └── ...
├── queue-states/
│   └── {instanceId}.json         # Queue state broadcasts
├── locks/
│   └── {resource}.lock           # Distributed locks
└── coordinator.json              # Global config
```

**Parallel Limit Distribution:**
```typescript
getMyParallelLimit(): number {
  const contendingCount = getContendingInstanceCount();
  return Math.max(1, Math.floor(totalMaxLlm / contendingCount));
}
```

---

## 3. Lock and Synchronization Mechanisms

### 3.1 Global Runtime State (`agent-runtime.ts`)

**State Location:** `globalThis.__PI_SHARED_AGENT_RUNTIME_STATE__`

**Initialization Pattern:**
```typescript
class GlobalRuntimeStateProvider {
  private initializationLock = false;
  private initializationPromise: Promise<void> | null = null;

  getState(): AgentRuntimeState {
    if (!this.globalScope.__PI_SHARED_AGENT_RUNTIME_STATE__) {
      if (this.initializationLock && this.initializationPromise) {
        throw new Error("Use getStateAsync() instead.");
      }
      this.initializationLock = true;
      // ... create state ...
    }
  }
}
```

**Safety Property:** Spin-wait removed, Promise-based initialization prevents race conditions.

### 3.2 Distributed Lock (`cross-instance-coordinator.ts`)

**Atomic Acquisition with O_EXCL:**
```typescript
function tryAcquireLock(resource: string, ttlMs: number, maxRetries: number) {
  // Atomic file creation with wx flag (O_EXCL)
  fd = openSync(lockFile, "wx");  // Atomic!
  
  // TOCTOU mitigation: exponential backoff on collision
  if (attempt < maxRetries) {
    const delayMs = Math.min(10 * Math.pow(2, attempt), 100);
    Atomics.wait(..., delayMs);  // Spin-wait mitigation
  }
}
```

**Lock Lifecycle:**
1. Try atomic create with `wx` flag
2. On `EEXIST`, check expiration
3. Clean expired locks atomically via `renameSync`
4. Retry with backoff

### 3.3 Reservation Lease Pattern

```typescript
interface RuntimeCapacityReservationLease {
  id: string;
  expiresAtMs: number;
  consume: () => void;      // Mark as consumed
  heartbeat: (ttlMs?) => void;  // Extend TTL
  release: () => void;      // Free capacity
}
```

**Safety Property:** Reservations auto-expire via periodic sweeper (default 5s).

---

## 4. Resource Management

### 4.1 Capacity Check Flow

```
┌──────────────────────┐
│ checkRuntimeCapacity │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────────┐
│ projectedRequests =      │
│   active + reserved + new│
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐     No    ┌─────────────┐
│ projectedRequests <= max?├──────────►│ BLOCKED     │
└──────────┬───────────────┘           │ + reasons[] │
           │ Yes                       └─────────────┘
           ▼
┌─────────────────────┐
│ ALLOWED             │
│ + reservation lease │
└─────────────────────┘
```

### 4.2 Priority Queue Management

**Entry Structure:**
```typescript
interface RuntimeQueueEntry extends PriorityTaskMetadata {
  queueClass: "interactive" | "standard" | "batch";
  priority: "critical" | "high" | "normal" | "low" | "background";
  tenantKey: string;
  skipCount: number;  // For starvation detection
}
```

**Eviction Policy (when queue exceeds limit):**
1. Lower queue class first (batch < standard < interactive)
2. Lower priority first (background < ... < critical)
3. Older entries first (LRU-like)

**Starvation Prevention:**
- After 20s wait: promote queue class
- After 60s wait: promote priority level

### 4.3 Adaptive Penalty Controller

```typescript
const adaptivePenalty = createAdaptivePenaltyController({
  isStable: STABLE_RUNTIME_PROFILE,
  maxPenalty: ADAPTIVE_PARALLEL_MAX_PENALTY,
  decayMs: ADAPTIVE_PARALLEL_DECAY_MS,
});

// On rate limit: raise penalty
adaptivePenalty.raise("rate_limit");

// On success: lower penalty
adaptivePenalty.lower();

// Apply to parallelism
const effectiveParallelism = adaptivePenalty.applyLimit(baselineParallelism);
```

---

## 5. Error Handling

### 5.1 Error Classification

```typescript
function classifyPressureError(error: string): 
  "rate_limit" | "capacity" | "timeout" | "other"
```

**Retry Policy by Error Type:**
| Error Type | Retry | Backoff |
|------------|-------|---------|
| rate_limit | Yes | Exponential + jitter |
| capacity | Yes | Poll with backoff |
| timeout | Yes | Limited retries |
| other | No | - |

### 5.2 Capacity Wait with Backoff

```typescript
function computeBackoffDelay(pollIntervalMs, attempts, remainingMs): number {
  const exponent = Math.min(6, attempts - 1);
  const rawDelay = pollIntervalMs * Math.pow(2, exponent);
  const jitter = random(-jitterRange, +jitterRange);
  return Math.max(1, Math.min(rawDelay + jitter, remainingMs));
}
```

**Max backoff factor:** 8x base interval
**Jitter ratio:** 20%

### 5.3 Failure Memory (Team Orchestrator)

```typescript
// Record failure for pattern detection
const failureRecord = memory.recordFailure(
  teamId, memberId, error, taskSignature, retryRound
);

// Skip retry if pattern detected
if (memory.shouldSkipRetry(taskSignature, errorType)) {
  // Don't retry - pattern indicates persistent failure
}
```

---

## 6. Cross-Instance Coordination

### 6.1 Instance Registration

```typescript
registerInstance(sessionId: string, cwd: string, configOverrides?): void
```

**Heartbeat Flow:**
```
┌─────────────────────┐
│ registerInstance()  │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────────────┐
│ Write ~/.pi/runtime/        │
│   instances/{id}.lock       │
└─────────┬───────────────────┘
          │
          ▼
┌─────────────────────────────┐
│ setInterval(heartbeat, 15s) │
│   - updateHeartbeat()       │
│   - cleanupDeadInstances()  │
└─────────────────────────────┘
```

### 6.2 Work Stealing Protocol

```typescript
async function safeStealWork(): Promise<StealableQueueEntry | null> {
  // 1. Check if stealing enabled
  if (process.env.PI_ENABLE_WORK_STEALING === "false") return null;
  
  // 2. Only steal if idle
  if (!isIdle()) return null;
  
  // 3. Find candidate with excess work
  const candidate = findStealCandidate();
  if (!candidate) return null;
  
  // 4. Acquire distributed lock
  const lock = tryAcquireLock(`steal:${candidate.instanceId}`);
  if (!lock) return null;  // Another instance stealing
  
  try {
    // 5. Steal highest priority task
    return stealWork();
  } finally {
    releaseLock(lock);
  }
}
```

### 6.3 Cluster-Wide Usage Aggregation

```typescript
function getClusterRuntimeUsage(): {
  totalActiveRequests: number;
  totalActiveLlm: number;
  instanceCount: number;
} {
  const instances = getActiveInstances();
  // Sum across all active instances
  return instances.reduce((acc, inst) => ({
    totalActiveRequests: acc.totalActiveRequests + inst.activeRequestCount,
    totalActiveLlm: acc.totalActiveLlm + inst.activeLlmCount,
  }), { totalActiveRequests: 0, totalActiveLlm: 0, instanceCount: instances.length });
}
```

---

## 7. Safety Properties (Critical Guarantees)

### 7.1 Capacity Safety

| Property | Mechanism |
|----------|-----------|
| **No over-commit** | `projectedRequests <= maxTotalActiveRequests` check before dispatch |
| **Reservation TTL** | Auto-expire after 45-60s (configurable) |
| **Sweeper cleanup** | Periodic removal of expired reservations (5s interval) |

### 7.2 Concurrency Safety

| Property | Mechanism |
|----------|-----------|
| **No dangling workers** | `runWithConcurrencyLimit` continues all workers after first error |
| **Abort propagation** | Child `AbortController` with proper cleanup in `finally` |
| **Queue bounded** | Max pending entries (default 1000), eviction on overflow |

### 7.3 Distributed Safety

| Property | Mechanism |
|----------|-----------|
| **Atomic lock acquisition** | `openSync(path, "wx")` with O_EXCL flag |
| **TOCTOU mitigation** | Exponential backoff + retry on collision |
| **Dead instance cleanup** | Heartbeat timeout (default 60s) + process liveness check |

### 7.4 Priority Queue Safety

| Property | Mechanism |
|----------|-----------|
| **Starvation prevention** | Auto-promote after 20s (class) / 60s (priority) |
| **Tenant fairness** | Max 2 consecutive dispatches per tenant |
| **Interactive priority** | `question` tool always gets highest class |

---

## 8. Key Invariants

1. **`limit >= 1`**: Concurrency limit always normalized to at least 1
2. **`activeAgents >= 0`**: Counter never goes negative (guarded with `Math.max(0, ...)`)
3. **`reservation.expiresAtMs > now`**: Only non-expired reservations counted
4. **Single sweeper**: Only one reservation sweeper timer per process
5. **Lock ownership**: Only lock owner can release (`lockId` match required)
6. **Limits consistency**: `limitsVersion` hash ensures env/config drift detected

---

## 9. Configuration Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PI_AGENT_MAX_TOTAL_LLM` | 12 | Global LLM worker limit |
| `PI_AGENT_MAX_TOTAL_REQUESTS` | 24 | Global request limit |
| `PI_AGENT_MAX_PARALLEL_SUBAGENTS` | 4 | Subagent parallelism |
| `PI_AGENT_MAX_PARALLEL_TEAMS` | 2 | Team parallelism |
| `PI_AGENT_MAX_PARALLEL_TEAMMATES` | 4 | Team member parallelism |
| `PI_AGENT_MAX_CONCURRENT_ORCHESTRATIONS` | 4 | Global orchestration limit |
| `PI_AGENT_CAPACITY_WAIT_MS` | 60000 | Max wait for capacity |
| `PI_AGENT_CAPACITY_POLL_MS` | 1000 | Polling interval |
| `PI_RUNTIME_DIR` | `~/.pi/runtime` | Coordinator directory |
| `PI_ENABLE_WORK_STEALING` | true | Enable work stealing |
| `PI_USE_SCHEDULER` | false | Use scheduler-based capacity |
| `PI_DEBUG_COORDINATOR` | - | Debug logging |

---

## 10. Summary

The parallel management system provides:

1. **Multi-level parallelism control**: Global → Instance → Run → Agent/Team → Member
2. **Robust synchronization**: File-based distributed locks with atomic acquisition
3. **Fair scheduling**: Priority queue with starvation prevention and tenant fairness
4. **Graceful degradation**: Adaptive penalty on rate limits, capacity-aware parallelism reduction
5. **Cross-instance coordination**: Heartbeat-based liveness, work stealing, cluster-wide usage tracking

**Key Safety Guarantee**: The system ensures that at any moment:
- `totalActiveLlm <= maxTotalActiveLlm`
- `totalActiveRequests <= maxTotalActiveRequests`
- `activeOrchestrations <= maxConcurrentOrchestrations`

All capacity checks are atomic (reservation-based), and all distributed operations use proper locking to prevent race conditions.
