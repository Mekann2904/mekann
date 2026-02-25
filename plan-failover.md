# Distributed Lock Failover Test Plan

## CLAIM
Implement 7 failover test scenarios covering lock collision, expiry, crash recovery, and edge cases using isolated temp directories with controlled time simulation.

---

## 1. Test File Structure

```
.pi/lib/
├── cross-instance-coordinator.ts          (SUT - unchanged)
└── __tests__/
    ├── cross-instance-coordinator.test.ts (existing happy path tests)
    └── cross-instance-coordinator.failover.test.ts (NEW)
```

**Test file naming convention:**
- `*.failover.test.ts` - Failover-specific tests
- Isolated from existing tests to avoid interference

---

## 2. Test Scenarios

### 2.1 Lock Acquisition Collision

**Purpose:** Verify two instances cannot acquire same resource simultaneously

```
Given: Two coordinators (A, B) with separate lock directories
When: A acquires lock on resource R
      B attempts to acquire lock on R (within TTL)
Then: B's acquisition fails (returns null)
      A's lock remains valid
```

**Input:**
- Instance A: `tryAcquireLock("resource-1", 30000, 0)`
- Instance B: `tryAcquireLock("resource-1", 30000, 0)` (immediately after)

**Expected:**
- A: Returns `Lock { resource: "resource-1", lockId: "...", expiresAt: ... }`
- B: Returns `null`

**Verification:**
```typescript
const lockA = await coordinatorA.tryAcquireLock("resource-1", 30000, 0);
const lockB = await coordinatorB.tryAcquireLock("resource-1", 30000, 0);
expect(lockA).not.toBeNull();
expect(lockB).toBeNull();
expect(lockA.lockId).toBeDefined();
```

---

### 2.2 Lock Expiry and Non-Owner Cleanup

**Purpose:** Verify expired locks can be cleaned up by any instance

```
Given: Lock on resource R with TTL=100ms
When: Time advances past TTL (e.g., 150ms)
      Any instance calls cleanupExpiredLocks()
Then: Lock is removed
      Resource becomes available for acquisition
```

**Input:**
- Create lock with `ttlMs = 100`
- Advance mock time by 150ms
- Call `cleanupExpiredLocks()`

**Expected:**
- Lock file removed from filesystem
- New acquisition succeeds

**Verification:**
```typescript
const lock = await coordinator.tryAcquireLock("resource-1", 100, 0);
vi.advanceTimersByTime(150);
await coordinator.cleanupExpiredLocks();
const newLock = await coordinator.tryAcquireLock("resource-1", 30000, 0);
expect(newLock).not.toBeNull();
```

---

### 2.3 Process Crash Simulation

**Purpose:** Verify orphaned locks expire and release resources

```
Given: Instance A acquires lock on R
When: Instance A "crashes" (no release, no heartbeat)
      TTL expires
Then: Lock remains on disk (stale)
      cleanupExpiredLocks() removes it
      Instance B can acquire R
```

**Input:**
- A acquires lock, then "dies" (no release call)
- Time advances past TTL
- B calls `cleanupExpiredLocks()` then `tryAcquireLock()`

**Expected:**
- B successfully acquires lock after TTL

**Verification:**
```typescript
const lockA = await coordinatorA.tryAcquireLock("resource-1", 100, 0);
// Simulate crash: no releaseLock() call
vi.advanceTimersByTime(150);
await coordinatorB.cleanupExpiredLocks();
const lockB = await coordinatorB.tryAcquireLock("resource-1", 30000, 0);
expect(lockB).not.toBeNull();
```

---

### 2.4 Retry Mechanism with Backoff

**Purpose:** Verify exponential backoff retry behavior

```
Given: Resource R is locked by instance A
When: Instance B attempts acquisition with maxRetries=3
Then: B retries with backoff delays (10ms, 20ms, 40ms)
      Total time ~70ms before final failure
```

**Input:**
- A holds lock on R
- B: `tryAcquireLock("R", 30000, 3)`

**Expected:**
- B makes 4 attempts (1 initial + 3 retries)
- Each retry has exponential delay
- Returns null after all retries fail

**Verification:**
```typescript
await coordinatorA.tryAcquireLock("resource-1", 30000, 0);
const start = Date.now();
const lockB = await coordinatorB.tryAcquireLock("resource-1", 30000, 3);
const elapsed = Date.now() - start;
expect(lockB).toBeNull();
expect(elapsed).toBeGreaterThanOrEqual(70); // 10+20+40=70ms minimum
```

---

### 2.5 Release by Non-Owner

**Purpose:** Verify non-owner cannot release lock (silent failure)

```
Given: Instance A holds lock on R with lockId L1
When: Instance B attempts to release lock L1
Then: Release fails silently
      Lock remains on disk
      A can still release with L1
```

**Input:**
- A acquires lock, gets `lockA`
- B attempts `releaseLock(lockA)` with A's lock object

**Expected:**
- B's release returns (no error thrown)
- Lock file still exists
- A's subsequent release succeeds

**Verification:**
```typescript
const lockA = await coordinatorA.tryAcquireLock("resource-1", 30000, 0);
await coordinatorB.releaseLock(lockA); // Silent failure
// Verify lock still exists
const lockB = await coordinatorB.tryAcquireLock("resource-1", 30000, 0);
expect(lockB).toBeNull();
await coordinatorA.releaseLock(lockA); // A can still release
```

---

### 2.6 Corrupted Lock File Handling

**Purpose:** Verify corrupted lock files are handled gracefully

```
Given: Lock file exists with invalid JSON content
When: Any instance attempts to read/process lock
Then: Corrupted file is detected
      File is removed or ignored
      No uncaught exceptions
```

**Input:**
- Create file `{lockDir}/resource-1.lock` with content `"INVALID{JSON"`
- Call `cleanupExpiredLocks()` or `tryAcquireLock()`

**Expected:**
- No exception thrown
- Corrupted file removed during cleanup
- New acquisition succeeds

**Verification:**
```typescript
const lockPath = path.join(lockDir, "resource-1.lock");
fs.writeFileSync(lockPath, "INVALID{JSON");
await expect(coordinator.tryAcquireLock("resource-1", 30000, 0)).resolves.not.toThrow();
// Or verify cleanup removes corrupted file
await coordinator.cleanupExpiredLocks();
expect(fs.existsSync(lockPath)).toBe(false);
```

---

### 2.7 Concurrent Lock Acquisition Attempts

**Purpose:** Verify race condition handling with concurrent attempts

```
Given: Multiple instances attempt lock on same resource simultaneously
When: All call tryAcquireLock() at nearly same time
Then: Exactly one succeeds
      Others fail or get null
```

**Input:**
- 5 coordinators attempt `tryAcquireLock("resource-1", 30000, 0)` concurrently
- Use `Promise.all()` for simultaneity

**Expected:**
- Exactly 1 returns valid lock
- 4 return null

**Verification:**
```typescript
const coordinators = Array.from({ length: 5 }, () => createCoordinator());
const results = await Promise.all(
  coordinators.map(c => c.tryAcquireLock("resource-1", 30000, 0))
);
const successful = results.filter(r => r !== null);
expect(successful).toHaveLength(1);
```

---

## 3. Mock/Stub Strategy

### 3.1 Time Simulation (REQUIRED)

Use `vi.useFakeTimers()` for deterministic TTL tests:

```typescript
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test('lock expires after TTL', async () => {
  const lock = await coordinator.tryAcquireLock("r1", 100, 0);
  vi.advanceTimersByTime(150);
  // Now lock is expired
});
```

### 3.2 File System Isolation (REQUIRED)

Each test uses unique temp directory:

```typescript
let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-test-'));
  coordinator = new CrossInstanceCoordinator({ lockDir: tempDir });
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});
```

### 3.3 Clock Injection (RECOMMENDED)

For `Date.now()` dependent code:

```typescript
// If implementation allows injection
const coordinator = new CrossInstanceCoordinator({
  lockDir: tempDir,
  nowProvider: () => mockCurrentTime
});
```

### 3.4 NO Network Mocking

File-based locks don't require network mocking. Focus on:
- File system state
- Time progression
- Multi-instance coordination

---

## 4. Implementation Todo

### Phase 1: Setup
- [ ] Create `cross-instance-coordinator.failover.test.ts`
- [ ] Setup test utilities (temp dir creation, cleanup)
- [ ] Configure fake timers in beforeEach/afterEach

### Phase 2: Core Scenarios
- [ ] Implement 2.1 Lock Acquisition Collision
- [ ] Implement 2.2 Lock Expiry and Non-Owner Cleanup
- [ ] Implement 2.3 Process Crash Simulation

### Phase 3: Edge Cases
- [ ] Implement 2.4 Retry Mechanism with Backoff
- [ ] Implement 2.5 Release by Non-Owner
- [ ] Implement 2.6 Corrupted Lock File Handling

### Phase 4: Concurrency
- [ ] Implement 2.7 Concurrent Lock Acquisition Attempts
- [ ] Add stress test variant (10+ concurrent instances)

### Phase 5: Validation
- [ ] Run all tests with coverage
- [ ] Verify no test interdependencies
- [ ] Document any discovered edge cases

---

## 5. Test Helpers

```typescript
// Suggested helper functions

async function createCoordinatorWithTempDir(): Promise<{
  coordinator: CrossInstanceCoordinator;
  cleanup: () => void;
}> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-test-'));
  const coordinator = new CrossInstanceCoordinator({ lockDir: tempDir });
  return {
    coordinator,
    cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true })
  };
}

async function createLockedResource(
  coordinator: CrossInstanceCoordinator,
  resource: string,
  ttlMs: number = 30000
): Promise<Lock> {
  const lock = await coordinator.tryAcquireLock(resource, ttlMs, 0);
  if (!lock) throw new Error('Failed to acquire lock for setup');
  return lock;
}
```

---

## 6. Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Flaky timing tests | Use fake timers, never real delays |
| File system race conditions | Unique temp dirs per test |
| Test interdependencies | Full isolation, no shared state |
| Slow test suite | Parallel test execution (files are isolated) |

---

## CONFIDENCE
0.90

## ACTION
next - Implement test file with Phase 1-5 tasks
